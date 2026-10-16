'use strict';
const path = require('node:path');
const {createAuthentication} = require('./authentication');
const {createGitHubPagesPublisher} = require('./web-publish-github');

function createWebPublishCommands(vscode,{project,authentication,isSimulation=()=>true,isBusy=()=>false,setBusy=()=>{},setState=()=>{},output,uploadChanges,workspaceState,engineRoot=path.join(__dirname,'web-export'),cacheRoot,localBuild,publisherFactory=createGitHubPagesPublisher,pollIntervalMs=5000,maxChecks=180}={}) {
  let disposed=false,controller,publishing=false,resume,recheckRequested=false,lastLive;
  let workflowAuth;
  // No provider lookup or scope request happens until an explicit live command.
  const activeAuth={
    capture:()=> (workflowAuth || authentication).capture(),
    assertCurrent:ticket=>(workflowAuth || authentication).assertCurrent(ticket),
    assertCurrentNow:ticket=>(workflowAuth || authentication).assertCurrentNow(ticket)
  };
  let root;
  const publisher=publisherFactory({authentication:activeAuth,isSimulation:()=>!root || isSimulation(root),engineRoot,cacheRoot,localBuild});
  async function stillCurrent(expected) {
    if(disposed || controller?.signal.aborted || await project()!==expected)throw new Error('The project changed or publishing was cancelled. Check GitHub Actions for any run already started.');
  }
  const progress=message=>{setState(message);output?.appendLine(message);};
  async function showAction(result) {
    progress(result.message || result.action?.message || 'Publishing needs one more step.');
    if(!result.action)return;
    const selected=await vscode.window.showInformationMessage(result.action.message,...(result.action.url?['Open GitHub','Recheck']:['Recheck']));
    if(selected==='Open GitHub' && !disposed)await vscode.env.openExternal(vscode.Uri.parse(result.action.url));
    if(selected==='Recheck')recheckRequested=true;
  }
  async function waitForDeployment(result,expected) {
    for(let attempt=0;result.status==='pending' && attempt<maxChecks;attempt++) {
      await stillCurrent(expected);progress(result.message);resume={root:expected,value:result.resume};
      await workspaceState?.update('zero.webPublish.pending',resume);
      await new Promise(resolve=>{const timer=setTimeout(done,pollIntervalMs);function done(){clearTimeout(timer);controller?.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
      await stillCurrent(expected);
      result=await publisher.check(result.resume,{signal:controller.signal,onProgress:progress});
    }
    return result;
  }
  async function publish() {
    if(disposed || publishing || isBusy())return;
    publishing=true;setBusy(true);controller=new AbortController();
    try {
      root=await project();
      if(disposed || controller.signal.aborted)return;
      // Simulation must never save files, request sessions or touch the network.
      if(isSimulation(root)){progress('Simulation only — no publishing files, sign-in, upload or public website changed.');return {status:'simulated'};}
      if(vscode.workspace.isTrusted===false)throw new Error('Trust your own project before publishing its browser game.');
      const expected=root;
      let result,approvedReview;
      const staged=workspaceState?.get('zero.webPublish.staging');
      const pendingSaved=resume || workspaceState?.get('zero.webPublish.pending');
      if(staged?.root===expected && pendingSaved?.root!==expected && publisher.cleanup) {
        await publisher.cleanup(expected,staged.value);
        await workspaceState?.update('zero.webPublish.staging',undefined);
        await stillCurrent(expected);
      }
      resume=resume || workspaceState?.get('zero.webPublish.pending');
      if(resume?.root===expected) {
        try {result=publisher.restore ? await publisher.restore(expected,resume.value,{signal:controller.signal}) : await publisher.check(resume.value,{signal:controller.signal,onProgress:progress});}
        catch(error) {
          if(error.code!=='WEB_PUBLISH_REPOSITORY_CHANGED')throw error;
          await stillCurrent(expected);
          const chosen=await vscode.window.showInformationMessage('The saved publishing run belongs to a different repository.',{modal:true,detail:'Forget the saved run to review publishing in this connected repository. This does not cancel the old GitHub run or remove its website. Your previous verified link is kept.'},'Forget saved run');
          await stillCurrent(expected);
          if(chosen==='Forget saved run') {
            resume=undefined;await workspaceState?.update('zero.webPublish.pending',undefined);
            progress('Saved run cleared. Choose Publish app to review this repository.');
            return {status:'reset'};
          }
          return {status:'action-required',message:'Reconnect the previous repository or forget its saved publishing run.'};
        }
      }
      else {
        if(vscode.workspace.textDocuments?.some(document=>document.isDirty)) {
          if(!await vscode.workspace.saveAll(false))throw Error('Save your project before publishing its browser app.');
          await stillCurrent(expected);
        }
        let review=await publisher.review(expected,{signal:controller.signal});
        await stillCurrent(expected);
        if(review.status!=='review'){await showAction(review);return review;}
        const previous=lastLive || workspaceState?.get('zero.webPublish.lastLive');
        const sameDestination=!review.setup && previous?.root===expected && previous.account===review.account && previous.resume?.repository===review.repository && previous.url===review.publicUrl;
        if(!sameDestination) {
          const chosen=await vscode.window.showInformationMessage('Publish this app publicly?',{modal:true,detail:`Your app and included assets will be public.\n${review.publicUrl || (review.repository + ' → GitHub Pages')}`},'Publish app');
          if(chosen!=='Publish app')return;
        }
        const approvedDestination=review;
        const assertDestination=()=>{
          if(review.repository!==approvedDestination.repository || review.account!==approvedDestination.account || review.publicUrl!==approvedDestination.publicUrl || review.needsPages!==approvedDestination.needsPages)throw new Error('The publishing account or destination changed. Choose Publish app again to review it.');
        };
        await stillCurrent(expected);
        if(review.setup) {
          const base=await authentication.capture();
          const original=review;
          workflowAuth?.dispose();
          workflowAuth=createAuthentication(vscode.authentication,()=>{},['repo','workflow']);
          try {await workflowAuth.capture();} catch {await workflowAuth.signIn();}
          const expanded=await workflowAuth.capture();
          if(expanded.session.accountId!==base.session.accountId)throw new Error('The GitHub account changed during authorization. Review publishing again with the intended account.');
          // Native authorization changes invalidate the old review. Never reuse it.
          review=await publisher.review(expected,{signal:controller.signal});
          if(review.status!=='review'){await showAction(review);return review;}
          assertDestination();
          if(review.sha!==original.sha)throw new Error('The project version changed during GitHub authorization. Review publishing again.');
          await stillCurrent(expected);
          result=await publisher.setup(review,{signal:controller.signal});
          if(result.status!=='upload-required'){await showAction(result);return result;}
          progress(result.message);
          if(!uploadChanges){await showAction({...result,action:{message:'Choose Commit & push to save the publishing setup on main, then choose Publish web game again.'}});return result;}
          // The coordinator's existing upload action owns its busy flag and
          // input. Keep this command's separate operation guard held throughout.
          setBusy(false);
          try {await uploadChanges(workflowAuth || authentication);} finally {setBusy(true);}
          await stillCurrent(expected);
          review=await publisher.review(expected,{signal:controller.signal});
          if(review.status!=='review'){await showAction(review);return review;}
          if(review.setup)throw new Error('The publishing setup was not uploaded completely. Commit & push on main and retry.');
          assertDestination();
        }
        await stillCurrent(expected);
        approvedReview=review;
        result=await publisher.publish(review,{signal:controller.signal,onProgress:progress,onStaging:async value=>{await workspaceState?.update('zero.webPublish.staging',value?{root:expected,value}:undefined);},onPending:async value=>{resume={root:expected,value};await workspaceState?.update('zero.webPublish.pending',resume);await workspaceState?.update('zero.webPublish.staging',undefined);}});
      }
      result=await waitForDeployment(result,expected);
      await stillCurrent(expected);
      if(result.status==='live') {
        resume=undefined;progress('Your playable game is live.');
        await workspaceState?.update('zero.webPublish.pending',undefined);
        lastLive={root:expected,url:result.url,sha:result.sha,resume:result.resume,account:approvedReview?.account};
        await workspaceState?.update('zero.webPublish.lastLive',lastLive);
        const selected=await vscode.window.showInformationMessage('Your playable game is live.','Open app','Copy playable link');
        if(selected==='Open app')await vscode.env.openExternal(vscode.Uri.parse(result.url));
        else if(selected==='Copy playable link')await vscode.env.clipboard.writeText(result.url);
      } else if(result.status==='pending')progress('Publishing is still running. Choose Publish web game again to recheck this run.');
      else {resume=undefined;await workspaceState?.update('zero.webPublish.pending',undefined);await showAction(result);}
      return result;
    } finally {controller=undefined;publishing=false;setBusy(false);if(recheckRequested && !disposed){recheckRequested=false;queueMicrotask(()=>{void publish().catch(error=>progress(error.message));});}}
  }
  async function publishedLink(open) {
    if(disposed || publishing || isBusy())return;
    publishing=true;setBusy(true);controller=new AbortController();
    try {
      root=await project();
      if(disposed || controller.signal.aborted)return;
      if(isSimulation(root)){progress(open ? 'Simulation only — no public page was checked or opened.' : 'Simulation only — no public link was checked or copied.');return;}
      const saved=lastLive || workspaceState?.get('zero.webPublish.lastLive');
      if(!saved || saved.root!==root)throw new Error('Publish this game before copying its playable link.');
      const expected=root;
      const verified=await publisher.verifyLink(expected,saved,{signal:controller.signal});
      await stillCurrent(expected);
      if(verified.status!=='live'){await showAction(verified);return verified;}
      if(open)await vscode.env.openExternal(vscode.Uri.parse(verified.url));
      else {await vscode.env.clipboard.writeText(verified.url);progress('Playable game link copied.');}
      return verified;
    } finally {controller=undefined;publishing=false;setBusy(false);if(recheckRequested && !disposed){recheckRequested=false;queueMicrotask(()=>{void publishedLink(open).catch(error=>progress(error.message));});}}
  }
  // Sharing already holds the coordinator's component lock. This nested read
  // claims our own lock but deliberately does not reject that outer busy flag.
  // It neither publishes nor changes authored metadata.
  async function verifiedPublication(expected,commit) {
    if(disposed || isSimulation(expected))return;
    if(publishing)throw new Error('Wait for publishing to finish before sharing its playable link.');
    const saved=lastLive || workspaceState?.get('zero.webPublish.lastLive');
    if(!saved || saved.root!==expected || saved.sha!==commit)return;
    publishing=true;setBusy(true);controller=new AbortController();
    try {
      root=await project();
      await stillCurrent(expected);
      if(root!==expected)throw new Error('The project changed. Share its uploaded version again.');
      if(isSimulation(root))return;
      if(vscode.workspace.isTrusted===false)throw new Error('Trust your own project before checking its playable link.');
      let checked;
      try {checked=await publisher.verifyLink(expected,saved,{signal:controller.signal});}
      catch(error) {
        // A remembered link is optional for source sharing. Never attach it when
        // its repository or current availability cannot be verified.
        await stillCurrent(expected);
        if(error.name==='AbortError')throw error;
        progress('Sharing source only — the saved playable link could not be verified.');
        return;
      }
      await stillCurrent(expected);
      if(isSimulation(root) || checked.status!=='live' || checked.sha!==commit)return;
      return {provider:'github-pages',url:checked.url,commit,runId:checked.resume.runId};
    } finally {controller=undefined;publishing=false;setBusy(false);}
  }
  return {publish,verifiedPublication,commands:{'zero.publishWeb':publish,'zero.copyPublishedWebLink':()=>publishedLink(false),'zero.openPublishedWeb':()=>publishedLink(true)},disposables:[{dispose(){disposed=true;controller?.abort();workflowAuth?.dispose();}}]};
}
module.exports={createWebPublishCommands};
