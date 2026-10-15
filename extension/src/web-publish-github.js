'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {safePagesUrl:safeUrl,publicAddress,publicReadiness,boundedText}=require('./web-pages-verification');
const core = require('./core');
const {prepareUpload} = require('./github');
const {pagesFiles, pagesWorkflow} = require('./web-publishing');

const workflowPath = '.github/workflows/zero-web.yml';
const shaPattern = /^[a-f0-9]{40}$/;
// Official upload/retrieval uses release assets, not an undocumented artifact upload API.
// https://docs.github.com/en/rest/releases/assets?apiVersion=2026-03-10
// Dispatch 2026-03-10 returns the exact workflow_run_id.
// https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10
const compiledWorkflow=pagesWorkflow;
const {pack}=require('./web-publish-bundle');
function action(message, url) { return {status:'action-required',action:{message,url}}; }
function pagesDestination(pages) {
  const url=pages && safeUrl(pages.html_url,pages.cname);
  if(!url||pages.build_type!=='workflow'||pages.public!==true)return null;
  return {url,cname:pages.cname||null,buildType:'workflow',public:true};
}
function defaultDestination(slug) {
  const [owner,name]=slug.split('/');
  const suffix=name.toLowerCase()===owner.toLowerCase()+'.github.io'?'':name+'/';
  return {url:new URL('https://'+owner+'.github.io/'+suffix).href,cname:null,buildType:'workflow',public:true};
}
function assertDestination(pages,approved) {
  const actual=pagesDestination(pages);
  if(!approved||!actual||['url','cname','buildType','public'].some(key=>actual[key]!==approved[key]))throw Error('Pages settings changed after review. Review the public destination before publishing or opening this app.');
  return actual;
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
function createGitHubPagesPublisher({authentication,fetch:request=globalThis.fetch,git=core.git,isSimulation=()=>true,engineRoot=path.join(__dirname,'web-export'),files:providedFiles,timeoutMs=15000,uploadTimeoutMs=180000,cacheRoot,localBuild=options=>require('./web-export/snapshot').ensureValidatedExport(options),validateExport=options=>require('./web-export/snapshot').validateExport(options),assertBuildInputsAtCommit=options=>require('./web-export/snapshot').assertBuildInputsAtCommit(options)}={}) {
  const reviews=new WeakMap(), resumptions=new WeakMap(), unresolvedStages=new Map();
  function simulation() {return {status:'simulated',message:'Simulation only — no publishing files, sign-in, upload or public website changed.'};}
  async function guard(review,signal) {
    if(signal?.aborted)throw new Error('Web publishing cancelled. An already dispatched GitHub run may continue.');
    if(isSimulation())throw new Error('Live publishing is disabled. Review again after choosing live uploads.');
    await authentication.assertCurrent(review.ticket);
    const now=await prepareUpload(review.root,git);
    if(['root','remote','branch','head','fingerprint','status'].some(key=>now[key]!==review.plan[key]))throw new Error('The project, repository, branch or files changed. Review web publishing again.');
    return now;
  }
  async function api(review,method,suffix,body,{allow404=false,signal,uploadUrl,cleanup=false,onRequest}={}) {
    // Only these repository-scoped official REST endpoints can receive a token.
    if(!/^(?:|\/pages|\/git\/ref\/heads\/main|\/actions\/workflows\/zero-web\.yml\/dispatches|\/actions\/runs\/\d+|\/releases(?:\?per_page=100)?|\/releases\/\d+|\/releases\/assets\/\d+)$/.test(suffix))throw new Error('Unsupported web publishing API request.');
    if(cleanup){await authentication.assertCurrent(review.ticket);const now=await prepareUpload(review.root,git);if(now.root!==review.plan.root||now.remote!==review.plan.remote)throw Error('The repository changed; temporary app cleanup needs its original repository.');}
    else await guard(review,signal);
    // Mode can change while authentication and Git validation are awaited.
    if(isSimulation())throw new Error('Live publishing is disabled. Review again after choosing live uploads.');
    const token=authentication.assertCurrentNow(review.ticket).accessToken;
    let response;
    // Cancellation can arrive while authentication and repository guards await.
    if(signal?.aborted)throw Error('Web publishing cancelled. An already dispatched GitHub run may continue.');
    try {onRequest?.();response=await request(uploadUrl || 'https://api.github.com/repos/'+review.slug+suffix,{method,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(uploadUrl?uploadTimeoutMs:timeoutMs),...(signal?[signal]:[])]),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':uploadUrl?'application/octet-stream':'application/json'}:{})},...(body?{body:uploadUrl?body:JSON.stringify(body)}:{})});}
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
    if(!Number.isSafeInteger(repo.id)||repo.id<1)throw Error('GitHub did not identify the publishing repository.');
    state.repositoryId=repo.id;
    if(repo.default_branch!=='main')throw new Error('Web publishing needs main as the repository default branch. Check your GitHub repository settings.');
    if(!repo.permissions?.push)throw new Error('Your signed-in account needs permission to upload to this repository.');
    const remote=await api(state,'GET','/git/ref/heads/main',null,{signal});
    if(remote.object?.sha!==plan.head)throw new Error('Upload your main version first. GitHub currently has a different commit.');
    const files=providedFiles || await publishingFiles(engineRoot), missing=await inspectFiles(plan.root,files);
    const pages=await api(state,'GET','/pages',null,{allow404:true,signal});
    if(pages && (pages.build_type!=='workflow' || missing.length))return action('This repository already has a Pages site or a different publishing setup. Keep it and choose another repository for this game.',plan.page+'/settings/pages');
    if(pages && pages.public!==true)return action('This Pages site is not a public playable page. Review its access settings in GitHub and recheck.',plan.page+'/settings/pages');
    const result=Object.freeze({status:'review',root:plan.root,repository:plan.page,sha:plan.head,setup:missing.length>0,needsPages:!pages,publicUrl:pages?.html_url ? safeUrl(pages.html_url,pages.cname):undefined,account:ticket.session.label});
    reviews.set(result,{...state,files,missing,pages,approvedDestination:pages?pagesDestination(pages):defaultDestination(repo.full_name)});return result;
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
  async function publish(reviewed,{signal,onProgress=()=>{},onStaging=async()=>{},onPending=async()=>{}}={}) {
    if(isSimulation())return simulation();
    const state=reviews.get(reviewed);if(!state)throw new Error('Review the public destination before publishing.');
    if(state.missing.length)return action('Set up web publishing and upload the added source files on main, then publish.');
    await guard(state,signal);
    if(unresolvedStages.has(state.root)) {await cleanupStaging(state,unresolvedStages.get(state.root));unresolvedStages.delete(state.root);await onStaging(undefined);}
    const remote=await api(state,'GET','/git/ref/heads/main',null,{signal});
    if(remote.object?.sha!==state.plan.head)throw new Error('GitHub main changed after review. Upload or sync your project and review publishing again.');
    const pages=await api(state,'GET','/pages',null,{allow404:true,signal});
    if(pages && (!state.pages || pages.build_type!=='workflow' || pages.public!==true || pages.html_url!==state.pages.html_url || pages.cname!==state.pages.cname))throw new Error('Pages settings changed after review. Review publishing again.');
    onProgress('Validating the browser app locally…');
    const resultBuild=await localBuild({projectRoot:state.root,cacheRoot,signal,onProgress});
    await guard(state,signal);
    await assertBuildInputsAtCommit({projectRoot:state.root,result:resultBuild,sourceSha:state.plan.head,git});
    const bundle=await pack({projectRoot:state.root,result:resultBuild,sourceSha:state.plan.head,validateExport,signal});
    await guard(state,signal);
    if(!pages) {
      if(state.pages)throw new Error('Pages settings changed after review. Review publishing again.');
      try {await api(state,'POST','/pages',{build_type:'workflow'},{signal});}
      catch(error) {if([403,404,409,422].includes(error.status))return action('Check Pages availability for your GitHub plan and enable GitHub Actions as the source in this repository’s Pages settings, then recheck. Repository visibility stays unchanged.',state.plan.page+'/settings/pages');throw error;}
    }
    const destination=await api(state,'GET','',null,{signal});
    if(destination.id!==state.repositoryId||String(destination.owner?.id)!==String(state.ticket.session.accountId)||destination.owner?.type!=='User'||destination.default_branch!=='main'||!destination.permissions?.push)throw Error('The repository or account permissions changed. Review publishing again.');
    const staging={tag:'zero-web-stage-'+crypto.randomBytes(16).toString('hex'),sourceSha:state.plan.head};
    let creationSent=false;
    try {
      unresolvedStages.set(state.root,staging);
      // Persist the unique destination before the POST: its response can be lost.
      await onStaging({sha:state.plan.head,repository:state.plan.page,staging});
      const release=await api(state,'POST','/releases',{tag_name:staging.tag,target_commitish:state.plan.head,name:'Temporary Zero web deployment',draft:true,prerelease:true},{signal,onRequest:()=>{creationSent=true;}});
      if(Number.isSafeInteger(release?.id)&&release.id>0)staging.releaseId=release.id;
      if(!staging.releaseId||release.draft!==true||release.tag_name!==staging.tag)throw Error('GitHub did not identify the temporary app staging release. Check repository Releases before retrying.');
      await onStaging({sha:state.plan.head,repository:state.plan.page,staging});
      const expected='https://uploads.github.com/repos/'+state.slug+'/releases/'+release.id+'/assets';
      if(release.upload_url!==expected+'{?name,label}')throw Error('GitHub returned an unexpected app upload destination.');
      await validateExport({projectRoot:state.root,result:resultBuild,signal});
      onProgress('Uploading the validated local app bundle to GitHub…');
      const asset=await api(state,'POST','/releases/'+release.id,bundle.bytes,{signal,uploadUrl:expected+'?name=zero-web-bundle.json.gz'});
      if(!Number.isSafeInteger(asset?.id)||asset.id<1||asset.digest!=='sha256:'+bundle.digest||asset.size!==bundle.bytes.length||asset.state!=='uploaded'||asset.name!=='zero-web-bundle.json.gz')throw Error('GitHub did not confirm the exact app bundle.');
      staging.assetId=asset.id;staging.digest=bundle.digest;
      await validateExport({projectRoot:state.root,result:resultBuild,signal});
      await assertBuildInputsAtCommit({projectRoot:state.root,result:resultBuild,sourceSha:state.plan.head,git});
      const current=await api(state,'GET','/git/ref/heads/main',null,{signal});
      if(current.object?.sha!==state.plan.head)throw Error('GitHub main changed during app staging. Review publishing again.');
      onProgress('Deploying the validated local browser app on GitHub…');
      const finalPages=await api(state,'GET','/pages',null,{signal});
      const approvedDestination=assertDestination(finalPages,state.approvedDestination);
      const result=await api(state,'POST','/actions/workflows/zero-web.yml/dispatches',{ref:'main',inputs:{source_sha:state.plan.head,release_id:String(staging.releaseId),stage_tag:staging.tag,asset_id:String(staging.assetId),bundle_sha256:staging.digest,profile_sha256:bundle.profileHash}},{signal});
      if(!Number.isSafeInteger(result?.workflow_run_id) || result.workflow_run_id<1)throw new Error('GitHub did not identify the publishing run. Check Actions before starting another publish.');
      const resume=Object.freeze({runId:result.workflow_run_id,sha:state.plan.head,repository:state.plan.page,repositoryId:state.repositoryId,destination:Object.freeze({...approvedDestination}),staging});
      resumptions.set(resume,state);
      await onPending(resume);
      unresolvedStages.delete(state.root);
      return {status:'pending',resume,message:'GitHub is deploying your locally built app.'};
    } catch(error) {try {
      if(creationSent && (staging.releaseId || ![401,403,404,409,422].includes(error.status)))await cleanupStaging(state,staging);
      unresolvedStages.delete(state.root);await onStaging(undefined);} catch(cleanupError) {error.message+=' Temporary app cleanup is incomplete; check repository draft Releases. '+cleanupError.message;}throw error;}
  }
  async function cleanupStaging(state,staging) {
    if(!staging)return;
    if(!/^zero-web-stage-[a-f0-9]{32}$/.test(staging.tag||''))throw Error('Invalid temporary staging receipt.');
    if(staging.releaseId===undefined) {
      // GitHub's by-tag endpoint documents published releases only. List drafts
      // with this repository owner's push-capable token, never guess an ID.
      const list=await api(state,'GET','/releases?per_page=100',null,{cleanup:true});
      if(!Array.isArray(list)||list.length>100)throw Error('GitHub returned an invalid draft release listing.');
      const matches=list.filter(release=>release.tag_name===staging.tag);
      if(matches.length!==1)throw Error('The temporary release creation result is still uncertain. Check repository draft Releases and recheck before starting another publish.');
      staging.releaseId=matches[0].id;
    }
    if(!Number.isSafeInteger(staging.releaseId)||staging.releaseId<1)throw Error('Invalid temporary staging release ID.');
    async function cleanupRequest(method) {
      for(let attempt=0;attempt<2;attempt++) {
        try{return await api(state,method,'/releases/'+staging.releaseId,null,{allow404:true,cleanup:true});}
        catch(error){if(attempt || !([502,503,504].includes(error.status)||error.message.startsWith('GitHub could not be reached')))throw error;}
      }
    }
    const release=await cleanupRequest('GET');
    if(!release)return;
    if(release.id!==staging.releaseId||release.draft!==true||release.tag_name!==staging.tag||String(release.author?.id)!==String(state.ticket.session.accountId)||release.target_commitish!==(state.cleanupSha || staging.sourceSha || state.plan.head))throw Error('The temporary staging release changed; preserve it for review.');
    await cleanupRequest('DELETE');
  }
  async function check(resume,{signal,onProgress=()=>{}}={}) {
    if(isSimulation())return simulation();
    const state=resumptions.get(resume);if(!state)throw new Error('This publishing run is no longer tracked. Open repository Actions to check it.');
    const run=await api(state,'GET','/actions/runs/'+resume.runId,null,{signal});
    if(run.id!==resume.runId || (resume.repositoryId && run.repository?.id!==resume.repositoryId) || run.head_sha!==resume.sha || run.path!==workflowPath || run.event!=='workflow_dispatch' || run.head_branch!=='main' || run.repository?.full_name?.toLowerCase()!==state.slug.toLowerCase())throw new Error('GitHub returned a different publishing run. Check repository Actions.');
    const pending=message=>({status:'pending',resume,message});
    if(run.status!=='completed')return pending('GitHub is deploying your locally built app.');
    await cleanupStaging({...state,cleanupSha:resume.sha},resume.staging);
    if(run.conclusion!=='success')return {status:'failed',resume,message:'The new game was not confirmed published. Open this GitHub run to fix its build or deployment error. Your previous game may still be live.',action:{url:state.plan.page+'/actions/runs/'+resume.runId,message:'Open publishing run'}};
    const pages=await api(state,'GET','/pages',null,{signal});
    const {url}=assertDestination(pages,resume.destination);
    onProgress('Checking that the public page serves your reviewed version…');
    if(isSimulation())throw new Error('Live publishing is disabled. Review again after choosing live uploads.');
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
    if((saved.resume.repositoryId && repo.id!==saved.resume.repositoryId) || String(repo.owner?.id)!==String(ticket.session.accountId) || repo.owner?.type!=='User')throw new Error('Sign in to the GitHub account that owns this game.');
    const resume=Object.freeze({...saved.resume});resumptions.set(resume,state);
    return check(resume,{signal});
  }
  async function cleanup(root,saved) {
    if(isSimulation())return simulation();
    if(!shaPattern.test(saved?.sha||''))throw Error('Invalid temporary staging receipt.');
    const plan=await prepareUpload(root,git);
    if(plan.page!==saved.repository)throw Error('Reconnect the repository with the temporary app bundle before retrying.');
    const ticket=await authentication.capture();
    await cleanupStaging({root:plan.root,plan,ticket,slug:plan.page.slice('https://github.com/'.length),cleanupSha:saved.sha},saved.staging);
    unresolvedStages.delete(plan.root);
  }
  return {review,setup,publish,check,restore,verifyLink,cleanup};
}
module.exports={createGitHubPagesPublisher,publishingFiles,workflowPath,pagesPublishWorkflow:compiledWorkflow,publicAddress,_test:{publicReadiness,boundedText}};
