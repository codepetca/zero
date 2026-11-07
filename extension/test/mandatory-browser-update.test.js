'use strict';
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {appSessions}=require('./fixtures/app-sessions');
const {loadBundle}=require('../src/lesson-projects');
const format=require('../src/project-builder-format');
const {readSavedBuilder}=require('../src/project-builder');
const disposable=()=>({dispose(){}}),extensionPath=path.resolve(__dirname,'..');

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
 extension.activate({subscriptions,extensionPath,workspaceState:{get:()=>true,update:async()=>{}}},{repositoryLedgerFactory,provider});
 return {root,old,vscode,commands,errors,prompts,logs,get attempts(){return attempts;},get completed(){return completed;},render(){const webview={html:'',onDidReceiveMessage:disposable};controlsProvider.resolveWebviewView({webview,onDidDispose:disposable});return webview;}};
}

test('accepting required update preserves the original before the build',async t=>{
 const h=await fixture(t);const files=['README.md','builder.json'];const originals=await Promise.all(files.map(name=>fs.readFile(path.join(h.root,'.zero-build',name))));await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.equal(h.prompts[0][0],`Update this project for Zero ${require('../package.json').version}?`);assert.deepEqual(h.prompts[0][1],{modal:true,detail:'This may cause your project to stop working. The updated Zero files include their license in .zero-build/src/web-export/notices; your existing project LICENSE stays unchanged.'});assert.deepEqual(h.prompts[0][2],{title:'Update Project'});assert.deepEqual(h.prompts[0][3],{title:'Not Now',isCloseAffordance:true});assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.deepEqual(h.errors,[]);
 const backup=(await fs.readdir(h.root)).find(name=>name.startsWith('.zero-update-'));assert.ok(backup);for(let i=0;i<files.length;i++)assert.deepEqual(await fs.readFile(path.join(h.root,backup,'before','.zero-build',files[i])),originals[i]);assert.notEqual((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);
});
test('declining or dismissing a required update preserves the builder and does not build',async t=>{
 for(const mode of ['not now','dismiss'])await t.test(mode,async t=>{const h=await fixture(t,{onPrompt:async(_vscode,items)=>mode==='not now'?items[3]:undefined});await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-update-')));assert.match(h.errors.at(-1),/cancelled/i);});
});
test('revoked trust or changed project after consent prevents replacement',async t=>{
 for(const mode of ['trust','project'])await t.test(mode,async t=>{const h=await fixture(t,{onPrompt:async (vscode,items)=>{if(mode==='trust')vscode.workspace.isTrusted=false;else vscode.workspace.workspaceFolders=[];return items[2];}});await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.equal(h.attempts,0);assert.equal(h.completed,0);assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-update-')));assert.ok(h.errors.length);});
});
test('current tooling builds without a prompt',async t=>{
 const h=await fixture(t,{current:true});await h.commands.get('zero.exportWeb')();assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.equal(h.prompts.length,0);assert.deepEqual(h.errors,[]);
});
test('trust revoked during the asynchronous project lookup prevents replacement',async t=>{
 const core=require('../src/core'),original=core.resolveProject;
 t.after(()=>{core.resolveProject=original;});
 const h=await fixture(t,{onPrompt:async (vscode,items)=>{core.resolveProject=async (...args)=>{const result=await original(...args);vscode.workspace.isTrusted=false;return result;};return items[2];}});
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.prompts.length,1);assert.equal(h.attempts,0);assert.equal(h.completed,0);
 assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);assert.ok(h.errors.length);
});

test('core-only update is offered before browser build even when browser tooling is current',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate,originalApply=upgrade.applyUpdate;let applies=0;
 t.after(()=>{upgrade.planUpdate=originalPlan;upgrade.applyUpdate=originalApply;});
 upgrade.planUpdate=async()=>({changed:true,coreChanged:true,builderChanged:false});
 upgrade.applyUpdate=async(_plan,{assertCurrent})=>{await assertCurrent();applies++;return {backupPath:'/backup'};};
 await h.commands.get('zero.exportWeb')();
 assert.equal(applies,1);assert.equal(h.attempts,1);assert.equal(h.prompts[0][1].detail,'This may cause your project to stop working. The updated Zero files include their license in .zero-build/src/web-export/notices; your existing project LICENSE stays unchanged.');assert.deepEqual(h.errors,[]);
});
test('explicit update and legacy alias both offer the combined action; dirty buffers prevent review',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate,originalApply=upgrade.applyUpdate;let applies=0;
 t.after(()=>{upgrade.planUpdate=originalPlan;upgrade.applyUpdate=originalApply;});
 upgrade.planUpdate=async()=>({changed:true,coreChanged:true,builderChanged:true});
 upgrade.applyUpdate=async(_plan,{assertCurrent})=>{await assertCurrent();applies++;return {backupPath:'/backup'};};
 await h.commands.get('zero.updateProject')();await h.commands.get('zero.upgradeBrowserTooling')();assert.equal(applies,2);
 assert.equal(h.prompts[0][0],`Update this project for Zero ${require('../package.json').version}?`);
 h.vscode.workspace.textDocuments=[{isDirty:true,uri:{fsPath:path.join(h.root,'src/main/java/Main.java')}}];
 await h.commands.get('zero.updateProject')();assert.equal(applies,2);assert.match(h.errors.at(-1),/Save your project files/);
});
test('recovery is explicitly selected and confirmed, and rechecks trust',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),oldList=upgrade.listRecoveries,oldRecover=upgrade.recoverUpdate;let calls=0;
 t.after(()=>{upgrade.listRecoveries=oldList;upgrade.recoverUpdate=oldRecover;});
 const recoveryPath=path.join(h.root,'.zero-update-123');
 upgrade.listRecoveries=async()=>[{recoveryPath,status:'incomplete',label:'Incomplete project update'},{recoveryPath:'/completed',status:'complete',label:'Complete'}];
 upgrade.recoverUpdate=async(args,{assertCurrent})=>{await assertCurrent();assert.deepEqual(args,{projectRoot:h.root,recoveryPath});calls++;};
 h.vscode.window.showQuickPick=async items=>{assert.equal(items.length,1);return items[0];};
 h.vscode.window.showWarningMessage=async()=> 'Recover';
 await h.commands.get('zero.recoverProjectUpdate')();assert.equal(calls,1);
 h.vscode.window.showWarningMessage=async()=>{h.vscode.workspace.isTrusted=false;return 'Recover';};
 await h.commands.get('zero.recoverProjectUpdate')();assert.equal(calls,1);assert.ok(h.errors.length);
});

