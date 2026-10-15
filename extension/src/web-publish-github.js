'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const core = require('./core');
const {prepareUpload} = require('./github');
const {pagesFiles, pagesWorkflow} = require('./web-publishing');

const workflowPath = '.github/workflows/zero-web.yml';
const shaPattern = /^[a-f0-9]{40}$/;
// GitHub's dispatch API returns a specific run ID with API version 2026-03-10.
// https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
const workflow = pagesWorkflow
  .replace('name: Publish Zero game', 'name: Publish Zero game\nrun-name: Zero web ${{ inputs.source_sha }}')
  .replace('  workflow_dispatch:', '  workflow_dispatch:\n    inputs:\n      source_sha:\n        description: Reviewed source commit\n        required: true\n        type: string')
  .replace('          persist-credentials: false', '          persist-credentials: false\n          ref: ${{ inputs.source_sha }}')
  .replace("    if: github.ref == 'refs/heads/main'", "    if: github.ref == 'refs/heads/main' && inputs.source_sha == github.sha");
// Readiness uses this static file, tied to the exact source SHA by the build.
const compiledWorkflow = workflow.replace('      - uses: actions/upload-pages-artifact', '      - name: Record public version\n        env:\n          SITE: ${{ steps.export.outputs.site }}\n          SOURCE_SHA: ${{ inputs.source_sha }}\n        run: printf \'%s\\n%s\\n\' "$SOURCE_SHA" "$GITHUB_RUN_ID" > "$SITE/zero-source-sha.txt"\n      - uses: actions/upload-pages-artifact');
function action(message, url) { return {status:'action-required',action:{message,url}}; }
function safeUrl(value,cname) {
  try {const url = new URL(value);const host=url.hostname.toLowerCase();return url.protocol === 'https:' && (/^[a-z0-9-]+\.github\.io$/i.test(host) || (cname && host===cname.toLowerCase() && !net.isIP(host) && host.includes('.'))) && !url.port && !url.username && !url.password && !url.search && !url.hash ? url.href : null;} catch {return null;}
}
function publicAddress(address) {
  if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return !([0,10,127].includes(a) || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19)));}
  // Public IPv6 global unicast only. IPv4-mapped, loopback, link-local and ULA
  // addresses cannot satisfy this prefix.
  return net.isIP(address)===6 && /^[23][a-f0-9]{3}:/i.test(address) && !/^2001:(?:0{1,4}|db8):/i.test(address) && !/^2002:/i.test(address);
}
function publicReadiness(url,{signal,get=https.get}={}) {
  return new Promise((resolve,reject)=>{
    const req=get(url,{signal,headers:{'Cache-Control':'no-cache'},lookup(host,options,callback){
      dns.lookup(host,{all:true},(error,addresses)=>{
        if(error)return callback(error);
        if(!addresses.length || addresses.some(item=>!publicAddress(item.address)))return callback(new Error('The Pages domain does not resolve to a public address.'));
        // The connection uses the checked DNS result; it cannot re-resolve to a
        // private address between validation and the actual HTTP request.
        const first=addresses[0];callback(null,options.all?[first]:first.address,...(options.all?[]:[first.family]));
      });
    }},response=>{
      let size=0;const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>100){response.destroy();reject(new Error('Unexpected public version response.'));}else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{
        try {
          if(response.statusCode!==200)throw new Error('The public version file is not available yet.');
          resolve(new Response(Buffer.concat(chunks),{status:200,headers:response.headers}));
        } catch(error) {reject(error);}
      });
    });
    req.on('error',reject);
  });
}
async function boundedText(response) {
  if(!response.body)return '';
  const reader=response.body.getReader();let text='',size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100)return '';text+=new TextDecoder().decode(value);}return text.trim();} finally {await reader.cancel();}
}
async function publishingFiles(engineRoot) {
  const files = await pagesFiles(engineRoot);
  files.delete('.zero-web/publish.yml');
  files.set(workflowPath, Buffer.from(compiledWorkflow));
  // The ownership marker binds all bundled tooling, including the workflow.
  const digest = crypto.createHash('sha256');
  for (const [name,data] of [...files].sort(([a],[b])=>a.localeCompare(b))) digest.update(name).update('\0').update(data);
  files.set('.zero-web/owner.json',Buffer.from(JSON.stringify({format:1,toolHash:digest.digest('hex')})+'\n'));
  return files;
}
async function inspectFiles(root, files) {
  const missing=[];
  for(const [name,data] of files) {
    let current=root;
    for(const part of name.split('/')) {
      current=path.join(current,part);
      const stat=await fs.lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(stat?.isSymbolicLink())throw new Error('A web publishing path is a symbolic link. Move it and review again.');
    }
    const existing=await fs.readFile(path.join(root,name)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(existing && !existing.equals(data))throw new Error(`Publishing file ${name} has different content. Preserve it and resolve the conflict before publishing; Zero will not replace it.`);
    if(!existing)missing.push(name);
  }
  return missing;
}
function createGitHubPagesPublisher({authentication,fetch:request=globalThis.fetch,git=core.git,isSimulation=()=>true,engineRoot=path.join(__dirname,'web-export'),files:providedFiles,timeoutMs=15000}={}) {
  const reviews=new WeakMap(), resumptions=new WeakMap();
  function simulation() {return {status:'simulated',message:'Simulation only — no publishing files, sign-in, upload or public website changed.'};}
  async function guard(review,signal) {
    if(signal?.aborted)throw new Error('Web publishing cancelled. An already dispatched GitHub run may continue.');
    if(isSimulation())throw new Error('Live publishing is disabled. Review again after choosing live uploads.');
    await authentication.assertCurrent(review.ticket);
    const now=await prepareUpload(review.root,git);
    if(['root','remote','branch','head','fingerprint','status'].some(key=>now[key]!==review.plan[key]))throw new Error('The project, repository, branch or files changed. Review web publishing again.');
    return now;
  }
  async function api(review,method,suffix,body,{allow404=false,signal}={}) {
    // Only these repository-scoped official REST endpoints can receive a token.
    if(!/^(?:|\/pages|\/git\/ref\/heads\/main|\/actions\/workflows\/zero-web\.yml\/dispatches|\/actions\/runs\/\d+)$/.test(suffix))throw new Error('Unsupported web publishing API request.');
    await guard(review,signal);
    // Mode can change while authentication and Git validation are awaited.
    if(isSimulation())throw new Error('Live publishing is disabled. Review again after choosing live uploads.');
    const token=authentication.assertCurrentNow(review.ticket).accessToken;
    let response;
    try {response=await request('https://api.github.com/repos/'+review.slug+suffix,{method,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
    catch {throw new Error('GitHub could not be reached. Check your connection and recheck publishing.');}
    await authentication.assertCurrent(review.ticket);
    if(allow404 && response.status===404)return null;
    if(!response.ok) {const error=new Error(response.status===401?'GitHub sign-in expired. Sign in and review publishing again.':response.status===403?'GitHub blocked publishing. Check repository Pages and Actions permissions, then recheck.':`GitHub could not complete publishing (HTTP ${response.status}). Recheck the repository before retrying.`);error.status=response.status;throw error;}
    return response.status===204 ? null : await response.json();
  }
  async function review(root,{signal}={}) {
    if(isSimulation())return simulation();
    const plan=await prepareUpload(root,git);
    if(plan.branch!=='main')throw new Error('Finish your change on main before publishing the web game.');
    if(plan.status || !shaPattern.test(plan.head||''))throw new Error('Upload your changes on main before publishing. The public game must match your saved version.');
    const ticket=await authentication.capture();
    const slug=plan.page.slice('https://github.com/'.length);
    const state={root:plan.root,plan,ticket,slug};
    const repo=await api(state,'GET','',null,{signal});
    if(repo.full_name?.toLowerCase()!==slug.toLowerCase() || repo.owner?.type!=='User' || String(repo.owner.id)!==String(ticket.session.accountId))throw new Error('Publish from your own personal GitHub repository using the same account signed in to Zero.');
    if(repo.default_branch!=='main')throw new Error('Web publishing needs main as the repository default branch. Check your GitHub repository settings.');
    if(!repo.permissions?.push)throw new Error('Your signed-in account needs permission to upload to this repository.');
    const remote=await api(state,'GET','/git/ref/heads/main',null,{signal});
    if(remote.object?.sha!==plan.head)throw new Error('Upload your main version first. GitHub currently has a different commit.');
    const files=providedFiles || await publishingFiles(engineRoot), missing=await inspectFiles(plan.root,files);
    const pages=await api(state,'GET','/pages',null,{allow404:true,signal});
    if(pages && (pages.build_type!=='workflow' || missing.length))return action('This repository already has a Pages site or a different publishing setup. Keep it and choose another repository for this game.',plan.page+'/settings/pages');
    if(pages && pages.public!==true)return action('This Pages site is not a public playable page. Review its access settings in GitHub and recheck.',plan.page+'/settings/pages');
    const result=Object.freeze({status:'review',root:plan.root,repository:plan.page,sha:plan.head,setup:missing.length>0,needsPages:!pages,publicUrl:pages?.html_url ? safeUrl(pages.html_url,pages.cname):undefined,account:ticket.session.label});
    reviews.set(result,{...state,files,missing,pages});return result;
  }
  async function setup(reviewed,{signal}={}) {
    if(isSimulation())return simulation();
    const state=reviews.get(reviewed);if(!state)throw new Error('Review web publishing before setting it up.');
    await guard(state,signal);
    if(!state.missing.length)return {status:'ready'};
    if(!(state.ticket.session.scopes||[]).includes('workflow'))return action('Authorize GitHub workflow setup through VS Code, then review publishing again.');
    await inspectFiles(state.root,state.files);
    for(const name of state.missing) {
      if(isSimulation())throw new Error('Live publishing was disabled. Review publishing again.');
      await authentication.assertCurrent(state.ticket);
      await core.assertRepositoryRoot(state.root,git);
      // Recheck path components immediately before each file creation.
      await inspectFiles(state.root,new Map([[name,state.files.get(name)]]));
      if(isSimulation())throw new Error('Live publishing was disabled. Review publishing again.');
      await fs.mkdir(path.dirname(path.join(state.root,name)),{recursive:true});
      if(isSimulation())throw new Error('Live publishing was disabled. Review publishing again.');
      await fs.writeFile(path.join(state.root,name),state.files.get(name),{flag:'wx'});
    }
    return {status:'upload-required',message:'Publishing setup is ready. Upload these source files on main, then publish the game.'};
  }
  async function publish(reviewed,{signal,onProgress=()=>{}}={}) {
    if(isSimulation())return simulation();
    const state=reviews.get(reviewed);if(!state)throw new Error('Review the public destination before publishing.');
    if(state.missing.length)return action('Set up web publishing and upload the added source files on main, then publish.');
    await guard(state,signal);
    const remote=await api(state,'GET','/git/ref/heads/main',null,{signal});
    if(remote.object?.sha!==state.plan.head)throw new Error('GitHub main changed after review. Upload or sync your project and review publishing again.');
    const pages=await api(state,'GET','/pages',null,{allow404:true,signal});
    if(pages && (!state.pages || pages.build_type!=='workflow' || pages.public!==true || pages.html_url!==state.pages.html_url || pages.cname!==state.pages.cname))throw new Error('Pages settings changed after review. Review publishing again.');
    if(!pages) {
      if(state.pages)throw new Error('Pages settings changed after review. Review publishing again.');
      try {await api(state,'POST','/pages',{build_type:'workflow'},{signal});}
      catch(error) {if([403,404,409,422].includes(error.status))return action('Check Pages availability for your GitHub plan and enable GitHub Actions as the source in this repository’s Pages settings, then recheck. Repository visibility stays unchanged.',state.plan.page+'/settings/pages');throw error;}
    }
    onProgress('Starting the reviewed browser game build on GitHub…');
    const result=await api(state,'POST','/actions/workflows/zero-web.yml/dispatches',{ref:'main',inputs:{source_sha:state.plan.head}},{signal});
    if(!Number.isSafeInteger(result?.workflow_run_id) || result.workflow_run_id<1)throw new Error('GitHub did not identify the publishing run. Check Actions before starting another publish.');
    const resume=Object.freeze({runId:result.workflow_run_id,sha:state.plan.head,repository:state.plan.page});
    resumptions.set(resume,state);
    return {status:'pending',resume,message:'GitHub is building and deploying your game.'};
  }
  async function check(resume,{signal,onProgress=()=>{}}={}) {
    if(isSimulation())return simulation();
    const state=resumptions.get(resume);if(!state)throw new Error('This publishing run is no longer tracked. Open repository Actions to check it.');
    const run=await api(state,'GET','/actions/runs/'+resume.runId,null,{signal});
    if(run.head_sha!==resume.sha || run.path!==workflowPath || run.event!=='workflow_dispatch' || run.head_branch!=='main' || run.repository?.full_name?.toLowerCase()!==state.slug.toLowerCase())throw new Error('GitHub returned a different publishing run. Check repository Actions.');
    const pending=message=>({status:'pending',resume,message});
    if(run.status!=='completed')return pending('GitHub is building and deploying your game.');
    if(run.conclusion!=='success')return {status:'failed',resume,message:'The new game was not confirmed published. Open this GitHub run to fix its build or deployment error. Your previous game may still be live.',action:{url:state.plan.page+'/actions/runs/'+resume.runId,message:'Open publishing run'}};
    const pages=await api(state,'GET','/pages',null,{signal});
    const url=safeUrl(pages.html_url,pages.cname);
    if(!url || pages.build_type!=='workflow' || pages.public!==true)throw new Error('GitHub has not confirmed the expected public game URL. Check Pages settings and recheck.');
    onProgress('Checking that the public page serves your reviewed version…');
    let response;
    try {response=await (request===globalThis.fetch?publicReadiness:request)(new URL('zero-source-sha.txt',url.endsWith('/')?url:url+'/').href,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])])});}
    catch {return pending('Deployment succeeded; waiting for the public game to become reachable.');}
    await guard(state,signal);
    if(!response.ok || Number(response.headers?.get('content-length')||0)>100 || (await boundedText(response))!==resume.sha+'\n'+resume.runId)return pending('Deployment succeeded; waiting for the public page to serve this version.');
    return {status:'live',url,sha:resume.sha,resume,message:'Your playable game is live.'};
  }
  async function restore(root,saved,{signal}={}) {
    if(isSimulation())return simulation();
    if(!Number.isSafeInteger(saved?.runId) || saved.runId<1 || !shaPattern.test(saved.sha||''))throw new Error('The saved publishing run is invalid. Check repository Actions.');
    // Following an already authorized run is read-only. Students may keep
    // editing locally while GitHub deploys the earlier reviewed source.
    return verifyLink(root,{sha:saved.sha,resume:saved},{signal});
  }
  async function verifyLink(root,saved,{signal}={}) {
    if(isSimulation())return simulation();
    if(!saved?.resume || !shaPattern.test(saved.sha||'') || (!Number.isSafeInteger(saved.resume.runId) || saved.resume.runId<1) || saved.resume.sha!==saved.sha)throw new Error('Publish this game before copying its playable link.');
    const plan=await prepareUpload(root,git);
    if(plan.page!==saved.resume.repository) {
      const error=new Error('The connected repository changed. Publish this project before copying its playable link.');
      error.code='WEB_PUBLISH_REPOSITORY_CHANGED';throw error;
    }
    const ticket=await authentication.capture();
    const state={root:plan.root,plan,ticket,slug:plan.page.slice('https://github.com/'.length)};
    const repo=await api(state,'GET','',null,{signal});
    if(String(repo.owner?.id)!==String(ticket.session.accountId) || repo.owner?.type!=='User')throw new Error('Sign in to the GitHub account that owns this game.');
    const resume=Object.freeze({...saved.resume});resumptions.set(resume,state);
    return check(resume,{signal});
  }
  return {review,setup,publish,check,restore,verifyLink};
}
module.exports={createGitHubPagesPublisher,publishingFiles,workflowPath,pagesPublishWorkflow:compiledWorkflow,publicAddress,_test:{publicReadiness,boundedText}};
