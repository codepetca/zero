import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubMetricsService as createMetrics, hubMetricsResponse as metricsResponse} from '../lib/hub-metrics.mjs';
import {REGISTRY_URL} from '../lib/sharing-catalog.mjs';
import {loadMetricBatches} from '../lib/hub-metrics-client.mjs';
import {createOpensStore} from '../lib/hub-opens.mjs';

// Every transport/authority is synthetic; these tests never depend on process configuration.
const createHubMetricsService = options => createMetrics({env:{}, visibilityReader:async () => null, ...options});
const hubMetricsResponse = (request, options) => metricsResponse(request, {env:{}, visibilityReader:async () => null, ...options});

const request = query => new Request(`https://zero.codepet.ca/api/hub/metrics?${query}`);
const resolve = async ({kind, id}) => id === 'unknown' ? null : {kind, id, ...(kind === 'game' ? {playUrl: 'https://student.github.io/game/'} : {})};

test('visible metric selections beyond twelve load bounded batches and retain earlier results', async () => {
  const ids = Array.from({length: 25}, (_, index) => `lib-r${index + 1}-helper`), requests = [], result = {};
  await loadMetricBatches('library', [...ids, ids[0]], {signal: new AbortController().signal,
    onItems: items => {for (const item of items) result[item.id] = item;},
    fetchImpl: async url => {
      const params = new URL(url, 'https://zero.codepet.ca').searchParams, batch = params.get('ids').split(',');
      requests.push(batch);
      return Response.json({schema: 1, items: [...batch.map(id => ({id, kind: 'library', projects: 1})), {id: 'unrequested', kind: 'library', projects: 999}]});
    },
  });
  assert.deepEqual(requests.map(ids => ids.length), [12, 12, 1]);
  assert.deepEqual(Object.keys(result), ids); assert.equal(result['lib-r13-helper'].projects, 1);
  assert.equal(result.unrequested, undefined);
});

test('one failed batch does not suppress later cards, and cancelled selections stop loading', async () => {
  const ids = Array.from({length: 13}, (_, index) => 'project-' + index), received = [];
  let calls = 0;
  await loadMetricBatches('game', ids, {signal: new AbortController().signal, onItems: items => received.push(...items),
    fetchImpl: async () => ++calls === 1 ? new Response('', {status: 503}) : Response.json({schema: 1, items: [{id: ids[12], kind: 'game', opens: 1}]}),
  });
  assert.equal(calls, 2); assert.equal(received[0].id, ids[12]);
  const controller = new AbortController(); controller.abort();
  await loadMetricBatches('game', ids, {signal: controller.signal, onItems: () => assert.fail(), fetchImpl: () => assert.fail()});
});

