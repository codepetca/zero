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


import {legacyCatalog,catalogResponse} from '../lib/sharing-catalog.mjs';
import contracts from '../../extension/src/sharing/contracts.js';
function webCatalog(){
  const identity=contracts.identity('game','123','space-game'),path=contracts.artifactPath(identity,'0.1.0','zip');
  return {schema:1,revision:'a'.repeat(40),releases:[{schema:1,kind:'game',id:identity.id,slug:identity.slug,version:'0.1.0',title:'Space',description:'Move a ship',license:'MIT',repository:{id:'123',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},contributor:{githubId:'7',login:'student'},source:{commit:'b'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),status:'available',artifacts:{zip:{path,url:env.ZERO_SHARING_ARTIFACT_ORIGIN+'/'+path,size:10,sha256:'e'.repeat(64)}},controls:'Arrows',web:{provider:'github-pages',url:'https://student.github.io/game/',commit:'b'.repeat(40),runId:42}}]};
}
test('legacy catalog keeps the original strict release allowlist while enriched catalog retains verified metadata',async()=>{
  const snapshot=webCatalog(),original=structuredClone(snapshot),request=new Request('https://zero.codepet.ca/api/sharing/catalog');
  const reader=async({signal})=>{assert.equal(signal,request.signal);return snapshot;};
  const legacyResponse=await catalogResponse(request,{reader}),legacy=await legacyResponse.json();
  const enrichedResponse=await catalogResponse(request,{reader,includeWeb:true}),enriched=await enrichedResponse.json();
  assert.equal(legacyResponse.status,200);assert.equal(legacyResponse.headers.get('cache-control'),'no-store');
  assert.deepEqual(enriched,snapshot);assert.deepEqual(snapshot,original);
  assert.equal(Object.hasOwn(legacy.releases[0],'web'),false);
  const originalFields=['schema','kind','id','slug','version','title','description','license','repository','contributor','source','policyRevision','status','artifacts','namespace','coordinate','libraryKind','components','controls'];
  assert.ok(legacy.releases.every(release=>Object.keys(release).every(key=>originalFields.includes(key))));
  assert.deepEqual(legacy.releases[0],(({web,...release})=>release)(snapshot.releases[0]));
  assert.deepEqual(legacyCatalog(catalog),catalog);
});
test('both API projections fail closed on invalid provenance or unavailable snapshot without leaking provider data',async()=>{
  for(const includeWeb of [false,true]){
    const snapshot=webCatalog();snapshot.releases[0].web.url='javascript:alert(1)';
    for(const reader of [async()=>snapshot,async()=>{throw Error('Bearer PRIVATE_PROVIDER_TOKEN');}]){
      const result=await catalogResponse(new Request('https://zero.codepet.ca/api/sharing/catalog'),{reader,includeWeb});
      assert.equal(result.status,503);assert.equal(result.headers.get('cache-control'),'no-store');assert.doesNotMatch(JSON.stringify(await result.json()),/PRIVATE_PROVIDER_TOKEN/);
    }
  }
});
test('legacy and enriched API routes explicitly select their distinct projections',async()=>{
  const {readFile}=await import('node:fs/promises');
  assert.match(await readFile(new URL('../app/api/sharing/catalog/route.ts',import.meta.url),'utf8'),/return catalogResponse\(request\);/);
  assert.match(await readFile(new URL('../app/api/sharing/catalog/web/route.ts',import.meta.url),'utf8'),/includeWeb:true/);
});


function practiceRelease(repositoryId='123',version='0.1.0',status='available') {
  const identity=contracts.identity('library',repositoryId,'tutorial-credits-badge'),base=webCatalog().releases[0];
  const {web,controls,...common}=base;
  return contracts.validateRelease({...common,kind:identity.kind,id:identity.id,slug:identity.slug,version,status,repository:{...base.repository,id:repositoryId},source:{...base.source,folder:'libraries/tutorial-credits-badge'},
    namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>{
      const path=contracts.artifactPath(identity,version,kind);return [kind,{path,url:env.ZERO_SHARING_ARTIFACT_ORIGIN+'/'+path,size:1,sha256:'e'.repeat(64)}];
    }))},{artifactOrigin:env.ZERO_SHARING_ARTIFACT_ORIGIN});
}
test('legacy and web APIs exclude every practice version while explicit practice API returns only validated practice',async()=>{
  const snapshot=webCatalog();snapshot.releases.push(practiceRelease(),practiceRelease('123','0.2.0','withdrawn'),practiceRelease('999'));
  const original=structuredClone(snapshot),request=new Request('https://zero.codepet.ca/api/sharing/catalog/practice');
  let reads=0;const reader=async({signal})=>{reads++;assert.equal(signal,request.signal);return snapshot;};
  for(const includeWeb of [false,true]) {
    const result=await catalogResponse(request,{reader,includeWeb});const selected=await result.json();
    assert.equal(selected.releases.length,1);assert.equal(selected.releases[0].kind,'game');
    assert.equal(Object.hasOwn(selected.releases[0],'web'),includeWeb);
  }
  const response=await catalogResponse(request,{reader,practiceOnly:true});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const practice=await response.json();assert.deepEqual(practice.releases,snapshot.releases.slice(1));assert.equal(reads,3);
  assert.equal(practice.releases[1].status,'withdrawn');assert.deepEqual(snapshot,original);
  assert.deepEqual(legacyCatalog(snapshot).releases.length,1);
  const {readFile}=await import('node:fs/promises');
  assert.match(await readFile(new URL('../app/api/sharing/catalog/practice/route.ts',import.meta.url),'utf8'),/practiceOnly:true/);
});
test('hidden practice and nonpractice records are validated before either API partitions the snapshot',async()=>{
  for(const practiceOnly of [false,true])for(const includeWeb of [false,true]) {
    const invalidPractice=webCatalog();invalidPractice.releases.push({...practiceRelease(),status:'invalid'});
    const invalidGame=webCatalog();invalidGame.releases[0].web.url='javascript:alert(1)';
    for(const snapshot of [invalidPractice,invalidGame]) {
      const response=await catalogResponse(new Request('https://zero.codepet.ca/api/sharing/catalog'),{reader:async()=>snapshot,includeWeb,practiceOnly});
      assert.equal(response.status,503);
    }
  }
});
