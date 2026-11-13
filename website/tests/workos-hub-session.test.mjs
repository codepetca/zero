import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {sealData, unsealData} from 'iron-session';
import {SignJWT, decodeJwt} from 'jose';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {callbackResponse, hubConfig, loginResponse, logoutResponse, newSession, readSession, rejectedGitHubSession, removeManagedGitHubGrant,
  sessionResponse} from '../lib/hub-github-auth.mjs';
import {getStarResponse, postStarResponse} from '../lib/hub-stars.mjs';
import {getJamResponse, getJamsResponse, postJamActionResponse, postJamProposalResponse,
  postJamSettlementResponse} from '../lib/jams-http.mjs';
import {createWorkOSHubSession} from '../lib/workos-github-binding.mjs';

const now = 1_800_000_000_000;
const origin = 'http://localhost:3000';
const issuer = 'https://api.workos.com/user_management/client_Test';
const env = {NODE_ENV:'test', ZERO_WORKOS_ENABLED:'true', WORKOS_CLIENT_ID:'client_Test',
  WORKOS_COOKIE_PASSWORD:'workos-test-password-only'.repeat(2), WORKOS_COOKIE_NAME:'zero-workos-session',
  WORKOS_ISSUER:issuer, NEXT_PUBLIC_WORKOS_REDIRECT_URI:`${origin}/zero-account/callback`,
  ZERO_HUB_ORIGIN:origin, ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,
  ZERO_HUB_GITHUB_CLIENT_SECRET:'synthetic-test-app-secret', ZERO_HUB_GITHUB_SESSION_SECRET:'a'.repeat(64),
  ZERO_JAMS_ENABLED:'1'};
const legacyEnv = {...env, ZERO_WORKOS_ENABLED:'', ZERO_HUB_ORIGIN:'http://127.0.0.1:3000'};
const config = hubConfig(env);
const token = `ghu_${'s'.repeat(24)}`;
const workosToken = 'synthetic-workos-access-token';
const claims = {sub:'user_Test123', sid:'session_Original', iss:issuer, exp:now / 1000 + 120};
const auth = {user:{id:claims.sub}, sessionId:claims.sid, accessToken:workosToken};
const callback = {user:auth.user, authenticationMethod:'GitHubOAuth', accessToken:workosToken,
  oauthTokens:{accessToken:token, expiresAt:now / 1000 + 300, refreshToken:'never-retained'}};
const githubUser = {id:123, login:'student', type:'User'};
const verify = async accessToken => {assert.equal(accessToken, workosToken); return claims;};
const github = async url => {
  if (url === `https://api.github.com/applications/${zeroApp.clientId}/token`)
    return Response.json({app:{client_id:zeroApp.clientId},user:githubUser});
  assert.equal(url, 'https://api.github.com/user');
  return Response.json(githubUser);
};
const grant = () => createWorkOSHubSession(callback, verify, {env,fetchImpl:github,now:() => now});
const cookiePair = cookie => cookie.split(';')[0];

test('managed flow verifies callback subject, issuer, session, GitHub App and lifetime before minting', async () => {
  const result = await grant();
  assert.deepEqual(result.session.workos, {userId:claims.sub,sessionId:claims.sid,issuer});
  assert.equal(result.session.expiresAt, now + 240_000);
  assert.doesNotMatch(result.cookie, /synthetic-workos-access-token|never-retained|ghu_/);
  const unexpected = async () => assert.fail('GitHub proof must follow the verified WorkOS claims');
  for (const patch of [{sub:'user_Other'}, {sid:undefined}, {iss:'https://other.test'}, {exp:now / 1000}]) {
    assert.equal(await createWorkOSHubSession(callback, async () => ({...claims,...patch}),
      {env,fetchImpl:unexpected,now:() => now}), null);
  }
  for (const expiresAt of [undefined, now / 1000 + 60, '1800000300']) {
    assert.equal(await createWorkOSHubSession({...callback,oauthTokens:{...callback.oauthTokens,expiresAt}}, verify,
      {env,fetchImpl:github,now:() => now}), null);
  }
  assert.equal(await createWorkOSHubSession(callback, verify, {env,now:() => now,
    fetchImpl:async () => Response.json({app:{client_id:'IvOtherApp'},user:githubUser})}), null);
});

