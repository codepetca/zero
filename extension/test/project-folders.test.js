'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createProjectFolders} = require('../src/project-folders');
async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-project-folders-')));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const calls=[],dialogs=[];let input='https://github.com/student/app',selection,api,result,active=true;
  const vscode={Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},extensions:{getExtension:()=>api?{isActive:true,exports:{getAPI:()=>api}}:undefined},window:{showInputBox:async options=>{assert.equal(options.validateInput('bad'),'Use https://github.com/owner/repository (optionally ending in .git).');return input;},showOpenDialog:async options=>{dialogs.push(options);return selection;}},commands:{executeCommand:async(...args)=>{calls.push(args);return result;}}};
  const folders=createProjectFolders(vscode,{home,active:()=>active});
  return {home,folders,calls,dialogs,vscode,set input(value){input=value;},set selection(value){selection=value;},set api(value){api=value;},set active(value){active=value;}};
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
test('bad URLs, blocked default path and clone failures preserve existing files',async t=>{
 const f=await fixture(t);f.input='file:///somewhere';await assert.rejects(f.folders.clone(),/https:\/\/github/);assert.equal(f.dialogs.length,0);
 f.input='https://github.com/student/app';const blocked=path.join(f.home,'Zero Projects');await fs.writeFile(blocked,'keep');await assert.rejects(f.folders.clone(),/EEXIST/);assert.equal(await fs.readFile(blocked,'utf8'),'keep');await fs.unlink(blocked);
 f.selection=[{fsPath:f.home}];f.api={clone:async()=>{throw Error('Native transport failed');}};await assert.rejects(f.folders.clone(),/Native transport failed/);assert.equal(f.calls.length,0);
});
test('open local validates a Zero folder and opens it without cloning or moving source',async t=>{
 const f=await fixture(t);const project=path.join(f.home,'Existing');await fs.mkdir(project);await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'keep');f.selection=[{fsPath:project}];
 await f.folders.openLocal();assert.equal(f.dialogs[0].title,'Open local project');assert.deepEqual(f.calls,[['vscode.openFolder',{fsPath:project},{forceNewWindow:true}]]);assert.equal(await fs.readFile(path.join(project,'Main.java'),'utf8'),'keep');
 f.selection=[{fsPath:f.home}];await assert.rejects(f.folders.openLocal(),/zero.json/);assert.equal(f.calls.length,1);
});
test('cancellation and disposal stop opening local projects',async t=>{
 const f=await fixture(t);await f.folders.openLocal();assert.equal(f.calls.length,0);f.active=false;f.selection=[{fsPath:f.home}];await f.folders.openLocal();assert.equal(f.calls.length,0);
});
