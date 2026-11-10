import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {sealData, unsealData} from 'iron-session';
import {SignJWT, decodeJwt} from 'jose';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {callbackResponse, hubConfig, loginResponse, logoutResponse, newSession, readSession,
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
      {env,fetchImpl:unexpected,now:() => now}), null);
  }
  assert.equal(await createWorkOSHubSession(callback, verify, {env,now:() => now,
    fetchImpl:async () => Response.json({app:{client_id:'IvOtherApp'},user:githubUser})}), null);
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
    assert.equal(fallback.status,303);assert.equal(fallback.headers.get('location'),`${origin}/zero-account`);
    assert.deepEqual(fallback.headers.getSetCookie(),removed);
  }
  assert.equal(logoutCalls,1);
});

test('private Hub, Stars and Jams require the same active WorkOS session on every request', async t => {
  const result = await grant();
  const legacy = newSession(token,githubUser,3600,hubConfig(legacyEnv),now);
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
