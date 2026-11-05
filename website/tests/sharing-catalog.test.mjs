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
import {createJamHubVisibilityReader} from '../lib/jam-hub-visibility.mjs';
import {atomicGitHttpFixture} from '../../jams/test/git-http-fixture.mjs';
import {fixture as jamFixture,manifest,creator,participant,approved} from '../../jams/test/fixtures.mjs';
function webCatalog(){
  const identity=contracts.identity('game','123','space-game'),path=contracts.artifactPath(identity,'0.1.0','zip');
  return {schema:1,revision:'a'.repeat(40),releases:[{schema:1,kind:'game',id:identity.id,slug:identity.slug,version:'0.1.0',title:'Space',description:'Move a ship',license:'MIT',repository:{id:'123',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},contributor:{githubId:'7',login:'student'},source:{commit:'b'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),status:'available',artifacts:{zip:{path,url:env.ZERO_SHARING_ARTIFACT_ORIGIN+'/'+path,size:10,sha256:'e'.repeat(64)}},controls:'Arrows',web:{provider:'github-pages',url:'https://student.github.io/game/',commit:'b'.repeat(40),runId:42}}]};
}
test('legacy catalog keeps the original strict release allowlist while enriched catalog retains verified metadata',async()=>{
  const snapshot=webCatalog(),original=structuredClone(snapshot),request=new Request('https://zero.codepet.ca/api/sharing/catalog');
  const reader=async({signal})=>{assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);return snapshot;};
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
  let reads=0;const reader=async({signal})=>{reads++;assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);return snapshot;};
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

test('both catalog shapes hold every separately shared game version until fresh Jam reveal authority allows it',async t=>{
  const reveal='2030-01-05T00:00:00Z',instant=Date.parse(reveal);
  const jam=jamFixture({verifyRepository:async()=>({repository:{id:'123',ownerId:participant.id,fullName:'student/game'}}),source:async input=>({repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:reveal}})})});
  const revision=await approved(jam);
  await jam.service.mutate({id:'jam-101',actor:participant,operationId:'catalog-join-01',action:'join',revision,repositoryUrl:'https://github.com/student/game',demoUrl:'https://student.github.io/game/'});
  const f=await atomicGitHttpFixture(t);f.seed('jam-101',jam.store.records.get('jam-101').state);await f.store.migrate();f.requests.length=0;
  const jamEnv={NODE_ENV:'development',ZERO_JAMS_ENABLED:'0'};
  let now=instant-1;
  const readVisibility=createJamHubVisibilityReader({clock:()=>now,fetchImpl:async(input,options)=>{
    const url=new URL(input);assert.equal(url.origin,'https://api.github.com');
    assert.match(url.pathname,/^\/repos\/codepetca\/zero\/git\/(?:ref\/heads\/zero-jams-registry|(?:commits|trees|blobs)\/[a-f0-9]{40})$/);
    assert.equal(url.search,'');assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    assert.equal(options.headers.Authorization,undefined);
    return f.fetchImpl(input,{...options,headers:{...options.headers,Authorization:'Bearer atomic-http-fixture-only-token'}});
  }});
  const snapshot=webCatalog(),second=structuredClone(snapshot.releases[0]);
  second.version='0.2.0';second.status='withdrawn';
  const path=contracts.artifactPath(contracts.identity('game','123','space-game'),'0.2.0','zip');
  second.artifacts.zip={...second.artifacts.zip,path,url:env.ZERO_SHARING_ARTIFACT_ORIGIN+'/'+path};
  snapshot.releases.push(second,practiceRelease());
  const publicGame=structuredClone(snapshot.releases[0]),identity=contracts.identity('game','999','space-game');
  publicGame.id=identity.id;publicGame.repository={...publicGame.repository,id:'999',name:'other',url:'https://github.com/student/other'};
  publicGame.web.url='https://student.github.io/other/';
  const publicPath=contracts.artifactPath(identity,'0.1.0','zip');publicGame.artifacts.zip={...publicGame.artifacts.zip,path:publicPath,url:env.ZERO_SHARING_ARTIFACT_ORIGIN+'/'+publicPath};
  snapshot.releases.push(publicGame);const original=structuredClone(snapshot);
  const request=new Request('https://zero.codepet.ca/api/sharing/catalog');
  const options={reader:async()=>snapshot,visibilityReader:({signal})=>readVisibility({env:jamEnv,signal}),decisionNow:()=>now,
    destinationReader:async url=>({repositoryId:url.endsWith('/other')?'999':'123',ownerId:'7'})};
  for(now of [instant-1,instant,instant+1,instant-1])for(const includeWeb of [false,true]){
    const response=await catalogResponse(request,{...options,includeWeb});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const actual=await response.json();
    assert.deepEqual(actual.releases.map(release=>release.repository.id),now<instant?['999']:['123','123','999']);
    assert.deepEqual(actual.releases.map(release=>release.web),includeWeb?(now<instant?[publicGame.web]:[snapshot.releases[0].web,second.web,publicGame.web]):actual.releases.map(()=>undefined));
    if(now<instant)assert.doesNotMatch(JSON.stringify(actual),/game-r123-space-game|student\.github\.io\/game\//);
  }
  // Practice records from the same held repository are hidden too.
  const practiceResponse=await catalogResponse(request,{...options,practiceOnly:true});assert.deepEqual((await practiceResponse.json()).releases,[]);
  assert.deepEqual(snapshot,original);
  // A warm revealed response never becomes a fallback for errors or bad clocks.
  now=NaN;
  for(const includeWeb of [false,true]){
    const response=await catalogResponse(request,{...options,includeWeb});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(JSON.stringify(await response.json()),/Space|game-r123|student\/game/);
  }
  now=instant-1;
  for(const failure of ['head','malformed']){
    if(failure==='head')f.beforeRequest=({call,res,json})=>{if(call.path.includes('/git/ref/')){json(res,503,{secret:'hidden'});return true;}};
    else {f.beforeRequest=null;f.replaceFile('zero-jams-v2/events/jam-101.json','{}');}
    for(const includeWeb of [false,true]){
      const response=await catalogResponse(request,{...options,includeWeb});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.deepEqual(await response.json(),{error:'ZeroHub is unavailable. Try again shortly.'});
    }
  }
  assert.ok(f.requests.every(call=>call.method==='GET'));
});

