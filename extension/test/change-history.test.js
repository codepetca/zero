'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');const {createChangeHistory,marker}=require('../src/change-history');
const git=(root,...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();};
const key=value=>({scheme:value.startsWith('zero-change-history:')?'zero-change-history':'file',fsPath:value,toString:()=>value});
const view=p=>/view="([a-f0-9]+)"/.exec(p.webview.html)[1];
const attach=(p,f)=>{p.receive=msg=>f({...msg,view:msg.view??view(p)});};
test('review refuses ambiguous filter names before status while accepting stock attributes',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-filter-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
 const local=(...args)=>execFileSync('git',['-c',`core.hooksPath=${os.devNull}`,...args],{cwd:root,env,encoding:'utf8'}).trim();
 local('init','-q','-b','main');local('config','user.name','Test');local('config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'A.java'),'initial\n');await fs.writeFile(path.join(root,'.gitattributes'),'* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
 local('add','.');local('commit','-qm','initial');await fs.writeFile(path.join(root,'A.java'),'changed\n');
 let panel;const calls=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async()=>{}},commands:{executeCommand:async()=>{}}};
 const run=async(cwd,args)=>{calls.push(args);try{return execFileSync('git',['-c',`core.hooksPath=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd,env,encoding:'buffer'});}catch(error){error.code=error.status;throw error;}};
 const history=createChangeHistory(vscode,{project:async()=>root},{git:run});t.after(()=>history.dispose());
 local('config','filter.unused.clean','false');await history.openReview();assert.match(panel.webview.html,/A\.java/);
 for(const name of ['unset','unspecified']) {
  local('config',`filter.${name}.clean`,'false');await fs.writeFile(path.join(root,'.git','info','attributes'),`A.java filter=${name}\n`);calls.length=0;
  await assert.rejects(history.openReview(),/active Git filters/);assert.ok(!calls.some(args=>args.includes('status')));
  local('config','--unset',`filter.${name}.clean`);
 }
});
test('recognizes only the exact versioned finished change marker and matching tree',()=>{
 const m='Zero: finish feature-one\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature-one\n';
 assert.equal(marker(m,['a','b'],'tree','tree'),'feature-one');
 for(const bad of [m.replace('feature-one\n','wrong\n'),m+'extra',m.replaceAll('feature-one','feature..one'),m.replaceAll('feature-one','main')])assert.equal(marker(bad,['a','b'],'tree','tree'),null);
 assert.equal(marker(m,['a'],'tree','tree'),null);assert.equal(marker(m,['a','b'],'tree','other'),null);
});
test('read-only review suppresses fsmonitor and refuses active filters before status or comparison',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-read-only-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 const file=path.join(root,'A.java');await fs.writeFile(file,'initial\n');git(root,'add','.');git(root,'commit','-qm','initial');await fs.writeFile(file,'changed\n');
 const sentinel=path.join(root,'.git','external-command-ran'),script=path.join(root,'.git','external-command');
 const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
 await fs.writeFile(script,`#!/bin/sh\nprintf ran > ${quote(sentinel)}\ncat\n`,{mode:0o700});
 git(root,'config','core.fsmonitor',script);
 // An installed but unused driver should not make a normal student's review unavailable.
 git(root,'config','filter.zero-review-test.clean',quote(script));git(root,'config','filter.zero-review-test.process',quote(script));
 let panel;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async error=>errors.push(error)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 const index=await fs.readFile(path.join(root,'.git','index'));
 await history.openReview();assert.match(panel.webview.html,/A.java/);await panel.receive({type:'select',index:0});assert.equal(calls.length,1);
 await assert.rejects(fs.stat(sentinel),{code:'ENOENT'});assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);
 await fs.writeFile(path.join(root,'.gitattributes'),'A.java filter=zero-review-test\n');
 // A view opened earlier must recheck filters when its comparison is selected.
 await panel.receive({type:'select',index:0});assert.equal(calls.length,1);assert.match(errors.at(-1),/active Git filters.*Source Control/);
 await assert.rejects(history.openReview(),/active Git filters.*Source Control/);
 await assert.rejects(fs.stat(sentinel),{code:'ENOENT'});assert.equal(await fs.readFile(file,'utf8'),'changed\n');assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);
});
test('history and review display local commits and open read-only comparisons',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'A.java'),'one\n');git(root,'add','.');git(root,'commit','-qm','initial');
 await fs.writeFile(path.join(root,'A.java'),'two\n');git(root,'commit','-qam','second');
 const panels=[],calls=[],errors=[];let contentProvider;
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:(_,v)=>{contentProvider=v;return {dispose(){}};}},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panels.push(p);return p;},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 await history.openHistory();let panel=panels.at(-1);assert.match(panel.webview.html,/Commit: second/);await panel.receive({type:'select',index:0});assert.match(panel.webview.html,/A.java/);await panel.receive({type:'select',index:0});assert.equal(calls[0][0],'vscode.diff');assert.equal(contentProvider.provideTextDocumentContent(calls[0][1]),'one\n');assert.equal(contentProvider.provideTextDocumentContent(calls[0][2]),'two\n');
 await fs.writeFile(path.join(root,'A.java'),'three\n');await fs.writeFile(path.join(root,'new.txt'),'new');await history.openReview();panel=panels.at(-1);assert.match(panel.webview.html,/A.java/);assert.match(panel.webview.html,/new.txt/);await panel.receive({type:'select',index:0});assert.equal(calls.at(-1)[0],'vscode.diff');assert.equal(contentProvider.provideTextDocumentContent(calls.at(-1)[2]),'three\n');
 await panel.receive({type:'select',index:1});assert.equal(calls.at(-1)[0],'workbench.view.scm');
 await fs.writeFile(path.join(root,'A.java'),'two\n');await fs.unlink(path.join(root,'new.txt'));const doc={uri:key(path.join(root,'A.java')),isDirty:true,version:1,getText:()=> 'unsaved\n'};vscode.workspace.textDocuments=[doc];await history.openReview();panel=panels.at(-1);assert.match(panel.webview.html,/A.java · Unsaved/);await panel.receive({type:'select',index:0});assert.equal(contentProvider.provideTextDocumentContent(calls.at(-1)[2]),'unsaved\n');doc.version++;await panel.receive({type:'select',index:0});assert.match(errors.at(-1),/changed|moved/i);
 vscode.workspace.textDocuments=[];git(root,'checkout','-qb','feature');await fs.writeFile(path.join(root,'conflict.txt'),'feature\n');git(root,'add','conflict.txt');git(root,'commit','-qm','feature file');git(root,'checkout','-q','-');await fs.writeFile(path.join(root,'conflict.txt'),'main\n');git(root,'add','conflict.txt');git(root,'commit','-qm','main file');try{git(root,'merge','feature');assert.fail('Expected conflict');}catch(error){if(error.code!=='ERR_ASSERTION')assert.match(String(error.stderr||error.message),/conflict|merge/i);else throw error;}await history.openReview();panel=panels.at(-1);assert.match(panel.webview.html,/conflict.txt · Conflict/);const previousCalls=calls.length;await panel.receive({type:'select',index:0});assert.equal(calls.length,previousCalls+1);assert.equal(calls.at(-1)[0],'workbench.view.scm');
});

