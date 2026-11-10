import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, verify} from 'node:crypto';
import {createListingRepositoryReader} from '../lib/hub-listings-github-app.mjs';
import {Pool} from 'pg';
import {claimPublicHubRequest, hubListingsResponse, hubPublicListingsResponse, readProjectListingPage} from '../lib/hub-listings-http.mjs';
import {createHubListingsStore} from '../lib/hub-listings-store.mjs';
import {checkListingToken, publicListingPlayUrl, verifyListingPublication} from '../lib/hub-listings-verification.mjs';
import {hubConfig, newSession} from '../lib/hub-github-auth.mjs';
import app from '../../extension/src/github-app/config.json' with {type:'json'};

const env = {NODE_ENV:'test', ZERO_HUB_ORIGIN:'http://127.0.0.1:3000', ZERO_HUB_GITHUB_CLIENT_ID:app.clientId,
  ZERO_HUB_GITHUB_CLIENT_SECRET:'fixture-client-secret-only', ZERO_HUB_GITHUB_SESSION_SECRET:'11'.repeat(32)};
const commit = 'a'.repeat(40);
const origin = env.ZERO_HUB_ORIGIN;
const receipt = {repositoryUrl:'https://github.com/student/my-game', repositoryId:'21', runId:'321', commit, pagesUrl:'https://student.github.io/my-game/'};
const token = 'ghu_fixtureToken123456';
const signal = AbortSignal.timeout(5000);

test('the listing verifier binds the public repository, Pages site, run and live marker to the signed-in owner', async () => {
  const root = 'https://api.github.com/repos/student/my-game';
  const repo = {id:21, private:false, name:'my-game', full_name:'student/my-game', owner:{id:6, type:'User', login:'student'}};
  const pages = {public:true, build_type:'workflow', html_url:'https://student.github.io/my-game/'};
  const run = {id:321, repository:{id:21}, head_sha:commit, head_branch:'main', path:'.github/workflows/zero-web.yml',
    event:'workflow_dispatch', status:'completed', conclusion:'success', run_attempt:1, created_at:'2026-11-10T15:00:00Z'};
  let marker = commit + '\n321';
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    assert.equal(options.redirect, 'error');
    return Response.json(({[root]:repo, [root+'/pages']:pages, [root+'/actions/runs/321']:run})[url]);
  };
  const readPublic = async (url, options) => {
    assert.equal(url, 'https://student.github.io/my-game/zero-source-sha.txt');
    assert.deepEqual(options, {signal});
    return new Response(marker);
  };
  const options = {account:'6', token, signal, fetchImpl, readPublic};
  assert.equal((await verifyListingPublication(receipt, options)).title, 'my-game');
  assert.equal(await verifyListingPublication(receipt, {...options, account:'7'}), null);
  assert.equal(await verifyListingPublication({...receipt, commit:'b'.repeat(40)}, options), null);
  assert.equal(await verifyListingPublication({...receipt, pagesUrl:'https://elsewhere.test/'}, options), null);
  marker = commit + '\n322';
  assert.equal(await verifyListingPublication(receipt, options), null);
  assert.equal(await checkListingToken(token, hubConfig(env), signal, async (url, options) => {
    assert.equal(url, 'https://api.github.com/applications/' + app.clientId + '/token');
    assert.equal(options.redirect, 'error');
    assert.match(options.headers.Authorization, /^Basic /);
    return Response.json({user:{id:6}, app:{client_id:app.clientId}});
  }), '6');
});

test('management uses the signed-in owner and rejects cross-origin or bearer management requests', async () => {
  const {cookie, session} = newSession(token, {id:6, login:'student'}, 3600, hubConfig(env));
  let write;
  const options = {env, getStore:()=>({manage:async (...args)=>{write=args; return true;}})};
  const request = (headers, body = {action:'protect', repositoryId:'21', account:'7'}) => new Request(origin + '/api/hub/listings', {
    method:'POST', headers:{'Content-Type':'application/json', Cookie:cookie.split(';')[0], 'X-Hub-CSRF':session.csrf, ...headers},
    body:JSON.stringify(body)
  });
  assert.equal((await hubListingsResponse(request({Origin:'https://elsewhere.test'}), options)).status, 403);
  assert.equal((await hubListingsResponse(request({Authorization:'Bearer '+token}), options)).status, 400);
  assert.equal(write, undefined);
  assert.equal((await hubListingsResponse(request({Origin:origin}), options)).status, 200);
  const managed = {...env, ZERO_WORKOS_ENABLED:'true'};
  assert.equal((await hubListingsResponse(request({Origin:origin}), {...options, env:managed})).status, 401);
  assert.deepEqual(write, ['6','21','protect']);
  const publish = request({Authorization:'Bearer '+token}, {action:'publish', ...receipt});
  const verified = {...receipt, title:'my-game'};
  const response = await hubListingsResponse(publish, {...options, tokenOwner:async()=> '6',
    verify:async (incoming, context)=>{
      assert.deepEqual(incoming, receipt);
      assert.equal(context.account, '6');
      return verified;
    },
    getStore:()=>({savePublication:async (...args)=>{
      assert.deepEqual(args, ['6',1,verified]);
      return {status:'listed'};
    }})
  });
  assert.deepEqual(await response.json(), {status:'listed'});
});

