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
 const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return require('node:child_process').execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
 git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');git('add','zero.json');git('commit','-qm','base');
 let onUndo,mode='live',choice,warningGate,warningEntered,projectFailure=false,recovery=false,drift=false,applyFailure=false,durable=true;
 const commands=new Map(),warnings=[],applied=[],previews=[],corrections=[],transportCalls=[];
 const head=git('rev-parse','HEAD'),child='c'.repeat(40),plan={head,name:'feature',branch:'main',files:['src/Main.java','assets/image.png']};
 const engine={async preview(actual,id,options){previews.push({actual,id});await options.beforeMutation();return {...plan,guard:options.beforeMutation};},async prepareCorrection(actual,options){options.binding.assertCurrentNow();await actual.guard();if(drift)throw new Error('Git state changed');corrections.push({actual,options});return {guard:actual.guard,head,recoveryPath:path.join(root,'.git','zero-inverse-recovery-test')};}};
 const restore={async reviewInverseCorrection(receipt,{binding}){binding.assertCurrentNow();return {head,files:plan.files.map(name=>({name,kind:'modified'})),guard:receipt.guard};},async prepareProjectRestore(actual,{binding}){binding.assertCurrentNow();return {actual,binding,commit:child,recoveryPath:path.join(root,'.git','zero-project-restore-recovery-test')};},async retainPreparedProjectRestore(value){return value;},async applyRetainedProjectRestore(value){value.binding.assertCurrentNow();await value.actual.guard();if(applyFailure)throw new Error('Apply failed');applied.push(value);return value;},cancelProjectRestore(){}};
 const vscode={
  authentication:{getSession:async()=>undefined,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
  workspace:{isTrusted:true,textDocuments:[],workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],getConfiguration:()=>({get:(key,fallback)=>key==='uploadMode'?mode:fallback}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,registerTextDocumentContentProvider:disposable},
  window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showWarningMessage:async(text,options,...actions)=>{warnings.push({text,options,actions});warningEntered?.();if(warningGate)await warningGate;return choice;},showInformationMessage:async()=>{},showErrorMessage:async()=>{}},
  tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async id=>transportCalls.push(id),getCommands:async()=>[]},env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
 };
 const core=require('../src/core'),lessons=require('../src/lesson-projects'),workflow=require('../src/workflow'),github=require('../src/github');
 const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){
  if(id==='vscode')return textInputs(vscode);
  if(id==='./change-history')return {createChangeHistory:(_v,options)=>{onUndo=options.onUndo;return {openHistory:async()=>{},openReview:async()=>{},dispose(){}};}};
  if(id==='./change-undo')return engine;
  if(id==='./project-restore-plan')return restore;
  if(id==='./github')return {...github,prepareLocalCommit:async()=>({root,branch:'main',head,remote:'',changes:[]})};
  if(id==='./core')return {...core,resolveProject:async()=>{if(projectFailure)throw new Error('Project changed');return root;},assertRepositoryRoot:async()=>root,git:async(cwd,args)=>args[0]==='rev-parse'?core.git(cwd,args):args[0]==='symbolic-ref'?(args.at(-1)==='HEAD'?'refs/heads/main':(()=>{throw Object.assign(Error('Direct branch'),{code:1});})()):args[0]==='var'?'Student <student@example.invalid> 100 +0000':''};
  if(id==='./lesson-projects')return {...lessons,assertShareable:async()=>{},isLocalPractice:async()=>false,tutorialMarker:async()=>false};
  if(id==='./workflow')return {...workflow,readRecovery:async()=>recovery};
  if(id==='./transport')return {createTransport:()=>async()=>{transportCalls.push('network');}};
  return oldLoad.call(this,id,...args);
 };
 let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
 const subscriptions=[],provider=appSessions(vscode,{dispose(){},async removeSession(){}}),repositories={async checkSetup(){return {};}};t.after(()=>subscriptions.forEach(x=>x.dispose()));extension.activate({extensionMode:2,subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{env:{},repositoryLedgerFactory:options=>({...require('./fixtures/repository-ledger').repositoryLedgerFactory(options),supportsFileLedger:async()=>durable}),provider,repositories});
 assert.equal(typeof onUndo,'function');const id='a'.repeat(40);
 mode='simulation';await onUndo(id);assert.equal(previews.length,0);assert.match(warnings.at(-1).text,/Simulation only/);mode='live';warnings.length=0;
 await assert.rejects(onUndo(id),/temporarily unavailable.*files and commits are kept/i);
 assert.deepEqual(previews,[]);assert.deepEqual(corrections,[]);assert.deepEqual(applied,[]);assert.deepEqual(warnings,[]);assert.ok(!transportCalls.some(call=>/network|push/i.test(call)));
 await t.test('corrective undo review and application', {skip:'Corrective undo is temporarily unavailable pending safe restore application.'}, async()=>{
 await onUndo(id);assert.equal(applied.length,0,'Cancel never applies');assert.equal(warnings.at(-1).text,'Undo this finished change?');assert.equal(warnings.at(-1).options.modal,true);assert.deepEqual(warnings.at(-1).actions,['Undo change']);assert.match(warnings.at(-1).options.detail,/Undo feature on main/);for(const file of plan.files)assert.ok(warnings.at(-1).options.detail.includes(file));assert.match(warnings.at(-1).options.detail,/new correction commit/);
 choice='Undo change';await onUndo(id);assert.deepEqual(previews.at(-1),{actual:root,id});assert.equal(applied.length,1);assert.equal(corrections[0].options.confirmed,true);assert.equal(typeof corrections[0].options.binding?.assertCurrentNow,'function');assert.deepEqual(applied[0].actual.files.map(file=>file.name),plan.files);assert.equal(applied[0].commit,child);assert.ok(!transportCalls.includes('network'));
 mode='simulation';const before=previews.length;await onUndo(id);assert.equal(previews.length,before);assert.match(warnings.at(-1).text,/Simulation only/);mode='live';
 projectFailure=true;await assert.rejects(onUndo(id),/Project changed/);projectFailure=false;
 for(const folders of [[],[{uri:{scheme:'file',fsPath:root}},{uri:{scheme:'file',fsPath:root}}],[{uri:{scheme:'untitled',fsPath:root}}],[{uri:{scheme:'file',fsPath:os.tmpdir()}}]]){vscode.workspace.workspaceFolders=folders;await assert.rejects(onUndo(id),/standalone project/);}vscode.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:root}}];
 vscode.workspace.isTrusted=false;await assert.rejects(onUndo(id),/Trust/);vscode.workspace.isTrusted=true;
 vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'file'}}];await assert.rejects(onUndo(id),/Save your open files/);vscode.workspace.textDocuments=[];
 recovery=true;await assert.rejects(onUndo(id),/pending update/);recovery=false;
 drift=true;await assert.rejects(onUndo(id),/Git state changed/);drift=false;assert.equal(applied.length,1);
 // The engine calls the same guard again after confirmation, before its mutation.
 let releaseDrift,enteredDrift;warningGate=new Promise(resolve=>{releaseDrift=resolve;});const driftWaiting=new Promise(resolve=>{enteredDrift=resolve;});warningEntered=enteredDrift;const stale=onUndo(id);await driftWaiting;projectFailure=true;releaseDrift();await assert.rejects(stale,/Project changed/);projectFailure=false;warningGate=undefined;warningEntered=undefined;assert.equal(applied.length,1);
 let releaseWorkspace,enteredWorkspace;warningGate=new Promise(resolve=>{releaseWorkspace=resolve;});const workspaceWaiting=new Promise(resolve=>{enteredWorkspace=resolve;});warningEntered=enteredWorkspace;const workspaceStale=onUndo(id);await workspaceWaiting;vscode.workspace.workspaceFolders.push({uri:{scheme:'file',fsPath:root}});releaseWorkspace();await assert.rejects(workspaceStale,/standalone project/);vscode.workspace.workspaceFolders.pop();warningGate=undefined;warningEntered=undefined;assert.equal(applied.length,1);
 let release,entered;warningGate=new Promise(resolve=>{release=resolve;});const waiting=new Promise(resolve=>{entered=resolve;});warningEntered=entered;const first=onUndo(id);await waiting;const previewCount=previews.length;await onUndo(id);assert.equal(previews.length,previewCount,'Busy operation rejects repeat invocation');release();await first;warningGate=undefined;warningEntered=undefined;assert.equal(applied.length,2);
 applyFailure=true;await assert.rejects(onUndo(id),/Apply failed/);applyFailure=false;await onUndo(id);assert.equal(applied.length,3,'Busy is released after failure and success');assert.ok(!transportCalls.some(call=>/network|push/i.test(call)));
 durable=false;const beforeUnsupported=previews.length;await assert.rejects(onUndo(id),/requires shared durable sync reminders/);assert.equal(previews.length,beforeUnsupported,'Router compatibility mode refuses before inverse preparation');assert.equal(applied.length,3);durable=true;
 subscriptions.splice(0).forEach(item=>item.dispose());
 const hidden={root,branch:'other',head:'d'.repeat(40),remote:'',type:'local'},hiddenKey=`zero.localCommitPending:${root}:other`,memory=new Map([[hiddenKey,hidden]]);
 extension.activate({extensionMode:2,subscriptions,workspaceState:{get:key=>memory.get(key),update:async(key,value)=>memory.set(key,value)}},{env:{},repositoryLedgerFactory:()=>undefined,provider,repositories});
 await assert.rejects(onUndo(id),/requires shared durable sync reminders/);assert.equal(previews.length,beforeUnsupported,'Non-enumerable Memento cannot authorize a committed correction');assert.equal(applied.length,3);assert.deepEqual(memory.get(hiddenKey),hidden);assert.ok(![...memory.values()].some(record=>record?.operation==='undo'));assert.ok(!transportCalls.some(call=>/network|push/i.test(call)));
 });
});