test('the same WorkOS callback can use the expiry confirmed by the pinned GitHub App', async () => {
  const withoutExpiry = {...callback, oauthTokens:{...callback.oauthTokens, expiresAt:undefined}};
  const checkWith = expires_at => async url => {
    if (url === `https://api.github.com/applications/${zeroApp.clientId}/token`)
      return Response.json({app:{client_id:zeroApp.clientId},user:githubUser,expires_at});
    return github(url);
  };
  const active = await createWorkOSHubSession(withoutExpiry, verify, {
    env,fetchImpl:checkWith(new Date(now + 300_000).toISOString()),now:() => now,
  });
  assert.equal(active.session.expiresAt, now + 240_000);
  for (const expiry of [null, 'unknown', new Date(now + 60_000).toISOString(), new Date(now + 86_400_000).toISOString()]) {
    assert.equal(await createWorkOSHubSession(callback, verify, {
      env,fetchImpl:checkWith(expiry),now:() => now,
    }), null);
  }
});

test('managed mode sends Hub sign-in through AuthKit and blocks fallback to the legacy flow', async () => {
  const request = new Request(`${origin}/api/hub/github/login?returnTo=%2Fhub%2Fjams%3Fgithub%3Dfailed`);
  const response = loginResponse(request, env, now);
  const target = new URL(response.headers.get('location'));
  assert.equal(target.pathname, '/zero-account/sign-in');
  assert.equal(target.searchParams.get('returnTo'), '/hub/jams');
  assert.equal(response.headers.has('set-cookie'), false);
  const legacy = loginResponse(request, legacyEnv, now);
  assert.equal(new URL(legacy.headers.get('location')).hostname, 'github.com');
  assert.equal(loginResponse(request, {...env,WORKOS_ISSUER:''}, now).status, 503);
  assert.equal(loginResponse(request, {...env,ZERO_HUB_ORIGIN:'https://zero.codepet.ca'}, now).status, 503);
  const staleFlow = new URL(legacy.headers.get('location')).searchParams.get('state');
  let exchanges = 0;
  const oldCallback = new Request(`${origin}/api/hub/github/callback?state=${staleFlow}&code=code123456789`,
    {headers:{cookie:cookiePair(legacy.headers.get('set-cookie'))}});
  const denied = await callbackResponse(oldCallback, env, async () => {exchanges++; return Response.json({});}, now);
  assert.equal(exchanges, 0);
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('github'), 'unavailable');
});