test('inactive Jam authority preserves catalog projections; invalid authority is never treated as an empty hold',async()=>{
  const snapshot=webCatalog(),request=new Request('https://zero.codepet.ca/api/sharing/catalog');
  for(const includeWeb of [false,true]){
    const unchanged=await catalogResponse(request,{reader:async()=>snapshot,visibilityReader:async()=>null,includeWeb,decisionNow:()=>assert.fail('Inactive authority sampled wall clock')});
    assert.deepEqual(await unchanged.json(),includeWeb?snapshot:legacyCatalog(snapshot));
    for(const visibilityReader of [async()=>undefined,async()=>({revision:'bad',isHeld:()=>false}),async()=>{throw Error('private registry data');}]){
      const response=await catalogResponse(request,{reader:async()=>snapshot,visibilityReader,includeWeb});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.doesNotMatch(JSON.stringify(await response.json()),/private|Space|student/);
    }
  }
});

test('the explicit practice endpoint fails closed during Jam authority outages',async()=>{
  const snapshot=webCatalog();snapshot.releases.push(practiceRelease());
  let reads=0;
  const response=await catalogResponse(new Request('https://zero.codepet.ca/api/sharing/catalog/practice'),{
    reader:async()=>snapshot,practiceOnly:true,visibilityReader:async()=>{reads++;throw Error('authority offline');}
  });
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(reads,1);
  assert.deepEqual(await response.json(),{error:'ZeroHub is unavailable. Try again shortly.'});
});

