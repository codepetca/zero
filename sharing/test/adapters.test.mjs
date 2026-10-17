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
import { reportAttempt } from '../requests.mjs';
import {minimalGameFiles} from './game-fixture.mjs';

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
  let repository={id:11,name:'game',html_url:'https://github.com/student/game',visibility:'public',private:false,owner:{id:7,login:'student',type:'User'}};
  const issueNumbers=[1];
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
    const name=`${repository.owner.login}/${repository.name}`;
    if(endpoint===`/repos/${name}`||endpoint==='/repositories/11')return json(repository);
    if(endpoint==='/repos/codepetca/zero/issues')return json(issueNumbers.map(number=>({number})));
    const issueNumber=Number(endpoint.split('/').at(-1));
    if(endpoint.startsWith('/repos/codepetca/zero/issues/')&&issueNumbers.includes(issueNumber))return json({number:issueNumber,state:'open',body:'```json\n'+JSON.stringify(request)+'\n```',user:{id:7,login:repository.owner.login,type:'User'}});
    if(endpoint===`/repos/${name}/git/commits/${'a'.repeat(40)}`)return json({sha:'a'.repeat(40),tree:{sha:'c'.repeat(40)}});
    if(endpoint===`/repos/${name}/git/trees/${'c'.repeat(40)}`)return json({truncated:false,tree:files.map(file=>({path:file.path,type:'blob',mode:file.path==='mvnw'?'100755':'100644',size:file.bytes.length,sha:gitHash(file.bytes)}))});
    const blob=blobs.get(endpoint.split('/').at(-1));if(blob)return json({sha:gitHash(blob),size:blob.length,encoding:'base64',content:blob.toString('base64')});
    return json({},404);
  };
  return {fetcher,calls,state:()=>JSON.parse(bytes.toString()),sha:()=>sha,addIssue:number=>issueNumbers.push(number),rename:()=>{repository={...repository,name:'new-game',html_url:'https://github.com/renamed/new-game',owner:{...repository.owner,login:'renamed'}};}};
}
const config={schema:1,repository:'codepetca/zero',registryBranch:REGISTRY_BRANCH,artifactOrigin:origin,policyRevision:policy,gamePublicationEnabled:false};
async function gameFixture({preview=true,previewBytes}={}) {
  const descriptor={schema:1,kind:'game',slug:'coin-game',version:'0.1.0',title:'Coin game',description:'Collect a coin',license:'MIT',controls:'Arrow keys',...(preview?{preview:'preview.png'}:{})};
  const request={schema:1,kind:'game',slug:'coin-game',version:'0.1.0',repository:{id:'11',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:'.',descriptor,policyRevision:policy};
  const files=[...minimalGameFiles().map(file=>({path:file.path,bytes:file.data})),{path:'zero-game.json',bytes:Buffer.from(JSON.stringify(descriptor))},{path:'assets/coin.png',bytes:Buffer.from('coin fixture')},...(preview?[{path:'preview.png',bytes:previewBytes??Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}]:[])];
  const remote=fakeGit({files,request}),blob=fakeBlob();
  const registry=new FileRegistry({adapter:createGitHubRegistryAdapter({fetcher:remote.fetcher,token:'registry-fixture-token'}),maxRetries:8});
  const storage=new BlobStorage({sdk:blob.sdk,fetcher:blob.fetcher,token:'blob-fixture-token',artifactOrigin:origin});
  const reader=github.createGitHubReader({fetcher:remote.fetcher});
  const platform=createSharingPlatform({reader,registry,storage,artifactOrigin:origin,policyRevision:policy});
  return {request,files,remote,blob,registry,storage,reader,platform};
}

test('new game publication requires a committed valid square PNG before any artifact writes',async()=>{
 for(const options of [{preview:false},{previewBytes:Buffer.from([137,80,78,71,13,10,26,10])}]){
  const f=await gameFixture(options);await assert.rejects(f.platform.prepareIssue(1),/screenshot/);
  await assert.rejects(f.platform.publishIssue(1),/screenshot/);assert.equal(Object.keys(f.remote.state().releases).length,0);assert.equal(f.blob.objects.size,0);
  const record=Object.values(f.remote.state().requests)[0];assert.equal(formatPublicReport(record).correction.code,'game-screenshot');
 }
 const f=await gameFixture();const published=await f.platform.publishIssue(1);assert.ok(published.release.artifacts.preview);assert.ok(inspectGamePackage(await f.storage.get(published.release.artifacts.zip.path)).some(file=>file.path==='preview.png'));
});

test('accepted legacy games without screenshots still deliver and restore without source revalidation',async()=>{
 const f=await gameFixture();const published=await f.platform.publishIssue(1),key=`game/${published.release.id}/0.1.0`;
 const legacyRequest=structuredClone(f.request);delete legacyRequest.descriptor.preview;
 await f.registry.update(state=>{
  const oldId=state.releases[key].requestId,record=state.requests[oldId];delete record.frozen.descriptor.preview;const id=digest(record.frozen);record.id=id;delete state.requests[oldId];state.requests[id]=record;state.releases[key].requestId=id;delete state.releases[key].release.artifacts.preview;
 });
 const observed=await f.reader.publicationIssue(1);
 const reader={...f.reader,publicationIssue:async()=>({...observed,request:legacyRequest}),source:async()=>{throw Error('Legacy source must not be revalidated');}};
 const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
 const replay=await platform.publishIssue(1);assert.equal(replay.delivery,'ready');assert.equal(replay.release.artifacts.preview,undefined);
 await platform.setAvailability(key,'withdrawn');await platform.setAvailability(key,'available');assert.equal((await f.registry.read()).state.availability.at(-1).status,'available');
});

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
  const platform=createSharingPlatform({reader:{...f.reader,publicationIssue:async()=>({...observed,request:library}),source:async request=>({...source,files:[{path:'zero-library.json',bytes:Buffer.from(JSON.stringify(library.descriptor))}],request}),repository:f.reader.repository},registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
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

test('Blob verification selects stored representation instead of CDN compression with weak ETags',async()=>{
  const blob=fakeBlob();
  const fetcher=async(url,options)=>{
    const response=await blob.fetcher(url,options);
    if(response.ok&&options.headers['accept-encoding']!=='identity') {
      return new Response(await response.arrayBuffer(),{headers:{etag:'W/'+response.headers.get('etag'),'content-encoding':'br'}});
    }
    return response;
  };
  const storage=new BlobStorage({sdk:blob.sdk,fetcher,token:'blob-fixture-token',artifactOrigin:origin});
  const bytes=Buffer.from('Owned game-sized stored representation.\n'.repeat(500));
  const expected=await storage.putImmutable('staging/representation/zip',bytes);
  assert.deepEqual(await storage.verify(expected.path,expected),bytes);
  storage.fetcher=async()=>new Response(bytes,{headers:{etag:'W/'+blob.objects.get(expected.path).etag}});
  await assert.rejects(storage.verify(expected.path,expected),/stale or unavailable/);
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
  const f=await gameFixture();const observed=await f.reader.publicationIssue(1);const closedReader={...f.reader,publicationIssue:async()=>({...observed,issueState:'closed'}),publicationIssueState:async()=>({...observed,issueState:'closed'})};
  const prepared=await f.platform.prepareIssue(1,{persist:true});
  const closed=createSharingPlatform({reader:closedReader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  await closed.reconcile({issueNumbers:[1]});assert.equal(f.remote.state().requests[prepared.record.id].status,'cancelled');assert.equal(Object.keys(f.remote.state().releases).length,0);
  const g=await gameFixture();await g.platform.publishIssue(1);const acceptedClosed=createSharingPlatform({reader:{...g.reader,publicationIssue:async()=>({...await g.reader.publicationIssue(1),issueState:'closed'}),publicationIssueState:async()=>({...await g.reader.publicationIssue(1),issueState:'closed'})},registry:g.registry,storage:g.storage,artifactOrigin:origin,policyRevision:policy});
  await acceptedClosed.reconcile({issueNumbers:[1]});assert.equal(Object.values(g.remote.state().requests)[0].status,'available');assert.equal(Object.values(g.remote.state().releases)[0].delivery,'ready');
});

test('queued requests recheck closure outside the current inbox page and immediately before acceptance',async()=>{
  const f=await gameFixture();const prepared=await f.platform.prepareIssue(1,{persist:true});
  const closed=createSharingPlatform({reader:{...f.reader,publicationIssues:async()=>({issueNumbers:[],exhausted:true}),publicationIssueState:async()=>({issueId:'1',issueState:'closed',authenticatedActor:{githubId:'7',login:'student'}})},registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  await closed.reconcile();assert.equal(f.remote.state().requests[prepared.record.id].status,'cancelled');assert.equal(Object.keys(f.remote.state().releases).length,0);
  const g=await gameFixture();let observations=0;
  const changing=createSharingPlatform({reader:{...g.reader,publicationIssueState:async()=>({issueId:'1',issueState:++observations===1?'open':'closed',authenticatedActor:{githubId:'7',login:'student'}})},registry:g.registry,storage:g.storage,artifactOrigin:origin,policyRevision:policy});
  await assert.rejects(changing.publishIssue(1),/closed/);assert.equal(Object.keys(g.remote.state().releases).length,0);assert.equal(Object.values(g.remote.state().requests)[0].status,'cancelled');
  assert.ok([...g.blob.objects.keys()].every(key=>key.startsWith('staging/')));
});

test('source descriptor and malformed POM failures are durable public results before rejection',async()=>{
  for(const broken of ['descriptor','pom']) {
    const f=await gameFixture();
    const reader={...f.reader,source:async(request,options)=>{const source=await f.reader.source(request,options);source.files=source.files.map(file=>file.path===(broken==='descriptor'?'zero-game.json':'pom.xml')?{...file,bytes:Buffer.from(broken==='descriptor'?JSON.stringify({...request.descriptor,title:'Mismatch'}):'<project><broken></project>')}:file);source.sourceDigest=digest(source.files.map(file=>({path:file.path,sha256:digest(file.bytes)})));return source;}};
    const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
    await assert.rejects(platform.publishIssue(1));const state=f.remote.state();assert.equal(Object.values(state.requests)[0].status,'failed');assert.equal(Object.keys(state.releases).length,0);assert.equal(f.blob.objects.size,0);
  }
});

test('actual numeric reader renames reuse immutable request/release labels in dry runs and rescans',async()=>{
  const f=await gameFixture();await f.platform.publishIssue(1);
  const before=f.remote.state(),id=Object.keys(before.requests)[0],key=Object.keys(before.releases)[0];
  const blobReads=()=>f.remote.calls.filter(call=>call.url.includes('/git/blobs/')).length;
  const initialReads=blobReads();f.remote.rename();
  const dry=await f.platform.prepareIssue(1);assert.equal(dry.record.id,id);assert.equal(dry.cached,true);assert.deepEqual(f.remote.state(),before);
  f.remote.addIssue(2);await f.platform.reconcile();await f.platform.publishIssue(1);
  const after=f.remote.state();assert.equal(Object.keys(after.requests).length,1);assert.equal(Object.keys(after.releases).length,1);assert.deepEqual(after.requests[id].frozen,before.requests[id].frozen);assert.deepEqual(after.releases[key],before.releases[key]);assert.deepEqual(after.requests[id].issueIds,['1','2']);assert.equal(after.requests[id].status,'available');assert.equal(blobReads(),initialReads);
});

test('typed source corrections explain license/main/pin failures without returning raw private messages',async()=>{
  for(const [file,change,code]of [['LICENSE',()=>Buffer.from('MIT'),'game-license'],['src/main/java/Main.java',()=>Buffer.from('public class Main {}'),'game-main'],['pom.xml',bytes=>Buffer.from(bytes.toString().replace('3.14.0','LATEST')),'game-pins']]) {
    const f=await gameFixture();
    const reader={...f.reader,source:async(request,options)=>{const source=await f.reader.source(request,options);source.files=source.files.map(entry=>entry.path===file?{...entry,bytes:change(entry.bytes)}:entry);source.sourceDigest=digest(source.files.map(entry=>({path:entry.path,sha256:digest(entry.bytes)})));return source;}};
    const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});await assert.rejects(platform.publishIssue(1));
    const record=Object.values(f.remote.state().requests)[0];assert.equal(record.status,'failed');assert.equal(record.attempts.at(-1).sourceDiagnostic.code,code);assert.equal(formatPublicReport(record).correction.code,code);validateRegistryState(f.remote.state());
  }
  const f=await gameFixture();const {record}=await f.platform.prepareIssue(1,{persist:true});
  await reportAttempt(f.registry,record.id,{kind:'source-failure',message:'Bearer private-credential /private/path raw failure',diagnostics:[{file:'src/main/java/Main.java',line:2,message:'Bearer private-credential raw failure'}],sourceDiagnostic:{code:'game-main'}});
  const report=formatPublicReport(f.remote.state().requests[record.id]);assert.equal(report.correction.code,'game-main');assert.doesNotMatch(JSON.stringify(report),/private-credential|private\/path|raw failure/);
  assert.doesNotMatch(JSON.stringify(f.remote.state().requests[record.id].attempts),/private-credential|private\/path|raw failure/);
  await assert.rejects(reportAttempt(f.registry,record.id,{kind:'infrastructure-failure',message:'outage',sourceDiagnostic:{code:'game-main'}}),/Only source failures/);
  const corrupted=f.remote.state();corrupted.requests[record.id].attempts.at(-1).kind='infrastructure-failure';assert.throws(()=>validateRegistryState(corrupted),/Infrastructure reports/);
});

test('CLI passes only typed source corrections while preserving failed versus queued classifications',async()=>{
  const f=await gameFixture();const {record}=await f.platform.prepareIssue(1,{persist:true});
  const reader={...f.reader,source:async(request,options)=>{const source=await f.reader.source(request,options);source.files=source.files.map(file=>file.path==='LICENSE'?{...file,bytes:Buffer.from('MIT')}:file);return source;}};
  const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  const dependencies={loadConfig:async()=>({...config,gamePublicationEnabled:true}),createPlatform:async()=>platform,environment:{}};
  const result=await runCli(['reconcile','--config','fixture','--issues','1','--execute','--role','publisher'],dependencies);assert.equal(result.processing[0].requestId,record.id);assert.equal(result.processing[0].status,'failed');assert.equal(result.processing[0].correction.code,'game-license');
  const g=await gameFixture();await g.platform.prepareIssue(1,{persist:true});const unavailable=createSharingPlatform({reader:{...g.reader,source:async()=>{throw new Error('Bearer private-credential');}},registry:g.registry,storage:g.storage,artifactOrigin:origin,policyRevision:policy});
  const infra=await runCli(['reconcile','--config','fixture','--issues','1','--execute','--role','publisher'],{...dependencies,createPlatform:async()=>unavailable});assert.equal(infra.processing[0].status,'queued');assert.equal(infra.processing[0].correction,undefined);assert.doesNotMatch(JSON.stringify(g.remote.state()),/private-credential/);
});

test('changed source for an accepted version records a typed version-conflict correction',async()=>{
  const f=await gameFixture();await f.platform.publishIssue(1);f.remote.addIssue(2);
  const request={...f.request,commit:'d'.repeat(40)};
  const reader={...f.reader,publicationIssue:async()=>({...await f.reader.publicationIssue(2),request}),source:async()=>{const source=await f.reader.source(f.request);source.request=request;source.files=source.files.map(file=>file.path==='src/main/java/Main.java'?{...file,bytes:Buffer.concat([file.bytes,Buffer.from('\n// corrected source\n')])}:file);source.sourceDigest=digest(source.files.map(file=>({path:file.path,sha256:digest(file.bytes)})));return source;}};
  const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  await assert.rejects(platform.publishIssue(2),/Immutable version conflict/);
  const state=f.remote.state(),failed=Object.values(state.requests).find(record=>record.status==='failed');assert.equal(Object.keys(state.releases).length,1);assert.equal(failed.attempts.at(-1).sourceDiagnostic.code,'version-conflict');assert.equal(formatPublicReport(failed).correction.code,'version-conflict');
});

test('slow 150-request intake checkpoints per item, survives interruption and eventually processes without blob rescans',async()=>{
  const f=await gameFixture();let virtual=0,sourceReads=0,interrupted=false;
  const requestFor=number=>({...f.request,version:`0.1.${number}`,commit:number.toString(16).padStart(40,'0'),descriptor:{...f.request.descriptor,version:`0.1.${number}`}});
  const metadata={...f.request.repository,visibility:'public',ownerType:'User'};
  const reader={...f.reader,
    publicationIssues:async({page})=>({issueNumbers:Array.from({length:page===1?100:50},(_,index)=>(page-1)*100+index+1),exhausted:page===2}),
    publicationIssue:async number=>{await f.reader.repository('student/game');return {issueId:String(number),issueState:'open',authenticatedActor:f.request.requester,repositoryMetadata:metadata,request:requestFor(number)};},
    publicationIssueState:async number=>({issueId:String(number),issueState:'open',authenticatedActor:f.request.requester}),
    source:async(request,{signal})=>{assert.ok(signal);virtual+=1000;sourceReads++;return {request,repositoryMetadata:metadata,sourceDigest:digest(request.commit),files:f.files.map(file=>file.path==='zero-game.json'?{...file,bytes:Buffer.from(JSON.stringify(request.descriptor))}:file)};}
  };
  const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy,now:()=>virtual,wallBudgetMs:10000,sourceTimeoutMs:1000});
  const original=f.registry.compareAndSwap.bind(f.registry);
  f.registry.compareAndSwap=async(revision,next)=>{const result=await original(revision,next);if(result&&!interrupted&&next.inbox.offset===7){interrupted=true;throw new Error('Simulated interruption after durable cursor commit');}return result;};
  await assert.rejects(platform.reconcile(),/Simulated interruption/);assert.deepEqual(f.remote.state().inbox,{page:1,offset:7});assert.equal(Object.values(f.remote.state().requests).filter(record=>record.status==='available').length,6);
  let runs=0;
  while(Object.values(f.remote.state().requests).filter(record=>record.status==='available').length<150&&runs++<30)await platform.reconcile();
  assert.equal(Object.values(f.remote.state().requests).filter(record=>record.status==='available').length,150);assert.deepEqual(f.remote.state().inbox,{page:1,offset:0});assert.ok(runs>1);assert.ok(sourceReads<=151);
  const before=sourceReads;await platform.reconcile();assert.equal(sourceReads,before);
});

test('explicit operator CLI retries paused games and withdraws/restores without replacing bytes or versions',async()=>{
  const f=await gameFixture();const {record}=await f.platform.prepareIssue(1,{persist:true});
  await reportAttempt(f.registry,record.id,{kind:'infrastructure-failure',message:'Fixture outage',maxInfrastructureRetries:1});
  const dependencies={loadConfig:async()=>({...config,gamePublicationEnabled:true}),createPlatform:async()=>f.platform,environment:{}};
  const retryArgs=['retry','--config','fixture','--request',record.id];
  assert.equal((await runCli(retryArgs,dependencies)).mode,'dry-run');assert.equal(f.remote.state().requests[record.id].status,'paused');
  await assert.rejects(runCli([...retryArgs,'--execute'],dependencies),/publisher role/);
  assert.equal((await runCli([...retryArgs,'--execute','--role','publisher'],dependencies)).status,'queued');
  await f.platform.reconcile({issueNumbers:[]});const key='game/game-r11-coin-game/0.1.0',accepted=f.remote.state().releases[key],artifact=accepted.release.artifacts.zip,before=await f.storage.get(artifact.path);
  await assert.rejects(runCli([...retryArgs,'--execute','--role','publisher'],dependencies),/Only infrastructure-paused/);
  for(const command of ['withdraw','restore']) {
    const args=[command,'--config','fixture','--release',key];
    const stateBefore=f.remote.state();await runCli(args,dependencies);assert.deepEqual(f.remote.state(),stateBefore);
    await runCli([...args,'--execute','--role','publisher'],dependencies);
    const state=f.remote.state();assert.deepEqual(state.releases[key].release,accepted.release);assert.equal(state.releases[key].requestId,record.id);assert.deepEqual(await f.storage.get(artifact.path),before);
    const catalog=JSON.parse((await f.storage.get(state.catalog.path)).toString());assert.equal(catalog.releases[0].status,command==='withdraw'?'withdrawn':'available');
  }
  const g=await gameFixture(),observed=await g.reader.publicationIssue(1),source=await g.reader.source(observed.request);
  const library={...observed.request,kind:'library',folder:'libraries/coin-game',descriptor:{...observed.request.descriptor,kind:'library',libraryKind:'widget'}};delete library.descriptor.controls;
  const held=createSharingPlatform({reader:{...g.reader,publicationIssue:async()=>({...observed,request:library}),source:async request=>({...source,files:[{path:'zero-library.json',bytes:Buffer.from(JSON.stringify(library.descriptor))}],request})},registry:g.registry,storage:g.storage,artifactOrigin:origin,policyRevision:policy});
  await assert.rejects(held.publishIssue(1));const libraryRecord=Object.values(g.remote.state().requests)[0];await assert.rejects(held.retryPaused(libraryRecord.id),new RegExp(LIBRARY_EXECUTION_GATE));assert.equal(g.remote.state().requests[libraryRecord.id].status,'paused');
});

test('trusted game pipeline verifies optional web receipt before issuing evidence and never stages a compiled export',async()=>{
  const f=await gameFixture();f.request.web={provider:'github-pages',url:'https://student.github.io/game/',commit:f.request.commit,runId:42};
  let calls=0;
  const platform=createSharingPlatform({reader:{...f.reader,verifyWebPublication:async(request,{signal})=>{calls++;assert.ok(signal instanceof AbortSignal);assert.deepEqual(request.web,f.request.web);return structuredClone(request.web);}},registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
  const published=await platform.publishIssue(1);assert.equal(calls,1);assert.deepEqual(published.release.web,f.request.web);
  assert.deepEqual(Object.keys(published.release.artifacts).sort(),['preview','zip']);
  assert.ok([...f.blob.objects.keys()].every(key=>! /(?:web-export|site\/|\.html$|\.js$)/.test(key)));
  // Updating the student site later does not mutate an accepted source release or
  // rerun verification during immutable delivery/reconciliation.
  await platform.publishIssue(1);assert.equal(calls,1);
});
test('a missing, mismatched or rejected trusted web verifier cannot accept a game release',async()=>{
  for(const result of ['missing','mismatch','stale']) {
    const f=await gameFixture();f.request.web={provider:'github-pages',url:'https://student.github.io/game/',commit:f.request.commit,runId:42};
    const reader={...f.reader};delete reader.verifyWebPublication;
    if(result!=='missing')reader.verifyWebPublication=async()=>{if(result==='stale')throw Object.assign(new Error('The public game serves a different version'),{kind:'source-failure'});return {...f.request.web,runId:43};};
    const platform=createSharingPlatform({reader,registry:f.registry,storage:f.storage,artifactOrigin:origin,policyRevision:policy});
    await assert.rejects(platform.publishIssue(1));assert.equal(Object.keys(f.remote.state().releases).length,0);assert.equal(f.blob.objects.size,0);
  }
});
