import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import zeroApp from '../../extension/src/github-app/config.json' with {type: 'json'};
import {seal, unseal} from '../lib/hub-github-auth.mjs';
import {callbackResponse, desktopConfig, exchangeResponse, loginResponse, refreshResponse, startResponse}
  from '../lib/desktop-github-auth.mjs';

const now = 1800000000000;
const origin = 'https://zero.codepet.ca';
const path = '/api/desktop/github';
const env = {NODE_ENV: 'test', ZERO_DESKTOP_GITHUB_ENABLED: '1', ZERO_HUB_ORIGIN: origin,
  ZERO_HUB_GITHUB_CLIENT_ID: zeroApp.clientId, ZERO_HUB_GITHUB_CLIENT_SECRET: 'private-client-secret-12345',
  ZERO_HUB_GITHUB_SESSION_SECRET: 'ab'.repeat(32)};
const config = desktopConfig(env);
const verifier = 'v'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const nonce = 'n'.repeat(43);
const code = 'github_code_12345';
const input = {port: 49152, nonce, codeChallenge: challenge};
const pair = {access_token: 'ghu_' + 'a'.repeat(40), refresh_token: 'ghr_' + 'r'.repeat(40),
  token_type: 'bearer', scope: '', expires_in: 28800, refresh_token_expires_in: 15897600};
