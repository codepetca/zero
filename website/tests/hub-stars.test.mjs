import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import test from 'node:test';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig, newSession} from '../lib/hub-github-auth.mjs';
import {getStarResponse as getStar, postStarResponse as postStar, publicGithubRepository} from '../lib/hub-stars.mjs';

// All authority and destination observations are synthetic; never use a network default.
const binding = {repositoryUrl:'https://github.com/codepetca/zero-drawing-pad', repositoryId:'123',
  ownerId:'456', owner:'codepetca', repo:'zero-drawing-pad'};
const defaults = {visibilityReader:async () => null, destinationReader:async () => binding};
const getStarResponse = (request, options) => getStar(request, {...defaults, ...options});
const postStarResponse = (request, options) => postStar(request, {...defaults, ...options});

const now = 1_800_000_000_000;
const env = {NODE_ENV: 'test', ZERO_HUB_ORIGIN: 'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID: zeroApp.clientId, ZERO_HUB_GITHUB_CLIENT_SECRET: 'a'.repeat(32),
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

test('upstream star diagnostics classify access failures without logging credentials or arbitrary provider text', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const desired = {kind: 'game', id: 'drawing-pad', starred: true};
  const response = await postStarResponse(request('POST', desired), {env, resolver, now,
    fetchImpl: async () => Response.json({message: 'Resource not accessible by integration', token: session.token},
      {status: 403, headers: {'x-accepted-github-permissions': `metadata=read,starring=write,${session.token}`, 'x-ratelimit-remaining': '4999'}})});
  assert.equal(response.status, 502);
  assert.deepEqual(warnings.mock.calls[0].arguments, ['ZeroHub GitHub star failure', {
    stage: 'upstream', method: 'PUT', status: 403, reason: 'integration_access_denied',
    acceptedPermissions: ['metadata=read', 'starring=write'], rateLimitRemaining: 4999
  }]);
  assert.equal(JSON.stringify(warnings.mock.calls).includes(session.token), false);
  const large = await postStarResponse(request('POST', desired), {env, resolver, now,
    fetchImpl: async () => new Response('x'.repeat(20_000), {status: 502})});
  assert.equal(large.status, 502);
  assert.equal(warnings.mock.calls[1].arguments[1].reason, 'upstream_error');
});

test('transport diagnostics allow only known error codes and never log exception text', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const desired = {kind: 'game', id: 'drawing-pad', starred: true};
  for (const causeCode of ['UND_ERR_REQ_CONTENT_LENGTH_MISMATCH', session.token]) {
    const response = await postStarResponse(request('POST', desired), {env, resolver, now,
      fetchImpl: async () => { throw new Error(session.token, {cause: {code: causeCode}}); }});
    assert.equal(response.status, 502);
  }
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments[1]), [
    {stage: 'transport', method: 'PUT', code: 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH'},
    {stage: 'transport', method: 'PUT', code: 'unknown'}
  ]);
  assert.equal(JSON.stringify(warnings.mock.calls).includes(session.token), false);
});

const desired = {kind:'game', id:'drawing-pad', starred:true};
const visibleResolver = async input => ({...await resolver(input), repositoryId:'123', ownerId:'456'});
const decision = held => ({revision:'a'.repeat(40),observedAt:0, isHeld:() => held});
const never = () => new Promise(() => {});
const options = extra => ({env, now, resolver, responseBudgetMs:35, ...extra});

async function boundedResult(work) {
  let guard;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      guard = setTimeout(() => reject(new Error('Route did not honor its total deadline')), 1500);
    })]);
  } finally { clearTimeout(guard); }
}

function streamRequest(stream, signal) {
  return new Request(`${config.origin}/api/hub/github/stars`, {method:'POST', signal,
    headers:{Cookie:sessionCookie, Origin:config.origin, 'X-Hub-CSRF':session.csrf, 'Content-Type':'application/json'},
    body:stream, duplex:'half'});
}

test('star POST bounds a stalled incoming body and never resolves or dispatches a target', async () => {
  let cancelled = 0, resolved = 0, fetched = 0;
  const incoming = streamRequest(new ReadableStream({pull:never, cancel() { cancelled++; }}));
  const response = await boundedResult(postStarResponse(incoming, options({
    resolver:async () => { resolved++; }, fetchImpl:async () => { fetched++; }})));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {error:'GitHub star request unavailable', code:'hub_request_timeout', outcome:'not_dispatched'});
  assert.equal(cancelled, 1);
  assert.equal(resolved, 0);
  assert.equal(fetched, 0);
});

