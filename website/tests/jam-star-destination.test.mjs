import assert from 'node:assert/strict';
import test from 'node:test';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import maintainedProjects from '../content/projects.json' with {type:'json'};
import {hubConfig, newSession} from '../lib/hub-github-auth.mjs';
import {getStarResponse, postStarResponse} from '../lib/hub-stars.mjs';
import {resolveHubProject} from '../lib/hub-project-status.mjs';

// All identity, authority, session and provider data here is synthetic. No
// production credential, network request, browser or Pages proof is involved.
const now = 1_800_000_000_000;
const env = {NODE_ENV:'test', ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId, ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),
  ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32, 7).toString('base64url')};
const config = hubConfig(env);
const {session, cookie} = newSession('ghu_' + 's'.repeat(24), {id:12, login:'student'}, 28800, config, now);
const target = {kind:'game', id:'drawing-pad', repositoryUrl:'https://github.com/student/project',
  repositoryId:'123', ownerId:'12', playUrl:'https://student.github.io/project/'};
const binding = {repositoryUrl:target.repositoryUrl, repositoryId:'123', ownerId:'12', owner:'student', repo:'project'};
const authority = held => ({revision:'a'.repeat(40), observedAt:0, isHeld:id => held.includes(id)});
const request = (method, {kind = 'game', starred = true, signal} = {}) => new Request(
  `${config.origin}/api/hub/github/stars${method === 'GET' ? `?kind=${kind}&id=drawing-pad` : ''}`,
  {method, signal, headers:{Cookie:cookie.split(';')[0], ...(method === 'POST' ? {
    Origin:config.origin, 'X-Hub-CSRF':session.csrf, 'Content-Type':'application/json'} : {})},
  ...(method === 'POST' ? {body:JSON.stringify({kind, id:'drawing-pad', starred})} : {})});

function fixture(extra = {}) {
  const calls = {provider:[], destinations:[], authorities:0};
  const options = {env, now, responseBudgetMs:1000,
    resolver:async input => ({...target, ...input}),
    visibilityReader:async () => { calls.authorities++; return authority([]); },
    destinationReader:async (url, options) => { calls.destinations.push({url, options}); return {...binding}; },
    fetchImpl:async (url, options) => { calls.provider.push({url, options}); return new Response(null, {status:204}); },
    ...extra};
  return {options, calls};
}

// Exercise the actual default resolver against bundled public metadata, with
// synthetic provider observations. No default network transport is reachable.
function defaultResolverFixture(extra = {}) {
  const {options, calls} = fixture({resolver:undefined, ...extra});
  const project = maintainedProjects.find(project => project.id === 'drawing-pad');
  assert.ok(project?.repositoryId);
  options.destinationReader = async (url, options) => {
    calls.destinations.push({url, options});
    assert.equal(url, project.repositoryUrl);
    const [owner, repo] = new URL(url).pathname.slice(1).split('/');
    return {repositoryUrl:url, repositoryId:project.repositoryId, ownerId:'12', owner, repo};
  };
  return {options, calls};
}

test('the actual default resolver uses two source observations while a wrapper still receives independent route binding', async () => {
  for (const resolver of [undefined, (...args) => resolveHubProject(...args)]) {
    const {options, calls} = defaultResolverFixture({resolver});
    const response = await getStarResponse(request('GET'), options);
    assert.deepEqual(await response.json(), {starred:true});
    assert.equal(calls.destinations.length, resolver === undefined ? 2 : 3);
    assert.equal(calls.authorities, resolver === undefined ? 4 : 5);
    assert.equal(calls.provider.length, 1);
    assert.equal(calls.provider[0].options.method, 'GET');
  }
});

test('default-resolver optimization retains final source identity verification after the star read', async () => {
  const {options, calls} = defaultResolverFixture();
  const observe = options.destinationReader;
  options.destinationReader = async (...args) => {
    const result = await observe(...args);
    return calls.destinations.length === 2 ? {...result, repositoryId:'202'} : result;
  };
  const response = await getStarResponse(request('GET'), options);
  assert.equal(response.status, 404);
  assert.equal('starred' in await response.json(), false);
  assert.equal(calls.destinations.length, 2);
  assert.equal(calls.provider.length, 1);
});

