import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import github from '../../extension/src/sharing/github.js';
import { FileRegistry, initialState, canonical, digest } from '../registry.mjs';
import { createGitHubRegistryAdapter, REGISTRY_BRANCH, REGISTRY_PATH, validateRegistryState } from '../github-registry.mjs';
import { BlobStorage } from '../blob-storage.mjs';
import { createSharingPlatform, LIBRARY_EXECUTION_GATE, publicError, formatPublicReport } from '../platform.mjs';
import { runCli } from '../cli.mjs';
import { inspectGamePackage } from '../game-package.mjs';

const origin='https://fixture.public.blob.vercel-storage.com',policy='b'.repeat(40);
const gitHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function fakeBlob() {
  const objects=new Map(),calls=[];let serial=0,failPath=null;
  class BlobNotFoundError extends Error {}
  const fetcher=async (url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.authorization,undefined);const parsed=new URL(url);assert.ok(parsed.searchParams.has('zero_verify'));const key=parsed.pathname.slice(1),object=objects.get(key);return new Response(object?.bytes||null,{status:object?200:404,headers:object?{etag:object.etag}:{}});};
  return {objects,calls,fetcher,setFailure:value=>{failPath=value;},sdk:{BlobNotFoundError,
    async put(key,input,options) {
      calls.push({method:'put',key,options});
      assert.equal(options.token,'blob-fixture-token');assert.equal(options.allowOverwrite,false);assert.equal(options.addRandomSuffix,false);
      if(key===failPath){failPath=null;throw new Error('private SDK credential details must not escape');}
      if(objects.has(key))throw Object.assign(new Error('already exists'),{name:'BlobAlreadyExistsError'});
      const bytes=Buffer.from(input);objects.set(key,{bytes,etag:'etag-'+ ++serial});return {url:origin+'/'+key,pathname:key};
    },
    async head(url,options) {
      calls.push({method:'head',url,options});assert.ok(url.startsWith(origin+'/'));
      const key=url.slice(origin.length+1),object=objects.get(key);if(!object)throw new BlobNotFoundError();
      return {url,pathname:key,size:object.bytes.length,etag:object.etag};
    },
    async del(url,options) {
      const key=url.slice(origin.length+1),current=objects.get(key);assert.equal(options.ifMatch,current.etag);objects.delete(key);
    }
  }};
}
function fakeGit({files=[],request,missing=false}={}) {
  let bytes=Buffer.from(canonical(initialState())+'\n'),sha=gitHash(bytes);const calls=[];
  const blobs=new Map(files.map(file=>[gitHash(file.bytes),file.bytes]));
  const repository={id:11,name:'game',html_url:'https://github.com/student/game',visibility:'public',private:false,owner:{id:7,login:'student',type:'User'}};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  const fetcher=async (url,options)=>{
    assert.ok(url.startsWith('https://api.github.com/'));assert.equal(options.redirect,'error');calls.push({url,options});
    const endpoint=new URL(url).pathname;
    if(endpoint===`/repos/codepetca/zero/contents/${REGISTRY_PATH}`) {
      if(missing)return json({message:'private provider error'},404);
      if(options.method==='PUT') {
        const body=JSON.parse(options.body);assert.equal(body.branch,REGISTRY_BRANCH);assert.ok(!Object.hasOwn(body,'force'));
        if(body.sha!==sha)return json({},409);
        bytes=Buffer.from(body.content,'base64');sha=gitHash(bytes);return json({content:{sha}});
      }
      return json({type:'file',path:REGISTRY_PATH,size:bytes.length,sha,encoding:'base64',content:bytes.toString('base64')});
    }
    if(endpoint==='/repos/student/game')return json(repository);
    if(endpoint==='/repos/codepetca/zero/issues')return json([{number:1}]);
    if(endpoint==='/repos/codepetca/zero/issues/1')return json({number:1,state:'open',body:'```json\n'+JSON.stringify(request)+'\n```',user:{id:7,login:'student',type:'User'}});
    if(endpoint===`/repos/student/game/git/commits/${'a'.repeat(40)}`)return json({sha:'a'.repeat(40),tree:{sha:'c'.repeat(40)}});
    if(endpoint===`/repos/student/game/git/trees/${'c'.repeat(40)}`)return json({truncated:false,tree:files.map(file=>({path:file.path,type:'blob',mode:file.path==='mvnw'?'100755':'100644',size:file.bytes.length,sha:gitHash(file.bytes)}))});
    const blob=blobs.get(endpoint.split('/').at(-1));if(blob)return json({sha:gitHash(blob),size:blob.length,encoding:'base64',content:blob.toString('base64')});
    return json({},404);
  };
  return {fetcher,calls,state:()=>JSON.parse(bytes.toString()),sha:()=>sha};
}
const config={schema:1,repository:'codepetca/zero',registryBranch:REGISTRY_BRANCH,artifactOrigin:origin,policyRevision:policy,gamePublicationEnabled:false};
async function gameFixture() {
  const descriptor={schema:1,kind:'game',slug:'coin-game',version:'0.1.0',title:'Coin game',description:'Collect a coin',license:'MIT',controls:'Arrow keys'};
  const request={schema:1,kind:'game',slug:'coin-game',version:'0.1.0',repository:{id:'11',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:'.',descriptor,policyRevision:policy};
  const files=[{path:'zero-game.json',bytes:Buffer.from(JSON.stringify(descriptor))},{path:'zero.json',bytes:Buffer.from('{}')},{path:'pom.xml',bytes:Buffer.from('<project/>')},{path:'src/main/java/Main.java',bytes:Buffer.from('class Main {}')},{path:'LICENSE',bytes:Buffer.from('MIT')},{path:'assets/coin.png',bytes:Buffer.from('coin fixture')}];
  for(const name of ['mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties'])files.push({path:name,bytes:await readFile(new URL('../../student-template/'+name,import.meta.url))});
  const remote=fakeGit({files,request}),blob=fakeBlob();
  const registry=new FileRegistry({adapter:createGitHubRegistryAdapter({fetcher:remote.fetcher,token:'registry-fixture-token'}),maxRetries:8});
  const storage=new BlobStorage({sdk:blob.sdk,fetcher:blob.fetcher,token:'blob-fixture-token',artifactOrigin:origin});
  const reader=github.createGitHubReader({fetcher:remote.fetcher});
  const platform=createSharingPlatform({reader,registry,storage,artifactOrigin:origin,policyRevision:policy});
  return {request,files,remote,blob,registry,storage,reader,platform};
}

test('GitHub Contents atomic CAS returns real blob revisions and never creates missing setup',async()=>{
  const remote=fakeGit(),adapter=createGitHubRegistryAdapter({fetcher:remote.fetcher,token:'fixture'});
  const first=await adapter.read();const next=structuredClone(first.state);next.sequence++;
  assert.equal(await adapter.compareAndSwap(first.revision,next),true);assert.equal(await adapter.compareAndSwap(first.revision,next),false);
  const registry=new FileRegistry({adapter});const result=await registry.update(state=>{state.catalog=null;state.sequence++;});
  assert.equal(result.revision,remote.sha());assert.match(result.revision,/^[a-f0-9]{40}$/);
  await assert.rejects(createGitHubRegistryAdapter({fetcher:fakeGit({missing:true}).fetcher,token:'fixture'}).read(),/explicit operator setup/);
  assert.throws(()=>createGitHubRegistryAdapter({token:'fixture',repository:'attacker/zero'}),/destination/);
  const readOnly=createGitHubRegistryAdapter({fetcher:remote.fetcher,readOnly:true});await readOnly.read();await assert.rejects(readOnly.compareAndSwap(first.revision,next),/Read-only/);
});

test('Blob immutable writes use fresh stored bytes and guarded staging-only deletion',async()=>{
  const blob=fakeBlob(),storage=new BlobStorage({sdk:blob.sdk,fetcher:blob.fetcher,token:'blob-fixture-token',artifactOrigin:origin});
  const bytes=Buffer.from('exact fixture');const expected=await storage.putImmutable('staging/item/data',bytes);
  await storage.putImmutable('staging/item/data',bytes);
  await assert.rejects(storage.putImmutable('staging/item/data',Buffer.from('changed')),/integrity/);
  await storage.removeVerified('staging/item/data',expected);await assert.rejects(storage.get('staging/item/data'),{code:'ENOENT'});
  await assert.rejects(storage.removeVerified('maven/item.jar',expected),/Only/);
  assert.throws(()=>new BlobStorage({sdk:blob.sdk,fetcher:blob.fetcher,token:'fixture',artifactOrigin:'https://attacker.example'}),/origin/);
  await assert.rejects(storage.putImmutable('../escape',bytes),/Unsafe/);
});

test('real observed GitHub fixture pipeline packages game, recovers final failure and advances immutable catalog',async()=>{
  const f=await gameFixture();const dry=await f.platform.prepareIssue(1);
  assert.equal(dry.publicationEnabled,true);assert.equal(Object.keys(f.remote.state().requests).length,0);assert.equal(f.blob.objects.size,0);
  f.blob.setFailure('games/game-r11-coin-game/0.1.0/project.zip');
  await assert.rejects(f.platform.publishIssue(1),/unavailable/);
  const accepted=f.remote.state();assert.equal(Object.values(accepted.releases)[0].delivery,'pending');
  const result=await f.platform.reconcile();assert.equal(result.processing[0].release.delivery,'ready');
  const state=f.remote.state();assert.ok(state.catalog.path.startsWith('catalog/snapshots/'));assert.ok(!f.blob.objects.has('catalog/current.json'));
  const zip=await f.storage.get('games/game-r11-coin-game/0.1.0/project.zip');assert.ok(inspectGamePackage(zip).some(file=>file.path==='assets/coin.png'));
  assert.equal(Object.keys(state.requests).length,1);assert.equal(Object.keys(state.releases).length,1);
  validateRegistryState(state);
});

test('library path has no active evidence/execute bypass and source descriptors cannot drift',async()=>{
  const f=await gameFixture();const observed=await f.reader.publicationIssue(1);const source=await f.reader.source(observed.request);
  const library={...observed.request,kind:'library',folder:'libraries/coin-game',descriptor:{...observed.request.descriptor,kind:'library',libraryKind:'widget'}};delete library.descriptor.controls;
  const platform=createSharingPlatform({reader:{publicationIssue:async()=>({...observed,request:library}),source:async request=>({...source,files:[{path:'zero-library.json',bytes:Buffer.from(JSON.stringify(library.descriptor))}],request}),repository:f.reader.repository},registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  await assert.rejects(platform.publishIssue(1),new RegExp(LIBRARY_EXECUTION_GATE));assert.equal(Object.keys(f.remote.state().releases).length,0);
  assert.equal(Object.values(f.remote.state().requests)[0].status,'paused');
  const wrong=createSharingPlatform({reader:{...f.reader,source:async()=>({...source,files:source.files.map(file=>file.path==='zero-game.json'?{...file,bytes:Buffer.from('{}')}:file)})},registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  await assert.rejects(wrong.prepareIssue(1),/descriptor is invalid/);
});

test('catalog CAS pointer cannot move backward from a stale builder and public reports omit provider secrets',async()=>{
  const f=await gameFixture();await f.platform.publishIssue(1);
  const old=await f.registry.read(),next=structuredClone(old.state);
  next.catalog={...next.catalog,sequence:next.sequence+1};next.sequence++;
  assert.equal(await f.registry.compareAndSwap(old.revision,next),true);
  assert.equal(await f.registry.compareAndSwap(old.revision,{...old.state,sequence:old.state.sequence+1}),false);
  assert.equal((await f.registry.read()).state.catalog.sequence,next.catalog.sequence);
  assert.equal(publicError(new Error('Bearer sensitive fixture credential https://private.example')),'Platform unavailable; the durable request can be retried');
  const report=formatPublicReport(Object.values(next.requests)[0]);assert.ok(!Object.hasOwn(report,'attempts'));assert.ok(!Object.hasOwn(report,'frozen'));
});

test('Blob stale public bytes fail closed against origin metadata',async()=>{
  const blob=fakeBlob(),storage=new BlobStorage({sdk:blob.sdk,fetcher:blob.fetcher,token:'blob-fixture-token',artifactOrigin:origin});
  await storage.putImmutable('staging/item/bytes',Buffer.from('fresh'));
  storage.fetcher=async()=>new Response('stale',{headers:{etag:'wrong-etag'}});
  await assert.rejects(storage.get('staging/item/bytes'),/stale/);
});

test('CLI defaults to dry runs and requires explicit reviewed enablement and publisher role',async()=>{
  const f=await gameFixture(),dependencies={loadConfig:async()=>config,createPlatform:async()=>f.platform,environment:{}};
  const dry=await runCli(['publish','--config','fixture','--issue','1'],dependencies);assert.equal(dry.mode,'dry-run');assert.equal(Object.keys(f.remote.state().requests).length,0);
  await assert.rejects(runCli(['publish','--config','fixture','--issue','1','--execute'],dependencies),/publisher role/);
  await assert.rejects(runCli(['publish','--config','fixture','--issue','1','--execute','--role','publisher'],dependencies),/disabled/);
  const result=await runCli(['publish','--config','fixture','--issue','1','--execute','--role','publisher'],{...dependencies,loadConfig:async()=>({...config,gamePublicationEnabled:true})});assert.equal(result.status,'ready');
});

test('bounded inbox listing omits PRs and exposes actionable continuation without assuming queue delivery',async()=>{
  const calls=[];
  const reader=github.createGitHubReader({fetcher:async(url,options)=>{calls.push(url);return new Response(JSON.stringify([{number:1},{number:2,pull_request:{}}]),{headers:{'content-type':'application/json'}});}});
  const batch=await reader.publicationIssues({page:2,perPage:10});assert.deepEqual(batch.issueNumbers,[1]);assert.equal(batch.exhausted,true);assert.match(calls[0],/state=all&sort=created&direction=desc&per_page=10&page=2/);
  await assert.rejects(reader.publicationIssues({repository:'attacker/zero'}),/official/);
  const f=await gameFixture();
  const observedPages=[];
  const manyReader={...f.reader,publicationIssues:async({page})=>{observedPages.push(page);return {issueNumbers:Array.from({length:page===3?20:100},(_,index)=>page*100+index),exhausted:page===3};},publicationIssue:async()=>{throw new Error('Unrelated issue');}};
  const platform=createSharingPlatform({reader:manyReader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  const result=await platform.reconcile();assert.equal(result.intake.length,150);assert.deepEqual(result.inbox.continuation,{page:2,offset:50});assert.equal(result.inbox.exhausted,false);
  assert.deepEqual(f.remote.state().inbox,{page:2,offset:50});
  const continued=await platform.reconcile();assert.equal(continued.intake.length,70);assert.equal(continued.inbox.exhausted,true);assert.deepEqual(observedPages,[1,2,2,3]);assert.deepEqual(f.remote.state().inbox,{page:1,offset:0});
});

test('observed closed issues cancel pending snapshots without withdrawing accepted releases',async()=>{
  const f=await gameFixture();const observed=await f.reader.publicationIssue(1);const closedReader={...f.reader,publicationIssue:async()=>({...observed,issueState:'closed'})};
  const prepared=await f.platform.prepareIssue(1,{persist:true});
  const closed=createSharingPlatform({reader:closedReader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  await closed.reconcile({issueNumbers:[1]});assert.equal(f.remote.state().requests[prepared.record.id].status,'cancelled');assert.equal(Object.keys(f.remote.state().releases).length,0);
  const g=await gameFixture();await g.platform.publishIssue(1);const acceptedClosed=createSharingPlatform({reader:{...g.reader,publicationIssue:async()=>({...await g.reader.publicationIssue(1),issueState:'closed'})},registry:g.registry,storage:g.storage,artifactOrigin:origin,policyRevision:policy});
  await acceptedClosed.reconcile({issueNumbers:[1]});assert.equal(Object.values(g.remote.state().requests)[0].status,'available');assert.equal(Object.values(g.remote.state().releases)[0].delivery,'ready');
});
