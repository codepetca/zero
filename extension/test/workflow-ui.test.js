'use strict';
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
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
  t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.mkdir(path.join(root,'.git'));
  const original = {git:core.git,resolve:core.resolveProject,repoRoot:core.repositoryRoot,assert:core.assertRepositoryRoot,prepare:github.prepareUpload,syncHead:github.syncExistingHead,check:github.checkUpload,...workflow};
  t.after(()=>{core.git=original.git;core.resolveProject=original.resolve;core.repositoryRoot=original.repoRoot;core.assertRepositoryRoot=original.assert;github.prepareUpload=original.prepare;github.syncExistingHead=original.syncHead;github.checkUpload=original.check;for(const key of Object.keys(workflow))workflow[key]=original[key];});
  let projectResolves=0;
  core.resolveProject=(...args)=>{projectResolves++;return original.resolve(...args);};
  let branch='main',branchRows,selectedSwitch,remote='https://github.com/student/app.git',mode='simulation',session={id:'session',account:{id:'1',label:'student'},accessToken:'NEVER_RENDER_TOKEN'},authEvent,provider,publishedState;
  let accessFailure,repositoryId=12,installationId=99,gitStatus='',warningChoice,pendingRecovery,storedPending,storedLocal,currentHead='f'.repeat(40);const accesses=[];
  let saved=0,authCalls=0,prepared=0,uploadSnapshots=0,transportDispatches=0,synced=0,syncError,syncUpdates=false,startGate,syncGate,afterSyncFetch,afterCheckout,activeUncertain=false,checkoutWarning=false,syncApplied=0,executed=0,deleted=0,input,choice,prepareGate,pickGate,warningGate,finishError,cleanupError,failLockCleanup=false,nativeScm=true,finishDrift=false,recoveryPushes=0,switchGuardError,switchPreparations=0,forbidRawSwitchStatus=false,switchFingerprintDrift=false;
  let cleanupSelection,afterFinish,retainedFinish,remoteFeatureHead,remoteDeleteError,localFeatureHead='f'.repeat(40);
  const mergeReceipts=new WeakSet();
  const transportCalls=[],statusEnvironments=[];
  const commands=new Map(),picks=[],reviews=[],warnings=[],warningDetails=[],errors=[],notices=[],dispatch=[],deletions=[],logs=[],metadata={},progressRuns=[];
  core.assertRepositoryRoot=async()=>root;core.repositoryRoot=async()=>root;
  core.git=async(_,args,options)=>{if(args[0]==='-c'&&args[1]==='core.fsmonitor=false')args=args.slice(2);if(args[0]==='ls-files')return '';if(args[0]==='remote'){if(!remote)throw new Error('No origin');return remote;};if(args[0]==='symbolic-ref'){if(args.at(-1)!=='HEAD')throw Object.assign(Error('Direct branch'),{code:1});return `refs/heads/${branch}`;}if(args[0]==='for-each-ref')return branchRows??`refs/heads/feature\t${currentHead}`;if(args[0]==='status'){statusEnvironments.push(options?.env?.GIT_OPTIONAL_LOCKS);if(forbidRawSwitchStatus)throw new Error('Unsafe status before guarded switch review');return gitStatus;}if(args[0]==='rev-parse')return args.includes('--show-toplevel')?root:args.includes('--git-common-dir')||args.includes('--absolute-git-dir')?path.join(root,'.git'):currentHead;throw new Error('Unexpected Git mutation');};
  github.prepareUpload=async()=>{uploadSnapshots++;return {root,head:currentHead,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,changes:[],summary:'No changes'};};
  github.syncExistingHead=async(plan,{beforeUpload,networkRun})=>{await beforeUpload();await networkRun(root,['push',plan.remote,`${plan.head}:refs/heads/${plan.branch}`]);await networkRun(root,['ls-remote','--heads',plan.remote,`refs/heads/${plan.branch}`]);return {uploaded:true,head:plan.head,branch:plan.branch};};
  github.checkUpload=async(_root,_record,{beforeNetwork})=>{await beforeNetwork();return {confirmed:false,remoteHead:syncUpdates?'a'.repeat(40):null};};
  const plan = () => ({root,remote,page:remote?'https://github.com/student/app':'',branch,status:gitStatus,head:'f'.repeat(40),mainHead:'a'.repeat(40),remoteMainHead:'a'.repeat(40),summary:'Reviewed change',changedPaths:['Main.java']});
  workflow.prepareStart=async()=>{prepared++;if(startGate)await startGate;return plan();};workflow.prepareFinish=async()=>{prepared++;if(finishDrift)throw Object.assign(new Error('Pending change'),{pendingFinishDrift:true});const captured={...plan(),pending:retainedFinish};if(prepareGate)await prepareGate;return captured;};
  const phaseLock=path.join(root,'.git','zero-commit-provenance.lock');
  workflow.startPrepared=async(_,options)=>{assert.ok(await fs.stat(phaseLock));await options.beforeMutation();await options.beforeCheckout();executed++;branch='add-score';afterCheckout?.();return {branch,head:'f'.repeat(40),activeUncertain,checkoutWarning};};
  workflow.prepareSwitch=async(_root,name)=>{forbidRawSwitchStatus=false;switchPreparations++;if(switchGuardError)throw Error(switchGuardError);selectedSwitch=name;return {target:currentHead,branch,head:currentHead,status:gitStatus,startFingerprint:switchFingerprintDrift?String(switchPreparations):null};};workflow.switchPrepared=async(_,options)=>{await options.beforeMutation();branch='feature';return {branch};};
  workflow.prepareSync=async(_,options)=>{synced++;options.onProgress('Reading main on GitHub…');if(syncGate)await syncGate;await options.networkRun(root,['ls-remote','--heads',plan().remote,'refs/heads/main']);return plan();};
  workflow.syncPrepared=async(_,options)=>{await options.beforeNetwork();if(syncError)throw syncError;if(syncUpdates){await options.networkRun(root,['fetch','--no-tags','--no-recurse-submodules','--no-write-fetch-head',plan().remote,plan().remoteMainHead]);afterSyncFetch?.();await options.beforeMutation();syncApplied++;}return {updated:syncUpdates,branch,head:'f'.repeat(40)};};
  workflow.finishPrepared=async(reviewed,options)=>{assert.ok(await fs.stat(phaseLock));const beforeAccess=accesses.length;await options.beforeNetwork();assert.equal(accesses.length,beforeAccess,'The early session guard must not duplicate transport repository requests');if(finishError){executed++;throw finishError;}await options.networkRun(root,['push',reviewed.remote,`${reviewed.head}:refs/heads/main`]);await options.networkRun(root,['ls-remote','--heads',reviewed.remote,'refs/heads/main']);executed++;branch='main';const result={finished:true,branch,finishedBranch:reviewed.branch,head:'f'.repeat(40),featureHead:reviewed.head,remote:reviewed.remote,page:reviewed.page};mergeReceipts.add(result);afterFinish?.();return result;};
  workflow.preparePendingFinishRecovery=async()=>plan();
  workflow.recoverPendingFinish=async(_,options)=>{if(options.allowPush){recoveryPushes++;return {recovered:true,branch,finishedHead:'b'.repeat(40),remoteHead:'b'.repeat(40)};}return {needsPush:true,candidate:'b'.repeat(40),page:'https://github.com/student/app'};};
  workflow.readRecovery=async()=>pendingRecovery;
  workflow.consumeFinishedBranchCleanup=(cwd,result)=>{
    assert.equal(cwd,root);assert.ok(mergeReceipts.delete(result));
    return Object.freeze({root,branch:result.finishedBranch,featureHead:result.featureHead,head:result.head,remote:result.remote,page:result.page});
  };
  workflow.inspectFinishedBranchCleanup=async(cwd,name,head,options)=>{
    assert.equal(cwd,root);assert.equal(name,'add-score');assert.equal(head,'f'.repeat(40));assert.equal(options.expectedMain,'f'.repeat(40));assert.ok(await fs.stat(phaseLock));
    await options.beforeMutation();options.beforeMutationNow();
    if(branch!=='main'||options.expectedRemote!==remote||localFeatureHead!==head)throw new Error('The project changed.');
  };
  workflow.deleteFinishedBranch=async(...args)=>{await workflow.inspectFinishedBranchCleanup(...args);deletions.push(args);if(cleanupError)throw cleanupError;deleted++;if(failLockCleanup){const originalUnlink=fs.unlink;fs.unlink=async file=>{if(file===phaseLock){fs.unlink=originalUnlink;throw Error('simulated lock release failure');}return originalUnlink(file);};}return {deleted:true};};
  const vscode={
    ProgressLocation:{Notification:15},
    authentication:{getSession:async(provider,scopes)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);authCalls++;return session;},onDidChangeSessions:fn=>{authEvent=fn;return disposable();},registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},
    workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?(mode??fallback):fallback}),saveAll:async()=>{saved++;return true;},createFileSystemWatcher:pattern=>pattern.startsWith('**/.git/{HEAD,config,')?{onDidCreate:fn=>{metadata.create=fn;return disposable();},onDidChange:fn=>{metadata.change=fn;return disposable();},onDidDelete:fn=>{metadata.delete=fn;return disposable();},dispose(){}}:{onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}},onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{withProgress:async(options,work)=>{const run={options,messages:[],active:true};progressRuns.push(run);try{return await work({report:({message})=>run.messages.push(message)});}finally{run.active=false;}},createOutputChannel:()=>({appendLine(text){logs.push(text);},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,
      showQuickPick:async(items,options)=>{picks.push({items,options});if(pickGate)await pickGate;if(options.canPickMany)return cleanupSelection==='cancel'?undefined:cleanupSelection==='keep'?[]:items.filter(item=>item.picked);return choice===undefined?undefined:items.find(item=>item.action===choice || item.command===choice || item.name===choice);},showInputBox:async()=>input,
      showWarningMessage:async (text,options,...actions)=>{warnings.push(text);warningDetails.push({options,actions});if(warningGate)await warningGate;return warningChoice;},
      showInformationMessage:async(text,options)=>{notices.push(text);if(options?.modal){reviews.push({text,options});assert.fail('Branch creation, merge and finished-branch cleanup must not confirm');}},showErrorMessage:async text=>{errors.push(text);}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async id=>{dispatch.push(id);},getCommands:async()=>nativeScm?['workbench.view.scm']:[]},
    env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const startPanels=require('./fixtures/start-page-panel').startPagePanels(vscode);
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){
    if(id==='./git-tracking')return {updateRemoteTracking:async()=>({updated:true})};
    if(id==='./transport')return {createTransport:(destination,authenticate,{assertCurrentNow,deleteAuthorization})=>async(cwd,args,binding)=>{
      await authenticate();assertCurrentNow();
      if(args[0]==='push'||deleteAuthorization){assert.ok(Object.isFrozen(binding)&&binding);binding.assertCurrentNow();assert.ok(await fs.stat(phaseLock));}
      else assert.equal(binding,undefined,'Only cleanup reads receive a live provenance binding');
      if(deleteAuthorization&&args[0]==='push'){
        assert.equal(deleteAuthorization.root,cwd);assert.equal(deleteAuthorization.destination,destination);
        const ref=`refs/heads/${deleteAuthorization.branch}`;
        assert.deepEqual(args,['push',`--force-with-lease=${ref}:${deleteAuthorization.expectedSha}`,destination,`:${ref}`]);
        deleteAuthorization.assertCurrentNow();
      }
      transportDispatches++;transportCalls.push(args);
      if(!deleteAuthorization)return args[0]==='ls-remote'?`${plan().head}\t${args[3]}`:'';
      if(args[0]==='push'){
        if(remoteDeleteError)throw remoteDeleteError;
        remoteFeatureHead=null;return '';
      }
      const head=args[3]==='refs/heads/main'?plan().head:remoteFeatureHead;
      return head===null?'':`${head}\t${args[3]}`;
    }};
    return id==='vscode'?textInputs(vscode):oldLoad.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  const subscriptions=[],ledger=new Map();t.after(()=>subscriptions.forEach(value=>value.dispose()));extension.activate({subscriptions,workspaceState:{keys:()=>[...ledger.keys(),...(storedPending?[`zero.gitUploadRecovery:${root}:${storedPending.branch}`]:[]),...(storedLocal?[`zero.localCommitPending:${root}:${storedLocal.branch}`]:[])],get:key=>ledger.has(key)?ledger.get(key):key.startsWith('zero.pendingSync.v1:')?undefined:key==='zero.webPublish.lastLive'?publishedState:key.startsWith('zero.gitUploadRecovery:')?(key===`zero.gitUploadRecovery:${root}:${storedPending?.branch}`?storedPending:undefined):key.startsWith('zero.localCommitPending:')?(key===`zero.localCommitPending:${root}:${storedLocal?.branch}`?storedLocal:undefined):true,update:async(key,value)=>{if(key.startsWith('zero.gitUploadRecovery:'))storedPending=value;else if(key.startsWith('zero.localCommitPending:'))storedLocal=value;else ledger.set(key,value);}}},{repositoryLedgerFactory,provider:appSessions(vscode,{dispose(){},async removeSession(){session=undefined;}}),repositories:{async checkSetup(){return {};},async access(url,{ticket,permissions}){accesses.push({url,ticket,permissions});assert.equal(url,'https://github.com/student/app');assert.deepEqual(permissions,{contents:'write'});assert.equal(ticket.session.accountId,'1');assert.equal(ticket.session.accessToken,'NEVER_RENDER_TOKEN');if(accessFailure)throw accessFailure;return {ticket,repository:{id:repositoryId},installation:{id:installationId}};}}});
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
  assert.match(webview.html,/title="Current branch: main"/);assert.match(webview.html,/data-command="zero.commitChanges"/);assert.doesNotMatch(webview.html,/data-command="zero.finishChange"|NEVER_RENDER_TOKEN/);
  assert.match(webview.html,/data-command="zero.switchStudentBranch"[^>]*>[\s\S]*?<span class="branch-name">main<\/span>/);
  assert.doesNotMatch(webview.html,/class="branch-switch"/);
  assert.match(webview.html,/data-command="zero.changeHistory"/);
  assert.doesNotMatch(webview.html,/Recent commits|data-command="zero.undoRecentChange"|data-command="zero.reviewChanges"|data-command="zero.checkBranchConnection"|Branch matched GitHub at the last check/);
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
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['start','switch']);
  await commands.get('zero.chooseRepository')();assert.ok(picks.at(-1).items.some(item=>item.action==='sync'&&item.label==='Update from main'));
  let releaseWarning;warningGate=new Promise(resolve=>{releaseWarning=resolve;});const authBefore=authCalls;
  await commands.get('zero.startChange')();await commands.get('zero.finishChange')();await commands.get('zero.syncProject')();await commands.get('zero.uploadToGitHub')();
  assert.equal(saved,0);assert.equal(prepared,0);assert.equal(executed,0);assert.equal(authCalls,authBefore);assert.equal(accesses.length,0);assert.equal(synced,0);assert.match(warnings[0],/nothing changed/);
  assert.doesNotMatch(webview.html,/data-command="zero.startChange"[^>]* disabled/);releaseWarning();warningGate=undefined;
  mode=undefined;input=undefined;await commands.get('zero.startChange')();assert.equal(saved,0);assert.equal(prepared,0);
  assert.equal(progressRuns.length,0,'Simulation and cancelling the name prompt start no progress or network work');
  input='add-score';warningChoice='Create branch';let releaseStart;startGate=new Promise(resolve=>{releaseStart=resolve;});const authBeforeStart=authCalls;
  const starting=commands.get('zero.startChange')();await waitFor(()=>prepared===1);
  const activeProgress=progressRuns.at(-1);assert.equal(activeProgress.active,true);assert.deepEqual(activeProgress.options,{location:15,title:'Creating branch add-score',cancellable:false});
  assert.match(webview.html,/Checking|Creating/);assert.match(webview.html,/data-command="zero.chooseRepository"[^>]* disabled/);
  await commands.get('zero.startChange')();assert.equal(progressRuns.length,1,'A repeat click cannot start another operation');
  releaseStart();await starting;startGate=undefined;assert.equal(activeProgress.active,false);assert.equal(prepared,1);assert.equal(executed,1);assert.equal(accesses.length,1);assert.ok(authCalls>=authBeforeStart);assert.equal(uploadSnapshots,1,'Branch creation prepares an automatic sync');assert.equal(transportDispatches,2,'Branch creation pushes and confirms the saved head');assert.equal(reviews.length,0,'Naming a branch needs no additional confirmation');assert.doesNotMatch(webview.html,/Simulation — nothing will be uploaded/);assert.match(webview.html,/add-score<\/span>/);
  branch='main';gitStatus=' M Main.java';warningChoice=undefined;
  await commands.get('zero.startChange')();assert.equal(branch,'main');assert.equal(executed,1,'Cancelling leaves the branch unchanged');assert.match(warnings.at(-1),/Move your changes to add-score/);assert.match(warningDetails.at(-1).options.detail,/Project changes come with you without being committed/);assert.match(warningDetails.at(-1).options.detail,/check and non-force push are not atomic/);assert.deepEqual(warningDetails.at(-1).actions,['Move changes']);assert.doesNotMatch(webview.html,/>Checking your local branch…</);
  warningChoice='Move changes';await commands.get('zero.startChange')();assert.equal(branch,'add-score');assert.equal(executed,2,'Moving changes creates the branch');
  gitStatus='';branch='main';warningChoice=undefined;const alias=path.join(path.dirname(root),`${path.basename(root)}-alias`);await fs.symlink(root,alias,'dir');t.after(()=>fs.rm(alias,{force:true}));vscode.workspace.textDocuments=[{isDirty:true,version:1,getText:()=> 'reviewed editor',uri:{scheme:'file',fsPath:path.join(alias,'Main.java')}}];const beforeUnsaved=saved;
  assert.deepEqual(await extension.dirtyProjectDocuments(vscode,root),vscode.workspace.textDocuments,'Aliased editor resolves to the student project');
  const otherDocument={isDirty:true,uri:{scheme:'file',fsPath:path.join(os.tmpdir(),'unrelated-file.java')}};vscode.workspace.textDocuments.push(otherDocument);
  assert.deepEqual(await extension.dirtyProjectDocuments(vscode,root),[vscode.workspace.textDocuments[0]],'Unrelated editors are excluded');vscode.workspace.textDocuments.pop();
  await commands.get('zero.startChange')();assert.equal(branch,'main');assert.equal(saved,beforeUnsaved,'Cancellation does not save editor buffers');
  warningChoice='Move changes';await commands.get('zero.startChange')();assert.equal(branch,'add-score');assert.equal(saved,beforeUnsaved,'Moving changes keeps editor buffers unsaved');
  branch='main';choice='feature';warningChoice='Move changes';let projectSaves=0,otherSaves=0;
  const aliasDocument=vscode.workspace.textDocuments[0];aliasDocument.save=async()=>{projectSaves++;await fs.writeFile(path.join(root,'Main.java'),aliasDocument.getText());aliasDocument.isDirty=false;return true;};
  otherDocument.save=async()=>{otherSaves++;return true;};vscode.workspace.textDocuments.push(otherDocument);
  forbidRawSwitchStatus=true;await commands.get('zero.switchStudentBranch')();assert.equal(branch,'feature');assert.equal(projectSaves,1);assert.equal(otherSaves,0,'Switch does not save unrelated editors');assert.ok(switchPreparations>=2,'Switch reviews guarded state before the prompt and after saving');
  for(const drift of ['editor','disk']){
    branch='main';aliasDocument.isDirty=true;const before=projectSaves;let release;warningGate=new Promise(resolve=>{release=resolve;});
    const previousWarnings=warnings.length,pending=commands.get('zero.switchStudentBranch')();await waitFor(()=>warnings.length>previousWarnings);
    if(drift==='editor')aliasDocument.version++;else gitStatus='?? Later.java\0';
    release();await pending;warningGate=undefined;assert.equal(branch,'main');assert.equal(projectSaves,before);assert.ok(aliasDocument.isDirty);assert.match(errors.at(-1),/changed after review/);gitStatus='';
  }
  branch='main';aliasDocument.isDirty=true;aliasDocument.save=async()=>{projectSaves++;await fs.writeFile(path.join(root,'Main.java'),aliasDocument.getText());aliasDocument.isDirty=false;gitStatus='?? Later.java\0';return true;};
  await commands.get('zero.switchStudentBranch')();assert.equal(branch,'main');assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'reviewed editor');assert.match(errors.at(-1),/project changed/);gitStatus='';
  branch='main';aliasDocument.isDirty=true;aliasDocument.save=async()=>{await fs.writeFile(path.join(root,'Main.java'),aliasDocument.getText());aliasDocument.isDirty=false;return true;};
  const secondDocument={isDirty:true,version:1,getText:()=> 'second editor',uri:{scheme:'file',fsPath:path.join(root,'Second.java')},save:async()=>false};vscode.workspace.textDocuments.push(secondDocument);
  await commands.get('zero.switchStudentBranch')();assert.equal(branch,'main');assert.equal(aliasDocument.isDirty,false);assert.equal(secondDocument.isDirty,true);assert.match(errors.at(-1),/open files were saved; the branch was not switched/);assert.match(warningDetails.at(-1).options.detail,/save the reviewed open project files/);vscode.workspace.textDocuments.pop();
  const secondParent=path.join(root,'editor-parent');await fs.mkdir(secondParent);secondDocument.uri.fsPath=path.join(secondParent,'Second.java');
  branch='main';aliasDocument.isDirty=true;secondDocument.isDirty=true;vscode.workspace.textDocuments.push(secondDocument);let changedAlias=false,secondSaveCalls=0;secondDocument.save=async()=>{secondSaveCalls++;return true;};
  aliasDocument.save=async()=>{await fs.writeFile(path.join(root,'Main.java'),aliasDocument.getText());aliasDocument.isDirty=false;changedAlias=true;return true;};
  const realpath=fs.realpath;fs.realpath=async(...args)=>changedAlias&&args[0]===secondParent?`${secondParent}-changed`:realpath(...args);
  try{await commands.get('zero.switchStudentBranch')();}finally{fs.realpath=realpath;}
  assert.equal(branch,'main');assert.equal(secondDocument.isDirty,true);assert.equal(secondSaveCalls,0);assert.match(errors.at(-1),/open files changed while saving/);assert.match(errors.at(-1),/open files were saved; the branch was not switched/);vscode.workspace.textDocuments.pop();
  branch='main';choice='feature';vscode.workspace.textDocuments=[];switchGuardError='Custom attributes require Source Control';const warningsBeforeGuard=warnings.length;forbidRawSwitchStatus=true;
  await commands.get('zero.switchStudentBranch')();assert.equal(branch,'main');assert.equal(warnings.length,warningsBeforeGuard,'Rejected guarded review cannot reach the move prompt');assert.match(errors.at(-1),/Custom attributes/);switchGuardError=undefined;
  gitStatus=' M Main.java\0';switchFingerprintDrift=true;await commands.get('zero.switchStudentBranch')();assert.equal(branch,'main');assert.match(errors.at(-1),/project changed/,'Same-status content drift across confirmation is rejected');switchFingerprintDrift=false;gitStatus='';
  branch='main';choice='heads/feature';vscode.workspace.textDocuments=[];
  branchRows=`refs/heads/heads/feature\t${currentHead}\nrefs/heads/release/1.2\t${currentHead}\nrefs/tags/feature\t${currentHead}`;
  await commands.get('zero.switchStudentBranch')();assert.equal(selectedSwitch,'heads/feature');
  assert.deepEqual(picks.at(-1).items.filter(item=>item.name).map(item=>item.name),['heads/feature','release/1.2']);
  branchRows=undefined;
  branch='main';choice='switch';vscode.workspace.textDocuments=[];
  for(const command of ['zero.chooseRepository','zero.chooseBranch']) {
    const beforeDispatch=dispatch.length;await commands.get(command)();
    assert.equal(picks.at(-1).options.title,'Switch branch','Menu opens the student branch chooser');
    assert.ok(picks.at(-1).items.some(item=>item.name==='feature'));
    assert.equal(dispatch.length,beforeDispatch,'Menu does not invoke native checkout');
  }
  choice=undefined;warningChoice='Create branch';
  branch='main';vscode.workspace.textDocuments=[{isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(os.tmpdir(),'unrelated-file.java')}}];const warningsBefore=warnings.length;
  await commands.get('zero.startChange')();assert.equal(branch,'add-score');assert.equal(warnings.length,warningsBefore+1,'Only the branch creation review is shown');
  const loop=path.join(os.tmpdir(),`${path.basename(root)}-loop`);await fs.symlink(loop,loop);t.after(()=>fs.rm(loop,{force:true}));branch='main';vscode.workspace.textDocuments=[{isDirty:true,version:1,uri:{scheme:'file',fsPath:loop}}];
  await commands.get('zero.startChange')();assert.equal(branch,'add-score');assert.equal(warnings.length,warningsBefore+2,'Only the branch creation review is shown');
  const other=await fs.mkdtemp(path.join(os.tmpdir(),'zero-other-'));t.after(()=>fs.rm(other,{recursive:true,force:true}));const otherLoop=path.join(other,'loop');await fs.symlink(otherLoop,otherLoop);vscode.workspace.workspaceFolders.push({uri:{fsPath:other}});branch='main';vscode.workspace.textDocuments=[{isDirty:true,version:1,uri:{scheme:'file',fsPath:otherLoop}}];
  await commands.get('zero.startChange')();assert.equal(branch,'add-score');assert.equal(warnings.length,warningsBefore+3,'Only the branch creation review is shown');vscode.workspace.workspaceFolders.pop();
  const subdir=path.join(root,'src');await fs.mkdir(subdir,{recursive:true});const subAlias=path.join(os.tmpdir(),`${path.basename(root)}-subalias`);await fs.symlink(subdir,subAlias,'dir');t.after(()=>fs.rm(subAlias,{force:true}));const subLoop=path.join(subdir,'loop');await fs.symlink(subLoop,subLoop);vscode.workspace.workspaceFolders.push({uri:{fsPath:subAlias}});branch='main';vscode.workspace.textDocuments=[{isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(subAlias,'loop')}}];const errorsBefore=errors.length;
  await commands.get('zero.startChange')();assert.equal(branch,'main');assert.ok(errors.length>errorsBefore,'An unresolvable file through a project subfolder alias stops branch creation');vscode.workspace.workspaceFolders.pop();
  branch='main';vscode.workspace.textDocuments=[];afterCheckout=()=>{vscode.workspace.textDocuments=[{isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(root,'Main.java')}}];};
  await commands.get('zero.startChange')();assert.equal(branch,'add-score');assert.match(warnings.at(-1),/branch was created.*unsaved work is still open/);afterCheckout=undefined;
  branch='main';vscode.workspace.textDocuments=[];activeUncertain=true;await commands.get('zero.startChange')();assert.match(warnings.at(-1),/active branch could not be confirmed/);assert.match(webview.html,/Created add-score · check Source Control/);activeUncertain=false;
  branch='main';checkoutWarning=true;await commands.get('zero.startChange')();assert.match(warnings.at(-1),/branch was created.*Git reported an error/);checkoutWarning=false;
  vscode.workspace.textDocuments=[];warningChoice=undefined;executed=1;
  const dirtyMerge={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(alias,'Main.java')}};vscode.workspace.textDocuments=[dirtyMerge];
  let beforeBlockedMerge={saved,prepared,executed,transportDispatches};await commands.get('zero.finishChange')();assert.deepEqual({saved,prepared,executed,transportDispatches},beforeBlockedMerge);assert.match(errors.at(-1),/Save or undo.*merging/);assert.equal(dirtyMerge.isDirty,true);
  vscode.workspace.textDocuments=[];gitStatus=' M Main.java\0';beforeBlockedMerge={saved,prepared,executed,transportDispatches};await commands.get('zero.finishChange')();assert.deepEqual({saved,prepared,executed,transportDispatches},beforeBlockedMerge);assert.match(errors.at(-1),/Commit or discard.*merging/);gitStatus='';
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['start','finish','switch']);
  warningChoice='Merge';let releasePrepare;prepareGate=new Promise(resolve=>{releasePrepare=resolve;});const preparedBeforeFinish=prepared;const pending=commands.get('zero.finishChange')();await waitFor(()=>prepared>preparedBeforeFinish, 'Finish preparation should start directly');
  const before={saved,prepared,authCalls};for(const id of ['zero.startChange','zero.finishChange','zero.syncProject','zero.uploadToGitHub','zero.githubAccount','zero.chooseRepository','zero.chooseBranch','zero.connectRepository','zero.signInToGitHub'])await commands.get(id)();
  assert.deepEqual({saved,prepared,authCalls},before);assert.match(webview.html,/data-command="zero.finishChange"[^>]* disabled/);
  session={...session,id:'changed'};authEvent({provider:{id:'zero-github'}});releasePrepare();await pending;prepareGate=undefined;
  assert.equal(executed,1,'Changed account cannot execute the reviewed finish');assert.equal(deleted,0);assert.match(errors.at(-1),/sign-in changed/);
  finishError=Object.assign(new Error('Merge conflicts need your attention'),{conflict:true});await commands.get('zero.finishChange')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.equal(deleted,0);assert.match(notices.join('\n'),/Stage the resolved files/);assert.match(webview.html,/add-score<\/span>/);
  nativeScm=false;await commands.get('zero.finishChange')();assert.match(notices.at(-1),/Open Source Control/);assert.equal(deleted,0);
  finishError=undefined;
  let releaseDirtyMerge;prepareGate=new Promise(resolve=>{releaseDirtyMerge=resolve;});const beforeDirtyMerge={prepared,executed,transportDispatches,saved};
  const dirtyPending=commands.get('zero.finishChange')();await waitFor(()=>prepared>beforeDirtyMerge.prepared);vscode.workspace.textDocuments=[dirtyMerge];releaseDirtyMerge();await dirtyPending;prepareGate=undefined;
  assert.equal(executed,beforeDirtyMerge.executed);assert.equal(transportDispatches,beforeDirtyMerge.transportDispatches);assert.equal(saved,beforeDirtyMerge.saved);assert.match(errors.at(-1),/Save or undo.*merging/);vscode.workspace.textDocuments=[];
  finishDrift=true;warningChoice=undefined;await commands.get('zero.finishChange')();assert.equal(recoveryPushes,0,'Cancelling recovery does not push');assert.match(warningDetails.at(-1).options.detail,/bbbbbbbb.*github\.com\/student\/app/);warningChoice='Merge';await commands.get('zero.finishChange')();assert.equal(recoveryPushes,1,'Only explicit Merge retries the exact candidate');assert.equal(branch,'add-score','Recovery keeps newer work checked out');assert.match(webview.html,/Earlier merge confirmed/);finishDrift=false;
  cleanupSelection='keep';warningChoice='Merge';const unrelatedMerge={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(path.dirname(root),'unrelated-merge.txt')}};vscode.workspace.textDocuments=[unrelatedMerge];const mergeSaves=saved;const accessBeforeFinish=accesses.length,transportBeforeFinish=transportDispatches,logBeforeFinish=logs.length;await commands.get('zero.finishChange')();cleanupSelection=undefined;
  assert.equal(saved,mergeSaves);assert.equal(unrelatedMerge.isDirty,true);vscode.workspace.textDocuments=[];assert.equal(accesses.length,accessBeforeFinish+1,'Merge checks repository access once at push');assert.equal(transportDispatches,transportBeforeFinish+2,'Merge dispatches push and confirmation');assert.equal(deleted,0);assert.deepEqual(deletions,[],'Unchecking cleanup keeps the feature branch');assert.match(warningDetails.at(-1).options.detail,/Keep refs\/heads\/add-score locally and on GitHub/);assert.equal(reviews.length,0);assert.match(webview.html,/main<\/span>/);assert.match(webview.html,/>Merged to main · branch kept<\/p>/);assert.match(logs.slice(logBeforeFinish).join("\n"),/local feature branch was kept/);assert.ok(!notices.some(text=>/Started add-score|Merged change and pushed main|Main updates added/.test(text)),'Successful Git outcomes never toast');
  publishedState={root,account:'1',resume:{repository:'https://github.com/student/app'}};provider.resolveWebviewView(candidate);
  assert.doesNotMatch(webview.html,/data-command="zero.openPublishedWeb"|data-command="zero.copyPublishedWebLink"/);
  assert.match(webview.html,/data-command="zero.publishAndOpenWeb"/);
  assert.ok(commands.has('zero.openPublishedWeb') && commands.has('zero.copyPublishedWebLink'),'Advanced saved-link commands remain available');
  for(const changed of [{root:'/other'}, {account:'other'}, {resume:{repository:'https://github.com/student/other'}}]) {
    const saved=publishedState;publishedState={...saved,...changed};provider.resolveWebviewView(candidate);assert.doesNotMatch(webview.html,/data-command="zero.openPublishedWeb"/);publishedState=saved;
  }
  mode='simulation';provider.resolveWebviewView(candidate);assert.doesNotMatch(webview.html,/data-command="zero.copyPublishedWebLink"/);mode='live';publishedState=undefined;
  branch='<branch"x">';provider.resolveWebviewView(candidate);await waitFor(()=>webview.html.includes('&lt;branch&quot;x&quot;&gt;'));assert.match(webview.html,/&lt;branch&quot;x&quot;&gt;/);assert.doesNotMatch(webview.html,/<branch|NEVER_RENDER_TOKEN/);
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
  branch='main';let releaseLocal;startGate=new Promise(resolve=>{releaseLocal=resolve;});const localPrepared=prepared,localDispatches=transportDispatches;
  const pendingLocalStart=commands.get('zero.startChange')();await waitFor(()=>prepared>localPrepared);session={id:'new-session',account:{id:'1',label:'student'},accessToken:'NEVER_RENDER_TOKEN'};authEvent({provider:{id:'zero-github'}});releaseLocal();await pendingLocalStart;startGate=undefined;
  assert.equal(branch,'add-score','A local-only branch does not depend on a GitHub sign-in');assert.equal(transportDispatches,localDispatches);
  remote='https://github.com/student/app.git';session={id:'restored',account:{id:'1',label:'student'},accessToken:'NEVER_RENDER_TOKEN'};authEvent({provider:{id:'zero-github'}});
  await new Promise(resolve=>setImmediate(resolve));
  warningChoice='Create branch';for(const invalidation of ['simulation','trust']) {
    branch='main';let releaseGuard;startGate=new Promise(resolve=>{releaseGuard=resolve;});
    const preparedBefore=prepared,executedBefore=executed,authBefore=authCalls;
    const pendingStart=commands.get('zero.startChange')();await waitFor(()=>prepared>preparedBefore);
    if(invalidation==='simulation')mode='simulation';else vscode.workspace.isTrusted=false;
    releaseGuard();await pendingStart;startGate=undefined;mode='live';vscode.workspace.isTrusted=true;
    assert.equal(executed,executedBefore,'A local branch must recheck live mode and trust at mutation');assert.equal(authCalls,authBefore);assert.match(errors.at(-1),/disabled|Trust|trust/i);
  }
  branch='add-score';warningChoice='Mark reviewed';await commands.get('zero.reviewPendingSync')();warningChoice=undefined;
  branch='add-score';warningChoice='Merge';input='add-score';accessFailure=new Error('This repository is not available to Zero. Add it to Zero’s selected repositories on GitHub.');
  const beforeDenied={executed,deleted,transportDispatches};await commands.get('zero.finishChange')();
  assert.deepEqual({executed,deleted,transportDispatches},beforeDenied,'Denied repository access stops the first actual push');assert.match(errors.at(-1),/selected repositories/);
  assert.equal(progressRuns.at(-1).active,false,'Failure closes native progress');assert.doesNotMatch(webview.html,/data-command="zero.chooseRepository"[^>]* disabled/,'Failure releases busy controls');
  accessFailure=undefined;
  const uploadSnapshotsBeforeSync=uploadSnapshots,dispatchesBeforeSync=transportDispatches,accessesBeforeSync=accesses.length;
  storedLocal={root,branch,head:currentHead};syncUpdates=true;await commands.get('zero.syncProject')();assert.equal(synced,1);assert.equal(storedLocal.head,currentHead,'Legacy reminder remains as source evidence');assert.ok([...ledger.entries()].some(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.record.head===currentHead),'Confirmed sync records its resolution');assert.equal(uploadSnapshots,uploadSnapshotsBeforeSync+1,'The updated branch head is reviewed for automatic sync');assert.equal(transportDispatches,dispatchesBeforeSync+4);assert.equal(accesses.length,accessesBeforeSync+2,'The fetch and subsequent push each verify access');assert.deepEqual(transportCalls.at(-4),['ls-remote','--heads',remote,'refs/heads/main']);assert.deepEqual(transportCalls.at(-3),['fetch','--no-tags','--no-recurse-submodules','--no-write-fetch-head',remote,'a'.repeat(40)]);assert.deepEqual(transportCalls.at(-2),['push',remote,`${currentHead}:refs/heads/${branch}`]);assert.equal(branch,'add-score');assert.match(webview.html,/Updated add-score · synced to GitHub/);
  syncError=Object.assign(new Error('Merge conflicts need your attention'),{conflict:true});nativeScm=true;await commands.get('zero.syncProject')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.match(notices.at(-1),/Run your app/);syncError=undefined;
  syncError=Object.assign(new Error('This branch and GitHub have different commits. Zero cannot update them automatically.'),{nativeUpdateHandoff:true});
  const handoffSaved=saved,handoffApplied=syncApplied,handoffDispatch=dispatch.length;
  warningChoice=undefined;await commands.get('zero.syncProject')();assert.equal(dispatch.length,handoffDispatch);assert.equal(saved,handoffSaved);assert.equal(syncApplied,handoffApplied);assert.match(warnings.at(-1),/different commits.*cannot update them automatically/i);assert.match(warningDetails.at(-1).options.detail,/Your files and commits are kept/);assert.ok(warningDetails.at(-1).actions.includes('Open Source Control'));
  warningChoice='Open Source Control';await commands.get('zero.syncProject')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.equal(saved,handoffSaved);assert.equal(syncApplied,handoffApplied);
  nativeScm=false;await commands.get('zero.syncProject')();assert.match(notices.at(-1),/Activity Bar/);assert.equal(saved,handoffSaved);assert.equal(syncApplied,handoffApplied);nativeScm=true;warningChoice='Merge';syncError=undefined;
  if(process.env.ZERO_TEST_HANDOFF_ONLY==='1')return; // Focused handoff run; full suite continues normally.

  syncUpdates=false;await commands.get('zero.syncProject')();assert.match(webview.html,/Already up to date with GitHub main/);
  let releaseSync;syncGate=new Promise(resolve=>{releaseSync=resolve;});const syncBeforeGate=synced;const pendingSync=commands.get('zero.syncProject')();await waitFor(()=>synced===syncBeforeGate+1);assert.deepEqual(progressRuns.at(-1).options,{location:15,title:'Updating from main',cancellable:false});assert.equal(progressRuns.at(-1).active,true);assert.match(webview.html,/Reading main on GitHub…/);
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
  for(const invalidation of ['signout','replacement']) {
    const originalSession=session, appliedBefore=syncApplied, dispatchesBefore=transportDispatches;
    syncUpdates=true;
    afterSyncFetch=()=>{session=invalidation==='signout'?undefined:{...session,id:'replacement-after-fetch'};authEvent({provider:{id:'zero-github'}});};
    await commands.get('zero.syncProject')();
    assert.equal(transportDispatches,dispatchesBefore+2,'The session changes after the reviewed read and fetch');
    assert.equal(syncApplied,appliedBefore,'Signing out or replacing the session during fetch cannot apply incoming main');
    assert.match(errors.at(-1),/sign-in changed|sign in/i);assert.equal(progressRuns.at(-1).active,false);
    afterSyncFetch=undefined;session=originalSession;authEvent({provider:{id:'zero-github'}});await new Promise(resolve=>setImmediate(resolve));
  }
  // Preserve the former guided-choice coverage until those mutations are restored.
  let checkpoints=0;
  await t.test('guided conflict choice and cancellation', {skip:'Custom conflict choice and cancellation are deferred.'}, async()=>{
  branch='add-score';let resolutions=0,cancellations=0;
  pendingRecovery={id:'a'.repeat(32),branch,remote,remoteBranch:'main',files:[{path:'Player.java',kind:'text',conflicts:[{id:'first',local:'speed = 5;',incoming:'speed = 3;'}]}]};
  metadata.change({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('Keep this branch’s changes'));
  const choiceToken=()=>/data-command="zero.keepLocalUpdate" data-recovery="([a-f0-9]+)"/.exec(webview.html)[1];
  const firstToken=choiceToken();
  workflow.resolveRecovery=async(_root,choice,options)=>{await options.beforeMutation();resolutions++;assert.equal(choice.path,'Player.java');pendingRecovery={...pendingRecovery,files:[{path:'Coin.java',kind:'text',conflicts:[{id:'second',local:'points = 20;',incoming:'points = 10;'}]}]};return {recovery:pendingRecovery};};
  await commands.get('zero.keepLocalUpdate')(firstToken);assert.equal(resolutions,1);assert.match(webview.html,/Coin.java/);
  await commands.get('zero.keepLocalUpdate')(firstToken);assert.equal(resolutions,1);assert.match(errors.at(-1),/choice changed/);
  vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'file',fsPath:path.join(root,'Coin.java')}}];
  await commands.get('zero.useIncomingUpdate')(choiceToken());assert.equal(resolutions,1);assert.match(errors.at(-1),/unsaved edits/);vscode.workspace.textDocuments=[];
  vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'file',fsPath:path.join(alias,'Coin.java')}}];
  await commands.get('zero.useIncomingUpdate')(choiceToken());assert.equal(resolutions,1);assert.match(errors.at(-1),/unsaved edits/);vscode.workspace.textDocuments=[];
  workflow.cancelRecovery=async(_root,options)=>{await options.beforeMutation();cancellations++;pendingRecovery=undefined;return {cancelled:true};};
  const nativeRecovery=pendingRecovery;pendingRecovery=undefined;metadata.delete({fsPath:path.join(root,'.git','MERGE_HEAD')});await waitFor(()=>!webview.html.includes('zero.keepLocalUpdate'));assert.match(webview.html,/data-command="zero.toggleApp"(?![^>]*disabled)/,'Native completion clears cached conflict controls without a menu or reload');pendingRecovery=nativeRecovery;metadata.change({fsPath:path.join(root,'.git','index')});await waitFor(()=>webview.html.includes('zero.keepLocalUpdate'));
  await commands.get('zero.cancelUpdate')(choiceToken());assert.equal(cancellations,1);assert.doesNotMatch(webview.html,/zero.keepLocalUpdate/);assert.match(webview.html,/starting checkpoint restored/);
  pendingRecovery=nativeRecovery;metadata.change({fsPath:path.join(root,'.git','index')});await waitFor(()=>webview.html.includes('zero.keepLocalUpdate'));
  workflow.resolveRecovery=async(_root,_choice,options)=>{await options.beforeMutation();pendingRecovery=undefined;return {synced:true,branch,head:currentHead,remote,page:'https://github.com/student/app'};};
  storedLocal={root,branch,head:'1'.repeat(40)};const beforeResolvedSync=transportDispatches;await commands.get('zero.keepLocalUpdate')(choiceToken());
  assert.equal(transportDispatches,beforeResolvedSync,'An unverifiable earlier local commit blocks automatic upload');assert.equal(storedLocal.head,'1'.repeat(40),'An unverifiable saved head keeps its reminder');assert.match(webview.html,/Updated add-score locally · sync needs attention/);
  pendingRecovery=nativeRecovery;metadata.change({fsPath:path.join(root,'.git','index')});await waitFor(()=>webview.html.includes('zero.keepLocalUpdate'));
  const syncHead=github.syncExistingHead;github.syncExistingHead=async()=>{throw Object.assign(new Error('offline'),{kind:'network'});};
  await commands.get('zero.keepLocalUpdate')(choiceToken());github.syncExistingHead=syncHead;
  assert.match(webview.html,/Updated add-score locally · sync needs attention/);assert.ok([...ledger.entries()].some(([key,value])=>key.startsWith('zero.pendingSync.v1:')&&value.kind==='network'&&value.head===currentHead),'Failed sync retains its exact reminder');
  branch='main';pendingRecovery={...nativeRecovery,branch};metadata.change({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('Keep my changes'));
  const beforeMainResolution=transportCalls.length, beforeMainPrepare=uploadSnapshots;
  await commands.get('zero.keepLocalUpdate')(choiceToken());
  assert.equal(transportCalls.length,beforeMainResolution,'Resolving main must not contact the upload transport');assert.equal(uploadSnapshots,beforeMainPrepare);assert.match(webview.html,/Main updated · run your app/);
  pendingRecovery={...nativeRecovery,branch,files:[],readyToCommit:true,readyFingerprint:'b'.repeat(64),nativeRequired:false};metadata.change({fsPath:path.join(root,'.git','index')});await waitFor(()=>webview.html.includes('zero.continueUpdate'));
  const continueToken=/data-command="zero.continueUpdate" data-recovery="([a-f0-9]+)"/.exec(webview.html)[1];let continuations=0;
  workflow.completeRecovery=async(_root,id,fingerprint,options)=>{await options.beforeMutation();continuations++;assert.equal(id,pendingRecovery.id);assert.equal(fingerprint,pendingRecovery.readyFingerprint);pendingRecovery=undefined;return {synced:true,branch,head:currentHead,remote,page:'https://github.com/student/app'};};
  await commands.get('zero.continueUpdate')('0'.repeat(64));assert.equal(continuations,0);assert.match(errors.at(-1),/choice changed/);
  vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'file',fsPath:path.join(root,'Coin.java')}}];await commands.get('zero.continueUpdate')(continueToken);assert.equal(continuations,0);assert.match(errors.at(-1),/unsaved edits/);vscode.workspace.textDocuments=[];
  const beforeContinue=transportCalls.length;await commands.get('zero.continueUpdate')(continueToken);assert.equal(continuations,1);assert.equal(transportCalls.length,beforeContinue);assert.match(webview.html,/Main updated · run your app/);
  branch='add-score';metadata.change({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('Current branch: add-score'));
  // Isolate the feature continuation from reminders deliberately created by
  // earlier cases; restore them after checking the real sync/reminder route.
  const savedLedger=[...ledger.entries()],savedLocal=storedLocal,savedPending=storedPending;ledger.clear();storedLocal=undefined;storedPending=undefined;
  pendingRecovery={...nativeRecovery,branch,files:[],readyToCommit:true,readyFingerprint:'c'.repeat(64),nativeRequired:false};metadata.change({fsPath:path.join(root,'.git','index')});await waitFor(()=>webview.html.includes('zero.continueUpdate'));
  const featureToken=/data-command="zero.continueUpdate" data-recovery="([a-f0-9]+)"/.exec(webview.html)[1];
  workflow.completeRecovery=async(_root,_id,_fingerprint,options)=>{await options.beforeMutation();throw Error('local commit failed');};
  const beforeFailedContinue=transportCalls.length;await commands.get('zero.continueUpdate')(featureToken);assert.equal(transportCalls.length,beforeFailedContinue,'A failed local continuation must not push');assert.match(errors.at(-1),/local commit failed/);assert.match(webview.html,/zero.continueUpdate/);
  workflow.completeRecovery=async(_root,id,fingerprint,options)=>{await options.beforeMutation();assert.equal(id,pendingRecovery.id);assert.equal(fingerprint,pendingRecovery.readyFingerprint);pendingRecovery=undefined;return {synced:true,branch,head:currentHead,remote,page:'https://github.com/student/app'};};
  const beforeFeatureContinue=transportCalls.length;await commands.get('zero.continueUpdate')(featureToken);
  assert.deepEqual(transportCalls.slice(beforeFeatureContinue),[['push',remote,`${currentHead}:refs/heads/${branch}`],['ls-remote','--heads',remote,`refs/heads/${branch}`]]);
  assert.match(webview.html,/Updated add-score · synced to GitHub/);assert.ok([...ledger.values()].some(value=>value?.reason==='confirmed'&&value.record?.head===currentHead&&value.record?.branch===branch),'Confirmed sync resolves its exact reminder');
  ledger.clear();for(const [key,value] of savedLedger)ledger.set(key,value);storedLocal=savedLocal;storedPending=savedPending;
  });
  branch='add-score';pendingRecovery=undefined;
  pendingRecovery={id:'a'.repeat(32),branch,remote,remoteBranch:'main',files:[{path:'Player.java',kind:'text',conflicts:[{id:'first',local:'speed = 5;',incoming:'speed = 3;'}]}]};
  metadata.change({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('Inspect retained conflict copies'));
  pendingRecovery=undefined;metadata.delete({fsPath:path.join(root,'.git','MERGE_HEAD')});await waitFor(()=>!webview.html.includes('Inspect retained conflict copies'));
  assert.match(webview.html,/data-command="zero.toggleApp"(?![^>]*disabled)/,'Native completion refreshes the recovery panel without a reload');
  await commands.get('zero.chooseRepository')();assert.match(picks.at(-1).items.find(item=>item.action==='sync').description,/sync this branch to GitHub/);
  workflow.checkpoint=async(_root,options)=>{await options.beforeMutation();checkpoints++;gitStatus='';return {checkpointed:true,branch,head:'f'.repeat(40)};};
  gitStatus=' M Main.java\0';warningChoice=undefined;
  for(const id of ['zero.syncProject','zero.updateBranchFromGitHub']) {
    const before={saved,synced,checkpoints,transportDispatches};await commands.get(id)();
    assert.deepEqual({saved,synced,checkpoints,transportDispatches},before,'Uncommitted work blocks update before save, auth and transport');
    assert.ok(!progressRuns.at(-1).messages.includes('Checking GitHub access…'));assert.match(errors.at(-1),/Commit or discard/);assert.equal(gitStatus,' M Main.java\0');
  }
  gitStatus='';const doc={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(alias,'Main.java')}};vscode.workspace.textDocuments=[doc];
  for(const id of ['zero.syncProject','zero.updateBranchFromGitHub']) {
    const before={saved,synced,checkpoints,transportDispatches};await commands.get(id)();
    assert.deepEqual({saved,synced,checkpoints,transportDispatches},before,'An aliased unsaved buffer blocks update before save, auth and transport');assert.ok(!progressRuns.at(-1).messages.includes('Checking GitHub access…'));assert.match(errors.at(-1),/Save or undo/);assert.equal(doc.isDirty,true);
  }
  vscode.workspace.textDocuments=[];syncUpdates=true;
  const driftDoc={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(alias,'Main.java')}};
  afterSyncFetch=()=>{vscode.workspace.textDocuments=[driftDoc];};const beforeDrift={saved,syncApplied,pushes:transportCalls.filter(args=>args[0]==='push').length};
  await commands.get('zero.syncProject')();assert.equal(syncApplied,beforeDrift.syncApplied,'Unsaved edits introduced after fetch block application');
  assert.equal(saved,beforeDrift.saved);assert.equal(transportCalls.filter(args=>args[0]==='push').length,beforeDrift.pushes);assert.match(errors.at(-1),/Save or undo/);
  afterSyncFetch=undefined;syncUpdates=false;
  const unrelated={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(path.dirname(root),'unrelated-update.txt')}};vscode.workspace.textDocuments=[unrelated];
  const beforeClean={saved,synced};await commands.get('zero.syncProject')();assert.equal(saved,beforeClean.saved,'Clean update does not save unrelated editors');assert.equal(synced,beforeClean.synced+1);assert.equal(unrelated.isDirty,true);vscode.workspace.textDocuments=[];

  // Checking a previous accepted push remains possible after newer native
  // commits and mixed staged/working changes, without uploading those changes.
  branch='pending-check';storedPending={root,remote,page:'https://github.com/student/app',branch,head:'f'.repeat(40),kind:'unconfirmed',accountId:'1',committed:true};
  currentHead='b'.repeat(40);gitStatus='MM Player.java\0';let checkedRecorded;
  github.checkUpload=async(_root,record,options)=>{checkedRecorded=record.head;await options.beforeNetwork();await options.networkRun(root,['ls-remote','--heads',remote,`refs/heads/${branch}`]);return {confirmed:true,head:record.head};};
  metadata.change({fsPath:path.join(root,'.git','refs','heads',branch)});await waitFor(()=>webview.html.includes('Check GitHub status'));
  assert.match(webview.html,/data-command="zero.commitChanges"/,'Newer local work retains the normal save action');
  const dispatchesBeforeCheck=transportCalls.length;await commands.get('zero.checkPush')();
  assert.equal(checkedRecorded,'f'.repeat(40));assert.equal(currentHead,'b'.repeat(40));assert.equal(gitStatus,'MM Player.java\0');assert.equal(storedPending.head,'f'.repeat(40));assert.ok([...ledger.entries()].some(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.record.head==='f'.repeat(40)&&value.record.branch===branch),'Confirmed legacy reminder is resolved in the ledger');
  assert.deepEqual(transportCalls.slice(dispatchesBeforeCheck).map(args=>args[0]),['ls-remote'],'Exact status checking cannot push newer local commits');

  storedPending={root,remote,page:'https://github.com/student/app',branch,head:currentHead,kind:'auth',accountId:'1',committed:true,pushStarted:true};gitStatus='';
  metadata.change({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('Sign in to GitHub'));
  const beforeReconnect=transportCalls.length;await commands.get('zero.reconnectGitHub')();
  assert.equal(storedPending.kind,'auth');assert.ok([...ledger.entries()].some(([key,value])=>key.startsWith('zero.pendingSync.v1:')&&value.kind==='ready'&&value.branch===branch),'Reconnection records a new ready reminder');assert.equal(transportCalls.length,beforeReconnect,'Reconnection never silently pushes');assert.match(webview.html,/local commits are ready to push/);assert.doesNotMatch(webview.html,/data-command="zero.reconnectGitHub"/);assert.ok(startPanels.length>0);
  const expectedRecord=storedPending;session={...session,account:{id:'2',label:'other-student'}};authEvent({provider:{id:'zero-github'}});await new Promise(resolve=>setImmediate(resolve));
  await commands.get('zero.reconnectGitHub')();assert.equal(storedPending,expectedRecord);assert.match(errors.at(-1),/does not request sign-in/);assert.equal(transportCalls.length,beforeReconnect,'A non-auth reminder cannot be rewritten by Reconnect');
  session={...session,account:{id:'1',label:'student'}};authEvent({provider:{id:'zero-github'}});await new Promise(resolve=>setImmediate(resolve));storedPending=undefined;branch='add-score';gitStatus='';syncUpdates=false;workflow.syncPrepared=async()=>{branch='main';return {updated:true,branch:'main',head:'c'.repeat(40),remoteHead:'c'.repeat(40),remoteBranch:'main',confirmedFinish:{branch:'add-score',featureHead:'f'.repeat(40)}};};const mergeLogStart=logs.length;await commands.get('zero.syncProject')();assert.match(webview.html,/Earlier merge confirmed · switched to main/);await waitFor(()=>logs.slice(mergeLogStart).some(line=>/local feature branch was kept/.test(line)), 'Confirmed merge should report that the local feature branch was kept');
  {const originalPrepare=workflow.prepareSync,originalSync=workflow.syncPrepared,receipt=path.join(root,'.git','zero-commit-provenance.json');await fs.writeFile(receipt,'retained authority');for(const kind of ['reftableArchived','reftableUpdate']){branch='add-score';let applied=0;workflow.prepareSync=async()=>({...plan(),refStorage:'reftable',[kind]:kind==='reftableArchived'?{id:'c'.repeat(40),feature:'f'.repeat(40)}:true,preview:{paths:1,fileNames:['src/Example.java']}});workflow.syncPrepared=async()=>{applied++;};statusEnvironments.length=0;const previousDispatch=dispatch.length;warningChoice='Open Source Control';await commands.get('zero.syncProject')();assert.equal(applied,0);assert.match(warnings.at(-1),/temporarily unavailable.*files and commits are kept/i);assert.equal(dispatch[previousDispatch],'workbench.view.scm');assert.equal(await fs.readFile(receipt,'utf8'),'retained authority');assert.ok(statusEnvironments.length>0);assert.ok(statusEnvironments.every(value=>value==='0'));}await fs.unlink(receipt);workflow.prepareSync=originalPrepare;workflow.syncPrepared=originalSync;warningChoice=undefined;branch='add-score';}

  // The compatibility native checkout must participate too, including when
  // there are no dirty files and checkpointBefore is a no-op.
  const native={rootUri:{fsPath:root}},receipt=path.join(root,'.git','zero-commit-provenance.json');let nativeCheckouts=0;
  vscode.extensions={getExtension:()=>({isActive:true,exports:{getAPI:()=>({getRepository:()=>native,repositories:[native]})}})};
  vscode.commands.executeCommand=async id=>{if(id==='git.checkout'){nativeCheckouts++;assert.ok(await fs.stat(phaseLock));await assert.rejects(fs.stat(receipt),{code:'ENOENT'});}};
  await fs.writeFile(phaseLock,'occupied');await commands.get('zero.switchBranch')();assert.equal(nativeCheckouts,0);assert.equal(await fs.readFile(phaseLock,'utf8'),'occupied');assert.match(errors.at(-1),/Another Zero action/);
  await fs.unlink(phaseLock);await fs.writeFile(receipt,'old evidence');statusEnvironments.length=0;await commands.get('zero.switchBranch')();assert.equal(nativeCheckouts,1);assert.ok(statusEnvironments.length>0,'Clean checkpoint checks status');assert.ok(statusEnvironments.every(value=>value==='0'),'Clean checkpoint status cannot refresh the index');await assert.rejects(fs.stat(phaseLock),{code:'ENOENT'});

  // A guarded native no-op can confirm a retained merge boundary through
  // ancestry without issuing a new push. Resolve only that exact prior record.
  for(const noPush of ['recover','sync']) {
    ledger.clear();storedPending=undefined;storedLocal=undefined;pendingRecovery=undefined;branch='add-score';gitStatus='';mode='live';accessFailure=undefined;syncError=undefined;finishError=undefined;cleanupError=undefined;
    const confirmedHead='b'.repeat(40),confirmed={id:`confirmed-${noPush}`,root,remote,page:'https://github.com/student/app',branch:'add-score',head:confirmedHead,operation:'merge',accountId:'1',kind:'network'},unrelated={...confirmed,id:`unrelated-${noPush}`,head:'d'.repeat(40)};
    ledger.set('zero.pendingSync.v1:'+confirmed.id,confirmed);ledger.set('zero.pendingSync.v1:'+unrelated.id,unrelated);
    const beforeNoPush=transportCalls.filter(args=>args[0]==='push').length;
    if(noPush==='recover'){
      finishDrift=true;workflow.preparePendingFinishRecovery=async()=>({...plan(),pending:{id:confirmedHead}});workflow.recoverPendingFinish=async()=>({recovered:true,branch:'add-score',finishedHead:confirmedHead,remoteHead:'c'.repeat(40),remote});
      await commands.get('zero.finishChange')();finishDrift=false;
    }else{
      workflow.syncPrepared=async()=>{branch='main';return {updated:true,branch:'main',head:'c'.repeat(40),remoteHead:'c'.repeat(40),remoteBranch:'main',remote,confirmedFinish:{branch:'add-score',featureHead:'f'.repeat(40),head:confirmedHead}};};
      await commands.get('zero.syncProject')();
    }
    assert.equal(transportCalls.filter(args=>args[0]==='push').length,beforeNoPush);
    const confirmedMarkers=[...ledger.entries()].filter(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.reason==='confirmed').map(([,value])=>value.id);
    assert.ok(confirmedMarkers.includes(confirmed.id),`${noPush} must reconcile the exact confirmed merge`);assert.ok(!confirmedMarkers.includes(unrelated.id));assert.ok(ledger.has('zero.pendingSync.v1:'+confirmed.id));assert.ok(ledger.has('zero.pendingSync.v1:'+unrelated.id));
  }
  assert.equal(deleted,0,'Recovery and Sync leave the feature branch alone');

  ledger.clear();branch='add-score';warningChoice='Merge';cleanupSelection='cancel';
  const beforeCleanupCancel={executed,deleted,transportDispatches,warnings:warnings.length};
  await commands.get('zero.finishChange')();
  assert.deepEqual({executed,deleted,transportDispatches,warnings:warnings.length},beforeCleanupCancel);
  const cleanupPick=picks.at(-1);
  assert.equal(cleanupPick.options.canPickMany,true);
  assert.deepEqual(cleanupPick.items,[{label:'Delete add-score after the merge',detail:'Delete local refs/heads/add-score and GitHub refs/heads/add-score in https://github.com/student/app.',picked:true}]);
  assert.match(webview.html,/>Merge cancelled<\/p>/);

  cleanupSelection=undefined;warningChoice=undefined;
  await commands.get('zero.finishChange')();
  assert.deepEqual({executed,deleted,transportDispatches},{executed:beforeCleanupCancel.executed,deleted:beforeCleanupCancel.deleted,transportDispatches:beforeCleanupCancel.transportDispatches});
  assert.match(warningDetails.at(-1).options.detail,/delete local refs\/heads\/add-score and GitHub refs\/heads\/add-score in https:\/\/github\.com\/student\/app/);

  warningChoice='Merge';retainedFinish={id:'f'.repeat(40)};
  const picksBeforeRetry=picks.length,dispatchesBeforeRetry=transportCalls.length;
  await commands.get('zero.finishChange')();retainedFinish=undefined;
  assert.equal(picks.length,picksBeforeRetry,'Retrying a retained finish omits cleanup');
  assert.equal(deleted,0);
  assert.deepEqual(transportCalls.slice(dispatchesBeforeRetry).map(args=>args[0]),['push','ls-remote']);

  const ref='refs/heads/add-score',featureHead='f'.repeat(40);
  branch='add-score';remoteFeatureHead=featureHead;
  const dispatchesBeforeCleanup=transportCalls.length;
  await commands.get('zero.finishChange')();
  assert.deepEqual(transportCalls.slice(dispatchesBeforeCleanup),[
    ['push',remote,`${featureHead}:refs/heads/main`],['ls-remote','--heads',remote,'refs/heads/main'],
    ['ls-remote','--heads',remote,'refs/heads/main'],['ls-remote','--heads',remote,ref],
    ['ls-remote','--heads',remote,'refs/heads/main'],
    ['push',`--force-with-lease=${ref}:${featureHead}`,remote,`:${ref}`],['ls-remote','--heads',remote,ref]
  ]);
  assert.equal(deleted,1);assert.equal(remoteFeatureHead,null);
  assert.match(webview.html,/>Merged to main · branch deleted<\/p>/);
  assert.match(logs.at(-1),/local feature branch was deleted.*GitHub feature branch was deleted/);

  for(const drift of ['local ref','GitHub ref','destination','installation','session','unconfirmed delete','local delete failure']) {
    ledger.clear();branch='add-score';remoteFeatureHead=featureHead;localFeatureHead=featureHead;
    const beforeRemote=remote,beforeInstallation=installationId,beforeSession=session;
    afterFinish=()=>{
      if(drift==='local ref')localFeatureHead='b'.repeat(40);
      if(drift==='GitHub ref')remoteFeatureHead='b'.repeat(40);
      if(drift==='destination')remote='https://github.com/student/other.git';
      if(drift==='installation')installationId++;
      if(drift==='session'){session={...session,id:'cleanup-sign-in-changed'};authEvent({provider:{id:'zero-github'}});}
      if(drift==='unconfirmed delete')remoteDeleteError=new Error('Network disconnected');
      if(drift==='local delete failure')cleanupError=Object.assign(new Error('Unconfirmed local deletion'),{refOutcomeUncertain:true});
    };
    const beforeDrift={errors:errors.length,dispatches:transportCalls.length,deleted};
    await commands.get('zero.finishChange')();
    const deletes=transportCalls.slice(beforeDrift.dispatches).filter(args=>args[0]==='push'&&args.length===4);
    assert.equal(deleted,beforeDrift.deleted,`${drift} must not complete local deletion`);
    assert.equal(deletes.length,['unconfirmed delete','local delete failure'].includes(drift)?1:0,drift);
    assert.equal(errors.length,beforeDrift.errors,'Cleanup does not report a merge failure');
    assert.match(webview.html,/>Merged to main · branch cleanup needs attention<\/p>/,drift);
    if(drift==='local delete failure')assert.match(logs.at(-1),/Local branch deletion could not be confirmed.*GitHub feature branch was deleted/);
    if(drift==='unconfirmed delete')assert.match(logs.at(-1),/local feature branch was kept.*GitHub branch deletion could not be confirmed/);
    afterFinish=remoteDeleteError=cleanupError=undefined;remote=beforeRemote;installationId=beforeInstallation;
    if(drift==='session'){session=beforeSession;authEvent({provider:{id:'zero-github'}});await new Promise(resolve=>setImmediate(resolve));}
  }

});