test('public listing reads exclude transferred, newly held and concurrently unlisted projects', async () => {
  const entries = Array.from({length:4}, (_,i)=>({order:String(i+1), repositoryId:String(21+i),
    repositoryUrl:'https://github.com/student/game-'+i, accountId:'6', title:'game-'+i,
    author:'student', pagesUrl:'https://student.github.io/game-'+i+'/'}));
  let observations = 0;
  const response = await hubPublicListingsResponse(new Request(origin+'/api/hub/listings/discover'), {
    env,
    getStore:()=>({discover:async()=>entries, stillListed:async projects=>projects.filter(p=>p.order !== '3')}),
    visibilityReader:async()=>{
      const fresh = ++observations === 2;
      return {revision:commit, observedAt:Date.now(), isHeld:id=>fresh && id === '24'};
    },
    destinationReader:async entry=>entry.order !== '2', playReader:async()=>undefined
  });
  assert.deepEqual((await response.json()).projects.map(project=>project.id), ['21']);
});

test('held matches do not create a continuation and GitHub outages are retryable', async () => {
  const entries = Array.from({length:9}, (_,i)=>({order:String(100-i), repositoryId:String(100-i),
    repositoryUrl:'https://github.com/student/game-'+i, accountId:'6', title:'game-'+i,
    author:'student', pagesUrl:'https://student.github.io/game-'+i+'/'}));
  const url = origin+'/api/hub/listings/discover?q=game';
  const read = options => hubPublicListingsResponse(new Request(url), {...base, ...options});
  const base = {env, getStore:()=>({discover:async (order, _search, excluded)=>
    entries.filter(entry=>(order === null || Number(entry.order) < Number(order)) && !excluded.includes(entry.repositoryId)),
    stillListed:async items=>items}),
    visibilityReader:async()=>({revision:commit, observedAt:Date.now(),
      heldRepositoryIds:()=>['92'], isHeld:id=>id === '92'}),
    destinationReader:async()=>true, playReader:async()=>undefined};
  const held = await (await read({})).json();
  assert.equal(held.projects.length, 8);
  assert.equal(held.next, null);
  const visible = await (await read({visibilityReader:async()=>null})).json();
  assert.equal(visible.projects.length, 8);
  assert.match(visible.next, /^[A-Za-z0-9_-]{40,}$/);
  const second = await hubPublicListingsResponse(new Request(url+'&before='+visible.next), {...base, visibilityReader:async()=>null});
  assert.deepEqual((await second.json()).projects.map(project=>project.id), ['92']);
  assert.equal((await read({destinationReader:async()=>{throw new Error('rate limited');}})).status, 503);
});

test('disabled jam pages suppress the award while the published app remains visible', async () => {
  const production={...env,NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_HUB_ORIGIN:'https://zero.codepet.ca'};
  const entry={...receipt,accountId:'6',order:'1',title:'Game',author:'student'};
  const response=await hubPublicListingsResponse(new Request('https://zero.codepet.ca/api/hub/listings/discover'), {
    env:production,getStore:()=>({discover:async()=>[entry],stillListed:async items=>items}),
    visibilityReader:async()=>({revision:commit,observedAt:Date.now(),isHeld:()=>false,isGameJamWinner:()=>true}),
    destinationReader:async()=>true,playReader:async()=>undefined
  });
  assert.equal(response.status,200);
  const {projects}=await response.json();
  assert.equal(projects.length,1);
  assert.equal(projects[0].gameJamWinner,undefined);
});