test('history includes local main and feature ancestry after divergence and in a fresh clone',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-graph-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'base.txt'),'base');git(root,'add','.');git(root,'commit','-qm','base');
 git(root,'checkout','-qb','working');await fs.writeFile(path.join(root,'work.txt'),'work');git(root,'add','.');git(root,'commit','-qm','working change');
 git(root,'checkout','-q','main');git(root,'checkout','-qb','finished');await fs.writeFile(path.join(root,'finished.txt'),'done');git(root,'add','.');git(root,'commit','-qm','finished work');
 git(root,'checkout','-q','main');git(root,'merge','--no-ff','-q','finished','-m','Zero: finish finished\n\nZero-Finished-Change: 1\nZero-Change-Branch: finished');
 const clone=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-clone-')));t.after(()=>fs.rm(clone,{recursive:true,force:true}));git(clone,'clone','-q',root,'.');
 for(const dir of [root,clone]){
  git(dir,'checkout','-q','working');let panel;
  const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(dir)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(){}},onDidDispose(){},dispose(){}},showErrorMessage:async()=>{}},commands:{executeCommand:async()=>{}}};
  const history=createChangeHistory(vscode,{project:async()=>dir});await history.openHistory();
  assert.match(panel.webview.html,/Merge: finished/);assert.match(panel.webview.html,/Commit: working change/);assert.match(panel.webview.html,/Commit: finished work/);history.dispose();
 }
});

test('review directs staged and mixed changes to Source Control even if worktree matches HEAD',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-staged-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 const file=path.join(root,'A.java');await fs.writeFile(file,'A\n');git(root,'add','.');git(root,'commit','-qm','initial');
 await fs.writeFile(file,'B\n');git(root,'add','A.java');await fs.writeFile(file,'A\n');
 let panel;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 await history.openReview();assert.match(panel.webview.html,/staged.*Source Control/i);await panel.receive({type:'select',index:0});assert.equal(calls.at(-1)[0],'workbench.view.scm');
 await fs.writeFile(file,'B\n');await history.openReview();await panel.receive({type:'select',index:0});assert.equal(calls.filter(call=>call[0]==='workbench.view.scm').length,2);
});