test('metrics endpoint bounds/deduplicates selections before work and projects only known targets', async () => {
  let calls = 0;
  const service = {metricsSelection: async (kind, ids) => {calls++; return {
    targets:ids.map(id => ({id, kind})), items:ids.map(id => ({id, kind, opens:3})),
  };}};
  for (const query of ['', 'kind=game', 'kind=other&ids=a', 'kind=game&kind=game&ids=a', 'kind=game&ids=a,a', 'kind=game&ids=../evil', 'kind=game&ids=a&extra=1', `kind=game&ids=${Array.from({length: 13}, (_, i) => 'p' + i).join(',')}`])
    assert.equal((await hubMetricsResponse(request(query), {service})).status, 400);
  assert.equal(calls, 0);
  const response = await hubMetricsResponse(request('kind=game&ids=drawing-pad'), {service});
  assert.deepEqual(await response.json(), {schema: 1, items: [{kind: 'game', id: 'drawing-pad', opens: 3}]});
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('concurrent count requests share one MGET, cache is bounded in time and failures stay unknown', async () => {
  let time = 0, reads = 0;
  const service = createHubMetricsService({now: () => time, resolve, store: {counts: async ids => {reads++; return Object.fromEntries(ids.map(id => [id, 7]));}}});
  const results = await Promise.all(Array.from({length: 10}, () => service.metrics('game', ['drawing-pad', 'unknown'])));
  assert.equal(reads, 1); assert.deepEqual(results[0], [{kind: 'game', id: 'drawing-pad', opens: 7}]);
  time = 60_001; await service.metrics('game', ['drawing-pad', 'unknown']); assert.equal(reads, 2);
  for (const store of [null, {counts: async () => {throw Error('down');}}]) {
    const offline = createHubMetricsService({resolve, store});
    assert.equal((await offline.metrics('game', ['drawing-pad']))[0].opens, null);
  }
});

function state() {
  return {schema: 1, sequence: 1, availability: [], releases: {
    'library/lib-r22-helper/0.1.0': {delivery: 'ready', release: {kind: 'library', id: 'lib-r22-helper', version: '0.1.0', repository: {id: '22'}}},
    'game/game-r11-game/0.1.0': {delivery: 'ready', release: {kind: 'game', id: 'game-r11-game', version: '0.1.0', repository: {id: '11'}}, adoption: {schema: 1, libraries: [{id: 'lib-r22-helper', version: '0.1.0'}]}},
  }};
}

test('adoption is a cached ledger projection, independent of Redis and GitHub user credentials', async () => {
  let reads = 0;
  const service = createHubMetricsService({env: {ZERO_SHARING_REGISTRY_URL: REGISTRY_URL}, resolve, store: null,
    registryReader: async () => {reads++; return state();}});
  const result = await service.metrics('library', ['lib-r22-helper']);
  assert.deepEqual(result, [{id: 'lib-r22-helper', kind: 'library', projects: 1, observedProjects: 1, totalProjects: 1}]);
  await service.metrics('library', ['lib-r22-helper', 'unknown']); assert.equal(reads, 1);
});

test('missing registry configuration, legacy snapshots or registry outages never fabricate adoption zero', async () => {
  for (const options of [{env: {}, registryReader: async () => {throw Error('should not read');}},
    {env: {ZERO_SHARING_REGISTRY_URL: REGISTRY_URL}, registryReader: async () => {throw Error('down');}}]) {
    const service = createHubMetricsService({...options, resolve, store: null});
    const metric = (await service.metrics('library', ['lib-r22-helper']))[0];
    assert.equal(metric.projects, null); assert.equal(metric.observedProjects, null);
  }
  const legacy = state(); delete legacy.releases['game/game-r11-game/0.1.0'].adoption;
  const service = createHubMetricsService({env: {ZERO_SHARING_REGISTRY_URL: REGISTRY_URL}, registryReader: async () => legacy, resolve, store: null});
  const metric = (await service.metrics('library', ['lib-r22-helper']))[0];
  assert.equal(metric.observedProjects, 0); assert.equal(metric.totalProjects, 1);
});

test('failed resolution returns a retryable unavailable response without caching private errors', async () => {
  const response = await hubMetricsResponse(request('kind=game&ids=drawing-pad'), {service: {metricsSelection: async () => {throw Error('private details');}}});
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {error: 'Counts unavailable.'});
});

test('metric clients allow the 18-second server budget to finish within a 22-second timeout', async t => {
  const delays = [];
  t.mock.method(AbortSignal, 'timeout', delay => {delays.push(delay); return new AbortController().signal;});
  const received = [];
  await loadMetricBatches('game', ['drawing-pad'], {signal:new AbortController().signal,
    onItems:items => received.push(...items), fetchImpl:async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({schema:1, items:[{id:'drawing-pad', kind:'game', opens:2}]});
    }});
  assert.deepEqual(delays, [22_000]);
  assert.deepEqual(received, [{id:'drawing-pad', kind:'game', opens:2}]);
});

test('actual metric batches and counter reads accept maximum maintained IDs without suppressing unrelated IDs',async()=>{
  const ids=['unrelated-project','b'.repeat(101),...Array.from({length:12},(_,i)=>`id${i}`.padEnd(128,'a'))];
  const records=ids.map((id,i)=>({id,kind:'game',repositoryId:String(321+i),ownerId:'7',
    repositoryUrl:`https://github.com/student/game-${321+i}`,playUrl:`https://student.github.io/game-${321+i}/`}));
  for(const active of [true,false]) {
    const reads=[],received=[],batches=[];
    const store=createOpensStore({env:{ZERO_HUB_OPENS_REDIS_URL:'https://counter.upstash.io',ZERO_HUB_OPENS_REDIS_TOKEN:'fixture-token'},
      fetchImpl:async(_url,options)=>{const command=JSON.parse(options.body);assert.equal(command[0],'MGET');reads.push(command.slice(1));
        return Response.json({result:command.slice(1).map(key=>String(ids.indexOf(key.slice('zero:hub:opens:v1:'.length))+1))});}});
    const visibilityReader=async()=>active?{revision:'a'.repeat(40),observedAt:0,isHeld:()=>false}:null;
    const destinationReader=async url=>{assert.equal(active,true);const [,owner,repo]=new URL(url).pathname.split('/');
      return {repositoryUrl:url,owner,repo,repositoryId:repo.slice(5),ownerId:'7'};};
    const service=createHubMetricsService({store,visibilityReader,destinationReader,
      resolve:async({id})=>records.find(record=>record.id===id)});
    await loadMetricBatches('game',ids,{signal:new AbortController().signal,onItems:items=>received.push(...items),
      fetchImpl:async url=>{const batchRequest=new Request(`https://zero.codepet.ca${url}`);batches.push(batchRequest);
        const response=await hubMetricsResponse(batchRequest,{service,visibilityReader,destinationReader});
        assert.equal(response.status,200);return response;}});
    assert.deepEqual(batches.map(req=>new URL(req.url).searchParams.get('ids').split(',').length),[12,2]);
    assert.deepEqual(received,ids.map((id,i)=>({id,kind:'game',opens:i+1})));
    assert.equal(reads.length,2);assert.equal(reads.flat().length,ids.length);
    const invalid=await hubMetricsResponse(request(`kind=game&ids=unrelated-project,${'x'.repeat(129)}`),{service,visibilityReader,destinationReader});
    assert.equal(invalid.status,400);assert.equal(reads.length,2);
  }
});
