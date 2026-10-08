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
  const originalGit=core.git;core.git=async()=>{mutations++;throw new Error('Unexpected git');};t.after(()=>{core.git=originalGit;});
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async()=>({id:'test-session',account:{id:'student',label:'student'},accessToken:'INTERCEPTED'}),onDidChangeSessions:disposable},
    workspace:{getConfiguration:(section,uri)=>({get:()=> {if(section!=='zero') return false; assert.equal(uri?.fsPath,root,'Upload mode must use the student folder scope, overriding global live'); return mode;}}),onDidChangeConfiguration:disposable,workspaceFolders:[{uri:{fsPath:root}}],saveAll:async()=>{saved++;if(saveGate) await saveGate;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable},
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
  const commands=new Map(),authCalls=[],notices=[],errors=[],opened=[];let session,authEvent,webviewProvider,repo;let gitChanges=0;
  let dismissWarning; const warningPending=new Promise(resolve=>{dismissWarning=resolve;});t.after(()=>dismissWarning());
  const oldAssert=core.assertRepositoryRoot;core.assertRepositoryRoot=async()=>root;t.after(()=>{core.assertRepositoryRoot=oldAssert;});
  const oldGit=core.git;core.git=async(_,args)=>{if(args[0]==='rev-parse') return root;if(args[0]==='remote'&&args[1]==='get-url'){if(!repo)throw new Error('no origin');return repo;}gitChanges++;throw new Error('Unexpected mutation');};t.after(()=>{core.git=oldGit;});
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{authCalls.push({provider,scopes,options});return session;},onDidChangeSessions:fn=>{authEvent=fn;return disposable();}},
    workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(_,fallback)=>section==='zero'?'simulation':fallback}),saveAll:async()=>true,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showInformationMessage:async message=>{notices.push(message);},showWarningMessage:async message=>{notices.push(message);await warningPending;},showInputBox:async()=>undefined,showErrorMessage:async message=>{errors.push(message);}},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    env:{openExternal:async uri=>{opened.push(uri);return true;},clipboard:{writeText:async()=>{}}},Uri:{file:fsPath=>({fsPath}),parse:url=>({url})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}const subscriptions=[];t.after(()=>subscriptions.forEach(value=>value.dispose()));
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}});
  const webview={html:'',onDidReceiveMessage:disposable};const candidate={webview,onDidDispose:disposable};webviewProvider.resolveWebviewView(candidate);
  const settle=async()=>{for(let i=0;i<6;i++) await new Promise(resolve=>setImmediate(resolve));};await settle();
  assert.match(webview.html,/Sign in to GitHub/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"|data-command="zero.createRepository"/);
  assert.ok(authCalls.every(call=>call.options.silent));
  let simulationFinished=false;const simulation=commands.get('zero.uploadToGitHub')().then(()=>{simulationFinished=true;});
  await settle();assert.equal(simulationFinished,true,'Simulation must release commands while its notification is still open');
  assert.doesNotMatch(webview.html,/data-command="zero.signInToGitHub" disabled/,'Sign-in must remain available before notification dismissal');
  assert.match(notices.at(-1),/Simulation only/);assert.equal(gitChanges,0);dismissWarning();await simulation;
  await commands.get('zero.signInToGitHub')();assert.match(errors.at(-1),/Sign in to GitHub/);assert.equal(authCalls.at(-1).options.createIfNone,true);
  session={id:'student-session',account:{id:'student',label:'student'},accessToken:'PRIVATE'};
  await commands.get('zero.signInToGitHub')();assert.match(webview.html,/Signed in as student/);assert.match(webview.html,/Create repository/);assert.match(webview.html,/Connect existing repository/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"/);
  await commands.get('zero.createRepository')();assert.equal(opened[0].url,'https://github.com/new');assert.match(notices.at(-1),/empty GitHub repository/);assert.match(notices.at(-1),/README, .gitignore and license unselected/);
  await commands.get('zero.signInToGitHub')();assert.equal(authCalls.at(-1).options.clearSessionPreference,true);
  repo='https://github.com/student/app.git';webviewProvider.resolveWebviewView(candidate);await settle();
  assert.match(webview.html,/Upload to GitHub/);assert.match(webview.html,/Copy repository link/);assert.doesNotMatch(webview.html,/Create repository|Connect existing repository/);assert.doesNotMatch(webview.html,/PRIVATE/);
  session=undefined;authEvent({provider:{id:'github'}});await settle();assert.match(webview.html,/Sign in to GitHub/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"/);
  assert.equal(gitChanges,0);assert.ok(webview.html.includes('zero.runApp'),'Local Run is always available');
});