test('Undo uses only the selected finished merge and rejects stale history',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-undo-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'base.txt'),'base');git(root,'add','.');git(root,'commit','-qm','base');
 git(root,'checkout','-qb','feature');await fs.writeFile(path.join(root,'feature.txt'),'feature');git(root,'add','.');git(root,'commit','-qm','feature commit');git(root,'checkout','-q','main');
 git(root,'merge','--no-ff','-q','feature','-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');const merge=git(root,'rev-parse','HEAD');
 await fs.writeFile(path.join(root,'ordinary.txt'),'ordinary');git(root,'add','.');git(root,'commit','-qm','ordinary commit');
 let panel;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async()=>{}}};
 const history=createChangeHistory(vscode,{project:async()=>root,onUndo:async id=>calls.push(id)});t.after(()=>history.dispose());
 const indexOf=label=>{const match=new RegExp(`<button data-index="(\\d+)" id="item-\\d+">${label} <span>`).exec(panel.webview.html);assert.ok(match,`Missing ${label}`);return Number(match[1]);};
 await history.openHistory();assert.doesNotMatch(panel.webview.html,/<button id="undo">/);
 await panel.receive({type:'undo',id:merge});await panel.receive({type:'select',index:999,id:merge});await panel.receive({type:'undo',id:merge});assert.deepEqual(calls,[]);
 await panel.receive({type:'select',index:indexOf('Commit: ordinary commit')});assert.doesNotMatch(panel.webview.html,/<button id="undo">/);await panel.receive({type:'undo',id:merge});assert.deepEqual(calls,[]);
 await panel.receive({type:'back'});await panel.receive({type:'select',index:indexOf('Merge: feature')});assert.match(panel.webview.html,/Undo change is temporarily unavailable/);assert.doesNotMatch(panel.webview.html,/<button id="undo">/);
 await panel.receive({type:'undo',id:'forged',index:999});assert.deepEqual(calls,[merge]);
 git(root,'checkout','-qb','other');await panel.receive({type:'undo',id:merge});assert.deepEqual(calls,[merge]);assert.match(errors.at(-1),/changed/i);
 await history.openHistory();await panel.receive({type:'select',index:indexOf('Merge: feature')});
 await fs.writeFile(path.join(root,'later.txt'),'later');git(root,'add','.');git(root,'commit','-qm','later');await panel.receive({type:'undo'});assert.deepEqual(calls,[merge]);assert.match(errors.at(-1),/changed/i);
 const withoutUndo=createChangeHistory(vscode,{project:async()=>root});t.after(()=>withoutUndo.dispose());await withoutUndo.openHistory();await panel.receive({type:'select',index:indexOf('Merge: feature')});assert.doesNotMatch(panel.webview.html,/<button id="undo">/);await panel.receive({type:'undo',id:merge});assert.deepEqual(calls,[merge]);
});

test('Undo ignores a selection or panel changed while its context check is pending',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-race-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');await fs.writeFile(path.join(root,'base'),'base');git(root,'add','.');git(root,'commit','-qm','base');git(root,'checkout','-qb','feature');await fs.writeFile(path.join(root,'feature'),'feature');git(root,'add','.');git(root,'commit','-qm','feature');git(root,'checkout','-q','main');git(root,'merge','--no-ff','-q','feature','-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');
 let panel,block=false,release,entered;const calls=[];
 const run=async(dir,args)=>{if(block){block=false;entered();await new Promise(resolve=>{release=resolve;});}return require('node:util').promisify(require('node:child_process').execFile)('git',['--no-pager',...args],{cwd:dir,encoding:'buffer',env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'}}).then(result=>result.stdout);};
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panel=p;return p;},showErrorMessage:async e=>assert.fail(e)},commands:{executeCommand:async()=>{}}};
 const history=createChangeHistory(vscode,{project:async()=>root,onUndo:async id=>calls.push(id)},{git:run});t.after(()=>history.dispose());
 const selectMarker=async()=>{const match=/<button data-index="(\d+)" id="item-\d+">Merge: feature <span>/.exec(panel.webview.html);assert.ok(match);await panel.receive({type:'select',index:Number(match[1])});};
 const startUndo=async()=>{const waiting=new Promise(resolve=>{entered=resolve;});block=true;const pending=panel.receive({type:'undo'});await waiting;return {pending};};
 await history.openHistory();await selectMarker();let {pending}=await startUndo();await panel.receive({type:'back'});await selectMarker();release();await pending;assert.deepEqual(calls,[],'Back and reselect invalidates the pending action');
 ({pending}=await startUndo());await panel.receive({type:'back'});await panel.receive({type:'select',index:1});release();await pending;assert.deepEqual(calls,[],'Another selected commit cannot retarget the pending action');
 await panel.receive({type:'back'});await selectMarker();({pending}=await startUndo());await history.openHistory();release();await pending;assert.deepEqual(calls,[],'Replacing the panel invalidates the pending action');
 await selectMarker();({pending}=await startUndo());panel.dispose();release();await pending;assert.deepEqual(calls,[],'Disposing the panel invalidates the pending action');
});

test('recent history shows only the current branch first-parent commits and is bounded to three',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-recent-history-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'a'),'base');git(root,'add','.');git(root,'commit','-qm','base');git(root,'checkout','-qb','feature');
 for(let i=1;i<=3;i++){await fs.writeFile(path.join(root,'a'),String(i));git(root,'add','.');git(root,'commit','-qm',`feature ${i}`);}
 const expected=git(root,'rev-parse','HEAD');git(root,'checkout','-q','main');await fs.writeFile(path.join(root,'other'),'main');git(root,'add','.');git(root,'commit','-qm','main only');git(root,'checkout','-q','feature');
 const vscode={workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{},commands:{}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 const recent=await history.recent();assert.equal(recent.head,expected);assert.equal(recent.branch,'refs/heads/feature');assert.deepEqual(recent.entries.map(e=>e.label),['Commit: feature 3','Commit: feature 2','Commit: feature 1']);
});

