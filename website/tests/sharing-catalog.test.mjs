import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogConfiguration, readCatalog} from '../lib/sharing-catalog.mjs';
const env = {ZERO_SHARING_CATALOG_URL:'https://catalog.example/snapshot.json', ZERO_SHARING_ARTIFACT_ORIGIN:'https://artifacts.example'};
const catalog = {schema:1, revision:'a'.repeat(40), releases:[]};
test('configuration needs both fixed HTTPS endpoints', () => {
  assert.throws(()=>catalogConfiguration({}));
  for (const url of ['http://localhost/data','https://user:secret@example/data','https://example/data#hash']) assert.throws(()=>catalogConfiguration({...env,ZERO_SHARING_CATALOG_URL:url}));
  assert.throws(()=>catalogConfiguration({...env,ZERO_SHARING_ARTIFACT_ORIGIN:'https://artifacts.example/maven'}));
});
test('read validates bounded catalog and forbids redirects without fallback', async () => {
  let options;
  const actual = await readCatalog({env,fetchImpl:async (url, opts)=>{assert.equal(url,env.ZERO_SHARING_CATALOG_URL); options=opts; return new Response(JSON.stringify(catalog));}});
  assert.deepEqual(actual,catalog);assert.equal(options.redirect,'error'); assert.equal(options.cache,'no-store');
  for (const response of [new Response('',{status:503}),new Response(JSON.stringify({...catalog, schema:2})),new Response('x',{headers:{'content-length':'4194305'}}),new Response('not JSON')])
    await assert.rejects(readCatalog({env,fetchImpl:async()=>response}));
});
test('stream bound applies when content length is absent and timeout aborts', async () => {
  await assert.rejects(readCatalog({env,fetchImpl:async()=>new Response(new Uint8Array(4194305))}),/size limit/);
  await assert.rejects(readCatalog({env,timeoutMs:5,fetchImpl:async (_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),/aborted/);
});

import {createHash} from 'node:crypto';
import {REGISTRY_BYTES, REGISTRY_URL} from '../lib/sharing-catalog.mjs';
const registryEnv = {ZERO_SHARING_REGISTRY_URL:REGISTRY_URL, ZERO_SHARING_ARTIFACT_ORIGIN:env.ZERO_SHARING_ARTIFACT_ORIGIN};
function registryFixture(snapshot = catalog, {sequence = 5, pointerSequence = 4, revision = snapshot.revision} = {}) {
  const bytes = JSON.stringify(snapshot), sha256 = createHash('sha256').update(bytes).digest('hex');
  const path = `catalog/snapshots/${sha256}.json`;
  return {bytes, state:{schema:1,sequence,requests:{privatePayload:'Must never be returned'},catalog:{path,url:`${registryEnv.ZERO_SHARING_ARTIFACT_ORIGIN}/${path}`,revision,sequence:pointerSequence,size:Buffer.byteLength(bytes),sha256}}};
}
function registryFetch(fixture, modify) {
  return async (url, options) => {
    assert.equal(options.redirect,'error');
    const response = url === REGISTRY_URL ? new Response(JSON.stringify(fixture.state)) : new Response(fixture.bytes);
    return modify ? modify(url,response) : response;
  };
}
test('select exactly one source and require the canonical GitHub registry',()=>{
  assert.throws(()=>catalogConfiguration({...registryEnv,ZERO_SHARING_CATALOG_URL:env.ZERO_SHARING_CATALOG_URL}));
  for (const url of [REGISTRY_URL.replace('codepetca','student'),`${REGISTRY_URL}?ref=main`,REGISTRY_URL.replace('zero-sharing-registry','main')])
    assert.throws(()=>catalogConfiguration({...registryEnv,ZERO_SHARING_REGISTRY_URL:url}));
});
test('registry pointer fetches a verified immutable snapshot and returns catalog only',async()=>{
  const fixture=registryFixture();
  assert.deepEqual(await readCatalog({env:registryEnv,fetchImpl:registryFetch(fixture)}),catalog);
  const sparse=registryFixture(); delete sparse.state.catalog.size; delete sparse.state.catalog.sha256;
  assert.deepEqual(await readCatalog({env:registryEnv,fetchImpl:registryFetch(sparse)}),catalog);
});
test('registry rejects origin drift, digest mismatch, stale revision and future sequence',async()=>{
  for (const mutate of [
    f=>{f.state.catalog.url=f.state.catalog.url.replace('artifacts.example','untrusted.example');},
    f=>{f.bytes=f.bytes.replace('"schema":1','"schema":2');},
    f=>{f.state.catalog.revision='b'.repeat(40);},
    f=>{f.state.catalog.sequence=f.state.sequence+1;},
    f=>{f.state.catalog.size++;},
    f=>{f.state.catalog.sha256='b'.repeat(64);}
  ]) {
    const fixture=registryFixture(); mutate(fixture);
    await assert.rejects(readCatalog({env:registryEnv,fetchImpl:registryFetch(fixture)}));
  }
});
test('missing pointer, registry oversize and either outage fail without fallback',async()=>{
  const fixture=registryFixture();
  fixture.state.catalog=null;
  await assert.rejects(readCatalog({env:registryEnv,fetchImpl:registryFetch(fixture)}),/not been initialized/);
  await assert.rejects(readCatalog({env:registryEnv,fetchImpl:async()=>new Response(new Uint8Array(REGISTRY_BYTES+1))}),/size limit/);
  for (const outage of ['registry','snapshot']) {
    const valid=registryFixture(); const calls=[];
    await assert.rejects(readCatalog({env:registryEnv,fetchImpl:async(url,opts)=>{calls.push(url); return (url===REGISTRY_URL)===(outage==='registry') ? new Response('',{status:503}) : registryFetch(valid)(url,opts);}}));
    assert.equal(calls.length,outage==='registry'?1:2);
  }
});
test('registry and snapshot share one cumulative deadline and abort signal',async()=>{
  const fixture=registryFixture(); let firstSignal;
  await assert.rejects(readCatalog({env:registryEnv,timeoutMs:30,fetchImpl:async(url,{signal})=>{
    if(url===REGISTRY_URL) {firstSignal=signal; await new Promise(resolve=>setTimeout(resolve,20)); return new Response(JSON.stringify(fixture.state));}
    assert.equal(signal,firstSignal);
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('deadline'))));
  }}),/deadline|abort/i);
});
test('redirected registry or snapshot responses are rejected',async()=>{
  for (const target of ['registry','snapshot']) {
    const fixture=registryFixture();
    await assert.rejects(readCatalog({env:registryEnv,fetchImpl:registryFetch(fixture,(url,response)=>{
      if ((url===REGISTRY_URL)===(target==='registry')) Object.defineProperty(response,'redirected',{value:true});
      return response;
    })}),/could not be retrieved/);
  }
});
