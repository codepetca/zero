import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { FileRegistry, initialState, digest } from '../registry.mjs';
import { FileStorage } from '../file-storage.mjs';
import { validateRegistryState } from '../github-registry.mjs';
import { createSharingPlatform } from '../platform.mjs';
import { libraryArtifactName, writeLibraryCheck, reviewedWorkflowBytes } from '../managed-library.mjs';
import { expectedPolicyDigest } from '../../hub/checker/image-policy.mjs';
import { parseArguments, validateLibraryPlatformConfig, validatePlatformConfig } from '../cli.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const id='a'.repeat(64),sourceDigest='b'.repeat(64),policyRevision='c'.repeat(40),commit='d'.repeat(40),runId=123,attempt=1,artifactId=456;
const record={id,frozen:{kind:'library',policyRevision,sourceDigest,commit,repository:{id:'1',owner:'student',name:'library'},requester:{githubId:'2'}},status:'queued',issueIds:['1'],attempts:[],attemptCount:0,releaseKey:null};
test('registry reads old schema 1 bytes unchanged and validates an independent library cursor',()=>{
  const old=initialState();delete old.libraryInbox;
  assert.deepEqual(validateRegistryState(old),old);
  const next={...old,libraryInbox:{page:4,offset:17}};
  assert.deepEqual(validateRegistryState(next),next);
  assert.throws(()=>validateRegistryState({...old,libraryInbox:{page:0,offset:0}}));
});
test('library gate is explicit and separate from the existing game configuration',()=>{
  const game={schema:1,repository:'codepetca/zero',registryBranch:'zero-sharing-registry',artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision,gamePublicationEnabled:true};
  assert.deepEqual(validatePlatformConfig(game),game);
  assert.throws(()=>validateLibraryPlatformConfig(game));
  assert.deepEqual(validateLibraryPlatformConfig({...game,libraryPublicationEnabled:false}).libraryPublicationEnabled,false);
  assert.throws(()=>parseArguments(['library-check','--execute','--role','publisher','--request',id,'--run','1','--attempt','1','--out','/tmp/output']),/publisher role/);
  assert.equal(parseArguments(['library-check','--execute','--role','worker','--request',id,'--run','1','--attempt','1','--out','/tmp/output']).role,'worker');
});
async function evidence(status='failed',failedStage='source') {
  const dir=await mkdtemp(join(tmpdir(),'zero-managed-platform-output-'));
  try {
    const preflight=failedStage==='source';
    const stageOrder=['bundle','fixed-build','api','behavior','first','second'];
    const checks=preflight?[{id:'source',passed:false}]:stageOrder.slice(0,stageOrder.indexOf(failedStage)+1).map(id=>({id,passed:id!==failedStage}));
    await writeLibraryCheck(dir,{record,runId,attempt,result:{passed:false,policy:'zero-libraries-v1',policyDigest:expectedPolicyDigest(),sourceDigest,
      image:preflight?{id:null,platform:null}:{id:'sha256:'+'f'.repeat(64),platform:'linux-amd64'},platforms:preflight?[]:['linux-amd64'],checks,components:[]}});
    const receipt=new Uint8Array(await readFile(join(dir,'receipt.json'))),archive=Buffer.from(zipSync({'receipt.json':receipt})),workflow=await reviewedWorkflowBytes();
    return {run:{id:runId,run_attempt:attempt,repository:{id:100,full_name:'codepetca/zero'},head_repository:{id:100,full_name:'codepetca/zero'},head_branch:'main',head_sha:'e'.repeat(40),event:'schedule',path:'.github/workflows/sharing-libraries.yml'},
      jobs:[{name:'check',status:'completed',conclusion:status==='failed'?'success':'failure',run_id:runId,head_sha:'e'.repeat(40)}],workflow:{encoding:'base64',content:workflow.toString('base64'),sha:'f'.repeat(40)},
      artifact:{id:artifactId,name:libraryArtifactName(runId,attempt,id),expired:false,workflow_run:{id:runId,repository_id:100,head_repository_id:100,head_sha:'e'.repeat(40)},size_in_bytes:archive.length,digest:'sha256:'+hash(archive)},archive};
  } finally {await rm(dir,{recursive:true,force:true});}
}
async function setup(t,official,readerOverrides={}) {
  const dir=await mkdtemp(join(tmpdir(),'zero-managed-platform-registry-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const registry=new FileRegistry({file:join(dir,'registry.json')});
  await registry.update(state=>{state.requests[id]=structuredClone(record);});
  const storage={putImmutable:()=>{throw Error('Failed checks must never stage bytes');},verify:()=>{throw Error('Failed checks must never verify bytes');}};
  const reader={publicationIssue:async()=>{},publicationIssueState:async()=>{},source:async()=>{},repository:async()=>{},...readerOverrides};
  const platform=createSharingPlatform({reader,registry,storage,artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision,libraryPublicationEnabled:true,officialLibraryEvidence:async()=>official});
  return {registry,platform};
}

test('durable library intake selects one open queued request and cancels a closed one before execution',async t=>{
  const opened=await setup(t,null,{publicationIssueState:async()=>({issueState:'open',authenticatedActor:{githubId:'2'}})});
  assert.deepEqual(await opened.platform.selectLibraryForCheck(),{requestId:id,commit});
  const closed=await setup(t,null,{publicationIssueState:async()=>({issueState:'closed',authenticatedActor:{githubId:'2'}}),publicationIssues:async()=>({issueNumbers:[],exhausted:true})});
  assert.equal(await closed.platform.selectLibraryForCheck(),null);
  assert.equal((await closed.registry.read()).state.requests[id].status,'cancelled');
});

test('completed official candidate failure records failed source and never calls publication storage',async t=>{
  const {registry,platform}=await setup(t,await evidence());
  assert.deepEqual(await platform.publishManagedLibrary({requestId:id,runId,attempt,artifactId,token:'read-token'}),{requestId:id,status:'failed'});
  const state=(await registry.read()).state;
  assert.equal(state.requests[id].status,'failed');
  assert.equal(state.requests[id].attempts.at(-1).sourceDiagnostic.code,'source-check');
  assert.equal(Object.keys(state.releases).length,0);
});

test('verified failed checker stage produces a fixed public correction without stderr',async t=>{
  const {registry,platform}=await setup(t,await evidence('failed','fixed-build'));
  await platform.publishManagedLibrary({requestId:id,runId,attempt,artifactId,token:'read-token'});
  assert.equal((await registry.read()).state.requests[id].attempts.at(-1).sourceDiagnostic.code,'library-build');
});

const compatibleSharedPolicy='11c54518320b52a659104eaf01d685fe2dd93917';
for(const requestPolicy of [policyRevision,compatibleSharedPolicy])test(`verified ${requestPolicy===policyRevision?'current':'current-kit compatible'} policy check reaches immutable publication and catalog through the trusted service`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'zero-managed-publish-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const descriptor={schema:1,kind:'library',slug:'flap-motion',version:'0.1.0',title:'Flap Motion',description:'Simple gravity and flap movement.',license:'MIT',libraryKind:'helper'};
  const frozen={schema:1,kind:'library',slug:'flap-motion',version:'0.1.0',repository:{id:'1417021749',ownerId:'7',owner:'student',name:'sky-hop',url:'https://github.com/student/sky-hop'},requester:{githubId:'7',login:'student'},commit,folder:'libraries/flap-motion',descriptor,policyRevision:requestPolicy,sourceDigest};
  const live={id:digest(frozen),frozen,issueIds:['1'],status:'queued',attempts:[],attemptCount:0,releaseKey:null};
  const registry=new FileRegistry({file:join(dir,'registry.json')});
  await registry.update(state=>{state.requests[live.id]=structuredClone(live);});
  const output=join(dir,'output'),components=[{className:'zero.contrib.r1417021749.flap_motion.FlapMotion',description:'Movement',usage:'new FlapMotion()',api:['public void flap()']}];
  await writeLibraryCheck(output,{record:live,runId,attempt,result:{passed:true,policy:'zero-libraries-v1',policyDigest:expectedPolicyDigest(),sourceDigest,
    image:{id:'sha256:'+'f'.repeat(64),platform:'linux-amd64'},platforms:['linux-amd64'],checks:['bundle','fixed-build','api','behavior','first','second'].map(id=>({id,passed:true})),components,
    artifacts:{jar:Buffer.from('jar'),sources:Buffer.from('sources'),pom:Buffer.from('pom')}}});
  const entries={};for(const name of ['receipt.json','jar','sources','pom'])entries[name]=new Uint8Array(await readFile(join(output,name)));
  const archive=Buffer.from(zipSync(entries)),workflow=await reviewedWorkflowBytes();
  const official={run:{id:runId,run_attempt:attempt,repository:{id:100,full_name:'codepetca/zero'},head_repository:{id:100,full_name:'codepetca/zero'},head_branch:'main',head_sha:'e'.repeat(40),event:'schedule',path:'.github/workflows/sharing-libraries.yml'},
    jobs:[{name:'check',status:'completed',conclusion:'success',run_id:runId,head_sha:'e'.repeat(40)}],workflow:{encoding:'base64',content:workflow.toString('base64'),sha:'f'.repeat(40)},
    artifact:{id:artifactId,name:libraryArtifactName(runId,attempt,live.id),expired:false,workflow_run:{id:runId,repository_id:100,head_repository_id:100,head_sha:'e'.repeat(40)},size_in_bytes:archive.length,digest:'sha256:'+hash(archive)},archive};
  const storage=new FileStorage({root:join(dir,'objects')});
  const originalPut=storage.putImmutable.bind(storage);let interruptDelivery=true;
  storage.putImmutable=async(key,bytes)=>{if(interruptDelivery&&key.startsWith('maven/')){interruptDelivery=false;throw new Error('Transient object delivery outage');}return originalPut(key,bytes);};
  const reader={publicationIssue:async()=>{},publicationIssueState:async()=>({issueState:'open',authenticatedActor:{githubId:frozen.requester.githubId}}),source:async()=>({files:[],sourceDigest}),repository:async()=>({
    ...frozen.repository,visibility:'public',ownerType:'User'})};
  const platform=createSharingPlatform({reader,registry,storage,artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision,libraryPublicationEnabled:true,officialLibraryEvidence:async()=>official,checkLibrarySource:async({request,sourceDigest:checkedDigest})=>{assert.equal(request.policyRevision,requestPolicy);assert.equal(checkedDigest,sourceDigest);return {sourceDigest};}});
  assert.deepEqual(await platform.selectLibraryForCheck(),{requestId:live.id,commit});
  assert.equal((await platform.checkLibraryRequest(live.id)).result.sourceDigest,sourceDigest);
  await assert.rejects(platform.publishManagedLibrary({requestId:live.id,runId,attempt,artifactId,token:'read-token'}),/Transient object delivery outage/);
  assert.equal((await registry.read()).state.requests[live.id].status,'delivery-pending');
  assert.deepEqual(await platform.selectLibraryForCheck(),{requestId:live.id,commit,recovery:true});
  const release=await platform.publishManagedLibrary({requestId:live.id,runId,attempt,token:'read-token',checkOutcome:'skipped'});
  assert.equal(release.delivery,'ready');
  const state=(await registry.read()).state;
  assert.equal(state.requests[live.id].status,'available');
  assert.equal(Object.keys(state.releases).length,1);
  assert.ok(state.catalog?.path.startsWith('catalog/snapshots/'));
  assert.deepEqual(state.requests[live.id].frozen,frozen);assert.equal(release.release.policyRevision,requestPolicy);
});

test('failed official check job retries infrastructure and pauses after three attempts',async t=>{
  const {registry,platform}=await setup(t,await evidence('job-failed'));
  for(let count=1;count<=3;count++){
    const result=await platform.publishManagedLibrary({requestId:id,runId,attempt,token:'read-token',checkOutcome:'failure'});
    assert.equal(result.status,count===3?'paused':'queued');
  }
  assert.equal((await registry.read()).state.requests[id].infrastructureFailures,3);
});


test('old-policy queued libraries never start a managed check while current-policy work remains eligible',async t=>{
 const {registry,platform}=await setup(t,null,{publicationIssues:async()=>({issueNumbers:[],exhausted:true}),publicationIssueState:async()=>({issueState:'open',authenticatedActor:{githubId:'2'}})});
 await registry.update(state=>{
   state.requests[id].frozen.policyRevision='1'.repeat(40);
   const other=structuredClone(state.requests[id]);other.id='2'.repeat(64);state.requests[other.id]=other;
 });
 assert.equal(await platform.selectLibraryForCheck(),null);
 const state=(await registry.read()).state;
 assert.deepEqual(Object.values(state.requests).map(record=>record.status).sort(),['failed','queued']);
 await registry.update(state=>{const current=structuredClone(record);current.id='3'.repeat(64);state.requests[current.id]=current;});
 assert.deepEqual(await platform.selectLibraryForCheck(),{requestId:'3'.repeat(64),commit});
});


test('unknown and legacy game-only policies never gain library intake, checking or publication authority',async t=>{
  for(const requestPolicy of ['1'.repeat(40),'1b63ae6ce07f467ab4c4600d78507157ad3bdc7c']){
    const {registry,platform}=await setup(t,null,{publicationIssues:async()=>({issueNumbers:[],exhausted:true}),publicationIssueState:async()=>({issueState:'open',authenticatedActor:{githubId:'2'}})});
    await registry.update(state=>{state.requests[id].frozen.policyRevision=requestPolicy;});
    await assert.rejects(platform.checkLibraryRequest(id),/different policy revision/);
    await assert.rejects(platform.publishManagedLibrary({requestId:id,runId,attempt,artifactId,token:'read-token'}),/different policy revision/);
    assert.equal(await platform.selectLibraryForCheck(),null);
    const state=(await registry.read()).state;assert.equal(state.requests[id].status,'failed');assert.equal(Object.keys(state.releases).length,0);
  }
});

test('a newly observed current-kit library request enters the newer publisher without changing its policy',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'zero-compatible-library-intake-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const repository={id:'11',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
  const metadata={...repository,visibility:'public',ownerType:'User'};
  const descriptor={schema:1,kind:'library',slug:'helper',version:'0.1.0',title:'Helper',description:'A helper',license:'MIT',libraryKind:'helper'};
  const request={schema:1,kind:'library',slug:'helper',version:'0.1.0',repository,requester:{githubId:'7',login:'student'},commit,folder:'libraries/helper',descriptor,policyRevision:compatibleSharedPolicy};
  const registry=new FileRegistry({file:join(dir,'registry.json')});
  const reader={publicationIssue:async()=>({request,repositoryMetadata:metadata,issueId:'1',issueState:'open',authenticatedActor:request.requester}),publicationIssueState:async()=>({issueState:'open',authenticatedActor:request.requester}),source:async()=>({repositoryMetadata:metadata,sourceDigest,files:[{path:'zero-library.json',bytes:Buffer.from(JSON.stringify(descriptor))}]}),repository:async()=>metadata};
  const platform=createSharingPlatform({reader,registry,storage:{},artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision,libraryPublicationEnabled:true});
  const {record:observed}=await platform.prepareIssue(1,{persist:true});
  assert.deepEqual(observed.frozen,{...request,sourceDigest});assert.equal(observed.id,digest(observed.frozen));
  assert.deepEqual(await platform.selectLibraryForCheck(),{requestId:observed.id,commit});
});
