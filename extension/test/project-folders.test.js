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
  const calls=[],dialogs=[],reports=[];let input='https://github.com/student/app',selection,cloneResult,cloneFailure,active=true;
  const vscode={Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},extensions:{getExtension:()=>{throw Error('Legacy native Git fallback must not be used');}},window:{showInputBox:async options=>{assert.equal(options.validateInput('bad'),'Use https://github.com/owner/repository (optionally ending in .git).');return input;},showOpenDialog:async options=>{dialogs.push(options);return selection;}},commands:{executeCommand:async(...args)=>{calls.push(args);return undefined;}}};
  const folders=createProjectFolders(vscode,{home,globalState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)},report:text=>reports.push(text),active:()=>active,cloneRepository:async({signal,...input})=>{assert.ok(signal instanceof AbortSignal);calls.push(['cloneRepository',input]);if(cloneFailure)throw cloneFailure;return cloneResult;}});
  return {home,folders,calls,dialogs,reports,remembered,vscode,set input(value){input=value;},set selection(value){selection=value;},set cloneResult(value){cloneResult=value;},set cloneFailure(value){cloneFailure=value;},set active(value){active=value;}};
}
test('clone location starts at Zero Projects and selected alternative is passed to authenticated cloning',async t=>{
 const f=await fixture(t);const alternative=path.join(f.home,'Elsewhere');await fs.mkdir(alternative);f.selection=[{fsPath:alternative}];
 await f.folders.clone();assert.equal(f.dialogs[0].defaultUri.fsPath,path.join(f.home,'Zero Projects'));assert.equal(f.dialogs[0].canSelectFolders,true);assert.equal(f.dialogs[0].openLabel,'Clone here');
 assert.deepEqual(f.calls,[['cloneRepository',{repositoryUrl:'https://github.com/student/app',parentPath:alternative}]],'No folder opens unless authenticated cloning returns a destination');
});
test('authenticated clone opens its actual returned folder in the current window',async t=>{
 const f=await fixture(t);const parent={fsPath:path.join(f.home,'Zero Projects')},actual=path.join(f.home,'existing-clone');f.selection=[parent];f.cloneResult=actual;
 await f.folders.clone();assert.deepEqual(f.calls,[['cloneRepository',{repositoryUrl:'https://github.com/student/app',parentPath:parent.fsPath}],['vscode.openFolder',{fsPath:actual},{forceReuseWindow:true}]]);
});
test('cancelled URL/location/authenticated clone never opens a folder or reports success',async t=>{
 const f=await fixture(t);f.input=undefined;await f.folders.clone();assert.equal(f.dialogs.length,0);await assert.rejects(fs.stat(path.join(f.home,'Zero Projects')),/ENOENT/);
 f.input='https://github.com/student/app';await f.folders.clone();assert.equal(f.calls.length,0);
 f.selection=[{fsPath:f.home}];f.cloneResult=null;await f.folders.clone();assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'cloneRepository');
});
test('bad URLs and clone failures preserve existing files',async t=>{
 const f=await fixture(t);f.input='file:///somewhere';await assert.rejects(f.folders.clone(),/https:\/\/github/);assert.equal(f.dialogs.length,0);
 f.input='https://github.com/student/app';
 f.selection=[{fsPath:f.home}];f.cloneFailure=Error('Authenticated transport failed');await assert.rejects(f.folders.clone(),/Authenticated transport failed/);assert.equal(f.calls.length,1);
});
test('open local validates a Zero folder and opens it without cloning or moving source',async t=>{
 const f=await fixture(t);const project=path.join(f.home,'Existing');await fs.mkdir(project);await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'keep');f.selection=[{fsPath:project}];
 await f.folders.openLocal();assert.equal(f.dialogs[0].title,'Open local project');assert.deepEqual(f.calls,[['vscode.openFolder',{fsPath:project},{forceReuseWindow:true}]]);assert.equal(await fs.readFile(path.join(project,'Main.java'),'utf8'),'keep');await assert.rejects(fs.stat(path.join(f.home,'Zero Projects')),/ENOENT/,'Open existing must not create a default folder');
 f.selection=[{fsPath:f.home}];await assert.rejects(f.folders.openLocal(),/zero.json/);assert.equal(f.calls.length,1);
});
test('cancellation and disposal stop opening local projects',async t=>{
 const f=await fixture(t);await f.folders.openLocal();assert.equal(f.calls.length,0);f.active=false;f.selection=[{fsPath:f.home}];await f.folders.openLocal();assert.equal(f.calls.length,0);
});

