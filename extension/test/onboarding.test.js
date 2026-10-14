'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const disposable = () => ({dispose(){}});
const settle = async predicate => {
  const deadline = Date.now()+5000;
  while (!predicate()) {
    assert.ok(Date.now()<deadline,'Expected onboarding state did not arrive');
    await new Promise(resolve=>setImmediate(resolve));
  }
};
async function fixture(t, {lesson=true, lessonFile='00-hello-world.md', activeEditor=false, openTabs=[], tabsDuringPreparation=false, remembered=new Map(), practice=false, externalResult=true}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-onboarding-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),practice?JSON.stringify({localOnly:true,practiceProjectId:'study',lessonId:'3',templateVersion:'0.1.0',mainClass:'Main'}):'{}');
  if(practice) {await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}\n');}
  await fs.writeFile(path.join(root,'mvnw'),'');
  if(lesson && !practice) {await fs.mkdir(path.join(root,'lessons')); await fs.writeFile(path.join(root,'lessons',lessonFile),'# First lesson');if(lessonFile==='00-hello-world.md')await fs.writeFile(path.join(root,'lessons/01-quiz.md'),'# Quiz');}
  const commands=new Map(),calls=[],errors=[],starts=[],ends=[],processEnds=[],launches=[],subscriptions=[];
  let webviewProvider, folderChanged, tabReads=0;
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async()=>undefined,onDidChangeSessions:disposable},
    workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,onDidChangeConfiguration:disposable,
      onDidChangeWorkspaceFolders:fn=>{folderChanged=fn;return disposable();},openTextDocument:async uri=>({uri}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}})},
    window:{tabGroups:{get all(){tabReads++;return [{tabs:tabsDuringPreparation&&tabReads>1?[{}]:openTabs}];}},activeTextEditor:activeEditor?{}:undefined,createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showErrorMessage:text=>errors.push(text),showTextDocument:async(document,options)=>{calls.push(['showTextDocument',document.uri,options]);}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async(...args)=>{calls.push(args);}},
    tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTask:fn=>{ends.push(fn);return disposable();},onDidEndTaskProcess:fn=>{processEnds.push(fn);return disposable();},registerTaskProvider:disposable,
      executeTask:async task=>{const active={task,terminate(){processEnds.forEach(fn=>fn({execution:active,exitCode:undefined}));ends.forEach(fn=>fn({execution:active}));}};launches.push(active);starts.forEach(fn=>fn({execution:active}));return active;}},
    Task,TaskScope:{Workspace:2},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2},ProcessExecution:class{},ShellExecution:class{},
    EventEmitter:class{event(){}fire(){}dispose(){}},env:{openExternal:async uri=>{calls.push(['openExternal',uri]);return externalResult;}},Uri:{file:fsPath=>({fsPath}),parse:value=>({value})}
  };
  const filename=require.resolve('../src/extension'), oldCache=require.cache[filename], load=Module._load;
  delete require.cache[filename];
  Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./core')return {...core,assertRepositoryRoot:async()=>{throw new Error('No repository');}};return load.call(this,id,...args);};
  let extension;try{extension=require(filename);}finally{Module._load=load;}
  t.after(()=>{subscriptions.forEach(item=>item.dispose());delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
  extension.activate({subscriptions,workspaceState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)}});
  const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});
  await settle(()=>remembered.has('zero.sidebarShown'));
  const finish=(active,exitCode)=>{processEnds.forEach(fn=>fn({execution:active,exitCode}));ends.forEach(fn=>fn({execution:active}));};
  return {root,commands,calls,errors,launches,webview,remembered,finish,vscode,tabReads:()=>tabReads,folderChanged:()=>folderChanged()};
}
test('first lesson opens once per project and can be reopened without modifying student source', async t=>{
  const f=await fixture(t);
  await settle(()=>f.remembered.get(`zero.firstLessonShown:${f.root}`));
  const previews=()=>f.calls.filter(([id])=>id==='markdown.showPreview');
  assert.equal(previews().length,1);
  assert.equal(previews()[0][1].fsPath,path.join(f.root,'lessons/00-hello-world.md'));
  f.folderChanged(); await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(previews().length,1,'Already introduced project must not reopen the lesson');
  await f.commands.get('zero.openFirstLesson')();
  assert.equal(previews().length,2);
  assert.doesNotMatch(f.webview.html,/data-command="zero.openFirstLesson"/,'Tutorials live in the native view menu');
  assert.equal(await fs.readFile(path.join(f.root,'lessons/00-hello-world.md'),'utf8'),'# First lesson');
});
test('older kits retain their quiz first-lesson entry point', async t=>{
  const f=await fixture(t,{lessonFile:'01-quiz.md'});
  await settle(()=>f.remembered.get(`zero.firstLessonShown:${f.root}`));
  const preview=f.calls.find(([id])=>id==='markdown.showPreview');
  assert.equal(preview[1].fsPath,path.join(f.root,'lessons/01-quiz.md'));
});
test('installing during source editing does not replace the active editor', async t=>{
  const f=await fixture(t,{activeEditor:true});
  await f.commands.get('zero.openFirstLesson')();
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,1,'Only the explicit command opens the lesson');
  assert.deepEqual(f.errors,[]);
});
test('an existing Markdown preview is preserved on first activation', async t=>{
  const f=await fixture(t,{openTabs:[{input:{viewType:'markdown.preview'}}]});
  await settle(()=>f.tabReads()>0);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  await f.commands.get('zero.openFirstLesson')();
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,1,'Explicit reopen remains available');
});
test('a tab opened during asynchronous lesson preparation is preserved', async t=>{
  const f=await fixture(t,{tabsDuringPreparation:true});
  await settle(()=>f.tabReads()>=2);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
  await f.commands.get('zero.openFirstLesson')();
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,1);
});
test('lessonless projects run without opening a browser and explicitly open hosted Tutorials', async t=>{
  const f=await fixture(t,{lesson:false});
  await f.commands.get('zero.runApp')();assert.equal(f.launches.length,1);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
  await f.commands.get('zero.openFirstLesson')();assert.deepEqual(f.errors,[]);
  assert.deepEqual(f.calls.filter(([id])=>id==='openExternal').map(([,uri])=>uri.value),['https://zero.codepet.ca/learn']);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
});
test('only failed owned tasks offer Problems; success and Stop are normal exits', async t=>{
  const f=await fixture(t,{lesson:false});
  await f.commands.get('zero.runApp')();
  f.finish({task:{definition:{type:'other'}}},1);
  assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
  f.finish(f.launches.at(-1),1);
  assert.match(f.webview.html,/App ended with an error/);
  assert.match(f.webview.html,/data-command="zero.showProblems"/);
  await f.commands.get('zero.showProblems')();assert.equal(f.calls.at(-1)[0],'workbench.actions.view.problems');
  await f.commands.get('zero.runApp')();assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
  f.finish(f.launches.at(-1),0);assert.match(f.webview.html,/App stopped/);assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
  await f.commands.get('zero.runApp')();await f.commands.get('zero.stopApp')();
  assert.match(f.webview.html,/App stopped/);assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
});

test('new local project opens its canonical online guide and Main without replacing an editor', async t=>{
  const f=await fixture(t,{practice:true});
  await settle(()=>f.remembered.get(`zero.firstLessonShown:${f.root}`));
  assert.equal(f.calls.filter(([id])=>id==='showTextDocument').length,1);
  assert.equal(f.calls.find(([id])=>id==='openExternal')[1].value,'https://zero.codepet.ca/tutorials/3');
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  const editing=await fixture(t,{practice:true,activeEditor:true});
  await editing.commands.get('zero.openFirstLesson')();
  assert.equal(editing.calls.filter(([id])=>id==='showTextDocument').length,0);
  assert.equal(editing.calls.find(([id])=>id==='openExternal')[1].value,'https://zero.codepet.ca/tutorials/3');
});

test('idle status stays empty and a refused tutorial launch explains recovery',async t=>{
  const f=await fixture(t,{lesson:false,externalResult:false});
  assert.match(f.webview.html,/aria-live="polite"><\/p>/);
  assert.doesNotMatch(f.webview.html,/Ready to run/);
  await f.commands.get('zero.openFirstLesson')();
  assert.match(f.errors.at(-1),/Could not open the first lesson.*https:\/\/zero\.codepet\.ca\/learn/);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
});
