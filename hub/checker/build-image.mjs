import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { policyDigest as currentPolicyDigest, imageFiles } from './image-policy.mjs';
import { spawnSync } from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));
const arch=process.argv[2] || (process.arch==='arm64'?'arm64':'amd64');
if(!['arm64','amd64'].includes(arch))throw Error('Expected arm64 or amd64');
const scratch=resolve(root,'../../.verification/hub-checker');await mkdir(scratch,{recursive:true});
const dir=await mkdtemp(join(scratch,'image-'));await mkdir(join(dir,'javafx'));
const lock=JSON.parse(await readFile(join(root,'dependencies.json'),'utf8'));
try {
 for(const name of imageFiles) {const bytes=await readFile(join(root,'image',name));await writeFile(join(dir,name),bytes);}
 const policyDigest=await currentPolicyDigest();
 for(const [name,entry] of Object.entries(lock)) {
  if(!name.endsWith((arch==='arm64'?'linux-aarch64':'linux')+'.jar'))continue;
  const response=await fetch(entry.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Dependency download failed');
  const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Dependency hash mismatch');
  await writeFile(join(dir,'javafx',name),bytes);
 }
 const build=spawnSync('docker',['build','--platform','linux/'+arch,'--build-arg','POLICY_DIGEST='+policyDigest,'--iidfile',join(dir,'image.id'),dir],{stdio:'inherit'});if(build.status!==0)throw Error('Image build failed');
 const imageId=(await readFile(join(dir,'image.id'),'utf8')).trim();
 await writeFile(join(root,'image-lock.json'),JSON.stringify({policy:'zero-libraries-v1',policyDigest,imageId,platform:'linux-'+arch,base:'eclipse-temurin:17.0.16_8-jdk-noble@sha256:bbc959486c469c589091571ba524e6a98f27e19bd99489c683d9b465e4f8db8d'},null,2)+'\n');
 console.log('Checker image pinned:',imageId);
} finally {await rm(dir,{recursive:true,force:true});}
