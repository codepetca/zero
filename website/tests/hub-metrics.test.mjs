import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubMetricsService, hubMetricsResponse} from '../lib/hub-metrics.mjs';
import {REGISTRY_URL} from '../lib/sharing-catalog.mjs';
import {loadMetricBatches} from '../lib/hub-metrics-client.mjs';

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
  const service = {metrics: async (kind, ids) => {calls++; return ids.map(id => ({id, kind, opens: 3}));}};
  for (const query of ['', 'kind=game', 'kind=other&ids=a', 'kind=game&kind=game&ids=a', 'kind=game&ids=a,a', 'kind=game&ids=../evil', 'kind=game&ids=a&extra=1', `kind=game&ids=${Array.from({length: 13}, (_, i) => 'p' + i).join(',')}`])
    assert.equal((await hubMetricsResponse(request(query), {service})).status, 400);
  assert.equal(calls, 0);
  const response = await hubMetricsResponse(request('kind=game&ids=drawing-pad'), {service});
  assert.deepEqual(await response.json(), {schema: 1, items: [{kind: 'game', id: 'drawing-pad', opens: 3}]});
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
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
  const response = await hubMetricsResponse(request('kind=game&ids=drawing-pad'), {service: {metrics: async () => {throw Error('private details');}}});
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {error: 'Counts unavailable.'});
});
