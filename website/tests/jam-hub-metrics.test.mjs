import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubMetricsService as createMetrics, hubMetricsResponse as metricsResponse} from '../lib/hub-metrics.mjs';
import {REGISTRY_URL} from '../lib/sharing-catalog.mjs';

const request = (kind = 'game', ids = 'drawing-pad') =>
  new Request(`https://zero.codepet.ca/api/hub/metrics?kind=${kind}&ids=${ids}`);
const decision = (held = []) => ({revision:'a'.repeat(40), observedAt:0, isHeld:id => held.includes(id)});
const game = id => ({id, kind:'game', repositoryId:id === 'drawing-pad' ? '11' : '12', ownerId:'7',
  repositoryUrl:`https://github.com/student/${id}`, playUrl:`https://student.github.io/${id}/`});
const destinationReader = async url => {
  const repo = url.split('/').at(-1);
  return {repositoryId:repo === 'drawing-pad' ? '11' : '12', ownerId:'7', owner:'student', repo, repositoryUrl:url};
};
const createHubMetricsService = options => createMetrics({destinationReader, ...options});
const hubMetricsResponse = (request, options) => metricsResponse(request, {destinationReader, ...options});

test('every HTTP request reads authority before a warm batch and new holds prevent store reads', async () => {
  let visibility = null, authorityReads = 0, storeReads = 0, resolverReads = 0;
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => {resolverReads++; return game(id);},
    store:{counts:async ids => {storeReads++; return Object.fromEntries(ids.map(id => [id, 7]));}}});
  const options = {service, env:{}, visibilityReader:async () => {
    authorityReads++; if (visibility instanceof Error) throw visibility; return visibility;
  }};
  for (let i = 0; i < 2; i++) {
    const response = await hubMetricsResponse(request(), options);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).items, [{id:'drawing-pad', kind:'game', opens:7}]);
  }
  assert.equal(authorityReads, 4); assert.equal(storeReads, 1); assert.equal(resolverReads, 1);
  visibility = Error('private authority failure');
  const unavailable = await hubMetricsResponse(request(), options);
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailable.json(), {error:'Counts unavailable.'});
  assert.equal(storeReads, 1); assert.equal(resolverReads, 1);
  visibility = decision(['11']);
  const held = await hubMetricsResponse(request(), options);
  assert.equal(held.status, 200); assert.deepEqual(await held.json(), {schema:1, items:[]});
  assert.equal(authorityReads, 7); assert.equal(storeReads, 1); assert.equal(resolverReads, 2);
});

test('one request shares its explicit decision, environment and signal across all resolvers', async () => {
  const env = {}, visibility = decision(['11']); let reads = 0;
  const req = request('game', 'drawing-pad,other-game');
  const service = createHubMetricsService({store:{counts:async ids => {
    assert.deepEqual(ids, ['other-game']); return {'other-game':4};
  }}, visibilityReader:async () => assert.fail('must reuse HTTP decision'), resolve:async ({id}, options) => {
    assert.equal(options.visibility, visibility); assert.equal(options.env, env); assert.ok(options.signal instanceof AbortSignal); assert.equal(options.signal.aborted, false);
    return game(id);
  }});
  const response = await hubMetricsResponse(req, {service, env, visibilityReader:async options => {
    reads++; assert.equal(options.env, env); assert.ok(options.signal instanceof AbortSignal); assert.equal(options.signal.aborted, false); return visibility;
  }});
  assert.equal(reads, 4);
  assert.deepEqual((await response.json()).items, [{id:'other-game', kind:'game', opens:4}]);
});

test('active decisions recompute both previously warm and successive active metric batches', async () => {
  let value = 1, reads = 0, visibility = null;
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => game(id),
    visibilityReader:async () => {reads++; return visibility;}, store:{counts:async () => ({'drawing-pad':value})}});
  assert.equal((await service.metrics('game', ['drawing-pad']))[0].opens, 1);
  visibility = decision(); value = 2;
  assert.equal((await service.metrics('game', ['drawing-pad']))[0].opens, 2);
  value = 3;
  assert.equal((await service.metrics('game', ['drawing-pad']))[0].opens, 3);
  assert.equal(reads, 10);
});

