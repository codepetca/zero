import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {getJamsResponse,getJamResponse,postJamProposalResponse,postJamActionResponse,getDesktopJamJoinResponse,postDesktopJamJoinResponse} from '../lib/jams-http.mjs';
import {JamError} from '../../jams/service.mjs';
import {createGitHubRepositoryVerifier} from '../../jams/github-source.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';
import {fixture as registryFixture,hostedManifest} from '../../jams/test/fixtures.mjs';

const now = 1_800_000_000_000;
const env = {NODE_ENV:'test',ZERO_JAMS_ENABLED:'1',ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),
  ZERO_HUB_GITHUB_SESSION_SECRET:randomBytes(32).toString('base64url')};
const config = hubConfig(env);
const {session,cookie} = newSession('ghu_'+'a'.repeat(24),{id:123,login:'student'},28800,config,now);
function request(body,headers = {},path = '/api/jams/jam-55/actions') {
  return new Request(config.origin+path,{method:'POST',headers:{Origin:config.origin,
    Cookie:cookie.split(';')[0],'X-Hub-CSRF':session.csrf,'Content-Type':'application/json',...headers},
    body:JSON.stringify(body)});
}
function fixture() {
  const calls = [];
  return {calls,env,now,fetchImpl:async (url,options) => {
    calls.push(['identity',url,options]); return Response.json({id:123,login:'renamed'});
  },service:{
    list:async () => ({events:[{id:'jam-55',title:'Fixture jam'}]}),
    read:async (id,actor) => {calls.push(['read',id,actor]);return {event:{id},registration:null,entry:null};},
    propose:async input => {calls.push(['propose',input]);return {eventId:'jam-55',operationId:input.operationId,status:'submitted'};},
    mutate:async input => {calls.push(['mutate',input]);return {eventId:input.id,operationId:input.operationId,status:'joined'};}
  }};
}
const join = {operationId:'operation-12345678',action:'join',revision:1};

