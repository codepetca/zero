// Narrow maintainer bootstrap: fixed repository Starter UI, never a queue drain.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {starterUiBundle} from '../hub/fixtures/starter-ui.mjs';
import * as trusted from '../hub/checker/runner.mjs';
import * as policy from '../hub/checker/policy.mjs';
import {expectedPolicyDigest} from '../hub/checker/image-policy.mjs';
import {createHub} from '../hub/service/hub.mjs';
import {createPipeline} from '../hub/service/pipeline.mjs';
import {createPostgresStorage} from '../hub/service/postgres-storage.mjs';
import {createRuntimePool,verifyRole,configurationError} from '../hub/service/runtime.mjs';
const execute=promisify(execFile);
const VERSION='0.1.0';
const MAX_PREVIEW=256*1024;

export async function authenticatedGithubIdentity() {
  let profile;
  try {
    const {stdout}=await execute('gh',['api','--hostname','github.com','user','--jq','{id,login}'],{timeout:15000,maxBuffer:4096,encoding:'utf8'});
    profile=JSON.parse(stdout);
  } catch {throw configurationError('Authenticated GitHub identity unavailable; authenticate gh before bootstrap');}
  if(!Number.isSafeInteger(profile?.id)||profile.id<1||!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(profile?.login??''))throw configurationError('GitHub returned an invalid authenticated numeric identity');
  return {id:String(profile.id),login:profile.login};
}
export async function readBootstrapPreview(filename) {
  if(typeof filename!=='string'||!filename)throw configurationError('Provide --preview with the actual maintained Starter UI PNG');
  const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await file.stat();
    if(!stat.isFile()||stat.size<1||stat.size>MAX_PREVIEW)throw configurationError('Starter UI preview must be a plain PNG file of at most 256 KiB');
    const bytes=Buffer.alloc(MAX_PREVIEW+1);
    let length=0;
    while(length<bytes.length) {
      const {bytesRead}=await file.read(bytes,length,bytes.length-length,null);
      if(!bytesRead)break;length+=bytesRead;
    }
    if(length!==stat.size||length>MAX_PREVIEW)throw configurationError('Starter UI preview changed or exceeded its size bound');
    const value=bytes.subarray(0,length).toString('base64');
    try {policy.validatePng(value);} catch {throw configurationError('Starter UI preview does not satisfy the bounded PNG policy');}
    return value;
  } finally {await file.close();}
}
export async function maintainedStarterUi(libraryId,preview) {
  const bundle=await starterUiBundle(libraryId);
  bundle.files['preview.png']=preview;
  bundle.files['CHANGELOG.md']='# Changelog\n\n## 0.1.0\n\nFirst maintained Starter UI release. Namespace assigned by ZeroHub.\n';
  policy.validateBundle(bundle);
  return bundle;
}
function failure(job) {
  const text=value=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,512);
  const checks=Array.isArray(job.report?.checks)?job.report.checks.slice(0,8).map(check=>({id:text(check?.id).slice(0,80),passed:check?.passed===true,detail:text(check?.detail)})):[];
  return {status:job.status==='failed'?'failed':'blocked',submissionId:job.id,submissionStatus:job.status,checks,reason:text(job.error??'The exact maintained submission has not reached a passing checked result')};
}
async function verifiedExisting(job,bundle,actor,storage) {
  const release=job.release;
  if(!release||release.libraryId!==bundle.descriptor.libraryId||release.version!==VERSION||release.sourceDigest!==policy.sourceDigest(bundle)||release.contributor?.githubId!==actor.id)throw configurationError('Existing Starter UI release does not match the exact maintained source and authenticated owner');
  for(const artifact of [...Object.values(release.artifacts),release.preview])await storage.read(artifact.sha256,artifact.size);
  return release;
}

