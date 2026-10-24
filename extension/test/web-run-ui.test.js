'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserRunCommands,sourceDiagnostics}=require('../src/web-run-ui');
const {createManagedWebPreview}=require('../src/web-run-preview');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(t) {
  let runtimeOptions;const allRuntimeOptions=[];let active='/project',busy=false,building,valid=true,save=true,saveGate,builds=0,previews=0,stops=0,opens=0,openResult=true,cancel,workspaceChanged,previewGate,projectGate,validating,retainedValidating;
  const states=[],failures=[],events=[],diagnostics=[];
  const result={sitePath:'/project/.zero/web-export/site'};
  const vscode={workspace:{isTrusted:true,saveAll:async()=>{events.push('save');if(saveGate)await saveGate;return save;},onDidChangeWorkspaceFolders:callback=>{workspaceChanged=callback;return {dispose(){}};}},
    window:{withProgress:async(_,work)=>work({report(){}},{onCancellationRequested:callback=>{cancel=callback;return {dispose(){}};}})},ProgressLocation:{Notification:15},
    languages:{createDiagnosticCollection:()=>({clear(){diagnostics.length=0;},set(uri,items){diagnostics.push({uri,items});},dispose(){}})},Uri:{file:fsPath=>({fsPath})},
    Position:class{constructor(line,character){Object.assign(this,{line,character});}},Range:class{constructor(start,end){Object.assign(this,{start,end});}},Diagnostic:class{constructor(range,message,severity){Object.assign(this,{range,message,severity});}},DiagnosticSeverity:{Error:0}};
  const api=createBrowserRunCommands(vscode,{project:async()=>{if(projectGate)await projectGate;return active;},output:{appendLine(){},show(){}},isBusy:()=>busy,setBusy:v=>{busy=v;},setActive:v=>events.push('active:'+v),setFailed:v=>failures.push(v),setState:v=>states.push(v),
    ensureValidatedExport:async options=>{events.push('build');builds++;options.onProgress('Checking compatibility');options.onProgress('Compiling Java');return building ? building(options) : result;},validateExport:async options=>{events.push('validate');if(validating)return validating(options);if(!valid)throw Error('Inputs changed. Run App again.');},
    validateRetainedExport:async options=>{events.push('retained-validate');return retainedValidating?retainedValidating(options):result;},
    previewFactory:async(_,site,options)=>{runtimeOptions=options;allRuntimeOptions.push(options);previews++;events.push('preview');if(previewGate)await previewGate;let stopped=false;return {openInBrowser:async()=>{opens++;if(openResult instanceof Error)throw openResult;return openResult;},dispose(){if(!stopped){stopped=true;stops++;events.push('dispose');options.onDidDispose();}}};}});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));
  return {api,vscode,events,states,failures,diagnostics,get runtimeOptions(){return runtimeOptions;},allRuntimeOptions,get busy(){return busy;},get builds(){return builds;},get previews(){return previews;},get stops(){return stops;},get opens(){return opens;},set openResult(v){openResult=v;},set active(v){active=v;},set building(v){building=v;},set valid(v){valid=v;},set validating(v){validating=v;},set retainedValidating(v){retainedValidating=v;},set save(v){save=v;},set saveGate(v){saveGate=v;},set previewGate(v){previewGate=v;},set projectGate(v){projectGate=v;},cancel:()=>cancel(),workspaceChanged:()=>workspaceChanged()};
}

test('Open in browser requires a running app and reuses it without saving, rebuilding or revalidating source',async t=>{
 const h=harness(t);assert.equal(h.api.canOpenInBrowser,false);
 await assert.rejects(h.api.commands['zero.openRunningAppInBrowser'](),/Preview a web export before/);assert.equal(h.opens,0);
 await h.api.run();assert.equal(h.api.canOpenInBrowser,true);h.events.length=0;h.valid=false;
 await h.api.openInBrowser();await h.api.commands['zero.openRunningAppInBrowser']();assert.equal(h.opens,2);assert.equal(h.builds,1);assert.equal(h.previews,1);assert.deepEqual(h.events,[]);
 h.api.stop();assert.equal(h.api.canOpenInBrowser,false);await assert.rejects(h.api.openInBrowser(),/Preview a web export before/);assert.equal(h.opens,2);
});

test('Open in browser rejects changed project, stopped runtime and replacement generation',async t=>{
 const changed=harness(t);await changed.api.run();changed.active='/different';await assert.rejects(changed.api.openInBrowser(),/student project changed/);assert.equal(changed.opens,0);assert.equal(changed.stops,1);assert.equal(changed.api.canOpenInBrowser,false);
 for(const mode of ['stop','workspace','rerun','dispose']) {
  const h=harness(t);await h.api.run();let release;h.projectGate=new Promise(resolve=>{release=resolve;});const pending=h.api.openInBrowser();
  if(mode==='stop')h.api.stop();else if(mode==='workspace')h.workspaceChanged();else if(mode==='dispose')h.api.disposables[0].dispose();
  let next;if(mode==='rerun')next=h.api.run();release();await assert.rejects(pending,/Browser preview stopped/);await next;assert.equal(h.opens,0,mode);
 }
});

