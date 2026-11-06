'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {appSessions}=require('./fixtures/app-sessions');
const {textInputs}=require('./fixtures/text-input');
const disposable=()=>({dispose(){}});

test('Undo integration confirms the exact local plan, guards changes, and serializes operations',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-undo-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');
 let onUndo,mode='live',choice,warningGate,warningEntered,projectFailure=false,recovery=false,drift=false,applyFailure=false;
 const commands=new Map(),warnings=[],applied=[],previews=[],transportCalls=[];
 const plan={name:'feature',branch:'main',files:['src/Main.java','assets/image.png']};
 const engine={async preview(actual,id,options){previews.push({actual,id});await options.beforeMutation();return {...plan,guard:options.beforeMutation};},async apply(actual,options){await actual.guard();if(drift)throw new Error('Git state changed');if(applyFailure)throw new Error('Apply failed');applied.push({actual,options});}};
 const vscode={
  authentication:{getSession:async()=>undefined,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
  workspace:{isTrusted:true,textDocuments:[],workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(key,fallback)=>key==='uploadMode'?mode:fallback}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,registerTextDocumentContentProvider:disposable},
  window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showWarningMessage:async(text,options,...actions)=>{warnings.push({text,options,actions});warningEntered?.();if(warningGate)await warningGate;return choice;},showInformationMessage:async()=>{},showErrorMessage:async()=>{}},
  tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async id=>transportCalls.push(id),getCommands:async()=>[]},env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
 };
 const core=require('../src/core'),lessons=require('../src/lesson-projects'),workflow=require('../src/workflow');
 const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){
  if(id==='vscode')return textInputs(vscode);
  if(id==='./change-history')return {createChangeHistory:(_v,options)=>{onUndo=options.onUndo;return {openHistory:async()=>{},openReview:async()=>{},dispose(){}};}};
  if(id==='./change-undo')return engine;
  if(id==='./core')return {...core,resolveProject:async()=>{if(projectFailure)throw new Error('Project changed');return root;},assertRepositoryRoot:async()=>root,git:async()=>''};
  if(id==='./lesson-projects')return {...lessons,assertShareable:async()=>{},isLocalPractice:async()=>false,tutorialMarker:async()=>false};
  if(id==='./workflow')return {...workflow,readRecovery:async()=>recovery};
  if(id==='./transport')return {createTransport:()=>async()=>{transportCalls.push('network');}};
  return oldLoad.call(this,id,...args);
 };
 let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
 const subscriptions=[];t.after(()=>subscriptions.forEach(x=>x.dispose()));extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{provider:appSessions(vscode,{dispose(){},async removeSession(){}}),repositories:{async checkSetup(){return {};}}});
 assert.equal(typeof onUndo,'function');const id='a'.repeat(40);
 await onUndo(id);assert.equal(applied.length,0,'Cancel never applies');assert.equal(warnings.at(-1).text,'Undo this finished change?');assert.equal(warnings.at(-1).options.modal,true);assert.deepEqual(warnings.at(-1).actions,['Undo change']);assert.match(warnings.at(-1).options.detail,/Undo feature on main/);for(const file of plan.files)assert.ok(warnings.at(-1).options.detail.includes(file));assert.match(warnings.at(-1).options.detail,/stages a new correction/);
 choice='Undo change';await onUndo(id);assert.deepEqual(previews.at(-1),{actual:root,id});assert.equal(applied.length,1);assert.deepEqual(applied[0].options,{confirmed:true});assert.deepEqual(applied[0].actual.files,plan.files);assert.equal(applied[0].actual.branch,'main');assert.ok(!transportCalls.includes('network'));
 mode='simulation';const before=previews.length;await onUndo(id);assert.equal(previews.length,before);assert.match(warnings.at(-1).text,/Simulation only/);mode='live';
 projectFailure=true;await assert.rejects(onUndo(id),/Project changed/);projectFailure=false;
 vscode.workspace.isTrusted=false;await assert.rejects(onUndo(id),/Trust/);vscode.workspace.isTrusted=true;
 vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'file'}}];await assert.rejects(onUndo(id),/Save your open files/);vscode.workspace.textDocuments=[];
 recovery=true;await assert.rejects(onUndo(id),/pending update/);recovery=false;
 drift=true;await assert.rejects(onUndo(id),/Git state changed/);drift=false;assert.equal(applied.length,1);
 // The engine calls the same guard again after confirmation, before its mutation.
 let releaseDrift,enteredDrift;warningGate=new Promise(resolve=>{releaseDrift=resolve;});const driftWaiting=new Promise(resolve=>{enteredDrift=resolve;});warningEntered=enteredDrift;const stale=onUndo(id);await driftWaiting;projectFailure=true;releaseDrift();await assert.rejects(stale,/Project changed/);projectFailure=false;warningGate=undefined;warningEntered=undefined;assert.equal(applied.length,1);
 let release,entered;warningGate=new Promise(resolve=>{release=resolve;});const waiting=new Promise(resolve=>{entered=resolve;});warningEntered=entered;const first=onUndo(id);await waiting;const previewCount=previews.length;await onUndo(id);assert.equal(previews.length,previewCount,'Busy operation rejects repeat invocation');release();await first;warningGate=undefined;warningEntered=undefined;assert.equal(applied.length,2);
 applyFailure=true;await assert.rejects(onUndo(id),/Apply failed/);applyFailure=false;await onUndo(id);assert.equal(applied.length,3,'Busy is released after failure and success');assert.ok(!transportCalls.some(call=>/network|push/i.test(call)));
});