test('active mode suppresses adoption and coverage even when the inactive ledger projection is warm', async () => {
  const env = {ZERO_SHARING_REGISTRY_URL:REGISTRY_URL}; let reads = 0, visibility = null;
  const library = {id:'lib-r22-helper', kind:'library',repositoryId:'22',ownerId:'7',repositoryUrl:'https://github.com/student/library'};
  const state = {schema:1, sequence:1, availability:[], releases:{
    'library/lib-r22-helper/0.1.0':{delivery:'ready', release:{kind:'library', id:library.id, version:'0.1.0', repository:{id:'22'}}},
    'game/game-r11-game/0.1.0':{delivery:'ready', release:{kind:'game', id:'game-r11-game', version:'0.1.0', repository:{id:'11'}},
      adoption:{schema:1, libraries:[{id:library.id, version:'0.1.0'}]}},
  }};
  const service = createHubMetricsService({env, resolve:async () => library, store:null,
    registryReader:async () => {reads++; return state;}});
  const options = {service, env, visibilityReader:async () => visibility,destinationReader:async()=>({repositoryId:'22',ownerId:'7',owner:'student',repo:'library',repositoryUrl:library.repositoryUrl})};
  const first = await hubMetricsResponse(request('library', library.id), options);
  assert.deepEqual((await first.json()).items, [{id:library.id,kind:'library', projects:1, observedProjects:1, totalProjects:1}]);
  visibility = decision(['11']);
  const held = await hubMetricsResponse(request('library', library.id), options);
  assert.equal(held.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await held.json()).items, [{id:library.id,kind:'library', projects:null, observedProjects:null, totalProjects:null}]);
  assert.equal(reads, 1);
});

test('authority failures fail closed before cached game or library counts and hide private errors', async () => {
  for (const kind of ['game', 'library']) {
    let work = 0;
    const service = {metricsSelection:async () => {work++; return {targets:[], items:[]};}};
    for (const visibilityReader of [async () => {throw Error('private snapshot details');}, async () => undefined,
      async () => ({revision:'bad', isHeld:() => false})]) {
      const response = await hubMetricsResponse(request(kind), {service, env:{}, visibilityReader});
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
    }
    assert.equal(work, 0);
  }
});

test('active games without validated repository identity never reach the counts store', async () => {
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => ({id, kind:'game', playUrl:'https://student.github.io/game/'}),
    visibilityReader:async () => decision(), store:{counts:async () => assert.fail('unverified identity')}});
  assert.deepEqual(await service.metrics('game', ['drawing-pad']), []);
  await assert.rejects(service.metrics('game', ['drawing-pad'], {visibility:undefined}));
});

test('malformed held decisions return only the generic unavailable response before store work', async () => {
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => game(id),
    store:{counts:async () => assert.fail('malformed decision must not query counts')}});
  const response = await hubMetricsResponse(request(), {service, env:{},
    visibilityReader:async () => ({revision:'b'.repeat(40), observedAt:0, isHeld:() => undefined})});
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('a hold accepted during stalled counts filters by original resolved identity, then reveal restores counts', async () => {
  let current = decision(), reads = 0;
  const counts = deferred(), started = deferred();
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => game(id), store:{counts:async () => {
    started.resolve(); return counts.promise;
  }}});
  const options = {service, env:{}, visibilityReader:async () => {reads++; return current;}};
  const pending = hubMetricsResponse(request('game', 'drawing-pad,other-game'), options);
  await started.promise;
  current = decision(['11']); counts.resolve({'drawing-pad':7, 'other-game':8});
  assert.deepEqual(await (await pending).json(), {schema:1, items:[{id:'other-game', kind:'game', opens:8}]});
  assert.equal(reads, 4);
  current = decision();
  assert.deepEqual((await (await hubMetricsResponse(request(), options)).json()).items,
    [{id:'drawing-pad', kind:'game', opens:7}]);
});

