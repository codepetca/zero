'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const core = require('../src/core');
const disposable = () => ({dispose(){}});
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

async function removed(root) {
  // Task-end cleanup intentionally runs asynchronously after the event handler.
  for(let attempt=0;attempt<100;attempt++) {
    try {await fs.access(root);} catch(error) {if(error.code==='ENOENT') return;throw error;}
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail(`Temporary example was not removed: ${root}`);
}

test('Stop during example executeTask terminates the delivered task; task end cleans only its example root', async t => {
  const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-component-run-')));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const student=path.join(directory,'student');
  await fs.mkdir(student);
  await fs.writeFile(path.join(student,'zero.json'),'{}');
  await fs.writeFile(path.join(student,'mvnw'),'student wrapper');
  await fs.writeFile(path.join(student,'Main.java'),'class Main { /* keep my work */ }\n');
  const commands=new Map(),ends=[],launches=[],errors=[],subscriptions=[];
  const gate=deferred(),entered=deferred();
  let host,hold=true;
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async()=>undefined,onDidChangeSessions:disposable},
    workspace:{workspaceFolders:[{uri:{fsPath:student}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),onDidChangeConfiguration:disposable,onDidChangeWorkspaceFolders:disposable,
      createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}})},
    window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showErrorMessage:message=>errors.push(message)},
    commands:{registerCommand:(id,action)=>{commands.set(id,action);return disposable();},executeCommand:async()=>{}},
    tasks:{onDidStartTask:disposable,onDidEndTask:handler=>{ends.push(handler);return disposable();},registerTaskProvider:disposable,
      executeTask:async task=>{
        const active={task,terminated:0,terminate(){this.terminated++;ends.forEach(handler=>handler({execution:active}));}};
        launches.push(active);entered.resolve();
        if(hold) await gate.promise;
        return active;
      }},
    Uri:{file:fsPath=>({fsPath})},Task,TaskScope:{Workspace:2},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2},ShellQuoting:{Strong:2},
    ProcessExecution:class {constructor(command,args,options){Object.assign(this,{command,args,options});}},ShellExecution:class {constructor(command,args,options){Object.assign(this,{command,args,options});}},
    EventEmitter:class {event(){}fire(){}dispose(){}}
  };
  const extensionPath=require.resolve('../src/extension');
  const previousCache=require.cache[extensionPath];delete require.cache[extensionPath];
  const originalLoad=Module._load;
  Module._load=function(id,...args){
    if(id==='vscode') return vscode;
    if(id==='./component-actions') return {createComponentActions:(_vscode,_context,value)=>{host=value;return {};}};
    if(id==='./core') return {...core,assertRepositoryRoot:async()=>{throw new Error('No repository');}};
    return originalLoad.call(this,id,...args);
  };
  let extension;
  try {extension=require(extensionPath);} finally {Module._load=originalLoad;}
  t.after(()=>{delete require.cache[extensionPath];if(previousCache) require.cache[extensionPath]=previousCache;subscriptions.forEach(item=>item.dispose());});
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}});
  assert.ok(host,'Actual extension activation supplies the example run host');
  const heldRoot=path.join(directory,'held-example');await fs.mkdir(heldRoot);await fs.writeFile(path.join(heldRoot,'mvnw'),'trusted wrapper');
  const sibling=path.join(directory,'unowned-example');await fs.mkdir(sibling);await fs.writeFile(path.join(sibling,'keep'),'keep');
  const generation=host.captureRunGeneration();
  const pendingRun=host.runExample(heldRoot,['compile','javafx:run'],generation);
  await entered.promise;
  const pendingStop=commands.get('zero.stopApp')();
  assert.notEqual(host.captureRunGeneration(),generation,'Stop invalidates the captured example generation immediately');
  assert.equal(launches[0].terminated,0,'Execution has not yet been delivered by VS Code');
  gate.resolve();
  assert.equal(await pendingRun,false,'A task arriving after Stop cannot report a successful start');
  await pendingStop;
  assert.equal(launches.length,1,'Stop must not restart a task');
  assert.equal(launches[0].terminated,1,'Delivered task is owned and terminated exactly once');
  await removed(heldRoot);
  assert.equal(await host.runExample(heldRoot,['compile'],generation),false,'Stale queued generation cannot launch again');
  assert.equal(launches.length,1);

  hold=false;
  const normalRoot=path.join(directory,'normal-example');await fs.mkdir(normalRoot);await fs.writeFile(path.join(normalRoot,'mvnw'),'trusted wrapper');
  assert.equal(await host.runExample(normalRoot,['compile','javafx:run'],host.captureRunGeneration()),true);
  assert.equal(launches.length,2);
  assert.equal(launches[1].task.execution.options.cwd,normalRoot);
  assert.equal(launches[1].terminated,0);
  ends.forEach(handler=>handler({execution:launches[1]}));
  await removed(normalRoot);
  assert.equal(launches[1].terminated,0,'Natural task completion requires no termination');
  assert.equal(await fs.readFile(path.join(student,'Main.java'),'utf8'),'class Main { /* keep my work */ }\n');
  assert.equal(await fs.readFile(path.join(student,'mvnw'),'utf8'),'student wrapper');
  assert.equal(await fs.readFile(path.join(student,'zero.json'),'utf8'),'{}');
  assert.equal(await fs.readFile(path.join(sibling,'keep'),'utf8'),'keep','Cleanup owns only the exact completed example root');
  assert.deepEqual(errors,[]);
});
