'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {appSessions}=require('./fixtures/app-sessions');
const {loadBundle}=require('../src/lesson-projects');
const format=require('../src/project-builder-format');
const {readSavedBuilder}=require('../src/project-builder');
const disposable=()=>({dispose(){}}),extensionPath=path.resolve(__dirname,'..');

async function fixture(t,{current=false,onPrompt=async()=> 'Update'}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-required-update-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const file of (await loadBundle(extensionPath))[0].files){const dest=path.join(root,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.content);}
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 const builder=path.join(root,'.zero-build');
 if(!current){await fs.appendFile(path.join(builder,'README.md'),'\nOlder fixture.\n');const manifest=JSON.parse(await fs.readFile(path.join(builder,'builder.json')));const files=await Promise.all(manifest.files.map(async f=>({path:f.path,bytes:await fs.readFile(path.join(builder,...f.path.split('/')))})));await fs.writeFile(path.join(builder,'builder.json'),JSON.stringify(format.createBuilderManifest(files),null,2)+'\n');}
 const old=await readSavedBuilder(root),commands=new Map(),errors=[],prompts=[],logs=[];let attempts=0,completed=0;
 const vscode={authentication:{getSession:async()=>null,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},window:{createOutputChannel:()=>({appendLine:v=>logs.push(v),show(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showErrorMessage:async v=>errors.push(v),showWarningMessage:async(...args)=>{prompts.push(args);return onPrompt(vscode);}},tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})}};
 const originalLoad=Module._load,filename=require.resolve('../src/extension'),oldCache=require.cache[filename];delete require.cache[filename];
 Module._load=function(id,...args){if(id==='vscode')return vscode;const value=originalLoad.call(this,id,...args);if(id==='./project-builder')return {...value,createProjectBuilder:()=>({ensureValidatedExport:async()=>{attempts++;if(!current&&(await readSavedBuilder(root)).profileHash===old.profileHash)throw Object.assign(Error('Update required'),{code:'ZERO_BUILDER_UPDATE_REQUIRED'});completed++;return {sitePath:path.join(root,'site'),buildId:'test'};},validateExport:async()=>{},validateRetainedExport:async()=>{},assertBuildInputsAtCommit:async()=>{}})};return value;};
 let extension;try{extension=require(filename);}finally{Module._load=originalLoad;}
 const subscriptions=[];t.after(()=>{for(const item of subscriptions)item.dispose();delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
 const provider=appSessions(vscode,{dispose(){},async removeSession(){}});
 extension.activate({subscriptions,extensionPath,workspaceState:{get:()=>true,update:async()=>{}}},{provider});
 return {root,old,vscode,commands,errors,prompts,logs,get attempts(){return attempts;},get completed(){return completed;}};
}

test('accepting required update preserves the original and retries the build',async t=>{
 const h=await fixture(t);await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.match(h.prompts[0][0],/Update browser tooling to continue/);assert.match(h.prompts[0][1].detail,/permanently break an existing project/);assert.match(h.prompts[0][1].detail,/Before updating, commit and push/);assert.equal(h.attempts,2);assert.equal(h.completed,1);assert.deepEqual(h.errors,[]);
 const backup=(await fs.readdir(h.root)).find(name=>name.startsWith('.zero-build-backup-'));assert.ok(backup);assert.equal((await readSavedBuilder(path.join(h.root,backup))).profileHash,h.old.profileHash);assert.notEqual((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);
});
test('declining required update preserves the builder and does not retry',async t=>{
 const h=await fixture(t,{onPrompt:async()=>undefined});await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.equal(h.attempts,1);assert.equal(h.completed,0);assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-build-backup-')));assert.match(h.errors.at(-1),/cancelled/i);
});
test('revoked trust or changed project after consent prevents replacement',async t=>{
 for(const mode of ['trust','project'])await t.test(mode,async t=>{const h=await fixture(t,{onPrompt:async vscode=>{if(mode==='trust')vscode.workspace.isTrusted=false;else vscode.workspace.workspaceFolders=[];return 'Update';}});await h.commands.get('zero.exportWeb')();assert.equal(h.prompts.length,1);assert.equal(h.attempts,1);assert.equal(h.completed,0);assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);assert.ok(!(await fs.readdir(h.root)).some(name=>name.startsWith('.zero-build-backup-')));assert.ok(h.errors.length);});
});
test('current tooling builds without a prompt',async t=>{
 const h=await fixture(t,{current:true});await h.commands.get('zero.exportWeb')();assert.equal(h.attempts,1);assert.equal(h.completed,1);assert.equal(h.prompts.length,0);assert.deepEqual(h.errors,[]);
});
test('trust revoked during the asynchronous project lookup prevents replacement',async t=>{
 const core=require('../src/core'),original=core.resolveProject;
 t.after(()=>{core.resolveProject=original;});
 const h=await fixture(t,{onPrompt:async vscode=>{core.resolveProject=async (...args)=>{const result=await original(...args);vscode.workspace.isTrusted=false;return result;};return 'Update';}});
 await h.commands.get('zero.exportWeb')();
 assert.equal(h.prompts.length,1);assert.equal(h.attempts,1);assert.equal(h.completed,0);
 assert.equal((await readSavedBuilder(h.root)).profileHash,h.old.profileHash);assert.ok(h.errors.length);
});