test('a hold accepted during stalled trusted catalog resolution is checked after metric work', async () => {
  let current = null, counts = 0;
  const catalog = deferred(), started = deferred();
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => {
    started.resolve(); await catalog.promise; return game(id);
  }, store:{counts:async () => {counts++; return {'drawing-pad':4};}}});
  const pending = hubMetricsResponse(request(), {service, env:{}, visibilityReader:async () => current});
  await started.promise; current = decision(['11']); catalog.resolve();
  assert.deepEqual(await (await pending).json(), {schema:1, items:[]});
  assert.equal(counts, 1);
});

test('fresh authority failure after stalled counts fails closed for HTTP and standalone services', async () => {
  for (const direct of [false, true]) {
    let reads = 0;
    const count = deferred(), started = deferred();
    const visibilityReader = async () => {
      if (++reads > 1) throw Error('private authority error');
      return decision();
    };
    const service = createHubMetricsService({env:{}, visibilityReader, resolve:async ({id}) => game(id),
      store:{counts:async () => {started.resolve(); return count.promise;}}});
    const pending = direct ? service.metrics('game', ['drawing-pad']) : hubMetricsResponse(request(), {service, env:{}, visibilityReader});
    await started.promise; count.resolve({'drawing-pad':6});
    if (direct) await assert.rejects(pending, /private authority error/);
    else {
      const response = await pending;
      assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
    }
  }
});

test('a newly active hold suppresses adoption resolved during an inactive ledger read', async () => {
  const ledger = deferred(), started = deferred(); let current = null;
  const id = 'lib-r22-helper';
  const service = createHubMetricsService({env:{ZERO_SHARING_REGISTRY_URL:REGISTRY_URL},
    resolve:async () => ({id, kind:'library'}), store:null, registryReader:async () => {
      started.resolve(); return ledger.promise;
    }});
  const pending = hubMetricsResponse(request('library', id), {service, env:{ZERO_SHARING_REGISTRY_URL:REGISTRY_URL},
    visibilityReader:async () => current});
  await started.promise; current = decision(['11']);
  ledger.resolve({schema:1, sequence:1, availability:[], releases:{}});
  assert.deepEqual(await (await pending).json(), {schema:1, items:[]});
});

test('metric output cannot replace trusted target identity or introduce unrequested or wrong-kind items', async () => {
  const service = {metricsSelection:async () => ({targets:[game('drawing-pad'), game('other-game'),
    {id:'unverified', kind:'game', repositoryId:'not-numeric'}], items:[
    {id:'drawing-pad', kind:'game', repositoryId:'999', opens:7},
    {id:'other-game', kind:'game', repositoryId:'11', opens:8},
    {id:'unverified', kind:'game', opens:9}, {id:'unrequested', kind:'game', opens:10},
    {id:'other-game', kind:'library', projects:3},
  ]})};
  const response = await hubMetricsResponse(request('game', 'drawing-pad,other-game,unverified'),
    {service, env:{}, visibilityReader:async () => decision(['11'])});
  assert.deepEqual((await response.json()).items, [{id:'other-game', kind:'game', opens:8}]);
});

test('expired initial or final authority cannot advance another stage or return stale metrics', async () => {
  for (const expireAt of ['initial', 'resolution', 'counts', 'final']) {
    let time = 0, reads = 0, counts = 0, resolutions = 0;
    const service = createHubMetricsService({env:{}, resolve:async ({id}) => {
      resolutions++; if (expireAt === 'resolution') time = 18_000; return game(id);
    }, store:{counts:async () => {counts++; if (expireAt === 'counts') time = 18_000; return {'drawing-pad':4};}}});
    const response = await hubMetricsResponse(request(), {service, env:{}, monotonicNow:() => time,
      visibilityReader:async () => {
        reads++; if (expireAt === 'initial' || expireAt === 'final' && reads === 2) time = 18_000;
        return decision();
      }});
    assert.equal(response.status, 503, expireAt);
    assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
    if (expireAt === 'initial') assert.equal(resolutions, 0);
    if (['initial', 'resolution'].includes(expireAt)) assert.equal(counts, 0);
    assert.equal(reads, expireAt === 'final' ? 2 : 1);
  }
});