test('both star routes bound stalled authority and resolver stages without dispatching GitHub', async () => {
  for (const method of ['GET', 'POST']) {
    for (const stage of ['authority', 'resolver']) {
      let fetched = 0, resolved = 0, seenSignal;
      const run = method === 'GET' ? getStarResponse : postStarResponse;
      const response = await boundedResult(run(request(method, desired), options({
        visibilityReader:async ({signal}) => { seenSignal = signal; return stage === 'authority' ? never() : null; },
        resolver:async (_input, {signal}) => { resolved++; seenSignal = signal; return never(); },
        fetchImpl:async () => { fetched++; }
      })));
      assert.equal(response.status, 503, `${method}/${stage}`);
      assert.equal((await response.json()).code, 'hub_request_timeout');
      assert.equal(seenSignal.aborted, true);
      assert.equal(resolved, stage === 'authority' ? 0 : 1);
      assert.equal(fetched, 0);
    }
  }
});

test('one star request budget includes authority and resolver rather than resetting before GitHub', async () => {
  let clock = 0, fetched = 0;
  const response = await postStarResponse(request('POST', desired), options({responseBudgetMs:100,
    deadlineNow:() => clock,
    visibilityReader:async () => { clock += 40; return null; },
    resolver:async input => { clock += 30; return resolver(input); },
    fetchImpl:async () => { fetched++; return new Response(null, {status:204}); }
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'hub_request_timeout');
  assert.equal(fetched, 0);
});

test('a late resolver completion after expiry cannot dispatch a star mutation', async () => {
  let release, fetched = 0;
  const response = await boundedResult(postStarResponse(request('POST', desired), options({
    resolver:() => new Promise(resolve => { release = resolve; }),
    fetchImpl:async () => { fetched++; return new Response(null, {status:204}); }
  })));
  assert.equal(response.status, 503);
  release(await resolver(desired));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetched, 0);
});

test('request cancellation before dispatch bounds noncooperative work and prevents subsequent stages', async () => {
  const controller = new AbortController();
  let release, fetched = 0;
  const incoming = new Request(request('POST', desired), {signal:controller.signal});
  const pending = postStarResponse(incoming, options({responseBudgetMs:1000,
    resolver:() => new Promise(resolve => { release = resolve; controller.abort(new Error(session.token)); }),
    fetchImpl:async () => { fetched++; }
  }));
  const response = await boundedResult(pending);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {error:'GitHub star request unavailable', code:'hub_request_cancelled', outcome:'not_dispatched'});
  release(await resolver(desired));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetched, 0);
});

test('dispatched star mutations remain uncertain on timeout or cancellation even if GitHub later commits', async () => {
  for (const abort of [false, true]) {
    const controller = new AbortController();
    let release, calls = 0, committed = false, fetchSignal;
    const incoming = new Request(request('POST', desired), {signal:controller.signal});
    const response = await boundedResult(postStarResponse(incoming, options({
      responseBudgetMs:500,
      fetchImpl:async (_url, {signal}) => {
        calls++; fetchSignal = signal;
        if (abort) controller.abort(new Error(session.token));
        await new Promise(resolve => { release = resolve; });
        committed = true;
        return new Response(null, {status:204});
      }
    })));
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.outcome, 'uncertain');
    assert.equal(data.code, abort ? 'hub_request_cancelled' : 'hub_request_timeout');
    assert.match(data.error, /Check GitHub/);
    assert.equal(JSON.stringify(data).includes(session.token), false);
    assert.equal('starred' in data, false);
    assert.equal(fetchSignal.aborted, true);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(committed, true, 'abort does not prove GitHub rolled back');
    assert.equal(calls, 1, 'the route never retries a mutation');
  }
});

test('GitHub stalled fetch and error body share the deadline and cancel their owned response', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const method of ['GET','POST']) {
    for (const stage of ['fetch', 'error-body']) {
      let cancelStarted = false, fetchSignal;
      const run = method === 'GET' ? getStarResponse : postStarResponse;
      const response = await boundedResult(run(request(method, desired), options({
        fetchImpl:async (_url, {signal}) => {
          fetchSignal = signal;
          return stage === 'fetch' ? never() : new Response(new ReadableStream({pull:never,
            cancel() { cancelStarted = true; return never(); }}), {status:502});
        }
      })));
      assert.equal(response.status, 503, `${method}/${stage}`);
      const data = await response.json();
      assert.equal(data.code, 'hub_request_timeout');
      assert.equal(data.outcome, method === 'POST' ? 'uncertain' : undefined);
      assert.equal(fetchSignal.aborted, true);
      assert.equal(cancelStarted, stage === 'error-body');
    }
  }
});

