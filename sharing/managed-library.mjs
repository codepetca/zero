import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { digest } from './registry.mjs';

export const LIBRARY_WORKFLOW = '.github/workflows/sharing-libraries.yml';
export const LIBRARY_REPOSITORY = 'codepetca/zero';
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_RECEIPT = 64 * 1024;
const ARTIFACT_KINDS = ['jar', 'sources', 'pom', 'preview'];
const hex40 = /^[a-f0-9]{40}$/;
const hex64 = /^[a-f0-9]{64}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function libraryArtifactName(runId, attempt, requestId) {
  if (!positive(runId) || !positive(attempt) || !hex64.test(requestId)) throw new Error('Invalid managed library artifact identity');
  return `zero-library-${runId}-${attempt}-${requestId}`;
}

export async function writeLibraryCheck(dir, {record, result, runId, attempt}) {
  if (record?.frozen?.kind !== 'library' || !hex64.test(record.id) || result?.sourceDigest !== record.frozen.sourceDigest || typeof result.passed !== 'boolean') throw new Error('Checker result differs from frozen library source');
  const preflightFailure=!result.passed && result.checks?.length===1 && result.checks[0]?.id==='source' && result.checks[0]?.passed===false;
  if (typeof result.policy !== 'string' || !hex64.test(result.policyDigest) || !result.image || !(preflightFailure && result.image.id===null && result.image.platform===null) && (!/^sha256:[a-f0-9]{64}$/.test(result.image.id) || !/^linux-(amd64|arm64)$/.test(result.image.platform))) throw new Error('Checker image provenance missing');
  if (!Array.isArray(result.checks) || !Array.isArray(result.platforms) || !(preflightFailure && result.platforms.length===0) && (result.platforms.length!==1 || result.platforms[0]!==result.image.platform)) throw new Error('Checker checks/platform missing');
  const name = libraryArtifactName(runId, attempt, record.id);
  const artifacts = result.passed ? result.artifacts : undefined;
  if (result.passed && (!artifacts?.jar || !artifacts?.sources || !artifacts?.pom || !Array.isArray(result.components))) throw new Error('Passing checker omitted artifacts/components');
  const hashes = {};
  for (const [kind, bytes] of Object.entries(artifacts || {})) {
    if (!ARTIFACT_KINDS.includes(kind) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('Invalid checker artifact');
    hashes[kind] = {size:bytes.length, sha256:sha256(bytes)};
  }
  if (result.passed && ['jar','sources','pom'].some(kind => !hashes[kind])) throw new Error('Required checker artifact missing');
  const receipt = {schema:1, status:result.passed?'passed':'failed', requestFingerprint:record.id,
    sourceDigest:record.frozen.sourceDigest, commit:record.frozen.commit, policyRevision:record.frozen.policyRevision,
    checkerPolicy:result.policy, checkerPolicyDigest:result.policyDigest, image:result.image,
    checks:result.checks, platforms:result.platforms, artifacts:hashes,
    ...(result.passed?{components:result.components,componentsDigest:digest(result.components)}:{})};
  const serialized = Buffer.from(JSON.stringify(receipt));
  if (serialized.length > MAX_RECEIPT) throw new Error('Checker receipt exceeds limit');
  await mkdir(dir,{recursive:true,mode:0o700});
  await writeFile(join(dir,'receipt.json'),serialized,{mode:0o600});
  for (const [kind,bytes] of Object.entries(artifacts||{})) await writeFile(join(dir,kind),bytes,{mode:0o600});
  return {name, receipt};
}

async function bounded(response, maximum) {
  if (!response.ok) throw new Error('Official GitHub evidence unavailable');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) throw new Error('Official GitHub evidence exceeds limit');
  let size=0; const parts=[];
  for await (const chunk of response.body) {size+=chunk.length;if(size>maximum)throw new Error('Official GitHub evidence exceeds limit');parts.push(Buffer.from(chunk));}
  return Buffer.concat(parts);
}