test('uncooperative stalled stages are bounded by the total request deadline', async () => {
  for (const stage of ['initial', 'resolution', 'counts', 'final']) {
    const stall = deferred(); let reads = 0, counts = 0;
    const service = createHubMetricsService({env:{}, resolve:async ({id}) => {
      if (stage === 'resolution') await stall.promise; return game(id);
    }, store:{counts:async () => {counts++; if (stage === 'counts') await stall.promise; return {'drawing-pad':1};}}});
    const response = await hubMetricsResponse(request(), {service, env:{}, responseBudgetMs:20,
      visibilityReader:async () => {
        reads++; if (stage === 'initial' || stage === 'final' && reads === 2) await stall.promise;
        return decision();
      }});
    assert.equal(response.status, 503, stage);
    stall.reject(Error('late private error')); await turn();
    assert.equal(counts, ['initial', 'resolution'].includes(stage) ? 0 : 1);
    assert.equal(reads, stage === 'final' ? 2 : 1);
  }
});

test('cancellation while shared inactive resolution waits starts counts only for a surviving caller', async () => {
  const catalog = deferred(), started = deferred(); let resolutions = 0, counts = 0;
  const service = createHubMetricsService({env:{}, resolve:async ({id}, options) => {
    resolutions++; assert.equal(options.signal, undefined); started.resolve(); await catalog.promise; return game(id);
  }, store:{counts:async () => {counts++; return {'drawing-pad':5};}}});
  const options = {service, env:{}, visibilityReader:async () => null};
  const controller = new AbortController();
  const cancelled = hubMetricsResponse(new Request(request().url, {signal:controller.signal}), options);
  await started.promise;
  const surviving = hubMetricsResponse(request(), options);
  await turn(); controller.abort();
  assert.equal((await cancelled).status, 503); assert.equal(counts, 0);
  catalog.resolve();
  assert.deepEqual((await (await surviving).json()).items, [{id:'drawing-pad', kind:'game', opens:5}]);
  assert.equal(resolutions, 1); assert.equal(counts, 1);
  await hubMetricsResponse(request(), options); assert.equal(counts, 1);
});

test('sole cancelled waiter cannot start counts after stalled resolution completes', async () => {
  const catalog = deferred(), started = deferred(); let counts = 0;
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => {
    started.resolve(); await catalog.promise; return game(id);
  }, store:{counts:async () => {counts++; return {};}}});
  const controller = new AbortController();
  const pending = hubMetricsResponse(new Request(request().url, {signal:controller.signal}),
    {service, env:{}, visibilityReader:async () => null});
  await started.promise; controller.abort(); assert.equal((await pending).status, 503);
  catalog.resolve(); await turn(); assert.equal(counts, 0);
});

test('cancelled count waiter leaves shared count work available to survivors and warm production cache', async () => {
  const count = deferred(), started = deferred(); let counts = 0;
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => game(id),
    store:{counts:async () => {counts++; started.resolve(); return count.promise;}}});
  const options = {service, env:{}, visibilityReader:async () => null};
  const controller = new AbortController();
  const cancelled = hubMetricsResponse(new Request(request().url, {signal:controller.signal}), options);
  await started.promise;
  const surviving = hubMetricsResponse(request(), options); await turn(); controller.abort();
  assert.equal((await cancelled).status, 503);
  count.resolve({'drawing-pad':9});
  assert.deepEqual((await (await surviving).json()).items, [{id:'drawing-pad', kind:'game', opens:9}]);
  assert.equal((await hubMetricsResponse(request(), options)).status, 200); assert.equal(counts, 1);
});

test('authority, resolution and counts consume one cumulative 18-second budget', async () => {
  let time = 0, reads = 0;
  const service = createHubMetricsService({env:{}, resolve:async ({id}) => {
    time += 6_000; return game(id);
  }, store:{counts:async () => {time += 6_000; return {'drawing-pad':3};}}});
  const response = await hubMetricsResponse(request(), {service, env:{}, monotonicNow:() => time,
    visibilityReader:async () => {reads++; time += 6_000; return decision();}});
  assert.equal(response.status, 503);
  assert.equal(reads, 1, 'No final authority stage starts after counts consumes the remaining budget.');
});
