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
async function fixture(t, {lesson=true, lessonFile='00-hello-world.md', activeEditor=false, openTabs=[], tabsDuringPreparation=false, remembered=new Map(), practice=false, externalResult=true, empty=false, profile, unpublishedTutorials=false, information=async()=>undefined, pick=async()=>undefined, input=async()=>'my-project', clone=async()=>undefined, execute=async()=>undefined}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-onboarding-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),practice?JSON.stringify({localOnly:true,practiceProjectId:'study',lessonId:'3',templateVersion:'0.1.0',mainClass:'Main'}):'{}');
  if(practice) {await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}\n');}
  await fs.writeFile(path.join(root,'mvnw'),'');
  if(lesson && !practice) {await fs.mkdir(path.join(root,'lessons')); await fs.writeFile(path.join(root,'lessons',lessonFile),'# First lesson');if(lessonFile==='00-hello-world.md')await fs.writeFile(path.join(root,'lessons/01-quiz.md'),'# Quiz');}
  const commands=new Map(),calls=[],errors=[],starts=[],ends=[],processEnds=[],launches=[],subscriptions=[],panels=[];
  let webviewProvider, folderChanged, tabReads=0;
  let session, interactiveSession, authFailure=false;
  const authCalls=[],notices=[];
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{authCalls.push({provider,scopes,options});if(authFailure)throw new Error('PRIVATE');if(options.createIfNone&&interactiveSession)session=typeof interactiveSession==='function'?await interactiveSession():interactiveSession;return session;},onDidChangeSessions:disposable,registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},
    workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:empty?[]:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,onDidChangeConfiguration:disposable,
      onDidChangeWorkspaceFolders:fn=>{folderChanged=fn;return disposable();},openTextDocument:async uri=>({uri}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}})},
    window:{createWebviewPanel:(type,title,column,options)=>{const panel={type,title,column,options,reveal(){},onDidDispose:disposable,dispose(){},webview:{html:'',cspSource:'https://resources.invalid',asWebviewUri:uri=>({toString:()=>`https://resources.invalid/${path.basename(uri.fsPath)}`}),postMessage:async message=>{panel.restored=message;return true;},onDidReceiveMessage:fn=>{panel.message=fn;return disposable();}}};panels.push(panel);return panel;},tabGroups:{get all(){tabReads++;return [{tabs:tabsDuringPreparation&&tabReads>1?[{}]:openTabs}];}},activeTextEditor:activeEditor?{}:undefined,createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showQuickPick:pick,showInputBox:async options=>options.title==='Clone from GitHub'?'https://github.com/student/app':input(options),showOpenDialog:async()=>[{fsPath:root}],showInformationMessage:async(text,...choices)=>{notices.push({text,choices});return information(text,...choices);},showErrorMessage:text=>errors.push(text),showTextDocument:async(document,options)=>{calls.push(['showTextDocument',document.uri,options]);}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async(...args)=>{calls.push(args);return execute(...args);}},
    tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTask:fn=>{ends.push(fn);return disposable();},onDidEndTaskProcess:fn=>{processEnds.push(fn);return disposable();},registerTaskProvider:disposable,
      executeTask:async task=>{const active={task,terminate(){processEnds.forEach(fn=>fn({execution:active,exitCode:undefined}));ends.forEach(fn=>fn({execution:active}));}};launches.push(active);starts.forEach(fn=>fn({execution:active}));return active;}},
    ViewColumn:{Beside:2},Task,TaskScope:{Workspace:2},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2},ProcessExecution:class{},ShellExecution:class{},
    EventEmitter:class{event(){}fire(){}dispose(){}},env:{openExternal:async uri=>{calls.push(['openExternal',uri]);return externalResult;}},Uri:{file:fsPath=>({fsPath}),parse:value=>({value})}
  };
  const filename=require.resolve('../src/extension'), oldCache=require.cache[filename], load=Module._load;
  delete require.cache[filename];
  Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./project-folders'){const mod=load.call(this,id,...args);return {createProjectFolders:(vscode,options)=>mod.createProjectFolders(vscode,{...options,home:root})};}if(id==='./core')return {...core,assertRepositoryRoot:async()=>{throw new Error('No repository');}};return load.call(this,id,...args);};
  let extension;try{extension=require(filename);}finally{Module._load=load;}
  t.after(()=>{subscriptions.forEach(item=>item.dispose());delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
  let extensionPath;
  if (unpublishedTutorials) {
    extensionPath=path.join(root,'extension-fixture');
    await fs.mkdir(path.join(extensionPath,'media'),{recursive:true});
    const bundle=JSON.parse(await fs.readFile(path.join(__dirname,'../media/lesson-projects.json'),'utf8'));
    for (const project of bundle.projects) project.template=null;
    await fs.writeFile(path.join(extensionPath,'media/lesson-projects.json'),JSON.stringify(bundle));
  }
  extension.activate({extensionPath,subscriptions,globalState:profile?{get:key=>profile.get(key),update:async(key,value)=>profile.set(key,value)}:undefined,workspaceState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)}},{provider:{dispose(){},async removeSession(){session=undefined;}},repositories:{async create(value){calls.push(['createRepository',value]);return {repository:{html_url:'https://github.com/student/my-project'}};}},cloneRepository:async({signal,...value})=>{assert.ok(signal instanceof AbortSignal);calls.push(['cloneRepository',value]);return clone({...value,signal});}});
  const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});
  if(!empty && !profile)await settle(()=>remembered.has('zero.sidebarShown'));
  const finish=(active,exitCode)=>{processEnds.forEach(fn=>fn({execution:active,exitCode}));ends.forEach(fn=>fn({execution:active}));};
  return {root,commands,calls,errors,launches,webview,panels,remembered,finish,vscode,notices,authCalls,subscriptions,setSession(value){session=value;},setInteractiveSession(value){interactiveSession=value;},setFailure(value){authFailure=value;},tabReads:()=>tabReads,folderChanged:()=>folderChanged()};
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
test('lessonless projects support explicit native diagnostic run and bundled Tutorials', async t=>{
  const f=await fixture(t,{lesson:false});
  await f.commands.get('zero.runNativeApp')();assert.equal(f.launches.length,1);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
  await f.commands.get('zero.openFirstLesson')();assert.deepEqual(f.errors,[]);
  assert.equal(f.panels.length,1);assert.equal(f.panels[0].type,'zero.tutorials');
  assert.match(f.panels[0].webview.html,/Open in browser/);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
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

test('new local project opens its bundled guide beside Main without replacing an editor', async t=>{
  const f=await fixture(t,{practice:true});
  await settle(()=>f.remembered.get(`zero.firstLessonShown:${f.root}`));
  assert.equal(f.calls.filter(([id])=>id==='showTextDocument').length,1);
  assert.equal(f.panels.length,1);assert.equal(f.panels[0].column.viewColumn,2);
  await f.panels[0].message({type:'ready'});assert.equal(f.panels[0].restored.state.lessonId,'3');
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  const editing=await fixture(t,{practice:true,activeEditor:true});
  await editing.commands.get('zero.openFirstLesson')();
  assert.equal(editing.calls.filter(([id])=>id==='showTextDocument').length,0);
  assert.equal(editing.panels.length,1);await editing.panels[0].message({type:'ready'});
  assert.equal(editing.panels[0].restored.state.lessonId,'3');
});

test('idle status stays empty and a refused tutorial launch explains recovery',async t=>{
  const f=await fixture(t,{lesson:false,externalResult:false});
  assert.match(f.webview.html,/aria-live="polite"><\/p>/);
  assert.doesNotMatch(f.webview.html,/Ready to run/);
  await f.commands.get('zero.openFirstLesson')();
  assert.deepEqual(f.errors,[]);assert.equal(f.panels.length,1);
  await f.panels[0].message({type:'browser',lessonId:'0'});
  assert.match(f.errors.at(-1),/Could not open Tutorials:.*browser.*Open in browser again/);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
});

test('empty-window welcome is silent until explicit native Connect and manual retry needs no project',async t=>{
  let answer;
  const f=await fixture(t,{empty:true,profile:new Map(),information:(text,...choices)=>choices.includes('Connect GitHub')?new Promise(resolve=>{answer=resolve;}):undefined});
  await settle(()=>answer);
  assert.ok(f.authCalls.every(call=>call.provider==='zero-github'&&call.scopes.length===0&&call.options.silent));assert.equal(f.calls.length,0);assert.equal(f.launches.length,0);
  f.setSession({id:'test',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  answer('Connect GitHub');await settle(()=>f.notices.some(item=>item.text.includes('connected as student')));
  assert.ok(f.authCalls.every(call=>call.options.silent),'A newly existing account is reused without another grant');
  f.setSession(undefined);f.setFailure(true);await f.commands.get('zero.signInToGitHub')();assert.match(f.errors.at(-1),/cancelled or unavailable/);assert.doesNotMatch(f.errors.at(-1),/PRIVATE/);
  f.setFailure(false);f.setSession({id:'retry',account:{id:'retry',label:'retry'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();assert.match(f.webview.html,/Signed in as retry/);
  assert.deepEqual(f.authCalls.at(-1).scopes,[]);assert.deepEqual(f.authCalls.at(-1).options,{createIfNone:true});
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
  const f=await fixture(t,{empty:true,profile,unpublishedTutorials:true,information:(text,...choices)=>choices.includes('Connect GitHub')?new Promise(resolve=>{answer=resolve;}):choices.includes('Start tutorial')?'Start tutorial':undefined,pick:async items=>{picks++;return items[0];}});
  await settle(()=>answer);f.setInteractiveSession({id:'native',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});answer('Connect GitHub');
  await settle(()=>f.errors.length>0);assert.match(f.errors[0],/template is not published yet/);assert.equal(picks,1);
  assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);assert.deepEqual(f.authCalls.at(-1).options,{createIfNone:true});assert.ok(f.authCalls.every(call=>call.provider==='zero-github'&&call.scopes.length===0));
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


test('signed-out empty window only shows Sign in; direct authenticated clone remains serialized', async t=>{
  let finishClone;
  const f=await fixture(t,{empty:true,clone:async()=>new Promise(resolve=>{finishClone=resolve;})});
  assert.match(f.webview.html,/>Sign in<\/button>/);
  assert.doesNotMatch(f.webview.html,/data-command="zero.chooseRepository"|data-command="zero.cloneRepository"|Current branch:/);
  f.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  const clone=f.commands.get('zero.cloneRepository')();await settle(()=>finishClone);
  assert.match(f.webview.html,/data-command="zero.githubAccount"[^>]*disabled/);
  await f.commands.get('zero.cloneRepository')();await f.commands.get('zero.startProject')();await f.commands.get('zero.signInToGitHub')();
  assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,1);assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);
  finishClone();await clone;
  assert.equal(f.errors.length,0);assert.ok(!f.calls.some(([id])=>id==='git.clone'));
  assert.doesNotMatch(f.webview.html,/data-command="zero.chooseRepository"[^>]*disabled/);
  assert.doesNotMatch(f.webview.html,/Cloned|Repository cloned/,'Cancellation cannot imply clone success');
});

test('authenticated clone failures explain recovery and cancellation releases the busy guard', async t=>{
  let failure=new Error('Selected repository access was denied');
  const f=await fixture(t,{empty:true,clone:async()=>{if(failure)throw failure;}});
  f.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  await f.commands.get('zero.cloneRepository')();
  assert.match(f.errors.at(-1),/Could not clone.*Selected repository access was denied.*Zero’s GitHub access.*Clone from GitHub again/);
  assert.doesNotMatch(f.webview.html,/data-command="zero.chooseRepository"[^>]*disabled/);
  failure=Object.assign(new Error('Cancelled'),{name:'CancellationError'});const count=f.errors.length;
  await f.commands.get('zero.cloneRepository')();assert.equal(f.errors.length,count);
  failure=undefined;await f.commands.get('zero.cloneRepository')();assert.equal(f.errors.length,count);
  assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,3);assert.ok(!f.calls.some(([id])=>id==='git.clone'));
});

test('tutorial creation serializes form and clone, then releases the shared busy guard', async t=>{
  let finishPick,finishClone;const picks=[];
  const f=await fixture(t,{empty:true,pick:(items,options)=>{picks.push(options.title);return options.title==='Start tutorial'?new Promise(resolve=>{finishPick=()=>resolve(items[0]);}):items.find(item=>item.private===true);},clone:async()=>new Promise(resolve=>{finishClone=resolve;})});
  f.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  const start=f.commands.get('zero.startProject')();await settle(()=>finishPick);
  await f.commands.get('zero.cloneRepository')();await f.commands.get('zero.startProject')();assert.equal(picks.length,1);assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,0);
  finishPick();await settle(()=>finishClone);assert.deepEqual(f.calls.find(([id])=>id==='createRepository')[1],{name:'my-project',private:true,template:{owner:'codepetca',repo:'zero-tutorial-greeting'}});
  assert.deepEqual(f.calls.find(([id])=>id==='cloneRepository')[1],{repositoryUrl:'https://github.com/student/my-project',parentPath:f.root});
  await f.commands.get('zero.cloneRepository')();assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,1);
  finishClone(path.join(f.root,'my-project'));await start;
  assert.ok(f.calls.some(([id,uri])=>id==='vscode.openFolder'&&uri.fsPath===path.join(f.root,'my-project')));
  assert.equal(f.calls.filter(([id])=>id==='openExternal'||id==='git.clone').length,0);assert.deepEqual(f.errors,[]);
  assert.doesNotMatch(f.webview.html,/data-command="zero.chooseRepository"[^>]*disabled/);
});

test('signed-in empty Project menu offers New, Clone and Open local; opening reuses a local folder',async t=>{
  let selection='local';const picks=[];
  const f=await fixture(t,{empty:true,pick:async(items,options)=>{picks.push({items,options});return items.find(item=>item.action===selection);}});
  assert.doesNotMatch(f.webview.html,/zero.chooseRepository|Current branch:|Start tutorial<\/button>/);
  await f.commands.get('zero.chooseRepository')();assert.equal(picks.length,0);
  f.setInteractiveSession({id:'native',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();
  assert.match(f.webview.html,/>Project /);assert.match(f.webview.html,/zero.chooseRepository/);
  await f.commands.get('zero.chooseRepository')();assert.deepEqual(picks[0].items.map(item=>[item.label,item.action]),[['New project…','new'],['Clone from GitHub…','clone'],['Open local project…','local']]);assert.equal(picks[0].options.title,'Project');
  assert.ok(f.calls.some(([id,uri,options])=>id==='vscode.openFolder' && uri.fsPath===f.root && options.forceNewWindow));assert.ok(!f.calls.some(([id])=>id==='git.clone'));
});

test('sign-in is independent of local practice while sharing stays unavailable',async t=>{
  const f=await fixture(t,{practice:true});assert.match(f.webview.html,/>Sign in<\/button>/);assert.doesNotMatch(f.webview.html,/zero.chooseRepository/);
  f.setInteractiveSession({id:'native',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();
  assert.match(f.webview.html,/Signed in as student/);assert.match(f.webview.html,/Local practice · no GitHub sharing/);assert.doesNotMatch(f.webview.html,/zero.uploadToGitHub|zero.finishChange|zero.publishWeb/);
  await f.commands.get('zero.uploadToGitHub')();assert.match(f.errors.at(-1),/local lesson practice/);
});

test('clone parent preference survives extension activation through the local profile',async t=>{
  const profile=new Map(),first=await fixture(t,{empty:true,profile});
  first.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  await first.commands.get('zero.cloneRepository')();
  assert.equal(profile.get('zero.cloneParent'),first.root);
  const next=await fixture(t,{empty:true,profile});let picker;next.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
  next.vscode.window.showOpenDialog=async options=>{picker=options;return undefined;};
  await next.commands.get('zero.cloneRepository')();
  assert.equal(picker.defaultUri.fsPath,first.root);
  assert.equal(profile.get('zero.cloneParent'),first.root);
  assert.equal(next.calls.filter(([id])=>id==='git.clone').length,0);
});

test('native Cancel aborts an active clone and releases the command busy guard',async t=>{
 let entered,signal,cancel;const ready=new Promise(resolve=>{entered=resolve;});let attempts=0,notifications=0;
 const f=await fixture(t,{empty:true,clone:async options=>{attempts++;signal=options.signal;if(attempts>1)return;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(Error('Cancelled'),{name:'CancellationError',code:'cancelled'})),{once:true});entered();});}});
 f.vscode.ProgressLocation={Notification:15};f.vscode.window.withProgress=async(options,run)=>{notifications++;assert.equal(options.cancellable,true);return run({report(){}},{onCancellationRequested(fn){cancel=fn;return disposable();}});};
 f.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});
 const pending=f.commands.get('zero.cloneRepository')();await ready;await f.commands.get('zero.cloneRepository')();assert.equal(attempts,1);cancel();await pending;
 assert.equal(signal.aborted,true);assert.deepEqual(f.errors,[]);assert.doesNotMatch(f.webview.html,/data-command="zero.chooseRepository"[^>]*disabled/);
 await f.commands.get('zero.cloneRepository')();assert.equal(attempts,2);assert.equal(notifications,2);
});
test('tutorial creation and its authenticated clone share one cancellable native notification',async t=>{
 const notifications=[];const f=await fixture(t,{empty:true,pick:async(items,options)=>options.title==='Start tutorial'?items[0]:items.find(item=>item.private===true),clone:async({parentPath,signal})=>{assert.equal(signal.aborted,false);return path.join(parentPath,'my-project');}});
 f.vscode.ProgressLocation={Notification:15};f.vscode.window.withProgress=async(options,run)=>{notifications.push(options);return run({report(){}},{onCancellationRequested:()=>disposable()});};
 f.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.startProject')();assert.equal(notifications.length,1);assert.equal(notifications[0].cancellable,true);assert.equal(f.calls.filter(c=>c[0]==='createRepository').length,1);assert.equal(f.calls.filter(c=>c[0]==='cloneRepository').length,1);assert.deepEqual(f.errors,[]);
});
test('extension disposal aborts the pending clone and prevents opening its late result',async t=>{
 let entered,signal;const ready=new Promise(resolve=>{entered=resolve;});
 const f=await fixture(t,{empty:true,clone:async options=>{signal=options.signal;return new Promise(resolve=>{signal.addEventListener('abort',()=>resolve(path.join(options.parentPath,'late-project')),{once:true});entered();});}});
 f.setInteractiveSession({id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY'});const pending=f.commands.get('zero.cloneRepository')();await ready;f.subscriptions.forEach(item=>item.dispose());await pending;
 assert.equal(signal.aborted,true);assert.equal(f.calls.filter(c=>c[0]==='vscode.openFolder').length,0);
});
