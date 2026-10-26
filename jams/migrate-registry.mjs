#!/usr/bin/env node
// Explicit operator tool for the invited pilot only. Uses the existing GitHub
// CLI session internally; it never reads, prints or changes account credentials.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createAtomicGitHubJamStore,JAM_REGISTRY_PROTOCOL_MARKER} from './git-store.mjs';
import {JAM_PILOT_REGISTRY_BRANCH} from './github-store.mjs';
const prefix='/repos/codepetca/zero',branch=JAM_PILOT_REGISTRY_BRANCH;
export async function githubCliFetch(input,options={}) {
  const url=new URL(input);
  if(url.origin!=='https://api.github.com'||!url.pathname.startsWith(prefix+'/'))throw Error('Invalid operator target.');
  const args=['api',url.pathname.slice(1)+url.search,'--include','--method',options.method||'GET','--header','Accept: application/vnd.github+json','--header','X-GitHub-Api-Version: 2026-03-10'];
  if(options.body!==undefined)args.push('--input','-');
  const output=await new Promise((resolve,reject)=>{
    const child=spawn('gh',args,{stdio:['pipe','pipe','pipe'],signal:options.signal});let bytes=0;const chunks=[];
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>4_000_000){child.kill();reject(Error('Operator response too large.'));}else chunks.push(chunk);});
    child.stderr.resume();child.on('error',()=>reject(Error('GitHub CLI request could not be confirmed.')));child.on('close',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    child.stdin.on('error',()=>{});child.stdin.end(options.body);
  });
  const match=/^HTTP\/[0-9.]+ ([0-9]{3})[^\n]*\r?\n/.exec(output),end=output.search(/\r?\n\r?\n/);
  if(!match||end<0)throw Error('GitHub CLI request could not be confirmed.');
  const body=output.slice(end+(output[end]==='\r'?4:2));
  const response=new Response(body,{status:Number(match[1]),headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:url.href});return response;
}
async function api(path){const response=await githubCliFetch('https://api.github.com'+prefix+path);if(!response.ok)throw Error('The pilot registry could not be inspected.');return response.json();}
async function files(path,head){const entries=await api(`/contents/${path}?ref=${head}`);if(!Array.isArray(entries)||entries.length>2||entries.some(item=>!/^jam-[1-9][0-9]{0,19}\.json$/.test(item.name)||item.type!=='file'||!/^[a-f0-9]{40}$/.test(item.sha)))throw Error('Unexpected pilot registry layout.');return Object.fromEntries(entries.map(item=>[item.name,item.sha]));}
export async function migratePilot(args) {
  if(args.some(arg=>!['--plan','--apply'].includes(arg)&&!/^--expected-head=[a-f0-9]{40}$/.test(arg))||args.includes('--plan')&&args.includes('--apply'))throw Error('Use --plan or --apply --expected-head=<exact SHA>. Only the pilot branch is supported.');
  const apply=args.includes('--apply'),expected=args.find(arg=>arg.startsWith('--expected-head='))?.split('=')[1];
  if(apply&&!expected)throw Error('Inspect --plan and provide its exact --expected-head before applying.');
  const ref=await api(`/git/ref/heads/${branch}`),head=ref.object?.sha;if(!/^[a-f0-9]{40}$/.test(head||'')||ref.ref!==`refs/heads/${branch}`)throw Error('Invalid pilot branch.');
  if(apply&&head!==expected)throw Error('The pilot changed. Inspect a fresh plan before applying.');
  const marker=await api(`/contents/jams?ref=${head}`),migrated=!Array.isArray(marker);
  if(migrated&&Buffer.from(marker.content||'','base64').toString('utf8')!==JAM_REGISTRY_PROTOCOL_MARKER)throw Error('Unexpected pilot protocol marker.');
  const before=await files(migrated?'zero-jams-v2/events':'jams',head),guard=await api(`/contents/website/vercel.json?ref=${head}`);
  if(JSON.parse(Buffer.from(guard.content||'','base64').toString('utf8')).git?.deploymentEnabled?.[branch]!==false)throw Error('Registry deployment exclusion must be retained.');
  if(!apply)return {mode:'plan',branch,head,migrated,files:before,guardSha:guard.sha};
  const store=createAtomicGitHubJamStore({token:'operator-github-cli-transport-only',fetchImpl:githubCliFetch,registryBranch:branch,maxEvents:2});
  const after=await store.migrate(),copied=await files('zero-jams-v2/events',after.revision),afterGuard=await api(`/contents/website/vercel.json?ref=${after.revision}`);
  if(Object.keys(before).length!==Object.keys(copied).length||Object.entries(before).some(([id,sha])=>copied[id]!==sha)||afterGuard.sha!==guard.sha)throw Error('Migration committed but source bytes changed during the operation. Inspect the branch; do not reset it.');
  return {mode:'applied',branch,before:head,head:after.revision,files:copied,guardSha:afterGuard.sha};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)migratePilot(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
