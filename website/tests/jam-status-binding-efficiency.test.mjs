import test from 'node:test';
import assert from 'node:assert/strict';

// The singleton captures fetch when its module is initialized; no network is used.
let onProvider = () => {};
const previousFetch = globalThis.fetch;
globalThis.fetch = async (_url, {method}) => {
  onProvider();
  return method === 'HEAD' ? new Response(null, {status:200}) :
    Response.json({id:1418151381, owner:{id:7}, stargazers_count:3, has_issues:true});
};
const {hubProjectStatusService: singleton, hubProjectsResponse} = await import('../lib/hub-project-status.mjs');
globalThis.fetch = previousFetch;

const id = 'drawing-pad', repositoryId = '1418151381';
const repositoryUrl = 'https://github.com/codepetca/zero-drawing-pad';
const playUrl = 'https://codepetca.github.io/zero-drawing-pad/';
const request = (ids = id, kind = 'game') => new Request(`https://zero.example/api/hub/projects?kind=${kind}&ids=${ids}`);
const decision = held => ({revision:'a'.repeat(40), observedAt:0, isHeld:value => held && value === repositoryId});
function fixture() {
  const calls = {source:0, pages:0};
  let held = false, active = true;
  return {calls, setHeld:value => {held = value;}, setActive:value => {active = value;}, options:{
    visibilityReader:async () => active ? decision(held) : null,
    destinationReader:async () => {calls.source++; return {repositoryId, ownerId:'7', owner:'codepetca', repo:'zero-drawing-pad', repositoryUrl};},
    pagesBindingReader:async (repo, url) => {calls.pages++; assert.equal(url, playUrl); return {status:'verified', repositoryId:repo.id, ownerId:repo.ownerId, pagesUrl:url};}
  }};
}

test('a hold during status provider work still withholds the built-in result', async () => {
  const f = fixture();
  onProvider = () => f.setHeld(true);
  try {
    const response = await hubProjectsResponse(request(), f.options);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items, []);
  } finally { onProvider = () => {}; }
});

test('default singleton binds four times per request; wrappers and modified methods retain the route gate', async () => {
  const f = fixture();
  for (let i = 1; i <= 2; i++) {
    const response = await hubProjectsResponse(request(), f.options);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.length, 1);
    assert.deepEqual(f.calls, {source:4*i, pages:0});
  }
  const wrapper = {resolve:(...args) => singleton.resolve(...args), statusTarget:(...args) => singleton.statusTarget(...args)};
  const wrapped = fixture();
  assert.equal((await hubProjectsResponse(request(), {...wrapped.options, service:wrapper})).status, 200);
  assert.deepEqual(wrapped.calls, {source:5, pages:0});
  for (const method of ['resolve', 'statusTarget']) {
    const original = singleton[method], changed = fixture();
    try {
      singleton[method] = (...args) => original(...args);
      assert.equal((await hubProjectsResponse(request(), changed.options)).status, 200);
      assert.deepEqual(changed.calls, {source:5, pages:0});
    } finally { singleton[method] = original; }
  }
});

test('a replacement during resolution cannot redirect the pinned status call', async () => {
  const f = fixture(), original = singleton.statusTarget, source = f.options.destinationReader;
  let customCalls = 0;
  f.options.destinationReader = async (...args) => {
    singleton.statusTarget = async () => {customCalls++; throw Error('must not run');};
    return source(...args);
  };
  try {
    const response = await hubProjectsResponse(request(), f.options);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.length, 1);
    assert.equal(customCalls, 0);
    assert.deepEqual(f.calls, {source:4, pages:0});
  } finally { singleton.statusTarget = original; }
});

test('a hold during a later batch withholds an earlier item', async () => {
  const f = fixture();
  const ids = ['one', 'two', 'three', 'four'];
  const service = {
    resolve:async ({id: selected}) => ({id:selected, kind:'game', repositoryId, repositoryUrl, playUrl}),
    statusTarget:async target => {if (target.id === 'four') f.setHeld(true); return {...target, stars:1, issuesEnabled:true, site:{status:'reachable'}};}
  };
  const response = await hubProjectsResponse(request(ids.join(',')), {...f.options, service});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items, []);
});

test('inactive authority avoids source and Pages observations and activation fails closed', async () => {
  const f = fixture(); f.setActive(false);
  const response = await hubProjectsResponse(request(), f.options);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items.length, 1);
  assert.deepEqual(f.calls, {source:0, pages:0});
  let reads = 0;
  const transitioned = await hubProjectsResponse(request(), {...f.options, visibilityReader:async () => ++reads === 1 ? null : decision(false)});
  assert.equal(transitioned.status, 200);
  assert.deepEqual((await transitioned.json()).items, []);
});