const noNetwork = async () => { throw new Error('Unexpected network request'); };
const post = (route, data, headers = {}) => new Request(`${origin}${path}/${route}`, {method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-Zero-Desktop': '1', ...headers}, body: JSON.stringify(data)});
const get = (route, query = '', cookie) => new Request(`${origin}${path}/${route}${query}`, {
  headers: cookie ? {Cookie: cookie} : {}});
const cookiePair = response => response.headers.get('set-cookie').split(';')[0];
const changed = value => (value[0] === 'A' ? 'B' : 'A') + value.slice(1);

async function flow(options = {}) {
  const start = await startResponse(post('start', {...input, ...options}), env, noNetwork, now);
  assert.equal(start.status, 200);
  const started = await start.json();
  const ticket = new URL(started.url).searchParams.get('ticket');
  const login = loginResponse(new Request(started.url), env, noNetwork, now);
  assert.equal(login.status, 303);
  const authorize = new URL(login.headers.get('location'));
  const state = authorize.searchParams.get('state');
  return {started, ticket, login, authorize, state, cookie: cookiePair(login)};
}
async function handoff() {
  const started = await flow();
  const callback = callbackResponse(get('callback', `?state=${started.state}&code=${code}`, started.cookie),
    env, noNetwork, now);
  assert.equal(callback.status, 303);
  const destination = new URL(callback.headers.get('location'));
  return {...started, callback, destination, delivery: destination.searchParams.get('ticket')};
}
function protections(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
}

test('desktop auth is disabled by default and pins existing App and production origin', async () => {
  for (const mutation of [{ZERO_DESKTOP_GITHUB_ENABLED: undefined}, {ZERO_DESKTOP_GITHUB_ENABLED: 'true'},
    {ZERO_HUB_GITHUB_CLIENT_SECRET: ''}, {ZERO_HUB_GITHUB_SESSION_SECRET: 'bad'},
    {ZERO_HUB_GITHUB_CLIENT_ID: 'Iv_wrongclient123'}, {ZERO_HUB_ORIGIN: 'https://attacker.test'},
    {ZERO_HUB_ORIGIN: `${origin}/arbitrary`}, {ZERO_HUB_ORIGIN: 'http://127.0.0.1:3000', NODE_ENV: 'production'},
    {ZERO_HUB_ORIGIN: 'http://127.0.0.1:3000', VERCEL: '1'}]) {
    const disabled = {...env, ...mutation};
    assert.equal(desktopConfig(disabled), null);
    for (const [route, handler] of [['start', startResponse], ['login', loginResponse],
      ['callback', callbackResponse], ['exchange', exchangeResponse], ['refresh', refreshResponse]]) {
      const response = await handler(post(route, {}), disabled, noNetwork, now);
      assert.equal(response.status, 503);
      protections(response);
      assert.deepEqual(await response.json(), {error: 'GitHub sign-in unavailable', configured: false});
    }
  }
  assert.equal(desktopConfig({...env, ZERO_HUB_ORIGIN: 'http://127.0.0.1:3000'}).origin,
    'http://127.0.0.1:3000');
  assert.equal(desktopConfig({...env, ZERO_HUB_ORIGIN: 'http://localhost:3000'}), null);
});

test('start enforces headers, Origin, content type, strict keys and field bounds', async () => {
  for (const headers of [{'X-Zero-Desktop': ''}, {'X-Zero-Desktop': '1,1'},
    {'Content-Type': 'application/x-www-form-urlencoded'}, {Origin: 'https://attacker.test'}, {Origin: 'null'}]) {
    const response = await startResponse(post('start', input, headers), env, noNetwork, now);
    assert.equal(response.status, 403);
    protections(response);
  }
  for (const data of [null, [], {}, {...input, port: '49152'}, {...input, port: 1023},
    {...input, port: 65536}, {...input, port: 49152.1}, {...input, nonce: 'x'.repeat(42)},
    {...input, nonce: '../' + 'x'.repeat(40)}, {...input, codeChallenge: 'x'.repeat(44)},
    {...input, clientId: 'other'}, {...input, scope: 'repo'}, {...input, returnTo: 'https://attacker.test'}]) {
    assert.equal((await startResponse(post('start', data), env, noNetwork, now)).status, 400);
  }
  for (const port of [1024, 65535]) {
    const response = await startResponse(post('start', {...input, port}, {Origin: origin,
      'Content-Type': 'application/json; charset=utf-8'}), env, noNetwork, now);
    assert.equal(response.status, 200);
    protections(response);
  }
  const wrongMethod = await startResponse(get('start'), env, noNetwork, now);
  assert.equal(wrongMethod.status, 405);
});

test('all POST routes enforce actual body bounds, malformed JSON and duplicate keys', async () => {
  for (const [route, handler] of [['start', startResponse], ['exchange', exchangeResponse], ['refresh', refreshResponse]]) {
    for (const [body, headers, status] of [['x'.repeat(8193), {}, 413], ['{}', {'Content-Length': '8193'}, 413],
      ['{}', {'Content-Length': 'oops'}, 413], ['{', {}, 400], ['null', {}, 400],
      ['{"refreshToken":"one","refreshToken":"two"}', {}, 400],
      ['{"nonce":"one","n\\u006fnce":"two"}', {}, 400]]) {
      const request = new Request(`${origin}${path}/${route}`, {method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Zero-Desktop': '1', ...headers}, body});
      assert.equal((await handler(request, env, noNetwork, now)).status, status);
    }
    const streamed = new ReadableStream({start(controller) {
      controller.enqueue(new Uint8Array(4096)); controller.enqueue(new Uint8Array(4097)); controller.close();
    }});
    const request = new Request(`${origin}${path}/${route}`, {method: 'POST', duplex: 'half',
      headers: {'Content-Type': 'application/json', 'X-Zero-Desktop': '1'}, body: streamed});
    assert.equal((await handler(request, env, noNetwork, now)).status, 413);
    assert.equal((await handler(post(route, {}, {Origin: 'https://attacker.test'}), env, noNetwork, now)).status, 403);
    assert.equal((await handler(post(route, {}, {'X-Zero-Desktop': ''}), env, noNetwork, now)).status, 403);
  }
});

test('login binds the fixed GitHub callback, PKCE, scope and isolated per-flow cookie', async () => {
  const first = await flow(), second = await flow();
  assert.equal(first.started.clientId, zeroApp.clientId);
  assert.equal(new URL(first.started.url).origin, origin);
  assert.equal(new URL(first.started.url).pathname, `${path}/login`);
  assert.equal(first.authorize.origin, 'https://github.com');
  assert.equal(first.authorize.pathname, '/login/oauth/authorize');
  assert.equal(first.authorize.searchParams.get('client_id'), zeroApp.clientId);
  assert.equal(first.authorize.searchParams.get('redirect_uri'), `${origin}${path}/callback`);
  assert.equal(first.authorize.searchParams.get('code_challenge'), challenge);
  assert.equal(first.authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(first.authorize.searchParams.get('scope'), 'offline_access');
  assert.notEqual(first.cookie.split('=')[0], second.cookie.split('=')[0]);
  assert.match(first.login.headers.get('set-cookie'), /Path=\/api\/desktop\/github; HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.doesNotMatch(first.cookie, /zero_hub|ghu_|ghr_/);
  assert.equal(unseal(first.ticket, 'flow', config), null);
  assert.equal(unseal(first.state, 'session', config), null);
  assert.equal(loginResponse(get('login', `?ticket=${first.state}`), env, noNetwork, now).status, 400);
  assert.equal(loginResponse(get('login', `?ticket=${changed(first.ticket)}`), env, noNetwork, now).status, 400);
  assert.equal(loginResponse(get('login', `?ticket=${first.ticket}&ticket=${first.ticket}`), env, noNetwork, now).status, 400);
  assert.equal(loginResponse(get('login', `?ticket=${first.ticket}&returnTo=https://attacker.test`), env, noNetwork, now).status, 400);
  assert.equal(loginResponse(get('login', `?ticket=${first.ticket}`), env, noNetwork, now + 600000).status, 400);
  protections(first.login);
});

test('callback delivers only code and sealed ticket to the intent loopback path and clears the flow', async () => {
  const {callback, destination, delivery} = await handoff();
  assert.equal(destination.origin, `http://127.0.0.1:${input.port}`);
  assert.equal(destination.pathname, `/github/${nonce}`);
  assert.deepEqual([...destination.searchParams.keys()], ['code', 'ticket']);
  assert.equal(destination.searchParams.get('code'), code);
  assert.doesNotMatch(destination.toString(), /ghu_|ghr_|private-client|code_verifier|zero_hub/);
  assert.match(callback.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(unseal(delivery, 'desktop-state', config), null);
  const data = unseal(delivery, 'desktop-delivery', config);
  assert.equal(data.expiresAt - data.issuedAt, 120000);
  assert.equal(data.clientId, zeroApp.clientId);
  assert.equal(data.nonce, nonce);
  assert.equal(data.codeHash, createHash('sha256').update(code).digest('base64url'));
  assert.equal(data.codeChallenge, challenge);
  protections(callback);
});

test('callback rejects tampered, expired, duplicate, missing and cross-flow CSRF without redirect', async () => {
  const first = await flow(), second = await flow();
  const variants = [
    [`?state=${first.state}&code=${code}`, undefined, now],
    [`?state=${first.state}&code=${code}`, second.cookie, now],
    [`?state=${first.state}&code=${code}`, first.cookie + '; ' + first.cookie, now],
    [`?state=${changed(first.state)}&code=${code}`, first.cookie, now],
    [`?state=${first.ticket}&code=${code}`, first.cookie, now],
    [`?state=${first.state}&code=${code}`, first.cookie, now + 600000],
    [`?state=${first.state}&state=${first.state}&code=${code}`, first.cookie, now],
    [`?state=${first.state}&code=${code}&code=${code}`, first.cookie, now],
    [`?state=${first.state}&code=bad%2Fcode`, first.cookie, now],
    [`?state=${first.state}`, first.cookie, now],
    [`?state=${first.state}&error=access_denied&code=${code}`, first.cookie, now],
    [`?state=${first.state}&error=access_denied&error=access_denied`, first.cookie, now],
    ['?error=access_denied&port=65535&nonce=attacker', first.cookie, now]
  ];
  for (const [query, cookie, time] of variants) {
    const response = callbackResponse(get('callback', query, cookie), env, noNetwork, time);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
    protections(response);
    assert.doesNotMatch(await response.text(), /private-client|ghu_|ghr_|attacker/);
  }
  const denial = callbackResponse(get('callback', `?state=${first.state}&error=access_denied`, first.cookie),
    env, noNetwork, now);
  assert.equal(denial.status, 303);
  assert.equal(denial.headers.get('location'), `http://127.0.0.1:${input.port}/github/${nonce}?error=denied`);
  assert.match(denial.headers.get('set-cookie'), /Max-Age=0/);
});

test('sealed but malformed/future/wrong-App intents cannot authorize arbitrary return targets', () => {
  const intent = {flowId: 'f'.repeat(43), ...input, clientId: zeroApp.clientId,
    issuedAt: now, expiresAt: now + 600000};
  for (const mutation of [{port: 80}, {port: '49152'}, {nonce: '../attacker'},
    {clientId: 'wrong'}, {issuedAt: now + 1}, {expiresAt: now + 600001},
    {returnTo: 'https://attacker.test'}, {codeChallenge: 'bad'}]) {
    const ticket = seal({...intent, ...mutation}, 'desktop-intent', config);
    assert.equal(loginResponse(get('login', `?ticket=${ticket}`), env, noNetwork, now).status, 400);
  }
});

test('exchange binds code and verifier before server-secret token exchange and returns only raw pair fields', async () => {
  const {delivery} = await handoff();
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Accept, 'application/json');
    const data = new URLSearchParams(options.body);
    assert.equal(data.get('client_id'), zeroApp.clientId);
    assert.equal(data.get('client_secret'), env.ZERO_HUB_GITHUB_CLIENT_SECRET);
    assert.equal(data.get('code'), code);
    assert.equal(data.get('code_verifier'), verifier);
    assert.equal(data.get('redirect_uri'), `${origin}${path}/callback`);
    assert.equal(data.has('scope'), false);
    return Response.json({...pair, client_secret: env.ZERO_HUB_GITHUB_CLIENT_SECRET, unknown: 'not returned'});
  };
  const response = await exchangeResponse(post('exchange', {code, codeVerifier: verifier, ticket: delivery}),
    env, fakeFetch, now);
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  protections(response);
  assert.deepEqual(await response.json(), pair);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('exchange rejects PKCE/code/ticket tampering, expiry, duplicate/unknown keys and wrong purpose before fetch', async () => {
  const {delivery, ticket, state} = await handoff();
  const valid = {code, codeVerifier: verifier, ticket: delivery};
  for (const mutation of [{code: 'other_code_12345'}, {code: 'bad/code12345'}, {code: 'c'.repeat(257)},
    {codeVerifier: 'w'.repeat(43)}, {codeVerifier: 'v'.repeat(42)}, {codeVerifier: 'v'.repeat(129)},
    {codeVerifier: verifier + '/'}, {ticket: changed(delivery)}, {ticket}, {ticket: state},
    {clientId: 'other'}, {scope: 'repo'}, {ticket: undefined}]) {
    const response = await exchangeResponse(post('exchange', {...valid, ...mutation}), env, noNetwork, now);
    assert.equal(response.status, 400);
  }
  assert.equal((await exchangeResponse(post('exchange', valid), env, noNetwork, now + 120000)).status, 400);
  const payload = unseal(delivery, 'desktop-delivery', config);
  for (const mutation of [{clientId: 'wrong'}, {issuedAt: now + 1}, {expiresAt: now + 120001},
    {nonce: '../bad'}, {codeHash: 'wrong'}, {codeChallenge: 'wrong'}, {extra: true}]) {
    const altered = seal({...payload, ...mutation}, 'desktop-delivery', config);
    assert.equal((await exchangeResponse(post('exchange', {...valid, ticket: altered}), env, noNetwork, now)).status, 400);
  }
});

test('a repeated delivery relies on GitHub one-use code enforcement and surfaces only generic failure', async () => {
  const {delivery} = await handoff();
  let calls = 0;
  const fakeFetch = async () => ++calls === 1 ? Response.json(pair) :
    Response.json({error: 'bad_verification_code', error_description: env.ZERO_HUB_GITHUB_CLIENT_SECRET});
  const data = {code, codeVerifier: verifier, ticket: delivery};
  assert.equal((await exchangeResponse(post('exchange', data), env, fakeFetch, now)).status, 200);
  const replay = await exchangeResponse(post('exchange', data), env, fakeFetch, now);
  assert.equal(replay.status, 502);
  assert.deepEqual(await replay.json(), {error: 'GitHub sign-in failed'});
  assert.equal(calls, 2);
});

test('refresh sends rotating token only to the fixed GitHub endpoint with the server secret', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    assert.equal(options.redirect, 'error');
    const data = new URLSearchParams(options.body);
    assert.deepEqual(Object.fromEntries(data), {client_id: zeroApp.clientId,
      client_secret: env.ZERO_HUB_GITHUB_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: pair.refresh_token});
    return Response.json(pair);
  };
  const response = await refreshResponse(post('refresh', {refreshToken: pair.refresh_token}), env, fakeFetch, now);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), pair);
  assert.equal(calls, 1);
  protections(response);
  for (const data of [{refreshToken: pair.access_token}, {refreshToken: 'ghr_bad'},
    {refreshToken: pair.refresh_token, clientId: zeroApp.clientId}, {refreshToken: pair.refresh_token, scope: 'repo'}])
    assert.equal((await refreshResponse(post('refresh', data), env, noNetwork, now)).status, 400);
});

test('exchange and refresh reject invalid/nonexpiring pairs, oversized/failed GitHub responses without leaking secrets', async () => {
  const {delivery} = await handoff();
  const handlers = [[exchangeResponse, 'exchange', {code, codeVerifier: verifier, ticket: delivery}],
    [refreshResponse, 'refresh', {refreshToken: pair.refresh_token}]];
  for (const [handler, route, data] of handlers) {
    for (const mutation of [{access_token: 'gho_unapproved'}, {refresh_token: 'ghu_wrong'},
      {token_type: 'mac'}, {scope: 'repo'}, {scope: undefined}, {expires_in: 0}, {expires_in: 28801},
      {expires_in: '28800'}, {refresh_token_expires_in: 0}, {refresh_token_expires_in: 15897601},
      {refresh_token_expires_in: undefined}, {error: 'bad_verification_code'}]) {
      const response = await handler(post(route, data), env, async () => Response.json({...pair, ...mutation}), now);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {error: 'GitHub sign-in failed'});
    }
    for (const fakeFetch of [async () => { throw new Error(env.ZERO_HUB_GITHUB_CLIENT_SECRET); },
      async () => Response.json({error: env.ZERO_HUB_GITHUB_CLIENT_SECRET}, {status: 401}),
      async () => new Response('not JSON ' + env.ZERO_HUB_GITHUB_CLIENT_SECRET),
      async () => new Response('x'.repeat(16385)), async () => Response.json(null)]) {
      const response = await handler(post(route, data), env, fakeFetch, now);
      assert.equal(response.status, 502);
      protections(response);
      assert.deepEqual(await response.json(), {error: 'GitHub sign-in failed'});
    }
  }
});