test('Restore uses the selected server-side commit and rejects stale history',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-restore-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'a'),'first');git(root,'add','.');git(root,'commit','-qm','first');const first=git(root,'rev-parse','HEAD');
 await fs.writeFile(path.join(root,'a'),'second');git(root,'commit','-qam','second');const second=git(root,'rev-parse','HEAD');
 let panel;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panel=p;return p;},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async()=>{}}};
 const history=createChangeHistory(vscode,{project:async()=>root,onRestore:async id=>calls.push(id)});t.after(()=>history.dispose());
 await history.openHistory();assert.doesNotMatch(panel.webview.html,/<button id="restore">/);
 await panel.receive({type:'restore',id:first});assert.deepEqual(calls,[]);
 await panel.receive({type:'select',index:1});assert.match(panel.webview.html,/Restoring a version is temporarily unavailable/);assert.doesNotMatch(panel.webview.html,/<button id="restore">/);
 await panel.receive({type:'restore',id:second,index:0});assert.deepEqual(calls,[first]);
 await panel.receive({type:'back'});await panel.receive({type:'select',index:0});await panel.receive({type:'restore',id:first});assert.deepEqual(calls,[first,second]);
 git(root,'checkout','-qb','other');await panel.receive({type:'restore'});assert.deepEqual(calls,[first,second]);assert.match(errors.at(-1),/changed/i);
 const withoutRestore=createChangeHistory(vscode,{project:async()=>root});t.after(()=>withoutRestore.dispose());await withoutRestore.openHistory();await panel.receive({type:'select',index:0});assert.doesNotMatch(panel.webview.html,/<button id="restore">/);await panel.receive({type:'restore',id:first});assert.deepEqual(calls,[first,second]);
});

test('Restore ignores a changed selection or panel during its context check',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-restore-race-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'a'),'first');git(root,'add','.');git(root,'commit','-qm','first');await fs.writeFile(path.join(root,'a'),'second');git(root,'commit','-qam','second');
 let panel,block=false,release,entered;const calls=[];
 const run=async(dir,args)=>{if(block){block=false;entered();await new Promise(resolve=>{release=resolve;});}return require('node:util').promisify(require('node:child_process').execFile)('git',['--no-pager',...args],{cwd:dir,encoding:'buffer',env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'}}).then(result=>result.stdout);};
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panel=p;return p;},showErrorMessage:async e=>assert.fail(e)},commands:{executeCommand:async()=>{}}};
 const history=createChangeHistory(vscode,{project:async()=>root,onRestore:async id=>calls.push(id)},{git:run});t.after(()=>history.dispose());
 await history.openHistory();await panel.receive({type:'select',index:0});let waiting=new Promise(resolve=>{entered=resolve;});block=true;let pending=panel.receive({type:'restore'});await waiting;await panel.receive({type:'back'});await panel.receive({type:'select',index:0});release();await pending;assert.deepEqual(calls,[]);
 waiting=new Promise(resolve=>{entered=resolve;});block=true;pending=panel.receive({type:'restore'});await waiting;await panel.receive({type:'back'});await panel.receive({type:'select',index:1});release();await pending;assert.deepEqual(calls,[]);
 waiting=new Promise(resolve=>{entered=resolve;});block=true;pending=panel.receive({type:'restore'});await waiting;await history.openHistory();release();await pending;assert.deepEqual(calls,[]);
 await panel.receive({type:'select',index:0});waiting=new Promise(resolve=>{entered=resolve;});block=true;pending=panel.receive({type:'restore'});await waiting;panel.dispose();release();await pending;assert.deepEqual(calls,[]);
});

test('history pages expose older real commits and keep selection and focus bound to the visible page',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-pages-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'a'),'same');git(root,'add','.');
 for(let i=0;i<65;i++)git(root,'commit','-q','--allow-empty','-m','same message');
 const ids=git(root,'rev-list','HEAD').split('\n');let panel;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panel=p;return p;},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async()=>{}}};
 const history=createChangeHistory(vscode,{project:async()=>root,onRestore:async id=>calls.push(id)});t.after(()=>history.dispose());
 const focus=()=>{const script=/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(panel.webview.html)[1];let target;require('node:vm').runInNewContext(script,{acquireVsCodeApi:()=>({postMessage(){}}),document:{addEventListener(){},getElementById:id=>({focus(){target=id;}})}});return target;};
 await history.openHistory();const firstPage=view(panel);assert.match(panel.webview.html,/Change history · commits 1–60/);assert.match(panel.webview.html,new RegExp(ids[0].slice(0,12)));assert.doesNotMatch(panel.webview.html,new RegExp(ids[60].slice(0,12)));assert.match(panel.webview.html,/id="next"/);
 await panel.receive({type:'next'});assert.equal(focus(),'heading');assert.match(panel.webview.html,/Change history · commits 61–65/);await panel.receive({type:'select',index:0,view:firstPage});assert.doesNotMatch(panel.webview.html,/id="selected-commit"/);assert.match(panel.webview.html,new RegExp(ids[60].slice(0,12)));assert.match(panel.webview.html,/id="previous"/);assert.doesNotMatch(panel.webview.html,/id="next"/);
 await panel.receive({type:'select',index:0,id:ids[0]});assert.equal(focus(),'selected-commit');assert.match(panel.webview.html,new RegExp(ids[60]));const oldSelection=view(panel);await panel.receive({type:'restore',id:ids[0]});assert.deepEqual(calls,[ids[60]]);
 await panel.receive({type:'back'});assert.equal(focus(),'item-0');await panel.receive({type:'previous'});assert.equal(focus(),'heading');assert.match(panel.webview.html,new RegExp(ids[0].slice(0,12)));await panel.receive({type:'select',index:0});await panel.receive({type:'restore',view:oldSelection});assert.deepEqual(calls,[ids[60]]);await panel.receive({type:'back'});
 await fs.writeFile(path.join(root,'.git','info','grafts'),`${ids[0]}\n`);await panel.receive({type:'next'});assert.match(errors.at(-1),/ungrafted/i);await fs.unlink(path.join(root,'.git','info','grafts'));
 await fs.writeFile(path.join(root,'.git','shallow'),`${ids[0]}\n`);await panel.receive({type:'next'});assert.match(errors.at(-1),/ungrafted/i);await fs.unlink(path.join(root,'.git','shallow'));
 await fs.writeFile(path.join(root,'a'),'changed');git(root,'commit','-qam','later');await panel.receive({type:'next'});assert.match(errors.at(-1),/changed/i);assert.match(panel.webview.html,new RegExp(ids[0].slice(0,12)));
});

