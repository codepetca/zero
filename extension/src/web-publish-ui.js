'use strict';
const {BrowserToolingDecision} = require('./browser-tooling-decision');
const path = require('node:path');
const fs = require('node:fs');
const {createGitHubPagesPublisher} = require('./web-publish-github');
const {safePagesUrl}=require('./web-pages-verification');
const {parseRepositoryUrl}=require('./core');

// Keep the final browser-dispatch guard synchronous. Resolve existing parents
// too, so a new unsaved file and a workspace alias have the same project scope.
function canonicalDocumentPath(filename) {
  let current=path.resolve(filename),suffix=[];
  while(true) {
    try {return path.join(fs.realpathSync.native(current),...suffix);}
    catch(error) {
      if(error.code!=='ENOENT')throw error;
      const parent=path.dirname(current);if(parent===current)throw error;
      suffix.unshift(path.basename(current));current=parent;
    }
  }
}
function dirtyBuildDocuments(vscode,root) {
  const projectPath=canonicalDocumentPath(root);
  const input=filename=>{
    const relative=path.relative(projectPath,filename).split(path.sep).join('/');
    return ['pom.xml','mvnw','mvnw.cmd','zero-core.json','zero-libraries.json'].includes(relative) ||
      /^(?:src\/main\/(?:java|resources)|\.mvn|\.zero-build|libraries|zero-dependencies)\/.+/.test(relative);
  };
  return (vscode.workspace.textDocuments||[]).filter(document=>{
    if(!document.isDirty||document.uri?.scheme!=='file'||!document.uri.fsPath)return false;
    const filename=document.uri.fsPath;
    try {return input(canonicalDocumentPath(filename))||input(path.join(canonicalDocumentPath(path.dirname(filename)),path.basename(filename)));}
    catch(error) {
      // An unrelated inaccessible editor must not prevent publishing. A path
      // within this project's inputs still fails closed instead of being missed.
      const relative=path.relative(path.resolve(root),path.resolve(filename));
      if(relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw error;
      return false;
    }
  });
}

function createWebPublishCommands(vscode,{onToolingDecision,onReportStage=()=>{},onReportFailure=()=>{},onReportSuccess=()=>{},project,assertProjectNow=()=>{},connectedRepository=()=>undefined,authentication,repositories,isSimulation=()=>true,isBusy=()=>false,setBusy=()=>{},setState=()=>{},setProgress=()=>{},output,listPublication,gameJam,uploadChanges,workspaceState,engineRoot=path.join(__dirname,'web-export'),cacheRoot,localBuild,validateExport,assertBuildInputsAtCommit,beforeBuildReview=async()=>{},publisherFactory=createGitHubPagesPublisher,pollIntervalMs=5000,maxChecks=180}={}) {
  let disposed=false,controller,publishing=false,resume,recheckRequested=false,recheckDispatch=false,lastLive;
  let root,stageProgress,openingRequested=false;
  const clearProgress=()=>{stageProgress=undefined;setProgress(undefined);};
  function startProgress(stages) {
    if(disposed || controller?.signal.aborted)return;
    onReportStage(stages[0] || 'unknown');
    stageProgress={root,stages:openingRequested?[...stages,'opening']:stages,index:0};
    setProgress(stageProgress);
  }
  function stage(name) {
    if(!stageProgress || disposed || controller?.signal.aborted)return;
    const index=stageProgress.stages.indexOf(name);
    if(index<stageProgress.index)return;
    stageProgress={...stageProgress,index};onReportStage(name);setProgress(stageProgress);
  }
  const publisher=publisherFactory({authentication,repositories,isSimulation:()=>!root || isSimulation(root),engineRoot,cacheRoot,localBuild,validateExport,assertBuildInputsAtCommit});
  async function stillCurrent(expected) {
    if(disposed || controller?.signal.aborted || await project()!==expected)throw new Error('The project changed or publishing was cancelled. Check GitHub Actions for any run already started.');
  }
  function assertPublishCurrentNow(expected) {
    if(disposed || controller?.signal.aborted)throw new Error('Publishing was cancelled. Check GitHub Actions for any run already started.');
    assertProjectNow(expected);
    if(vscode.workspace.isTrusted===false)throw new Error('Trust your own project before publishing its browser game.');
    if(isSimulation(expected))throw new Error('Live publishing was disabled. Choose Publish & open app again after enabling live uploads.');
  }
  async function stillPublishable(expected) {
    await stillCurrent(expected);
    assertPublishCurrentNow(expected);
  }
  async function saveBuildDocuments(expected) {
    for(const document of dirtyBuildDocuments(vscode,expected)) {
      await stillPublishable(expected);
      if(!await document.save())throw Error('Save your project before publishing its browser app.');
      await stillPublishable(expected);
    }
    if(dirtyBuildDocuments(vscode,expected).length)throw Error('Save your project before publishing its browser app.');
  }
  async function uploadForPublish(expected,review,expectedPlan,target,jam) {
    await stillPublishable(expected);
    if(!uploadChanges)throw new Error('Commit and sync the publishing files on main, then choose Publish & open app.');
    startProgress(['preparing','building','uploading','deploying','verifying']);
    progress('Saving publishing files…');
    // The upload command claims its own lock synchronously. Keep our separate
    // publication guard held while handing the coordinator lock to it.
    setBusy(false);
    const expectedPublishTarget=target&&{root:target.root,account:target.account,repository:target.repository,
      repositoryId:target.repositoryId,label:publishLabel(jam)};
    try {return await uploadChanges(authentication,{forPublish:true,expectedRoot:expected,expectedPlan,expectedAccount:review.account,
      ...(expectedPublishTarget ? {expectedPublishTarget} : {}),
      assertPublishCurrent:()=>stillPublishable(expected),assertPublishCurrentNow:()=>assertPublishCurrentNow(expected)});}
    finally {setBusy(true);}
  }
  const progress=(message,detail=message)=>{setState(message);output?.appendLine(detail);};
  const publishLabel=jam=>jam ? 'Publish to Jam' : 'Publish & open app';
  async function showAction(result,{allowRecheck=true}={}) {
    clearProgress();
    progress(result.message || result.action?.message || 'Publishing needs one more step.');
    if(!result.action)return;
    const choices=[...(result.action.url?['Open GitHub']:[]),...(allowRecheck?['Recheck']:[])];
    const selected=await vscode.window.showInformationMessage(result.action.message,...choices);
    if(selected==='Open GitHub' && !disposed)await vscode.env.openExternal(vscode.Uri.parse(result.action.url));
    if(selected==='Recheck')recheckRequested=true;
  }
  async function savePending(expected,value,account,routeReceipt) {
    const next={root:expected,value,account,...routeReceipt};
    await workspaceState?.update('zero.webPublish.pending',next);
    resume=next;
  }
  async function trackDispatch(expected,value,account,routeReceipt) {
    await savePending(expected,value,account,routeReceipt);
    await workspaceState?.update('zero.webPublish.staging',undefined);
  }
  async function showDispatchAction(result,expected) {
    clearProgress();
    progress(result.message || result.action.message);
    const chosen=await vscode.window.showInformationMessage(result.action.message,'Open GitHub Actions','Recheck','Dismiss saved attempt…');
    await stillPublishable(expected);
    if(chosen==='Open GitHub Actions')await vscode.env.openExternal(vscode.Uri.parse(result.action.url));
    if(chosen==='Recheck')recheckDispatch=true;
    if(chosen==='Dismiss saved attempt…') {
      const staged=workspaceState?.get('zero.webPublish.staging');
      if(staged?.root!==expected)return;
      const confirmed=await vscode.window.showWarningMessage('Dismiss this publishing attempt?',{
        modal:true,detail:'Check GitHub Actions first. GitHub may still be deploying this app. Dismissing clears Zero’s saved attempt on this computer. GitHub’s run and uploaded bundle are kept.'
      },'Dismiss saved attempt');
      if(confirmed!=='Dismiss saved attempt')return;
      await stillPublishable(expected);
      await publisher.forgetDispatch(expected,staged.value);
      await workspaceState?.update('zero.webPublish.staging',undefined);
      progress('Saved attempt dismissed. Choose Publish & open app to start a new attempt.');
      return {status:'reset'};
    }
  }
  function sourceUploadRequired(jam) {
    clearProgress();
    const message=`Commit any changes and choose Sync on main, then choose ${publishLabel(jam)} again.`;
    progress(message);
    return {status:'upload-required',message};
  }
  async function waitForDeployment(result,expected,account,routeReceipt,pauseForPublicMarker) {
    for(let attempt=0;result.status==='pending' && attempt<maxChecks;attempt++) {
      if(pauseForPublicMarker && result.pendingReason==='public-marker')break;
      await stillCurrent(expected);stage('deploying');progress(result.message);
      await savePending(expected,result.resume,account,routeReceipt);
      await new Promise(resolve=>{const timer=setTimeout(done,pollIntervalMs);function done(){clearTimeout(timer);controller?.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
      await stillCurrent(expected);
      result=await publisher.check(result.resume,{signal:controller.signal,onProgress:progress,onStage:stage});
    }
    return result;
  }
  async function updateHubListing(saved, expected) {
    if (!listPublication || !saved?.listingPending) return saved;
    await stillPublishable(expected);
    progress('Updating app listing on ZeroHub…');
    const result = await listPublication(saved, {signal:controller.signal, beforeSend:()=>assertPublishCurrentNow(expected)});
    if (controller.signal.aborted || disposed) return saved;
    let listingMessage;
    if (result.status === 'listed') {
      listingMessage = typeof result.replaced === 'string' ? `Added to ZeroHub, replacing ${result.replaced}` : 'Added to ZeroHub';
    } else if (result.status === 'unlisted') {
      listingMessage = result.reason === 'protected' ? 'Your protected app kept its spot on ZeroHub' : 'App is off ZeroHub';
    } else if (result.status === 'pending' || result.status === 'unavailable') {
      listingMessage = result.status === 'pending' ? 'ZeroHub app listing pending' : 'ZeroHub app listings unavailable';
    }
    const retry = result.status === 'pending' || result.status === 'unavailable';
    if (listingMessage) output?.appendLine(retry
      ? `${listingMessage}. Choose Publish & open app to retry.`
      : `${listingMessage}. Open My Projects at https://zero.codepet.ca/hub/listings`);
    lastLive = {...saved, listingPending:retry, listingMessage};
    await workspaceState?.update('zero.webPublish.lastLive', lastLive);
    return lastLive;
  }
  async function verifyAndOpen(reviewed,saved,expected,{fast=false,retryListing=false,target,jam,webOnly=false}={}) {
    let opening;
    stage('verifying');progress('Checking live app…');
    const verify=fast?publisher.verifyUnchanged.bind(publisher,expected):publisher.verifyCurrent.bind(publisher,reviewed);
    const current=await verify(saved,{
      signal:controller.signal,
      ...(fast&&jam ? {reviewChangedDestination:true} : {}),
      beforeFinalCheck:()=>stillPublishable(expected),
      // Called synchronously after the publisher's final source/session proof.
      // Request the browser here: no awaited project lookup may follow the proof.
      onCurrent:verified=>{
        if(openingRequested){stage('opening');progress('Opening in browser…');}
        assertPublishCurrentNow(expected);
        assertPublishTarget(target,{...verified.resume,root:expected,account:reviewed?.account ?? saved?.account},jam);
        if(dirtyBuildDocuments(vscode,expected).length)throw Error(`Your app changed while publishing. Choose ${publishLabel(jam)} again.`);
        if(openingRequested) {
          if(jam) {
            // A browser failure must not interrupt submission of a verified build.
            try {opening=Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(verified.url))).catch(()=>false);}
            catch {opening=false;}
          } else opening=vscode.env.openExternal(vscode.Uri.parse(verified.url));
        }
      }
    });
    if(current.status!=='live')return current;
    assertPublishTarget(target,{...current.resume,root:expected,account:reviewed?.account ?? saved?.account},jam);
    const opened=await opening;
    let listing;
    if(!jam&&!webOnly)listing=retryListing ? (saved?.listingPending ? await updateHubListing(saved, expected) : undefined) : saved;
    await stillCurrent(expected);
    clearProgress();
    if (opened === false) onReportFailure(Object.assign(new Error(),{code:'WEB_PUBLISH_OPEN_FAILED'}),expected);
    const message = opened === false ? 'App published — the browser could not be opened. See Zero Output for its link.' :
      openingRequested ? 'App opened' : 'App published';
    progress(listing?.listingMessage ? `${message} · ${listing.listingMessage}` : message,`Your playable app is live: ${current.url}`);
    return {...current,opened:openingRequested && opened!==false};
  }

  function jamRequest(expected) {
    return {signal:controller.signal,beforeSend:()=>assertPublishCurrentNow(expected)};
  }

  function isPublishTarget(target,{account,repository,repositoryId,root}) {
    return root===target.root && String(account)===target.account &&
      typeof repository==='string' && repository.toLowerCase()===target.repository.toLowerCase() && String(repositoryId)===target.repositoryId;
  }
  function assertPublishTarget(target,evidence,jam) {
    if(target && !isPublishTarget(target,evidence))
      throw Object.assign(Error(`The GitHub account or repository changed. Choose ${publishLabel(jam)} again.`),
        {code:'WEB_PUBLISH_REPOSITORY_CHANGED'});
  }

  async function approveJam(jam,expected,pagesUrl) {
    const approval={root:expected,account:jam.account,repository:jam.repository,repositoryId:jam.repositoryId,jamId:jam.id,revision:jam.revision,entryRevision:jam.entryRevision};
    if(jam.projectRevision!==undefined)approval.projectRevision=jam.projectRevision;
    if(pagesUrl)approval.pagesUrl=pagesUrl;
    const saved=workspaceState?.get('zero.webPublish.jamApproval');
    if(saved && Object.keys(approval).every(key=>saved[key]===approval[key]))return true;
    clearProgress();
    const detail=[
      'Your game and assets will be public on GitHub Pages. Zero will submit the verified build to this Game Jam.',
      jam.replacesProject&&`This replaces your current entry from ${jam.replacesProject}.`,
      pagesUrl || jam.repository,
      jam.rules && `Current rules\n${jam.rules}`,
      jam.eligibility && `Who can take part\n${jam.eligibility}`
    ].filter(Boolean).join('\n\n');
    const accepted=await vscode.window.showInformationMessage(`Publish to ${jam.title}?`,{modal:true,detail},'Publish to Jam');
    if(accepted!=='Publish to Jam')return false;
    await stillPublishable(expected);
    await workspaceState?.update('zero.webPublish.jamApproval',approval);
    return true;
  }

  function reportJamResult(jam,result,{recovered=false,opened,verifiedUrl}={}) {
    if(result.status==='submitted') {
      const message=recovered ? `Earlier submission to ${jam.title} confirmed. Choose Publish to Jam again to submit new changes.` :
        `Submitted to ${jam.title}`;
      progress(message,verifiedUrl ? `${message}\nGame: ${verifiedUrl}${opened===false&&openingRequested?'\nThe browser could not be opened.':''}` : message);
    } else if(result.status==='pending') {
      progress(`Game published · submission to ${jam.title} pending. Choose Publish to Jam to retry.`);
    } else {
      progress(`Game published · ${result.message || `ZeroJams could not accept the entry for ${jam.title}.`}`);
    }
  }

  async function submitJam(jam,live,expected) {
    if(!jam)return live;
    await stillPublishable(expected);
    assertPublishTarget(jam,{...live.resume,root:expected,account:jam.account},jam);
    progress(`Submitting to ${jam.title}…`);
    let result;
    try {result=await gameJam.submit(jam,live,jamRequest(expected));}
    catch(error) {result={status:'pending',message:error.message};}
    await stillPublishable(expected);
    reportJamResult(jam,result,{opened:live.opened,verifiedUrl:live.url});
    return {...live,jamSubmission:result};
  }

  async function publish({open=false,recheckRoot,expectedRoot}={}) {
    if(disposed || publishing || isBusy())return;
    publishing=true;setBusy(true);controller=new AbortController();openingRequested=open;
    try {
      root=await project();
      if(disposed || controller.signal.aborted)return;
      if(typeof expectedRoot==='string' && root!==expectedRoot || recheckRoot && root!==recheckRoot)return;
      if(isSimulation(root)){progress('Simulation only — no publishing files, sign-in, upload or public website changed.');return {status:'simulated'};}
      if(vscode.workspace.isTrusted===false)throw new Error('Trust your own project before publishing its browser game.');
      const expected=root;
      const staged=workspaceState?.get('zero.webPublish.staging');
      const pending=resume || workspaceState?.get('zero.webPublish.pending');
      const recovering=Boolean(recheckRoot || (staged?.root===expected && staged.value?.phase!=='staging') ||
        (pending?.root===expected && pending.jamConsent));
      if(recovering)openingRequested=false;
      startProgress(['checking']);
      progress(recovering?'Checking saved publishing attempt…':open?'Checking latest app…':'Preparing publishing…');
      let target,jam,webOnly=false;
      if(gameJam) {
        await stillPublishable(expected);
        try {
          target=await gameJam.resolve(expected,jamRequest(expected));
          if(target.id)jam=target;
        }
        catch(error) {
          if(!['ZERO_JAM_STATUS_UNKNOWN','ZERO_JAM_DESTINATION_AMBIGUOUS'].includes(error.code) || !error.publishTarget)throw error;
          // A saved Jam dispatch must retain its original recovery/consent path.
          if(recovering && error.code==='ZERO_JAM_DESTINATION_AMBIGUOUS')throw error;
          target=error.publishTarget;
          await stillPublishable(expected);
          clearProgress();
          const ambiguous=error.code==='ZERO_JAM_DESTINATION_AMBIGUOUS';
          const choice=await vscode.window.showInformationMessage(ambiguous?'Choose a Game Jam before submitting.':'ZeroJams is unavailable.',{modal:true,
            detail:ambiguous ? 'This repository is linked to more than one Game Jam. You can publish to GitHub Pages without submitting to a jam. Review your jam projects before choosing Publish to Jam again.' :
              'You can publish to GitHub Pages now. If this is a jam project, use Publish to Jam when ZeroJams is available.'},'Publish to web only');
          if(choice!=='Publish to web only')return;
          webOnly=true;
        }
        await stillPublishable(expected);
      }
      if(jam && !recovering) {
        const recovered=await gameJam.recover(jam,jamRequest(expected));
        await stillPublishable(expected);
        if(recovered) {
          reportJamResult(jam,recovered,{recovered:true});
          return {status:recovered.status,jamSubmission:recovered};
        }
        if(!jam.submissionsOpen) {
          const closed=Date.parse(jam.submissionsCloseAt)<=Date.now();
          const message=closed ? `Submissions closed for ${jam.title}.` : `Submissions are not open for ${jam.title}.`;
          clearProgress();
          progress(message);
          const choice=await vscode.window.showInformationMessage(message,{modal:true,
            detail:'You can publish to GitHub Pages without submitting to this Game Jam. This does not change your jam entry.'},'Publish to web only');
          if(choice!=='Publish to web only')return {status:'action-required',message};
          await stillPublishable(expected);
          jam=undefined;
          webOnly=true;
        }
      }
      const reuse=open || Boolean(jam);
      // A resumed older deployment may finish while a newer local version exists.
      // Allow one fresh publication, then stop if editing continues.
      for(let attempt=0;attempt<(reuse?2:1);attempt++) {
        await stillPublishable(expected);
        const result=await publishOnce(expected,{reuse,recovering,target,jam,webOnly});
        if(recovering || !reuse || result?.status!=='live'){
          if(result?.status==='live')onReportSuccess(expected);
          if(recovering && result?.status==='live') {
            let outcome=result;
            if(jam) {
              if(canSubmitRecovered(jam,result,expected))outcome=await submitJam(jam,result,expected);
              else {
                progress('Your Pages site is live. Choose Publish to Jam to review and submit the build.');
                outcome={...result,jamSubmission:{status:'review-required'}};
              }
            }
            // Keep a recoverable run until its Jam handoff has been attempted.
            // The submission service persists its own receipt before sending.
            if(result.jamConsent)await workspaceState?.update('zero.webPublish.pending',undefined);
            return outcome;
          }
          return result;
        }
        let current=result;
        if(!result.alreadyCurrent) {
          let reviewed;
          try {reviewed=await publisher.review(expected,{signal:controller.signal});}
          catch(error) {if(error.code==='WEB_PUBLISH_UPLOAD_REQUIRED' && attempt===0)continue;throw error;}
          await stillPublishable(expected);
          if(reviewed.status!=='review'){await showAction(reviewed);return reviewed;}
          assertPublishTarget(target,reviewed,jam);
          if(jam&&!await approveJam(jam,expected,reviewed.publicUrl))return;
          current=await verifyAndOpen(reviewed,lastLive,expected,{target,jam,webOnly});
          if(current.status==='stale') {
            if(attempt===0)continue;
            throw Error(`Your app changed while publishing. Choose ${publishLabel(jam)} again for the latest version.`);
          }
          if(current.status!=='live'){await showAction(current);return current;}
        }
        if(!openingRequested || current.opened!==false)onReportSuccess(expected,openingRequested?'opening':undefined);
        return await submitJam(jam,current,expected);
      }
    } catch(error) {
      if (!(error instanceof BrowserToolingDecision) && !controller?.signal.aborted) onReportFailure(error,root);
      throw error;
    } finally {
      clearProgress();controller=undefined;publishing=false;setBusy(false);
      const dispatch=recheckDispatch, retry=recheckRequested || dispatch, checkRoot=root;
      recheckDispatch=false;recheckRequested=false;
      if(retry && checkRoot && !disposed)queueMicrotask(()=>{void publish({open,expectedRoot:checkRoot,recheckRoot:dispatch ? checkRoot : undefined}).catch(error=>{
        if(error instanceof BrowserToolingDecision && onToolingDecision)return onToolingDecision(error);
        progress(error.message);
      });});
    }
  }
  function routeReceipt(saved) {
    const {jamConsent,webOnly}=saved;
    return {...(jamConsent ? {jamConsent} : {}),...(webOnly ? {webOnly:true} : {})};
  }
  function canSubmitRecovered(jam,live,expected) {
    const consent=live.jamConsent;
    return jam.submissionsOpen && !jam.pending && consent &&
      consent.id===jam.id && consent.revision===jam.revision && consent.entryRevision===jam.entryRevision &&
      (consent.projectRevision??'')===(jam.projectRevision??'') &&
      isPublishTarget(jam,consent) && consent.root===expected &&
      consent.pagesUrl===live.url && consent.sha===live.sha &&
      typeof consent.dispatchTag==='string' && consent.dispatchTag===live.resume?.staging?.tag;
  }
  async function stopCheckingUnverifiedRun(result,expected,target,jam) {
    const key='zero.webPublish.pending';
    const saved=workspaceState?.get(key);
    if(!saved?.jamConsent || !target ||
       !isPublishTarget(target,saved.jamConsent) ||
       !isPublishTarget(target,{...saved.value,root:saved.root,account:saved.account}) ||
       !isPublishTarget(target,{...result.resume,root:expected,account:saved.account}) ||
       saved.value.runId!==result.resume?.runId || saved.value.sha!==result.resume?.sha ||
       saved.value.destination?.url!==result.resume?.destination?.url ||
       typeof saved.jamConsent.dispatchTag!=='string' || saved.jamConsent.dispatchTag!==result.resume?.staging?.tag ||
       saved.value.staging?.tag!==result.resume?.staging?.tag)return;
    const snapshot=JSON.stringify(saved);
    clearProgress();
    const choice=await vscode.window.showInformationMessage('Stop checking this publishing run?',{
      modal:true,
      detail:'GitHub finished this run, but Zero could not verify this version on Pages. Stopping clears the saved check in Zero. Your Pages site, GitHub run and jam submission are kept.'
    },'Stop checking this run');
    if(choice!=='Stop checking this run')return;
    await stillPublishable(expected);
    const current=await gameJam.resolve(expected,jamRequest(expected));
    assertPublishTarget(target,current,jam);
    await stillPublishable(expected);
    if(JSON.stringify(workspaceState.get(key))!==snapshot) {
      resume=undefined;
      throw Error('The saved publishing run changed. Check it again.');
    }
    await workspaceState.update(key,undefined);
    resume=undefined;
    progress(`Stopped checking this run. Choose ${publishLabel(jam)} to start a new publish.`);
    return {status:'reset'};
  }
  async function publishOnce(expected,{reuse=false,recovering=false,target,jam,webOnly=false}={}) {
    const listOnHub=listPublication&&!jam&&!webOnly;
    let result,approvedAccount,savedRoute={};
    const staged=workspaceState?.get('zero.webPublish.staging');
    resume=resume || workspaceState?.get('zero.webPublish.pending');
    if((staged && staged.root!==expected)||(resume && resume.root!==expected)) {
      clearProgress();
      const message='Reopen the project with the saved publishing attempt to check it before starting another publish in this window.';
      progress(message);
      return {status:'action-required',message};
    }
    if(resume?.root===expected) {
      startProgress(['deploying','verifying']);progress('Checking saved publishing run…');
      approvedAccount=resume.account;
      savedRoute=routeReceipt(resume);
      if(staged?.value?.staging?.tag && staged.value.staging.tag===resume.value?.staging?.tag) {
        // A crash between storing the run and clearing staging leaves both receipts.
        await workspaceState?.update('zero.webPublish.staging',undefined);
      }
      try {
        // Legacy Pages receipts lack a repository ID. The publisher can
        // inspect one during recovery, while reuse still requires exact identity.
        if(resume.value?.repositoryId!==undefined || !recovering)
          assertPublishTarget(target,{...resume.value,root:expected,account:approvedAccount},jam);
        result=publisher.restore ? await publisher.restore(expected,resume.value,{signal:controller.signal,onStage:stage,onProgress:progress}) : await publisher.check(resume.value,{signal:controller.signal,onProgress:progress,onStage:stage});
      }
      catch(error) {
        if(error.code!=='WEB_PUBLISH_REPOSITORY_CHANGED')throw error;
        await stillCurrent(expected);
        clearProgress();
        const chosen=await vscode.window.showInformationMessage('The saved publishing run belongs to a different repository.',{modal:true,detail:'The old run, website and verified link are kept.'},'Forget saved run');
        await stillCurrent(expected);
        if(chosen==='Forget saved run') {
          resume=undefined;await workspaceState?.update('zero.webPublish.pending',undefined);
          progress(jam ? 'Saved run cleared. Choose Publish to Jam to review this repository.' : 'Saved run cleared. Choose Publish app to review this repository.');
          return {status:'reset'};
        }
        return {status:'action-required',message:'Reconnect the previous repository or forget its saved publishing run.'};
      }
    }
    else if(staged?.root===expected) {
      startProgress(['deploying','verifying']);progress('Checking saved publishing attempt…');
      approvedAccount=staged.value?.account;
      savedRoute=routeReceipt(staged);
      if(target && staged.value?.repositoryId!==undefined &&
         !isPublishTarget(target,{...staged.value,root:expected})) {
        const message='The saved publishing attempt belongs to a different repository.';
        const {page}=parseRepositoryUrl(staged.value.repository);
        result={status:'dispatch-uncertain',message,action:{message,url:page+'/actions'}};
      } else {
        result=await publisher.restoreDispatch(expected,staged.value,{signal:controller.signal,onStage:stage,onProgress:progress,
          onPending:value=>trackDispatch(expected,value,approvedAccount,savedRoute)});
      }
      await stillPublishable(expected);
      if(result.status==='staging-cleared') {
        await workspaceState?.update('zero.webPublish.staging',undefined);
        result=undefined;
      }
    }
    if(!result) {
      if(recovering)return;
      await saveBuildDocuments(expected);
      await stillPublishable(expected);
      const previous=lastLive || workspaceState?.get('zero.webPublish.lastLive');
      const reusable=previous && (!target || isPublishTarget(target,{...previous.resume,root:previous.root,account:previous.account}));
      if(reuse && reusable && publisher.verifyUnchanged) {
        if(jam && !await approveJam(jam,expected,previous.url))return;
        const current=await verifyAndOpen(undefined,previous,expected,{fast:true,retryListing:true,target,jam,webOnly});
        if(current.status==='live')return {...current,alreadyCurrent:true};
        if(current.status!=='stale'){await showAction(current);return current;}
      }
      await beforeBuildReview(expected,{signal:controller.signal,open:openingRequested});
      await stillPublishable(expected);
      let review;
      try {review=await publisher.review(expected,{signal:controller.signal});}
      catch(error) {
        if(error.code!=='WEB_PUBLISH_UPLOAD_REQUIRED')throw error;
        return sourceUploadRequired(jam);
      }
      await stillCurrent(expected);
      if(review.status!=='review'){await showAction(review);return review;}
      assertPublishTarget(target,review,jam);
      if(jam && !await approveJam(jam,expected,review.publicUrl))return;
      if(reuse) {
        startProgress(['verifying']);
        progress('Checking published app…');
        result=await verifyAndOpen(review,reusable ? previous : undefined,expected,{retryListing:true,target,jam,webOnly});
        if(result.status==='stale')result=undefined;
        else {
          if(result.status==='live')return {...result,alreadyCurrent:true};
          if(result.status==='pending')progress(`The published app could not be verified. Try ${publishLabel(jam)} again.`,result.message);
          else await showAction(result);
          return result;
        }
      }
      if(!result) {
        const consent=workspaceState?.get('zero.webPublish.approval');
        const consentMatches=consent?.root===expected && consent.account===review.account &&
          consent.repository===review.repository && consent.url===review.publicUrl &&
          (!target || consent.repositoryId===target.repositoryId);
        const sameDestination=consentMatches || (reusable && previous.root===expected && previous.account===review.account &&
          previous.resume?.repository===review.repository && previous.url===review.publicUrl);
        const listingNotice=consentMatches && consent.listingNotice===true;
        if(!jam && (!sameDestination || listOnHub && !listingNotice)) {
          clearProgress();
          const notice = listOnHub ? ' This may replace your currently published app.' : '';
          const setup=review.setup ? `\nZero will sync its publishing files to ${review.repository}.` : '';
          const chosen=await vscode.window.showInformationMessage('Publish app?',{modal:true,detail:`Your app and its assets will be public.${notice}\n${review.publicUrl || (review.repository + ' → GitHub Pages')}${setup}`},'Publish app');
          if(chosen!=='Publish app')return;
          await stillCurrent(expected);
          await workspaceState?.update('zero.webPublish.approval',{root:expected,account:review.account,repository:review.repository,
            url:review.publicUrl,...(target ? {repositoryId:target.repositoryId} : {}),...(listOnHub ? {listingNotice:true} : {})});
        }
        startProgress(['preparing','building','uploading','deploying','verifying']);
        progress('Preparing publishing…');
        const approvedDestination=review;
        const assertDestination=()=>{
          if(review.repository!==approvedDestination.repository || review.account!==approvedDestination.account || review.publicUrl!==approvedDestination.publicUrl || review.needsPages!==approvedDestination.needsPages)throw new Error(`The publishing account or destination changed. Choose ${publishLabel(jam)} again to review it.`);
          assertPublishTarget(target,review,jam);
        };
        await stillCurrent(expected);
        if(review.setup || review.upgrade) {
          const updating=Boolean(review.upgrade);
          if(updating) {
            clearProgress();
            const chosen=await vscode.window.showInformationMessage('Update publishing files?',{modal:true,detail:`Zero will commit and sync these files to ${review.repository}.\n${review.upgrade.files.join('\n')}\nThe previous version stays in Git history.\n${review.publicUrl || review.repository}`},'Update publishing files');
            if(chosen!=='Update publishing files')return;
            await stillCurrent(expected);
            startProgress(['preparing','building','uploading','deploying','verifying']);
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
          if(!uploadChanges){await showAction({...result,action:{message:'Commit and sync the publishing files on main, then choose Publish & open app again.'}});return result;}
          const uploaded=await uploadForPublish(expected,review,result.uploadPlan,target,jam);
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
        savedRoute=webOnly ? {webOnly:true} : {};
        const bindDispatch=value=>{
          const dispatchTag=value?.staging?.tag;
          if(jam && dispatchTag) savedRoute={jamConsent:{
            root:expected,account:jam.account,repository:jam.repository,repositoryId:jam.repositoryId,
            id:jam.id,revision:jam.revision,entryRevision:jam.entryRevision,
            ...(jam.projectRevision!==undefined?{projectRevision:jam.projectRevision}:{}),
            pagesUrl:review.publicUrl,sha:review.sha,dispatchTag
          }};
          return savedRoute;
        };
        result=await publisher.publish(review,{signal:controller.signal,onProgress:progress,onStage:stage,
          onStaging:value=>workspaceState?.update('zero.webPublish.staging',value?{root:expected,value,...bindDispatch(value)}:undefined),
          onPending:value=>trackDispatch(expected,value,approvedAccount,bindDispatch(value))});
      }
    }
    const pauseForPublicMarker=Boolean(recovering && savedRoute.jamConsent && target);
    result=await waitForDeployment(result,expected,approvedAccount,savedRoute,pauseForPublicMarker);
    await stillCurrent(expected);
    if(result.status==='live') {
      assertPublishTarget(target,{...result.resume,root:expected,account:approvedAccount},jam);
      if(savedRoute.jamConsent)result={...result,jamConsent:savedRoute.jamConsent};
      resume=undefined;
      const consent = workspaceState?.get('zero.webPublish.approval');
      const listingPending = !!listOnHub && !savedRoute.webOnly && !savedRoute.jamConsent && consent?.listingNotice === true && consent.root === expected &&
        consent.account === approvedAccount && consent.repository === result.resume?.repository && consent.url === result.url &&
        (!target || consent.repositoryId===target.repositoryId);
      lastLive={root:expected,url:result.url,sha:result.sha,resume:result.resume,account:approvedAccount,
        ...(listingPending ? {listingPending:true} : {})};
      await workspaceState?.update('zero.webPublish.lastLive',lastLive);
      if(!recovering || !savedRoute.jamConsent)await workspaceState?.update('zero.webPublish.pending',undefined);
      if (listingPending) await updateHubListing(lastLive, expected);
      if(openingRequested){stage('verifying');progress('Checking live app…');}
      else {
        clearProgress();
        progress(lastLive.listingMessage ? `App published · ${lastLive.listingMessage}` : 'App published',`Your playable app is live: ${result.url}`);
      }
    } else if(result.status==='pending') {
      if(pauseForPublicMarker && result.pendingReason==='public-marker') {
        const stopped=await stopCheckingUnverifiedRun(result,expected,target,jam);
        if(stopped)return stopped;
      }
      const status=result.pendingReason==='public-marker' ? 'Zero could not verify this run on Pages.' : 'Publishing is still running.';
      progress(`${status} Choose ${publishLabel(jam)} again to recheck this run.`);
    }
    else if(result.status==='dispatch-uncertain')return await showDispatchAction(result,expected) || result;
    else {
      if(result.reportCode==='WEB_PUBLISH_DEPLOYMENT_FAILED') {
        onReportFailure(Object.assign(new Error(),{code:result.reportCode}),expected);
      }
      resume=undefined;await workspaceState?.update('zero.webPublish.pending',undefined);await showAction(result,{allowRecheck:!recovering && result.status!=='failed'});
    }
    return result;
  }
  // Rendering reads only a previously verified receipt. It never infers a URL
  // from the current repository or probes GitHub from a webview refresh.
  function hasPublishedApp({root:expected,repository,account}={}) {
    if(disposed || typeof expected!=='string' || !path.isAbsolute(expected) || typeof repository!=='string' || typeof account!=='string')return false;
    const saved=lastLive || workspaceState?.get('zero.webPublish.lastLive');
    if(!saved || saved.root!==expected || saved.account!==account || !/^[1-9]\d*$/.test(account) || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || saved.resume?.repository!==repository || !/^[a-f0-9]{40}$/.test(saved.sha || '') || saved.resume?.sha!==saved.sha || !Number.isSafeInteger(saved.resume?.runId) || saved.resume.runId<1)return false;
    if(typeof saved.url!=='string')return false;
    try {const url=new URL(saved.url);return url.protocol==='https:' && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;}catch{return false;}
  }
  const publishAndOpen=expectedRoot=>publish({open:true,expectedRoot});
  async function viewPublishedApp() {
    if(disposed || publishing || isBusy())return;
    publishing=true;setBusy(true);controller=new AbortController();openingRequested=false;
    try {
      root=await project();
      const expected=root;
      await stillCurrent(expected);
      if(isSimulation(expected)){progress('Simulation only — no published app was opened.');return;}
      const saved=lastLive || workspaceState?.get('zero.webPublish.lastLive');
      if(!hasPublishedApp({root:expected,repository:connectedRepository(),account:saved?.account}) ||
         !safePagesUrl(saved.url,saved.resume?.destination?.cname) ||
         (saved.resume?.destination && saved.resume.destination.url!==saved.url))throw Error('Publish this project before viewing its published app.');
      startProgress(['opening']);progress('Opening in browser…');
      // The saved URL is data from a successful publication. No source checks,
      // authentication, remote verification, saving or publishing precede opening.
      assertProjectNow(expected);
      if(disposed || controller.signal.aborted || isSimulation(expected))throw Error('Opening the published app was cancelled.');
      if(connectedRepository()!==saved.resume.repository)throw Error('The connected repository changed. Choose View published app again.');
      const opened=await vscode.env.openExternal(vscode.Uri.parse(saved.url));
      await stillCurrent(expected);clearProgress();
      progress(opened===false?'The browser could not be opened. See Zero Output for the published app link.':'Published app opened',`Published site: ${saved.url}`);
      return {status:opened===false?'failed':'opened',url:saved.url,opened:opened!==false};
    }finally{clearProgress();controller=undefined;publishing=false;setBusy(false);}
  }
  async function publishedLink(open) {
    if(disposed || publishing || isBusy())return;
    publishing=true;setBusy(true);controller=new AbortController();openingRequested=open;
    try {
      root=await project();
      if(disposed || controller.signal.aborted)return;
      if(isSimulation(root)){progress(open ? 'Simulation only — no public page was checked or opened.' : 'Simulation only — no public link was checked or copied.');return;}
      const saved=lastLive || workspaceState?.get('zero.webPublish.lastLive');
      if(!saved || saved.root!==root)throw new Error(open?'Publish this app before opening its published version.':'Publish this game before copying its playable link.');
      const expected=root;
      startProgress(['verifying']);progress('Checking published app…');
      const ticket=await authentication.capture();
      if(!hasPublishedApp({root:expected,repository:saved.resume?.repository,account:ticket.session.accountId}))throw Error('Publish this app with the connected GitHub account before opening its published version.');
      const verified=await publisher.verifyLink(expected,saved,{signal:controller.signal});
      await stillCurrent(expected);
      if(verified.status!=='live'){await showAction(verified);return verified;}
      if(open){
        stage('opening');progress('Opening in browser…');
        assertPublishCurrentNow(expected);authentication.assertCurrentNow(ticket);
        const opened=await vscode.env.openExternal(vscode.Uri.parse(verified.url));
        await stillCurrent(expected);clearProgress();
        progress(opened===false?'The browser could not be opened. See Zero Output for the published app link.':'Published app opened',`Your published app: ${verified.url}`);
        return {...verified,opened:opened!==false};
      }
      assertPublishCurrentNow(expected);authentication.assertCurrentNow(ticket);
      await vscode.env.clipboard.writeText(verified.url);clearProgress();progress('Playable link copied','Playable game link copied.');
      return verified;
    } finally {clearProgress();controller=undefined;publishing=false;setBusy(false);if(recheckRequested && !disposed){recheckRequested=false;queueMicrotask(()=>{void publishedLink(open).catch(error=>progress(error.message));});}}
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
        // Never attach a remembered link when its repository or current
        // availability cannot be verified; Share then asks to publish again.
        await stillCurrent(expected);
        if(error.name==='AbortError')throw error;
        progress('The saved playable link could not be verified. Publish app to share this version.');
        return;
      }
      await stillCurrent(expected);
      if(isSimulation(root) || checked.status!=='live' || checked.sha!==commit)return;
      return {provider:'github-pages',url:checked.url,commit,runId:checked.resume.runId};
    } finally {controller=undefined;publishing=false;setBusy(false);}
  }
  return {publish,publishAndOpen,hasPublishedApp,verifiedPublication,commands:{'zero.publishWeb':expectedRoot=>publish({expectedRoot}),'zero.publishAndOpenWeb':publishAndOpen,'zero.copyPublishedWebLink':()=>publishedLink(false),'zero.openPublishedWeb':()=>publishedLink(true),'zero.viewPublishedWeb':viewPublishedApp},disposables:[{dispose(){disposed=true;controller?.abort();clearProgress();}}]};
}
module.exports={createWebPublishCommands};