test('Zero account preserves its identity response and only exposes a GitHub avatar in the profile', async () => {
  let auth;
  const modules = {
    '@workos-inc/authkit-nextjs':{withAuth:async () => auth},
    '@/lib/workos-config.mjs':{workosConfigured:() => true},
  };
  async function load(path) {
    const source = await readFile(new URL(`../app/api/zero-account/${path}`,import.meta.url),'utf8');
    const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module = {exports:{}};
    vm.runInNewContext(compiled,{module,exports:module.exports,require:name => modules[name],Response});
    return module.exports;
  }
  modules['../account-response'] = await load('account-response.ts');
  const profile = await load('profile/route.ts');
  const session = await load('session/route.ts');
  async function get(route, user, impersonator = null) {
    auth = {user, impersonator, accessToken:workosToken};
    const response = await route.GET();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  const user = {id:'user_Test123', profilePictureUrl:'https://avatars.githubusercontent.com/u/123?v=4'};
  assert.deepEqual(await get(session,user),{configured:true,user:{id:user.id}});
  assert.deepEqual(await get(profile,user),{configured:true,user:{avatarId:'123'}});
  for (const profilePictureUrl of [null, 'https://other.test/u/123',
    'https://avatars.githubusercontent.com@other.test/u/123', 'https://avatars.githubusercontent.com/u/123/extra']) {
    assert.deepEqual(await get(profile,{...user,profilePictureUrl}),{configured:true,user:{avatarId:null}});
  }
  assert.deepEqual(await get(profile,null),{configured:true,user:null});
  assert.deepEqual(await get(profile,user,{}),{configured:true,user:null});
});

test('managed sign-out recovers an expired session ID from a sealed cookie and clears both sessions', async () => {
  const source = await readFile(new URL('../app/zero-account/sign-out/route.ts',import.meta.url),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};let logoutCalls = 0;
  const logoutUrl = 'https://api.workos.com/user_management/sessions/logout?session_id=session_Original';
  const modules = {
    '@workos-inc/authkit-nextjs':{getWorkOS:() => ({userManagement:{getLogoutUrl:({sessionId}) => {
      logoutCalls++;assert.equal(sessionId,'session_Original');return logoutUrl;
    }}})},
    'iron-session':{unsealData},'jose':{decodeJwt},
    'next/headers':{cookies:async () => ({getAll:() => [{name:'wos-auth-verifier-flow1'},{name:'unrelated'}]})},
    '@/lib/hub-github-auth.mjs':await import('../lib/hub-github-auth.mjs'),
    '@/lib/workos-config.mjs':{workosConfigured:() => true},
  };
  vm.runInNewContext(compiled,{module,exports:module.exports,require:name => modules[name],process:{env},URL,Response});
  const expiredToken = await new SignJWT({sid:'session_Original'}).setProtectedHeader({alg:'HS256'})
    .setExpirationTime(1).sign(new TextEncoder().encode('synthetic-signing-key-only-32-bytes'));
  assert.ok(decodeJwt(expiredToken).exp < Math.floor(Date.now()/1000));
  const seal = async accessToken => sealData({accessToken},{password:env.WORKOS_COOKIE_PASSWORD,ttl:0});
  const expiredCookie = await seal(expiredToken);
  const post = (from, cookie = expiredCookie) => module.exports.POST(new Request(`${origin}/zero-account/sign-out`,{method:'POST',
    headers:{origin:from,cookie:`zero-workos-session=${cookie}`}}));
  assert.equal((await post('https://other.test')).status,403);assert.equal(logoutCalls,0);
  const response = await post(origin);
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),logoutUrl);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(logoutCalls,1);
  const removed = response.headers.getSetCookie();
  assert.deepEqual(removed.map(cookie => cookie.split('=')[0]),
    ['zero_hub_gh_session','zero_hub_gh_flow','zero-workos-session','wos-auth-verifier-flow1']);
  assert.ok(removed.every(cookie => cookie.includes('Max-Age=0')));
  const badSidToken = await new SignJWT({sid:'session_Original?bad'}).setProtectedHeader({alg:'HS256'})
    .sign(new TextEncoder().encode('synthetic-signing-key-only-32-bytes'));
  const foreignCookie = await sealData({accessToken:expiredToken},{password:'different-password-only'.repeat(2),ttl:0});
  for (const invalid of ['not-a-sealed-cookie',foreignCookie,await seal('invalid-jwt'),await seal(badSidToken)]) {
    const fallback = await post(origin,invalid);
    assert.equal(fallback.status,303);assert.equal(fallback.headers.get('location'),`${origin}/`);
    assert.deepEqual(fallback.headers.getSetCookie(),removed);
  }
  assert.equal(logoutCalls,1);
});

function mockWorkOS(t) {
  const key = '__zeroWorkosHubSessionTest';
  const state = {auth, claims, reads:0};
  globalThis[key] = state;
  // Replace the Next.js request-context boundary only. All Hub routing, cookie
  // cryptography, WorkOS session matching and authorization checks are real.
  const shim = 'data:text/javascript,' + encodeURIComponent(`
    export const withAuth = async () => {
      globalThis.${key}.reads++;
      if (globalThis.${key}.auth instanceof Error) throw globalThis.${key}.auth;
      return globalThis.${key}.auth;
    };
    export const getTokenClaims = async () => globalThis.${key}.claims;`);
  const authModule = new URL('../lib/hub-github-auth.mjs',import.meta.url).href;
  const loader = 'data:text/javascript,' + encodeURIComponent(`
    export function resolve(specifier, context, nextResolve) {
      if (specifier === '@workos-inc/authkit-nextjs' && context.parentURL === ${JSON.stringify(authModule)})
        return {url:${JSON.stringify(shim)},shortCircuit:true};
      return nextResolve(specifier, context);
    }`);
  register(loader);
  t.after(() => {delete globalThis[key];});

  return state;
}

