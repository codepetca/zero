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

test('branch creation and merges are direct, serialized and recover conflicts through native Git', async t => {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-workflow-ui-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');
  const original = {git:core.git,resolve:core.resolveProject,assert:core.assertRepositoryRoot,prepare:github.prepareUpload,...workflow};
  t.after(()=>{core.git=original.git;core.resolveProject=original.resolve;core.assertRepositoryRoot=original.assert;github.prepareUpload=original.prepare;for(const key of Object.keys(workflow))workflow[key]=original[key];});
  let projectResolves=0;
  core.resolveProject=(...args)=>{projectResolves++;return original.resolve(...args);};
  let branch='main',mode='simulation',session={id:'session',account:{id:'1',label:'student'},accessToken:'NEVER_RENDER_TOKEN'},authEvent,provider,publishedState;
  let accessFailure,accessGate,repositoryId=12,installationId=99;const accesses=[];
  let saved=0,authCalls=0,prepared=0,executed=0,deleted=0,input,choice,prepareGate,pickGate,warningGate,finishError,cleanupError,finishUpdates=false,nativeScm=true;
  const commands=new Map(),picks=[],reviews=[],warnings=[],errors=[],notices=[],dispatch=[],deletions=[],logs=[],metadata={},progressRuns=[];
  core.assertRepositoryRoot=async()=>root;
  core.git=async(_,args)=>{if(args[0]==='remote')return 'https://github.com/student/app.git';if(args[0]==='symbolic-ref')return branch;throw new Error('Unexpected Git mutation');};
  github.prepareUpload=async()=>({remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,changes:[],summary:'No changes'});
  const plan = () => ({root,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,head:'f'.repeat(40),mainHead:'a'.repeat(40),remoteMainHead:'a'.repeat(40),summary:'Reviewed change',changedPaths:['Main.java']});
  workflow.prepareStart=async()=>{prepared++;return plan();};workflow.prepareFinish=async()=>{prepared++;const captured=plan();if(prepareGate)await prepareGate;return captured;};
  workflow.startPrepared=async()=>{executed++;branch='add-score';return {branch,head:'f'.repeat(40)};};
  workflow.finishPrepared=async(_,options)=>{executed++;await options.beforeNetwork();if(finishError)throw finishError;if(finishUpdates)return {updated:true,finished:false,branch,head:'f'.repeat(40)};branch='main';return {finished:true,branch,finishedBranch:'add-score',head:'f'.repeat(40)};};
  workflow.deleteFinishedBranch=async(...args)=>{deletions.push(args);if(cleanupError)throw cleanupError;deleted++;};
  const vscode={
    ProgressLocation:{Notification:15},
    authentication:{getSession:async(provider,scopes)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);authCalls++;return session;},onDidChangeSessions:fn=>{authEvent=fn;return disposable();},registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},
    workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?(mode??fallback):fallback}),saveAll:async()=>{saved++;return true;},createFileSystemWatcher:pattern=>pattern==='**/.git/{HEAD,config}'?{onDidCreate:fn=>{metadata.create=fn;return disposable();},onDidChange:fn=>{metadata.change=fn;return disposable();},onDidDelete:fn=>{metadata.delete=fn;return disposable();},dispose(){}}:{onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}},onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{withProgress:async(options,work)=>{const run={options,messages:[],active:true};progressRuns.push(run);try{return await work({report:({message})=>run.messages.push(message)});}finally{run.active=false;}},createOutputChannel:()=>({appendLine(text){logs.push(text);},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,
      showQuickPick:async(items,options)=>{picks.push({items,options});if(pickGate)await pickGate;return choice===undefined?undefined:items.find(item=>item.action===choice || item.command===choice);},showInputBox:async()=>input,
      showWarningMessage:async text=>{warnings.push(text);if(warningGate)await warningGate;},
      showInformationMessage:async(text,options)=>{notices.push(text);if(options?.modal){reviews.push({text,options});assert.fail('Branch creation, merge and finished-branch cleanup must not confirm');}},showErrorMessage:async text=>{errors.push(text);}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async id=>{dispatch.push(id);},getCommands:async()=>nativeScm?['workbench.view.scm']:[]},
    env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?textInputs(vscode):oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  const subscriptions=[];t.after(()=>subscriptions.forEach(value=>value.dispose()));extension.activate({subscriptions,workspaceState:{get:key=>key==='zero.webPublish.lastLive'?publishedState:true}},{provider:appSessions(vscode,{dispose(){},async removeSession(){session=undefined;}}),repositories:{async checkSetup(){return {};},async access(url,{ticket,permissions}){accesses.push({url,ticket,permissions});assert.equal(url,'https://github.com/student/app');assert.deepEqual(permissions,{contents:'write'});assert.equal(ticket.session.accountId,'1');assert.equal(ticket.session.accessToken,'NEVER_RENDER_TOKEN');if(accessGate)await accessGate;if(accessFailure)throw accessFailure;return {ticket,repository:{id:repositoryId},installation:{id:installationId}};}}});
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
  let releaseWarning;warningGate=new Promise(resolve=>{releaseWarning=resolve;});const authBefore=authCalls;
  await commands.get('zero.startChange')();await commands.get('zero.finishChange')();await commands.get('zero.uploadToGitHub')();
  assert.equal(saved,0);assert.equal(prepared,0);assert.equal(executed,0);assert.equal(authCalls,authBefore);assert.equal(accesses.length,0);assert.match(warnings[0],/nothing changed/);
  assert.doesNotMatch(webview.html,/data-command="zero.startChange"[^>]* disabled/);releaseWarning();warningGate=undefined;
  mode=undefined;input=undefined;await commands.get('zero.startChange')();assert.equal(saved,0);assert.equal(prepared,0);
  assert.equal(progressRuns.length,0,'Simulation and cancelling the name prompt start no progress or network work');
  input='add-score';let releaseAccess;accessGate=new Promise(resolve=>{releaseAccess=resolve;});
  const starting=commands.get('zero.startChange')();await waitFor(()=>progressRuns.at(-1)?.messages.includes('Checking repository access…'));
  const activeProgress=progressRuns.at(-1);assert.equal(activeProgress.active,true);assert.deepEqual(activeProgress.options,{location:15,title:'Creating branch add-score',cancellable:false});
  assert.match(webview.html,/Checking repository access…/);assert.match(webview.html,/data-command="zero.chooseRepository"[^>]* disabled/);
  await commands.get('zero.startChange')();assert.equal(progressRuns.length,1,'A repeat click cannot start another operation');
  releaseAccess();await starting;accessGate=undefined;assert.equal(activeProgress.active,false);assert.equal(prepared,1);assert.equal(executed,1);assert.equal(accesses.length,2);assert.equal(reviews.length,0,'Naming a branch needs no additional confirmation');assert.doesNotMatch(webview.html,/Simulation — nothing will be uploaded/);assert.match(webview.html,/add-score<\/span>/);
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['finish']);
  let releasePrepare;prepareGate=new Promise(resolve=>{releasePrepare=resolve;});const preparedBeforeFinish=prepared;const pending=commands.get('zero.finishChange')();await waitFor(()=>prepared>preparedBeforeFinish, 'Finish preparation should start directly');
  const before={saved,prepared,authCalls};for(const id of ['zero.startChange','zero.finishChange','zero.uploadToGitHub','zero.githubAccount','zero.chooseRepository','zero.chooseBranch','zero.connectRepository','zero.signInToGitHub'])await commands.get(id)();
  assert.deepEqual({saved,prepared,authCalls},before);assert.match(webview.html,/data-command="zero.finishChange"[^>]* disabled/);
  session={...session,id:'changed'};authEvent({provider:{id:'zero-github'}});releasePrepare();await pending;prepareGate=undefined;
  assert.equal(executed,1,'Changed account cannot execute the reviewed finish');assert.equal(deleted,0);assert.match(errors.at(-1),/sign-in changed/);
  finishError=Object.assign(new Error('Merge conflicts need your attention'),{conflict:true});await commands.get('zero.finishChange')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.equal(deleted,0);assert.match(notices.join('\n'),/Stage the resolved files/);assert.match(webview.html,/add-score<\/span>/);
  nativeScm=false;await commands.get('zero.finishChange')();assert.match(notices.at(-1),/Open Source Control/);assert.equal(deleted,0);
  finishError=undefined;finishUpdates=true;const beforeUpdates=reviews.length;await commands.get('zero.finishChange')();assert.equal(deleted,0);assert.equal(reviews.length,beforeUpdates);assert.match(webview.html,/Branch updated\. Run App, then Merge to main\./);assert.equal(branch,'add-score');
  finishUpdates=false;await commands.get('zero.finishChange')();assert.equal(deleted,1);assert.equal(reviews.length,0,'Successful merge deletes the local branch without a popup');assert.match(webview.html,/main<\/span>/);assert.deepEqual(deletions[0],[root,'add-score','f'.repeat(40)]);assert.match(webview.html,/>Merged to main<\/p>/);assert.match(logs.at(-1),/Finished local branch deleted/);assert.ok(!notices.some(text=>/Started add-score|Merged change and pushed main|Main updates added/.test(text)),'Successful Git outcomes never toast');
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
  for(const action of ['zero.startChange','zero.finishChange'])for(const replacement of ['repository','installation']){
    branch=action==='zero.startChange'?'main':'add-score';input='add-score';
    const field=action==='zero.startChange'?'prepareStart':'prepareFinish',before=workflow[field],count=executed;
    workflow[field]=async()=>{prepared++;if(replacement==='repository')repositoryId++;else installationId++;return plan();};
    await commands.get(action)();assert.equal(executed,count,'Replacement IDs must stop before branch mutation');assert.match(errors.at(-1),/repository or Zero installation changed/);workflow[field]=before;
  }
  input='add-score';accessFailure=new Error('This repository is not available to Zero. Add it to Zero’s selected repositories on GitHub.');
  const beforeDenied={executed,deleted};await commands.get('zero.startChange')();
  assert.deepEqual({executed,deleted},beforeDenied,'Denied selected-repository access must stop branch creation before dispatch');assert.match(errors.at(-1),/selected repositories/);
  assert.equal(progressRuns.at(-1).active,false,'Failure closes native progress');assert.doesNotMatch(webview.html,/data-command="zero.chooseRepository"[^>]* disabled/,'Failure releases busy controls');
  accessFailure=undefined;

});
