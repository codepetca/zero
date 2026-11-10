'use strict';
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {appSessions}=require('./fixtures/app-sessions');
const {loadBundle}=require('../src/lesson-projects');
const format=require('../src/project-builder-format');
const {readSavedBuilder}=require('../src/project-builder');
const disposable=()=>({dispose(){}}),extensionPath=path.resolve(__dirname,'..');
const migrationSteps=/Start Page → Project → New and copy your Java files and assets/;

async function fixture(t,{current=false,onPrompt=async(_vscode,items)=>items[2]}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-required-update-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const file of (await loadBundle(extensionPath))[0].files){const dest=path.join(root,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.content);}
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 const builder=path.join(root,'.zero-build');
 if(!current){await fs.appendFile(path.join(builder,'README.md'),'\nOlder fixture.\n');const manifest=JSON.parse(await fs.readFile(path.join(builder,'builder.json')));const files=await Promise.all(manifest.files.map(async f=>({path:f.path,bytes:await fs.readFile(path.join(builder,...f.path.split('/')))})));await fs.writeFile(path.join(builder,'builder.json'),JSON.stringify(format.createBuilderManifest(files),null,2)+'\n');}
 const old=await readSavedBuilder(root),commands=new Map(),errors=[],prompts=[],logs=[];let attempts=0,completed=0,controlsProvider;
 const vscode={authentication:{getSession:async()=>null,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},window:{createOutputChannel:()=>({appendLine:v=>logs.push(v),show(){},dispose(){}}),registerWebviewViewProvider:(_id,value)=>{controlsProvider=value;return disposable();},registerTreeDataProvider:disposable,showErrorMessage:async v=>errors.push(v),showWarningMessage:async(...args)=>{prompts.push(args);return onPrompt(vscode,args);}},tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})}};
 const originalLoad=Module._load,filename=require.resolve('../src/extension'),oldCache=require.cache[filename];delete require.cache[filename];
 Module._load=function(id,...args){if(id==='vscode')return vscode;const value=originalLoad.call(this,id,...args);if(id==='./project-builder')return {...value,createProjectBuilder:()=>({ensureValidatedExport:async()=>{attempts++;if(!current&&(await readSavedBuilder(root)).profileHash===old.profileHash)throw Object.assign(Error('Update required'),{code:'ZERO_BUILDER_UPDATE_REQUIRED'});completed++;return {sitePath:path.join(root,'site'),buildId:'test'};},validateExport:async()=>{},validateRetainedExport:async()=>{},assertBuildInputsAtCommit:async()=>{}})};return value;};
 let extension;try{extension=require(filename);}finally{Module._load=originalLoad;}
 const subscriptions=[];t.after(()=>{for(const item of subscriptions)item.dispose();delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
 const provider=appSessions(vscode,{dispose(){},async removeSession(){}});
 extension.activate({extensionMode:2,subscriptions,extensionPath,workspaceState:{get:()=>true,update:async()=>{}}},{env:{},repositoryLedgerFactory,provider});
 return {root,old,vscode,commands,errors,prompts,logs,get attempts(){return attempts;},get completed(){return completed;},async openSidebar(){
  const {promise,resolve}=Promise.withResolvers();
  const onControls=html=>{if(html.includes('data-command="zero.toggleApp"'))resolve(html);};
  const webview={html:'',onDidReceiveMessage:disposable,postMessage:({controls})=>onControls(controls)};
  controlsProvider.resolveWebviewView({webview,onDidDispose:disposable});
  onControls(webview.html);
  return promise;
 }};
}

test('current tooling builds without a prompt',async t=>{
 const h=await fixture(t,{current:true});await h.commands.get('zero.exportWeb')();assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.equal(h.prompts.length,0);assert.deepEqual(h.errors,[]);
});
test('current browser tooling runs without changing an older core',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate,originalApply=upgrade.applyUpdate;let applies=0;
 t.after(()=>{upgrade.planUpdate=originalPlan;upgrade.applyUpdate=originalApply;});
 const originalCore=await fs.readFile(path.join(h.root,'zero-core.json')),originalBuilder=(await readSavedBuilder(h.root)).profileHash;
 upgrade.planUpdate=async()=>({changed:true,coreChanged:true,builderChanged:false});
 upgrade.applyUpdate=async(_plan,{assertCurrent})=>{await assertCurrent();applies++;return {backupPath:'/backup'};};
 await h.commands.get('zero.exportWeb')();
 assert.equal(applies,0);assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.equal(h.prompts.length,0);assert.deepEqual(h.errors,[]);
 assert.deepEqual(await fs.readFile(path.join(h.root,'zero-core.json')),originalCore);assert.equal((await readSavedBuilder(h.root)).profileHash,originalBuilder);
});
test('real core-only update plan permits current browser tooling without altering core files',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),core=require('../src/core-contract');
 const recordPath=path.join(h.root,'zero-core.json'),record=JSON.parse(await fs.readFile(recordPath));
 record.coordinate.version='0.2.9';const first=record.sources[0],sourcePath=path.join(h.root,first.path);
 await fs.appendFile(sourcePath,'\n// Earlier recorded framework.\n');
 first.sha256=format.sha256(Buffer.from(core.normalizeSource(await fs.readFile(sourcePath))));record.sourceSha256=format.sha256(Buffer.from(JSON.stringify(record.sources)));
 await fs.writeFile(recordPath,JSON.stringify(record,null,2)+'\n');
 const beforeCore=await fs.readFile(recordPath),beforeSource=await fs.readFile(sourcePath),beforeBuilder=(await readSavedBuilder(h.root)).profileHash;
 const plan=await upgrade.planUpdate({projectRoot:h.root,extensionPath});assert.equal(plan.coreChanged,true);assert.equal(plan.builderChanged,false);
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.equal(h.prompts.length,0);assert.deepEqual(h.errors,[]);
 assert.deepEqual(await fs.readFile(recordPath),beforeCore);assert.deepEqual(await fs.readFile(sourcePath),beforeSource);assert.equal((await readSavedBuilder(h.root)).profileHash,beforeBuilder);
 assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-update-')));
});
test('core-only browser action blocks dirty editor buffers before planning',async t=>{
 const h=await fixture(t,{current:true});h.vscode.workspace.textDocuments=[{isDirty:true,uri:{fsPath:path.join(h.root,'src/main/java/Main.java')}}];
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal(h.prompts.length,0);assert.ok(h.errors.some(message=>/save your project files/i.test(message)));
});
test('outdated tooling stays quiet until export or publish and leaves the project intact',async t=>{
 const h=await fixture(t),upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate,originalApply=upgrade.applyUpdate;let plans=0,applies=0;
 t.after(()=>{upgrade.planUpdate=originalPlan;upgrade.applyUpdate=originalApply;});
 upgrade.planUpdate=async options=>{plans++;return originalPlan(options);};
 upgrade.applyUpdate=async()=>{applies++;throw Error('must not apply');};
 const originalCore=await fs.readFile(path.join(h.root,'zero-core.json')),originalBuilder=(await readSavedBuilder(h.root)).profileHash;
 const controls=await h.openSidebar();
 assert.doesNotMatch(controls,/older Zero files|Start Page → Project → New/);
 assert.equal(plans,0);
 for(const command of ['zero.exportWeb','zero.publishAndOpenWeb']){
  await h.commands.get(command)();
  assert.match(h.errors.at(-1),migrationSteps);
 }
 assert.equal(h.errors.length,2);
 assert.equal(plans,2);assert.equal(applies,0);assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal(h.prompts.length,0);
 assert.deepEqual(await fs.readFile(path.join(h.root,'zero-core.json')),originalCore);assert.equal((await readSavedBuilder(h.root)).profileHash,originalBuilder);
});
test('projects predating the core record get migration steps instead of a missing file error',async t=>{
 const h=await fixture(t);
 await fs.rm(path.join(h.root,'zero-core.json'));
 await fs.rm(path.join(h.root,'.zero-build'),{recursive:true});
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,0);
 assert.match(h.errors.at(-1),migrationSteps);
});
test('a missing core record with current browser tooling gets specific recovery guidance',async t=>{
 const h=await fixture(t,{current:true});
 await fs.rm(path.join(h.root,'zero-core.json'));
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,0);
 assert.match(h.errors.at(-1),/zero-core\.json is missing/);
 assert.doesNotMatch(h.errors.at(-1),migrationSteps);
});
test('core-only browser check stops when trust changes during planning',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate;
 t.after(()=>{upgrade.planUpdate=originalPlan;});
 upgrade.planUpdate=async()=>{h.vscode.workspace.isTrusted=false;return {changed:true,coreChanged:true,builderChanged:false};};
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal(h.prompts.length,0);assert.ok(h.errors.length);
});
test('incomplete project update still blocks browser actions with current tooling',async t=>{
 const h=await fixture(t,{current:true}),folder=path.join(h.root,'.zero-update-blocked1');
 await fs.mkdir(folder);await fs.writeFile(path.join(folder,'journal.json'),'{}');
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal(h.prompts.length,0);assert.match(h.errors.at(-1),/incomplete.*recover/i);
 assert.equal(await fs.readFile(path.join(folder,'journal.json'),'utf8'),'{}');
});
test('explicit project update and recovery do not mutate project files',async t=>{
 const h=await fixture(t),upgrade=require('../src/project-update'),oldApply=upgrade.applyUpdate,oldRecover=upgrade.recoverUpdate,oldList=upgrade.listRecoveries;let calls=0;
 t.after(()=>{upgrade.applyUpdate=oldApply;upgrade.recoverUpdate=oldRecover;upgrade.listRecoveries=oldList;});
 upgrade.applyUpdate=async()=>{calls++;};upgrade.recoverUpdate=async()=>{calls++;};
 const before=(await readSavedBuilder(h.root)).profileHash;
 await h.commands.get('zero.updateProject')();
 upgrade.listRecoveries=async()=>[{status:'incomplete',recoveryPath:path.join(h.root,'.zero-update-test')}];
 await h.commands.get('zero.recoverProjectUpdate')();
 assert.equal(calls,0);assert.equal((await readSavedBuilder(h.root)).profileHash,before);
 assert.equal(h.errors.filter(value=>/temporarily unavailable/.test(value)).length,2);
});
