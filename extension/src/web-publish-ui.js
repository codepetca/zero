'use strict';
const path = require('node:path');
const {createAuthentication} = require('./authentication');
const {createGitHubPagesPublisher} = require('./web-publish-github');

function createWebPublishCommands(vscode,{project,authentication,isSimulation=()=>true,isBusy=()=>false,setBusy=()=>{},setState=()=>{},output,uploadChanges,workspaceState,engineRoot=path.join(__dirname,'web-export'),publisherFactory=createGitHubPagesPublisher,pollIntervalMs=5000,maxChecks=180}={}) {
  let disposed=false,controller,publishing=false,resume,recheckRequested=false,lastLive;
  let workflowAuth;
  // No provider lookup or scope request happens until an explicit live command.
  const activeAuth={
    capture:()=> (workflowAuth || authentication).capture(),
    assertCurrent:ticket=>(workflowAuth || authentication).assertCurrent(ticket),
    assertCurrentNow:ticket=>(workflowAuth || authentication).assertCurrentNow(ticket)
  };
  let root;
  const publisher=publisherFactory({authentication:activeAuth,isSimulation:()=>!root || isSimulation(root),engineRoot});
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
        let review=await publisher.review(expected,{signal:controller.signal});
        await stillCurrent(expected);
        if(review.status!=='review'){await showAction(review);return review;}
        const previous=lastLive || workspaceState?.get('zero.webPublish.lastLive');
        const sameDestination=!review.setup && previous?.root===expected && previous.account===review.account && previous.resume?.repository===review.repository && previous.url===review.publicUrl;
        if(!sameDestination) {
          const chosen=await vscode.window.showInformationMessage(review.setup?'Set up and publish this browser game?':'Publish this version of your browser game?',{modal:true,detail:`Public destination: ${review.publicUrl || (review.repository + ' → GitHub Pages')}\nAccount: ${review.account}\nSource: main at ${review.sha.slice(0,12)}\n${review.setup?'Adds compiler source and a publishing workflow, then uses Upload changes. VS Code may ask once for permission to create GitHub workflows. ':''}The playable page and included assets will be public. Repository visibility stays the same. GitHub Actions may use your account’s build allowance.`},review.setup?'Set up publishing':'Publish game');
          if(!chosen || chosen!==(review.setup?'Set up publishing':'Publish game'))return;
        }
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
          if(review.sha!==original.sha || review.repository!==original.repository)throw new Error('The project version changed during GitHub authorization. Review publishing again.');
          await stillCurrent(expected);
          result=await publisher.setup(review,{signal:controller.signal});
          if(result.status!=='upload-required'){await showAction(result);return result;}
          progress(result.message);
          if(!uploadChanges){await showAction({...result,action:{message:'Choose Upload changes to save the publishing setup on main, then choose Publish web game again.'}});return result;}
          // The coordinator's existing upload action owns its busy flag and
          // review. Keep this command's separate operation guard held throughout.
          setBusy(false);
          try {await uploadChanges(workflowAuth || authentication);} finally {setBusy(true);}
          await stillCurrent(expected);
          review=await publisher.review(expected,{signal:controller.signal});
          if(review.status!=='review'){await showAction(review);return review;}
          if(review.setup)throw new Error('The publishing setup was not uploaded completely. Upload changes on main and retry.');
          const confirmed=await vscode.window.showInformationMessage('Publish the uploaded game now?',{modal:true,detail:`Public destination: ${review.publicUrl || (review.repository + ' → GitHub Pages')}\nSource: main at ${review.sha.slice(0,12)}\nThe browser game and included assets will be public.`},'Publish game');
          if(confirmed!=='Publish game')return;
        }
        await stillCurrent(expected);
        approvedReview=review;
        result=await publisher.publish(review,{signal:controller.signal,onProgress:progress});
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
      if(isSimulation(root)){progress('Simulation only — no public link was checked or copied.');return;}
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
  return {publish,commands:{'zero.publishWeb':publish,'zero.copyPublishedWebLink':()=>publishedLink(false),'zero.openPublishedWeb':()=>publishedLink(true)},disposables:[{dispose(){disposed=true;controller?.abort();workflowAuth?.dispose();}}]};
}
module.exports={createWebPublishCommands};