test('desktop Game Jam join verifies the app and repository, keeps the existing binding after registration closes',async()=>{
  const participant={id:'123',login:'student'},identity={id:123,login:'student'},token='ghu_'+'a'.repeat(24);
  const providerCalls=[];
  const {service,store,setTime}=registryFixture({limits:{participants:1},verifyRepository:async ({actor,repositoryUrl})=>{
    assert.deepEqual(actor,participant);
    const name=repositoryUrl.split('/').at(-1);
    return {repository:{id:name==='project'?'202':'203',ownerId:actor.id,fullName:actor.login+'/'+name}};
  }});
  const {eventId,revision}=await service.propose({actor:{id:'11',login:'creator'},operationId:'desktop-fixture-event',manifest:hostedManifest()});
  const path='/api/desktop/jams/'+eventId+'/join';
  const joinBody={operationId:'desktop-join-0001',revision,repositoryId:'202',repositoryUrl:'https://github.com/student/project'};
  let appId=config.clientId;
  const options={env,now,service,fetchImpl:async (url,init)=>{
    providerCalls.push(url);
    if(url==='https://api.github.com/applications/'+config.clientId+'/token') {
      assert.equal(JSON.parse(init.body).access_token,token);
      assert.match(init.headers.Authorization,/^Basic /);
      return Response.json({user:identity,app:{client_id:appId}});
    }
    assert.equal(url,'https://api.github.com/user');
    assert.equal(init.headers.Authorization,'Bearer '+token);
    return Response.json(identity);
  }};
  const desktopJoin=(body=joinBody,headers={})=>postDesktopJamJoinResponse(new Request(config.origin+path,{
    method:'POST',headers:{'X-Zero-Desktop':'1',Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},
    body:JSON.stringify(body)
  }),eventId,options);
  const desktopRead=(headers={})=>getDesktopJamJoinResponse(new Request(config.origin+path,{
    headers:{'X-Zero-Desktop':'1',Authorization:'Bearer '+token,...headers}
  }),eventId,options);
  for(const headers of [{Origin:config.origin},{'Sec-Fetch-Site':'same-origin'},{Cookie:cookie.split(';')[0]},{'X-Zero-Desktop':''}])
    assert.equal((await desktopJoin(joinBody,headers)).status,403);
  assert.equal((await desktopJoin(joinBody,{Authorization:''})).status,401);
  assert.equal((await desktopRead({Origin:config.origin})).status,403);
  assert.equal((await desktopRead({Authorization:''})).status,401);
  assert.equal((await desktopJoin({...joinBody,actor:participant})).status,400);
  const {repositoryId,...withoutRepositoryId}=joinBody;
  assert.equal((await desktopJoin(withoutRepositoryId)).status,400);
  for(const badId of ['0202','202\n',202,''])assert.equal((await desktopJoin({...joinBody,repositoryId:badId})).status,400);
  assert.equal(providerCalls.length,0);
  appId='wrong-app';
  assert.equal((await desktopJoin()).status,401);
  assert.equal(providerCalls.length,1);
  appId=config.clientId;
  const replaced=await desktopJoin({...joinBody,repositoryId:'203'});
  assert.equal(replaced.status,409);
  assert.match((await replaced.json()).error,/repository at that address changed/);
  assert.equal((await store.read(eventId)).state.registrations[participant.id],undefined);
  const first=await desktopJoin();
  assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{configured:true,eventId,operationId:joinBody.operationId,status:'joined',revision});
  assert.equal((await store.read(eventId)).state.registrations[participant.id].repository.id,'202');
  const rebind=await desktopJoin({...joinBody,operationId:'desktop-join-0003',repositoryId:'203',repositoryUrl:'https://github.com/student/another-project'});
  assert.equal(rebind.status,409);
  assert.match((await rebind.json()).error,/different repository/);
  assert.equal((await store.read(eventId)).state.registrations[participant.id].repository.id,'202');
  identity.id=124;identity.login='other';
  const outside=await (await desktopRead()).json();
  assert.equal(outside.registration,null);
  assert.equal(outside.hasRegistrationSpace,false);
  identity.id=123;identity.login='student';
  setTime('2030-01-03T00:00:00Z');
  assert.equal((await desktopJoin()).status,200,'the original operation recovers after the deadline');
  const wrongId=await desktopJoin({...joinBody,repositoryId:'203'});
  assert.equal(wrongId.status,409);
  assert.match((await wrongId.json()).error,/operation ID was used for different information/);
  assert.equal((await desktopJoin({...joinBody,operationId:'desktop-join-0002'})).status,409,'a new join operation cannot consume capacity after the deadline');
  assert.deepEqual((await (await desktopRead()).json()).registration,{status:'joined',repository:{id:'202',ownerId:'123',fullName:'student/project'}});
  await service.mutate({id:eventId,actor:participant,operationId:'desktop-leave-0001',action:'leave'});
  const recovered=await desktopRead();
  assert.equal(recovered.status,200);
  const status=await recovered.json();
  assert.deepEqual(Object.keys(status),['configured','event','hasRegistrationSpace','registration']);
  assert.equal(status.hasRegistrationSpace,true,'a returning participant keeps their registration slot');
  assert.equal(status.event.registrationOpen,false);
  assert.equal(status.event.participants,undefined);
  assert.deepEqual(status.registration,{status:'left',repository:{id:'202',ownerId:'123',fullName:'student/project'}});
});

