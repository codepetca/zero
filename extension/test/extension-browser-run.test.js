'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const snapshot=require('../src/web-export/snapshot');
const disposable=()=>({dispose(){}});

test('registered Run App and configured run task own browser lifecycle without native execution',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-browser-command-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');
 const commands=new Map(),errors=[],states=[];let provider,saves=0,builds=0,validated=0,opens=0,closes=0,native=0,browserOpens=0,webview,lastPreview;
 class Emitter{constructor(){this.callbacks=[];this.event=fn=>{this.callbacks.push(fn);return disposable();};}fire(v){for(const fn of this.callbacks)fn(v);}dispose(){this.callbacks=[];}}
 class Task{constructor(definition,scope,name,source,execution){Object.assign(this,{definition,scope,name,source,execution});}}
 const appProvider={dispose(){},async removeSession(){assert.fail('Browser Run must not remove a GitHub session');}};
 const vscode={authentication:{getSession:async(provider,scopes,options)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);assert.equal(options.silent,true);return null;},onDidChangeSessions:disposable,registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.equal(provider,appProvider);assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
 window:{createOutputChannel:()=>({appendLine:v=>states.push(v),dispose(){}}),registerWebviewViewProvider:(_,value)=>{webview={options:{},onDidReceiveMessage:disposable};value.resolveWebviewView({webview,onDidDispose:disposable});return disposable();},registerTreeDataProvider:disposable,showErrorMessage:async v=>errors.push(v)},
 tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:(_,value)=>{provider=value;return disposable();},executeTask:async()=>{native++;throw Error('Native must be explicit');}},
 commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:Emitter,Task,CustomExecution:class{constructor(callback){this.callback=callback;}},TaskScope:{Workspace:1},TaskGroup:{Build:{}}};
 const originalLoad=Module._load,originalEnsure=snapshot.ensureValidatedExport,originalValidate=snapshot.validateExport;
 snapshot.ensureValidatedExport=async options=>{builds++;assert.equal(options.projectRoot,root);return {sitePath:path.join(root,'site')};};snapshot.validateExport=async()=>{validated++;};
 const previewFactory=async(_,site,{onDidDispose})=>{opens++;let disposed=false;return lastPreview={openInBrowser:async()=>{browserOpens++;},dispose(){if(!disposed){disposed=true;closes++;onDidDispose();}}};};
 Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./web-run-preview')return {createManagedWebPreview:previewFactory};return originalLoad.call(this,id,...args);};
 let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
 const subscriptions=[];t.after(()=>{subscriptions.forEach(d=>d.dispose());snapshot.ensureValidatedExport=originalEnsure;snapshot.validateExport=originalValidate;});
 extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{provider:appProvider});
 await commands.get('zero.runApp')();assert.equal(saves,1);assert.equal(builds,1);assert.equal(validated,1);assert.equal(opens,1);assert.equal(native,0);assert.match(webview.html,/App running/);assert.match(webview.html, /data-command="zero.toggleApp"[^>]*>[\s\S]*Stop<\/button>/);
 assert.match(webview.html,/data-command="zero.openRunningAppInBrowser"/);await commands.get('zero.openRunningAppInBrowser')();assert.equal(browserOpens,1);assert.equal(builds,1,'Opening Chrome must use the current runtime, without rebuilding');
 await commands.get('zero.runApp')();assert.equal(closes,1);assert.equal(opens,2);
 await commands.get('zero.stopApp')();assert.equal(closes,2);assert.match(webview.html, /data-command="zero.toggleApp"[^>]*>[\s\S]*Run<\/button>/);assert.doesNotMatch(webview.html,/data-command="zero.openRunningAppInBrowser"/);
 const configured=await provider.resolveTask({definition:{type:'zero',task:'run'},scope:1});assert.ok(configured.execution instanceof vscode.CustomExecution);const terminal=await configured.execution.callback();const finished=new Promise(resolve=>terminal.onDidClose(resolve));terminal.open();assert.equal(await finished,0);assert.equal(opens,3);assert.equal(builds,3);terminal.close();assert.equal(closes,2,'Closing a completed task terminal leaves its preview owned by Stop');await commands.get('zero.stopApp')();assert.equal(closes,3);assert.equal(native,0);assert.deepEqual(errors,[]);
 snapshot.ensureValidatedExport=async()=>{throw Error('Main.java:88:42: Unsupported browser API java.lang.Runtime#getRuntime()\nFull compiler details');};
 await commands.get('zero.runApp')();assert.equal(errors.at(-1),'Zero: App could not run. Open Problems or check Zero output.');assert.match(webview.html,/App could not run/);assert.doesNotMatch(webview.html,/Full compiler details|java.lang.Runtime/);assert.ok(states.some(text=>text.includes('Full compiler details')));
 assert.match(webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Run<\/button>/);
 assert.equal((webview.html.match(/data-command="zero.toggleApp"/g)||[]).length,1);
 assert.doesNotMatch(webview.html,/data-command="zero.runApp"|data-command="zero.stopApp"/);
 // The same host command handles a stale click, cancellation and shutdown completion.
 let releaseBuild,signal;
 snapshot.ensureValidatedExport=async options=>{builds++;signal=options.signal;await new Promise(resolve=>{releaseBuild=resolve;});return {sitePath:path.join(root,'site')};};
 const before=opens,run=commands.get('zero.toggleApp')();
 assert.match(webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Stop<\/button>/,'Queued runs immediately offer Stop');
 while(!releaseBuild)await new Promise(resolve=>setImmediate(resolve));
 const stopping=commands.get('zero.toggleApp')(),duplicate=commands.get('zero.toggleApp')();
 const blockedRun=commands.get('zero.runApp')();
 const blockedTask=await provider.resolveTask({definition:{type:'zero',task:'run'},scope:1});
 const blockedTerminal=await blockedTask.execution.callback();const blockedTaskFinished=new Promise(resolve=>blockedTerminal.onDidClose(resolve));blockedTerminal.open();
 assert.match(webview.html,/data-command="zero.toggleApp" aria-disabled="true">[\s\S]*Stopping…<\/button>/);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(signal.aborted,true);
 releaseBuild();await Promise.all([run,stopping,duplicate,blockedRun,blockedTaskFinished]);blockedTerminal.close();
 assert.equal(opens,before,'Cancelled build results cannot reopen the app');
 assert.match(webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Run<\/button>/);
 snapshot.ensureValidatedExport=async()=>({sitePath:path.join(root,'site')});
 await commands.get('zero.toggleApp')();assert.match(webview.html,/Stop<\/button>/);
 lastPreview.dispose();assert.match(webview.html,/Run<\/button>/,'Closing the owned preview returns to Run');
 const beforeSaveFailure=opens;vscode.workspace.saveAll=async()=>false;
 await commands.get('zero.toggleApp')();assert.equal(opens,beforeSaveFailure);assert.match(webview.html,/Run<\/button>/);
 vscode.workspace.saveAll=async()=>true;
 const queued=commands.get('zero.toggleApp')(),cancelled=commands.get('zero.toggleApp')();
 await Promise.all([queued,cancelled]);assert.equal(opens,beforeSaveFailure,'Immediate repeated click cancels before launching');

});
