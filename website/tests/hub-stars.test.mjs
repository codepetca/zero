import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import test from 'node:test';
import {hubConfig, newSession} from '../lib/hub-github-auth.mjs';
import {getStarResponse, postStarResponse, publicGithubRepository} from '../lib/hub-stars.mjs';

const now = 1_800_000_000_000;
const env = {NODE_ENV: 'test', ZERO_HUB_ORIGIN: 'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID: 'Iv1234567890', ZERO_HUB_GITHUB_CLIENT_SECRET: 'a'.repeat(32),
  ZERO_HUB_GITHUB_SESSION_SECRET: randomBytes(32).toString('base64url')};
const config = hubConfig(env);
const {session, cookie} = newSession('ghu_' + 'a'.repeat(24), {id: 123, login: 'student'}, 28800, config, now);
const sessionCookie = cookie.split(';')[0];
const resolver = async ({kind, id}) => kind === 'game' && id === 'drawing-pad' ?
  {kind, id, repositoryUrl: 'https://github.com/codepetca/zero-drawing-pad'} : null;
const request = (method, data, headers = {}) => new Request(`${config.origin}/api/hub/github/stars${method === 'GET' ? '?kind=game&id=drawing-pad' : ''}`,
  {method, headers: {Cookie: sessionCookie, ...(method === 'POST' ?
    {Origin: config.origin, 'X-Hub-CSRF': session.csrf, 'Content-Type': 'application/json'} : {}), ...headers},
  ...(method === 'POST' ? {body: JSON.stringify(data)} : {})});

test('repository target is an exact public GitHub owner/repo URL', () => {
  assert.deepEqual(publicGithubRepository('https://github.com/codepetca/zero-drawing-pad'),
    {owner: 'codepetca', repo: 'zero-drawing-pad'});
  for (const url of ['https://evil.test/o/r', 'http://github.com/o/r', 'https://github.com.evil.test/o/r',
    'https://github.com/o/r/issues', 'https://github.com/o/r?token=x', 'https://github.com/o/r.git',
    'https://u:p@github.com/o/r']) assert.equal(publicGithubRepository(url), null, url);
});

test('star state reads only canonical target and accepts GitHub 204/404', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({url, options}); return new Response(null, {status: calls.length === 1 ? 204 : 404}); };
  const first = await getStarResponse(request('GET'), {env, resolver, fetchImpl, now});
  const second = await getStarResponse(request('GET'), {env, resolver, fetchImpl, now});
  assert.deepEqual(await first.json(), {starred: true});
  assert.deepEqual(await second.json(), {starred: false});
  assert.equal(calls[0].url, 'https://api.github.com/user/starred/codepetca/zero-drawing-pad');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(first.headers.get('cache-control'), 'no-store');
});

test('star writes require origin and session CSRF before any GitHub request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(null, {status: 204}); };
  const data = {kind: 'game', id: 'drawing-pad', starred: true};
  assert.equal((await postStarResponse(request('POST', data, {Origin: 'https://evil.test'}),
    {env, resolver, fetchImpl, now})).status, 403);
  assert.equal((await postStarResponse(request('POST', data, {'X-Hub-CSRF': 'wrong'}),
    {env, resolver, fetchImpl, now})).status, 403);
  assert.equal(calls, 0);
});

test('desired state PUT and DELETE are idempotent and only confirmed 204 succeeds', async () => {
  const methods = [];
  const fetchImpl = async (_url, options) => { methods.push(options.method); return new Response(null, {status: 204}); };
  for (const starred of [true, true, false, false]) {
    const response = await postStarResponse(request('POST', {kind: 'game', id: 'drawing-pad', starred}),
      {env, resolver, fetchImpl, now});
    assert.deepEqual(await response.json(), {starred});
  }
  assert.deepEqual(methods, ['PUT', 'PUT', 'DELETE', 'DELETE']);
  const failed = await postStarResponse(request('POST', {kind: 'game', id: 'drawing-pad', starred: true}),
    {env, resolver, fetchImpl: async () => new Response(null, {status: 403}), now});
  assert.equal(failed.status, 502);
  assert.equal('starred' in await failed.json(), false);
});

test('rejects unknown and substituted projects before calling GitHub', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(null, {status: 204}); };
  const desired = {kind: 'game', id: 'drawing-pad', starred: true};
  const badTarget = async () => ({...desired, repositoryUrl: 'https://github.com.evil.test/o/r'});
  assert.equal((await postStarResponse(request('POST', {...desired, id: 'unknown'}),
    {env, resolver, fetchImpl, now})).status, 404);
  assert.equal((await postStarResponse(request('POST', desired),
    {env, resolver: badTarget, fetchImpl, now})).status, 404);
  assert.equal((await postStarResponse(request('POST', {...desired, starred: 'yes'}),
    {env, resolver, fetchImpl, now})).status, 400);
  assert.equal(calls, 0);
});

test('session expiry and missing configuration never make a GitHub request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(null, {status: 204}); };
  assert.equal((await getStarResponse(request('GET'), {env, resolver, fetchImpl,
    now: now + 8 * 60 * 60 * 1000})).status, 401);
  assert.equal((await getStarResponse(request('GET'), {env: {}, resolver, fetchImpl, now})).status, 503);
  assert.equal(calls, 0);
});


test('GitHub revocation clears the local session so the user can reconnect', async () => {
  const fetchImpl=async()=>new Response(null,{status:401});
  for(const response of [await getStarResponse(request('GET'),{env,resolver,fetchImpl,now}),
    await postStarResponse(request('POST',{kind:'game',id:'drawing-pad',starred:true}),{env,resolver,fetchImpl,now})]){
    assert.equal(response.status,401);
    assert.match(response.headers.get('set-cookie'),/zero_hub_gh_session=;.*Max-Age=0/);
    assert.equal('starred' in await response.json(),false);
  }
});
