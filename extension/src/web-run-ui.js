'use strict';
const path = require('node:path');
const os = require('node:os');
const {createManagedWebPreview} = require('./web-run-preview');
const {runtimeDiagnostics}=require('./runtime-session');

function sourceDiagnostics(text, root) {
  const diagnostics = []; let file;
  const adapterSource=filename=>{
    const relative=String(filename).replaceAll('\\','/').match(/(?:^|\/)src\/main\/java\/(zero\/web\/.+\.java|javafx\/scene\/ZeroDisabledState\.java)$/)?.[1];
    return relative?path.join(root,'.zero-build/src/web-export/adapters/runtime',relative):undefined;
  };
  for (const line of String(text).split('\n')) {
    const source = line.match(/Errors in '([^']+\.java)'/);
    if (source) {const suffix = source[1].match(/(?:^|\/)(src\/main\/java\/.+|libraries\/[^/]+\/src\/main\/java\/.+)$/);file = adapterSource(source[1]) || (suffix ? path.join(root,suffix[1]) : undefined);}
    const maven = line.match(/(?:\[ERROR\]\s*)?(.+\.java):\[(\d+),(\d+)\]\s*(.*)/);
    if (maven) {const filename=maven[1].replace(/^\[ERROR\]\s*/,'');diagnostics.push({file:adapterSource(filename)||path.resolve(root,filename),line:Number(maven[2]),column:Number(maven[3]),message:maven[4]});}
    const attributed = line.match(/^([^\r\n]+\.java):(\d+):(\d+):\s*(.*)$/);
    if(attributed){const filename=attributed[1];diagnostics.push({file:path.isAbsolute(filename)?filename:path.join(root,filename.startsWith('src/main/java/')||filename.startsWith('libraries/')?'':'src/main/java',filename),line:Number(attributed[2]),column:Number(attributed[3]),message:attributed[4]});}
    const gwt = line.match(/Line (\d+):\s*(.*)/);
    if (file && gwt) diagnostics.push({file,line:Number(gwt[1]),column:1,message:gwt[2]});
  }
  return diagnostics.filter(item => item.file.startsWith(root+path.sep));
}

