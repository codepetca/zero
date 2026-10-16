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
async function fixture(t, {lesson=true, lessonFile='00-hello-world.md', activeEditor=false, openTabs=[], tabsDuringPreparation=false, remembered=new Map(), practice=false, externalResult=true, empty=false, profile, information=async()=>undefined, pick=async()=>undefined}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-onboarding-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),practice?JSON.stringify({localOnly:true,practiceProjectId:'study',lessonId:'3',templateVersion:'0.1.0',mainClass:'Main'}):'{}');
  if(practice) {await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}\n');}
  await fs.writeFile(path.join(root,'mvnw'),'');
  if(lesson && !practice) {await fs.mkdir(path.join(root,'lessons')); await fs.writeFile(path.join(root,'lessons',lessonFile),'# First lesson');if(lessonFile==='00-hello-world.md')await fs.writeFile(path.join(root,'lessons/01-quiz.md'),'# Quiz');}
  const commands=new Map(),calls=[],errors=[],starts=[],ends=[],processEnds=[],launches=[],subscriptions=[];
  let webviewProvider, folderChanged, tabReads=0;
  let session, interactiveSession, authFailure=false;
  const authCalls=[],notices=[];
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{authCalls.push({provider,scopes,options});if(authFailure)throw new Error('PRIVATE');if(options.createIfNone&&interactiveSession)session=typeof interactiveSession==='function'?await interactiveSession():interactiveSession;return session;},onDidChangeSessions:disposable},
    workspace:{workspaceFolders:empty?[]:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,onDidChangeConfiguration:disposable,
      onDidChangeWorkspaceFolders:fn=>{folderChanged=fn;return disposable();},openTextDocument:async uri=>({uri}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}})},
    window:{tabGroups:{get all(){tabReads++;return [{tabs:tabsDuringPreparation&&tabReads>1?[{}]:openTabs}];}},activeTextEditor:activeEditor?{}:undefined,createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showQuickPick:pick,showInformationMessage:async(text,...choices)=>{notices.push({text,choices});return information(text,...choices);},showErrorMessage:text=>errors.push(text),showTextDocument:async(document,options)=>{calls.push(['showTextDocument',document.uri,options]);}},
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
  extension.activate({subscriptions,globalState:profile?{get:key=>profile.get(key),update:async(key,value)=>profile.set(key,value)}:undefined,workspaceState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)}});
  const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});
  if(!empty && !profile)await settle(()=>remembered.has('zero.sidebarShown'));
  const finish=(active,exitCode)=>{processEnds.forEach(fn=>fn({execution:active,exitCode}));ends.forEach(fn=>fn({execution:active}));};
  return {root,commands,calls,errors,launches,webview,remembered,finish,vscode,notices,authCalls,subscriptions,setSession(value){session=value;},setInteractiveSession(value){interactiveSession=value;},setFailure(value){authFailure=value;},tabReads:()=>tabReads,folderChanged:()=>folderChanged()};
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
test('lessonless projects support explicit native diagnostic run and hosted Tutorials', async t=>{
  const f=await fixture(t,{lesson:false});
  await f.commands.get('zero.runNativeApp')();assert.equal(f.launches.length,1);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
  await f.commands.get('zero.openFirstLesson')();assert.deepEqual(f.errors,[]);
  assert.deepEqual(f.calls.filter(([id])=>id==='openExternal').map(([,uri])=>uri.value),['https://zero.codepet.ca/learn']);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
});
test('only failed owned native diagnostic tasks offer Problems; success and Stop are normal exits', async t=>{
  const f=await fixture(t,{lesson:false});
  await f.commands.get('zero.runNativeApp')();
  f.finish({task:{definition:{type:'other'}}},1);
  assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
  f.finish(f.launches.at(-1),1);
  assert.match(f.webview.html,/App ended with an error/);
  assert.match(f.webview.html,/data-command="zero.showProblems"/);
  await f.commands.get('zero.showProblems')();assert.equal(f.calls.at(-1)[0],'workbench.actions.view.problems');
  await f.commands.get('zero.runNativeApp')();assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
  f.finish(f.launches.at(-1),0);assert.match(f.webview.html,/App stopped/);assert.doesNotMatch(f.webview.html,/data-command="zero.showProblems"/);
  await f.commands.get('zero.runNativeApp')();await f.commands.get('zero.stopApp')();
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

test('empty-window welcome is silent until explicit native Connect and manual retry needs no project',async t=>{
  let answer;
  const f=await fixture(t,{empty:true,profile:new Map(),information:(text,...choices)=>choices.includes('Connect GitHub')?new Promise(resolve=>{answer=resolve;}):undefined});
  await settle(()=>answer);
  assert.ok(f.authCalls.every(call=>call.options.silent));assert.equal(f.calls.length,0);assert.equal(f.launches.length,0);
  f.setSession({id:'test',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  answer('Connect GitHub');await settle(()=>f.notices.some(item=>item.text.includes('connected as student')));
  assert.ok(f.authCalls.every(call=>call.options.silent),'A newly existing account is reused without another grant');
  f.setSession(undefined);f.setFailure(true);await f.commands.get('zero.signInToGitHub')();assert.match(f.errors.at(-1),/cancelled or unavailable/);assert.doesNotMatch(f.errors.at(-1),/PRIVATE/);
  f.setFailure(false);f.setSession({id:'retry',account:{id:'retry',label:'retry'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();assert.match(f.webview.html,/Signed in as retry/);
  assert.deepEqual(f.authCalls.at(-1).scopes,['repo']);assert.deepEqual(f.authCalls.at(-1).options,{createIfNone:true});
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);assert.equal(await fs.readFile(path.join(f.root,'zero.json'),'utf8'),'{}');
});

test('modal welcome holds project introduction until Later, then local Run preserves editors',async t=>{
  let dismiss;
  const f=await fixture(t,{profile:new Map(),activeEditor:true,information:(text,...choices)=>choices.includes('Connect GitHub')?new Promise(resolve=>{dismiss=resolve;}):undefined});
  await settle(()=>dismiss);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  dismiss('Later');await settle(()=>f.remembered.has('zero.sidebarShown'));
  await f.commands.get('zero.runNativeApp')();assert.equal(f.launches.length,1,'Dismissing the welcome leaves local Run available');
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview'||id==='showTextDocument'||id==='openExternal').length,0);
  assert.ok(f.authCalls.every(call=>call.options.silent));
});

test('empty window with existing editor waits for explicit account action without consuming welcome',async t=>{
  const profile=new Map();const f=await fixture(t,{empty:true,profile,openTabs:[{}]});
  await settle(()=>f.authCalls.length>0);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(profile.size,0);assert.equal(f.notices.length,0);assert.equal(f.calls.length,0);
});

test('explicit welcome connection succeeds in an empty window and unpublished tutorial stays unavailable',async t=>{
  let answer;const profile=new Map();let picks=0;
  const f=await fixture(t,{empty:true,profile,information:(text,...choices)=>choices.includes('Connect GitHub')?new Promise(resolve=>{answer=resolve;}):choices.includes('Start tutorial')?'Start tutorial':undefined,pick:async items=>{picks++;return items[0];}});
  await settle(()=>answer);f.setInteractiveSession({id:'native',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});answer('Connect GitHub');
  await settle(()=>f.errors.length>0);assert.match(f.errors[0],/template is not published yet/);assert.equal(picks,1);
  assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);assert.deepEqual(f.authCalls.at(-1).options,{createIfNone:true});assert.ok(f.authCalls.every(call=>call.scopes.join(',')==='repo'));
  assert.ok(f.notices.some(item=>/connected as student/.test(item.text)));assert.equal(f.calls.length,0);assert.equal(f.launches.length,0);
  await f.commands.get('zero.getStarted')();assert.equal(picks,2,'The explicit Get Started command reopens a seen profile welcome');assert.match(f.errors.at(-1),/template is not published yet/);
  assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1,'Connected manual welcome never reauthorizes');
});

test('pending native connect prevents a duplicate and disposal ignores its late completion',async t=>{
  const f=await fixture(t,{empty:true,profile:new Map([['zero.githubWelcomeShown',true]])});let complete;
  await settle(()=>f.authCalls.length>0);f.setInteractiveSession(()=>new Promise(resolve=>{complete=resolve;}));
  const first=f.commands.get('zero.signInToGitHub')();await settle(()=>complete);
  await f.commands.get('zero.signInToGitHub')();assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);
  const before=f.notices.length;f.subscriptions.forEach(item=>item.dispose());complete({id:'late',account:{id:'late',label:'late'},accessToken:'MOCK_ONLY'});await first;
  assert.equal(f.errors.length,0);assert.equal(f.notices.length,before);assert.doesNotMatch(f.webview.html,/Signed in as late/);
});
