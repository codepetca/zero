import test from 'node:test';
import assert from 'node:assert/strict';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig, newSession} from '../lib/hub-github-auth.mjs';
import {createHubProjectStatusService, hubProjectsResponse, hubTargetVisible, hubVisibilityDecision, resolveHubProject} from '../lib/hub-project-status.mjs';
import {getStarResponse, postStarResponse} from '../lib/hub-stars.mjs';
import {recordOpen} from '../lib/hub-opens.mjs';

const env = {NODE_ENV:'test', ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId, ZERO_HUB_GITHUB_CLIENT_SECRET:'s'.repeat(32),
  ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32, 1).toString('base64url')};
const now = 1_800_000_000_000, config = hubConfig(env);
const {session, cookie} = newSession('ghu_'+'a'.repeat(24), {id:123,login:'student'}, 28800, config, now);
const id = 'game-r202-project', libraryId = 'lib-r202-helper', otherId = 'game-r303-project';
const repositoryUrl = 'https://github.com/student/project', playUrl = 'https://student.github.io/project/';
const decision = held => Object.freeze({revision:'a'.repeat(40), observedAt:0, isHeld:repositoryId => held.includes(repositoryId)});
const destinationReader = async url => { const [,owner,repo] = new URL(url).pathname.split('/'); return {repositoryUrl:url,owner,repo,repositoryId:repo==='other'?'303':'202',ownerId:'7'}; };
const target = {id, kind:'game', repositoryId:'202', repositoryUrl, playUrl};
const release = (repositoryId, overrides = {}) => ({kind:'game', id:`game-r${repositoryId}-project`, version:'0.1.0',
  status:'available', title:'Project', description:'A project', contributor:{login:'student'}, repository:{id:repositoryId,url:repositoryId==='303'?'https://github.com/student/other':repositoryUrl}, source:{commit:'b'.repeat(40)},
  web:{provider:'github-pages',url:playUrl,commit:'b'.repeat(40),runId:1}, ...overrides});
const catalogReader = async () => ({releases:[release('202'), release('303'),
  release('202',{kind:'library',id:libraryId,web:undefined})]});
