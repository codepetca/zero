import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import test from 'node:test';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {
  callbackResponse, FLOW_COOKIE, hubConfig, loginResponse, logoutResponse, newSession,
  readFlow, readSession, safeHubReturnTo, sessionResponse, SESSION_COOKIE, unseal, sharedAppMatches
} from '../lib/hub-github-auth.mjs';

const now = 1_800_000_000_000;
const env = {NODE_ENV: 'test', ZERO_HUB_ORIGIN: 'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID: zeroApp.clientId, ZERO_HUB_GITHUB_CLIENT_SECRET: 'a'.repeat(32),
  ZERO_HUB_GITHUB_SESSION_SECRET: randomBytes(32).toString('base64url')};
const config = hubConfig(env);
const cookiePair = setCookie => setCookie.split(';')[0];
const withCookie = (url, cookie, headers = {}) => new Request(url, {headers: {Cookie: cookie, ...headers}});

test('configuration is explicit and local HTTP is limited to non-Vercel development or test', async () => {
  assert.equal((await sessionResponse(new Request('http://127.0.0.1:3000'), {}).json()).configured, false);
  assert.equal(hubConfig({...env, VERCEL: '1'}), null);
  assert.equal(hubConfig({...env, ZERO_HUB_ORIGIN: 'http://evil.example'}), null);
  assert.equal(hubConfig({...env, ZERO_HUB_GITHUB_SESSION_SECRET: 'weak'}), null);
  assert.equal(hubConfig({...env,ZERO_HUB_GITHUB_CLIENT_ID:'IvDifferentApp123'}),null);
  assert.equal(hubConfig(env).origin, 'http://127.0.0.1:3000');
  const production = hubConfig({...env, NODE_ENV: 'production', ZERO_HUB_ORIGIN: 'https://zero.codepet.ca'});
  assert.match(newSession('ghu_' + 'a'.repeat(24), {id: 1, login: 'person'}, 28800, production, now).cookie,
    /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
});

test('login creates bounded encrypted flow with PKCE and fixed callback origin', () => {
  const response = loginResponse(new Request('http://hostile.test/api/hub/github/login?returnTo=https://evil.test'), env, now);
  assert.equal(response.status, 303);
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.origin, 'https://github.com');
  assert.equal(destination.searchParams.get('redirect_uri'), `${config.origin}/api/hub/github/callback`);
  assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(destination.searchParams.get('code_challenge')?.length, 43);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=600/);
  assert.doesNotMatch(cookie, /evil\.test|code_challenge|verifier/);
  const flow = readFlow(withCookie('http://127.0.0.1:3000/', cookiePair(cookie)), config, now);
  assert.equal(flow.returnTo, '/hub');
  assert.equal(flow.state, destination.searchParams.get('state'));
  assert.equal(readFlow(withCookie('http://127.0.0.1:3000/', cookiePair(cookie)), config, now + 601_000), null);
  assert.equal(safeHubReturnTo('//evil.test'), '/hub');
  assert.equal(safeHubReturnTo('/hub?kind=game&id=drawing-pad'), '/hub?kind=game&id=drawing-pad');
});

