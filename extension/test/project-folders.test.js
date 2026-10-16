'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createProjectFolders} = require('../src/project-folders');
async function fixture(t, remembered = new Map()) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-project-folders-')));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const calls=[],dialogs=[],reports=[];let input='https://github.com/student/app',selection,api,result,active=true;
  const vscode={Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},extensions:{getExtension:()=>api?{isActive:true,exports:{getAPI:()=>api}}:undefined},window:{showInputBox:async options=>{assert.equal(options.validateInput('bad'),'Use https://github.com/owner/repository (optionally ending in .git).');return input;},showOpenDialog:async options=>{dialogs.push(options);return selection;}},commands:{executeCommand:async(...args)=>{calls.push(args);return result;}}};
  const folders=createProjectFolders(vscode,{home,globalState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)},report:text=>reports.push(text),active:()=>active});
  return {home,folders,calls,dialogs,reports,remembered,vscode,set input(value){input=value;},set selection(value){selection=value;},set api(value){api=value;},set active(value){active=value;}};
}
test('clone location starts at Zero Projects and selected alternative is passed to native Git',async t=>{
 const f=await fixture(t);const alternative=path.join(f.home,'Elsewhere');await fs.mkdir(alternative);f.selection=[{fsPath:alternative}];
 await f.folders.clone();assert.equal(f.dialogs[0].defaultUri.fsPath,path.join(f.home,'Zero Projects'));assert.equal(f.dialogs[0].canSelectFolders,true);assert.equal(f.dialogs[0].openLabel,'Clone here');
 assert.deepEqual(f.calls,[['git.clone','https://github.com/student/app.git',alternative]],'Older native host owns opening and undefined does not imply failure/success');
});
test('modern native clone opens its actual returned folder in a new window without another confirmation',async t=>{
 const f=await fixture(t);const parent={fsPath:path.join(f.home,'Zero Projects')},actual={fsPath:path.join(f.home,'existing-clone')};f.selection=[parent];
 f.api={clone:async(url,options)=>{assert.equal(url.value,'https://github.com/student/app.git');assert.deepEqual(options,{parentPath:parent,postCloneAction:'none'});return actual;}};
 await f.folders.clone();assert.deepEqual(f.calls,[['vscode.openFolder',actual,{forceNewWindow:true}]]);
});
test('cancelled URL/location/native clone never opens a folder or reports success',async t=>{
 const f=await fixture(t);f.input=undefined;await f.folders.clone();assert.equal(f.dialogs.length,0);await assert.rejects(fs.stat(path.join(f.home,'Zero Projects')),/ENOENT/);
 f.input='https://github.com/student/app';await f.folders.clone();assert.equal(f.calls.length,0);
 f.selection=[{fsPath:f.home}];f.api={clone:async()=>null};await f.folders.clone();assert.equal(f.calls.length,0);
});
test('bad URLs and clone failures preserve existing files',async t=>{
 const f=await fixture(t);f.input='file:///somewhere';await assert.rejects(f.folders.clone(),/https:\/\/github/);assert.equal(f.dialogs.length,0);
 f.input='https://github.com/student/app';
 f.selection=[{fsPath:f.home}];f.api={clone:async()=>{throw Error('Native transport failed');}};await assert.rejects(f.folders.clone(),/Native transport failed/);assert.equal(f.calls.length,0);
});
test('open local validates a Zero folder and opens it without cloning or moving source',async t=>{
 const f=await fixture(t);const project=path.join(f.home,'Existing');await fs.mkdir(project);await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'keep');f.selection=[{fsPath:project}];
 await f.folders.openLocal();assert.equal(f.dialogs[0].title,'Open local project');assert.deepEqual(f.calls,[['vscode.openFolder',{fsPath:project},{forceNewWindow:true}]]);assert.equal(await fs.readFile(path.join(project,'Main.java'),'utf8'),'keep');await assert.rejects(fs.stat(path.join(f.home,'Zero Projects')),/ENOENT/,'Open existing must not create a default folder');
 f.selection=[{fsPath:f.home}];await assert.rejects(f.folders.openLocal(),/zero.json/);assert.equal(f.calls.length,1);
});
test('cancellation and disposal stop opening local projects',async t=>{
 const f=await fixture(t);await f.folders.openLocal();assert.equal(f.calls.length,0);f.active=false;f.selection=[{fsPath:f.home}];await f.folders.openLocal();assert.equal(f.calls.length,0);
});

test('a blocked default still allows cloning elsewhere and opening an existing project',async t=>{
 const f=await fixture(t),blocked=path.join(f.home,'Zero Projects'),alternative=path.join(f.home,'Existing');await fs.writeFile(blocked,'keep');await fs.mkdir(alternative);await fs.writeFile(path.join(alternative,'zero.json'),'{}');f.selection=[{fsPath:alternative}];
 await f.folders.clone();assert.equal(f.dialogs[0].defaultUri.fsPath,f.home);assert.deepEqual(f.calls[0],['git.clone','https://github.com/student/app.git',alternative]);
 await f.folders.openLocal();assert.equal(f.dialogs[1].defaultUri.fsPath,f.home);assert.deepEqual(f.calls[1],['vscode.openFolder',{fsPath:alternative},{forceNewWindow:true}]);assert.equal(await fs.readFile(blocked,'utf8'),'keep');
});

test('clone remembers the chosen parent across instances, even when native clone is cancelled',async t=>{
 const remembered=new Map(),f=await fixture(t,remembered),alternative=path.join(f.home,'Chosen');await fs.mkdir(alternative);f.selection=[{fsPath:alternative}];
 f.api={clone:async()=>null};await f.folders.clone();assert.equal(remembered.get('zero.cloneParent'),alternative);
 const next=await fixture(t,remembered);await next.folders.clone();assert.equal(next.dialogs[0].defaultUri.fsPath,alternative);assert.equal(next.calls.length,0);
});
test('cancelled location and opening a local project do not replace the remembered clone parent',async t=>{
 const f=await fixture(t),alternative=path.join(f.home,'Chosen');await fs.mkdir(alternative);f.remembered.set('zero.cloneParent',alternative);
 await f.folders.clone();assert.equal(f.remembered.get('zero.cloneParent'),alternative);
 const project=path.join(f.home,'Existing');await fs.mkdir(project);await fs.writeFile(path.join(project,'zero.json'),'{}');f.selection=[{fsPath:project}];await f.folders.openLocal();assert.equal(f.remembered.get('zero.cloneParent'),alternative);
});
test('unavailable or invalid remembered parents fall back without recreating the saved folder',async t=>{
 const f=await fixture(t),missing=path.join(f.home,'Removed');f.remembered.set('zero.cloneParent',missing);await f.folders.clone();assert.equal(f.dialogs[0].defaultUri.fsPath,path.join(f.home,'Zero Projects'));await assert.rejects(fs.stat(missing),/ENOENT/);
 const file=path.join(f.home,'File');await fs.writeFile(file,'keep');
 for(const saved of [file,'relative',{},'']) {f.remembered.set('zero.cloneParent',saved);await f.folders.clone();assert.equal(f.dialogs.at(-1).defaultUri.fsPath,path.join(f.home,'Zero Projects'));}
});
test('failure to save the preference still permits native cloning',async t=>{
 const f=await fixture(t),folders=createProjectFolders(f.vscode,{home:f.home,globalState:{get:()=>undefined,update:async()=>{throw Error('Storage unavailable');}},report:text=>f.reports.push(text)});f.selection=[{fsPath:f.home}];await folders.clone();assert.equal(f.calls[0][0],'git.clone');assert.match(f.reports[0],/Could not remember/);
});
