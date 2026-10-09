'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const github = require('../src/github');
const disposable = () => ({dispose(){}});
test('commands simulate upload without Git and share task ownership across shortcut, restart and stop', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-extension-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,'mvnw'),'');
  const commands = new Map();const starts=[];const ends=[];const launches=[];const notices=[];let provider, saved=0, mutations=0, saveGate, mode='simulation', confirmUpload;
  const originalGit=core.git;core.git=async(_,args)=>{if (args[0] === 'remote' || args[0] === 'rev-parse' || args[0] === 'symbolic-ref') throw new Error('No repository'); mutations++;throw new Error('Unexpected git');};t.after(()=>{core.git=originalGit;});
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async()=>({id:'test-session',account:{id:'student',label:'student'},accessToken:'INTERCEPTED'}),onDidChangeSessions:disposable},
    workspace:{getConfiguration:(section,uri)=>({get:()=> {if(section!=='zero') return false; assert.equal(uri?.fsPath,root,'Upload mode must use the student folder scope, overriding global live'); return mode;}}),onDidChangeConfiguration:disposable,workspaceFolders:[{uri:{fsPath:root}}],saveAll:async()=>{saved++;if(saveGate) await saveGate;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable},
    window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showWarningMessage:async text=>{notices.push(text);},showInputBox:async()=> 'Describe changes',showInformationMessage:async(text,options)=>{notices.push(text);if(options?.modal) return confirmUpload;},showErrorMessage:async text=>{throw new Error(text);}},
    tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTask:fn=>{ends.push(fn);return disposable();},registerTaskProvider:(_,value)=>{provider=value;return disposable();},executeTask:async task=>{const execution={task,terminate(){ends.forEach(fn=>fn({execution}));}};launches.push(execution);starts.forEach(fn=>fn({execution}));return execution;}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    Task,TaskScope:{Workspace:2},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2},ShellQuoting:{Strong:2},ProcessExecution:class{constructor(command,args,options){Object.assign(this,{command,args,options});}},ShellExecution:class{},
    EventEmitter:class{event(){}fire(){}dispose(){}},Uri:{file:fsPath=>({fsPath})}
  };
  const originalLoad=Module._load;Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try {extension=require('../src/extension');}finally{Module._load=originalLoad;}
  extension.activate({subscriptions:[],workspaceState:{get:()=>true,update:async()=>{}}});
  await commands.get('zero.uploadToGitHub')();
  assert.match(notices[0],/Simulation only — nothing uploaded/);assert.equal(mutations,0);
  await commands.get('zero.runApp')();assert.equal(launches.length,1);assert.equal(saved,1);
  assert.deepEqual(launches[0].task.execution.args,['clean','compile','javafx:run']);assert.equal(launches[0].task.matcher,'$zero-java');
  await commands.get('zero.runApp')();assert.equal(launches.length,2);
  await commands.get('zero.stopApp')();
  assert.deepEqual(await provider.provideTasks(),[], 'Detected executable tasks would bypass the save/restart resolver');
  const shortcut=await provider.resolveTask({definition:{type:'zero',task:'run'},scope:2});
  await vscode.tasks.executeTask(shortcut);assert.equal(saved,3);
  const rerun=await provider.resolveTask({definition:{type:'zero',task:'run'},scope:2});
  await vscode.tasks.executeTask(rerun);assert.equal(saved,4);
  await commands.get('zero.stopApp')();assert.equal(launches.length,4);
  let releaseSave;
  saveGate = new Promise(resolve => {releaseSave=resolve;});
  const pendingRun = commands.get('zero.runApp')();
  const queuedRun = commands.get('zero.runApp')();
  while(saved < 5) await new Promise(resolve => setImmediate(resolve));
  await commands.get('zero.stopApp')();
  releaseSave();
  await Promise.all([pendingRun,queuedRun]);
  assert.equal(launches.length,4,'Stop must cancel saving and queued Run requests');
  saveGate=undefined; mode='live';
  const originals={prepare:github.prepareUpload,upload:github.uploadPrepared};
  t.after(()=>{github.prepareUpload=originals.prepare;github.uploadPrepared=originals.upload;});
  let reviewed=0, uploaded=0;
  github.prepareUpload=async()=>{reviewed++;return {page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch:'main',summary:'1 changed path',changes:[{kind:'M',path:'Main.java'}]};};
  github.uploadPrepared=async(plan,message)=>{uploaded++;assert.equal(message,'Describe changes');return {head:'a'.repeat(40),branch:plan.branch,uploaded:true};};
  await commands.get('zero.uploadToGitHub')();
  assert.equal(reviewed,1);assert.equal(uploaded,0,'Cancel must not call the commit/push engine');
  let releaseReview;
  github.prepareUpload=async()=>{await new Promise(resolve=>{releaseReview=resolve;});return {page:'https://github.com/student/app',branch:'main',summary:'No changes',changes:[]};};
  const heldUpload=commands.get('zero.uploadToGitHub')();
  while(!releaseReview) await new Promise(resolve=>setImmediate(resolve));
  await commands.get('zero.connectRepository')();
  await commands.get('zero.githubAccount')();
  await commands.get('zero.chooseRepository')();
  assert.equal(mutations,0,'Connect must not mutate origin while an upload review is pending');
  releaseReview(); await heldUpload;
  github.prepareUpload=async()=>({page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch:'main',summary:'1 changed path',changes:[{kind:'M',path:'Main.java'}]});
  confirmUpload='Commit & Upload';
  await commands.get('zero.uploadToGitHub')();
  assert.equal(uploaded,1);assert.match(notices.at(-1),/Uploaded aaaaaaa/);
  assert.equal(mutations,0,'All real transport is mocked in the live UI test');
});

