import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as policy from '../checker/policy.mjs';
import {expectedPolicyDigest} from '../checker/image-policy.mjs';
import {createHub} from './hub.mjs';
import {createPostgresStorage,MAX_OBJECT_BYTES} from './postgres-storage.mjs';
import {sha256} from './artifacts.mjs';
import {createRuntimePool} from './runtime.mjs';
import {runWorker} from './worker-runtime.mjs';
const checker={...policy,expectedPolicyDigest,checkSubmission:async()=>{throw new Error('No execution permitted');}};

test('staging capability blocks authentication and authoring before any DB/OAuth work',async()=>{
  let queries=0,oauthCalls=0;
  const pool={query:async()=>{queries++;return {rows:[]};},connect:async()=>{throw new Error('No mutation permitted');}};
  const storage={read:async()=>{throw new Error('No artifacts');},put:async()=>{throw new Error('No writes');}};
  const hub=createHub({pool,storage,checker,origin:'https://zero.example',uploadsEnabled:false,oauth:{clientId:'unused',clientSecret:'unused',fetch:()=>{oauthCalls++;throw new Error('No OAuth');}}});
  const server=http.createServer(hub.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/hub`;
  try {
    const session=await (await fetch(base+'/session',{headers:{Cookie:'zero_hub_session='+'a'.repeat(64)}})).json();
    assert.deepEqual(session,{user:null,mode:'production',capabilities:{uploads:false}});assert.equal(queries,0);
    for(const [method,route] of [['GET','/auth/start'],['GET','/auth/callback?state=x&code=x'],['POST','/logout'],['POST','/libraries'],['POST','/submissions'],['GET','/submissions/11111111-1111-4111-8111-111111111111']])assert.equal((await fetch(base+route,{method,redirect:'manual'})).status,503);
    assert.equal(queries,0);assert.equal(oauthCalls,0);
    assert.deepEqual(await (await fetch(base+'/catalog')).json(),{mode:'production',capabilities:{uploads:false},libraries:[]});
    assert.equal(queries,1);
    await assert.rejects(hub.reserveLibrary({id:'1',login:'alice'},{className:'Display',title:'Display'}),error=>error.status===503);
  } finally {await new Promise(resolve=>server.close(resolve));await hub.stop();}
});

test('PostgreSQL storage bounds both reads and immutable writes before querying',async()=>{
  let queries=0;
  const pool={query:async(sql,args)=>{queries++;return {rows:sql.startsWith('SELECT')?[{bytes:Buffer.from('valid')}]:[]};}};
  const storage=createPostgresStorage(pool);
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(MAX_OBJECT_BYTES+1),'text'])await assert.rejects(storage.put(bytes),/bounds/);
  for(const args of [['x',1],['a'.repeat(64),0],['a'.repeat(64),MAX_OBJECT_BYTES+1]])await assert.rejects(storage.read(...args),/bounds/);
  assert.equal(queries,0);
  await assert.rejects(storage.read('a'.repeat(64),5),/integrity/);
  const bytes=Buffer.from('valid');assert.deepEqual(await storage.put(bytes),{sha256:sha256(bytes),size:5});
});

test('runtime preserves URL TLS configuration and workers require explicit isolated activation',async()=>{
  const pool=createRuntimePool('postgresql://test:test@localhost/test?sslmode=verify-full','hub_api');
  assert.equal(pool.options.max,5);assert.ok(pool.options.connectionString.endsWith('sslmode=verify-full'));assert.equal(pool.options.ssl,undefined);await pool.end();
  assert.throws(()=>createRuntimePool('postgresql://test:test@localhost/test?options=bad','hub_api'),/override/);
  await assert.rejects(runWorker({kind:'checker',checker,env:{}}),/activation/);
  await assert.rejects(runWorker({kind:'publisher',checker,env:{ZERO_HUB_WORKERS_ENABLED:'1',ZERO_HUB_GITHUB_CLIENT_SECRET:'forbidden'}}),/OAuth/);
  await assert.rejects(runWorker({kind:'checker',checker,env:{ZERO_HUB_WORKERS_ENABLED:'1',ZERO_HUB_API_DATABASE_URL:'forbidden'}}),/own database/);
});