export async function fetchOfficialLibraryEvidence({token,runId,artifactId,fetcher=fetch}) {
  if (!token || !positive(runId) || (artifactId!==undefined && !positive(artifactId))) throw new Error('Official workflow evidence requires exact IDs and read token');
  const base=`https://api.github.com/repos/${LIBRARY_REPOSITORY}`;
  const headers={accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2026-03-10','user-agent':'zero-library-publisher'};
  async function json(path) {const response=await fetcher(base+path,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});return JSON.parse((await bounded(response,2*1024*1024)).toString('utf8'));}
  const run=await json(`/actions/runs/${runId}`);
  const [jobPage,workflow,artifact] = await Promise.all([
    json(`/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`),
    json(`/contents/${LIBRARY_WORKFLOW}?ref=${encodeURIComponent(run.head_sha)}`),
    artifactId===undefined?undefined:json(`/actions/artifacts/${artifactId}`)
  ]);
  if (artifactId===undefined) return {run,jobs:jobPage.jobs,workflow};
  const response=await fetcher(base+`/actions/artifacts/${artifactId}/zip`,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});
  if (response.status!==302) throw new Error('Official artifact download redirect missing');
  const location=response.headers.get('location');
  if (!location || new URL(location).protocol!=='https:') throw new Error('Invalid official artifact download URL');
  const archive=await bounded(await fetcher(location,{redirect:'error',signal:AbortSignal.timeout(30000)}),MAX_ARCHIVE);
  return {run,jobs:jobPage.jobs,artifact,workflow,archive};
}

export function verifyOfficialLibraryEvidence({record,official,runId,attempt,artifactId,reviewedWorkflow,expectedPolicyDigest}) {
  if (record?.frozen?.kind!=='library' || !hex64.test(record.id) || !positive(runId) || !positive(attempt) || !positive(artifactId) || !hex40.test(record.frozen.policyRevision)) throw new Error('Invalid frozen managed library request');
  const {run,jobs,artifact,workflow,archive}=official||{};
  verifyOfficialLibraryRun({record,official,runId,attempt,reviewedWorkflow,expectedConclusion:'success'});
  if (artifact?.id!==artifactId || artifact.name!==libraryArtifactName(runId,attempt,record.id) || artifact.expired!==false || artifact.workflow_run?.id!==runId || artifact.workflow_run?.head_sha!==run.head_sha || artifact.workflow_run?.repository_id!==run.repository.id || artifact.workflow_run?.head_repository_id!==run.head_repository.id || !Buffer.isBuffer(archive) || archive.length>MAX_ARCHIVE || artifact.size_in_bytes!==archive.length || artifact.digest!==`sha256:${sha256(archive)}`) throw new Error('Official artifact identity or ZIP digest mismatch');
  let unexpected=false;
  const files=unzipSync(new Uint8Array(archive),{filter:file=>{const allowed=['receipt.json',...ARTIFACT_KINDS].includes(file.name) && file.originalSize<=16*1024*1024;if(!allowed)unexpected=true;return allowed;}});
  if (unexpected || !files['receipt.json'] || files['receipt.json'].length>MAX_RECEIPT || Object.keys(files).some(name=>!['receipt.json',...ARTIFACT_KINDS].includes(name))) throw new Error('Managed artifact file set invalid');
  const receipt=JSON.parse(Buffer.from(files['receipt.json']).toString('utf8'));
  const preflightFailure=receipt.status==='failed' && receipt.checks?.length===1 && receipt.checks[0]?.id==='source' && receipt.checks[0]?.passed===false && receipt.image?.id===null && receipt.image?.platform===null && JSON.stringify(receipt.platforms)==='[]';
  if (receipt.schema!==1 || !['passed','failed'].includes(receipt.status) || receipt.requestFingerprint!==record.id || receipt.sourceDigest!==record.frozen.sourceDigest || receipt.commit!==record.frozen.commit || receipt.policyRevision!==record.frozen.policyRevision || !hex64.test(receipt.checkerPolicyDigest||'') || receipt.checkerPolicyDigest!==expectedPolicyDigest || receipt.checkerPolicy!=='zero-libraries-v1' || !preflightFailure && (!/^sha256:[a-f0-9]{64}$/.test(receipt.image?.id||'') || !/^linux-(amd64|arm64)$/.test(receipt.image?.platform||'') || JSON.stringify(receipt.platforms)!==JSON.stringify([receipt.image.platform])) || !Array.isArray(receipt.checks)) throw new Error('Managed checker receipt does not bind source/policy/image');
  const stageOrder=['bundle','fixed-build','api','behavior','first','second'];
  const observedStages=receipt.checks.map(check=>check?.id);
  if (!preflightFailure && (observedStages.length<2 || observedStages.some((stage,index)=>stage!==stageOrder[index]) || receipt.checks.some((check,index)=>typeof check.passed!=='boolean' || index<receipt.checks.length-1 && check.passed!==true))) throw new Error('Managed checker stage sequence invalid');
  const artifacts={};
  for (const kind of ARTIFACT_KINDS) if (files[kind]) {const bytes=Buffer.from(files[kind]);if (!bytes.length || bytes.length>16*1024*1024 || receipt.artifacts?.[kind]?.size!==bytes.length || receipt.artifacts[kind]?.sha256!==sha256(bytes))throw new Error('Managed checker artifact hash mismatch');artifacts[kind]=bytes;}
  if (Object.keys(receipt.artifacts||{}).sort().join(',')!==Object.keys(artifacts).sort().join(',')) throw new Error('Managed checker artifact set mismatch');
  if (receipt.status==='passed') {
    if (receipt.checks.length!==stageOrder.length || ['jar','sources','pom'].some(kind=>!artifacts[kind]) || !Array.isArray(receipt.components) || digest(receipt.components)!==receipt.componentsDigest || receipt.checks.some(check=>check.passed!==true)) throw new Error('Passing managed checker evidence is incomplete');
  } else if (Object.keys(artifacts).length || receipt.checks.every(check=>check.passed===true)) throw new Error('Failed managed checker evidence is inconsistent');
  return {receipt,artifacts,components:receipt.components};
}