test('pending comparisons cannot open or allocate snapshots after Back or panel disposal',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-diff-race-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');await fs.writeFile(path.join(root,'a'),'one');git(root,'add','.');git(root,'commit','-qm','one');await fs.writeFile(path.join(root,'a'),'two');git(root,'commit','-qam','two');
 let panel,block=false,entered,release;const calls=[],uris=[];
 const run=async(dir,args)=>{if(block&&args[0]==='cat-file'&&args[1]==='blob'){block=false;entered();await new Promise(resolve=>{release=resolve;});}return require('node:util').promisify(require('node:child_process').execFile)('git',['--no-pager',...args],{cwd:dir,encoding:'buffer',env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'}}).then(result=>result.stdout);};
 const vscode={ViewColumn:{One:1},Uri:{parse:value=>{uris.push(value);return key(value);},file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panel=p;return p;},showErrorMessage:async e=>assert.fail(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root},{git:run});t.after(()=>history.dispose());
 const start=async()=>{let waiting=new Promise(resolve=>{entered=resolve;});block=true;const pending=panel.receive({type:'select',index:0});await waiting;return {pending};};
 await history.openHistory();await panel.receive({type:'select',index:0});let {pending}=await start();await panel.receive({type:'back'});release();await pending;assert.deepEqual(calls,[]);assert.deepEqual(uris,[]);
 await fs.writeFile(path.join(root,'a'),'three');await history.openReview();({pending}=await start());panel.dispose();release();await pending;assert.deepEqual(calls,[]);assert.deepEqual(uris,[]);
});

test('a later comparison supersedes an earlier delayed result or error in history and review',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-supersede-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 for(const name of ['a','b'])await fs.writeFile(path.join(root,name),'one');git(root,'add','.');git(root,'commit','-qm','one');
 for(const name of ['a','b'])await fs.writeFile(path.join(root,name),'two');git(root,'commit','-qam','two');
 let panel,block=false,failOld=false,entered,release;const calls=[],errors=[];
 const run=async(dir,args)=>{if(block&&args[0]==='cat-file'&&args[1]==='blob'){block=false;entered();await new Promise(resolve=>{release=resolve;});if(failOld)throw Error('superseded error');}return require('node:util').promisify(require('node:child_process').execFile)('git',['--no-pager',...args],{cwd:dir,encoding:'buffer',env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'}}).then(result=>result.stdout);};
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){attach(p,f);}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panel=p;return p;},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root},{git:run});t.after(()=>history.dispose());
 for(const mode of ['history','review'])for(const fails of [false,true]){
  calls.length=0;errors.length=0;failOld=fails;
  if(mode==='history'){await history.openHistory();await panel.receive({type:'select',index:0});}else{for(const name of ['a','b'])await fs.writeFile(path.join(root,name),'three');await history.openReview();}
  const waiting=new Promise(resolve=>{entered=resolve;});block=true;const earlier=panel.receive({type:'select',index:0});await waiting;
  await panel.receive({type:'select',index:1});release();await earlier;
  assert.equal(calls.length,1,`${mode}: only the newer comparison opens`);assert.match(calls[0][3],/^b ·/);assert.deepEqual(errors,[]);
 }
});

