'use strict';
const path = require('node:path');
const {createGitHubPagesPublisher} = require('./web-publish-github');

function createWebPublishCommands(vscode,{project,authentication,repositories,isSimulation=()=>true,isBusy=()=>false,setBusy=()=>{},setState=()=>{},output,uploadChanges,workspaceState,engineRoot=path.join(__dirname,'web-export'),cacheRoot,localBuild,validateExport,assertBuildInputsAtCommit,publisherFactory=createGitHubPagesPublisher,pollIntervalMs=5000,maxChecks=180}={}) {
  let disposed=false,controller,publishing=false,resume,recheckRequested=false,lastLive;
  let root;
  const publisher=publisherFactory({authentication,repositories,isSimulation:()=>!root || isSimulation(root),engineRoot,cacheRoot,localBuild,validateExport,assertBuildInputsAtCommit});
  async function stillCurrent(expected) {
    if(disposed || controller?.signal.aborted || await project()!==expected)throw new Error('The project changed or publishing was cancelled. Check GitHub Actions for any run already started.');
  }
  function assertPublishCurrentNow(expected) {
    if(disposed || controller?.signal.aborted)throw new Error('Publishing was cancelled. Check GitHub Actions for any run already started.');
    if(isSimulation(expected))throw new Error('Live publishing was disabled. Choose Publish & open app again after enabling live uploads.');
  }
  async function stillPublishable(expected) {
    await stillCurrent(expected);
    assertPublishCurrentNow(expected);
  }
  async function uploadForPublish(expected,expectedPlan) {
    await stillPublishable(expected);
    if(!uploadChanges)throw new Error('Choose Commit & push on main, then Publish & open app.');
    progress('Saving changes before publishing…');
    // The upload command claims its own lock synchronously. Keep our separate
    // publication guard held while handing the coordinator lock to it.
    setBusy(false);
    try {return await uploadChanges(authentication,{forPublish:true,expectedRoot:expected,expectedPlan,assertPublishCurrent:()=>stillPublishable(expected),assertPublishCurrentNow:()=>assertPublishCurrentNow(expected)});}
    finally {setBusy(true);}
  }
  const progress=(message,detail=message)=>{setState(message);output?.appendLine(detail);};
  async function showAction(result) {
    progress(result.message || result.action?.message || 'Publishing needs one more step.');
    if(!result.action)return;
    const selected=await vscode.window.showInformationMessage(result.action.message,...(result.action.url?['Open GitHub','Recheck']:['Recheck']));
    if(selected==='Open GitHub' && !disposed)await vscode.env.openExternal(vscode.Uri.parse(result.action.url));
    if(selected==='Recheck')recheckRequested=true;
  }
  async function waitForDeployment(result,expected,account) {
    for(let attempt=0;result.status==='pending' && attempt<maxChecks;attempt++) {
      await stillCurrent(expected);progress(result.message);resume={root:expected,value:result.resume,account};
      await workspaceState?.update('zero.webPublish.pending',resume);
      await new Promise(resolve=>{const timer=setTimeout(done,pollIntervalMs);function done(){clearTimeout(timer);controller?.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
      await stillCurrent(expected);
      result=await publisher.check(result.resume,{signal:controller.signal,onProgress:progress});
    }
    return result;
  }
  async function publish({open=false}={}) {
    if(disposed || publishing || isBusy())return;
    publishing=true;setBusy(true);controller=new AbortController();
    try {
      root=await project();
      if(disposed || controller.signal.aborted)return;
      if(isSimulation(root)){progress('Simulation only — no publishing files, sign-in, upload or public website changed.');return {status:'simulated'};}
      if(vscode.workspace.isTrusted===false)throw new Error('Trust your own project before publishing its browser game.');
      const expected=root;
      if(open)progress('Checking latest app…');
      // A resumed older deployment may finish while a newer local version exists.
      // Allow one fresh publication, then stop if editing continues; never open stale output.
      for(let attempt=0;attempt<(open?2:1);attempt++) {
        await stillPublishable(expected);
        if(open && vscode.workspace.textDocuments?.some(document=>document.isDirty)) {
          if(!await vscode.workspace.saveAll(false))throw Error('Save your project before publishing its browser app.');
          await stillPublishable(expected);
        }
        const result=await publishOnce(expected,{reuse:open});
        if(!open || result?.status!=='live')return result;
        let current=result;
        if(!result.alreadyCurrent) {
          let reviewed;
          try {reviewed=await publisher.review(expected,{signal:controller.signal});}
          catch(error) {if(error.code==='WEB_PUBLISH_UPLOAD_REQUIRED' && attempt===0)continue;throw error;}
          await stillPublishable(expected);
          if(reviewed.status!=='review'){await showAction(reviewed);return reviewed;}
          current=await publisher.verifyCurrent(reviewed,lastLive,{signal:controller.signal});
        }
        await stillPublishable(expected);
        if(current.status==='stale' || vscode.workspace.textDocuments?.some(document=>document.isDirty)) {
          if(attempt===0)continue;
          throw Error('Your app changed while publishing. Choose Publish & open app again to open the latest version.');
        }
        if(current.status!=='live'){await showAction(current);return current;}
        const opened=await vscode.env.openExternal(vscode.Uri.parse(current.url));
        progress(opened===false?'App published — the browser could not be opened. See Zero Output for its link.':'App opened',`Your playable app is live: ${current.url}`);
        return {...current,opened:opened!==false};
      }
    } finally {controller=undefined;publishing=false;setBusy(false);if(recheckRequested && !disposed){recheckRequested=false;queueMicrotask(()=>{void publish({open}).catch(error=>progress(error.message));});}}
  }
  async function publishOnce(expected,{reuse=false}={}) {
    let result,approvedAccount;
    const staged=workspaceState?.get('zero.webPublish.staging');
    const pendingSaved=resume || workspaceState?.get('zero.webPublish.pending');
    if(staged?.root===expected && pendingSaved?.root!==expected && publisher.cleanup) {
      await publisher.cleanup(expected,staged.value);
      await workspaceState?.update('zero.webPublish.staging',undefined);
      await stillCurrent(expected);
    }
    resume=resume || workspaceState?.get('zero.webPublish.pending');
    if(resume?.root===expected) {
      approvedAccount=resume.account;
      try {result=publisher.restore ? await publisher.restore(expected,resume.value,{signal:controller.signal}) : await publisher.check(resume.value,{signal:controller.signal,onProgress:progress});}
      catch(error) {
        if(error.code!=='WEB_PUBLISH_REPOSITORY_CHANGED')throw error;
        await stillCurrent(expected);
        const chosen=await vscode.window.showInformationMessage('The saved publishing run belongs to a different repository.',{modal:true,detail:'The old run, website and verified link are kept.'},'Forget saved run');
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
      await stillPublishable(expected);
      let review,uploadedSource;
      try {review=await publisher.review(expected,{signal:controller.signal});}
      catch(error) {
        if(error.code!=='WEB_PUBLISH_UPLOAD_REQUIRED')throw error;
        uploadedSource=await uploadForPublish(expected,error.plan);
        if(!uploadedSource?.uploaded)return;
        await stillCurrent(expected);
        review=await publisher.review(expected,{signal:controller.signal});
        if(review.status==='review' && review.sha!==uploadedSource.head)throw new Error('The project version changed after upload. Choose Publish & open app again to publish the intended version.');
      }
      await stillCurrent(expected);
      if(review.status!=='review'){await showAction(review);return review;}
      const previous=lastLive || workspaceState?.get('zero.webPublish.lastLive');
      if(reuse) {
        progress('Checking published app…');
        result=await publisher.verifyCurrent(review,previous,{signal:controller.signal});
        await stillPublishable(expected);
        if(result.status==='stale')result=undefined;
        else {
          if(result.status==='live')return {...result,alreadyCurrent:true};
          if(result.status==='pending')progress('The published app could not be verified. Try Publish & open app again.',result.message);
          else await showAction(result);
          return result;
        }
      }
      if(!result) {
        const consent=workspaceState?.get('zero.webPublish.approval');
        const sameDestination=(previous?.root===expected && previous.account===review.account && previous.resume?.repository===review.repository && previous.url===review.publicUrl) || (consent?.root===expected && consent.account===review.account && consent.repository===review.repository && consent.url===review.publicUrl);
        if(!sameDestination) {
          const chosen=await vscode.window.showInformationMessage('Publish this app publicly?',{modal:true,detail:`Your app and included assets will be public.\n${review.publicUrl || (review.repository + ' → GitHub Pages')}`},'Publish app');
          if(chosen!=='Publish app')return;
          await stillCurrent(expected);
          await workspaceState?.update('zero.webPublish.approval',{root:expected,account:review.account,repository:review.repository,url:review.publicUrl});
        }
        const approvedDestination=review;
        const assertDestination=()=>{
          if(review.repository!==approvedDestination.repository || review.account!==approvedDestination.account || review.publicUrl!==approvedDestination.publicUrl || review.needsPages!==approvedDestination.needsPages)throw new Error('The publishing account or destination changed. Choose Publish & open app again to review it.');
        };
        await stillCurrent(expected);
        if(review.setup || review.upgrade) {
          const updating=Boolean(review.upgrade);
          if(updating) {
            const chosen=await vscode.window.showInformationMessage('Update publishing files?',{modal:true,detail:`Files:\n${review.upgrade.files.join('\n')}\nSource and destination stay the same. Git history is kept.\n${review.publicUrl || review.repository}`},'Update publishing files');
            if(chosen!=='Update publishing files')return;
            await stillCurrent(expected);
          }
          const base=await authentication.capture();
          const original=review;
          if(!repositories?.access)throw Error('Zero GitHub App repository access is not configured.');
          await repositories.access(review.repository,{ticket:base,permissions:{contents:'write',workflows:'write'},signal:controller.signal});
          await authentication.assertCurrent(base);
          // Repository access changes invalidate the old review. Never reuse it.
          review=await publisher.review(expected,{signal:controller.signal});
          if(review.status!=='review'){await showAction(review);return review;}
          assertDestination();
          if(Boolean(review.upgrade)!==updating || (updating && JSON.stringify(review.upgrade)!==JSON.stringify(original.upgrade)))throw new Error('The publishing kit changed during authorization. Review publishing again.');
          if(review.sha!==original.sha)throw new Error('The project version changed during GitHub authorization. Review publishing again.');
          await stillCurrent(expected);
          result=await publisher[updating?'update':'setup'](review,{signal:controller.signal});
          if(result.status!=='upload-required'){await showAction(result);return result;}
          progress(result.message);
          if(!uploadChanges){await showAction({...result,action:{message:'Choose Commit & push to save the publishing setup on main, then choose Publish & open app again.'}});return result;}
          const uploaded=await uploadForPublish(expected);
          if(!uploaded?.uploaded)return;
          await stillCurrent(expected);
          review=await publisher.review(expected,{signal:controller.signal});
          if(review.status!=='review'){await showAction(review);return review;}
          if(review.setup || review.upgrade)throw new Error('The publishing setup was not uploaded completely. Commit & push on main and retry.');
          assertDestination();
          if(review.sha!==uploaded.head)throw new Error('The project version changed after the setup upload. Choose Publish & open app again to publish the intended version.');
        }
        await stillCurrent(expected);
        approvedAccount=review.account;
        result=await publisher.publish(review,{signal:controller.signal,onProgress:progress,onStaging:async value=>{await workspaceState?.update('zero.webPublish.staging',value?{root:expected,value}:undefined);},onPending:async value=>{resume={root:expected,value,account:approvedAccount};await workspaceState?.update('zero.webPublish.pending',resume);await workspaceState?.update('zero.webPublish.staging',undefined);}});
      }
    }
    result=await waitForDeployment(result,expected,approvedAccount);
    await stillCurrent(expected);
    if(result.status==='live') {
      resume=undefined;progress('App published',`Your playable app is live: ${result.url}`);
      await workspaceState?.update('zero.webPublish.pending',undefined);
      lastLive={root:expected,url:result.url,sha:result.sha,resume:result.resume,account:approvedAccount};
      await workspaceState?.update('zero.webPublish.lastLive',lastLive);
    } else if(result.status==='pending')progress('Publishing is still running. Choose Publish & open app again to recheck this run.');
    else {resume=undefined;await workspaceState?.update('zero.webPublish.pending',undefined);await showAction(result);}
    return result;
  }
  const publishAndOpen=()=>publish({open:true});
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
      else {await vscode.env.clipboard.writeText(verified.url);progress('Playable link copied','Playable game link copied.');}
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
  return {publish,publishAndOpen,verifiedPublication,commands:{'zero.publishWeb':()=>publish(),'zero.publishAndOpenWeb':publishAndOpen,'zero.copyPublishedWebLink':()=>publishedLink(false),'zero.openPublishedWeb':()=>publishedLink(true)},disposables:[{dispose(){disposed=true;controller?.abort();}}]};
}
module.exports={createWebPublishCommands};
