import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir, chmod } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY, LIBRARY_POLICY, validateBundle, validateLibraryBundle, sourceDigest, expectedPom, expectedLibraryPom } from './policy.mjs';
import { policyDigest } from './image-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
function execute(args, {timeout = 30000, maxBytes = 2 * 1024 * 1024} = {}) {
  return new Promise((res, rej) => {
    const child = spawn('docker',args,{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME}});
    const out=[], err=[]; let bytes=0, limit=false, timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    for (const [stream, chunks] of [[child.stdout,out],[child.stderr,err]]) stream.on('data',b=>{bytes+=b.length;if(bytes>maxBytes){limit=true;child.kill('SIGKILL');}else chunks.push(b);});
    child.on('error',e=>{clearTimeout(timer);rej(e);});
    child.on('close',code=>{clearTimeout(timer);res({code,stdout:Buffer.concat(out),stderr:Buffer.concat(err),timedOut,limit});});
  });
}
async function container(image, input, stage, timeout) {
  const name = `zero-check-${randomUUID()}`;
  const flags=['run','--name',name,'--pull=never','--network=none','--read-only','--user=10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=512m','--memory-swap=512m','--cpus=1','--pids-limit=96','--ulimit','nofile=256:256','--ulimit','core=0','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=96m,mode=1777','--mount',`type=bind,src=${input},dst=/input,readonly`,'--env','HOME=/tmp','--env','LANG=C.UTF-8',image,'python3','/policy/work.py',stage];
  try { return await execute(flags,{timeout,maxBytes:stage==='build'?4*1024*1024:65536}); }
  finally { const removed=await execute(['rm','-f',name],{timeout:10000,maxBytes:65536}); if (removed.code!==0 && !removed.stderr.toString().includes('No such container')) throw new Error('Could not clean checker container'); }
}
export * from './policy.mjs';
export { expectedPolicyDigest } from './image-policy.mjs';
export async function checkSubmission(bundle, options = {}) {
  return checkBundle(bundle,options,false);
}
export async function checkLibrarySubmission(bundle, options = {}) {
  return checkBundle(bundle,options,true);
}
async function checkBundle(bundle,options,current) {
  if(current)validateLibraryBundle(bundle);else validateBundle(bundle);
  // Copy canonical JSON now: queued input cannot mutate while the worker awaits Docker.
  bundle=JSON.parse(JSON.stringify(bundle));
  const digest=current?null:sourceDigest(bundle);
  for(const [key,value] of Object.entries(options)) {
    if(!['image','scratchRoot','buildTimeoutMs','runTimeoutMs'].includes(key)) throw new Error('Unknown checker option');
    if(key.endsWith('TimeoutMs') && (!Number.isInteger(value) || value < 250 || value > (key==='buildTimeoutMs'?30000:15000))) throw new Error('Checker timeout outside policy bounds');
  }
  const lock=JSON.parse(await readFile(join(here,'image-lock.json'),'utf8'));
  const image=options.image || lock.imageId;
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Checker requires an immutable locally built image ID');
  if(image!==lock.imageId||lock.policy!==LIBRARY_POLICY)throw new Error('Checker image differs from exact trusted lock');
  const inspect=await execute(['image','inspect',image,'--format','{{.Id}} {{.Os}} {{.Architecture}} {{index .Config.Labels "zero.policy"}} {{index .Config.Labels "zero.policy-source"}}']);
  if(inspect.code!==0) throw new Error('Pinned checker image unavailable; run build-image.mjs');
  const parts=inspect.stdout.toString().trim().split(' ');
  const sourceLock=lock;
  if(parts[0]!==image || parts[1]!=='linux' || !['amd64','arm64'].includes(parts[2]) || sourceLock.platform!==`linux-${parts[2]}` || parts[3]!==lock.policy || parts[4]!==sourceLock.policyDigest || sourceLock.policyDigest!==await policyDigest()) throw new Error('Checker image policy/architecture mismatch');
  const scratch=resolve(options.scratchRoot || join(here,'../../.verification/hub-checker'));
  if(/[\u0000-\u001f,]/.test(scratch))throw new Error('Unsafe scratch path');
  await mkdir(scratch,{recursive:true,mode:0o700});
  const dir=await mkdtemp(join(scratch,'run-'));
  await chmod(dir,0o755);
  const checks=[{id:'bundle',passed:true,detail:'Canonical descriptor, exact source paths, MIT license, bounded decoded PNG validated.'}];
  const result={passed:false,policy:current?LIBRARY_POLICY:POLICY,policyDigest:sourceLock.policyDigest,sourceDigest:digest,checks,platforms:[`linux-${parts[2]}`],...(current?{components:[],image:{id:image,platform:`linux-${parts[2]}`}}:{})};
  try {
    for(const [path,value] of Object.entries(bundle.files)) {
      const full=join(dir,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,path==='preview.png'||path.startsWith('src/main/resources/')?Buffer.from(value,'base64'):value,{mode:0o444});
    }
    await writeFile(join(dir,'descriptor.json'),JSON.stringify(bundle.descriptor),{mode:0o444});
    const build=await container(image,dir,'build',options.buildTimeoutMs || 30000);
    if(build.code===125 || build.code===126 || build.code===127) throw new Error(`Docker checker infrastructure failed: ${build.stderr.toString().slice(0,2000)}`);
    const add=(id,run)=>{checks.push({id,passed:run.code===0&&!run.timedOut&&!run.limit,detail:run.timedOut?`Exceeded wall-clock limit: ${run.stderr.toString().slice(0,2000)}`:run.limit?`Exceeded output limit: ${run.stderr.toString().slice(0,2000)}`:run.code===0?'Trusted process completed successfully':`Process exited ${run.code}: ${run.stderr.toString().slice(0,3000)}`});};
    add('fixed-build',build);
    if(!checks.at(-1).passed)return result;
    let artifacts;
    try {const output=JSON.parse(build.stdout.toString());if(Object.keys(output).sort().join(',')!==(current?'components,jar,sources':'jar,sources'))throw Error('Unexpected output'); artifacts={jar:Buffer.from(output.jar,'base64'),sources:Buffer.from(output.sources,'base64'),pom:current?expectedLibraryPom(bundle):expectedPom(bundle)};if(!artifacts.jar.length||!artifacts.sources.length||artifacts.jar.length>1024*1024||artifacts.sources.length>1024*1024)throw Error('Artifact bound');if(current){if(!Array.isArray(output.components)||output.components.length!==bundle.descriptor.classes.length)throw Error('Invalid compiled API inventory');result.components=output.components;}}catch(e){throw new Error(`Trusted build protocol failure: ${e.message}`);}
    await writeFile(join(dir,'library.jar'),artifacts.jar,{mode:0o444});
    for(const stage of ['api','behavior','first','second']) {
      const run=await container(image,dir,stage,options.runTimeoutMs || 15000);
      if([125,126,127].includes(run.code))throw new Error(`Docker checker infrastructure failed: ${run.stderr.toString().slice(0,1000)}`);
      add(stage,run); if(!checks.at(-1).passed)return result;
    }
    result.passed=true;result.artifacts=artifacts;return result;
  } finally { await rm(dir,{recursive:true,force:true}); }
}