test('private Hub, Stars and Jams require the same active WorkOS session on every request', async t => {
  const result = await grant();
  const legacy = newSession(token,githubUser,3600,hubConfig(legacyEnv),now);
  const state = mockWorkOS(t);

  const cookie = `${cookiePair(result.cookie)}; zero-workos-session=opaque-sdk-cookie`;
  const request = (path, {method = 'GET', body, cookies = cookie, csrf = result.session.csrf, from = origin} = {}) =>
    new Request(origin + path, {method,headers:{cookie:cookies,origin:from,'x-hub-csrf':csrf,'content-type':'application/json'},
      ...(body ? {body:JSON.stringify(body)} : {})});
  const getSession = req => sessionResponse(req,env,now);
  const hub = request('/api/hub/github/session');
  const accepted = await getSession(hub);
  assert.deepEqual(await accepted.json(), {configured:true,managed:true,
    user:{id:'123',login:'student',csrfToken:result.session.csrf}});
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  assert.equal((await (await getSession(request('/api/hub/github/session',{cookies:cookiePair(result.cookie)}))).json()).user, null);
  assert.equal((await (await getSession(request('/api/hub/github/session',{cookies:`${cookie}; zero-workos-session=second`}))).json()).user, null);
  assert.equal(await readSession(request('/hub',{cookies:`${cookiePair(legacy.cookie)}; zero-workos-session=sdk`}),config,now,env), null);
  assert.equal(await readSession(hub,config,now,{...env,WORKOS_ISSUER:''}), null);
  assert.equal(await readSession(hub,hubConfig(legacyEnv),now,legacyEnv), null);
  assert.equal((await readSession(request('/hub',{cookies:cookiePair(legacy.cookie)}),hubConfig(legacyEnv),now,legacyEnv)).id, '123');
  assert.equal(await readSession(hub,config,now + 240_000,env), null);
  assert.equal(state.reads, 1);

  const seenActors = [];
  const target = {kind:'game', id:'drawing-pad', repositoryUrl:'https://github.com/codepetca/zero-drawing-pad'};
  let starCalls = 0;
  const stars = {env,now,visibilityReader:async () => null, resolver:async () => target,
    destinationReader:async () => ({repositoryUrl:target.repositoryUrl,repositoryId:'12',ownerId:'34',owner:'codepetca',repo:'zero-drawing-pad'}),
    fetchImpl:async () => {starCalls++; return new Response(null,{status:204});}};
  const jams = {env,now,fetchImpl:github,service:{
    list:async actor => {seenActors.push(actor); return {events:[]};},
    read:async (_id,actor) => {seenActors.push(actor); return {event:{id:'jam-55'}};},
    mutate:async ({actor}) => {seenActors.push(actor); return {status:'joined'};},
    settle:async () => assert.fail('mismatched session cannot settle'),
    propose:async () => assert.fail('mismatched session cannot propose'),
  }};
  const starRead = () => request('/api/hub/github/stars?kind=game&id=drawing-pad');
  const starWrite = () => request('/api/hub/github/stars',{method:'POST',body:{kind:'game',id:'drawing-pad',starred:true}});
  const jamWrite = () => request('/api/jams/jam-55/actions',{method:'POST',body:{action:'join'}});
  assert.equal((await getStarResponse(starRead(),stars)).status, 200);
  assert.equal((await postStarResponse(starWrite(),stars)).status, 200);
  assert.equal((await postJamActionResponse(jamWrite(),'jam-55',jams)).status, 200);
  assert.deepEqual(seenActors, [{id:'123',login:'student'}]);
  assert.equal(starCalls, 2);

  for (const [activeAuth,activeClaims] of [[{user:null},claims], [new Error('private provider error'),claims],
    [{...auth,impersonator:{}},claims], [{...auth,user:{id:'user_Other'}},{...claims,sub:'user_Other'}],
    [{...auth,sessionId:'session_AfterSignOut'},{...claims,sid:'session_AfterSignOut'}],
    [auth,{...claims,exp:now / 1000}], [auth,{...claims,iss:'https://other.test'}]]) {
    Object.assign(state,{auth:activeAuth,claims:activeClaims});
    assert.equal((await (await getSession(hub)).json()).user, null);
    assert.equal((await getStarResponse(starRead(),stars)).status, 401);
    assert.equal((await postStarResponse(starWrite(),stars)).status, 401);
    assert.equal((await postJamActionResponse(jamWrite(),'jam-55',jams)).status, 401);
    assert.equal((await postJamProposalResponse(jamWrite(),jams)).status, 401);
    assert.equal((await postJamSettlementResponse(jamWrite(),jams)).status, 401);
    assert.equal((await getJamsResponse(request('/api/jams'),jams)).status, 200);
    assert.equal((await getJamResponse(request('/api/jams/jam-55'),'jam-55',jams)).status, 200);
    assert.deepEqual(seenActors.slice(-2), [undefined,undefined]);
  }
  assert.equal(starCalls, 2);
  Object.assign(state,{auth,claims});
  for (const [overrides,status] of [[{from:'https://evil.test'},403], [{csrf:'wrong'},403], [{},409]]) {
    const response = await logoutResponse(request('/api/hub/github/logout',{method:'POST',...overrides}),env,now);
    assert.equal(response.status,status);
    assert.equal(response.headers.has('set-cookie'),false);
  }
});