test('a late GitHub response is discarded and never changes the returned timeout to success', async () => {
  let release, cancelStarted = false;
  const response = await boundedResult(getStarResponse(request('GET'), options({
    fetchImpl:() => new Promise(resolve => { release = resolve; })
  })));
  assert.equal(response.status, 503);
  release(new Response(new ReadableStream({cancel() { cancelStarted = true; }}), {status:404}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelStarted, true);
  assert.equal((await response.json()).code, 'hub_request_timeout');
});

test('fresh holds prevent star writes and suppress slow successful reads', async () => {
  let reads = 0, writes = 0;
  const beforeWrite = await postStarResponse(request('POST', desired), options({resolver:visibleResolver,
    visibilityReader:async () => decision(++reads >= 2),
    fetchImpl:async () => { writes++; return new Response(null, {status:204}); }
  }));
  assert.equal(beforeWrite.status, 404);
  assert.equal(writes, 0);
  let held = false;
  const response = await getStarResponse(request('GET'), options({resolver:visibleResolver,
    visibilityReader:async () => decision(held),
    fetchImpl:async () => { held = true; return new Response(null, {status:204}); }
  }));
  assert.equal(response.status, 404);
  assert.equal('starred' in await response.json(), false);
  const denied = await postStarResponse(request('POST', desired), options({resolver:visibleResolver,
    visibilityReader:async () => decision(false),
    fetchImpl:async () => { writes++; return new Response(null, {status:204}); }
  }));
  assert.equal(denied.status, 503);
  assert.equal((await denied.json()).outcome, 'not_dispatched');
  assert.equal(writes, 0);
});

test('late final authority checks cannot extend the star response budget', async () => {
  let reads = 0;
  const response = await boundedResult(getStarResponse(request('GET'), options({resolver:visibleResolver,
    visibilityReader:async () => ++reads === 3 ? never() : decision(false),
    fetchImpl:async () => new Response(null, {status:204})
  })));
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.code, 'hub_request_timeout');
  assert.equal('starred' in data, false);
});

test('authority completing after timeout cannot launch the resolver or a provider operation', async () => {
  let release, resolved = 0, fetched = 0;
  const response = await boundedResult(postStarResponse(request('POST', desired), options({
    visibilityReader:() => new Promise(resolve => { release = resolve; }),
    resolver:async input => { resolved++; return resolver(input); },
    fetchImpl:async () => { fetched++; return new Response(null, {status:204}); }
  })));
  assert.equal(response.status, 503);
  release(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, 0);
  assert.equal(fetched, 0);
});

test('explicit unconfirmed GitHub mutation responses tell clients not to assume a change', async t => {
  t.mock.method(console, 'warn', () => {});
  const response = await postStarResponse(request('POST', desired), options({
    fetchImpl:async () => Response.json({message:session.token}, {status:500})
  }));
  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.outcome, 'uncertain');
  assert.match(data.error, /Check GitHub/);
  assert.equal(JSON.stringify(data).includes(session.token), false);
});

test('every trusted pre-dispatch POST rejection explicitly retires only undispatched client attempts', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(null, {status:204}); };
  const failures = [
    {incoming:request('POST', desired), extra:{env:{}}},
    {incoming:request('POST', desired, {Origin:'https://evil.test'})},
    {incoming:request('POST', desired, {Cookie:''})},
    {incoming:request('POST', desired, {'X-Hub-CSRF':'wrong'})},
    {incoming:request('POST', desired, {'Content-Type':'text/plain'})},
    {incoming:request('POST', {...desired, starred:'yes'})},
    {incoming:request('POST', {...desired, id:'unknown'})},
    {incoming:request('POST', desired), extra:{resolver:async () => { throw new Error(session.token); }}},
    {incoming:request('POST', desired), extra:{visibilityReader:async () => { throw new Error(session.token); }}},
    {incoming:request('POST', desired), extra:{resolver:visibleResolver, visibilityReader:async () => decision(true)}},
    {incoming:request('POST', desired), extra:{responseBudgetMs:0}},
    {incoming:new Request(`${config.origin}/api/hub/github/stars`, {method:'POST',
      headers:request('POST', desired).headers, body:'{bad json'})},
    {incoming:request('POST', {kind:'game', id:'x'.repeat(3000), starred:true})}
  ];
  for (const {incoming, extra} of failures) {
    const response = await postStarResponse(incoming, options({fetchImpl, ...extra}));
    const data = await response.json();
    assert.equal(data.outcome, 'not_dispatched');
    assert.equal('starred' in data, false);
    assert.equal(JSON.stringify(data).includes(session.token), false);
  }
  assert.equal(calls, 0);
});