test('linked worktree history and review use its private HEAD and reject metadata drift',async t=>{
 const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-linked-')));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const main=path.join(parent,'main'),root=path.join(parent,'linked');await fs.mkdir(main);
 git(main,'init','-q','-b','main');git(main,'config','user.name','Test');git(main,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(main,'A.java'),'one\n');git(main,'add','.');git(main,'commit','-qm','first');
 await fs.writeFile(path.join(main,'A.java'),'two\n');git(main,'commit','-qam','second');git(main,'worktree','add','-qb','linked',root);
 let panel,provider;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:(_,v)=>{provider=v;return {dispose(){}};}},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 const recent=await history.recent();assert.equal(recent.branch,'refs/heads/linked');assert.deepEqual(recent.entries.map(e=>e.label),['Commit: second','Commit: first']);
 await history.openHistory();assert.match(panel.webview.html,/Commit: second/);await panel.receive({type:'select',index:0});await panel.receive({type:'select',index:0});
 assert.equal(provider.provideTextDocumentContent(calls[0][1]),'one\n');assert.equal(provider.provideTextDocumentContent(calls[0][2]),'two\n');
 await fs.writeFile(path.join(root,'A.java'),'three\n');await history.openReview();assert.match(panel.webview.html,/A.java/);await panel.receive({type:'select',index:0});assert.equal(provider.provideTextDocumentContent(calls.at(-1)[2]),'three\n');
 const marker=path.join(root,'.git'),original=await fs.readFile(marker);await fs.writeFile(marker,Buffer.concat([original,Buffer.from('\n')]));
 const count=calls.length;await panel.receive({type:'select',index:0});assert.equal(calls.length,count);assert.match(errors.at(-1),/metadata|changed|verified/i);await fs.writeFile(marker,original);
 const common=path.join(main,'.git');await fs.writeFile(path.join(common,'info','grafts'),'x\n');await assert.rejects(history.openHistory(),/ungrafted/);await fs.unlink(path.join(common,'info','grafts'));
 await fs.writeFile(path.join(common,'shallow'),'x\n');await assert.rejects(history.openHistory(),/ungrafted/);await fs.unlink(path.join(common,'shallow'));
});

test('review compares bounded immutable snapshots and rejects stale or oversized buffers',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-review-snapshot-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');const file=path.join(root,'a');
 await fs.writeFile(file,'old');git(root,'add','.');git(root,'commit','-qm','old');await fs.writeFile(file,'changed');
 let panel,provider;const calls=[],errors=[];const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:(_,v)=>{provider=v;return {dispose(){}};}},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());await history.openReview();await panel.receive({type:'select',index:0});const snapshot=calls[0][2];await fs.writeFile(file,'later');assert.equal(provider.provideTextDocumentContent(snapshot),'changed');
 await fs.writeFile(file,Buffer.alloc(512*1024+1,65));await history.openReview();await panel.receive({type:'select',index:0});assert.equal(calls.length,1);assert.match(errors.at(-1),/cannot be compared/);
 await fs.writeFile(file,'disk');const doc={uri:key(file),isDirty:true,version:1,getText:()=> 'unsaved'};vscode.workspace.textDocuments=[doc];await history.openReview();await panel.receive({type:'select',index:0});assert.equal(provider.provideTextDocumentContent(calls.at(-1)[2]),'unsaved');doc.isClosed=true;await panel.receive({type:'select',index:0});assert.match(errors.at(-1),/changed/);
 doc.isClosed=false;doc.version=2;doc.getText=()=> 'x'.repeat(512*1024+1);await history.openReview();const count=calls.length;await panel.receive({type:'select',index:0});assert.equal(calls.length,count);assert.match(errors.at(-1),/cannot be compared/);
});

test('review matches dirty editor aliases and rejects ambiguity or changed editor mappings',async t=>{
 const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-alias-'))),root=path.join(parent,'project'),alias=path.join(parent,'alias');
 t.after(()=>fs.rm(parent,{recursive:true,force:true}));await fs.mkdir(root);await fs.symlink(root,alias);
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_/i.test(k))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file'};
 const run=async(cwd,args)=>{try{return execFileSync('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd,env,encoding:'buffer'});}catch(error){error.code=error.status;throw error;}};
 const local=async(...args)=>run(root,args);
 await local('init','-q','-b','main');await local('config','user.name','Test');await local('config','user.email','test@example.invalid');
 const file=path.join(root,'A.java'),external=path.join(parent,'external.txt');await fs.writeFile(file,'saved\n');await fs.writeFile(external,'outside');await fs.symlink(external,path.join(root,'External.java'));
 await local('add','.');await local('commit','-qm','initial');
 let panel,provider;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],textDocuments:[],registerTextDocumentContentProvider:(_,value)=>{provider=value;return {dispose(){}};}},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async message=>errors.push(message)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root},{git:run});t.after(()=>history.dispose());
 const doc={uri:key(path.join(alias,'A.java')),isDirty:true,version:1,getText:()=> 'unsaved\n'};vscode.workspace.textDocuments=[doc];
 await history.openReview();assert.match(panel.webview.html,/A.java · Unsaved/);await panel.receive({type:'select',index:0});assert.equal(provider.provideTextDocumentContent(calls.at(-1)[2]),'unsaved\n');
 await fs.writeFile(file,'disk changed\n');await history.openReview();assert.match(panel.webview.html,/A.java · Changed · unsaved/);await panel.receive({type:'select',index:0});assert.equal(provider.provideTextDocumentContent(calls.at(-1)[2]),'unsaved\n');
 doc.version++;await panel.receive({type:'select',index:0});assert.match(errors.at(-1),/changed|moved/i);
 await history.openReview();doc.uri=key(external);const count=calls.length;await panel.receive({type:'select',index:0});assert.equal(calls.length,count);assert.match(errors.at(-1),/moved|changed/i);
 doc.uri=key(path.join(alias,'A.java'));const other={uri:key(file),isDirty:true,version:1,getText:()=> 'other\n'};vscode.workspace.textDocuments=[doc,other];await assert.rejects(history.openReview(),/Multiple unsaved editors.*Source Control/);
 vscode.workspace.textDocuments=[{uri:key(external),isDirty:true,version:1,getText:()=> 'unrelated'}];await history.openReview();assert.doesNotMatch(panel.webview.html,/unsaved/i);
 vscode.workspace.textDocuments=[{uri:key(path.join(root,'External.java')),isDirty:true,version:1,getText:()=> 'outside edit'}];await history.openReview();assert.match(panel.webview.html,/External.java · Unsaved/);await panel.receive({type:'select',index:1});assert.match(errors.at(-1),/Symbolic links|cannot be compared|Source Control/);
});

