import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {getJamsResponse,getJamResponse,postJamProposalResponse,postJamActionResponse} from '../lib/jams-http.mjs';
import {JamError} from '../../jams/service.mjs';
import {hostedManifest} from '../../jams/test/fixtures.mjs';

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

test('settlement and mutation expiry keep results unknown even when an injected service rejects late',async()=>{
  const {postJamSettlementResponse}=await import('../lib/jams-http.mjs');
  for(const settlement of [false,true]) {
    const f=fixture();let finish;const pending=new Promise((resolve,reject)=>{finish=()=>reject(new JamError(409,'Too late'));});
    f.service.settle=f.service.mutate=()=>pending;
    const body=settlement?{scope:'jam-55',operationId:'unknown-operation-001',payload:{action:'leave'}}:join;
    const call=settlement?postJamSettlementResponse(request(body),{...f,responseBudgetMs:10}):postJamActionResponse(request(body),'jam-55',{...f,responseBudgetMs:10});
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