test('Git project update and recovery stop for incomplete file restoration under the shared lock',async t=>{
 for(const scenario of ['update-existing','update-late','update-clear','recover-existing','recover-late','recover-clear'])await t.test(scenario,async t=>{
  const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),original={plan:upgrade.planUpdate,apply:upgrade.applyUpdate,list:upgrade.listRecoveries,recover:upgrade.recoverUpdate};
  t.after(()=>Object.assign(upgrade,{planUpdate:original.plan,applyUpdate:original.apply,listRecoveries:original.list,recoverUpdate:original.recover}));
  const {execFileSync}=require('node:child_process');execFileSync('git',['init','-q',h.root],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
  const folder=path.join(h.root,'.git','zero-file-restore-recovery-abc123');let mutations=0,seenLock=false;
  const mutation=async(_value,{assertCurrent})=>{
   seenLock=Boolean(await fs.stat(path.join(h.root,'.git','zero-commit-provenance.lock')));
   if(scenario.endsWith('late'))await fs.mkdir(folder);
   await assertCurrent();mutations++;return {backupPath:'/backup'};
  };
  upgrade.planUpdate=async()=>({changed:true});upgrade.applyUpdate=mutation;
  upgrade.listRecoveries=async()=>[{recoveryPath:path.join(h.root,'.zero-update-123'),status:'incomplete',label:'Incomplete project update'}];upgrade.recoverUpdate=mutation;
  h.vscode.window.showQuickPick=async items=>items[0];
  h.vscode.window.showWarningMessage=async(_message,_options,...choices)=>scenario.startsWith('recover')?'Recover':choices[0];
  if(scenario.endsWith('existing'))await fs.mkdir(folder);
  await h.commands.get(scenario.startsWith('recover')?'zero.recoverProjectUpdate':'zero.updateProject')();
  if(scenario.endsWith('clear')){assert.equal(mutations,1);assert.deepEqual(h.errors,[]);assert.equal(seenLock,true);}
  else {assert.equal(mutations,0);assert.ok(await fs.stat(folder));assert.ok(h.errors.some(value=>/restoration needs inspection/i.test(value)));assert.equal(seenLock,scenario.endsWith('late'));}
 });
});
test('a linked worktree cannot update past incomplete recovery in its common Git directory',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),oldPlan=upgrade.planUpdate,oldApply=upgrade.applyUpdate;
 t.after(()=>{upgrade.planUpdate=oldPlan;upgrade.applyUpdate=oldApply;});
 const {execFileSync}=require('node:child_process'),git=(...args)=>execFileSync('git',args,{cwd:h.root,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
 git('init','-q');git('add','zero.json','pom.xml');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Initial');
 const linked=path.join(h.root,'linked');git('worktree','add','-qb','linked',linked);const folder=path.join(h.root,'.git','zero-file-restore-recovery-abc123');await fs.mkdir(folder);
 h.vscode.workspace.workspaceFolders=[{uri:{fsPath:linked}}];let called=false;upgrade.planUpdate=async()=>({changed:true});upgrade.applyUpdate=async()=>{called=true;};
 h.vscode.window.showWarningMessage=async(_message,_options,...choices)=>choices[0];await h.commands.get('zero.updateProject')();
 assert.equal(called,false);assert.ok(await fs.stat(folder));assert.ok(h.errors.some(value=>/restoration needs inspection/i.test(value)));
});
test('a non-Git project refuses update if Git metadata appears before mutation',async t=>{
 const h=await fixture(t,{current:true}),upgrade=require('../src/project-update'),oldPlan=upgrade.planUpdate,oldApply=upgrade.applyUpdate;
 t.after(()=>{upgrade.planUpdate=oldPlan;upgrade.applyUpdate=oldApply;});let changed=false;
 upgrade.planUpdate=async()=>({changed:true});upgrade.applyUpdate=async(_plan,{assertCurrent})=>{await fs.mkdir(path.join(h.root,'.git'));await assertCurrent();changed=true;};
 h.vscode.window.showWarningMessage=async(_message,_options,...choices)=>choices[0];await h.commands.get('zero.updateProject')();
 assert.equal(changed,false);assert.ok(h.errors.some(value=>/Git metadata changed/i.test(value)));assert.ok(await fs.stat(path.join(h.root,'.git')));
});

test('opening a trusted older project shows a prominent update action without repeated scans or mutation',async t=>{
 const upgrade=require('../src/project-update'),originalPlan=upgrade.planUpdate,originalApply=upgrade.applyUpdate;let scans=0,applies=0;
 t.after(()=>{upgrade.planUpdate=originalPlan;upgrade.applyUpdate=originalApply;});
 upgrade.planUpdate=async()=>{scans++;return {changed:true,coreChanged:true,builderChanged:false};};
 upgrade.applyUpdate=async()=>{applies++;throw Error('Opening must not update');};
 const h=await fixture(t,{current:true});const view=h.render();
 const deadline=Date.now()+3000;while(!view.html.includes('Project update available')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert.match(view.html,/Project update available/);assert.match(view.html,/<button class="secondary" data-command="zero.updateProject"/);
 assert.equal(applies,0);assert.equal(h.prompts.length,0);assert.equal(scans,1);
 h.render();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(scans,1);
});
