import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { libraryArtifactName, writeLibraryCheck, verifyOfficialLibraryEvidence, verifyOfficialLibraryRun, reviewedWorkflowBytes } from '../managed-library.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requestId='a'.repeat(64),sourceDigest='b'.repeat(64),policyRevision='c'.repeat(40),commit='d'.repeat(40),policyDigest='e'.repeat(64),imageId='sha256:'+'f'.repeat(64);
const record={id:requestId,frozen:{kind:'library',sourceDigest,policyRevision,commit}};
const runId=123,attempt=2,artifactId=456;
const components=[{className:'zero.contrib.r1.demo.Display',description:'A display',usage:'new Display()',api:['public Node view()']}];
async function fixture(resultOverrides={}) {
  const dir=await mkdtemp(join(tmpdir(),'zero-managed-library-'));
  const result={passed:true,policy:'zero-libraries-v1',policyDigest,sourceDigest,
    image:{id:imageId,platform:'linux-amd64'},platforms:['linux-amd64'],checks:['bundle','fixed-build','api','behavior','first','second'].map(id=>({id,passed:true})),components,
    artifacts:{jar:Buffer.from('jar bytes'),sources:Buffer.from('source bytes'),pom:Buffer.from('pom bytes')},...resultOverrides};
  await writeLibraryCheck(dir,{record,result,runId,attempt});
  const entries={};for(const name of ['receipt.json','jar','sources','pom','preview'])try{entries[name]=new Uint8Array(await readFile(join(dir,name)));}catch(error){if(error.code!=='ENOENT')throw error;}
  await rm(dir,{recursive:true,force:true});
  const workflow=await reviewedWorkflowBytes(),archive=Buffer.from(zipSync(entries));
  const official={run:{id:runId,run_attempt:attempt,repository:{id:100,full_name:'codepetca/zero'},head_repository:{id:100,full_name:'codepetca/zero'},head_branch:'main',head_sha:'1'.repeat(40),event:'schedule',path:'.github/workflows/sharing-libraries.yml'},
    jobs:[{name:'check',status:'completed',conclusion:'success',run_id:runId,head_sha:'1'.repeat(40)}],
    workflow:{encoding:'base64',content:workflow.toString('base64'),sha:'2'.repeat(40)},
    artifact:{id:artifactId,name:libraryArtifactName(runId,attempt,requestId),expired:false,workflow_run:{id:runId,repository_id:100,head_repository_id:100,head_sha:'1'.repeat(40)},size_in_bytes:archive.length,digest:'sha256:'+hash(archive)},archive};
  return {official,workflow};
}
function verify({official,workflow}) {return verifyOfficialLibraryEvidence({record,official,runId,attempt,artifactId,reviewedWorkflow:workflow,expectedPolicyDigest:policyDigest});}

test('official completed check binds reviewed workflow, frozen source, image and exact output bytes',async()=>{
  const evidence=await fixture();
  const verified=verify(evidence);
  assert.equal(verified.receipt.status,'passed');
  assert.equal(verified.artifacts.jar.toString(),'jar bytes');
  assert.deepEqual(verified.components,components);
});

test('official run, job, workflow and artifact substitutions cannot become publisher evidence',async()=>{
  for(const change of [
    value=>value.official.run.head_branch='student',
    value=>value.official.run.repository.full_name='student/zero',
    value=>value.official.run.run_attempt=attempt+1,
    value=>value.official.run.event='pull_request',
    value=>value.official.run.path='codepetca/zero/.github/workflows/other.yml@refs/heads/main',
    value=>value.official.jobs[0].conclusion='failure',
    value=>value.official.jobs[0].status='in_progress',
    value=>value.official.workflow.content=Buffer.from('changed').toString('base64'),
    value=>value.official.artifact.name='other',
    value=>value.official.artifact.digest='sha256:'+'0'.repeat(64),
    value=>value.official.artifact.workflow_run.id=999,
    value=>value.official.artifact.workflow_run.repository_id=999,
    value=>value.official.archive=Buffer.from('forged')
  ]){const evidence=await fixture();change(evidence);assert.throws(()=>verify(evidence));}
});

test('source rejection has no image or publishable artifacts and still needs a successful official check job',async()=>{
  const evidence=await fixture({passed:false,checks:[{id:'source',passed:false}],image:{id:null,platform:null},platforms:[],components:[],artifacts:undefined});
  const verified=verify(evidence);
  assert.equal(verified.receipt.status,'failed');
  assert.deepEqual(verified.artifacts,{});
  evidence.official.jobs[0].conclusion='failure';
  assert.throws(()=>verify(evidence));
  assert.equal(verifyOfficialLibraryRun({record,official:evidence.official,runId,attempt,reviewedWorkflow:evidence.workflow,expectedConclusion:'failure'}),true);
});


test('a successful receipt cannot omit required API or consumer stages',async()=>{
  const evidence=await fixture({checks:[{id:'bundle',passed:true},{id:'fixed-build',passed:true}]});
  assert.throws(()=>verify(evidence),/incomplete/);
});
