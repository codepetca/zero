'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createProjectWindow} = require('../src/project-window');
const {createProjectFolders} = require('../src/project-folders');

function fixture() {
  const root = path.resolve('/zero/student-app'), profile = new Map(), calls = [], shown = [];
  let pageOpen = true, active = true, clock = 1000, failure;
  const vscode = {workspace:{workspaceFolders:[]},ViewColumn:{One:1},Uri:{file:fsPath=>({fsPath})},
    commands:{executeCommand:async(...args)=>{calls.push(args);if(failure)throw failure;}}};
  const globalState = {get:key=>profile.get(key),update:async(key,value)=>profile.set(key,value)};
  const page = {isOpen:()=>pageOpen,show:options=>{pageOpen=true;shown.push(options);}};
  const host = () => createProjectWindow(vscode,{globalState,startPage:()=>page,active:()=>active,now:()=>clock});
  return {root,profile,calls,shown,vscode,globalState,host,get ticket(){return profile.get('zero.startPageHandoff');},
    set pageOpen(value){pageOpen=value;},set active(value){active=value;},set clock(value){clock=value;},set failure(value){failure=value;}};
}
test('folder switch carries an open Start Page into the destination host once, without focusing it',async()=>{
  const f=fixture(),source=f.host();
  await source.open(f.root);
  assert.deepEqual(f.calls,[['vscode.openFolder',{fsPath:f.root},{forceReuseWindow:true}]]);
  assert.equal(f.ticket.root,f.root);
  f.vscode.workspace.workspaceFolders=[{uri:{fsPath:f.root}}];f.pageOpen=false;
  await source.restore();assert.equal(f.shown.length,0,'A native veto or originating host cannot consume its ticket');
  const destination=f.host();await Promise.all([destination.restore(),destination.restore()]);await destination.restore();
  assert.deepEqual(f.shown,[{preserveFocus:true,viewColumn:1}]);assert.equal(f.ticket,undefined);
});
test('closed Start Page and reopening the current project need no handoff',async()=>{
  const f=fixture();f.pageOpen=false;await f.host().open(f.root);assert.equal(f.ticket,undefined);
  f.pageOpen=true;f.vscode.workspace.workspaceFolders=[{uri:{fsPath:f.root}}];await f.host().open(f.root);assert.equal(f.ticket,undefined);
});
test('an unrelated workspace does not consume the handoff; expired tickets do not reopen a page',async()=>{
  const f=fixture();await f.host().open(f.root);
  f.pageOpen=false;f.vscode.workspace.workspaceFolders=[{uri:{fsPath:path.resolve('/zero/other')}}];
  await f.host().restore();assert.ok(f.ticket);assert.equal(f.shown.length,0);
  f.clock+=10*60*1000+1;f.vscode.workspace.workspaceFolders=[{uri:{fsPath:f.root}}];
  await f.host().restore();assert.equal(f.ticket,undefined);assert.equal(f.shown.length,0);
});
test('command failure and account drift during persistence remove their ticket and preserve errors',async()=>{
  const f=fixture();f.failure=Error('Native open failed');
  await assert.rejects(f.host().open(f.root),/Native open failed/);assert.equal(f.ticket,undefined);
  f.calls.length=0;f.failure=undefined;
  await assert.rejects(f.host().open(f.root,async()=>{assert.ok(f.ticket);throw Error('Account changed');}),/Account changed/);
  assert.equal(f.ticket,undefined);assert.equal(f.calls.length,0);
});
test('disposal during persistence prevents dispatch; disposal or folder change during consumption prevents showing',async()=>{
  const f=fixture();await f.host().open(f.root,async()=>{f.active=false;});
  assert.equal(f.ticket,undefined);assert.equal(f.calls.length,0);
  for (const change of [()=>{f.active=false;},()=>{f.vscode.workspace.workspaceFolders=[];}]) {
    f.active=true;f.vscode.workspace.workspaceFolders=[];await f.host().open(f.root);
    f.pageOpen=false;f.vscode.workspace.workspaceFolders=[{uri:{fsPath:f.root}}];
    const update=f.globalState.update;f.globalState.update=async(key,value)=>{await update(key,value);change();};
    await f.host().restore();assert.equal(f.shown.length,0);f.globalState.update=update;f.pageOpen=true;
  }
});
test('a restored destination panel is reused without revealing it or creating a duplicate',async()=>{
  const f=fixture();await f.host().open(f.root);f.vscode.workspace.workspaceFolders=[{uri:{fsPath:f.root}}];
  await f.host().restore();assert.equal(f.ticket,undefined);assert.equal(f.shown.length,0);
});
test('cancelling a clone during handoff persistence never opens the folder and removes the handoff',async()=>{
  const f=fixture(),controller=new AbortController();f.vscode.window={};
  const update=f.globalState.update;
  f.globalState.update=async(key,value)=>{await update(key,value);if(value)controller.abort();};
  const folders=createProjectFolders(f.vscode,{cloneRepository:async()=>f.root,openFolder:f.host().open});
  await assert.rejects(folders.clone({repositoryUrl:'https://github.com/student/app',parent:{fsPath:path.dirname(f.root)},signal:controller.signal}),error=>error.code==='cancelled');
  assert.equal(f.calls.length,0);assert.equal(f.ticket,undefined);
});
