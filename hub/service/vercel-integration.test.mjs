// Actual restricted PostgreSQL + Web/Node bridge. GitHub is a controlled fake;
// no candidate execution, worker, production credential or network API is used.
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-fixture.mjs';
import {migrateDatabase} from './database.mjs';
import {createContributionRuntime,contributionHubResponse} from '../../website/lib/hub-contribution-runtime.mjs';

const origin='https://zero.codepet.ca';
let fixture,pool,handler,env,profile,expectedVerifier,providerCalls;
before(async()=>{
  fixture=await startDisposablePostgres({port:15447});
  await migrateDatabase(fixture.pool,{roles:true});
  const password=randomBytes(32).toString('hex');
  await fixture.pool.query(`CREATE ROLE zero_vercel_api LOGIN NOINHERIT PASSWORD '${password}'`);
  await fixture.pool.query('GRANT hub_api TO zero_vercel_api');
  const url=new URL(fixture.connectionString);url.username='zero_vercel_api';url.password=password;
  pool=new pg.Pool({connectionString:url.href,max:2,connectionTimeoutMillis:3000,options:'-c role=hub_api -c statement_timeout=1500 -c search_path=public,pg_catalog'});
  const oauth={clientId:'test-client',clientSecret:'test-secret',fetch:async(target,options)=>{
    providerCalls++;
    if(target==='https://github.com/login/oauth/access_token') {
      assert.equal(JSON.parse(options.body).code_verifier,expectedVerifier);
      return Response.json({access_token:'fake-provider-token',token_type:'bearer'});
    }
    assert.equal(target,'https://api.github.com/user');
    return Response.json(profile);
  }};
  handler=await createContributionRuntime(pool,{origin,oauth});
  env={ZERO_HUB_UPLOADS:'1',ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:url.href,ZERO_HUB_GITHUB_CLIENT_ID:oauth.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:oauth.clientSecret};
});
beforeEach(async()=>{
  await fixture.pool.query('TRUNCATE hub_releases,hub_results,hub_submissions,hub_libraries,hub_sessions,hub_oauth_states,hub_users CASCADE');
  profile={id:101,login:'alice'};providerCalls=0;
});
after(async()=>{await pool?.end();await fixture?.stop();});

