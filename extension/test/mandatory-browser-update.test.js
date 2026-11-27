'use strict';
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {appSessions}=require('./fixtures/app-sessions');
const {loadBundle}=require('../src/lesson-projects');
const {git}=require('../src/core');
const format=require('../src/project-builder-format');
const {readSavedBuilder}=require('../src/project-builder');
const {loadBundledBuilder}=require('../src/project-builder-upgrade');
const {createWebPublishCommands}=require('../src/web-publish-ui');
const disposable=()=>({dispose(){}}),extensionPath=path.resolve(__dirname,'..');

async function fixture(t,{current=false,connected=false,onPrompt=async()=>undefined}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-required-update-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const published=(await loadBundle(extensionPath))[0].files;
 const files=current?[...published.filter(file=>!file.path.startsWith('.zero-build/')),...(await loadBundledBuilder(extensionPath)).files.map(file=>({path:'.zero-build/'+file.path,content:file.bytes}))]:published;
 for(const file of files){const dest=path.join(root,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.content);}
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 const repository='https://github.com/student/game',repositoryId=12;
 const session=connected ? {id:'browser-repair-session',account:{id:'1',label:'student'},accessToken:'TEST_BROWSER_REPAIR',scopes:[]} : null;
 if(connected) {
  await git(root,['init','-b','main']);
  await git(root,['remote','add','origin',repository+'.git']);
 }
 const builder=path.join(root,'.zero-build');
 if(!current){await fs.appendFile(path.join(builder,'README.md'),'\nOlder fixture.\n');const manifest=JSON.parse(await fs.readFile(path.join(builder,'builder.json')));const files=await Promise.all(manifest.files.map(async f=>({path:f.path,bytes:await fs.readFile(path.join(builder,...f.path.split('/')))})));await fs.writeFile(path.join(builder,'builder.json'),JSON.stringify(format.createBuilderManifest(files),null,2)+'\n');}
 const old=await readSavedBuilder(root),commands=new Map(),errors=[],prompts=[],logs=[],executed=[],updates=[],publicationPrompts=[],folderListeners=[];
 let attempts=0,completed=0,publicationReviews=0,controlsProvider,receive,repairClick;
 const vscode={authentication:{getSession:async()=>session,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:listener=>{folderListeners.push(listener);return disposable();},onDidChangeConfiguration:disposable},window:{createOutputChannel:()=>({appendLine:v=>logs.push(v),show(){},dispose(){}}),registerWebviewViewProvider:(_id,value)=>{controlsProvider=value;return disposable();},registerTreeDataProvider:disposable,showInformationMessage:async(...args)=>{publicationPrompts.push(args);},showErrorMessage:async v=>errors.push(v),showWarningMessage:async(...args)=>{prompts.push(args);return onPrompt(vscode,args);}},tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async(id,...args)=>{executed.push([id,...args]);if(id==='zero.repairBrowserTools')return repairClick=commands.get(id)(...args);if(args.length && commands.has(id))return commands.get(id)(...args);}},Uri:{file:fsPath=>({fsPath})}};
 const originalLoad=Module._load,filename=require.resolve('../src/extension'),oldCache=require.cache[filename];delete require.cache[filename];
 Module._load=function(id,...args){if(id==='vscode')return vscode;
 if(id==='./web-publish-ui')return {createWebPublishCommands:(editor,deps)=>createWebPublishCommands(editor,{...deps,publisherFactory:()=>({
  review:async()=>{publicationReviews++;return {status:'review',root,account:'1',repository,repositoryId,publicUrl:'https://student.github.io/game/',sha:'a'.repeat(40)};},
  verifyCurrent:async()=>({status:'stale'}),
  publish:async()=>assert.fail('Browser repair cannot authorize deployment')
 })})};
 const value=originalLoad.call(this,id,...args);if(id==='./project-builder')return {...value,createProjectBuilder:()=>({ensureValidatedExport:async()=>{attempts++;if(!current&&(await readSavedBuilder(root)).profileHash===old.profileHash)throw Object.assign(Error('Update required'),{code:'ZERO_BUILDER_UPDATE_REQUIRED'});completed++;return {sitePath:path.join(root,'site'),buildId:'test'};},validateExport:async()=>{},validateRetainedExport:async()=>{},assertBuildInputsAtCommit:async()=>{}})};return value;};
 let extension;try{extension=require(filename);}finally{Module._load=originalLoad;}
 const subscriptions=[];t.after(()=>{for(const item of subscriptions)item.dispose();delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
 const provider=appSessions(vscode,{dispose(){},async removeSession(){}});
 const publishIdentity=connected ? {
  repositories:{checkSetup:async()=>({}),async readOwnedRepository(url,{ticket}) {
   assert.equal(url,repository);assert.equal(ticket.session.accountId,'1');
   return {id:repositoryId,html_url:repository,owner:{id:1}};
  }},
  async gameJamRequest(url,options) {
   assert.equal(url,'https://zero.codepet.ca/api/desktop/jams/project?repositoryId='+repositoryId+'&includeDestinations=1');
   assert.equal(options.headers.Authorization,'Bearer '+session.accessToken);
   return Response.json({configured:true,destination:null});
  }
 } : {};
 extension.activate({extensionMode:2,subscriptions,extensionPath,globalState:{get:()=>undefined,keys:()=>[],update:async()=>{}},
  workspaceState:{get:key=>key.startsWith('zero.webPublish.')?undefined:true,update:async()=>{}}},{env:{},repositoryLedgerFactory,provider,...publishIdentity});
 return {root,old,vscode,commands,errors,prompts,logs,executed,updates,publicationPrompts,folderListeners,get publicationReviews(){return publicationReviews;},
 click:token=>{receive({command:'zero.repairBrowserTools',repairToken:token});return repairClick;},get attempts(){return attempts;},get completed(){return completed;},async openSidebar(visible=true){
  const {promise,resolve}=Promise.withResolvers();
  const onControls=html=>{if(html.includes('data-command="zero.toggleApp"'))resolve(html);};
  const webview={html:'',onDidReceiveMessage:listener=>{receive=listener;return disposable();},postMessage:message=>{updates.push(message);onControls(message.controls);}};
  controlsProvider.resolveWebviewView({webview,visible,onDidDispose:disposable});
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
test('declining the browser tools update leaves the project intact and never builds',async t=>{
 const h=await fixture(t,{connected:true}),upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate,originalApply=upgrade.applyUpdate;let plans=0,applies=0;
 t.after(()=>{upgrade.planUpdate=originalPlan;upgrade.applyUpdate=originalApply;});
 upgrade.planUpdate=async options=>{plans++;return originalPlan(options);};
 upgrade.applyUpdate=async()=>{applies++;throw Error('must not apply');};
 const originalCore=await fs.readFile(path.join(h.root,'zero-core.json')),originalBuilder=(await readSavedBuilder(h.root)).profileHash;
 const controls=await h.openSidebar();
 assert.doesNotMatch(controls,/older Zero files|Start Page → Project → New/);
 assert.equal(plans,0);
 for(const command of ['zero.exportWeb','zero.publishAndOpenWeb']){
  await h.commands.get(command)();
  assert.match(h.logs.at(-1),/Browser action cancelled.*No browser tools were changed/);
 }
 assert.deepEqual(h.errors,[]);
 assert.equal(plans,0);assert.equal(applies,0);assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal(h.prompts.length,2);
 assert.deepEqual(await fs.readFile(path.join(h.root,'zero-core.json')),originalCore);assert.equal((await readSavedBuilder(h.root)).profileHash,originalBuilder);
});
test('accepted browser tools update builds with the current builder and preserves original source and tools',async t=>{
 const h=await fixture(t,{onPrompt:async(_vscode,items)=>items[2]});
 const record=JSON.parse(await fs.readFile(path.join(h.root,'zero-core.json'))),customized=record.sources[0].path;
 await fs.appendFile(path.join(h.root,customized),'\n// Student customization, intentionally differing from the core record.\n');
 await fs.mkdir(path.join(h.root,'src/main/resources'),{recursive:true});
 await fs.writeFile(path.join(h.root,'src/main/resources/student.txt'),'Student asset');
 const paths=['zero-core.json','pom.xml','src/main/java/Main.java',customized,'src/main/resources/student.txt'];
 const before=await Promise.all(paths.map(name=>fs.readFile(path.join(h.root,name))));
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.deepEqual(h.errors,[]);assert.equal(h.prompts.length,1);
 assert.equal(h.prompts[0][2].title,'Update Browser Tools');
 assert.notEqual((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);
 for(let i=0;i<paths.length;i++)assert.deepEqual(await fs.readFile(path.join(h.root,paths[i])),before[i]);
 const backup=(await fs.readdir(h.root)).find(name=>name.startsWith('.zero-build-backup-'));
 assert.ok(backup);assert.equal((await readSavedBuilder(path.join(h.root,backup))).profileHash,h.old.profileHash);
 await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.equal(h.completed,2);
});
test('browser tools update stops before writing when trust changes during its confirmation',async t=>{
 const h=await fixture(t,{onPrompt:async(vscode,items)=>{vscode.workspace.isTrusted=false;return items[2];}});
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.ok(h.errors.length);
 assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);
 assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-build-backup-')));
});
test('browser tools can be installed without a core ownership record',async t=>{
 const h=await fixture(t,{onPrompt:async(_vscode,items)=>items[2]});
 await fs.rm(path.join(h.root,'zero-core.json'));
 await fs.rm(path.join(h.root,'.zero-build'),{recursive:true});
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.deepEqual(h.errors,[]);
 await assert.rejects(fs.stat(path.join(h.root,'zero-core.json')),{code:'ENOENT'});
});
test('current browser tooling does not require a core update plan',async t=>{
 const h=await fixture(t,{current:true});
 await fs.rm(path.join(h.root,'zero-core.json'));
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.deepEqual(h.errors,[]);
});
test('core-only browser check stops when trust changes during planning',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-builder-upgrade'),originalPlan=upgrade.planUpgrade;
 t.after(()=>{upgrade.planUpgrade=originalPlan;});
 upgrade.planUpgrade=async()=>{h.vscode.workspace.isTrusted=false;return {changed:false};};
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

async function requestRepair(h,id='zero.exportWeb') {
 await h.commands.get(id)();
 const pending=h.updates.at(-1);
 assert.equal(pending.status,'Some browser tools are missing.');
 assert.equal(pending.recoveryAction.command,'zero.repairBrowserTools');
 assert.ok(pending.recoveryAction.repairToken);
 return pending.recoveryAction.repairToken;
}

test('hidden controls reveal inline repair and one click retries just the requested export',async t=>{
 const h=await fixture(t,{current:true});await h.openSidebar(false);
 h.vscode.workspace.getConfiguration=section=>({get:(key,fallback)=>section==='chat' && key==='disableAIFeatures' ? true : fallback});
 const missing=path.join(h.root,'.zero-build','README.md');
 await fs.unlink(missing);
 const token=await requestRepair(h);
 assert.ok(h.executed.some(([id])=>id==='zero.controls.focus'));
 assert.equal(h.executed.at(-1)[0],'zero.controls.focus','Focusing Project is the final reveal even in the Secondary Side Bar');
 assert.equal(h.attempts,0);assert.deepEqual(h.prompts,[]);assert.deepEqual(h.errors,[]);
 await assert.rejects(fs.stat(missing),{code:'ENOENT'});
 await h.commands.get('zero.repairBrowserTools')('outdated');
 await Promise.all([h.click(token),h.click(token)]);
 assert.equal(h.completed,1);assert.deepEqual(h.errors,[]);
 assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);
 const backups=(await fs.readdir(h.root)).filter(name=>name.startsWith('.zero-build-backup-'));
 assert.equal(backups.length,1);await assert.rejects(fs.stat(path.join(h.root,backups[0],'.zero-build','README.md')),{code:'ENOENT'});
 assert.ok(h.updates.some(message=>message.status==='Repairing browser tools…'));
 assert.equal(h.updates.at(-1).status,'Export ready');assert.equal(h.publicationReviews,0);
});

test('a repair click resumes the selected publish mode and still requires public destination consent',async t=>{
 const h=await fixture(t,{current:true,connected:true});await h.openSidebar();
 for(const id of ['zero.publishWeb','zero.publishAndOpenWeb']) {
  await fs.unlink(path.join(h.root,'.zero-build','README.md'));
  const before=h.publicationReviews;
  const token=await requestRepair(h,id);
  assert.equal(h.publicationReviews,before);assert.deepEqual(h.prompts,[]);
  await h.commands.get('zero.repairBrowserTools')(token);
  assert.ok(h.executed.some(([resumed,root])=>resumed===id && root===h.root));
  assert.equal(h.publicationReviews,before+1);assert.equal(h.publicationPrompts.at(-1)[0],'Publish app?');
  assert.equal(h.publicationPrompts.at(-1)[1].modal,true);assert.equal(h.attempts,0);assert.deepEqual(h.errors,[]);
 }
});

test('a superseded repair click cannot consent to another browser action or changed files',async t=>{
 const h=await fixture(t,{current:true,connected:true});await h.openSidebar();
 const missing=path.join(h.root,'.zero-build','README.md');await fs.unlink(missing);
 const first=await requestRepair(h),second=await requestRepair(h,'zero.publishWeb');assert.notEqual(first,second);
 await h.commands.get('zero.repairBrowserTools')(first);
 assert.equal(h.updates.at(-1).recoveryAction.repairToken,second);
 const edited=path.join(h.root,'.zero-build','builder.json');
 await fs.appendFile(edited,' ');
 await h.commands.get('zero.repairBrowserTools')(second);
 assert.match(h.updates.at(-1).status,/repair stopped/i);assert.ok(h.logs.some(line=>/backup or Git history/.test(line)));
 await assert.rejects(fs.stat(missing),{code:'ENOENT'});assert.ok((await fs.readFile(edited,'utf8')).endsWith(' '));
 assert.equal(h.publicationReviews,0);assert.equal(h.attempts,0);
 assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-build-backup-')));
});

test('workspace changes, cancellation and lost trust discard repair authority',async t=>{
 const h=await fixture(t,{current:true});await h.openSidebar();
 const missing=path.join(h.root,'.zero-build','README.md');await fs.unlink(missing);
 const changed=await requestRepair(h);
 for(const listener of h.folderListeners)listener({added:[],removed:[]});
 await h.commands.get('zero.repairBrowserTools')(changed);
 const cancelled=await requestRepair(h,'zero.enableBrowserChecks');
 await h.commands.get('zero.disableBrowserChecks')();await h.commands.get('zero.repairBrowserTools')(cancelled);
 const untrusted=await requestRepair(h);h.vscode.workspace.isTrusted=false;
 await h.commands.get('zero.repairBrowserTools')(untrusted);
 assert.equal(h.attempts,0);await assert.rejects(fs.stat(missing),{code:'ENOENT'});
 assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-build-backup-')));
});

test('a new recovery journal or disabling checks before the first write stops an accepted repair',async t=>{
 for(const mode of ['recovery journal','disable checks'])await t.test(mode,async t=>{
  const h=await fixture(t,{current:true});await h.openSidebar();
  const missing=path.join(h.root,'.zero-build','README.md');await fs.unlink(missing);
  const token=await requestRepair(h,mode==='disable checks'?'zero.enableBrowserChecks':'zero.exportWeb');
  const upgrade=require('../src/project-builder-upgrade'),apply=upgrade.applyUpgrade;
  t.mock.method(upgrade,'applyUpgrade',async(...args)=>{
   if(mode==='disable checks')await h.commands.get('zero.disableBrowserChecks')();
   else {
    const recovery=path.join(h.root,'.zero-update-interrupted');
    await fs.mkdir(recovery);
    await fs.writeFile(path.join(recovery,'journal.json'),'{}');
   }
   return apply(...args);
  });
  await h.click(token);
  await assert.rejects(fs.stat(missing),{code:'ENOENT'});
  assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-build-backup-')));
  assert.equal(h.attempts,0);
  assert.match(h.updates.at(-1).status,/repair stopped/i);
 });
});