const statusRequest = (ids = id, kind = 'game') => new Request(`${config.origin}/api/hub/projects?kind=${kind}&ids=${ids}`);
const starRequest = (method, kind = 'game', selectedId = id) => new Request(`${config.origin}/api/hub/github/stars${method==='GET'?`?kind=${kind}&id=${selectedId}`:''}`,{
  method, headers:{Cookie:cookie.split(';')[0], ...(method==='POST'?{Origin:config.origin,'X-Hub-CSRF':session.csrf,'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({kind,id:selectedId,starred:true})}:{})});
const openRequest = () => new Request(`${config.origin}/api/hub/opens`, {method:'POST',
  headers:{Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({id})});

test('explicit inactive decisions differ from missing, undefined and malformed authority', async () => {
  let reads=0;
  const visibilityReader=async()=>{reads++;return decision(['202']);};
  assert.equal(await hubVisibilityDecision({visibility:null,visibilityReader}),null);
  assert.equal(reads,0);
  assert.equal((await hubVisibilityDecision({visibilityReader})).isHeld('202'),true);
  assert.equal(reads,1);
  for(const visibility of [undefined,false,{}, {revision:'a'.repeat(40),observedAt:0, isHeld:()=>null},
    {revision:'invalid',isHeld:()=>false}]){
    await assert.rejects(async()=>hubTargetVisible(target,visibility),/unavailable/);
    if(visibility?.isHeld && visibility.revision==='a'.repeat(40))continue;
    await assert.rejects(hubVisibilityDecision({visibility,visibilityReader}),/unavailable/);
  }
  assert.equal(reads,1);
  await assert.rejects(hubVisibilityDecision({visibilityReader:async()=>undefined}),/unavailable/);
});

test('resolver gates immutable metadata across IDs and hides libraries in the same held repository', async () => {
  const visibility=decision(['202']);
  for(const selectedId of [id,'game-r202-other-slug']){
    assert.equal(await resolveHubProject({kind:'game',id:selectedId},{visibility,catalogReader:async()=>({releases:[release('202',{id:selectedId})]})}),null);
  }
  assert.equal((await resolveHubProject({kind:'game',id:otherId},{visibility,catalogReader,visibilityReader:async()=>visibility,destinationReader})).repositoryId,'303');
  assert.equal(await resolveHubProject({kind:'library',id:libraryId},{visibility,catalogReader}),null);
  const maintainedProjects=[{...target,id:'maintained'}];
  assert.equal(await resolveHubProject({kind:'game',id:'maintained'},{visibility,maintainedProjects}),null);
  assert.equal((await resolveHubProject({kind:'game',id:'maintained'},{visibility:decision([]),maintainedProjects,visibilityReader:async()=>decision([]),destinationReader})).repositoryId,'202');
  for(const repositoryId of [undefined,202,'0202','202x']){
    assert.equal(await resolveHubProject({kind:'game',id},{visibility,catalogReader:async()=>({releases:[release(repositoryId,{id})]})}),null);
    const maintainedProjects=[{...target,id:'maintained',repositoryId,web:{provider:'github-pages',url:playUrl,commit:'b'.repeat(40),runId:1}}];
    assert.equal(await resolveHubProject({kind:'game',id:'maintained'},{visibility,maintainedProjects}),null);
    assert.equal((await resolveHubProject({kind:'game',id:'maintained'},{visibility:null,maintainedProjects})).repositoryUrl,repositoryUrl);
  }
});

test('production maintained games fail closed when shared authority is unavailable or inactive', async () => {
  const production={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_ENABLED:'1'};
  await assert.rejects(resolveHubProject({kind:'game',id:'drawing-pad'},{env:production,visibilityReader:async()=>{throw Error('authority unavailable');}}));
  await assert.rejects(resolveHubProject({kind:'game',id:'drawing-pad'},{env:production,visibility:null}));
});

test('status batches share pre-work and final decisions and cached status cannot disclose a newly held game', async () => {
  let visibility=decision([]), reads=0, fetches=0;
  const visibilityReader=async()=>{reads++;return visibility;};
  const service=createHubProjectStatusService({env,catalogReader,visibilityReader,destinationReader,fetchImpl:async(_url,options)=>{
    fetches++;return options.method==='HEAD'?new Response(null,{status:200}):Response.json({id:_url.endsWith('/other')?303:202,owner:{id:7},stargazers_count:4,has_issues:true});
  }});
  const options={env,service,visibilityReader,destinationReader};
  const first=await hubProjectsResponse(statusRequest(`${id},${otherId}`),options);
  assert.equal(first.headers.get('cache-control'),'no-store');
  assert.equal((await first.json()).items.length,2);assert.equal(reads,13);assert.equal(fetches,3);
  visibility=decision(['202']);
  assert.deepEqual((await (await hubProjectsResponse(statusRequest(`${id},${otherId}`),options)).json()).items.map(item=>item.id),[otherId]);
  assert.equal(reads,21);assert.equal(fetches,3);
  const offline=await hubProjectsResponse(statusRequest(),{...options,visibilityReader:async()=>{throw Error('private authority failure');}});
  assert.equal(offline.status,503);assert.equal(offline.headers.get('cache-control'),'no-store');
  assert.equal((await offline.text()).includes('private authority failure'),false);assert.equal(fetches,3);
  assert.equal(await service.statusTarget(target,100,{visibility:decision(['202'])}),null);
});

test('custom resolvers receive one decision and cannot bypass the active status gate', async () => {
  const visibility=decision(['202']), seen=[];let reads=0,statusCalls=0;
  const service={resolve:async(selection,options)=>{seen.push(options.visibility);return {...target,id:selection.id};},
    statusTarget:async()=>{statusCalls++;throw Error('held target reached status');}};
  const response=await hubProjectsResponse(statusRequest(`${id},${otherId}`),{env,service,visibilityReader:async()=>{reads++;return visibility;}});
  assert.deepEqual(await response.json(),{schema:1,items:[]});
  assert.deepEqual(seen,[visibility,visibility]);assert.equal(reads,1);assert.equal(statusCalls,0);
});

test('star reads and writes deny held or unidentifiable targets without GitHub side effects', async () => {
  let calls=0;
  const fetchImpl=async()=>{calls++;return new Response(null,{status:204});};
  for(const method of ['GET','POST'])for(const resolved of [target,{...target,repositoryId:undefined}]){
    let reads=0;
    const options={env,now,fetchImpl,visibilityReader:async()=>{reads++;return decision(['202']);},
      resolver:async(_selection,options)=>{assert.ok(options.visibility);return resolved;}};
    const response=await (method==='GET'?getStarResponse:postStarResponse)(starRequest(method),options);
    assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(reads,1);
  }
  assert.equal(calls,0);
});

test('authority failure returns uncached 503 before resolver, GitHub or counter work', async () => {
  let sideEffects=0;
  const unexpected=async()=>{sideEffects++;throw Error('must not run');};
  for(const bad of [undefined,{}, {revision:'a'.repeat(40),observedAt:0, isHeld:()=>{throw Error('private');}}]){
    const visibilityReader=async()=>bad;
    const resolver=bad?.isHeld?async()=>target:unexpected;
    for(const response of [
      await getStarResponse(starRequest('GET'),{env,now,visibilityReader,resolver,fetchImpl:unexpected}),
      await postStarResponse(starRequest('POST'),{env,now,visibilityReader,resolver,fetchImpl:unexpected}),
      await recordOpen(openRequest(),{env,visibilityReader,resolve:resolver,store:{increment:unexpected}}),
      await hubProjectsResponse(statusRequest(),{env,visibilityReader,service:{resolve:resolver,statusTarget:unexpected}}),
    ]){
      assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal((await response.text()).includes('private'),false);
    }
  }
  assert.equal(sideEffects,0);
});

test('held Play activations return 404 with or without a configured counter', async () => {
  let writes=0,reads=0;
  const visibility=decision(['202']);
  for(const store of [null,{increment:async()=>{writes++;}}]){
    const response=await recordOpen(openRequest(),{env,store,visibilityReader:async()=>{reads++;return visibility;},
      resolve:async(_selection,options)=>{assert.equal(options.visibility,visibility);return target;}});
    assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(writes,0);assert.equal(reads,2);
});

test('library status and stars fail closed on authority failure', async () => {
  let reads=0,calls=0;
  const visibilityReader=async()=>{reads++;throw Error('game authority offline');};
  const fetchImpl=async()=>{calls++;return Response.json({stargazers_count:1,has_issues:true});};
  const service=createHubProjectStatusService({env,catalogReader,visibilityReader,fetchImpl});
  assert.equal((await hubProjectsResponse(statusRequest(libraryId,'library'),{env,service,visibilityReader})).status,503);
  const response=await getStarResponse(starRequest('GET','library',libraryId),{env,now,visibilityReader,
    resolver:async selection=>({...selection,repositoryUrl}),fetchImpl:async()=>{calls++;return new Response(null,{status:204});}});
  assert.equal(response.status,503);assert.equal(reads,2);assert.equal(calls,0);
});