test('browser open failure preserves the running app and does not recompile',async t=>{
 const h=harness(t);await h.api.run();h.openResult=Error('browser refused');await assert.rejects(h.api.openInBrowser(),/browser refused/);assert.equal(h.api.canOpenInBrowser,true);assert.equal(h.stops,0);assert.equal(h.builds,1);h.openResult=true;await h.api.openInBrowser();assert.equal(h.opens,2);
});

test('browser runner saves, checks/builds, validates and opens one managed preview; restart closes it first',async t=>{
 const h=harness(t);await h.api.run();assert.equal(h.builds,1);assert.equal(h.previews,1);assert.equal(h.busy,false);
 assert.deepEqual(h.events.filter(v=>['save','build','validate','preview'].includes(v)),['save','build','validate','preview']);
 assert.ok(h.states.includes('Checking app…'));assert.ok(h.states.includes('Building app…'));assert.match(h.states.at(-1),/readiness unverified/);
 h.events.length=0;await h.api.run();assert.equal(h.stops,1);assert.ok(h.events.indexOf('dispose')<h.events.indexOf('build'));
 h.api.stop();assert.equal(h.stops,2);assert.equal(h.states.at(-1),'App stopped');
});

test('Stop and Cancel abort a build and reject late successful results without opening a frame',async t=>{
 for(const mode of ['stop','cancel']) {
 const h=harness(t);let signal,release;h.building=options=>{signal=options.signal;return new Promise(resolve=>{release=resolve;});};
 const pending=h.api.run();while(!signal)await tick();mode==='stop'?h.api.stop():h.cancel();assert.equal(signal.aborted,true);release({sitePath:'/stale'});await pending;
 assert.equal(h.previews,0);assert.equal(h.busy,false);assert.equal(h.states.at(-1),'App stopped');
 }
});

test('Stop during Save and a queued restart prevent both builds',async t=>{
 const h=harness(t);let release;h.saveGate=new Promise(resolve=>{release=resolve;});const first=h.api.run();while(!h.events.includes('save'))await tick();const next=h.api.run();h.api.stop();release();await Promise.all([first,next]);assert.equal(h.builds,0);
});

test('source drift, project switch and disposal prevent preview even after compiler success',async t=>{
 const drift=harness(t);drift.valid=false;await assert.rejects(drift.api.run(),/Inputs changed/);assert.equal(drift.previews,0);assert.equal(drift.failures.at(-1),true);
 for(const mode of ['switch','dispose']) {
 const h=harness(t);let release;h.building=()=>new Promise(resolve=>{release=resolve;});const pending=h.api.run();while(!release)await tick();mode==='switch'?(h.active='/other',h.workspaceChanged()):h.api.disposables[0].dispose();release({sitePath:'/stale'});await pending;assert.equal(h.previews,0);
 }
});

test('preview creation resolving after Stop destroys the newly created frame',async t=>{
 const h=harness(t);let release;h.previewGate=new Promise(resolve=>{release=resolve;});const pending=h.api.run();while(!h.previews)await tick();h.api.stop();release();await pending;assert.equal(h.stops,1);assert.equal(h.states.at(-1),'App stopped');
});

test('failed source checks populate VS Code Problems and never fall back to native launch',async t=>{
 const h=harness(t);h.building=()=>{const error=Error('Unsupported API');error.diagnostics=[{file:'src/main/java/Main.java',line:7,column:4,message:'Unsupported setEffect'}];throw error;};
 await assert.rejects(h.api.run(),/Unsupported API/);assert.equal(h.previews,0);assert.equal(h.diagnostics[0].uri.fsPath,'/project/src/main/java/Main.java');assert.equal(h.diagnostics[0].items[0].range.start.line,6);assert.equal(h.diagnostics[0].items[0].range.start.character,3);assert.match(h.states.at(-1),/could not run/);
});

test('save refusal and untrusted workspaces fail before compilation',async t=>{
 const h=harness(t);h.save=false;await assert.rejects(h.api.run(),/Save your files/);assert.equal(h.builds,0);h.vscode.workspace.isTrusted=false;await assert.rejects(h.api.run(),/Trust your own project/);assert.equal(h.builds,0);
});

