import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, symlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileRegistry, digest, initialState, revisionOf } from '../registry.mjs';
import { ingestRequest, cancelRequest, reportAttempt, reconcileInbox, retryRequest } from '../requests.mjs';
import { FileStorage, byteHash } from '../file-storage.mjs';
import { PublicationService, generateCatalog } from '../publication.mjs';

function fixtureRequest(index=1, options={}) {
  const repository = {id:String(index),ownerId:String(index),owner:'student'+index,name:'game',url:'https://github.com/student'+index+'/game'};
  const kind = options.kind || 'library';
  return {schema:1,kind,slug:'health-bar',version:options.version || '0.1.0',repository,requester:{githubId:String(index),login:'student'+index},commit:options.commit || 'a'.repeat(40),folder:kind==='library'?'libraries/health-bar':'.',descriptor:{schema:1,kind,slug:'health-bar',version:options.version || '0.1.0',title:'Health bar',description:'Useful game progress',license:'MIT',...(kind==='library'?{libraryKind:'widget'}:{controls:'Arrow keys'})},policyRevision:'b'.repeat(40)};
}
const metadata = request => ({...request.repository,visibility:'public',ownerType:'User'});
const artifacts = {jar:Buffer.from('binary jar fixture'),sources:Buffer.from('source jar fixture'),pom:Buffer.from('<project>fixed trusted POM</project>')};
function evidence(record, files=artifacts) {
  return {status:'passed',requestFingerprint:record.id,sourceDigest:record.frozen.sourceDigest,commit:record.frozen.commit,policyRevision:record.frozen.policyRevision,artifacts:Object.fromEntries(Object.entries(files).map(([kind,bytes])=>[kind,{sha256:byteHash(bytes),size:bytes.length}])),provenance:{fixture:true}};
}
async function fixture(t, options={}) {
  const temporary=await mkdtemp(path.join(os.tmpdir(),'zero-registry-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const registry=new FileRegistry({file:path.join(temporary,'registry.json')});
  const storage=new FileStorage({root:path.join(temporary,'objects')});
  const service=new PublicationService({registry,storage,artifactOrigin:'http://127.0.0.1:8080',verifyEvidence:async value=>value.provenance?.fixture===true,resolveRepositoryMetadata:async id=>metadata(fixtureRequest(Number(id))),...options});
  const ingest=async (request=fixtureRequest())=>ingestRequest(registry,{issueId:request.repository.id,request,authenticatedActor:request.requester,repositoryMetadata:metadata(request),sourceDigest:digest(request.commit)});
  return {temporary,registry,storage,service,ingest};
}

test('request freeze, edits, duplicate events, owner/visibility checks and cancellation',async t=>{
  const f=await fixture(t); const first=await f.ingest();
  const duplicate=await ingestRequest(f.registry,{issueId:'999',request:fixtureRequest(),authenticatedActor:fixtureRequest().requester,repositoryMetadata:metadata(fixtureRequest()),sourceDigest:digest('a'.repeat(40))});
  assert.equal(first.id,duplicate.id); assert.deepEqual(duplicate.issueIds,['1','999']);
  const edited=await f.ingest(fixtureRequest(1,{commit:'c'.repeat(40)})); assert.notEqual(first.id,edited.id);
  await assert.rejects(ingestRequest(f.registry,{issueId:'1',request:fixtureRequest(),authenticatedActor:fixtureRequest().requester,repositoryMetadata:{...metadata(fixtureRequest()),ownerId:'2'},sourceDigest:digest('x')}),/drift/);
  await assert.rejects(ingestRequest(f.registry,{issueId:'1',request:fixtureRequest(),authenticatedActor:fixtureRequest().requester,repositoryMetadata:{...metadata(fixtureRequest()),visibility:'private'},sourceDigest:digest('x')}),/public/);
  await assert.rejects(ingestRequest(f.registry,{issueId:'1',request:fixtureRequest(),authenticatedActor:{githubId:'2',login:'attacker'},repositoryMetadata:metadata(fixtureRequest()),sourceDigest:digest('x')}),/actor/);
  await cancelRequest(f.registry,first.id);
  await assert.rejects(f.service.publish({requestId:first.id,evidence:evidence(first),artifacts}),/cancelled/);
  assert.equal((await f.registry.read()).state.requests[edited.id].status,'queued');
});

test('open-issue recovery preserves failed and paused states and retains cancellation history',async t=>{
  const f=await fixture(t);const record=await f.ingest();
  const input={issueId:'2',request:fixtureRequest(),authenticatedActor:fixtureRequest().requester,
    repositoryMetadata:metadata(fixtureRequest()),sourceDigest:record.frozen.sourceDigest};
  await reportAttempt(f.registry,record.id,{kind:'source-failure',message:'bad source'});
  assert.equal((await ingestRequest(f.registry,input,{resumeCancelled:true})).status,'failed');
  await reportAttempt(f.registry,record.id,{kind:'infrastructure-failure',message:'offline',maxInfrastructureRetries:1});
  assert.equal((await ingestRequest(f.registry,input,{resumeCancelled:true})).status,'paused');
  await cancelRequest(f.registry,record.id);
  assert.equal((await ingestRequest(f.registry,input)).status,'cancelled');
  const resumed=await ingestRequest(f.registry,input,{resumeCancelled:true});
  assert.equal(resumed.status,'queued');assert.equal(resumed.id,record.id);
  assert.equal(resumed.attempts.length,2);assert.equal(resumed.infrastructureFailures,1);
});

test('immutable acceptance, concurrent duplicates and competing sources',async t=>{
  const f=await fixture(t); const first=await f.ingest(), other=await f.ingest(fixtureRequest(1,{commit:'c'.repeat(40)}));
  const results=await Promise.allSettled([first,first,other].map(record=>f.service.publish({requestId:record.id,evidence:evidence(record),artifacts})));
  assert.ok(results.some(result=>result.status==='rejected'));
  assert.ok(results.some(result=>result.status==='fulfilled'));
  const {state}=await f.registry.read(); assert.equal(Object.keys(state.releases).length,1);
  assert.equal(Object.values(state.releases)[0].delivery,'ready');
  const item=Object.values(state.releases)[0]; assert.ok([first.id,other.id].includes(item.requestId));
  await assert.rejects(cancelRequest(f.registry,item.requestId),/availability/);
  for(const [kind,value]of Object.entries(item.release.artifacts)) {
    assert.deepEqual(await f.storage.get(value.path),artifacts[kind]);
    assert.equal((await f.storage.get(value.path+'.sha1')).toString(),byteHash(artifacts[kind],'sha1')+'\n');
  }
  await f.service.setAvailability(first.releaseKey || 'library/lib-r1-health-bar/0.1.0','withdrawn');
  const withdrawn=generateCatalog((await f.registry.read()).state,{artifactOrigin:'http://127.0.0.1:8080'}); assert.equal(withdrawn.releases[0].status,'withdrawn');
  await f.service.publish({requestId:item.requestId});
  assert.equal(generateCatalog((await f.registry.read()).state,{artifactOrigin:'http://127.0.0.1:8080'}).releases[0].status,'withdrawn');
});

test('accepted-version conflicts are source failures with a new-version correction',async t=>{
  const f=await fixture(t),first=await f.ingest();
  await f.service.publish({requestId:first.id,evidence:evidence(first),artifacts});
  const other=await f.ingest(fixtureRequest(1,{commit:'c'.repeat(40)}));
  await assert.rejects(f.service.publish({requestId:other.id,evidence:evidence(other),artifacts}),error=>error.kind==='source-failure'&&/use a new version/.test(error.message));
  await f.service.reconcile({prepare:async record=>({evidence:evidence(record),artifacts})});
  const state=(await f.registry.read()).state;
  assert.equal(state.requests[other.id].status,'failed');assert.equal(Object.keys(state.releases).length,1);
});

test('forged receipts/hashes never stage or reserve a version',async t=>{
  const f=await fixture(t);const record=await f.ingest();
  await assert.rejects(f.service.publish({requestId:record.id,evidence:{...evidence(record),provenance:{fixture:false}},artifacts}),/verification/);
  await assert.rejects(f.service.publish({requestId:record.id,evidence:{...evidence(record),commit:'c'.repeat(40)},artifacts}),/bound/);
  await assert.rejects(f.service.publish({requestId:record.id,evidence:evidence(record),artifacts:{...artifacts,jar:Buffer.from('substitution')}}),/bound/);
  assert.equal(Object.keys((await f.registry.read()).state.releases).length,0);
});

test('staging, Git CAS, final objects and catalog interruptions recover exactly',async t=>{
  for(const stage of ['staging','cas','final','catalog']) {
    const f=await fixture(t);const record=await f.ingest();
    let armed=true;
    const originalPut=f.storage.putImmutable.bind(f.storage);
    f.storage.putImmutable=async (key,bytes)=>{if(armed && ((stage==='staging'&&key.startsWith('staging/'))||(stage==='final'&&key.startsWith('maven/'))||(stage==='catalog'&&key.startsWith('catalog/')))){armed=false;throw new Error('injected '+stage);}return originalPut(key,bytes);};
    const originalCas=f.registry.compareAndSwap.bind(f.registry);
    f.registry.compareAndSwap=async (revision,next)=>{if(armed&&stage==='cas'&&Object.keys(next.releases).length){armed=false;throw new Error('injected cas');}return originalCas(revision,next);};
    await assert.rejects(f.service.publish({requestId:record.id,evidence:evidence(record),artifacts}),/injected/);
    const state=(await f.registry.read()).state;
    assert.equal(Object.keys(state.releases).length,stage==='staging'||stage==='cas'?0:1);
    const result=await f.service.reconcile({prepare:async rec=>({evidence:evidence(rec),artifacts})});
    assert.equal(result.filter(value=>value.error).length,0);
    const after=(await new FileRegistry({file:f.registry.file}).read()).state;
    assert.equal(after.requests[record.id].status,'available'); assert.ok(after.catalog);
    assert.equal(generateCatalog(after,{artifactOrigin:f.service.artifactOrigin}).releases.length,1);
  }
});

test('cancellation at final acceptance and transfer do not establish ownership',async t=>{
  const f=await fixture(t); const record=await f.ingest();
  f.service.resolveRepositoryMetadata=async ()=>{await cancelRequest(f.registry,record.id); return metadata(fixtureRequest());};
  await assert.rejects(f.service.publish({requestId:record.id,evidence:evidence(record),artifacts}),/cancelled/);
  assert.equal(Object.keys((await f.registry.read()).state.items).length,0);
  const g=await fixture(t);const other=await g.ingest();g.service.resolveRepositoryMetadata=async()=>({...metadata(fixtureRequest()),ownerId:'2'});
  await assert.rejects(g.service.publish({requestId:other.id,evidence:evidence(other),artifacts}),/migration/);
});

test('150 durable requests survive dropped jobs and eventually process',async t=>{
  const f=await fixture(t);
  const issues=Array.from({length:150},(_,index)=>({id:String(index+1)}));
  const inbox=await reconcileInbox(f.registry,issues,async issue=>{const request=fixtureRequest(Number(issue.id));return {request,authenticatedActor:request.requester,repositoryMetadata:metadata(request),sourceDigest:digest(request.commit)};});
  assert.equal(inbox.filter(result=>result.error).length,0);
  const failed=inbox[0].request;
  await reportAttempt(f.registry,failed.id,{kind:'infrastructure-failure',message:'Event job cancelled by queue overflow'});
  const results=await f.service.reconcile({prepare:async record=>({evidence:evidence(record),artifacts})});
  assert.equal(results.length,150);assert.equal(results.filter(value=>value.error).length,0);
  const after=(await f.registry.read()).state;
  assert.equal(Object.values(after.requests).filter(record=>record.status==='available').length,150);
  assert.equal(generateCatalog(after,{artifactOrigin:f.service.artifactOrigin}).releases.length,150);
});

test('atomic adapter retries CAS drift without losing independent requests',async t=>{
  let state=initialState(),revision=revisionOf(state),conflicts=0;
  const registry=new FileRegistry({adapter:{read:async()=>({state:structuredClone(state),revision}),compareAndSwap:async(expected,next)=>{if(expected!==revision){conflicts++;return false;}state=structuredClone(next);revision=revisionOf(state);return true;}}});
  await Promise.all(Array.from({length:30},(_,index)=>{const request=fixtureRequest(index+1);return ingestRequest(registry,{issueId:String(index+1),request,authenticatedActor:request.requester,repositoryMetadata:metadata(request),sourceDigest:digest(request.commit)});}));
  assert.equal(Object.keys(state.requests).length,30);assert.ok(conflicts>0);
});

test('file backend rejects traversal, symlinks and unequal immutable objects',async t=>{
  const f=await fixture(t);
  await f.storage.putImmutable('safe/item',Buffer.from('abc'));
  await f.storage.putImmutable('safe/item',Buffer.from('abc'));
  await assert.rejects(f.storage.putImmutable('safe/item',Buffer.from('xyz')),/conflict/);
  for(const key of ['../escape','/absolute','safe/../../escape','safe\\escape','safe/%2e%2e/escape']) await assert.rejects(f.storage.putImmutable(key,Buffer.from('x')),/Unsafe/);
  await symlink(f.registry.file,path.join(f.storage.root,'safe','link'));
  await assert.rejects(f.storage.get('safe/link'));
  await mkdir(path.join(f.temporary,'external'));await symlink(path.join(f.temporary,'external'),path.join(f.storage.root,'evil'));
  await assert.rejects(f.storage.putImmutable('evil/item',Buffer.from('x')),/symlink/);
});

test('operator staging retention cleanup keeps direct downloads and retries intact',async t=>{
  const f=await fixture(t);const record=await f.ingest();
  const accepted=await f.service.publish({requestId:record.id,evidence:evidence(record),artifacts});
  const key='library/lib-r1-health-bar/0.1.0';
  await assert.rejects(f.service.pruneStaging(key,{retentionEligible:async()=>false}),/eligible/);
  await f.service.pruneStaging(key,{retentionEligible:async()=>true});
  for(const stage of Object.values(accepted.staged)) await assert.rejects(f.storage.get(stage),{code:'ENOENT'});
  await f.service.deliver(key);
  assert.equal((await f.registry.read()).state.requests[record.id].status,'available');
});

test('finite infrastructure retries pause durably and explicit retry recovers',async t=>{
  const f=await fixture(t);const record=await f.ingest();
  for(let index=0;index<3;index++) await f.service.reconcile({prepare:async()=>{throw new Error('Runner unavailable');}});
  assert.equal((await f.registry.read()).state.requests[record.id].status,'paused');
  assert.equal((await f.service.reconcile()).length,0);
  await retryRequest(f.registry,record.id);
  await f.service.reconcile({prepare:async rec=>({evidence:evidence(rec),artifacts})});
  assert.equal((await f.registry.read()).state.requests[record.id].status,'available');
});

test('repository rename retains IDs while pre-acceptance source correction gets a new fingerprint',async t=>{
  const f=await fixture(t);const failed=await f.ingest();
  await reportAttempt(f.registry,failed.id,{kind:'source-failure',message:'Compilation failed',diagnostics:[{file:'src/main/java/Health.java',line:3,message:'Unknown symbol'}]});
  const fixed=await f.ingest(fixtureRequest(1,{commit:'c'.repeat(40)}));
  f.service.resolveRepositoryMetadata=async()=>({...metadata(fixtureRequest()),owner:'renamed',name:'new-game',url:'https://github.com/renamed/new-game'});
  const accepted=await f.service.publish({requestId:fixed.id,evidence:evidence(fixed),artifacts});
  assert.equal(accepted.release.id,'lib-r1-health-bar');assert.equal(accepted.release.repository.url,'https://github.com/renamed/new-game');assert.equal(accepted.release.contributor.login,'renamed');
  assert.equal((await f.registry.read()).state.requests[failed.id].status,'failed');
});

test('stable source ingestion links renamed labels without changing frozen fingerprints, but source or actor changes remain distinct',async t=>{
  const f=await fixture(t),original=await f.ingest();
  const request=fixtureRequest(),renamed={...request,repository:{...request.repository,owner:'renamed',name:'new-game',url:'https://github.com/renamed/new-game'},requester:{...request.requester,login:'renamed'}};
  const linked=await ingestRequest(f.registry,{issueId:'2',request:renamed,authenticatedActor:renamed.requester,repositoryMetadata:metadata(renamed),sourceDigest:original.frozen.sourceDigest});
  assert.equal(linked.id,original.id);assert.deepEqual(linked.frozen,original.frozen);assert.deepEqual(linked.issueIds,['1','2']);
  const other=await ingestRequest(f.registry,{issueId:'3',request:{...renamed,commit:'c'.repeat(40)},authenticatedActor:renamed.requester,repositoryMetadata:metadata(renamed),sourceDigest:digest('different source')});assert.notEqual(other.id,original.id);
  const changed=await ingestRequest(f.registry,{issueId:'4',request:{...renamed,descriptor:{...renamed.descriptor,title:'Changed details'}},authenticatedActor:renamed.requester,repositoryMetadata:metadata(renamed),sourceDigest:original.frozen.sourceDigest});assert.notEqual(changed.id,original.id);
  await assert.rejects(ingestRequest(f.registry,{issueId:'5',request:renamed,authenticatedActor:{githubId:'2',login:'other'},repositoryMetadata:metadata(renamed),sourceDigest:original.frozen.sourceDigest}),/actor/);
});

test('web receipts are part of immutable request fingerprints, deduplication and trusted acceptance evidence',async t=>{
  const f=await fixture(t),request=fixtureRequest(1,{kind:'game'}),files={zip:Buffer.from('trusted editable source ZIP fixture')};
  const plain=await f.ingest(request),web={provider:'github-pages',url:'https://student1.github.io/game/',commit:request.commit,runId:42};
  const linked=await f.ingest({...request,web}),duplicate=await f.ingest({...request,web});
  assert.notEqual(plain.id,linked.id);assert.equal(linked.id,duplicate.id);
  const otherRun=await f.ingest({...request,web:{...web,runId:43}});assert.notEqual(linked.id,otherRun.id);
  await assert.rejects(f.service.publish({requestId:linked.id,evidence:evidence(linked,files),artifacts:files}),/Web publication.*trusted evidence/);
  await assert.rejects(f.service.publish({requestId:plain.id,evidence:{...evidence(plain,files),web},artifacts:files}),/Web publication.*trusted evidence/);
  const published=await f.service.publish({requestId:linked.id,evidence:{...evidence(linked,files),web},artifacts:files});
  assert.deepEqual(published.release.web,web);assert.deepEqual(Object.keys(published.release.artifacts),['zip']);
  const replay=await f.service.publish({requestId:linked.id});assert.deepEqual(replay.release.web,web);
  await assert.rejects(f.service.publish({requestId:otherRun.id,evidence:{...evidence(otherRun,files),web:{...web,runId:43}},artifacts:files}),/Immutable version conflict/);
  assert.deepEqual(generateCatalog((await f.registry.read()).state,{artifactOrigin:f.service.artifactOrigin}).releases[0].web,web);
});
