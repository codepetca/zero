import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createJamRuntime,jamServiceConfig,jamInstallationToken} from '../lib/jams-runtime.mjs';

const now = 1_800_000_000_000;
const pair = generateKeyPairSync('rsa',{modulusLength:2048});
const privateKey = pair.privateKey.export({type:'pkcs8',format:'pem'});
const env = {NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_APP_ID:'5367740',ZERO_JAMS_INSTALLATION_ID:'456',
  ZERO_JAMS_PRIVATE_KEY:privateKey,ZERO_JAMS_MAINTAINER_IDS:'4050555'};
const installation = {id:456,app_id:5367740,account:{login:'codepetca'},permissions:{contents:'write'},suspended_at:null};
const result = {token:'ghs_'+'x'.repeat(30),expires_at:new Date(now+3600000).toISOString(),
  permissions:{contents:'write',metadata:'read'},repositories:[{full_name:'codepetca/zero'}]};

test('runtime binds review authority to the owner’s numeric GitHub identity',() => {
  assert.equal(jamServiceConfig({}),null);
  for (const patch of [{NODE_ENV:'production'},{VERCEL_ENV:'production'},{ZERO_JAMS_ENABLED:'0'},{ZERO_JAMS_PRIVATE_KEY:'not a key'},
    {ZERO_JAMS_MAINTAINER_IDS:'student'},{ZERO_JAMS_MAINTAINER_IDS:'12,12'},
    {ZERO_JAMS_MAINTAINER_IDS:'4050555,123'}, {ZERO_JAMS_MAINTAINER_IDS:''},
    {ZERO_JAMS_INSTALLATION_ID:'../evil'}]) assert.equal(jamServiceConfig({...env,...patch}),null);
  assert.deepEqual(jamServiceConfig(env).maintainerIds,['4050555']);
  const {ZERO_JAMS_MAINTAINER_IDS:unused,...withoutList}=env;
  assert.deepEqual(jamServiceConfig(withoutList).maintainerIds,['4050555']);
});

test('a wrong App configuration disables the service before any provider request',async () => {
  for (const appId of [undefined,'','123','05367740','5367741']) {
    const wrongApp = {...env,ZERO_JAMS_APP_ID:appId};
    assert.equal(jamServiceConfig(wrongApp),null);
    assert.equal(await createJamRuntime({env:wrongApp,fetchImpl:async () => assert.fail('Wrong App must not contact GitHub')}),null);
  }
});

test('installation JWT is signed and token request is limited to Zero contents',async () => {
  const calls = [],cache = new Map();
  const fetchImpl = async (url,options) => {
    calls.push([url,options]);return Response.json(calls.length === 1 ? installation : result);
  };
  assert.equal(await jamInstallationToken(jamServiceConfig(env),{fetchImpl,now,cache}),result.token);
  const jwt = calls[0][1].headers.Authorization.slice(7),parts = jwt.split('.');
  assert.equal(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),pair.publicKey,Buffer.from(parts[2],'base64url')),true);
  const payload = JSON.parse(Buffer.from(parts[1],'base64url'));
  assert.equal(payload.iss,'5367740');assert.equal(payload.iat,now/1000-60);assert.equal(payload.exp,now/1000+300);
  assert.equal(calls[0][0],'https://api.github.com/app/installations/456');
  assert.deepEqual(JSON.parse(calls[1][1].body),{repositories:['zero'],permissions:{contents:'write',metadata:'read'}});
  assert.equal(calls[1][1].redirect,'error');
  await jamInstallationToken(jamServiceConfig(env),{fetchImpl,now,cache});
  assert.equal(calls.length,2,'Warm instance reuses the short-lived token without another mint');
});

test('accepts both opaque and longer stateless installation tokens without exposing them',async()=>{
  const {credential}=await import('../../jams/github-transport.mjs');
  for(const token of ['ghs_'+'x'.repeat(36),'ghs_123456_'+('A'.repeat(170))+'.'+('b'.repeat(170))+'.'+('c-_'.repeat(58))]) {
    let count=0;
    const returned=await jamInstallationToken(jamServiceConfig(env),{now,cache:new Map(),
      fetchImpl:async()=>Response.json(++count===1?installation:{...result,token})});
    assert.equal(returned,token);assert.doesNotThrow(()=>credential(returned));
  }
  for(const token of ['ghs_abc\nheader:bad','ghs_'+('x'.repeat(1021))]) {
    let count=0;
    await assert.rejects(jamInstallationToken(jamServiceConfig(env),{now,cache:new Map(),
      fetchImpl:async()=>Response.json(++count===1?installation:{...result,token})}),/unavailable/);
  }
});

test('wrong owner/app, suspended installation or unexpected token scope fail closed',async () => {
  for (const bad of [{...installation,account:{login:'student'}},{...installation,app_id:999},
    {...installation,suspended_at:'2026-01-01'}, {...installation,permissions:{contents:'read'}}]) {
    let calls = 0;
    await assert.rejects(jamInstallationToken(jamServiceConfig(env),{now,cache:new Map(),
      fetchImpl:async () => {calls++;return Response.json(bad);}}),/unavailable/);
    assert.equal(calls,1);
  }
  for (const bad of [{...result,repositories:[{full_name:'student/repo'}]},
    {...result,permissions:{...result.permissions,actions:'write'}},
    {...result,repositories:[...result.repositories,{full_name:'codepetca/another'}]},
    {...result,expires_at:new Date(now-1).toISOString()}]) {
    let calls = 0;
    await assert.rejects(jamInstallationToken(jamServiceConfig(env),{now,cache:new Map(),
      fetchImpl:async () => Response.json(++calls === 1 ? installation : bad)}),/unavailable/);
  }
});

test('only armorup can approve another creator, and the owner cannot self-approve',async()=>{
  const {fixture,creator,hostedManifest}=await import('../../jams/test/fixtures.mjs');
  const owner={id:'4050555',login:'armorup'};
  const f=fixture({maintainerIds:jamServiceConfig(env).maintainerIds});
  const proposed=await f.service.propose({actor:creator,operationId:'owner-review-test-01',manifest:hostedManifest()});
  await assert.rejects(f.service.mutate({id:proposed.eventId,actor:{id:'123',login:'someone'},operationId:'wrong-reviewer-01',action:'approve',revision:proposed.revision}),error=>error.status===403);
  await f.service.mutate({id:proposed.eventId,actor:owner,operationId:'owner-approval-01',action:'approve',revision:proposed.revision});
  assert.equal((await f.service.read(proposed.eventId)).event.revision,proposed.revision);
  const own=await f.service.propose({actor:owner,operationId:'owner-own-jam-001',manifest:hostedManifest()});
  await assert.rejects(f.service.mutate({id:own.eventId,actor:owner,operationId:'owner-self-review-01',action:'approve',revision:own.revision}),error=>error.status===403);
});
