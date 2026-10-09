'use strict';
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
const settle = async () => {for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve));};

test('individual change actions are reviewed, serialized, simulated and recover conflicts through native Git', async t => {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-workflow-ui-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');
  const original = {git:core.git,assert:core.assertRepositoryRoot,prepare:github.prepareUpload,...workflow};
  t.after(()=>{core.git=original.git;core.assertRepositoryRoot=original.assert;github.prepareUpload=original.prepare;for(const key of Object.keys(workflow))workflow[key]=original[key];});
  let branch='main',mode='simulation',session={id:'session',account:{id:'student',label:'student'},accessToken:'NEVER_RENDER_TOKEN'},authEvent,provider;
  let saved=0,authCalls=0,prepared=0,executed=0,deleted=0,input,choice,confirm,reviewGate,pickGate,warningGate,finishError,finishUpdates=false,nativeScm=true;
  const commands=new Map(),picks=[],reviews=[],warnings=[],errors=[],notices=[],dispatch=[],deletions=[];
  core.assertRepositoryRoot=async()=>root;
  core.git=async(_,args)=>{if(args[0]==='remote')return 'https://github.com/student/app.git';if(args[0]==='symbolic-ref')return branch;throw new Error('Unexpected Git mutation');};
  github.prepareUpload=async()=>({remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,changes:[],summary:'No changes'});
  const plan = () => ({root,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',branch,head:'f'.repeat(40),mainHead:'a'.repeat(40),remoteMainHead:'a'.repeat(40),summary:'Reviewed change',changedPaths:['Main.java']});
  workflow.prepareStart=async()=>{prepared++;return plan();};workflow.prepareFinish=async()=>{prepared++;return plan();};
  workflow.startPrepared=async()=>{executed++;branch='add-score';return {branch,head:'f'.repeat(40)};};
  workflow.finishPrepared=async(_,options)=>{executed++;await options.beforeNetwork();if(finishError)throw finishError;if(finishUpdates)return {updated:true,finished:false,branch,head:'f'.repeat(40)};branch='main';return {branch,finishedBranch:'add-score',head:'f'.repeat(40)};};
  workflow.deleteFinishedBranch=async(...args)=>{deleted++;deletions.push(args);};
  const vscode={
    authentication:{getSession:async()=>{authCalls++;return session;},onDidChangeSessions:fn=>{authEvent=fn;return disposable();}},
    workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(_,fallback)=>section==='zero'?mode:fallback}),saveAll:async()=>{saved++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,
      showQuickPick:async(items,options)=>{picks.push({items,options});if(pickGate)await pickGate;return items.find(item=>item.action===choice);},showInputBox:async()=>input,
      showWarningMessage:async text=>{warnings.push(text);if(warningGate)await warningGate;},
      showInformationMessage:async(text,options)=>{notices.push(text);if(options?.modal){reviews.push({text,options});if(reviewGate)await reviewGate;return confirm;}},showErrorMessage:async text=>{errors.push(text);}},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async id=>{dispatch.push(id);},getCommands:async()=>nativeScm?['workbench.view.scm']:[]},
    env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  const subscriptions=[];t.after(()=>subscriptions.forEach(value=>value.dispose()));extension.activate({subscriptions,workspaceState:{get:()=>true}});
  const webview={html:'',onDidReceiveMessage:disposable};const candidate={webview,onDidDispose:disposable};provider.resolveWebviewView(candidate);await settle();
  assert.match(webview.html,/data-command="zero.chooseBranch"[^>]*aria-label="Current branch: main/);assert.match(webview.html,/Upload changes/);assert.doesNotMatch(webview.html,/data-command="zero.finishChange"|NEVER_RENDER_TOKEN/);
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['start']);
  let releaseWarning;warningGate=new Promise(resolve=>{releaseWarning=resolve;});const authBefore=authCalls;
  await commands.get('zero.startChange')();await commands.get('zero.finishChange')();await commands.get('zero.uploadToGitHub')();
  assert.equal(saved,0);assert.equal(prepared,0);assert.equal(executed,0);assert.equal(authCalls,authBefore);assert.match(warnings[0],/nothing changed/);
  assert.doesNotMatch(webview.html,/data-command="zero.chooseBranch"[^>]* disabled/);releaseWarning();warningGate=undefined;
  mode='live';input=undefined;await commands.get('zero.startChange')();assert.equal(saved,0);assert.equal(prepared,0);
  input='add-score';confirm=undefined;await commands.get('zero.startChange')();assert.equal(prepared,1);assert.equal(executed,0);assert.match(reviews.at(-1).options.detail,/student\/app.*\nGitHub account: student/);
  confirm='Start change';await commands.get('zero.startChange')();assert.equal(executed,1);assert.match(webview.html,/>add-score ▾<\/button>/);
  await commands.get('zero.chooseBranch')();assert.deepEqual(picks.at(-1).items.map(item=>item.action),['finish']);
  let releaseReview;reviewGate=new Promise(resolve=>{releaseReview=resolve;});confirm='Merge & Upload main';const pending=commands.get('zero.finishChange')();while(reviews.at(-1).text!=='Finish this change?')await settle();
  const before={saved,prepared,authCalls};for(const id of ['zero.startChange','zero.finishChange','zero.uploadToGitHub','zero.githubAccount','zero.chooseRepository','zero.chooseBranch','zero.connectRepository','zero.signInToGitHub'])await commands.get(id)();
  assert.deepEqual({saved,prepared,authCalls},before);assert.match(webview.html,/data-command="zero.chooseBranch"[^>]* disabled/);
  session={...session,id:'changed'};authEvent({provider:{id:'github'}});releaseReview();await pending;reviewGate=undefined;
  assert.equal(executed,1,'Changed account cannot execute the reviewed finish');assert.equal(deleted,0);assert.match(errors.at(-1),/sign-in changed/);
  finishError=Object.assign(new Error('Merge conflicts need your attention'),{conflict:true});await commands.get('zero.finishChange')();assert.equal(dispatch.at(-1),'workbench.view.scm');assert.equal(deleted,0);assert.match(notices.join('\n'),/Stage the resolved files/);assert.match(webview.html,/>add-score ▾<\/button>/);
  nativeScm=false;await commands.get('zero.finishChange')();assert.match(notices.at(-1),/Open Source Control/);assert.equal(deleted,0);
  finishError=undefined;finishUpdates=true;confirm='Merge & Upload main';const beforeUpdates=reviews.length;await commands.get('zero.finishChange')();assert.equal(deleted,0);assert.equal(reviews.length,beforeUpdates+1);assert.match(notices.at(-1),/Run App.*Finish change again/);assert.equal(branch,'add-score');
  finishUpdates=false;confirm='Merge & Upload main';await commands.get('zero.finishChange')();assert.equal(deleted,0);assert.match(reviews.at(-1).text,/Delete the finished local branch/);assert.match(webview.html,/>main ▾<\/button>/);
  // Answer each modal by its purpose for the successful optional cleanup.
  branch='add-score';vscode.window.showInformationMessage=async(text,options)=>{if(options?.modal)return text.startsWith('Delete')?'Delete local branch':'Merge & Upload main';};
  await commands.get('zero.finishChange')();assert.equal(deleted,1);assert.deepEqual(deletions[0],[root,'add-score','f'.repeat(40)]);
  branch='<branch "x">';provider.resolveWebviewView(candidate);await settle();assert.match(webview.html,/&lt;branch &quot;x&quot;&gt;/);assert.doesNotMatch(webview.html,/<branch|NEVER_RENDER_TOKEN/);
  branch='main';choice='start';let releasePick;pickGate=new Promise(resolve=>{releasePick=resolve;});const menu=commands.get('zero.chooseBranch')();while(!picks.at(-1).options.title.includes('main'))await settle();await settle();
  const beforeMenu=executed;await commands.get('zero.startChange')();assert.equal(executed,beforeMenu);branch='changed-elsewhere';releasePick();await menu;pickGate=undefined;assert.equal(executed,beforeMenu,'A changed branch invalidates the menu selection');
});
