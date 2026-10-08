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
  github.prepareUpload=async()=>{reviewed++;return {page:'https://github.com/student/app',branch:'main',summary:'1 changed path',changes:[{kind:'M',path:'Main.java'}]};};
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
  github.prepareUpload=async()=>({page:'https://github.com/student/app',branch:'main',summary:'1 changed path',changes:[{kind:'M',path:'Main.java'}]});
  confirmUpload='Commit & Upload';
  await commands.get('zero.uploadToGitHub')();
  assert.equal(uploaded,1);assert.match(notices.at(-1),/Uploaded aaaaaaa/);
  assert.equal(mutations,0,'All real transport is mocked in the live UI test');
});
