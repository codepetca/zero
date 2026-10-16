'use strict';
// Runs only this reviewed deployment program, never bundled student code.
const fs=require('node:fs/promises');
const path=require('node:path');
const {extract,hash,MAX_BYTES}=require('./web-publish-bundle.js');
async function main(env=process.env,request=fetch) {
  const {GITHUB_REPOSITORY:repo,ZERO_RELEASE_ID:release,ZERO_ASSET_ID:asset,ZERO_STAGE_TAG:stageTag,GITHUB_ACTOR_ID:actor,ZERO_PROFILE_SHA256:profileHash,ZERO_BUNDLE_SHA256:digest,ZERO_SOURCE_SHA:source,GITHUB_SHA:head,GITHUB_TOKEN:token}=env;
  if(!/^[a-f0-9]{64}$/.test(profileHash||'')||!/^zero-web-stage-[a-f0-9]{32}$/.test(stageTag||'')||!/^\d+$/.test(actor||'')||!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!/^\d+$/.test(release||'')||!/^\d+$/.test(asset||'')||!/^[a-f0-9]{64}$/.test(digest||'')||!/^[a-f0-9]{40}$/.test(source||'')||source!==head||env.GITHUB_REF!=='refs/heads/main')throw Error('Invalid exact-source deployment inputs.');
  const root='https://api.github.com/repos/'+repo;
  async function api(suffix,method='GET',accept='application/vnd.github+json') {
    const response=await request(root+suffix,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Accept:accept,Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10'}});
    if(method==='DELETE'&&response.status===404)return response;
    if(!response.ok&&response.status!==302)throw Error('Staged deployment request failed (HTTP '+response.status+').');return response;
  }
  // Delete only a private draft with this exact unique staging name, never tags.
  async function staging() {
    const info=await (await api('/releases/'+release)).json();
    if(info.id!==Number(release)||info.draft!==true||info.tag_name!==stageTag||String(info.author?.id)!==actor||info.target_commitish!==source)throw Error('The release is not this app’s temporary staging release.');
    return info;
  }
  if(env.ZERO_CLEANUP==='true'){try{await staging();await api('/releases/'+release,'DELETE');}catch(error){if(!/HTTP 404/.test(error.message))throw error;}return;}
  const info=await staging();
  const listed=info.assets?.find(item=>item.id===Number(asset));
  const metadata=await(await api('/releases/assets/'+asset)).json();
  if(!listed||metadata.id!==Number(asset)||metadata.name!=='zero-web-bundle.json.gz'||metadata.state!=='uploaded'||metadata.digest!=='sha256:'+digest||!Number.isSafeInteger(metadata.size)||metadata.size>MAX_BYTES)throw Error('The staged asset does not match this deployment.');
  let response=await api('/releases/assets/'+asset,'GET','application/octet-stream');
  if(response.status===302){const url=new URL(response.headers.get('location'));if(url.protocol!=='https:'||!['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname)||url.username||url.password)throw Error('Unsupported asset download redirect.');response=await request(url.href,{redirect:'error',signal:AbortSignal.timeout(30000)});}
  if(!response.ok||Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('Staged asset download failed.');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BYTES)throw Error('Staged asset exceeds transfer limit.');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(bytes.length!==metadata.size||hash(bytes)!==digest)throw Error('Staged asset download digest differs.');
  const site=path.join(env.RUNNER_TEMP,'zero-web-site');
  await extract(bytes,site,{sourceSha:source,digest,profileHash});
  await fs.writeFile(path.join(site,'zero-source-sha.txt'),source+'\n'+env.GITHUB_RUN_ID+'\n',{flag:'wx'});
  await fs.appendFile(env.GITHUB_OUTPUT,'site='+site+'\n');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