async function call(path,{method='GET',cookie,csrf,body,requestOrigin=origin,signal}={}) {
  const headers={};
  if(cookie)headers.Cookie=cookie;
  if(method==='POST'){headers.Origin=requestOrigin;headers['Content-Type']='application/json';}
  if(csrf)headers['X-Zero-CSRF']=csrf;
  const request=new Request(`${origin}/api/hub/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal});
  return contributionHubResponse(request,path.split('?')[0].split('/'),{env,handler});
}
function sessionCookie(response) {
  const cookie=response.headers.getSetCookie().find(item=>item.startsWith('zero_hub_session='));
  assert.ok(cookie);return cookie.split(';')[0];
}
async function signIn(previous) {
  const started=await call('auth/start');assert.equal(started.status,302);
  const pending=started.headers.getSetCookie()[0].split(';')[0];
  expectedVerifier=pending.split('=')[1];
  const authorize=new URL(started.headers.get('location'));
  assert.equal(authorize.searchParams.get('code_challenge'),createHash('sha256').update(expectedVerifier).digest('base64url'));
  const state=authorize.searchParams.get('state');
  const completed=await call(`auth/callback?state=${state}&code=test`,{cookie:[pending,previous].filter(Boolean).join('; ')});
  assert.equal(completed.status,302);assert.equal(completed.headers.getSetCookie().length,2);
  const cookie=sessionCookie(completed);
  const session=await(await call('session',{cookie})).json();
  assert.deepEqual(session.user,{id:String(profile.id),login:profile.login});
  return {cookie,csrf:session.csrfToken};
}

test('restricted embedded adapter signs in, prepares and queues exact source with authoritative ownership',async()=>{
  assert.equal((await(await call('session')).json()).user,null);
  const alice=await signIn();assert.equal(providerCalls,2);
  const reserved=await call('libraries',{method:'POST',...alice,body:{className:'HealthBar',title:'Health bar'}});
  assert.equal(reserved.status,201);const prepared=await reserved.json();
  assert.equal(prepared.namespace,`zero.${prepared.libraryId}`);
  const submitted=await call('submissions',{method:'POST',...alice,body:prepared.bundle});
  assert.equal(submitted.status,202);const job=await submitted.json();assert.equal(job.status,'queued');
  assert.deepEqual(await(await call('submissions',{method:'POST',...alice,body:prepared.bundle})).json(),job);
  assert.equal((await call(`submissions/${job.id}`,alice)).status,200);
  const stored=(await fixture.pool.query('SELECT owner_id,source_digest FROM hub_submissions WHERE id=$1',[job.id])).rows[0];
  assert.equal(stored.owner_id,'101');assert.match(stored.source_digest,/^[a-f0-9]{64}$/);
  profile={id:202,login:'bob'};const bob=await signIn(alice.cookie);
  assert.equal((await(await call('session',alice)).json()).user,null);
  assert.equal((await call('submissions',{method:'POST',...bob,body:prepared.bundle})).status,403);
  assert.equal((await call(`submissions/${job.id}`,bob)).status,404);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_results')).rows[0].n,0);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_releases')).rows[0].n,0);
});

test('missing session, CSRF/origin drift and cancelled requests cannot create libraries',async()=>{
  const body={className:'Hud',title:'HUD'};
  assert.equal((await call('libraries',{method:'POST',body})).status,401);
  const actor=await signIn();
  assert.equal((await call('libraries',{method:'POST',cookie:actor.cookie,body})).status,403);
  assert.equal((await call('libraries',{method:'POST',...actor,requestOrigin:'https://foreign.example',body})).status,403);
  const abort=new AbortController();abort.abort();
  assert.equal((await call('libraries',{method:'POST',...actor,body,signal:abort.signal})).status,400);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_libraries')).rows[0].n,0);
  const logout=await call('logout',{method:'POST',...actor,body:{}});assert.equal(logout.status,200);
  assert.match(logout.headers.getSetCookie()[0],/^zero_hub_session=;.*Max-Age=0; Secure$/);
  assert.equal((await(await call('session',actor)).json()).user,null);
});

test('turning capability off blocks queued writes and auth before any active handler',async()=>{
  const actor=await signIn();
  for(const [path,method]of [['auth/start','GET'],['libraries','POST'],['submissions','POST']]) {
    const request=new Request(`${origin}/api/hub/${path}`,{method,headers:{Cookie:actor.cookie,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
    const response=await contributionHubResponse(request,path.split('/'),{env:{...env,ZERO_HUB_UPLOADS:'0'},handler:()=>assert.fail('Closed capability dispatched')});
    assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
  }
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_libraries')).rows[0].n,0);
});

test('documented GitHub cancellation parameters consume state and clear only the temporary cookie',async()=>{
  const actor=await signIn();
  const before=await(await call('session',actor)).json();
  const started=await call('auth/start');
  const pending=started.headers.getSetCookie()[0].split(';')[0];
  const state=new URL(started.headers.get('location')).searchParams.get('state');
  const uri=encodeURIComponent('https://docs.github.com/apps/oauth-apps/maintaining-oauth-apps/troubleshooting-authorization-request-errors');
  const callback=`auth/callback?state=${state}&error=access_denied&error_description=The%20user%20denied%20access&error_uri=${uri}`;
  const response=await call(callback,{cookie:pending+'; '+actor.cookie});
  assert.equal(response.status,403);assert.equal(response.headers.get('location'),null);
  assert.deepEqual(response.headers.getSetCookie(),['zero_hub_oauth=; Path=/api/hub; HttpOnly; SameSite=Lax; Max-Age=0; Secure']);
  assert.doesNotMatch(await response.text(),/docs\.github\.com|test-secret|fake-provider-token/);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,0);
  assert.deepEqual(await(await call('session',actor)).json(),before);
  assert.equal(providerCalls,2,'Cancellation must not exchange credentials or request a profile');
  const replay=await call(callback,{cookie:pending+'; '+actor.cookie});assert.equal(replay.status,403);
  assert.deepEqual(await(await call('session',actor)).json(),before);
});