test('minimal GitHub section follows native sign-in and connection state; browser creation and simulation stay explicit', async t => {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,'mvnw'),'');
  await core.git(root,['init','-b','main']);
  const commands=new Map(),authCalls=[],notices=[],errors=[],opened=[],picks=[],dispatched=[],copied=[];let session,authEvent,webviewProvider,repo,nextChoice,inputCount=0,nativeAccountsAvailable=true;let gitChanges=0;
  let dismissWarning; const warningPending=new Promise(resolve=>{dismissWarning=resolve;});t.after(()=>dismissWarning());
  let reportWarning; const warningShown=new Promise(resolve=>{reportWarning=resolve;});
  const oldAssert=core.assertRepositoryRoot;core.assertRepositoryRoot=async()=>root;t.after(()=>{core.assertRepositoryRoot=oldAssert;});
  const oldGit=core.git;core.git=async(_,args)=>{if(args[0]==='rev-parse') return root;if(args[0]==='symbolic-ref')return 'main';if(args[0]==='remote'&&args[1]==='get-url'){if(!repo)throw new Error('no origin');return repo;}gitChanges++;throw new Error('Unexpected mutation');};t.after(()=>{core.git=oldGit;});
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{authCalls.push({provider,scopes,options});return session;},onDidChangeSessions:fn=>{authEvent=fn;return disposable();}},
    workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(_,fallback)=>section==='zero'?'simulation':fallback}),saveAll:async()=>true,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showInformationMessage:async message=>{notices.push(message);},showWarningMessage:async message=>{notices.push(message);reportWarning();await warningPending;},showQuickPick:async(items,options)=>{picks.push({items,options});return items.find(item=>item.action===nextChoice);},showInputBox:async()=>{inputCount++;return undefined;},showErrorMessage:async message=>{errors.push(message);}},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},getCommands:async()=>nativeAccountsAvailable?['workbench.action.manageAccounts']:[],executeCommand:async id=>{dispatched.push(id);}},
    env:{openExternal:async uri=>{opened.push(uri);return true;},clipboard:{writeText:async text=>{copied.push(text);}}},Uri:{file:fsPath=>({fsPath}),parse:url=>({url})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}const subscriptions=[];t.after(()=>subscriptions.forEach(value=>value.dispose()));
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}});
  const webview={html:'',onDidReceiveMessage:disposable};const candidate={webview,onDidDispose:disposable};webviewProvider.resolveWebviewView(candidate);
  const settle=async predicate=>{
    const deadline=Date.now()+5000;
    while(!predicate()) {
      assert.ok(Date.now()<deadline,'Expected asynchronous sidebar state did not arrive');
      await new Promise(resolve=>setImmediate(resolve));
    }
  };await settle(()=>authCalls.length>0 && /Sign in to GitHub/.test(webview.html));
  assert.match(webview.html,/Sign in to GitHub/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"|data-command="zero.createRepository"/);
  assert.match(webview.html,/class="account"[^>]*aria-label="Sign in to GitHub"/);
  assert.match(webview.html,/aria-hidden="true"/);assert.match(webview.html,/Connect a repo/);
  assert.ok(authCalls.every(call=>call.options.silent));
  await commands.get('zero.chooseRepository')();
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['create','connect']);
  assert.equal(inputCount,0,'Cancelled repository menu has no input or mutation');
  nextChoice='connect';await commands.get('zero.chooseRepository')();
  assert.equal(inputCount,1,'Signed-out students can connect locally; cancelling input makes no changes');
  let simulationFinished=false;const simulation=commands.get('zero.uploadToGitHub')().then(()=>{simulationFinished=true;});
  await warningShown;await settle(()=>simulationFinished);assert.equal(simulationFinished,true,'Simulation must release commands while its notification is still open');
  assert.doesNotMatch(webview.html,/data-command="zero.githubAccount"[^>]* disabled/,'Account icon must remain available before notification dismissal');
  assert.match(notices.at(-1),/Simulation only/);assert.equal(gitChanges,0);dismissWarning();await simulation;
  await commands.get('zero.githubAccount')();assert.match(errors.at(-1),/Sign in to GitHub/);assert.equal(authCalls.at(-1).options.createIfNone,true);
  nextChoice='create';await commands.get('zero.chooseRepository')();assert.equal(opened.length,0,'Cancelled sign-in cannot open repository creation');
  session={id:'student-session',account:{id:'student',label:'student'},accessToken:'PRIVATE'};
  await commands.get('zero.signInToGitHub')();assert.match(webview.html,/title="Signed in as student"/);assert.match(webview.html,/>S<\/button>/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"|data-command="zero.createRepository"|data-command="zero.signInToGitHub"/);
  await commands.get('zero.chooseRepository')();assert.equal(opened[0].url,'https://github.com/new');assert.match(notices.at(-1),/empty GitHub repository/);assert.match(notices.at(-1),/README, .gitignore and license unselected/);
  nextChoice=undefined;await commands.get('zero.githubAccount')();
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['change','signOut']);
  nextChoice='signOut';await commands.get('zero.githubAccount')();assert.equal(dispatched.at(-1),'workbench.action.manageAccounts','Sign-out belongs to native VS Code Accounts controls');
  const dispatchCount=dispatched.length;nativeAccountsAvailable=false;await commands.get('zero.githubAccount')();
  assert.equal(dispatched.length,dispatchCount);assert.match(notices.at(-1),/Accounts menu.*Sign Out/,'Older editors get usable native sign-out guidance');nativeAccountsAvailable=true;
  nextChoice='change';await commands.get('zero.githubAccount')();assert.equal(authCalls.at(-1).options.clearSessionPreference,true);
  repo='https://github.com/student/app.git';webviewProvider.resolveWebviewView(candidate);await settle(()=>/Upload changes/.test(webview.html) && />student\/app<\/button>/.test(webview.html));
  assert.match(webview.html,/Upload changes/);assert.match(webview.html,/>student\/app<\/button>/);assert.doesNotMatch(webview.html,/Create repository|Connect existing repository|Copy repository link/);assert.doesNotMatch(webview.html,/PRIVATE/);
  nextChoice='copy';await commands.get('zero.chooseRepository')();assert.equal(copied.at(-1),'https://github.com/student/app');
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['copy','connect']);
  session={...session,account:{id:'student',label:'<img src=x onerror="bad">'}};authEvent({provider:{id:'github'}});await settle(()=>webview.html.includes('&lt;img src=x onerror=&quot;bad&quot;&gt;'));
  assert.match(webview.html,/&lt;img src=x onerror=&quot;bad&quot;&gt;/);assert.doesNotMatch(webview.html,/<img|PRIVATE/,'Account labels must be escaped and tokens excluded');
  session=undefined;authEvent({provider:{id:'github'}});await settle(()=>/Sign in to GitHub/.test(webview.html) && !/data-command="zero.uploadToGitHub"/.test(webview.html));assert.match(webview.html,/Sign in to GitHub/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"/);
  assert.match(webview.html,/>student\/app<\/button>/,'Connected repository stays visible after sign-out');
  assert.equal(gitChanges,0);assert.ok(webview.html.includes('zero.runApp'),'Local Run is always available');
});