test('review and selected history paginate changed files with bound selection and stale checks',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-file-pages-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_/i.test(k))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file'};
 let blockStatus,blockHistory,fakeHistory;const run=async(cwd,args)=>{if(blockStatus&&args[0]==='status')await blockStatus();if(blockHistory&&args[0]==='rev-list')await blockHistory();if(fakeHistory&&args[0]==='rev-list')return Buffer.from((fakeHistory+'\n').repeat(61));try{return execFileSync('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd,env,encoding:'buffer'});}catch(error){error.code=error.status;throw error;}};
 const local=async(...args)=>run(root,args);await local('init','-q','-b','main');await local('config','user.name','Test');await local('config','user.email','test@example.invalid');
 const names=Array.from({length:201},(_,i)=>`F${String(i).padStart(3,'0')}.txt`);
 for(const name of names)await fs.writeFile(path.join(root,name),'initial\n');await local('add','.');await local('commit','-qm','initial');
 for(const name of names)await fs.writeFile(path.join(root,name),'committed\n');await local('add','.');await local('commit','-qm','many files');
 let panel,provider;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],textDocuments:[],registerTextDocumentContentProvider:(_,value)=>{provider=value;return {dispose(){}};}},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async message=>errors.push(message)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root},{git:run});t.after(()=>history.dispose());
 const focus=()=>{let target;const script=/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(panel.webview.html)[1];require('node:vm').runInNewContext(script,{acquireVsCodeApi:()=>({postMessage(){}}),document:{addEventListener(){},getElementById:id=>({focus(){target=id;}})}});return target;};
 await history.openHistory();await panel.receive({type:'select',index:0});assert.match(panel.webview.html,/Files 1–200 of 201/);const oldHistory=view(panel);
 await panel.receive({type:'select',index:200});assert.equal(calls.length,0,'Hidden history items cannot be selected');
 await panel.receive({type:'next-files'});assert.equal(focus(),'item-200');assert.match(panel.webview.html,/Files 201–201 of 201/);assert.match(panel.webview.html,/F200.txt/);assert.doesNotMatch(panel.webview.html,/id="next-files"/);
 await panel.receive({type:'select',index:0,view:oldHistory});assert.equal(calls.length,0);await panel.receive({type:'select',index:200});assert.equal(provider.provideTextDocumentContent(calls.at(-1)[1]),'initial\n');assert.equal(provider.provideTextDocumentContent(calls.at(-1)[2]),'committed\n');
 await panel.receive({type:'previous-files'});assert.equal(focus(),'item-0');await panel.receive({type:'back'});assert.equal(focus(),'item-0');
 for(const name of names)await fs.writeFile(path.join(root,name),'working\n');await fs.writeFile(path.join(root,'Z-new.txt'),'new');
 await history.openReview();assert.match(panel.webview.html,/Files 1–200 of 202/);const first=view(panel);await panel.receive({type:'select',index:200});assert.equal(calls.length,1);
 await panel.receive({type:'next-files'});assert.equal(focus(),'item-200');assert.match(panel.webview.html,/Files 201–202 of 202/);
 await panel.receive({type:'select',index:200,view:first});assert.equal(calls.length,1);await panel.receive({type:'select',index:200});assert.equal(provider.provideTextDocumentContent(calls.at(-1)[2]),'working\n');
 await panel.receive({type:'select',index:201});assert.deepEqual(calls.at(-1),['workbench.view.scm']);assert.deepEqual(errors,[]);
 await panel.receive({type:'previous-files'});assert.equal(focus(),'item-0');await fs.writeFile(path.join(root,names[0]),'committed\n');await panel.receive({type:'next-files'});assert.match(errors.at(-1),/moved/i);assert.match(panel.webview.html,/Files 1–200 of 202/);
 await history.openReview();let rejectPending,started;const pendingStarted=new Promise(resolve=>{started=resolve;});
 blockStatus=()=>new Promise((_,reject)=>{rejectPending=reject;started();});const previousErrors=errors.length;
 const paging=panel.receive({type:'next-files'});await pendingStarted;await history.openHistory();rejectPending(Error('delayed obsolete failure'));await paging;
 assert.equal(errors.length,previousErrors,'A replaced panel must not show a delayed paging error');blockStatus=undefined;
 fakeHistory=(await local('rev-parse','HEAD')).toString().trim();await history.openHistory();assert.match(panel.webview.html,/id="next"/);
 let rejectHistory,historyStarted;const historyWaiting=new Promise(resolve=>{historyStarted=resolve;});
 blockHistory=()=>new Promise((_,reject)=>{rejectHistory=reject;historyStarted();});const beforeHistoryErrors=errors.length;
 const historyPaging=panel.receive({type:'next'});await historyWaiting;await history.openReview();rejectHistory(Error('obsolete history failure'));await historyPaging;
 assert.equal(errors.length,beforeHistoryErrors,'A replaced panel must not show a delayed history-page error');blockHistory=undefined;

});

