import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {getJamsResponse,getJamResponse,postJamProposalResponse,postJamActionResponse,postJamSettlementResponse} from '../lib/jams-http.mjs';
import {JamError} from '../../jams/service.mjs';
import {requestPayload} from '../../jams/requests.mjs';

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
  const body = {operationId:'proposal-12345678',repositoryUrl:'https://github.com/student/jam',commit:'a'.repeat(40)};
  assert.equal((await postJamProposalResponse(request({...body,approve:true}),f)).status,400);
  assert.equal((await postJamProposalResponse(request({...body,repositoryUrl:'a'.repeat(17000)}),f)).status,413);
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


test('settlement retains Origin/session/CSRF/current identity guards and derives only its own actor',async()=>{
  const f=fixture();f.service.settle=async input=>{f.calls.push(['settle',input]);return {operationId:input.operationId,scope:input.scope,settlement:'not-applied',status:'not-applied'};};
  const input={operationId:'earlier-operation',scope:'jam-55',payload:{action:'join',revision:'a'.repeat(64)}};
  for(const [headers,status]of [[{Origin:'https://evil.test'},403],[{Cookie:''},401],[{'X-Hub-CSRF':'wrong'},403],[{'Content-Type':'text/plain'},415]])assert.equal((await postJamSettlementResponse(request(input,headers),f)).status,status);
  assert.equal(f.calls.length,0);assert.equal((await postJamSettlementResponse(request({...input,actor:{id:'999'}}),f)).status,400);
  const response=await postJamSettlementResponse(request(input),f);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).settlement,'not-applied');assert.deepEqual(f.calls.at(-1),['settle',{...input,actor:{id:'123',login:'renamed'}}]);
  const before=f.calls.length;await postJamSettlementResponse(request(input),{...f,fetchImpl:async()=>Response.json({id:999,login:'other'})});assert.equal(f.calls.length,before);
});
test('normal action replay of a closed request is explicit409 for older clients while close returns200',async()=>{
  const f=fixture(),result={scope:'jam-55',operationId:join.operationId,eventId:'jam-55',settlement:'not-applied',status:'not-applied'};f.service.mutate=async()=>result;
  const response=await postJamActionResponse(request(join),'jam-55',f);assert.equal(response.status,409);const body=await response.json();assert.equal(body.operationId,join.operationId);assert.equal(body.settlement,'not-applied');assert.match(body.error,/closed without being applied/);
});


test('a maximum-size multibyte original request can close within bounded wrapper overhead',async()=>{
  const f=fixture(),operationId='o'.repeat(100),scope='jam-'+'9'.repeat(20);
  const payload={action:'submit',revision:'a'.repeat(64),source:{repositoryUrl:'https://github.com/student/project',commit:'a'.repeat(40)},title:'Entry',description:'é'.repeat(1800)+'a'.repeat(400),instructions:'界'.repeat(4000),demoUrl:'https://student.github.io/project/'};
  // Keep both text fields valid while placing the exact original body near16KiB.
  payload.description='é'.repeat(1800)+'a'.repeat(200);
  while(Buffer.byteLength(JSON.stringify({...payload,operationId}))<16370)payload.demoUrl+='x';
  assert.doesNotThrow(()=>requestPayload(scope,payload));assert.ok(Buffer.byteLength(JSON.stringify({...payload,operationId}))<=16384);
  const input={scope,operationId,payload};assert.ok(Buffer.byteLength(JSON.stringify(input))>16384);f.service.settle=async body=>({operationId:body.operationId,scope:body.scope,settlement:'not-applied',status:'not-applied'});
  assert.equal((await postJamActionResponse(request({...payload,operationId}),scope,f)).status,200);assert.equal((await postJamSettlementResponse(request(input),f)).status,200);
  payload.demoUrl+='x'.repeat(100);assert.equal((await postJamSettlementResponse(request({...input,payload}),f)).status,413,'original-payload limit remains16KiB');
  assert.equal((await postJamSettlementResponse(request({scope,operationId,payload:{junk:'x'.repeat(17500)}}),f)).status,413,'wrapper itself is also bounded');
});