function createBrowserRunCommands(vscode, {project,output,isBusy=()=>false,setBusy=()=>{},setState=()=>{},setActive=()=>{},setFailed=()=>{},cacheRoot,ensureValidatedExport,validateExport,validateRetainedExport,previewFactory=createManagedWebPreview,beforeRun=async()=>{},preferredPreviewColumn=()=>undefined}) {
  const build = options => (ensureValidatedExport || require('./web-export/snapshot').ensureValidatedExport)(options);
  const validate = options => (validateExport || require('./web-export/snapshot').validateExport)(options);
  const problems = vscode.languages?.createDiagnosticCollection('zero-browser');
  let generation=0, queuedGeneration, operation, previewOperation, runtime, runtimeRoot, runtimeGeneration, disposed=false, queue=Promise.resolve();
  const updateActive = () => setActive(Boolean(runtime || operation && !operation.signal.aborted || previewOperation && !previewOperation.signal.aborted || queuedGeneration===generation));
  const current = async (id,root) => !disposed && id===generation && await project()===root;
  function disposeRuntime() {const old=runtime;runtime=undefined;runtimeRoot=undefined;runtimeGeneration=undefined;old?.dispose();}
  function stop({quiet=false}={}) {
    generation++;operation?.abort();previewOperation?.abort();disposeRuntime();setActive(false);
    if (!quiet && !disposed) {setFailed(false);setState('App stopped');}
  }
  async function openInBrowser() {
    const opened=runtime,id=runtimeGeneration,root=runtimeRoot;
    if(disposed || !opened || typeof opened.openInBrowser!=='function')throw Error('Preview a web export before opening it in your browser.');
    let selectedRoot;
    try {selectedRoot=await project();} catch(error) {if(runtime===opened)stop();throw error;}
    if(disposed || runtime!==opened || id!==generation)throw Error('Browser preview stopped. Preview a web export before opening it in your browser.');
    if(selectedRoot!==root){stop();throw Error('The student project changed. Preview a web export from the current project before opening it in your browser.');}
    return opened.openInBrowser();
  }
  async function diagnostics(error,root) {
    if (!problems || !root) return;
    let log=error.message;
    if (typeof error.logText==='string') log+='\n'+error.logText;
    const entries=Array.isArray(error.diagnostics) ? error.diagnostics : sourceDiagnostics(log,root);
    const grouped=new Map(),seen=new Set();
    for (const item of entries) {
      const filename=item.file || item.path;
      if (!filename) continue;
      const absolute=path.resolve(root,filename);
      if (!absolute.startsWith(root+path.sep)) continue;
      const message=String(item.message || error.message).trim();
      const key=JSON.stringify([absolute,item.line || 1,item.column || 1,message]);
      if(seen.has(key))continue;
      seen.add(key);
      const start=new vscode.Position(Math.max(0,(item.line || 1)-1),Math.max(0,(item.column || 1)-1));
      const diagnostic=new vscode.Diagnostic(new vscode.Range(start,start),message,vscode.DiagnosticSeverity.Error);
      diagnostic.source='Zero browser';
      if (!grouped.has(absolute)) grouped.set(absolute,[]);
      grouped.get(absolute).push(diagnostic);
    }
    for (const [filename,items] of grouped) problems.set(vscode.Uri.file(filename),items);
  }
  async function showPreview(root,result,id=generation,validator=validate,signal) {
    const validated=await validator({projectRoot:root,result,signal}) || result;
    if (!await current(id,root)) return;
    disposeRuntime();
    let opened;const pendingEvents=[];
    const reportRuntime=event=>{
      if(!opened){pendingEvents.push(event);return;}
      if(disposed||id!==generation||runtime!==opened||runtimeRoot!==root)return;
      if(event.type==='startup')setState('Starting app…');
      else if(event.type==='ui-ready')setState('App ready');
      else if(event.type==='first-frame')setState('App running');
      else if(event.type==='fatal'){
        setFailed(true);setState('App stopped with an error. Open Problems or check Zero output.');
        const detail=event.diagnostic||event.code;output.appendLine(detail);output.show?.(true);
        void diagnostics({message:detail,diagnostics:runtimeDiagnostics(detail,root)},root).catch(error=>output.appendLine(error.message));
        disposeRuntime();updateActive();
      }else if(event.type==='stopped'){disposeRuntime();updateActive();setState('App stopped');}
    };
    opened=await previewFactory(vscode,validated.sitePath,{siteFiles:validated.siteFiles,runtimeBuildId:validated.buildId,onRuntime:reportRuntime,title:'Zero App',viewColumn:preferredPreviewColumn(root),onOpenInBrowser:openInBrowser,onError:error=>{output.appendLine(error.message);return vscode.window.showErrorMessage?.(error.message);},onDidDispose:()=>{
      if(runtime===opened){runtime=undefined;runtimeRoot=undefined;runtimeGeneration=undefined;updateActive();if(!operation&&!disposed)setState('App stopped');}
    }});
    if (!await current(id,root)) {opened.dispose();return;}
    runtime=opened;runtimeRoot=root;runtimeGeneration=id;setActive(true);setFailed(false);setState('App opened · readiness unverified');for(const event of pendingEvents)reportRuntime(event);
  }
  async function execute(id,expectedRoot) {
    if (disposed || id!==generation) return;
    queuedGeneration=undefined;
    let root;const controller=new AbortController();operation=controller;setBusy(true);setActive(true);setFailed(false);problems?.clear();
    try {
      await beforeRun();
      root=await project();
      if(expectedRoot && root!==expectedRoot)throw Error('The student project changed. Run the original app explicitly.');
      if(vscode.workspace.isTrusted===false)throw Error('Trust your own project before compiling its Java code.');
      setState('Checking app…');
      if(!await vscode.workspace.saveAll(false))throw Error('Save your files before running the app.');
      if(!await current(id,root))return;
      output.appendLine('Run App — checking and compiling Java for the browser.');
      const work=async(progress,token)=>{
        const cancellation=token?.onCancellationRequested(()=>{if(id===generation)stop();});
        try{return await build({projectRoot:root,cacheRoot:cacheRoot || path.join(os.tmpdir(),'zero-web-cache'),env:process.env,signal:controller.signal,onProgress:message=>{
          if(controller.signal.aborted || id!==generation || disposed)return;
          const text=String(message);output.appendLine(text);progress?.report({message:text});setState(/checking|validating/i.test(text)?'Checking app…':'Building app…');
        }});}finally{cancellation?.dispose();}
      };
      const result=vscode.window.withProgress ? await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Run App',cancellable:true},work) : await work();
      if(controller.signal.aborted || !await current(id,root))return;
      await showPreview(root,result,id,validate,controller.signal);
    }catch(error){
      if(controller.signal.aborted || id!==generation || disposed)return;
      error.zeroRunMessage=root ? 'App could not run. Open Problems or check Zero output.' : error.message;
      setFailed(true);setState(error.zeroRunMessage);output.appendLine(error.message);output.show?.(true);await diagnostics(error,root);throw error;
    }finally{
      if(operation===controller){operation=undefined;setBusy(false);updateActive();}
    }
  }
  function run(expectedRoot) {
    if(disposed || isBusy() && !operation)return Promise.resolve();
    stop({quiet:true});const id=generation;queuedGeneration=id;
    const next=queue.then(()=>execute(id,expectedRoot));queue=next.catch(()=>{});setActive(true);return next;
  }
  async function preview(root,result,{retained=false}={}) {
    stop({quiet:true});const id=generation,controller=new AbortController();previewOperation=controller;updateActive();
    const validator=retained?(validateRetainedExport || require('./retained-web-export').validateRetainedExport):validate;
    try{return await showPreview(root,result,id,validator,controller.signal);}
    catch(error){if(!controller.signal.aborted&&await current(id,root))throw error;}
    finally{if(previewOperation===controller){previewOperation=undefined;updateActive();}}
  }
  const workspaceListener=vscode.workspace.onDidChangeWorkspaceFolders?.(()=>stop());
  return {commands:{'zero.runApp':run,'zero.stopApp':stop,'zero.openRunningAppInBrowser':openInBrowser},run,stop,preview,openInBrowser,whenIdle:()=>queue,get canOpenInBrowser(){return !disposed && typeof runtime?.openInBrowser==='function';},get generation(){return generation;},disposables:[{dispose(){disposed=true;stop({quiet:true});workspaceListener?.dispose();problems?.dispose();}}]};
}
module.exports={createBrowserRunCommands,sourceDiagnostics};