const redisEnv = {...env, KV_REST_API_URL:'https://fixture.upstash.io', KV_REST_API_TOKEN:'synthetic-redis-secret'};
const refreshToken = 'ghr_' + 'r'.repeat(24);
const nextToken = 'ghu_' + 'n'.repeat(24);
const nextRefreshToken = 'ghr_' + 'n'.repeat(24);
const renewedPair = () => Response.json({access_token:nextToken, refresh_token:nextRefreshToken,
  token_type:'bearer', expires_in:28800, refresh_token_expires_in:15897600});
const renewAt = now + 86_400_000;
const longExpiry = now + 180 * 86_400_000;

function grantFixture(t) {
  const state = mockWorkOS(t);
  state.claims = {...claims, exp:longExpiry / 1000 + 120};
  const records = new Map();
  const requests = [];
  const refreshes = [];
  let refresh = renewedPair;
  const fetchImpl = async (url, options) => {
    if (url === redisEnv.KV_REST_API_URL) {
      assert.equal(options.headers.Authorization, 'Bearer synthetic-redis-secret');
      assert.equal(options.redirect, 'error');
      const [command, ...args] = JSON.parse(options.body);
      requests.push(command);
      const reply = result => Response.json({result});
      if (command === 'EVAL') {
        const [, count, key, expected, replacement] = args;
        assert.equal(count, 1);
        if (expected === undefined) return reply(records.get(key)?.sealed ?? null);
        if (records.get(key)?.sealed !== expected) return reply(0);
        if (replacement === '') records.delete(key);
        else records.get(key).sealed = replacement;
        return reply(1);
      }
      const [key, sealed, nx, pxat, expiresAt] = args;
      assert.match(key, /^zero:hub:github-grant:v1:[A-Za-z0-9_-]{43}$/);
      if (command === 'DEL') return reply(Number(records.delete(key)));
      assert.equal(command, 'SET');
      assert.deepEqual([nx, pxat, expiresAt], ['NX', 'PXAT', longExpiry]);
      assert.doesNotMatch(sealed, /gh[ur]_|student|session_Original|user_Test123/);
      if (records.has(key)) return reply(null);
      records.set(key, {sealed, expiresAt});
      return reply('OK');
    }
    if (url === 'https://github.com/login/oauth/access_token') {
      const fields = new URLSearchParams(options.body);
      assert.equal(fields.get('client_id'), zeroApp.clientId);
      assert.equal(fields.get('grant_type'), 'refresh_token');
      refreshes.push(fields.get('refresh_token'));
      return refresh();
    }
    return github(url);
  };
  const connect = (options = {}) => createWorkOSHubSession({...callback,
    oauthTokens:{...callback.oauthTokens,refreshToken}}, verify,
    {env:redisEnv,fetchImpl,now:() => now,...options});
  const request = grant => new Request(`${origin}/api/hub/github/session`, {
    headers:{cookie:`${cookiePair(grant.cookie)}; zero-workos-session=opaque-sdk-cookie`},
  });
  const get = (grant, at = renewAt, activeEnv = redisEnv) => sessionResponse(request(grant), activeEnv, at, fetchImpl);
  return {state,records,requests,refreshes,fetchImpl,connect,request,get,setRefresh: value => {refresh = value;}};
}

