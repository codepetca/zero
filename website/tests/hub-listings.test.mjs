import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {hubListingsResponse, hubPublicListingsResponse} from '../lib/hub-listings-http.mjs';
import {createHubListingsStore} from '../lib/hub-listings-store.mjs';
import {checkListingToken, readPublicListingDestination, verifyListingPublication} from '../lib/hub-listings-verification.mjs';
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
    destinationReader:async entry=>entry.order !== '2'
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
    destinationReader:async()=>true};
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

test('public reads check current Pages metadata and avoid anonymous fallback', async () => {
  const publicToken = 'github_pat_fixtureOnly1234567890123456';
  const entry = {...receipt, accountId:'6', pagesUrl:'https://games.example.test/'};
  const testEnv = {...env, ZERO_HUB_LISTINGS_GITHUB_READ_TOKEN:publicToken};
  let pages = {public:true, build_type:'workflow', cname:'games.example.test', html_url:entry.pagesUrl};
  const fetchImpl = async (url, options)=>{
    assert.equal(options.headers.Authorization, 'Bearer ' + publicToken);
    assert.equal(options.redirect, 'manual');
    return url.endsWith('/pages') ? Response.json(pages) : Response.json({
      id:21, private:false, owner:{id:6,type:'User'}, html_url:receipt.repositoryUrl
    });
  };
  assert.equal(await readPublicListingDestination(entry, {env:testEnv, fetchImpl, signal}), true);
  pages = {...pages, cname:null, html_url:receipt.pagesUrl};
  assert.equal(await readPublicListingDestination(entry, {env:testEnv, fetchImpl, signal}), false);
  await assert.rejects(readPublicListingDestination(entry, {env, fetchImpl, signal}), /read credential/);
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