test('desktop rejoin offers a new project after the old repository disappears by ID',async()=>{
  const actor={id:'123',login:'student'},user={id:123,login:'student'},token='ghu_'+'a'.repeat(24);
  const repositoryUrl='https://github.com/student/project';
  let currentId=202,oldStatus=200;
  const githubRepo=id=>Response.json({id,owner:{id:123,type:'User'},full_name:'student/project',private:false});
  const fetchImpl=async(url)=>{
    switch(url) {
      case 'https://api.github.com/applications/'+config.clientId+'/token':
        return Response.json({user,app:{client_id:config.clientId}});
      case 'https://api.github.com/user': return Response.json(user);
      case 'https://api.github.com/repos/student/project': return githubRepo(currentId);
      case 'https://api.github.com/repositories/202':
        return oldStatus===200?githubRepo(202):new Response(null,{status:oldStatus});
      default: throw Error(`Unexpected provider request ${url}`);
    }
  };
  const {service,store,setTime}=registryFixture({limits:{participants:1},verifyRepository:createGitHubRepositoryVerifier({token,fetchImpl})});
  const {eventId,revision}=await service.propose({actor:{id:'11',login:'creator'},operationId:'desktop-rejoin-event',manifest:hostedManifest()});
  const headers={'X-Zero-Desktop':'1',Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const url=config.origin+'/api/desktop/jams/'+eventId+'/join',options={env,now,service,fetchImpl};
  const read=()=>getDesktopJamJoinResponse(new Request(url,{headers}),eventId,options);
  const join=(repositoryId,operationId)=>postDesktopJamJoinResponse(new Request(url,{method:'POST',headers,
    body:JSON.stringify({repositoryId,operationId,repositoryUrl,revision})}),eventId,options);
  assert.equal((await join('202','rejoin-original')).status,200);
  currentId=203;
  oldStatus=404;
  assert.equal((await join('203','rejoin-still-joined')).status,409);
  assert.equal((await (await read()).json()).registration.repository.id,'202');
  await service.mutate({id:eventId,actor,operationId:'rejoin-leave',action:'leave'});

  // Reusing a URL is insufficient while the old numeric ID still resolves.
  oldStatus=200;
  assert.equal((await (await read()).json()).registration.repository.id,'202');
  assert.equal((await join('203','rejoin-old-present')).status,409);
  oldStatus=503;
  assert.equal((await read()).status,503);
  assert.equal((await join('203','rejoin-provider-down')).status,503);
  oldStatus=404;
  const ready=await (await read()).json();
  assert.deepEqual(ready.registration,{status:'left'});
  assert.equal(ready.hasRegistrationSpace,true);
  assert.equal((await service.readOverview(eventId,actor)).registration.repository.id,'202');
  assert.equal((await join('203','rejoin-replacement')).status,200);
  assert.equal((await (await read()).json()).registration.repository.id,'203');
  assert.equal((await service.projectDestination('202',actor)).destination,null);
  assert.equal((await service.projectDestination('203',actor)).destination.id,eventId);
  assert.equal((await service.read(eventId,actor)).event.participantCount,1);
  assert.equal((await service.read(eventId,actor)).entry,null);
  const snapshot=await store.snapshot();
  const reveal=Date.parse('2030-01-05T00:00:00Z');
  assert.deepEqual([...(await projectVisibility(snapshot,reveal-1)).heldRepositoryIds()].sort(),['202','203']);
  assert.deepEqual((await projectVisibility(snapshot,reveal)).heldRepositoryIds(),[]);
  setTime(reveal);
  assert.equal((await join('203','rejoin-replacement')).status,200);
});

test('directory hosting access is private and derived from the signed-in account and service policy',async()=>{
  const {service}=registryFixture({canCreateJam:id=>id==='123'});
  const free=newSession('ghu_'+'b'.repeat(24),{id:124,login:'free'},28800,config,now);
  const url=config.origin+'/api/jams?view=summaries&accountId=123';
  for(const [sessionCookie,access] of [[cookie,{accountId:'123',canCreate:true}],
    [free.cookie,{accountId:'124',canCreate:false}],['',undefined]]) {
    const response=await getJamsResponse(new Request(url,{headers:{Cookie:sessionCookie.split(';')[0]}}),{env,now,service});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual((await response.json()).hostingAccess,access);
  }
});

test('jams default off and missing credentials cannot execute an injected action accidentally',async () => {
  const f = fixture();
  for (const options of [{...f,env:{}},{...f,env:{...env,ZERO_JAMS_ENABLED:'0'}},{env,now}]) {
    assert.equal((await postJamActionResponse(request(join),'jam-55',options)).status,503);
  }
  assert.equal(f.calls.length,0);
  assert.equal((await getJamsResponse(new Request(config.origin),{env:{}})).status,503);
});

test('origin, session, CSRF, type and event path guard writes before GitHub or service access',async () => {
  const f = fixture();
  for (const [headers,status] of [[{Origin:'https://evil.test'},403],[{Cookie:''},401],
    [{'X-Hub-CSRF':'wrong'},403],[{'Content-Type':'text/plain'},415]]) {
    assert.equal((await postJamActionResponse(request(join,headers),'jam-55',f)).status,status);
  }
  assert.equal((await postJamActionResponse(request(join),'../../other',f)).status,404);
  assert.equal(f.calls.length,0);
});

test('actor and target are server derived and clients cannot inject role/actor fields',async () => {
  const f = fixture();
  for (const extra of [{actor:{id:'999'}},{id:'jam-99'},{maintainer:true},{token:'secret'}])
    assert.equal((await postJamActionResponse(request({...join,...extra}),'jam-55',f)).status,400);
  assert.equal(f.calls.length,0);
  const response = await postJamActionResponse(request(join),'jam-55',f);
  assert.equal(response.status,200);
  assert.deepEqual(f.calls.at(-1),['mutate',{...join,id:'jam-55',actor:{id:'123',login:'renamed'}}]);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(f.calls[0][1],'https://api.github.com/user');
  assert.equal(f.calls[0][2].redirect,'error');
});

test('schedule edits use the signed-in organizer on the existing jam action route',async () => {
  const {service}=registryFixture({scheduleEditsEnabled:true});
  const initial=await service.propose({
    actor:{id:'123',login:'student'},operationId:'host-original-jam',manifest:hostedManifest()
  });
  const f={...fixture(),service};
  const id=initial.eventId;
  const body={operationId:'edit-existing-jam',action:'edit-schedule',revision:initial.revision,
    schedule:{galleryRevealAt:'2030-01-06T00:00:00Z'}};
  const editPath='/api/jams/'+id+'/actions';
  assert.equal((await postJamActionResponse(request({...body,timezone:'UTC'}, {}, editPath),id,f)).status,400);
  const response=await postJamActionResponse(request(body,{},editPath),id,f);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const receipt=await response.json();
  assert.equal(receipt.eventId,id);
  assert.equal(receipt.status,'schedule-updated');

  const url=config.origin+'/api/jams/'+id+'?view=overview';
  const read=await getJamResponse(new Request(url,{headers:{Cookie:cookie.split(';')[0]}}),id,f);
  const detail=await read.json();
  assert.equal(detail.canEditSchedule,true);
  assert.equal(detail.event.revision,receipt.revision);
  assert.equal(detail.event.schedule.galleryRevealAt,'2030-01-06T00:00:00.000Z');
  assert.equal((await (await getJamResponse(new Request(url),id,f)).json()).canEditSchedule,undefined);
});

test('new GitHub identity, revocation and network failures cannot accept an action',async () => {
  const f = fixture();
  const drift = await postJamActionResponse(request(join),'jam-55',{...f,
    fetchImpl:async () => Response.json({id:999,login:'other'})});
  assert.equal(drift.status,401);
  const revoked = await postJamActionResponse(request(join),'jam-55',{...f,
    fetchImpl:async () => Response.json({message:'Bad credentials'},{status:401})});
  assert.equal(revoked.status,503);
  assert.equal(f.calls.length,0);
});

test('proposal body is bounded and never dispatches client-supplied approval',async () => {
  const f = fixture();
  const body = {operationId:'proposal-12345678',manifest:hostedManifest()};
  assert.equal((await postJamProposalResponse(request({...body,approve:true}),f)).status,400);
  assert.equal((await postJamProposalResponse(request({...body,manifest:{...body.manifest,rules:'a'.repeat(17000)}}),f)).status,413);
  assert.equal((await postJamProposalResponse(request({operationId:body.operationId,repositoryUrl:'https://github.com/student/jam',commit:'a'.repeat(40)}),f)).status,400);
  assert.equal(f.calls.length,0);
  assert.equal((await postJamProposalResponse(request(body),f)).status,200);
  assert.deepEqual(f.calls.at(-1),['propose',{...body,actor:{id:'123',login:'renamed'}}]);
});

test('read privacy belongs to service actor projection and no-store responses',async () => {
  const f = fixture();
  const anonymous = await getJamResponse(new Request(config.origin+'/api/jams/jam-55'),'jam-55',f);
  assert.equal(anonymous.status,200);assert.equal(f.calls.at(-1)[2],undefined);
  await getJamResponse(new Request(config.origin+'/api/jams/jam-55',{headers:{Cookie:cookie.split(';')[0]}}),'jam-55',f);
  assert.deepEqual(f.calls.at(-1)[2],{id:'123',login:'student'});
  assert.equal(anonymous.headers.get('cache-control'),'no-store');
});

test('service errors retain useful safe correction and infrastructure errors disclose no secrets',async () => {
  const f = fixture();
  f.service.mutate = async () => {throw new JamError(409,'Submissions have closed.');};
  const closed = await postJamActionResponse(request(join),'jam-55',f);
  assert.equal(closed.status,409);assert.match((await closed.json()).error,/closed/);
  f.service.mutate = async () => {throw new Error('private-key/token/source-secret');};
  const failed = await postJamActionResponse(request(join),'jam-55',f);
  assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(await failed.json()),/private-key|source-secret/);
});