test('public discovery uses a GitHub App grant for one public repository and metadata read only', async () => {
  const {privateKey:key,publicKey} = generateKeyPairSync('rsa',{modulusLength:2048});
  const entry = {...receipt, accountId:'6'};
  const appId = String(app.appId);
  const now = Date.now();
  const installationToken = 'ghs_metadataOnlyFixture123456789';
  const root = 'https://api.github.com/repos/student/my-game';
  const calls = [];
  let permissions = {metadata:'read'};
  let selection = 'selected';
  let status = 200;
  let hasPages = true;
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect,'manual');
    calls.push(url);
    const credential = options.headers.Authorization.replace(/^Bearer /,'');
    if (url === root) {
      assert.equal(credential,installationToken);
      if (status !== 200) return new Response(null,{status});
      return Response.json({id:21,private:false,has_pages:hasPages,owner:{id:6,type:'User'},html_url:receipt.repositoryUrl});
    }
    const [header,payload,signature] = credential.split('.');
    assert.equal(JSON.parse(Buffer.from(payload,'base64url')).iss,appId);
    assert.ok(verify('RSA-SHA256',Buffer.from(header+'.'+payload),publicKey,Buffer.from(signature,'base64url')));
    if (url === root+'/installation') {
      return Response.json({id:11,app_id:Number(appId),suspended_at:null,account:{id:6,type:'User'},permissions:{metadata:'read'}});
    }
    assert.equal(url,'https://api.github.com/app/installations/11/access_tokens');
    assert.deepEqual(JSON.parse(options.body),{repository_ids:[21],permissions:{metadata:'read'}});
    return Response.json({token:installationToken,expires_at:new Date(now+3600_000).toISOString(),
      repositories:[{id:21,private:false}],repository_selection:selection,permissions},{status:201});
  };
  const options = {appId,key,now:()=>now,fetchImpl};
  const read = createListingRepositoryReader(options);
  assert.equal(await read(entry,{signal}),true);
  hasPages = false;
  assert.equal(await read(entry,{signal}),false);
  assert.equal(calls.length,4,'cached grant still fetches fresh metadata');
  status = 429;
  await assert.rejects(read(entry,{signal}),/metadata is unavailable/);
  status = 200;
  assert.equal(await read(entry,{signal}),false);
  assert.equal(calls.length,6,'transient failures preserve the grant');
  permissions = {metadata:'read',contents:'read'};
  await assert.rejects(createListingRepositoryReader(options)(entry,{signal}),/metadata is unavailable/);
  permissions = {metadata:'read'};
  selection = 'all';
  await assert.rejects(createListingRepositoryReader(options)(entry,{signal}),/metadata is unavailable/);
});

test('public Play links require the expected direct Pages marker', async () => {
  const entry = {...receipt, accountId:'6', pagesUrl:'https://games.example.test/'};
  const playOptions = {signal, readPublic:async url=>{
    assert.equal(url, receipt.pagesUrl + 'zero-source-sha.txt');
    return new Response(commit + '\n321');
  }};
  assert.equal(await publicListingPlayUrl(entry, playOptions), undefined);
  const canonical = {...entry, pagesUrl:receipt.pagesUrl};
  assert.equal(await publicListingPlayUrl(canonical, playOptions), receipt.pagesUrl);
  assert.equal(await publicListingPlayUrl(canonical, {...playOptions,
    readPublic:async()=>Response.redirect('https://new.example.test/')}), undefined);
});

const database = process.env.ZERO_HUB_LISTINGS_TEST_DATABASE;
test('Postgres serializes concurrent replacement, protection transfer, update, move and replay', {skip:!database}, async t => {
  const pool = new Pool({connectionString:database});
  t.after(()=>pool.end());
  const store = createHubListingsStore(pool);
  const account = String(Date.now());
  const item = (id, run = id) => ({...receipt, repositoryId:String(id), title:'game-'+id,
    repositoryUrl:'https://github.com/student/game-'+id, pagesUrl:'https://student.github.io/game-'+id+'/',
    author:'student', runId:String(run), runCreatedAt:new Date(2026,0,1)});
  const active = async owner => (await store.mine(owner)).projects.filter(p=>p.listed).map(p=>p.repositoryId);

  assert.deepEqual(await store.savePublication(account, 1, item(21)), {status:'listed'});
  await store.manage(account, '21', 'protect');
  assert.deepEqual(await store.savePublication(account, 1, item(22)), {status:'unlisted', reason:'protected'});
  await store.manage(account, '21', 'unprotect');
  assert.deepEqual(await store.savePublication(account, 1, item(22), {restore:true}), {status:'listed', replaced:'game-21'});
  assert.deepEqual(await store.savePublication(account, 1, item(21)), {status:'unlisted', alreadyRecorded:true});
  assert.deepEqual(await active(account), ['22']);

  const pro = String(Number(account)+1);
  for (let id = 31; id <= 40; id++) await store.savePublication(pro, 10, item(id));
  await store.manage(pro, '31', 'protect');
  await store.manage(pro, '32', 'protect');
  await store.manage(pro, '31', 'move');
  await store.savePublication(pro, 10, item(33, 123));
  assert.deepEqual((await active(pro)).slice(0, 3), ['32','33','34']);
  const results = await Promise.all([store.savePublication(pro, 10, item(41)), store.savePublication(pro, 10, item(42))]);
  assert.deepEqual(results.map(r=>r.replaced).sort(), ['game-33','game-34']);
  const ids = await active(pro);
  assert.equal(ids.length, 10);
  assert.equal(ids[0], '32');
  assert.ok(ids.includes('31'));
  assert.deepEqual((await store.mine(pro)).projects.filter(p=>p.protected).map(p=>p.repositoryId), ['32']);
  assert.equal((await store.discover(null, 'game-33', [])).length, 0);
  for (let id = 60; id <= 83; id++) await store.savePublication(account, 1, item(id));
  const history = await store.mine(account);
  assert.equal(history.projects.length, 21);
  assert.ok(history.next);
  const older = await store.mine(account, history.next);
  assert.ok(older.projects.some(project=>project.repositoryId === '21'));
  assert.deepEqual(older.projects.filter(project=>project.listed).map(project=>project.repositoryId), ['83']);
});