test('the actual default resolver rejects authority transitions before star dispatch', async () => {
  for (const initialActive of [false,true]) {
    let reads = 0;
    const {options, calls} = defaultResolverFixture({visibilityReader:async () => {
      const active = ++reads === 1 ? initialActive : !initialActive;
      return active ? authority([]) : null;
    }});
    const response = await getStarResponse(request('GET'), options);
    assert.equal(response.status, initialActive ? 503 : 404);
    assert.equal(calls.provider.length, 0);
  }
});

test('active star reads independently bind source even for an injected resolver, before and after the read', async () => {
  const {options, calls} = fixture();
  const response = await getStarResponse(request('GET'), options);
  assert.deepEqual(await response.json(), {starred:true});
  assert.equal(calls.destinations.length, 2);
  assert.ok(calls.authorities >= 4, 'fresh authority follows each destination observation');
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.provider[0].options.method, 'GET');
  assert.equal(calls.provider[0].url, 'https://api.github.com/user/starred/student/project');
  assert.equal(calls.destinations.every(call => call.options.signal instanceof AbortSignal), true);
});

test('active bound star reads preserve both starred and unstarred results', async () => {
  for (const status of [204,404]) {
    const {options} = fixture({fetchImpl:async () => new Response(null, {status})});
    const response = await getStarResponse(request('GET'), options);
    assert.deepEqual(await response.json(), {starred:status === 204});
  }
});

test('active game PUT and DELETE intentions are explicitly not dispatched even for a bound visible target', async () => {
  for (const starred of [true,false]) {
    const {options, calls} = fixture();
    const response = await postStarResponse(request('POST', {starred}), options);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error:'GitHub star changes are unavailable for this project.',
      code:'hub_star_write_unavailable', outcome:'not_dispatched'});
    assert.equal(calls.provider.length, 0);
  }
});

test('namespace reuse, owner transfer and missing saved identity suppress reads and writes before star provider work', async () => {
  for (const method of ['GET','POST']) {
    for (const change of [
      {destinationReader:async () => ({...binding, repositoryId:'202'})},
      {destinationReader:async () => ({...binding, ownerId:'99'})},
      {resolver:async () => ({...target, repositoryId:undefined})},
    ]) {
      const {options, calls} = fixture(change);
      const response = await (method === 'GET' ? getStarResponse : postStarResponse)(request(method), options);
      assert.equal(response.status, 404);
      assert.equal(calls.provider.length, 0);
      const body = await response.json();
      assert.equal('starred' in body, false);
      if (method === 'POST') assert.equal(body.outcome, 'not_dispatched');
    }
  }
});

test('rename, deletion, malformed identity and unavailable binding fail closed without a star call', async () => {
  for (const destinationReader of [
    async () => ({...binding, repositoryUrl:'https://github.com/student/renamed', repo:'renamed'}),
    async () => null,
    async () => ({...binding, repositoryId:202}),
    async () => { throw new Error('synthetic provider failure'); },
  ]) {
    const {options, calls} = fixture({destinationReader});
    const response = await getStarResponse(request('GET'), options);
    assert.equal(response.status, 503);
    assert.equal(calls.provider.length, 0);
  }
});

test('stored and current repository holds both suppress namespace-reused targets', async () => {
  for (const held of [['123'],['202']]) {
    const {options, calls} = fixture({visibilityReader:async () => authority(held),
      destinationReader:async () => ({...binding, repositoryId:'202'})});
    const response = await getStarResponse(request('GET'), options);
    assert.equal(response.status, 404);
    assert.equal(calls.provider.length, 0);
  }
});

test('a hold accepted during source lookup prevents GET dispatch', async () => {
  let held = false;
  const {options, calls} = fixture({visibilityReader:async () => authority(held ? ['123'] : []),
    destinationReader:async () => { held = true; return binding; }});
  const response = await getStarResponse(request('GET'), options);
  assert.equal(response.status, 404);
  assert.equal(calls.provider.length, 0);
});