// No actor, bundle, source path, command, checker replacement or acceptance flag
// can be supplied. These are operator-owned pools, not a public HTTP endpoint.
export async function bootstrapStarterUi({apiPool,checkerPool,publisherPool,origin,previewPath}) {
  const actor=await authenticatedGithubIdentity();
  const preview=await readBootstrapPreview(previewPath);
  // Validate the fixed local inputs before any reservation or source mutation.
  await maintainedStarterUi('ui1',preview);
  await Promise.all([verifyRole(apiPool,'hub_api'),verifyRole(checkerPool,'hub_checker'),verifyRole(publisherPool,'hub_publisher')]);
  const apiStorage=createPostgresStorage(apiPool);
  const api=createHub({pool:apiPool,storage:apiStorage,checker:trusted,origin,uploadsEnabled:true});
  const lock=await apiPool.connect();
  const lockKey=createHash('sha256').update(`zero-maintained-starter-ui:${actor.id}`).digest();
  const keys=[lockKey.readInt32BE(0),lockKey.readInt32BE(4)];
  let locked=false;
  try {
    await lock.query('SELECT pg_advisory_lock($1,$2)',keys);locked=true;
    const {rows}=await apiPool.query("SELECT s.id,s.library_id,s.source_digest,s.bundle,s.status FROM hub_submissions s JOIN hub_libraries l ON l.id=s.library_id WHERE s.owner_id=$1 AND l.owner_id=$1 AND s.version=$2 AND s.bundle->'descriptor'->>'title'='Starter UI' ORDER BY s.created_at",[actor.id,VERSION]);
    if(rows.length>1)throw configurationError('Multiple Starter UI attempts already exist for this owner/version; resolve them explicitly before bootstrap');
    let bundle,job;
    if(rows.length) {
      const row=rows[0];bundle=await maintainedStarterUi(row.library_id,preview);
      const digest=policy.sourceDigest(bundle);
      if(row.source_digest!==digest||policy.sourceDigest(row.bundle)!==digest)throw configurationError('Existing Starter UI version differs from the fixed maintained source or preview; no version is overwritten');
      job=await api.getSubmission(actor,row.id);
      if(job.status==='published')return {status:'already-exists',actor,submissionId:job.id,release:await verifiedExisting(job,bundle,actor,apiStorage)};
    } else {
      const reservation=await api.reserveLibrary(actor,{className:'ScoreDisplay',title:'Starter UI'});
      bundle=await maintainedStarterUi(reservation.libraryId,preview);
      job=await api.submit(actor,bundle);
    }
    const target={submissionId:job.id,sourceDigest:policy.sourceDigest(bundle)};
    const checking=createPipeline({pool:checkerPool,storage:()=>Promise.resolve(apiStorage),checker:trusted});
    const publishing=createPipeline({pool:publisherPool,storage:()=>Promise.resolve(createPostgresStorage(publisherPool)),checker:{...policy,expectedPolicyDigest}});
    if(['queued','checking'].includes(job.status)) {
      await checking.workOnce(target);
      job=await api.getSubmission(actor,job.id);
    }
    if(job.status!=='checked')return {...failure(job),actor};
    await publishing.publishOnce(target);
    job=await api.getSubmission(actor,job.id);
    if(job.status!=='published')return {...failure(job),actor};
    return {status:'published',actor,submissionId:job.id,release:await verifiedExisting(job,bundle,actor,apiStorage)};
  } finally {
    if(locked)await lock.query('SELECT pg_advisory_unlock($1,$2)',keys).catch(()=>{});
    // Destroy this session even after a failed unlock; never return a held lock.
    lock.release(true);
    await api.stop();
  }
}
export function bootstrapArguments(args) {
  if(args.length!==2||args[0]!=='--preview'||!args[1])throw configurationError('Usage: node scripts/bootstrap-hub.mjs --preview <maintained-preview.png>');
  return {previewPath:args[1]};
}
async function main() {
  const options=bootstrapArguments(process.argv.slice(2));
  const pools=[];
  try {
    const names=['API','CHECKER','PUBLISHER'];
    for(const name of names) {
      const variable=`ZERO_HUB_${name}_DATABASE_URL`;
      if(!process.env[variable])throw configurationError(`Set ${variable} in the private bootstrap environment`);
      pools.push(createRuntimePool(process.env[variable],`hub_${name.toLowerCase()}`));
    }
    if(!process.env.ZERO_HUB_ORIGIN)throw configurationError('Set ZERO_HUB_ORIGIN to the exact public hub origin');
    const result=await bootstrapStarterUi({...options,origin:process.env.ZERO_HUB_ORIGIN,apiPool:pools[0],checkerPool:pools[1],publisherPool:pools[2]});
    console.log(JSON.stringify(result));
    if(!['published','already-exists'].includes(result.status))process.exitCode=1;
  } finally {await Promise.all(pools.map(pool=>pool.end()));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main().catch(error=>{
  console.error(error?.code==='ZERO_HUB_CONFIG'?error.message:'Starter UI bootstrap failed; database credentials and internal errors are not logged');process.exitCode=1;
});