test('hosted event IDs are accepted on read and action paths while malformed IDs are rejected',async()=>{
  const f=fixture(),id='jam-zero-'+'a'.repeat(32);
  assert.equal((await getJamResponse(new Request(config.origin),id,f)).status,200);
  assert.equal((await postJamActionResponse(request(join),id,f)).status,200);
  for(const invalid of ['jam-zero-'+'a'.repeat(31),'jam-zero-'+'A'.repeat(32),'jam-zero-../secret'])assert.equal((await getJamResponse(new Request(config.origin),invalid,f)).status,404);
});

test('showcase repository and Pages Join reach the service with only server-derived identity',async()=>{
  const f=fixture(),input={...join,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'};
  const response=await postJamActionResponse(request(input),'jam-55',f);
  assert.equal(response.status,200);
  assert.deepEqual(f.calls.at(-1),['mutate',{...input,id:'jam-55',actor:{id:'123',login:'renamed'}}]);
});

test('settlement endpoint authenticates current actor, retains payload identity and protects terminal envelopes',async()=>{
  const {postJamSettlementResponse}=await import('../lib/jams-http.mjs');
  const f=fixture(),id='jam-zero-'+'a'.repeat(32),body={scope:id,operationId:'closed-operation-001',payload:{action:'leave'}};
  f.service.settle=async input=>{f.calls.push(['settle',input]);return {scope:input.scope,eventId:input.scope,operationId:input.operationId,status:'not-applied',settlement:'not-applied'};};
  for(const [headers,expected] of [[{Origin:'https://evil.test'},403],[{Cookie:''},401],[{'X-Hub-CSRF':'wrong'},403]])assert.equal((await postJamSettlementResponse(request(body,headers),f)).status,expected);
  assert.equal(f.calls.length,0);
  assert.equal((await postJamSettlementResponse(request({...body,actor:{id:'999'}}),f)).status,400);
  const closed=await postJamSettlementResponse(request(body),f);
  assert.equal(closed.status,200);assert.equal((await closed.json()).settlement,'not-applied');
  assert.deepEqual(f.calls.at(-1),['settle',{...body,actor:{id:'123',login:'renamed'}}]);
  f.service.mutate=async()=>({eventId:id,operationId:body.operationId,settlement:'not-applied',status:'not-applied',scope:id});
  assert.equal((await postJamActionResponse(request(join),id,f)).status,409,'older clients cannot mistake a durable close for Join success');
  f.service.propose=async()=>({operationId:body.operationId,settlement:'not-applied',status:'not-applied',scope:'proposals'});
  assert.equal((await postJamProposalResponse(request({operationId:body.operationId,manifest:hostedManifest()}),f)).status,409);
});

test('settlement and mutation expiry keep results unknown even when an injected service rejects late',{timeout:5000},async t=>{
  const {postJamSettlementResponse}=await import('../lib/jams-http.mjs');
  t.mock.timers.enable({apis:['setTimeout']});
  for(const settlement of [false,true]) {
    const f=fixture();let finish,dispatch,elapsed=0;
    const started=new Promise(resolve=>{dispatch=resolve;});
    f.service.settle=f.service.mutate=()=>new Promise((_,reject)=>{
      finish=()=>reject(new JamError(409,'Too late'));
      dispatch();
    });
    const body=settlement?{scope:'jam-55',operationId:'unknown-operation-001',payload:{action:'leave'}}:join;
    const options={...f,responseBudgetMs:10,deadlineNow:()=>elapsed};
    const call=settlement?postJamSettlementResponse(request(body),options):postJamActionResponse(request(body),'jam-55',options);
    await started;
    elapsed=10;
    t.mock.timers.tick(elapsed);
    const response=await call;assert.equal(response.status,503);assert.match((await response.json()).error,/same operation ID/);finish();
  }
});

test('request cancellation reaches jam read and participation service calls',async()=>{
  for (const kind of ['list','read','mutate']) {
    const f=fixture(),controller=new AbortController();let dispatched;
    const started=new Promise(resolve=>{dispatched=resolve;});let received;
    f.service[kind]=async (...args)=>{received=args.at(-1).signal;dispatched();return await new Promise(resolve=>received.addEventListener('abort',()=>resolve({}),{once:true}));};
    const req=kind==='mutate'?new Request(request(join),{signal:controller.signal}):new Request(config.origin,{signal:controller.signal});
    const response=kind==='list'?getJamsResponse(req,f):kind==='read'?getJamResponse(req,'jam-55',f):postJamActionResponse(req,'jam-55',f);
    await started;assert.ok(received instanceof AbortSignal);assert.equal(received.aborted,false);
    controller.abort();assert.equal((await response).status,503);assert.equal(received.aborted,true);
  }
});