test('central listing grants augment legacy access and outages do not silently downgrade it', async () => {
  const {cookie} = newSession(token, {id:6, login:'student'}, 3600, hubConfig(env));
  const request = () => new Request(origin + '/api/hub/listings', {headers:{Cookie:cookie.split(';')[0]}});
  const centralEnv = {...env, ZERO_ENTITLEMENTS_DATABASE_URL:'fixture-only'};
  const project = {repositoryId:'21', title:'Game', pagesUrl:'https://example.test', listed:true, protected:false};
  const listingStore = {mine:async()=>({projects:[project], next:null})};
  const options = {env:centralEnv, getStore:()=>listingStore,
    getEntitlementsStore:()=>({resolve:async id=>({listingLimit:id==='6'?10:1})})};
  assert.equal((await (await hubListingsResponse(request(), options)).json()).limit, 10);
  const unavailable = {...options, getEntitlementsStore:()=>({resolve:async()=>{throw new Error('offline');}})};
  const degraded = await hubListingsResponse(request(), unavailable);
  assert.equal(degraded.status, 200);
  assert.deepEqual(await degraded.json(), {account:'6', limit:null, projects:[project], next:null});
  const legacy = {...unavailable, env:{...centralEnv, ZERO_HUB_LISTINGS_PRO_GITHUB_IDS:'6'}};
  assert.equal((await (await hubListingsResponse(request(), legacy)).json()).limit, 10);
});

test('a central entitlement outage cannot replace a listing on publish', async () => {
  const centralEnv = {...env, ZERO_ENTITLEMENTS_DATABASE_URL:'fixture-only'};
  let wrote = false;
  const response = await hubListingsResponse(new Request(origin+'/api/hub/listings', {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token},
    body:JSON.stringify({action:'publish', ...receipt})
  }), {env:centralEnv, getStore:()=>({savePublication:async()=>{wrote=true;}}),
    tokenOwner:async()=> '6', verify:async()=>receipt,
    getEntitlementsStore:()=>({resolve:async()=>{throw new Error('offline');}})});
  assert.equal(response.status, 503);
  assert.equal(wrote, false);
  const {cookie, session} = newSession(token, {id:6, login:'student'}, 3600, hubConfig(env));
  const options = {env:centralEnv, getStore:()=>({owned:async()=>receipt, savePublication:async()=>{wrote=true;}, manage:async()=>true}),
    verify:async()=>receipt, getEntitlementsStore:()=>({resolve:async()=>{throw new Error('offline');}})};
  const management = action => new Request(origin+'/api/hub/listings', {method:'POST',
    headers:{'Content-Type':'application/json', Origin:origin, Cookie:cookie.split(';')[0], 'X-Hub-CSRF':session.csrf},
    body:JSON.stringify({action, repositoryId:'21'})});
  assert.equal((await hubListingsResponse(management('list'), options)).status, 503);
  assert.equal(wrote, false);
  assert.equal((await hubListingsResponse(management('unlist'), options)).status, 200);
});

