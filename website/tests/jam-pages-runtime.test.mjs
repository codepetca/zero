import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createJamPagesRuntimeReader} from '../lib/jam-pages-runtime.mjs';

const writer=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=pair => pair.privateKey.export({type:'pkcs8',format:'pem'});
const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_APP_ID:'5367740',ZERO_JAMS_PRIVATE_KEY:pem(writer)};
const saved={url:'https://github.com/student/game',id:'42',ownerId:'7'}, url='https://student.github.io/game/';
const repo={id:42,name:'game',full_name:'student/game',private:false,owner:{id:7,login:'student'}};
const installation={id:99,app_id:5367740,account:{id:7,login:'student',type:'User'},target_id:7,target_type:'User',suspended_at:null,permissions:{pages:'write',metadata:'read',contents:'write',actions:'write',workflows:'write'}};
function fixture() {
  const calls=[]; const grant={token:'synthetic-token',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{pages:'read',metadata:'read'},repository_selection:'selected',repositories:[repo]};
  const responses=[installation,grant,repo,{html_url:url,public:true,status:'built'},repo];
  return {calls,fetchImpl:async (endpoint,options) => {calls.push({endpoint,options}); return Response.json(responses[calls.length-1],{status:calls.length===2?201:200});}};
}
test('uses the existing Zero App and binds only the requested repository',async () => {
  const f=fixture(), time=Date.now(), read=createJamPagesRuntimeReader({env,fetchImpl:f.fetchImpl,now:()=>time});
  assert.equal(f.calls.length,0);
  assert.deepEqual(await read(saved,url),{status:'verified',pagesUrl:url,repositoryId:'42',ownerId:'7'});
  const jwt=f.calls[0].options.headers.Authorization.slice(7),parts=jwt.split('.');
  assert.equal(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),writer.publicKey,Buffer.from(parts[2],'base64url')),true);
  assert.deepEqual(JSON.parse(Buffer.from(parts[1],'base64url')),{iat:Math.floor(time/1000)-60,exp:Math.floor(time/1000)+300,iss:'5367740'});
  assert.deepEqual(JSON.parse(f.calls[1].options.body),{repository_ids:[42],permissions:{pages:'read',metadata:'read'}});
});
test('missing, malformed or wrong identity or key fail closed with no fetch',async () => {
  for(const patch of [{ZERO_JAMS_APP_ID:undefined},{ZERO_JAMS_PRIVATE_KEY:undefined},{ZERO_JAMS_APP_ID:'123'},
    {ZERO_JAMS_PRIVATE_KEY:'bad'}, {ZERO_JAMS_APP_ID:'01'},
    {NODE_ENV:'production'},{VERCEL_ENV:'production'},{ZERO_JAMS_ENABLED:'0'}]) {
    const f=fixture(), read=createJamPagesRuntimeReader({env:{...env,...patch},fetchImpl:f.fetchImpl});
    assert.deepEqual(await read(saved,url),{status:'unverified',reason:'unavailable'});assert.equal(f.calls.length,0);
  }
});
test('signing and provider failures do not reveal credentials',async () => {
  const read=createJamPagesRuntimeReader({env,fetchImpl:async () => {throw new Error(env.ZERO_JAMS_PRIVATE_KEY);}});
  assert.deepEqual(await read(saved,url),{status:'unverified',reason:'unavailable'});
  const invalidClock=createJamPagesRuntimeReader({env,fetchImpl:async()=>assert.fail(),now:()=>NaN});
  assert.deepEqual(await invalidClock(saved,url),{status:'unverified',reason:'unavailable'});
});
test('preview hold is checked again after an in-flight observation',async () => {
  const mutable={...env}; const f=fixture();
  const read=createJamPagesRuntimeReader({env:mutable,fetchImpl:async (...args) => {const result=await f.fetchImpl(...args); if(f.calls.length===5)mutable.VERCEL_ENV='production'; return result;}});
  assert.deepEqual(await read(saved,url),{status:'unverified',reason:'unavailable'});
});
