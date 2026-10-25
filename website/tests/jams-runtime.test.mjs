import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {jamServiceConfig,jamInstallationToken} from '../lib/jams-runtime.mjs';

const now = 1_800_000_000_000;
const pair = generateKeyPairSync('rsa',{modulusLength:2048});
const privateKey = pair.privateKey.export({type:'pkcs8',format:'pem'});
const env = {NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_APP_ID:'123',ZERO_JAMS_INSTALLATION_ID:'456',
  ZERO_JAMS_PRIVATE_KEY:privateKey,ZERO_JAMS_MAINTAINER_IDS:'12,34'};
const installation = {id:456,app_id:123,account:{login:'codepetca'},permissions:{contents:'write'},suspended_at:null};
const result = {token:'ghs_'+'x'.repeat(30),expires_at:new Date(now+3600000).toISOString(),
  permissions:{contents:'write',metadata:'read'},repositories:[{full_name:'codepetca/zero'}]};

test('runtime requires explicit enablement, server RSA credential and numeric maintainer identities',() => {
  assert.equal(jamServiceConfig({}),null);
  for (const patch of [{NODE_ENV:'production'},{VERCEL_ENV:'production'},{ZERO_JAMS_ENABLED:'0'},{ZERO_JAMS_PRIVATE_KEY:'not a key'},
    {ZERO_JAMS_MAINTAINER_IDS:'student'},{ZERO_JAMS_MAINTAINER_IDS:'12,12'},
    {ZERO_JAMS_INSTALLATION_ID:'../evil'}]) assert.equal(jamServiceConfig({...env,...patch}),null);
  assert.deepEqual(jamServiceConfig(env).maintainerIds,['12','34']);
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
  assert.equal(payload.iss,'123');assert.equal(payload.iat,now/1000-60);assert.equal(payload.exp,now/1000+300);
  assert.equal(calls[0][0],'https://api.github.com/app/installations/456');
  assert.deepEqual(JSON.parse(calls[1][1].body),{repositories:['zero'],permissions:{contents:'write',metadata:'read'}});
  assert.equal(calls[1][1].redirect,'error');
  await jamInstallationToken(jamServiceConfig(env),{fetchImpl,now,cache});
  assert.equal(calls.length,2,'Warm instance reuses the short-lived token without another mint');
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
