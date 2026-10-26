'use strict';
const {appSessions}=require('./fixtures/app-sessions');
const {textInputs} = require('./fixtures/text-input');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const github = require('../src/github');
const workflow = require('../src/workflow');
const disposable = () => ({dispose(){}});
const waitFor = async (condition, message) => {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, message || 'Expected asynchronous UI state');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

test('local branches, explicit Sync and merges stay serialized and recover conflicts through native Git', async t => {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-workflow-ui-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');
  const original = {git:core.git,resolve:core.resolveProject,assert:core.assertRepositoryRoot,prepare:github.prepareUpload,...workflow};
  t.after(()=>{core.git=original.git;core.resolveProject=original.resolve;core.assertRepositoryRoot=original.assert;github.prepareUpload=original.prepare;for(const key of Object.keys(workflow))workflow[key]=original[key];});
  let projectResolves=0;
  core.resolveProject=(...args)=>{projectResolves++;return original.resolve(...args);};
  let branch='main',remote='https://github.com/student/app.git',mode='simulation',session={id:'session',account:{id:'1',label:'student'},accessToken:'NEVER_RENDER_TOKEN'},authEvent,provider,publishedState;
  let accessFailure,repositoryId=12,installationId=99;const accesses=[];
  let saved=0,authCalls=0,prepared=0,uploadSnapshots=0,transportDispatches=0,synced=0,syncError,syncUpdates=false,startGate,syncGate,executed=0,deleted=0,input,choice,prepareGate,pickGate,warningGate,finishError,cleanupError,nativeScm=true;
  const transportCalls=[];
  const commands=new Map(),picks=[],reviews=[],warnings=[],errors=[],notices=[],dispatch=[],deletions=[],logs=[],metadata={},progressRuns=[];
  core.assertRepositoryRoot=async()=>root;
  core.git=async(_,args)=>{if(args[0]==='remote'){if(!remote)throw new Error('No origin');return remote;};if(args[0]==='symbolic-ref')return branch;throw new Error('Unexpected Git mutation');};
  github.prepareUpload=async()=>{uploadSnapshots++;return {remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,changes:[],summary:'No changes'};};
  const plan = () => ({root,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,head:'f'.repeat(40),mainHead:'a'.repeat(40),remoteMainHead:'a'.repeat(40),summary:'Reviewed change',changedPaths:['Main.java']});
  workflow.prepareStart=async()=>{prepared++;if(startGate)await startGate;return plan();};workflow.prepareFinish=async()=>{prepared++;const captured=plan();if(prepareGate)await prepareGate;return captured;};
  workflow.startPrepared=async(_,options)=>{await options.beforeMutation();executed++;branch='add-score';return {branch,head:'f'.repeat(40)};};
  workflow.prepareSync=async(_,options)=>{synced++;options.onProgress('Reading main on GitHub…');if(syncGate)await syncGate;await options.networkRun(root,['ls-remote','--heads',plan().remote,'refs/heads/main']);return plan();};
  workflow.syncPrepared=async(_,options)=>{await options.beforeNetwork();if(syncError)throw syncError;if(syncUpdates)await options.networkRun(root,['fetch','--no-tags','--no-recurse-submodules','--no-write-fetch-head',plan().remote,plan().remoteMainHead]);return {updated:syncUpdates,branch,head:'f'.repeat(40)};};
  workflow.finishPrepared=async(_,options)=>{const beforeAccess=accesses.length;await options.beforeNetwork();assert.equal(accesses.length,beforeAccess,'The early session guard must not duplicate transport repository requests');if(finishError){executed++;throw finishError;}await options.networkRun(root,['push',plan().remote,`${plan().head}:refs/heads/main`]);await options.networkRun(root,['ls-remote','--heads',plan().remote,'refs/heads/main']);executed++;branch='main';return {finished:true,branch,finishedBranch:'add-score',head:'f'.repeat(40)};};
  workflow.deleteFinishedBranch=async(...args)=>{deletions.push(args);if(cleanupError)throw cleanupError;deleted++;};
  const vscode={
    ProgressLocation:{Notification:15},
    authentication:{getSession:async(provider,scopes)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);authCalls++;return session;},onDidChangeSessions:fn=>{authEvent=fn;return disposable();},registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},
    workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?(mode??fallback):fallback}),saveAll:async()=>{saved++;return true;},createFileSystemWatcher:pattern=>pattern==='**/.git/{HEAD,config}'?{onDidCreate:fn=>{metadata.create=fn;return disposable();},onDidChange:fn=>{metadata.change=fn;return disposable();},onDidDelete:fn=>{metadata.delete=fn;return disposable();},dispose(){}}:{onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}},onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{withProgress:async(options,work)=>{const run={options,messages:[],active:true};progressRuns.push(run);try{return await work({report:({message})=>run.messages.push(message)});}finally{run.active=false;}},createOutputChannel:()=>({appendLine(text){logs.push(text);},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,
      showQuickPick:async(items,options)=>{picks.push({items,options});if(pickGate)await pickGate;return choice===undefined?undefined:items.find(item=>item.action===choice || item.command===choice);},showInputBox:async()=>input,
      showWarningMessage:async text=>{warnings.push(text);if(warningGate)await warningGate;},
      showInformationMessage:async(text,options)=>{notices.push(text);if(options?.modal){reviews.push({text,options});assert.fail('Branch creation, merge and finished-branch cleanup must not confirm');}},showErrorMessage:async text=>{errors.push(text);}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async id=>{dispatch.push(id);},getCommands:async()=>nativeScm?['workbench.view.scm']:[]},
    env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){if(id==='./git-tracking')return {updateRemoteTracking:async()=>({updated:true})};if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();transportDispatches++;transportCalls.push(args);return args[0]==='ls-remote'?`${plan().head}\trefs/heads/main`:'';}};return id==='vscode'?textInputs(vscode):oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  const subscriptions=[];t.after(()=>subscriptions.forEach(value=>value.dispose()));extension.activate({subscriptions,workspaceState:{get:key=>key==='zero.webPublish.lastLive'?publishedState:true}},{provider:appSessions(vscode,{dispose(){},async removeSession(){session=undefined;}}),repositories:{async checkSetup(){return {};},async access(url,{ticket,permissions}){accesses.push({url,ticket,permissions});assert.equal(url,'https://github.com/student/app');assert.deepEqual(permissions,{contents:'write'});assert.equal(ticket.session.accountId,'1');assert.equal(ticket.session.accessToken,'NEVER_RENDER_TOKEN');if(accessFailure)throw accessFailure;return {ticket,repository:{id:repositoryId},installation:{id:installationId}};}}});
  const webview={html:'',onDidReceiveMessage:disposable};const candidate={webview,onDidDispose:disposable};provider.resolveWebviewView(candidate);await waitFor(()=>webview.html.includes(`Current branch: ${branch}`));
  assert.match(webview.html,/id="files-menu-button"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="files-menu"/);
  assert.match(webview.html,/id="files-menu"[^>]*role="menu"[^>]*hidden/);
  assert.equal(commands.has('zero.fileActions'),false,'Files opens locally instead of a native picker');
  for (const command of ['newClass','newFile','newFolder']) {
    assert.equal(typeof commands.get(`zero.${command}`),'function');
    assert.ok(webview.html.includes(`data-command="zero.${command}"`));
  }
  input='Player';await commands.get('zero.newClass')();
  assert.equal(await fs.readFile(path.join(root,'src/main/java/Player.java'),'utf8'),'public class Player {\n\n}\n');
  assert.ok(dispatch.includes('vscode.open'));choice=undefined;input=undefined;
  assert.doesNotMatch(webview.html,/data-command="zero.recovery"|data-command="zero.fileActions"/);
  assert.match(webview.html,/title="Current branch: main"/);assert.match(webview.html,/Commit &amp; push/);assert.doesNotMatch(webview.html,/data-command="zero.finishChange"|NEVER_RENDER_TOKEN/);
  for (const event of ['change','delete','create']) {
    branch=`native-${event}`;
    metadata[event]({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes(`Current branch: ${branch}`), 'Native HEAD update should render');
    assert.ok(webview.html.includes(`Current branch: ${branch}`),'Native HEAD events refresh the branch without a Zero command');
  }
  const resolvesBeforeOutside=projectResolves;
  branch='outside-root';metadata.change({fsPath:path.join(root,'other','.git','HEAD')});
  // Resolution starts synchronously when a refresh is requested.
  assert.equal(projectResolves,resolvesBeforeOutside,'Other project metadata must not start a refresh');
  assert.ok(webview.html.includes('Current branch: native-create'),'Git metadata from another project is ignored');
  branch='main';metadata.change({fsPath:path.join(root,'.git','config')});await waitFor(()=>webview.html.includes('Current branch: main'), 'Origin configuration update should render');
  assert.match(webview.html,/Current branch: main/,'Origin configuration changes refresh the repository and branch');
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['start']);
  await commands.get('zero.chooseRepository')();assert.ok(picks.at(-1).items.some(item=>item.action==='sync'&&item.label==='Sync from GitHub'));
  let releaseWarning;warningGate=new Promise(resolve=>{releaseWarning=resolve;});const authBefore=authCalls;
  await commands.get('zero.startChange')();await commands.get('zero.finishChange')();await commands.get('zero.syncProject')();await commands.get('zero.uploadToGitHub')();
  assert.equal(saved,0);assert.equal(prepared,0);assert.equal(executed,0);assert.equal(authCalls,authBefore);assert.equal(accesses.length,0);assert.equal(synced,0);assert.match(warnings[0],/nothing changed/);
  assert.doesNotMatch(webview.html,/data-command="zero.startChange"[^>]* disabled/);releaseWarning();warningGate=undefined;
  mode=undefined;input=undefined;await commands.get('zero.startChange')();assert.equal(saved,0);assert.equal(prepared,0);
  assert.equal(progressRuns.length,0,'Simulation and cancelling the name prompt start no progress or network work');
  input='add-score';let releaseStart;startGate=new Promise(resolve=>{releaseStart=resolve;});const authBeforeStart=authCalls;
  const starting=commands.get('zero.startChange')();await waitFor(()=>prepared===1);
  const activeProgress=progressRuns.at(-1);assert.equal(activeProgress.active,true);assert.deepEqual(activeProgress.options,{location:15,title:'Creating branch add-score',cancellable:false});
  assert.match(webview.html,/Checking|Creating/);assert.match(webview.html,/data-command="zero.chooseRepository"[^>]* disabled/);
  await commands.get('zero.startChange')();assert.equal(progressRuns.length,1,'A repeat click cannot start another operation');
  releaseStart();await starting;startGate=undefined;assert.equal(activeProgress.active,false);assert.equal(prepared,1);assert.equal(executed,1);assert.equal(accesses.length,0);assert.equal(authCalls,authBeforeStart);assert.equal(uploadSnapshots,0,'Local New branch never prepares an upload snapshot');assert.equal(transportDispatches,0,'Local New branch never dispatches GitHub transport');assert.equal(reviews.length,0,'Naming a branch needs no additional confirmation');assert.doesNotMatch(webview.html,/Simulation — nothing will be uploaded/);assert.match(webview.html,/add-score<\/span>/);
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['finish']);
  let releasePrepare;prepareGate=new Promise(resolve=>{releasePrepare=resolve;});const preparedBeforeFinish=prepared;const pending=commands.get('zero.finishChange')();await waitFor(()=>prepared>preparedBeforeFinish, 'Finish preparation should start directly');
  const before={saved,prepared,authCalls};for(const id of ['zero.startChange','zero.finishChange','zero.syncProject','zero.uploadToGitHub','zero.githubAccount','zero.chooseRepository','zero.chooseBranch','zero.connectRepository','zero.signInToGitHub'])await commands.get(id)();
  assert.deepEqual({saved,prepared,authCalls},before);assert.match(webview.html,/data-command="zero.finishChange"[^>]* disabled/);
  session={...session,id:'changed'};authEvent({provider:{id:'zero-github'}});releasePrepare();await pending;prepareGate=undefined;
  assert.equal(executed,1,'Changed account cannot execute the reviewed finish');assert.equal(deleted,0);assert.match(errors.at(-1),/sign-in changed/);
  finishError=Object.assign(new Error('Merge conflicts need your attention'),{conflict:true});await commands.get('zero.finishChange')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.equal(deleted,0);assert.match(notices.join('\n'),/Stage the resolved files/);assert.match(webview.html,/add-score<\/span>/);
  nativeScm=false;await commands.get('zero.finishChange')();assert.match(notices.at(-1),/Open Source Control/);assert.equal(deleted,0);
  finishError=undefined;const accessBeforeFinish=accesses.length,transportBeforeFinish=transportDispatches;await commands.get('zero.finishChange')();assert.equal(accesses.length,accessBeforeFinish+1,'Merge checks repository access once at push');assert.equal(transportDispatches,transportBeforeFinish+2,'Merge dispatches push and confirmation');assert.equal(deleted,1);assert.equal(reviews.length,0,'Successful merge deletes the local branch without a popup');assert.match(webview.html,/main<\/span>/);assert.deepEqual(deletions[0].slice(0,3),[root,'add-score','f'.repeat(40)]);assert.equal(typeof deletions[0][3].beforeMutation,'function');assert.match(webview.html,/>Merged to main<\/p>/);assert.match(logs.at(-1),/Finished local branch deleted/);assert.ok(!notices.some(text=>/Started add-score|Merged change and pushed main|Main updates added/.test(text)),'Successful Git outcomes never toast');
  // A guarded cleanup refusal must preserve the successful merge outcome.
  branch='add-score';cleanupError=new Error('The finished branch changed; keep its new work.');const errorsBeforeCleanup=errors.length;
  await commands.get('zero.finishChange')();assert.equal(deleted,1);assert.equal(deletions.length,2);assert.equal(errors.length,errorsBeforeCleanup);assert.equal(reviews.length,0);assert.match(warnings.at(-1),/Merged to main.*local branch kept; see Output/);assert.match(logs.at(-1),/finished branch changed/);assert.equal(branch,'main');cleanupError=undefined;
  publishedState={root,account:'1',resume:{repository:'https://github.com/student/app'}};provider.resolveWebviewView(candidate);
  assert.match(webview.html,/data-command="zero.openPublishedWeb"/);assert.match(webview.html,/data-command="zero.copyPublishedWebLink"/);
  session={...session,account:{id:'1',label:'renamed-student'}};authEvent({provider:{id:'zero-github'}});await waitFor(()=>webview.html.includes('data-command="zero.openPublishedWeb"'));assert.match(webview.html,/data-command="zero.openPublishedWeb"/,'Numeric identity survives username changes');assert.doesNotMatch(webview.html,/renamed-student/,'Account refresh does not restore the removed username row');
  session={...session,account:{id:'2',label:'renamed-student'}};authEvent({provider:{id:'zero-github'}});await waitFor(()=>!webview.html.includes('data-command="zero.openPublishedWeb"'));
  session={...session,account:{id:'1',label:'student'}};authEvent({provider:{id:'zero-github'}});await waitFor(()=>webview.html.includes('data-command="zero.openPublishedWeb"'));
  for(const changed of [{root:'/other'}, {account:'other'}, {resume:{repository:'https://github.com/student/other'}}]) {
    const saved=publishedState;publishedState={...saved,...changed};provider.resolveWebviewView(candidate);assert.doesNotMatch(webview.html,/data-command="zero.openPublishedWeb"/);publishedState=saved;
  }
  mode='simulation';provider.resolveWebviewView(candidate);assert.doesNotMatch(webview.html,/data-command="zero.copyPublishedWebLink"/);mode='live';publishedState=undefined;
  branch='<branch "x">';provider.resolveWebviewView(candidate);await waitFor(()=>webview.html.includes('&lt;branch &quot;x&quot;&gt;'));assert.match(webview.html,/&lt;branch &quot;x&quot;&gt;/);assert.doesNotMatch(webview.html,/<branch|NEVER_RENDER_TOKEN/);
  branch='main';choice='start';let releasePick;pickGate=new Promise(resolve=>{releasePick=resolve;});const menu=commands.get('zero.chooseBranch')();await waitFor(()=>picks.at(-1).options.title.includes('main'), 'Main branch menu should open');
  const beforeMenu=executed;await commands.get('zero.startChange')();assert.equal(executed,beforeMenu);branch='changed-elsewhere';releasePick();await menu;pickGate=undefined;assert.equal(executed,beforeMenu,'A changed branch invalidates the menu selection');
  // Local work remains available with no session, origin or selected-repository access.
  branch='main';remote='';session=undefined;authEvent({provider:{id:'zero-github'}});
  await waitFor(()=>!webview.html.includes('data-command="zero.uploadToGitHub"'));
  assert.match(webview.html,/data-command="zero.chooseRepository"/);
  choice=undefined;await commands.get('zero.chooseRepository')();assert.ok(picks.at(-1).items.some(item=>item.action==='start'));assert.ok(!picks.at(-1).items.some(item=>item.action==='sync'),'Signed-out local menus omit network sync');
  choice=undefined;const offlineBefore={authCalls,accesses:accesses.length,uploadSnapshots,transportDispatches};
  repositoryId++;installationId++;await commands.get('zero.startChange')();
  assert.equal(branch,'add-score');assert.deepEqual({authCalls,accesses:accesses.length,uploadSnapshots,transportDispatches},offlineBefore);
  remote='https://github.com/student/app.git';session={id:'restored',account:{id:'1',label:'student'},accessToken:'NEVER_RENDER_TOKEN'};authEvent({provider:{id:'zero-github'}});
  await new Promise(resolve=>setImmediate(resolve));
  for(const invalidation of ['simulation','trust']) {
    branch='main';let releaseGuard;startGate=new Promise(resolve=>{releaseGuard=resolve;});
    const preparedBefore=prepared,executedBefore=executed,authBefore=authCalls;
    const pendingStart=commands.get('zero.startChange')();await waitFor(()=>prepared>preparedBefore);
    if(invalidation==='simulation')mode='simulation';else vscode.workspace.isTrusted=false;
    releaseGuard();await pendingStart;startGate=undefined;mode='live';vscode.workspace.isTrusted=true;
    assert.equal(executed,executedBefore,'A local branch must recheck live mode and trust at mutation');assert.equal(authCalls,authBefore);assert.match(errors.at(-1),/disabled|Trust|trust/i);
  }
  branch='add-score';input='add-score';accessFailure=new Error('This repository is not available to Zero. Add it to Zero’s selected repositories on GitHub.');
  const beforeDenied={executed,deleted,transportDispatches};await commands.get('zero.finishChange')();
  assert.deepEqual({executed,deleted,transportDispatches},beforeDenied,'Denied repository access stops the first actual push');assert.match(errors.at(-1),/selected repositories/);
  assert.equal(progressRuns.at(-1).active,false,'Failure closes native progress');assert.doesNotMatch(webview.html,/data-command="zero.chooseRepository"[^>]* disabled/,'Failure releases busy controls');
  accessFailure=undefined;
  const uploadSnapshotsBeforeSync=uploadSnapshots,dispatchesBeforeSync=transportDispatches,accessesBeforeSync=accesses.length;
  syncUpdates=true;await commands.get('zero.syncProject')();assert.equal(synced,1);assert.equal(uploadSnapshots,uploadSnapshotsBeforeSync,'Sync never prepares an upload');assert.equal(transportDispatches,dispatchesBeforeSync+2);assert.equal(accesses.length,accessesBeforeSync+1,'Read and pinned fetch share one access check');assert.deepEqual(transportCalls.at(-2),['ls-remote','--heads',remote,'refs/heads/main']);assert.deepEqual(transportCalls.at(-1),['fetch','--no-tags','--no-recurse-submodules','--no-write-fetch-head',remote,'a'.repeat(40)]);assert.equal(branch,'add-score');assert.match(webview.html,/Synced from GitHub · run app/);
  syncError=Object.assign(new Error('Merge conflicts need your attention'),{conflict:true});nativeScm=true;await commands.get('zero.syncProject')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.match(notices.at(-1),/Run your app/);syncError=undefined;
  syncUpdates=false;await commands.get('zero.syncProject')();assert.match(webview.html,/Already up to date with GitHub main/);
  let releaseSync;syncGate=new Promise(resolve=>{releaseSync=resolve;});const pendingSync=commands.get('zero.syncProject')();await waitFor(()=>synced===4);assert.deepEqual(progressRuns.at(-1).options,{location:15,title:'Syncing from GitHub',cancellable:false});assert.equal(progressRuns.at(-1).active,true);assert.match(webview.html,/Reading main on GitHub…/);
  const syncBusyBefore={saved,prepared,synced};for(const id of ['zero.startChange','zero.finishChange','zero.syncProject','zero.uploadToGitHub','zero.chooseBranch'])await commands.get(id)();assert.deepEqual({saved,prepared,synced},syncBusyBefore);releaseSync();await pendingSync;syncGate=undefined;
  assert.equal(progressRuns.at(-1).active,false);
  accessFailure=new Error('Add this repository to Zero’s selected repositories on GitHub.');
  const syncDispatchesBeforeDenial=transportDispatches;await commands.get('zero.syncProject')();
  assert.equal(transportDispatches,syncDispatchesBeforeDenial,'Sync checks repository access before its first remote read');assert.equal(branch,'add-score');assert.match(errors.at(-1),/selected repositories/);assert.equal(progressRuns.at(-1).active,false);accessFailure=undefined;
  let releaseChangedSync;syncGate=new Promise(resolve=>{releaseChangedSync=resolve;});
  const syncBeforeChangedSession=synced,dispatchesBeforeChangedSession=transportDispatches;
  const changedSync=commands.get('zero.syncProject')();await waitFor(()=>synced>syncBeforeChangedSession);
  session={...session,id:'changed-during-sync'};authEvent({provider:{id:'zero-github'}});releaseChangedSync();await changedSync;syncGate=undefined;
  assert.equal(transportDispatches,dispatchesBeforeChangedSession,'A changed session cannot dispatch Sync transport');assert.match(errors.at(-1),/sign-in changed/);assert.equal(progressRuns.at(-1).active,false);
});