test('a cancelled publish or relist does not write after the entitlement lookup', async () => {
  const centralEnv = {...env, ZERO_ENTITLEMENTS_DATABASE_URL:'fixture-only'};
  const {cookie, session} = newSession(token, {id:6, login:'student'}, 3600, hubConfig(env));
  for (const desktop of [true, false]) {
    const controller = new AbortController();
    let wrote = false;
    const store = {owned:async()=>receipt, savePublication:async()=>{wrote=true;}};
    const request = new Request(origin+'/api/hub/listings', {method:'POST', signal:controller.signal,
      headers:desktop ? {'Content-Type':'application/json', Authorization:'Bearer '+token} :
        {'Content-Type':'application/json', Origin:origin, Cookie:cookie.split(';')[0], 'X-Hub-CSRF':session.csrf},
      body:JSON.stringify(desktop ? {action:'publish', ...receipt} : {action:'list', repositoryId:'21'})});
    const response = await hubListingsResponse(request, {env:centralEnv, getStore:()=>store,
      tokenOwner:async()=> '6', verify:async()=>receipt,
      getEntitlementsStore:()=>({resolve:async()=>{controller.abort(); return {listingLimit:10};}})});
    assert.equal(response.status, 503);
    assert.equal(wrote, false);
  }
});


test('project listing pages bound provider work and only probe Play for displayed entries', async () => {
  const items = Array.from({length:12}, (_, i) => ({order:String(12-i), repositoryId:String(12-i)}));
  const calls = [], played = [];
  let active = 0, peak = 0;
  const result = await readProjectListingPage({env, signal, search:'game', before:null, limit:3,
    excluded:['12'], visibility:{revision:commit, heldRepositoryIds:()=>['11'], isHeld:id=>id === '11'}, checkPlay:true,
    getStore:()=>({discover:async (before, search, excluded, limit)=>{
      calls.push({before, search, excluded, limit});
      return items.filter(item => !excluded.includes(item.repositoryId) && (before === null || Number(item.order) < Number(before))).slice(0, limit);
    }, stillListed:async entries=>entries}),
    destinationReader:async entry=>{ active++; peak=Math.max(peak, active); await Promise.resolve(); active--; return entry.order !== '10'; },
    playReader:async entry=>{played.push(entry.order); return 'play';}
  });
  assert.deepEqual(result.entries.map(entry=>entry.order), ['9','8','7']);
  assert.equal(result.more, true);
  assert.equal(result.lookahead.order, '6');
  assert.deepEqual(played, ['9','8','7']);
  assert.ok(peak <= 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 9);
  assert.deepEqual(calls[0].excluded, ['12','11']);
});

test('a single remaining slot scans past stale listings and a stalled Play probe is optional', async () => {
  const items=Array.from({length:11},(_,index)=>({order:String(11-index),repositoryId:String(11-index)}));
  let stillChecked=false;
  const result=await readProjectListingPage({env,visibility:null,limit:1,checkPlay:true,playBudgetMs:20,
    getStore:()=>({discover:async(before,_search,_excluded,limit)=>items.filter(item=>before===null||+item.order<+before).slice(0,limit),
      stillListed:async entries=>{stillChecked=true;return entries;}}),
    destinationReader:async entry=>+entry.order<=3,playReader:async()=>new Promise(()=>{})});
  assert.deepEqual(result.entries.map(entry=>entry.order),['3']);
  assert.equal(result.lookahead.order,'2');
  assert.equal(result.entries[0].playUrl,undefined);
  assert.equal(stillChecked,true);
});

test('listing page fails closed on exhausted scan budget and rechecks after Play', async () => {
  let windows = 0, play = 0, finalChecked = false;
  const getStore = ()=>({discover:async (_before, _search, _excluded, limit)=>{
    windows++; return Array.from({length:limit}, (_,i)=>({order:String(100-windows*limit-i), repositoryId:String(100-windows*limit-i)}));
  }, stillListed:async entries=>{finalChecked = play > 0; return entries.slice(0, -1);}});
  await assert.rejects(readProjectListingPage({env, signal, visibility:null, limit:2, getStore, destinationReader:async()=>false}), /budget/);
  assert.equal(windows, 4);
  await assert.rejects(readProjectListingPage({env, signal, visibility:null, limit:2, getStore, checkPlay:true,
    destinationReader:async()=>true, playReader:async()=>{play++;}}), /continuation/);
  assert.equal(play, 2);
  assert.equal(finalChecked, true);
  assert.deepEqual(await readProjectListingPage({env, signal, limit:2, getStore:()=>null}),
    {entries:[], more:false, lookahead:null});
});

test('public discovery request claims share a four-request limit', () => {
  const claims = Array.from({length:4}, ()=>claimPublicHubRequest());
  assert.ok(claims.every(Boolean));
  assert.equal(claimPublicHubRequest(), null);
  claims[0](); claims[0]();
  const replacement = claimPublicHubRequest();
  assert.ok(replacement);
  assert.equal(claimPublicHubRequest(), null);
  replacement(); claims.slice(1).forEach(release=>release());
});
