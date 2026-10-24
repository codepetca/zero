'use strict';
const {appSessions}=require('./fixtures/app-sessions');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {EventEmitter}=require('node:events');
const {NATIVE_PREFIX}=require('../src/runtime-events');
const snapshot=require('../src/web-export/snapshot');
const disposable=()=>({dispose(){}});

test('Run App, sidebar and configured tasks use native Java while web export retains its compiler',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-command-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,process.platform==='win32'?'mvnw.cmd':'mvnw'),'');
 const commands=new Map(),errors=[],states=[],launches=[],starts=[],ends=[],processEnds=[];let provider,saves=0,builds=0,validated=0,webview,saveGate,preparations=0,checks=0,edited,savedDocument,checkStatus='compatible',prepareGate,prepareSignal,holdNativePipes=false;
 const sourceIdentity={builderHash:'b'.repeat(64),scopeHash:'a'.repeat(64)};
 const proof=Object.fromEntries(['sourceHash','coreHash','librariesHash','profileHash','checkerHash','contractHash','jdkHash'].map(key=>[key,key==='profileHash'?sourceIdentity.builderHash:'a'.repeat(64)]));
 class Task{constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
 class ProcessExecution{constructor(command,args,options){Object.assign(this,{command,args,options});}}
 const diagnosticCollections=new Map();
 const spawned=[];
 class CustomExecution{constructor(callback){this.callback=callback;}}
 class NativeEmitter{constructor(){this.events=new EventEmitter();this.event=listener=>{this.events.on('value',listener);return disposable();};}fire(value){this.events.emit('value',value);}dispose(){this.events.removeAllListeners();}}
 const spawn=(command,args,options)=>{const child=new EventEmitter();Object.assign(child,{pid:100+spawned.length,stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:{writable:true,write(){}},kill(){child.emit('close',0);}});spawned.push({command,args,options,child});return child;};
 const finish=(active,exitCode=0)=>{if(active.finished)return;active.finished=true;active.child?.emit('close',exitCode);processEnds.forEach(fn=>fn({execution:active,exitCode}));ends.forEach(fn=>fn({execution:active}));};
 const appProvider={dispose(){},async removeSession(){assert.fail('Local Run must not remove a GitHub session');}};
 const vscode={languages:{createDiagnosticCollection:name=>{const entries=new Map();diagnosticCollections.set(name,entries);return {clear:()=>entries.clear(),set:(uri,items)=>entries.set(uri.fsPath,items),dispose(){}};}},Position:class{constructor(line,character){Object.assign(this,{line,character});}},Range:class{constructor(start,end){Object.assign(this,{start,end});}},Diagnostic:class{constructor(range,message,severity){Object.assign(this,{range,message,severity});}},DiagnosticSeverity:{Error:0},authentication:{getSession:async()=>null,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},workspace:{registerTextDocumentContentProvider:disposable,textDocuments:[],onDidChangeTextDocument:callback=>{edited=callback;return disposable();},onDidSaveTextDocument:callback=>{savedDocument=callback;return disposable();},workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;if(saveGate)await saveGate;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
 window:{createOutputChannel:()=>({appendLine:v=>states.push(v),dispose(){}}),registerWebviewViewProvider:(_,value)=>{webview={options:{},onDidReceiveMessage:disposable};value.resolveWebviewView({webview,onDidDispose:disposable});return disposable();},registerTreeDataProvider:disposable,showErrorMessage:async v=>errors.push(v)},
 tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTask:fn=>{ends.push(fn);return disposable();},onDidEndTaskProcess:fn=>{processEnds.push(fn);return disposable();},registerTaskProvider:(_,value)=>{provider=value;return disposable();},executeTask:async task=>{const active={task,terminate(){if(active.pty)active.pty.close();else finish(active);}};launches.push(active);if(task.execution instanceof CustomExecution){active.pty=await task.execution.callback();active.pty.onDidClose(code=>finish(active,code));}starts.forEach(fn=>fn({execution:active}));if(active.pty){active.pty.open();active.child=spawned.at(-1).child;}return active;}},
 commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:NativeEmitter,CustomExecution,Task,ProcessExecution,ShellExecution:ProcessExecution,ShellQuoting:{Strong:2},TaskScope:{Workspace:1},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2}};
 const originalLoad=Module._load,originalEnsure=snapshot.ensureValidatedExport,originalValidate=snapshot.validateExport;
 snapshot.ensureValidatedExport=async options=>{builds++;assert.equal(options.projectRoot,root);return {sitePath:path.join(root,'site')};};snapshot.validateExport=async()=>{validated++;};
 const filename=require.resolve('../src/extension');const oldCache=require.cache[filename];delete require.cache[filename];
 Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./saved-source-host')return {createSavedSourceHost:()=>({inspect:async()=>sourceIdentity,check:async()=>{checks++;return {status:checkStatus,scopeIdentity:sourceIdentity,identity:proof,diagnostics:[]};}})};const loaded=originalLoad.call(this,id,...args);if(id==='./project-builder')return {...loaded,createProjectBuilder:()=>({prepareBrowserChecks:async options=>{assert.equal(options.explicitAction,true);preparations++;prepareSignal=options.signal;if(prepareGate)await prepareGate;return {};},ensureValidatedExport:options=>snapshot.ensureValidatedExport(options),validateExport:options=>snapshot.validateExport(options),validateRetainedExport:options=>snapshot.validateExport(options),assertBuildInputsAtCommit:async()=>{}})};return loaded;};
 let extension;try{extension=require(filename);}finally{Module._load=originalLoad;}
 const subscriptions=[];t.after(()=>{subscriptions.forEach(d=>d.dispose());snapshot.ensureValidatedExport=originalEnsure;snapshot.validateExport=originalValidate;delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
 extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{provider:appSessions(vscode,appProvider),nativeRuntime:{spawn,platform:'linux',env:{},killProcess:(pid,signal)=>{if(!holdNativePipes)spawned.find(item=>item.child.pid===-pid)?.child.emit('close',0);}}});
 await commands.get('zero.runApp')();assert.equal(saves,1);assert.equal(launches.length,1);assert.equal(builds,0);assert.equal(validated,0);
 assert.ok(launches[0].task.execution instanceof CustomExecution);assert.deepEqual(spawned[0].args,['clean','compile','javafx:run']);assert.match(webview.html,/readiness unverified/);
 const identity=spawned[0].options.env;const signal=(seq,type,code,stage='startup',diagnostic)=>{launches[0].child.stdout.emit('data',Buffer.from(NATIVE_PREFIX+JSON.stringify({version:1,runId:identity.ZERO_RUNTIME_RUN_ID,buildId:identity.ZERO_RUNTIME_BUILD_ID,seq,type,stage,code,...(diagnostic?{diagnostic}:{})})+'\n'));};
 signal(1,'startup','STARTING');signal(2,'ui-ready','UI_READY');assert.match(webview.html,/App UI ready/);signal(3,'first-frame','FIRST_FRAME','frame-draw');assert.match(webview.html,/first game frame ready/);assert.equal(launches[0].task.name,'Run App');assert.deepEqual(launches[0].task.matcher,[]);
 assert.match(webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Stop<\/button>/);assert.doesNotMatch(webview.html,/data-command="zero.openRunningAppInBrowser"/);
 await commands.get('zero.runApp')();assert.equal(launches.length,2);assert.match(webview.html,/Stop<\/button>/);
 await commands.get('zero.toggleApp')();assert.match(webview.html,/Run<\/button>/);
 const configured=await provider.resolveTask({definition:{type:'zero',task:'run'},scope:1});assert.ok(configured.execution instanceof CustomExecution);assert.deepEqual(configured.matcher,[]);assert.equal(configured.name,'Run App');await vscode.tasks.executeTask(configured);
 assert.match(webview.html,/Stop<\/button>/,'Configured Run App task participates in Stop ownership');finish(launches.at(-1),1);assert.match(webview.html,/App ended with an error/);assert.match(webview.html,/data-command="zero.showProblems"/);
 await commands.get('zero.toggleApp')();assert.doesNotMatch(webview.html,/data-command="zero.showProblems"/);finish(launches.at(-1));assert.match(webview.html,/Run<\/button>/,'Closing native app returns to Run');
 // Both legacy entry points still execute and are tracked as native tasks.
 await commands.get('zero.runNativeApp')();await commands.get('zero.stopApp')();const legacy=await provider.resolveTask({definition:{type:'zero',task:'native-run'},scope:1});await vscode.tasks.executeTask(legacy);await commands.get('zero.stopApp')();
 const before=launches.length,beforeSaves=saves;vscode.workspace.isTrusted=false;
 await commands.get('zero.runApp')();assert.match(errors.at(-1),/Trust your own project/);await assert.rejects(provider.resolveTask({definition:{type:'zero',task:'run'},scope:1}),/Trust your own project/);assert.equal(saves,beforeSaves);assert.equal(launches.length,before);vscode.workspace.isTrusted=true;
 vscode.workspace.saveAll=async()=>false;await commands.get('zero.toggleApp')();assert.equal(launches.length,before);assert.match(errors.at(-1),/Save your files/);assert.match(webview.html,/Run<\/button>/);
 vscode.workspace.saveAll=async()=>true;
 const queued=commands.get('zero.toggleApp')(),cancelled=commands.get('zero.toggleApp')();await Promise.all([queued,cancelled]);assert.equal(launches.length,before,'Immediate repeated click cancels before launching');
 // The expensive browser pipeline remains reachable only through an explicit export/publishing action.
 let releaseExport;snapshot.ensureValidatedExport=async()=>{builds++;await new Promise(resolve=>{releaseExport=resolve;});return {sitePath:path.join(root,'site')};};
 assert.equal(builds,0);const exporting=commands.get('zero.exportWeb')();while(!releaseExport)await new Promise(resolve=>setImmediate(resolve));
 await commands.get('zero.runApp')();assert.equal(await provider.resolveTask({definition:{type:'zero',task:'run'},scope:1}),undefined);assert.equal(launches.length,before,'Do not start native work during a browser export');releaseExport();await exporting;
 assert.equal(builds,1);assert.ok(states.some(text=>text.includes('Web export ready')));
 await commands.get('zero.runApp')();const failed=launches.at(-1),failureIdentity=spawned.at(-1).options.env;
 const failureRecord=(seq,type,code,stage,diagnostic)=>failed.child.stdout.emit('data',Buffer.from(NATIVE_PREFIX+JSON.stringify({version:1,runId:failureIdentity.ZERO_RUNTIME_RUN_ID,buildId:failureIdentity.ZERO_RUNTIME_BUILD_ID,seq,type,code,stage,...(diagnostic?{diagnostic}:{})})+'\n'));
 failureRecord(1,'startup','STARTING','startup');failureRecord(2,'fatal','FRAME_EXCEPTION','frame-update','local update cause');assert.match(webview.html,/App failed/);finish(failed,0);assert.match(webview.html,/App ended with an error/,'A fatal runtime event remains failed even if Maven exits zero');assert.ok(states.some(text=>text.includes('local update cause')));
 // Already-delivered compiler diagnostics survive delayed failure/Stop. A new
 // run clears only Zero's compiler owner, leaving unrelated diagnostics alone.
 await commands.get('zero.runApp')();const compilerFailed=launches.at(-1);
 const compilerErrors=diagnosticCollections.get('zero-native-compiler');
 const runtimeErrors=diagnosticCollections.get('zero-native-runtime');
 const sourceFile=path.join(root,'src/main/java/Main.java');
 compilerFailed.child.stderr.emit('data',Buffer.from('[ERROR] '+sourceFile+':[22,'));
 compilerFailed.child.stderr.emit('data',Buffer.from("50] ';' expected\n"));
 assert.equal(compilerErrors.get(sourceFile)[0].message,"';' expected");
 assert.equal(compilerErrors.get(sourceFile)[0].range.start.character,49);
 await new Promise(resolve=>setTimeout(resolve,20));finish(compilerFailed,1);
 assert.equal(compilerErrors.get(sourceFile).length,1,'Task exit retains delivered errors');
 await commands.get('zero.stopApp')();assert.equal(compilerErrors.get(sourceFile).length,1,'Stop is not a compiler error reset');
 const browserErrors=diagnosticCollections.get('zero-browser-compatibility');browserErrors.set('other.java',['unrelated']);
 await commands.get('zero.runApp')();assert.equal(compilerErrors.size,0);assert.deepEqual(browserErrors.get('other.java'),['unrelated']);
 const recovered=launches.at(-1);recovered.child.stdout.emit('data',Buffer.from('[INFO] --- javafx:0.0.8:run (default-cli) @ my-app ---\n'));
 assert.equal(compilerErrors.size,0);assert.equal(runtimeErrors.size,0);await commands.get('zero.stopApp')();
 assert.equal(preparations,0);assert.equal(checks,0,'Opening and native Run do not execute browser checks');const nativeBeforeChecks=launches.length;
 await commands.get('zero.enableBrowserChecks')();assert.equal(preparations,1);assert.equal(checks,1);assert.match(webview.html,/Browser checks: compatible/);assert.equal(launches.length,nativeBeforeChecks);
 const document={uri:{fsPath:path.join(root,'src/main/java/Main.java')},isDirty:true};vscode.workspace.textDocuments=[document];edited({document});assert.match(webview.html,/Browser checks: stale/);assert.equal(checks,1);
 document.isDirty=false;checkStatus='unsupported';savedDocument(document);const until=Date.now()+2000;while(checks<2&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(checks,2);await new Promise(resolve=>setImmediate(resolve));assert.match(webview.html,/Browser checks: unsupported/);assert.equal(preparations,1,'Save checks never prepare or fetch');assert.equal(launches.length,nativeBeforeChecks,'Save checks never start Maven native tasks');
 await commands.get('zero.disableBrowserChecks')();assert.match(webview.html,/Browser checks: unavailable/);
 let releasePreparation;prepareGate=new Promise(resolve=>{releasePreparation=resolve;});prepareSignal=undefined;const enabling=commands.get('zero.enableBrowserChecks')();
 while(!prepareSignal)await new Promise(resolve=>setImmediate(resolve));await commands.get('zero.disableBrowserChecks')();assert.equal(prepareSignal.aborted,true);releasePreparation();await enabling;
 assert.equal(preparations,2);assert.equal(checks,2,'Late preparation cannot approve or check after Disable');assert.match(webview.html,/Browser checks: unavailable/);
 savedDocument(document);await new Promise(resolve=>setTimeout(resolve,700));assert.equal(checks,2,'No automatic checking was re-enabled');

 await commands.get('zero.runApp')();holdNativePipes=true;const rootCrash=launches.at(-1);rootCrash.child.emit('exit',7);await commands.get('zero.stopApp')();holdNativePipes=false;assert.match(webview.html,/App ended with an error/,'Stop during descendant drain preserves the already-failed wrapper result');
 const manifest=require('../package.json');assert.ok(manifest.contributes.menus.commandPalette.some(x=>x.command==='zero.runNativeApp'&&x.when==='false'),'Hide the redundant legacy palette entry');
});