test('a renewable GitHub grant survives a day away and rotates only once across concurrent Hub requests', async t => {
  const fixture = grantFixture(t);
  const connected = await fixture.connect();
  assert.match(connected.cookie, /^zero_hub_gh_session=v2\.[A-Za-z0-9_-]{80,1024}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=15552000;/);
  const expected = {configured:true,managed:true,user:{id:'123',login:'student',csrfToken:connected.session.csrf}};
  t.mock.method(globalThis, 'fetch', fixture.fetchImpl);
  const before = await readSession(fixture.request(connected),config,now,redisEnv);
  assert.equal(before.token, token);
  assert.equal(fixture.refreshes.length, 0);
  fixture.setRefresh(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
    return renewedPair();
  });
  const responses = await Promise.all([fixture.get(connected),fixture.get(connected),
    readSession(fixture.request(connected),config,renewAt,redisEnv)]);
  for (const response of responses.slice(0,2)) {
    assert.deepEqual(await response.json(), expected);
    assert.equal(response.headers.has('set-cookie'), false);
  }
  assert.equal(responses[2].token, nextToken);
  assert.equal(responses[2].csrf, before.csrf);
  assert.deepEqual(fixture.refreshes, [refreshToken]);
  assert.deepEqual(await rejectedGitHubSession(before,config), {});
  assert.deepEqual(await (await fixture.get(connected)).json(), expected);

  fixture.setRefresh(() => Response.json({error:'bad_refresh_token'}));
  assert.equal((await (await fixture.get(connected,renewAt + 86_400_000)).json()).user, null);
  assert.deepEqual(fixture.refreshes, [refreshToken,nextRefreshToken]);
  assert.equal(fixture.records.size, 0);
});

test('renewal requires the originating active WorkOS session and respects the original grant expiry', async t => {
  const fixture = grantFixture(t);
  const connected = await fixture.connect();
  for (const [activeAuth,activeClaims] of [
    [{...auth,impersonator:{}},fixture.state.claims],
    [{...auth,sessionId:'session_New'},{...fixture.state.claims,sid:'session_New'}],
    [{...auth,user:{id:'user_Other'}},{...fixture.state.claims,sub:'user_Other'}],
    [auth,{...fixture.state.claims,exp:renewAt / 1000}],
  ]) {
    Object.assign(fixture.state,{auth:activeAuth,claims:activeClaims});
    const count = fixture.requests.length;
    assert.equal((await (await fixture.get(connected)).json()).user, null);
    assert.equal(fixture.requests.length, count);
  }
  Object.assign(fixture.state,{auth,claims:{...claims,exp:longExpiry / 1000 + 120}});
  const lateVisit = longExpiry - 86_400_000;
  assert.equal((await (await fixture.get(connected,lateVisit)).json()).user.id, '123');
  assert.equal((await (await fixture.get(connected,longExpiry)).json()).user, null);
  assert.deepEqual(fixture.refreshes, [refreshToken]);
  assert.equal((await (await fixture.get(connected,renewAt,legacyEnv)).json()).user, null);
});

test('sign-out removes the grant and an in-flight renewal cannot bring it back', async t => {
  const fixture = grantFixture(t);
  const connected = await fixture.connect();
  t.mock.method(globalThis, 'fetch', fixture.fetchImpl);
  const entered = Promise.withResolvers();
  const complete = Promise.withResolvers();
  fixture.setRefresh(() => {entered.resolve(); return complete.promise;});
  const pending = fixture.get(connected);
  await entered.promise;
  await removeManagedGitHubGrant(fixture.request(connected),redisEnv);
  complete.resolve(renewedPair());
  assert.equal((await (await pending).json()).user, null);
  assert.equal((await (await fixture.get(connected)).json()).user, null);
  assert.equal(fixture.records.size, 0);
});