export function verifyOfficialLibraryRun({record,official,runId,attempt,reviewedWorkflow,expectedConclusion}) {
  if (record?.frozen?.kind!=='library' || !hex64.test(record.id) || !positive(runId) || !positive(attempt) || !['success','failure','cancelled','timed_out'].includes(expectedConclusion)) throw new Error('Invalid managed workflow verification request');
  const {run,jobs,workflow}=official||{};
  if (run?.id!==runId || run.run_attempt!==attempt || run.repository?.full_name!==LIBRARY_REPOSITORY || !positive(run.repository.id) || run.head_repository?.full_name!==LIBRARY_REPOSITORY || run.head_repository.id!==run.repository.id || run.head_branch!=='main' || !hex40.test(run.head_sha||'') || !['issues','schedule','workflow_dispatch'].includes(run.event) || ![LIBRARY_WORKFLOW,`${LIBRARY_WORKFLOW}@main`,`${LIBRARY_WORKFLOW}@refs/heads/main`].includes(run.path)) throw new Error('Official workflow run provenance mismatch');
  if (!Array.isArray(jobs) || jobs.length>=100 || jobs.filter(job=>job.name==='check').length!==1 || jobs.find(job=>job.name==='check')?.status!=='completed' || jobs.find(job=>job.name==='check')?.conclusion!==expectedConclusion || jobs.find(job=>job.name==='check')?.run_id!==runId || jobs.find(job=>job.name==='check')?.head_sha!==run.head_sha) throw new Error('Managed check job conclusion mismatch');
  if (workflow?.encoding!=='base64' || typeof workflow.content!=='string' || sha256(Buffer.from(workflow.content.replace(/\s/g,''),'base64'))!==sha256(reviewedWorkflow) || workflow.sha===undefined) throw new Error('Workflow definition differs from reviewed policy');
  return true;
}

export async function reviewedWorkflowBytes() {return readFile(new URL('../.github/workflows/sharing-libraries.yml',import.meta.url));}
