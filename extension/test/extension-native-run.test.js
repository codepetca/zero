'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const snapshot=require('../src/web-export/snapshot');
const disposable=()=>({dispose(){}});

test('Run App, sidebar and configured tasks use native Java while web export retains its compiler',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-command-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,process.platform==='win32'?'mvnw.cmd':'mvnw'),'');
 const commands=new Map(),errors=[],states=[],launches=[],starts=[],ends=[],processEnds=[];let provider,saves=0,builds=0,validated=0,webview,saveGate;
 class Task{constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
 class ProcessExecution{constructor(command,args,options){Object.assign(this,{command,args,options});}}
 const finish=(active,exitCode=0)=>{processEnds.forEach(fn=>fn({execution:active,exitCode}));ends.forEach(fn=>fn({execution:active}));};
 const appProvider={dispose(){},async removeSession(){assert.fail('Local Run must not remove a GitHub session');}};
 const vscode={authentication:{getSession:async()=>null,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;if(saveGate)await saveGate;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
 window:{createOutputChannel:()=>({appendLine:v=>states.push(v),dispose(){}}),registerWebviewViewProvider:(_,value)=>{webview={options:{},onDidReceiveMessage:disposable};value.resolveWebviewView({webview,onDidDispose:disposable});return disposable();},registerTreeDataProvider:disposable,showErrorMessage:async v=>errors.push(v)},
 tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTask:fn=>{ends.push(fn);return disposable();},onDidEndTaskProcess:fn=>{processEnds.push(fn);return disposable();},registerTaskProvider:(_,value)=>{provider=value;return disposable();},executeTask:async task=>{const active={task,terminate(){finish(active);}};launches.push(active);starts.forEach(fn=>fn({execution:active}));return active;}},
 commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}},Task,ProcessExecution,ShellExecution:ProcessExecution,ShellQuoting:{Strong:2},TaskScope:{Workspace:1},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2}};
 const originalLoad=Module._load,originalEnsure=snapshot.ensureValidatedExport,originalValidate=snapshot.validateExport;
 snapshot.ensureValidatedExport=async options=>{builds++;assert.equal(options.projectRoot,root);return {sitePath:path.join(root,'site')};};snapshot.validateExport=async()=>{validated++;};
 const filename=require.resolve('../src/extension');const oldCache=require.cache[filename];delete require.cache[filename];
 Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
 let extension;try{extension=require(filename);}finally{Module._load=originalLoad;}
 const subscriptions=[];t.after(()=>{subscriptions.forEach(d=>d.dispose());snapshot.ensureValidatedExport=originalEnsure;snapshot.validateExport=originalValidate;delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
 extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{provider:appProvider});
 await commands.get('zero.runApp')();assert.equal(saves,1);assert.equal(launches.length,1);assert.equal(builds,0);assert.equal(validated,0);
 assert.deepEqual(launches[0].task.execution.args,['clean','compile','javafx:run']);assert.equal(launches[0].task.name,'Run App');assert.equal(launches[0].task.matcher,'$zero-java');
 assert.match(webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Stop<\/button>/);assert.doesNotMatch(webview.html,/data-command="zero.openRunningAppInBrowser"/);
 await commands.get('zero.runApp')();assert.equal(launches.length,2);assert.match(webview.html,/Stop<\/button>/);
 await commands.get('zero.toggleApp')();assert.match(webview.html,/Run<\/button>/);
 const configured=await provider.resolveTask({definition:{type:'zero',task:'run'},scope:1});assert.ok(configured.execution instanceof ProcessExecution);assert.equal(configured.name,'Run App');await vscode.tasks.executeTask(configured);
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
 const manifest=require('../package.json');assert.ok(manifest.contributes.menus.commandPalette.some(x=>x.command==='zero.runNativeApp'&&x.when==='false'),'Hide the redundant legacy palette entry');
});