test('temporary renewal failures leave the grant in place and missing storage preserves the short session', async t => {
  const fixture = grantFixture(t);
  const connected = await fixture.connect();
  fixture.setRefresh(() => Response.json({error:'server_error',internal:refreshToken},{status:502}));
  const failure = await fixture.get(connected);
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /ghr_|server_error/);
  assert.equal(fixture.records.size, 1);
  fixture.setRefresh(renewedPair);
  assert.equal((await (await fixture.get(connected,renewAt + 21_000)).json()).user.id, '123');

  const unavailable = await fixture.connect({fetchImpl:async (url, options) =>
    url === redisEnv.KV_REST_API_URL ? new Response(null,{status:503}) : fixture.fetchImpl(url,options)});
  const preview = await fixture.connect({env:{...redisEnv,VERCEL:'1',VERCEL_ENV:'preview',
    ZERO_HUB_ORIGIN:'https://zero.codepet.ca',NEXT_PUBLIC_WORKOS_REDIRECT_URI:'https://zero.codepet.ca/zero-account/callback'}});
  for (const short of [unavailable,preview]) {
    assert.doesNotMatch(short.cookie, /^zero_hub_gh_session=v2\./);
    assert.match(short.cookie, /Max-Age=240;/);
  }
});

test('ordinary Hub routes report temporary renewal failure without treating the user as signed out', async t => {
  const fixture = grantFixture(t);
  const connected = await fixture.connect();
  t.mock.method(globalThis, 'fetch', async (url, options) =>
    url === redisEnv.KV_REST_API_URL ? new Response(null,{status:503}) : fixture.fetchImpl(url,options));
  const request = (path, method = 'GET') => new Request(origin + path, {method,
    headers:{cookie:fixture.request(connected).headers.get('cookie'),origin,'x-hub-csrf':connected.session.csrf}});
  const options = {env:redisEnv,now:renewAt,fetchImpl:async () => assert.fail('provider operation must wait for a session')};
  const jamOptions = {...options,service:{
    list:async () => assert.fail('do not replace the connected actor with anonymous state'),
    mutate:async () => assert.fail('do not mutate without a session'),
  }};
  const responses = await Promise.all([
    getStarResponse(request('/api/hub/github/stars?kind=game&id=drawing-pad'),options),
    postStarResponse(request('/api/hub/github/stars','POST'),options),
    getJamsResponse(request('/api/jams'),jamOptions),
    postJamActionResponse(request('/api/jams/jam-55/actions','POST'),'jam-55',jamOptions),
  ]);
  assert.ok(responses.every(response => response.status === 503 && !response.headers.has('set-cookie')));
  assert.equal((await responses[1].json()).outcome, 'not_dispatched');
  assert.equal(fixture.refreshes.length, 0);
});

test('a delayed Stars 401 for a rotated token retries reads and preserves an unconfirmed write', async t => {
  const fixture = grantFixture(t);
  t.mock.method(globalThis, 'fetch', fixture.fetchImpl);
  const target = {kind:'game', id:'drawing-pad', repositoryUrl:'https://github.com/codepetca/zero-drawing-pad'};
  for (const [method, route] of [['GET',getStarResponse],['POST',postStarResponse]]) {
    const connected = await fixture.connect();
    const request = new Request(`${origin}/api/hub/github/stars?kind=game&id=drawing-pad`, {
      method, headers:{cookie:fixture.request(connected).headers.get('cookie'),origin,
        'x-hub-csrf':connected.session.csrf,'content-type':'application/json'},
      ...(method === 'POST' ? {body:JSON.stringify({kind:'game',id:'drawing-pad',starred:true})} : {}),
    });
    const seen = [];
    const pending = route(request, {env:redisEnv,now:now + 239_000,
      visibilityReader:async () => null, resolver:async () => target,
      destinationReader:async () => ({repositoryUrl:target.repositoryUrl,repositoryId:'12',ownerId:'34',
        owner:'codepetca',repo:'zero-drawing-pad'}),
      fetchImpl:async (_url, options) => {
        const credential = options.headers.Authorization;
        seen.push(credential);
        if (credential === `Bearer ${token}`) {
          assert.equal((await fixture.get(connected,now + 241_000)).status,200);
          return new Response(null,{status:401});
        }
        assert.equal(credential,`Bearer ${nextToken}`);
        return new Response(null,{status:204});
      },
    });
    const response = await pending;
    assert.equal(response.headers.has('set-cookie'),false);
    if (method === 'GET') {
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{starred:true});
      assert.equal(seen.length,2);
    } else {
      assert.equal(response.status,503);
      assert.equal((await response.json()).outcome,'uncertain');
      assert.equal(seen.length,1);
    }
    assert.equal((await (await fixture.get(connected)).json()).user.id,'123');
  }
});