test('catalog and authority share one bounded request budget and late work cannot issue a response',async()=>{
  const request=new Request('https://zero.codepet.ca/api/sharing/catalog');
  let release,authorityCalls=0;
  const delayed=new Promise(resolve=>{release=resolve;});
  const pending=catalogResponse(request,{responseBudgetMs:20,reader:()=>delayed,
    visibilityReader:async()=>{authorityCalls++;return null;}});
  const response=await pending;
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  release(catalog);await new Promise(resolve=>setImmediate(resolve));assert.equal(authorityCalls,0);

  let releaseAuthority;
  const authority=new Promise(resolve=>{releaseAuthority=resolve;});
  const second=await catalogResponse(request,{responseBudgetMs:20,reader:async()=>catalog,visibilityReader:()=>authority});
  assert.equal(second.status,503);assert.equal(second.headers.get('cache-control'),'no-store');
  releaseAuthority(null);await new Promise(resolve=>setImmediate(resolve));
});

test('catalog cancellation prevents authority work even when the reader ignores its signal',async()=>{
  const controller=new AbortController();let release,authorityCalls=0;
  const pending=catalogResponse(new Request('https://zero.codepet.ca/api/sharing/catalog',{signal:controller.signal}),{
    reader:()=>new Promise(resolve=>{release=resolve;}),visibilityReader:async()=>{authorityCalls++;return null;}});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();
  assert.equal((await pending).status,503);release(catalog);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(authorityCalls,0);
});


test('catalog serialization rejects rollback after its final reveal decision for legacy, web and practice',async t=>{
  for(const projection of [{},{includeWeb:true},{practiceOnly:true}]) {
    let now=1000,reads=0,rolledBack=false;
    const snapshot=webCatalog();if(projection.practiceOnly)snapshot.releases=[practiceRelease()];
    t.mock.method(Date,'now',()=>now);
    const response=await catalogResponse(new Request('https://zero.example/api/sharing/catalog'),{
      ...projection,reader:async()=>snapshot,
      destinationReader:async()=>({repositoryId:'123',ownerId:'7'}),
      visibilityReader:async()=>{
        const final=++reads===2;let checks=0;
        return {revision:'a'.repeat(40),observedAt:now,isHeld:()=>{
          // Final filtering then resolved-identity check occur after the read.
          if(final&&++checks===2){now=999;rolledBack=true;}return false;
        }};
      }
    });
    assert.equal(rolledBack,true);assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'ZeroHub is unavailable. Try again shortly.'});
    t.mock.restoreAll();
  }
});

test('catalog active decisions reject malformed observation timestamps before destination work',async()=>{
  for(const observedAt of [undefined,null,'1000',NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1]) {
    let destinations=0;
    const response=await catalogResponse(new Request('https://zero.example/api/sharing/catalog'),{
      reader:async()=>webCatalog(),decisionNow:()=>1000,
      visibilityReader:async()=>({revision:'a'.repeat(40),observedAt,isHeld:()=>false}),
      destinationReader:async()=>{destinations++;return {repositoryId:'123',ownerId:'7'};}
    });
    assert.equal(response.status,503);assert.equal(destinations,0);
  }
});


test('catalog denies inactive authority if deployment activates in the reader microtask',async()=>{
  for(const projection of [{},{includeWeb:true},{practiceOnly:true}]) {
    const runtimeEnv={NODE_ENV:'production'};let switched=false;
    const snapshot=webCatalog();if(projection.practiceOnly)snapshot.releases=[practiceRelease()];
    const response=await catalogResponse(new Request('https://zero.example/api/sharing/catalog'),{
      ...projection,env:runtimeEnv,reader:async()=>snapshot,
      visibilityReader:async()=>{
        assert.equal(runtimeEnv.NODE_ENV,'production');
        queueMicrotask(()=>{runtimeEnv.NODE_ENV='development';switched=true;});
        return null;
      },destinationReader:async()=>assert.fail('Inactive observation started destination reads')
    });
    assert.equal(switched,true);assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'ZeroHub is unavailable. Try again shortly.'});
  }
});