test('a blocked default still allows cloning elsewhere and opening an existing project',async t=>{
 const f=await fixture(t),blocked=path.join(f.home,'Zero Projects'),alternative=path.join(f.home,'Existing');await fs.writeFile(blocked,'keep');await fs.mkdir(alternative);await fs.writeFile(path.join(alternative,'zero.json'),'{}');f.selection=[{fsPath:alternative}];
 await f.folders.clone();assert.equal(f.dialogs[0].defaultUri.fsPath,f.home);assert.deepEqual(f.calls[0],['cloneRepository',{repositoryUrl:'https://github.com/student/app',parentPath:alternative}]);
 await f.folders.openLocal();assert.equal(f.dialogs[1].defaultUri.fsPath,f.home);assert.deepEqual(f.calls[1],['vscode.openFolder',{fsPath:alternative},{forceReuseWindow:true}]);assert.equal(await fs.readFile(blocked,'utf8'),'keep');
});

test('clone remembers the chosen parent across instances, even when authenticated clone is cancelled',async t=>{
 const remembered=new Map(),f=await fixture(t,remembered),alternative=path.join(f.home,'Chosen');await fs.mkdir(alternative);f.selection=[{fsPath:alternative}];
 f.cloneResult=null;await f.folders.clone();assert.equal(remembered.get('zero.cloneParent'),alternative);
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
test('failure to save the preference still permits authenticated cloning',async t=>{
 const f=await fixture(t),folders=createProjectFolders(f.vscode,{home:f.home,globalState:{get:()=>undefined,update:async()=>{throw Error('Storage unavailable');}},report:text=>f.reports.push(text),cloneRepository:async input=>f.calls.push(['cloneRepository',input])});f.selection=[{fsPath:f.home}];await folders.clone();assert.equal(f.calls[0][0],'cloneRepository');assert.match(f.reports[0],/Could not remember/);
});

test('explicit clone URL and chosen parent bypass prompts and never use native Git credentials',async t=>{
 const f=await fixture(t);const parent={fsPath:f.home};await f.folders.clone({repositoryUrl:'https://github.com/student/exact.git',parent});
 assert.equal(f.dialogs.length,0);assert.deepEqual(f.calls,[['cloneRepository',{repositoryUrl:'https://github.com/student/exact',parentPath:f.home}]]);
 const isolated=createProjectFolders(f.vscode,{home:f.home});await assert.rejects(isolated.clone({repositoryUrl:'https://github.com/student/exact',parent}),/Connect Zero to GitHub/);
 assert.equal(f.calls.length,1);
});
test('disposal while clone completes preserves result without opening a window',async t=>{
 const f=await fixture(t);let finish;const pending=new Promise(resolve=>{finish=resolve;});let enabled=true;
 const folders=createProjectFolders(f.vscode,{home:f.home,active:()=>enabled,cloneRepository:async()=>{enabled=false;return pending;}});
 const clone=folders.clone({repositoryUrl:'https://github.com/student/app',parent:{fsPath:f.home}});finish(path.join(f.home,'created'));await clone;assert.equal(f.calls.length,0);
});

test('native cancellable clone notification aborts the child and preserves partial work',async t=>{
 const {createGitHubAppClone}=require('../src/github-app/clone');
 const {promisify}=require('node:util'),{execFile}=require('node:child_process');
 for(const action of ['cancel','dispose']){
  const f=await fixture(t);let cancel,signal,entered;const ready=new Promise(resolve=>{entered=resolve;});const notifications=[];let listenerDisposed=false;
  f.vscode.ProgressLocation={Notification:15};f.vscode.window.withProgress=async(options,run)=>{notifications.push(options);return run({report(){}},{isCancellationRequested:false,onCancellationRequested(fn){cancel=fn;return {dispose(){listenerDisposed=true;}};}});};
  const ticket={session:{accountId:'1',accessToken:'TEST_SECRET'}};
  const clone=createGitHubAppClone({authentication:{assertCurrent:async()=>ticket.session,assertCurrentNow:()=>ticket.session},repositories:{access:async()=>({ticket,repository:{id:2,name:'partial',owner:{id:1},html_url:'https://github.com/student/partial',clone_url:'https://github.com/student/partial.git'},installation:{id:3}})},localRun:async(_,args)=>args[0]==='--version'?'git version 2.53.0':'',spawn:async(_,args,options)=>{
   signal=options.signal;await fs.writeFile(path.join(args.at(-1),'saved.txt'),'keep partial work');
   const child=promisify(execFile)(process.execPath,['-e','setInterval(()=>{},1000)'],options);entered();return child;
  }});
  const folders=createProjectFolders(f.vscode,{home:f.home,cloneRepository:clone});
  const pending=folders.clone({repositoryUrl:'https://github.com/student/partial',parent:{fsPath:f.home}});const rejected=assert.rejects(pending,error=>error.code==='cancelled'&&/folder was preserved/.test(error.message));
  await ready;if(action==='cancel')cancel();else folders.dispose();await rejected;
  assert.equal(signal.aborted,true);assert.equal(listenerDisposed,true);assert.deepEqual(notifications,[{location:15,title:'Clone from GitHub',cancellable:true}]);assert.equal(await fs.readFile(path.join(f.home,'partial','saved.txt'),'utf8'),'keep partial work');assert.equal(f.calls.length,0);
 }
});
test('outer cancellation shares one operation without a nested notification or clone side effects',async t=>{
 const f=await fixture(t);let notifications=0;f.vscode.window.withProgress=async()=>{notifications++;throw Error('Nested progress');};
 const controller=new AbortController();controller.abort();await assert.rejects(f.folders.clone({repositoryUrl:'https://github.com/student/app',parent:{fsPath:f.home},signal:controller.signal}),error=>error.code==='cancelled');assert.equal(notifications,0);assert.equal(f.calls.length,0);
});

test('recent selection opens its existing folder without dialogs or cloning and rechecks the account',async t=>{
 const f=await fixture(t),existing=path.join(f.home,'Recent');await fs.mkdir(existing);await fs.writeFile(path.join(existing,'zero.json'),'{}');
 let checks=0;await f.folders.openLocal({projectPath:existing,assertCurrent:async()=>{checks++;}});
 assert.equal(checks,2);assert.equal(f.dialogs.length,0);assert.deepEqual(f.calls,[['vscode.openFolder',{fsPath:existing},{forceReuseWindow:true}]]);
 f.calls.length=0;await assert.rejects(f.folders.openLocal({projectPath:existing,assertCurrent:async()=>{throw Error('Account changed');}}),/Account changed/);assert.equal(f.calls.length,0);
});
test('account drift in the location picker blocks cloning before authenticated transport runs',async t=>{
 const f=await fixture(t);f.selection=[{fsPath:f.home}];await assert.rejects(f.folders.clone({repositoryUrl:'https://github.com/student/app',assertCurrent:async()=>{throw Error('Account changed');}}),/Account changed/);assert.equal(f.calls.length,0);
});

test('clone completes durable recovery handoff before replacing the host and restores it on failed opening',async t=>{
 for(const outcome of ['opened','rejected','cancelled','account-changed','disposed']) {
  const f=await fixture(t),controller=new AbortController(),project=path.join(f.home,'created');
  let recovery={repositoryUrl:'https://github.com/student/app'},prepared=false,opens=0;
  const original=recovery;
  f.vscode.commands.executeCommand=async(command,uri,options)=>{
   opens++;assert.equal(command,'vscode.openFolder');assert.equal(uri.fsPath,project);
   assert.deepEqual(options,{forceReuseWindow:true});assert.equal(recovery,undefined,'Recovery must finish before the old host can exit');
   if(outcome==='rejected')throw Error('Window opening failed');
  };
  f.cloneResult=project;
  const operation=f.folders.clone({repositoryUrl:'https://github.com/student/app',parent:{fsPath:f.home},signal:controller.signal,
   assertCurrent:async()=>{if(prepared&&outcome==='account-changed')throw Error('Account changed');},
   beforeOpen:async()=>{recovery=undefined;prepared=true;if(outcome==='cancelled')controller.abort();if(outcome==='disposed')f.active=false;return async()=>{recovery=original;};}
  });
  if(['rejected','cancelled','account-changed'].includes(outcome))await assert.rejects(operation);
  else await operation;
  assert.equal(opens,['opened','rejected'].includes(outcome)?1:0);
  assert.equal(recovery,outcome==='opened'?undefined:original);
 }
});