test('mapped GWT and Maven diagnostics resolve only student source paths',()=>{
 assert.deepEqual(sourceDiagnostics("[ERROR] /project/src/main/java/Main.java:[5,6] Bad Java\nErrors in '/tmp/generated/src/main/java/Bird.java'\n [ERROR] Line 9: Unsupported call\n[ERROR] /elsewhere/Main.java:[1,2] Not ours",'/project'),[{file:'/project/src/main/java/Main.java',line:5,column:6,message:'Bad Java'},{file:'/project/src/main/java/Bird.java',line:9,column:1,message:'Unsupported call'}]);
});

test('managed webview confines its iframe CSP and destroys frame before listener, including user Close',async()=>{
 const events=[];let close,html,options;
 const panel={webview:{set html(v){html=v;}},onDidDispose:fn=>{close=fn;return {dispose(){}};},dispose(){events.push('frame');close();}};
 const vscode={Uri:{parse:url=>({toString:()=>url})},env:{asExternalUri:async uri=>uri},ViewColumn:{Beside:2},window:{createWebviewPanel:(_,__,___,value)=>{options=value;return panel;}}};
 const preview=await createManagedWebPreview(vscode,'/site',{serverFactory:async()=>({url:'http://127.0.0.1:1234/secret/',dispose:()=>events.push('server')}),onDidDispose:()=>events.push('closed')});
 assert.match(html,/frame-src http:\/\/127\.0\.0\.1:1234;/);assert.match(html,/sandbox="allow-scripts allow-same-origin"/);assert.match(html,/allow="autoplay; fullscreen"/);assert.equal(options.retainContextWhenHidden,true);assert.deepEqual(options.localResourceRoots,[]);assert.deepEqual(options.portMapping,[{webviewPort:1234,extensionHostPort:1234}]);preview.dispose();preview.dispose();assert.deepEqual(events,['frame','server','closed']);
});

test('resolved-member diagnostics map original source locations to Problems',()=>{assert.deepEqual(sourceDiagnostics('Main.java:12:8: Unsupported browser member javafx.scene.Node#setEffect(javafx.scene.effect.Effect)\nmodels/Bird.java:4:2: Cannot resolve browser source: Missing', '/project'),[{file:'/project/src/main/java/Main.java',line:12,column:8,message:'Unsupported browser member javafx.scene.Node#setEffect(javafx.scene.effect.Effect)'},{file:'/project/src/main/java/models/Bird.java',line:4,column:2,message:'Cannot resolve browser source: Missing'}]);});

test('browser preview uses the freshly validated immutable files instead of the incoming result',async t=>{
 const seen=[],files=[{path:'index.html',bytes:Buffer.from('VALIDATED')}];
 const api=createBrowserRunCommands({workspace:{onDidChangeWorkspaceFolders:()=>({dispose(){}})}},{project:async()=>'/project',output:{appendLine(){}},validateExport:async()=>({sitePath:'/validated/site',siteFiles:files}),previewFactory:async(_,site,options)=>{seen.push({site,files:options.siteFiles});return {dispose(){}};}});
 t.after(()=>api.disposables.forEach(d=>d.dispose()));await api.preview('/project',{sitePath:'/unvalidated'});assert.deepEqual(seen,[{site:'/validated/site',files}]);
});

test('preview passes the current project tutorial column only after root and lifecycle guards',async t=>{
 let active='/project',column=2;
 const selected=[],opened=[];
 const api=createBrowserRunCommands({workspace:{onDidChangeWorkspaceFolders:()=>({dispose(){}})}},{project:async()=>active,output:{appendLine(){}},validateExport:async({result})=>result,preferredPreviewColumn:root=>{selected.push(root);return root==='/project'?column:undefined;},previewFactory:async(_,site,options)=>{opened.push({site,column:options.viewColumn});return {dispose(){}};}});
 t.after(()=>api.disposables.forEach(d=>d.dispose()));
 const result={sitePath:'/site'};
 await api.preview('/project',result);column=3;await api.preview('/project',result);
 active='/other';await api.preview('/other',result);
 assert.deepEqual(selected,['/project','/project','/other']);assert.deepEqual(opened,[{site:'/site',column:2},{site:'/site',column:3},{site:'/site',column:undefined}]);
 await api.preview('/project',result);assert.equal(selected.length,3,'Mismatched roots never select a column or open a preview');
 api.disposables[0].dispose();await api.preview('/other',result);assert.equal(selected.length,3,'Disposed controllers never select a column or open a preview');assert.equal(opened.length,3);
});

test('Problems deduplicates source errors repeated in the summary and compiler log',async t=>{
 const h=harness(t);h.building=()=>{throw Error('Main.java:7:4: Unsupported member\nMain.java:7:4: Unsupported member');};
 await assert.rejects(h.api.run(),/Unsupported member/);assert.equal(h.diagnostics.length,1);assert.equal(h.diagnostics[0].items.length,1);assert.equal(h.diagnostics[0].items[0].message,'Unsupported member');
});

