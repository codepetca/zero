import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubMetricsService, hubMetricsResponse} from '../lib/hub-metrics.mjs';
import {resolveHubProject} from '../lib/hub-project-status.mjs';

const ids = Array.from({length:8}, (_, index) => `game-r${123 + index}-project`);
const numeric = id => id.match(/^game-r(\d+)-/)[1];
const decision = held => ({revision:'a'.repeat(40), observedAt:0, isHeld:id => held.has(id)});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
};
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture({beforeBinding = async () => {}, counts = async selected => Object.fromEntries(selected.map(id => [id, 17]))} = {}) {
  const held = new Set(['202']), current = new Map(ids.map(id => [id, numeric(id)]));
  let calls = 0, reads = 0, active = 0, peak = 0;
  const releases = ids.map(id => ({id, kind:'game', version:'0.1.0', status:'available', title:'Project',
    repository:{id:numeric(id), ownerId:'7', url:`https://github.com/student/${id}`}, source:{commit:'b'.repeat(40)},
    web:{provider:'github-pages', url:`https://student.github.io/${id}/`, commit:'b'.repeat(40), runId:1}}));
  const visibilityReader = async () => {reads++; return decision(held);};
  const destinationReader = async (url, {signal}) => {
    const id = url.split('/').at(-1), call = ++calls;
    active++; peak = Math.max(peak, active);
    try {
      await beforeBinding({id, call, signal, held, current});
      return {repositoryId:current.get(id), ownerId:'7', owner:'student', repo:id, repositoryUrl:url};
    } finally {active--;}
  };
  const service = createHubMetricsService({env:{}, visibilityReader, destinationReader, store:{counts},
    resolve:(selection, options) => resolveHubProject(selection, {...options,
      maintainedProjects:[], catalogReader:async () => ({releases})})});
  const request = signal => new Request(`https://zero.example/api/hub/metrics?kind=game&ids=${ids.join(',')}`, {signal});
  const options = {env:{}, service, visibilityReader, destinationReader};
  return {held, current, service, request, options, stats:() => ({calls, reads, peak})};
}

test('HTTP and standalone metrics suppress a source replaced during counts while preserving unrelated counts', async () => {
  for (const standalone of [false, true]) {
    const started = deferred(), count = deferred();
    const f = fixture({counts:async selected => {started.resolve(); await count.promise;
      return Object.fromEntries(selected.map(id => [id, 17]));}});
    const pending = standalone ? f.service.metrics('game', ids) : hubMetricsResponse(f.request(), f.options);
    await started.promise;
    f.current.set(ids[0], '202'); count.resolve();
    const result = await pending;
    const items = standalone ? result : (await result.json()).items;
    assert.deepEqual(items, ids.slice(1).map(id => ({id, kind:'game', opens:17})));
    assert.equal(f.stats().calls, 16); assert.ok(f.stats().peak <= 4);
  }
});

test('a hold accepted in a later final binding batch also hides an earlier successfully rebound target', async () => {
  const f = fixture({beforeBinding:async ({call, held}) => {
    if (call === 13) held.add(numeric(ids[0]));
  }});
  const response = await hubMetricsResponse(f.request(), f.options);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items, ids.slice(1).map(id => ({id, kind:'game', opens:17})));
  assert.equal(f.stats().calls, 16); assert.ok(f.stats().peak <= 4);
});

test('a provider outage during final source binding fails closed with a sanitized response', async () => {
  const f = fixture({beforeBinding:async ({call}) => {if (call > ids.length) throw Error('private provider detail');}});
  const response = await hubMetricsResponse(f.request(), f.options);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
  assert.equal(f.stats().calls, 12);
});

test('total deadline and cancellation bound final source work and prevent later binding batches', async () => {
  for (const stop of ['deadline', 'cancel']) {
    const started = deferred(), gate = deferred(), controller = new AbortController();
    const signals = []; let time = 0;
    const f = fixture({beforeBinding:async ({call, signal}) => {
      if (call > ids.length) {signals.push(signal); started.resolve(); await gate.promise;}
    }});
    const pending = hubMetricsResponse(f.request(controller.signal), {...f.options,
      responseBudgetMs:stop === 'deadline' ? 30 : 1000, monotonicNow:() => time});
    await started.promise;
    if (stop === 'deadline') time = 30; else controller.abort();
    const response = await pending;
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
    assert.equal(f.stats().calls, 12); assert.equal(f.stats().reads, 10);
    assert.ok(signals.every(signal => signal.aborted));
    gate.resolve(); await turn();
    assert.equal(f.stats().calls, 12); assert.equal(f.stats().reads, 10);
  }
});

test('custom selections cannot replace a game binding with duplicate or wrong-kind targets', async () => {
  const id = ids[0], target = {id, kind:'game', repositoryId:'123', ownerId:'7',
    repositoryUrl:`https://github.com/student/${id}`, playUrl:`https://student.github.io/${id}/`};
  for (const targets of [[target, {...target, kind:'library'}],
    [{...target, kind:'library'}, target], [target, {...target, repositoryId:'202'}],
    [{...target, kind:'library'}], [{...target, kind:'unknown'}]]) {
    let bindings = 0;
    const response = await hubMetricsResponse(new Request(`https://zero.example/api/hub/metrics?kind=game&ids=${id}`), {
      env:{}, visibilityReader:async () => decision(new Set(['202'])),
      destinationReader:async () => {bindings++; throw Error('Must reject invalid selection before binding');},
      service:{metricsSelection:async () => ({targets, items:[{id, kind:'game', opens:17}]})},
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error:'Counts unavailable.'});
    assert.equal(bindings, 0);
  }
});

test('custom selection metadata stays pinned while final authority and binding wait', async () => {
  const id = ids[0], target = {id, kind:'game', repositoryId:'123', ownerId:'7',
    repositoryUrl:`https://github.com/student/${id}`, playUrl:`https://student.github.io/${id}/`};
  const item = {id, kind:'game', opens:17}; let reads = 0, bindings = 0;
  const response = await hubMetricsResponse(new Request(`https://zero.example/api/hub/metrics?kind=game&ids=${id}`), {
    env:{}, visibilityReader:async () => {
      if (++reads === 2) {target.kind = 'library'; target.repositoryId = '202'; item.id = 'unrequested';}
      return decision(new Set(['202']));
    }, destinationReader:async url => {bindings++;
      return {repositoryId:'202', ownerId:'7', owner:'student', repo:id, repositoryUrl:url};
    }, service:{metricsSelection:async () => ({targets:[target], items:[item]})},
  });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {schema:1, items:[]});
  assert.equal(bindings, 1);
});

test('resolved target identity stays pinned while the counts store mutates its shared input', async () => {
  const id = ids[0], target = {id, kind:'game', repositoryId:'123', ownerId:'7',
    repositoryUrl:`https://github.com/student/${id}`, playUrl:`https://student.github.io/${id}/`};
  const held = new Set(); let bindings = 0;
  const service = createHubMetricsService({env:{}, visibilityReader:async () => decision(held),
    resolve:async () => target,
    destinationReader:async url => {bindings++;
      return {repositoryId:'202', ownerId:'7', owner:'student', repo:'replacement', repositoryUrl:url};
    }, store:{counts:async () => {
      held.add('123'); target.repositoryId = '202'; target.repositoryUrl = 'https://github.com/student/replacement';
      target.playUrl = 'https://student.github.io/replacement/';
      return {[id]:17};
    }},
  });
  assert.deepEqual(await service.metrics('game', [id]), []);
  assert.equal(bindings, 0);
});