test('history offers finished-change undo only when the merge is in the current branch',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-undo-eligibility-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_/i.test(k))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file'};
 let failure,merge;const run=async(cwd,args)=>{if(failure&&args[0]==='merge-base'&&args[1]==='--is-ancestor'&&args[2]===merge)throw Object.assign(Error('injected ancestry error'),{code:failure==='not-ancestor'?1:2});try{return execFileSync('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd,env,encoding:'buffer'});}catch(error){error.code=error.status;throw error;}};
 const git=async(...args)=>(await run(root,args)).toString().trim();await git('init','-q','-b','main');await git('config','user.name','Test');await git('config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'base.txt'),'base');await git('add','.');await git('commit','-qm','base');await git('checkout','-qb','working');await fs.writeFile(path.join(root,'work.txt'),'work');await git('add','.');await git('commit','-qm','working');
 await git('checkout','-q','main');await git('checkout','-qb','finished');await fs.writeFile(path.join(root,'feature.txt'),'feature');await git('add','.');await git('commit','-qm','feature');await git('checkout','-q','main');
 await git('merge','--no-ff','-q','finished','-m','Zero: finish finished\n\nZero-Finished-Change: 1\nZero-Change-Branch: finished');merge=await git('rev-parse','HEAD');await git('checkout','-q','working');
 let panel;const undo=[],restore=[],errors=[];const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async message=>errors.push(message)},commands:{executeCommand:async()=>{}}};
 const history=createChangeHistory(vscode,{project:async()=>root,onUndo:async id=>undo.push(id),onRestore:async id=>restore.push(id)},{git:run});t.after(()=>history.dispose());
 const select=async()=>{const match=/<button data-index="(\d+)" id="item-\d+">Merge: finished/.exec(panel.webview.html);assert.ok(match);await panel.receive({type:'select',index:Number(match[1])});};
 await history.openHistory();const oldView=view(panel);await select();assert.doesNotMatch(panel.webview.html,/id="undo"/);assert.match(panel.webview.html,/not in the current branch/);assert.match(panel.webview.html,/Restoring a version is temporarily unavailable/);
 await panel.receive({type:'undo'});await panel.receive({type:'undo',view:oldView});assert.deepEqual(undo,[]);await panel.receive({type:'restore'});assert.deepEqual(restore,[merge]);
 await git('checkout','-q','main');await history.openHistory();await select();assert.match(panel.webview.html,/Undo change is temporarily unavailable/);failure='not-ancestor';await panel.receive({type:'undo'});assert.deepEqual(undo,[]);assert.match(errors.at(-1),/no longer in the current branch/);
 failure=undefined;await panel.receive({type:'undo'});assert.deepEqual(undo,[merge]);
 await history.openHistory();failure='error';await select();assert.doesNotMatch(panel.webview.html,/id="undo"/);assert.match(panel.webview.html,/Undo availability could not be verified/);assert.match(panel.webview.html,/Restoring a version is temporarily unavailable/);await panel.receive({type:'undo'});assert.deepEqual(undo,[merge]);failure=undefined;
 await history.openHistory();await select();await git('checkout','-q','working');await panel.receive({type:'undo'});assert.deepEqual(undo,[merge]);assert.match(errors.at(-1),/changed/i);
});
test('review hands untracked and deleted files to native Source Control and rejects stale selections',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-review-native-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));git(root,'init','-q');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');await fs.writeFile(path.join(root,'Gone.java'),'saved\n');git(root,'add','Gone.java');git(root,'commit','-qm','initial');await fs.unlink(path.join(root,'Gone.java'));await fs.writeFile(path.join(root,'New.java'),'new\n');
 let panel;const calls=[],errors=[];const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){attach(panel,f);}},onDidDispose(){},dispose(){}},showErrorMessage:async error=>errors.push(error)},commands:{executeCommand:async(...args)=>calls.push(args)}};const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());await history.openReview();assert.match(panel.webview.html,/Gone.java/);assert.match(panel.webview.html,/New.java/);await panel.receive({type:'select',index:0});await panel.receive({type:'select',index:1});assert.deepEqual(calls.map(call=>call[0]),['workbench.view.scm','workbench.view.scm']);await fs.writeFile(path.join(root,'Gone.java'),'saved\n');await panel.receive({type:'select',index:0});assert.equal(calls.length,2);assert.match(errors.at(-1),/changes have moved/i);
});