test('Stop and disposal abort the follow-up current validation and release the browser Run busy state',async t=>{
 for(const mode of ['stop','dispose']){const h=harness(t);let signal;
  h.validating=options=>{signal=options.signal;return new Promise((resolve,reject)=>{signal?.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true});});};
  const pending=h.api.run();while(!h.events.includes('validate'))await tick();assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);
  mode==='stop'?h.api.stop():h.api.disposables[0].dispose();await pending;await h.api.whenIdle();assert.equal(signal.aborted,true);assert.equal(h.busy,false);assert.equal(h.previews,0);
 }
});
test('retained preview uses its selected validator, exact result and its own cancellable generation',async t=>{
 const h=harness(t),result={buildId:'retained-A',sitePath:'/project/.zero/web-export/site'};let signal;
 h.validating=()=>assert.fail('retained preview cannot execute the current builder');
 h.retainedValidating=options=>{assert.equal(options.projectRoot,'/project');assert.equal(options.result,result);signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));};
 const pending=h.api.preview('/project',result,{retained:true});while(!signal)await tick();h.api.stop();await pending;assert.equal(signal.aborted,true);assert.equal(h.previews,0);
 h.retainedValidating=async options=>{assert.equal(options.result,result);return {...result,siteFiles:[]};};await h.api.preview('/project',result,{retained:true});assert.equal(h.previews,1);
});
test('protocol-validated compiler log restores GWT file context omitted from the bounded error summary',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{runProtocol}=require('../src/project-builder');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-protocol-problems-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const logPath=path.join(root,'owned-cache','closure','logs','project.log');await fs.mkdir(path.dirname(logPath),{recursive:true});
 await fs.writeFile(logPath,"Errors in '/generated/src/main/java/Bird.java'\n[ERROR] Line 19: Unsupported draw call\n");
 const spawn=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};child.stdin.on('finish',()=>setImmediate(()=>{child.stdout.end(JSON.stringify({protocol:1,ok:false,error:{code:'failed',message:'Summary '.repeat(600),logPath}}));child.emit('close',1);}));child.stdin.resume();return child;};
 const h=harness(t);h.active=root;h.building=()=>runProtocol({node:'/verified/node',entrypoint:'/frozen/run.cjs',request:{protocol:1,operation:'export',projectRoot:root},env:{},spawn,expectedLogPath:logPath});
 await assert.rejects(h.api.run(),error=>error.message.length===4096);assert.equal(h.diagnostics.length,1);assert.equal(h.diagnostics[0].uri.fsPath,path.join(root,'src/main/java/Bird.java'));assert.equal(h.diagnostics[0].items[0].range.start.line,18);assert.match(h.diagnostics[0].items[0].message,/Unsupported draw call/);
});
test('retained preview cancellation keeps an interrupted Run operation responsible for releasing its busy state',async t=>{
 const h=harness(t);let signal;h.validating=options=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));};
 const running=h.api.run();while(!signal)await tick();assert.equal(h.busy,true);await h.api.preview('/project',{buildId:'retained-A'},{retained:true});await running;assert.equal(h.busy,false);assert.equal(signal.aborted,true);assert.equal(h.previews,1);
});
test('disposing a retained preview aborts only its pending data validator',async t=>{
 const h=harness(t);let signal;h.retainedValidating=options=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));};const pending=h.api.preview('/project',{buildId:'retained-A'},{retained:true});while(!signal)await tick();h.api.disposables[0].dispose();await pending;assert.equal(signal.aborted,true);assert.equal(h.previews,0);assert.equal(h.busy,false);
});

test('preview readiness is event-driven and old generations cannot replace current status',async t=>{
 const h=harness(t);await h.api.run();const first=h.runtimeOptions;assert.match(h.states.at(-1),/readiness unverified/);
 first.onRuntime({type:'startup'});assert.equal(h.states.at(-1),'Starting app…');first.onRuntime({type:'ui-ready'});assert.equal(h.states.at(-1),'App ready');first.onRuntime({type:'first-frame'});assert.equal(h.states.at(-1),'App running');
 await h.api.run();const before=h.states.at(-1);first.onRuntime({type:'fatal',diagnostic:'stale'});assert.equal(h.states.at(-1),before);assert.equal(h.stops,1);
 h.runtimeOptions.onRuntime({type:'fatal',code:'FRAME_EXCEPTION',diagnostic:'java.lang.IllegalStateException: broken\n  at demo.Main.draw(Main.java:42)'});await tick();assert.match(h.states.at(-1),/stopped with an error/);assert.equal(h.failures.at(-1),true);assert.equal(h.stops,2);assert.equal(h.diagnostics[0].uri.fsPath,'/project/src/main/java/demo/Main.java');assert.equal(h.diagnostics[0].items[0].range.start.line,41);
 const failed=h.states.at(-1);h.runtimeOptions.onRuntime({type:'first-frame'});assert.equal(h.states.at(-1),failed);
});