test('callback checks state before exchanging code, clears flow, and sanitizes failures', async () => {
  const login = loginResponse(new Request('http://127.0.0.1:3000/api/hub/github/login?returnTo=%2Fhub%3Fkind%3Dgame'), env, now);
  const flowCookie = cookiePair(login.headers.get('set-cookie'));
  let calls = 0;
  const bad = await callbackResponse(withCookie('http://hostile.test/callback?state=wrong&code=validcode12345', flowCookie),
    env, async () => { calls++; throw new Error('must not call'); }, now);
  assert.equal(calls, 0);
  assert.equal(bad.status, 303);
  assert.equal(new URL(bad.headers.get('location')).searchParams.get('github'), 'invalid');
  assert.match(bad.headers.get('set-cookie'), /Max-Age=0/);
  const deniedWithoutState = await callbackResponse(withCookie('http://hostile.test/callback?error=access_denied', flowCookie),
    env, async () => { calls++; throw new Error('must not call'); }, now);
  assert.equal(new URL(deniedWithoutState.headers.get('location')).searchParams.get('github'), 'invalid');
  assert.equal(calls, 0);
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const fakeFetch = async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    if (url.includes('access_token')) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('redirect_uri'), `${config.origin}/api/hub/github/callback`);
      assert.equal(body.get('code_verifier')?.length, 43);
      return Response.json({access_token: 'ghu_' + 'a'.repeat(24), token_type: 'bearer', expires_in: 28800});
    }
    assert.equal(url, 'https://api.github.com/user');
    return Response.json({id: 12345, login: 'student-1'});
  };
  const good = await callbackResponse(withCookie(`http://hostile.test/callback?state=${state}&code=validcode12345`, flowCookie),
    env, fakeFetch, now);
  assert.equal(calls, 2);
  assert.equal(good.headers.get('location'), `${config.origin}/hub?kind=game`);
  assert.equal(good.headers.getSetCookie().length, 2);
  assert.doesNotMatch(good.headers.get('location'), /ghu_|csrf|secret/);
  const sessionCookie = cookiePair(good.headers.getSetCookie().find(value => value.startsWith(SESSION_COOKIE)));
  const session = readSession(withCookie(`${config.origin}/hub`, sessionCookie), config, now);
  assert.equal(session.login, 'student-1');
  assert.equal(readSession(withCookie(`${config.origin}/hub`, sessionCookie), config, now + 8 * 60 * 60 * 1000), null);
  assert.doesNotMatch(sessionCookie, /ghu_|student-1/);
});

test('tampered and expired sessions are rejected; session response exposes only identity and CSRF', async () => {
  const {session, cookie} = newSession('ghu_' + 'b'.repeat(24), {id: 44, login: 'person'}, 7200, config, now);
  const pair = cookiePair(cookie);
  const request = withCookie(`${config.origin}/api/hub/github/session`, pair);
  assert.deepEqual(await sessionResponse(request, env, now).json(),
    {configured: true, user: {id: '44', login: 'person', csrfToken: session.csrf}});
  assert.equal(readSession(request, config, now + 7200_000), null);
  const tampered = pair.slice(0, -1) + (pair.endsWith('A') ? 'B' : 'A');
  assert.equal(readSession(withCookie(`${config.origin}/`, tampered), config, now), null);
  assert.equal(unseal(pair.split('=')[1], 'flow', config), null);
  assert.equal(sessionResponse(request, env, now).headers.get('cache-control'), 'no-store');
});

test('logout requires same origin and session CSRF, then clears the cookie', async () => {
  const {session, cookie} = newSession('ghu_' + 'b'.repeat(24), {id: 44, login: 'person'}, 7200, config, now);
  const pair = cookiePair(cookie);
  const request = origin => withCookie(`${config.origin}/api/hub/github/logout`, pair,
    {Origin: origin, 'X-Hub-CSRF': session.csrf});
  assert.equal(logoutResponse(request('https://evil.test'), env, now).status, 403);
  assert.equal(logoutResponse(withCookie(`${config.origin}/logout`, pair,
    {Origin: config.origin, 'X-Hub-CSRF': 'wrong'}), env, now).status, 403);
  const done = logoutResponse(request(config.origin), env, now);
  assert.equal(done.status, 200);
  assert.match(done.headers.get('set-cookie'), /Max-Age=0/);
});


test('an expired mounted account gets logout401 and anonymous session for UI recovery',async()=>{
  const {session,cookie}=newSession('ghu_'+'c'.repeat(24),{id:55,login:'student'},120,config,now);
  const expired=now+120_000;
  const request=withCookie(`${config.origin}/api/hub/github/logout`,cookiePair(cookie),{Origin:config.origin,'X-Hub-CSRF':session.csrf});
  assert.equal(logoutResponse(request,env,expired).status,401);
  assert.equal((await sessionResponse(request,env,expired).json()).user,null);
});


test('the website client ID matches the reviewed native App once configured',()=>{
  const configured={status:'configured',clientId:'Iv1234567890'};
  assert.equal(sharedAppMatches('Iv1234567890',configured),true);
  assert.equal(sharedAppMatches('IvDifferent123',configured),false);
  assert.equal(sharedAppMatches('Iv1234567890',{status:'broken'}),false);
});
