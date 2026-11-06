'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');const {createChangeHistory,marker}=require('../src/change-history');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const key=value=>({scheme:value.startsWith('zero-change-history:')?'zero-change-history':'file',fsPath:value,toString:()=>value});
test('recognizes only the exact versioned finished change marker and matching tree',()=>{
 const m='Zero: finish feature-one\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature-one\n';
 assert.equal(marker(m,['a','b'],'tree','tree'),'feature-one');
 for(const bad of [m.replace('feature-one\n','wrong\n'),m+'extra',m.replaceAll('feature-one','feature.one'),m.replaceAll('feature-one','main')])assert.equal(marker(bad,['a','b'],'tree','tree'),null);
 assert.equal(marker(m,['a'],'tree','tree'),null);assert.equal(marker(m,['a','b'],'tree','other'),null);
});
test('history and review display local commits and open read-only comparisons',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'A.java'),'one\n');git(root,'add','.');git(root,'commit','-qm','initial');
 await fs.writeFile(path.join(root,'A.java'),'two\n');git(root,'commit','-qam','second');
 const panels=[],calls=[],errors=[];let contentProvider;
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:(_,v)=>{contentProvider=v;return {dispose(){}};}},window:{createWebviewPanel:()=>{const p={webview:{onDidReceiveMessage(f){p.receive=f;}},onDidDispose(f){p.closed=f;},dispose(){p.closed?.();}};panels.push(p);return p;},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 await history.openHistory();let panel=panels.at(-1);assert.match(panel.webview.html,/Commit: second/);await panel.receive({type:'select',index:0});assert.match(panel.webview.html,/A.java/);await panel.receive({type:'select',index:0});assert.equal(calls[0][0],'vscode.diff');assert.equal(contentProvider.provideTextDocumentContent(calls[0][1]),'one\n');assert.equal(contentProvider.provideTextDocumentContent(calls[0][2]),'two\n');
 await fs.writeFile(path.join(root,'A.java'),'three\n');await fs.writeFile(path.join(root,'new.txt'),'new');await history.openReview();panel=panels.at(-1);assert.match(panel.webview.html,/A.java/);assert.match(panel.webview.html,/new.txt/);await panel.receive({type:'select',index:0});assert.equal(calls.at(-1)[0],'vscode.diff');assert.equal(calls.at(-1)[2].fsPath,path.join(root,'A.java'));
 await panel.receive({type:'select',index:1});assert.match(errors.at(-1),/Source Control/);
 await fs.writeFile(path.join(root,'A.java'),'two\n');await fs.unlink(path.join(root,'new.txt'));const doc={uri:key(path.join(root,'A.java')),isDirty:true,version:1};vscode.workspace.textDocuments=[doc];await history.openReview();panel=panels.at(-1);assert.match(panel.webview.html,/A.java · Unsaved/);await panel.receive({type:'select',index:0});assert.equal(calls.at(-1)[2].fsPath,path.join(root,'A.java'));doc.version++;await panel.receive({type:'select',index:0});assert.match(errors.at(-1),/changed|moved/i);
 vscode.workspace.textDocuments=[];git(root,'checkout','-qb','feature');await fs.writeFile(path.join(root,'conflict.txt'),'feature\n');git(root,'add','conflict.txt');git(root,'commit','-qm','feature file');git(root,'checkout','-q','-');await fs.writeFile(path.join(root,'conflict.txt'),'main\n');git(root,'add','conflict.txt');git(root,'commit','-qm','main file');try{git(root,'merge','feature');assert.fail('Expected conflict');}catch(error){if(error.code!=='ERR_ASSERTION')assert.match(String(error.stderr||error.message),/conflict|merge/i);else throw error;}await history.openReview();panel=panels.at(-1);assert.match(panel.webview.html,/conflict.txt · Conflict/);const previousCalls=calls.length;await panel.receive({type:'select',index:0});assert.equal(calls.length,previousCalls);assert.match(errors.at(-1),/Source Control/);
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
  assert.match(panel.webview.html,/Finished change: finished/);assert.match(panel.webview.html,/Commit: working change/);assert.match(panel.webview.html,/Commit: finished work/);history.dispose();
 }
});

test('review directs staged and mixed changes to Source Control even if worktree matches HEAD',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-history-staged-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 const file=path.join(root,'A.java');await fs.writeFile(file,'A\n');git(root,'add','.');git(root,'commit','-qm','initial');
 await fs.writeFile(file,'B\n');git(root,'add','A.java');await fs.writeFile(file,'A\n');
 let panel;const calls=[],errors=[];
 const vscode={ViewColumn:{One:1},Uri:{parse:key,file:key},workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel={webview:{onDidReceiveMessage(f){panel.receive=f;}},onDidDispose(){},dispose(){}},showErrorMessage:async e=>errors.push(e)},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
 await history.openReview();assert.match(panel.webview.html,/Staged.*Source Control/);await panel.receive({type:'select',index:0});assert.equal(calls.length,0);assert.match(errors.at(-1),/Source Control/);
 await fs.writeFile(file,'B\n');await history.openReview();await panel.receive({type:'select',index:0});assert.equal(calls.length,0);assert.match(errors.at(-1),/Source Control/);
});