test('a hold or namespace substitution during a slow star GET suppresses the response', async () => {
  for (const change of ['hold','identity','authority-outage','authority-removed']) {
    let changed = false;
    const {options} = fixture({
      visibilityReader:async () => {
        if (changed && change === 'authority-outage') throw new Error('unavailable');
        if (changed && change === 'authority-removed') return null;
        return authority(changed && change === 'hold' ? ['123'] : []);
      },
      destinationReader:async () => ({...binding, repositoryId:changed && change === 'identity' ? '202' : '123'}),
      fetchImpl:async () => { changed = true; return new Response(null, {status:204}); },
    });
    const response = await getStarResponse(request('GET'), options);
    assert.equal(response.status, change === 'authority-outage' ? 503 : 404);
    assert.equal('starred' in await response.json(), false);
  }
});

test('inactive-to-active transitions during resolution or final pre-dispatch check never dispatch writes', async () => {
  for (const activateAt of [2,3]) {
    let reads = 0;
    const {options, calls} = fixture({visibilityReader:async () => ++reads >= activateAt ? authority([]) : null});
    const response = await postStarResponse(request('POST'), options);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).outcome, 'not_dispatched');
    assert.equal(calls.provider.length, 0);
  }
});

test('an inactive GET cannot return unchecked state if authority activates while the provider waits', async () => {
  let active = false;
  const {options} = fixture({visibilityReader:async () => active ? authority([]) : null,
    fetchImpl:async () => { active = true; return new Response(null, {status:204}); }});
  const response = await getStarResponse(request('GET'), options);
  assert.equal(response.status, 404);
  assert.equal('starred' in await response.json(), false);
});

test('inactive games and libraries keep idempotent writes without requiring source binding', async () => {
  for (const kind of ['game','library']) {
    const {options, calls} = fixture({
      visibilityReader:async () => null,
      destinationReader:async () => { throw new Error('inactive/library must not bind'); },
    });
    for (const starred of [true,false]) {
      const response = await postStarResponse(request('POST', {kind, starred}), options);
      assert.deepEqual(await response.json(), {starred});
    }
    assert.deepEqual(calls.provider.map(call => call.options.method), ['PUT','DELETE']);
  }
});

test('binding deadline and caller cancellation bound noncooperative lookups without later star side effects', async () => {
  for (const cancel of [false,true]) {
    const controller = new AbortController();
    let release, seenSignal;
    const {options, calls} = fixture({responseBudgetMs:40,
      destinationReader:async (_url, {signal}) => {
        seenSignal = signal;
        if (cancel) controller.abort();
        return new Promise(resolve => { release = resolve; });
      }});
    const response = await postStarResponse(request('POST', {signal:controller.signal}), options);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, cancel ? 'hub_request_cancelled' : 'hub_request_timeout');
    assert.equal(body.outcome, 'not_dispatched');
    assert.equal(seenSignal.aborted, true);
    release(binding);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.provider.length, 0);
  }
});

test('a cancelled final destination observation cannot disclose already-read star state', async () => {
  const controller = new AbortController();
  let lookups = 0;
  const {options, calls} = fixture({destinationReader:async () => {
    if (++lookups === 2) controller.abort();
    return binding;
  }});
  const response = await getStarResponse(request('GET', {signal:controller.signal}), options);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'hub_request_cancelled');
  assert.equal(calls.provider.length, 1);
});


test('active library targets obey repository holds and never dispatch name-based star writes', async () => {
  for (const held of [true,false]) {
    const {options,calls}=fixture({visibilityReader:async()=>authority(held?['123']:[])});
    const response=await postStarResponse(request('POST',{kind:'library'}),options);
    assert.equal(response.status,held?404:503);
    assert.equal((await response.json()).outcome,'not_dispatched');
    assert.equal(calls.provider.length,0);
  }
});
