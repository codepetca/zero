'use strict';
const {appSessions}=require('./fixtures/app-sessions');
const {textInputs} = require('./fixtures/text-input');
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
async function fixture(t, {studentExplorer=false, lesson=true, lessonFile='00-hello-world.md', activeEditor=false, zeroLaunch=false, openTabs=[], trackPanelTabs=false, tabsDuringPreparation=false, remembered=new Map(), practice=false, tutorial=false, setupCheck=false, externalResult=true, integratedBrowser=false, empty=false, profile, initialSession, githubAccess=async()=>{}, unpublishedTutorials=false, staleTutorials=false, information=async()=>undefined, pick=async()=>undefined, input=async()=>'my-project', clone=async()=>undefined, execute=async()=>undefined}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-onboarding-')));
  if (typeof profile === 'function') profile=profile(root);
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const tutorialId=typeof tutorial==='string'?tutorial:'greeting';
  const tutorialLesson={greeting:'0',study:'3',game:'8',pet:'13'}[tutorialId];
  await fs.writeFile(path.join(root,'zero.json'),practice?JSON.stringify({localOnly:true,practiceProjectId:'study',lessonId:'3',templateVersion:'0.1.0',mainClass:'Main'}):tutorial?JSON.stringify({repositoryRequired:true,tutorialProjectId:tutorialId,lessonId:tutorialLesson,templateVersion:'0.1.0',mainClass:'Main'}):'{}');
  if(practice||tutorial) {await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}\n');}
  await fs.writeFile(path.join(root,'mvnw'),'');
  if(lesson && !practice) {await fs.mkdir(path.join(root,'lessons')); await fs.writeFile(path.join(root,'lessons',lessonFile),'# First lesson');if(lessonFile==='00-hello-world.md')await fs.writeFile(path.join(root,'lessons/01-quiz.md'),'# Quiz');}
  const commands=new Map(),calls=[],errors=[],starts=[],ends=[],processEnds=[],launches=[],subscriptions=[],panels=[];
  let webviewProvider, folderChanged, sessionChanged, tabReads=0;
  let session=initialSession, interactiveSession, authFailure=false;
  const authCalls=[],notices=[];
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{authCalls.push({provider,scopes,options});if(authFailure)throw new Error('PRIVATE');if(options.createIfNone&&interactiveSession)session=typeof interactiveSession==='function'?await interactiveSession():interactiveSession;return session;},onDidChangeSessions:fn=>{sessionChanged=fn;return disposable();},registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},
    workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:empty?[]:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,onDidChangeConfiguration:disposable,
      onDidChangeWorkspaceFolders:fn=>{folderChanged=fn;return disposable();},openTextDocument:async uri=>({uri}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}})},
    window:{createWebviewPanel:(type,title,column,options)=>{const panel={type,title,column,options,messages:[],reveals:[],reveal(...args){this.reveals.push(args);},onDidDispose:disposable,dispose(){},webview:{html:'',cspSource:'https://resources.invalid',asWebviewUri:uri=>({toString:()=>`https://resources.invalid/${path.basename(uri.fsPath)}`}),postMessage:async message=>{panel.messages.push(message);panel.restored=message;return true;},onDidReceiveMessage:fn=>{panel.message=fn;return disposable();}}};panels.push(panel);if(type==='zero.startPage')queueMicrotask(()=>panel.message?.({type:'ready'}));return panel;},tabGroups:{get all(){tabReads++;return [{tabs:tabsDuringPreparation&&tabReads>1?[{}]:openTabs.concat(trackPanelTabs?panels.map(panel=>({input:{viewType:panel.type}})):[])}];}},activeTextEditor:activeEditor?{}:undefined,createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showQuickPick:pick,showInputBox:async options=>options.title==='GitHub repository URL'?'https://github.com/student/app':input(options),showOpenDialog:async()=>[{fsPath:root}],showInformationMessage:async(text,...choices)=>{notices.push({text,choices});return information(text,...choices);},showErrorMessage:text=>errors.push(text),showTextDocument:async(document,options)=>{calls.push(['showTextDocument',document.uri,options]);}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},getCommands:async()=>integratedBrowser?['workbench.action.browser.open']:[],executeCommand:async(...args)=>{calls.push(args);return execute(...args);}},
    tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTask:fn=>{ends.push(fn);return disposable();},onDidEndTaskProcess:fn=>{processEnds.push(fn);return disposable();},registerTaskProvider:disposable,
      executeTask:async task=>{const active={task,terminate(){processEnds.forEach(fn=>fn({execution:active,exitCode:undefined}));ends.forEach(fn=>fn({execution:active}));}};launches.push(active);starts.forEach(fn=>fn({execution:active}));return active;}},
    ViewColumn:{One:1,Beside:2},Task,TaskScope:{Workspace:2},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2},ProcessExecution:class{},ShellExecution:class{},
    EventEmitter:class{event(){}fire(){}dispose(){}},env:{openExternal:async uri=>{calls.push(['openExternal',uri]);return externalResult;}},Uri:{file:fsPath=>({fsPath}),parse:value=>({value})}
  };
  if(studentExplorer) {
    vscode.window.createTreeView=()=>({dispose(){}});
    vscode.TreeItemCollapsibleState={None:0,Collapsed:1,Expanded:2};
  }
  const filename=require.resolve('../src/extension'), oldCache=require.cache[filename], load=Module._load;
  delete require.cache[filename];
  Module._load=function(id,...args){if(id==='vscode')return textInputs(vscode);if(id==='./project-folders'){const mod=load.call(this,id,...args);return {createProjectFolders:(vscode,options)=>mod.createProjectFolders(vscode,{...options,home:root})};}if(id==='./setup-project'&&setupCheck)return {isSetupProject:candidate=>candidate===root,findSetupProject:async()=>root};if(id==='./core')return {...core,assertRepositoryRoot:async()=>{throw new Error('No repository');}};return load.call(this,id,...args);};
  let extension;try{extension=require(filename);}finally{Module._load=load;}
  t.after(()=>{subscriptions.forEach(item=>item.dispose());delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
  // Explicit fixture publication evidence exercises the ready path without
  // stamping the real public-template records, which intentionally remain stale.
  const extensionPath=path.join(root,'extension-fixture');
  await fs.mkdir(path.join(extensionPath,'media'),{recursive:true});
  await fs.copyFile(path.join(__dirname,'../media/tutorial-content.json'),path.join(extensionPath,'media/tutorial-content.json'));
  const bundle=JSON.parse(await fs.readFile(path.join(__dirname,'../media/lesson-projects.json'),'utf8'));
  const {tutorialScaffoldSha256}=require('../src/tutorial-template-readiness');
  for (const project of bundle.projects) {
    if(unpublishedTutorials)project.template=null;
    else if(project.template){if(!staleTutorials)project.template.scaffoldSha256=tutorialScaffoldSha256(project.files);
    else delete project.template.scaffoldSha256;}
  }
  await fs.writeFile(path.join(extensionPath,'media/lesson-projects.json'),JSON.stringify(bundle));
  extension.activate({extensionPath,subscriptions,globalState:profile?{get:key=>profile.get(key),update:async(key,value)=>profile.set(key,value)}:undefined,workspaceState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)}},{env:zeroLaunch?{ZERO_KIT_DIR:root}:{},provider:appSessions(vscode,{dispose(){},async removeSession(){session=undefined;}}),repositories:{checkSetup:githubAccess,async create(value){calls.push(['createRepository',value]);return {repository:{html_url:'https://github.com/student/my-project'}};}},cloneRepository:async({signal,...value})=>{assert.ok(signal instanceof AbortSignal);calls.push(['cloneRepository',value]);return clone({...value,signal});}});
  const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});
  if(!empty && !profile)await settle(()=>remembered.has('zero.sidebarShown'));
  const finish=(active,exitCode)=>{processEnds.forEach(fn=>fn({execution:active,exitCode}));ends.forEach(fn=>fn({execution:active}));};
  return {root,commands,calls,errors,launches,webview,panels,get startPage(){return panels.find(panel=>panel.type==='zero.startPage');},get startState(){return this.startPage?.restored?.state;},remembered,finish,vscode,notices,authCalls,subscriptions,setSession(value){session=value;sessionChanged({provider:{id:'zero-github'}});},setInteractiveSession(value){interactiveSession=value;},setFailure(value){authFailure=value;},tabReads:()=>tabReads,folderChanged:()=>folderChanged()};
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
  assert.equal(previews().length,1);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,1);
  assert.doesNotMatch(f.webview.html,/data-command="zero.openFirstLesson"/,'Tutorials live in the native view menu');
  assert.equal(await fs.readFile(path.join(f.root,'lessons/00-hello-world.md'),'utf8'),'# First lesson');
});
test('existing tutorial markers and Pet open their stable first lesson without checking template readiness',async t=>{
  for(const [tutorial,id] of Object.entries({greeting:'0',study:'3',game:'8',pet:'13'})) {
    const f=await fixture(t,{tutorial,lesson:false,unpublishedTutorials:true});
    await settle(()=>f.remembered.get(`zero.firstLessonShown:${f.root}`));
    assert.equal(f.calls.find(([command])=>command==='openExternal')[1].value,`https://zero.codepet.ca/tutorials/${id}`);
    assert.equal(f.calls.filter(([command])=>command==='showTextDocument').length,1);
    assert.equal(f.calls.filter(([command])=>['createRepository','cloneRepository'].includes(command)).length,0);
    assert.deepEqual(f.errors,[]);
  }
});
test('Tutorial Docs opens the matching website lesson beside the editor when integrated browser is available',async t=>{
  const f=await fixture(t,{tutorial:'pet',lesson:false,activeEditor:true,integratedBrowser:true});
  await f.commands.get('zero.openFirstLesson')();
  assert.deepEqual(f.calls.find(([id])=>id==='workbench.action.browser.open'),['workbench.action.browser.open',{url:'https://zero.codepet.ca/tutorials/13',openToSide:true}]);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
});
test('existing projects migrate once to native Explorer and expand the Zero controls',async t=>{
  const remembered=new Map([['zero.sidebarShown',true]]);
  const f=await fixture(t,{remembered,activeEditor:true});
  await settle(()=>remembered.get('zero.explorerShown'));
  const shown=()=>f.calls.filter(([id])=>['workbench.view.explorer','zero.controls.focus'].includes(id));
  assert.deepEqual(shown().map(([id])=>id),['workbench.view.explorer','zero.controls.focus']);
  assert.equal(f.calls.some(([id])=>id==='workbench.view.extension.zero'),false);
  assert.doesNotMatch(f.webview.html,/role="tree"|files\.list|files\.open/);
  assert.match(f.webview.html,/zero.newClass/);assert.match(f.webview.html,/zero.importAssets/);
  f.folderChanged();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(shown().length,2);
  await f.commands.get('zero.showSidebar')();assert.equal(shown().length,4);
});
test('empty onboarding opens one live Start Page and keeps the sidebar minimal',async t=>{
  const f=await fixture(t,{empty:true});
  await settle(()=>f.startState?.phase==='signed-out');
  assert.match(f.webview.html,/data-command="zero.startPage"[^>]*>Open Start Page<\/button>/);
  assert.doesNotMatch(f.webview.html,/data-command="zero.signInToGitHub"|data-command="zero.toggleApp"/);
  assert.equal(f.panels.length,1);assert.equal(f.startPage.title,'Zero Start Page');assert.equal(f.launches.length,0);
  const document=f.startPage.webview.html;
  await f.commands.get('zero.startPage')();await f.commands.get('zero.getStarted')();
  assert.equal(f.panels.length,1);assert.equal(f.startPage.reveals.length,2);assert.equal(f.startPage.webview.html,document);
  assert.equal(f.calls.filter(([id])=>id==='showTextDocument'||id==='markdown.showPreview').length,0);
});
test('Start Page Tutorials link opens the reader without a project or GitHub sign-in',async t=>{
  const f=await fixture(t,{empty:true,execute:async id=>f.commands.get(id)?.()});
  await settle(()=>f.startState?.phase==='signed-out');
  await f.startPage.message({type:'action',action:'tutorials',token:f.startPage.restored.token});
  assert.deepEqual(f.panels.map(panel=>panel.type),['zero.startPage']);
  assert.equal(f.calls.find(([id])=>id==='openExternal')[1].value,'https://zero.codepet.ca/tutorials/15');
  assert.equal(f.launches.length,0);assert.ok(f.authCalls.every(call=>call.options.silent));
  assert.equal(f.calls.filter(([id])=>['createRepository','cloneRepository','vscode.openFolder'].includes(id)).length,0);
  assert.deepEqual(f.errors,[]);
});
test('local and cloned projects persist the Start Page handoff before replacing the workspace',async t=>{
  for (const kind of ['local','clone']) {
    const profile=new Map();let target;
    const f=await fixture(t,{empty:true,profile,clone:async()=>target,execute:async id=>{
      if(id==='vscode.openFolder')assert.equal(profile.get('zero.startPageHandoff')?.root,target);
    }});
    await settle(()=>f.startState?.phase==='signed-out');
    if(kind==='local') {
      target=f.root;await f.commands.get('zero.openLocalProject')();
    } else {
      target=path.join(f.root,'cloned');
      f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
      await f.commands.get('zero.cloneRepository')();
    }
    assert.equal(f.calls.filter(([id])=>id==='vscode.openFolder').length,1);
    assert.equal(profile.get('zero.startPageHandoff').root,target);
    assert.equal(f.panels.filter(panel=>panel.type==='zero.startPage').length,1);
  }
});
test('destination activation retains Start Page while opening Main and Tutorials',async t=>{
  let profile;
  const f=await fixture(t,{tutorial:true,trackPanelTabs:true,profile:root=>profile=new Map([['zero.startPageHandoff',{
    id:'handoff',origin:'previous-host',root,createdAt:Date.now()
  }]])});
  await settle(()=>f.remembered.get(`zero.firstLessonShown:${f.root}`));
  assert.equal(f.calls.filter(([id])=>id==='showTextDocument').length,1);
  assert.deepEqual(f.panels.map(panel=>panel.type),['zero.startPage']);
  assert.equal(f.calls.find(([id])=>id==='openExternal')[1].value,'https://zero.codepet.ca/tutorials/0');
  assert.deepEqual(f.startPage.column,{viewColumn:1,preserveFocus:true});
  assert.equal(profile.get('zero.startPageHandoff'),undefined);
  f.folderChanged();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(f.panels.filter(panel=>panel.type==='zero.startPage').length,1);
});
test('destination editors stay available while a handed-off Start Page opens in the background',async t=>{
  const tabs=[{input:{viewType:'markdown.preview'}}];
  const f=await fixture(t,{openTabs:tabs,activeEditor:true,profile:root=>new Map([['zero.startPageHandoff',{
    id:'handoff',origin:'previous-host',root,createdAt:Date.now()
  }]])});
  await settle(()=>f.startPage);
  assert.equal(f.calls.filter(([id])=>id==='showTextDocument'||id==='markdown.showPreview').length,0);
  assert.deepEqual(f.vscode.window.tabGroups.all[0].tabs,tabs);
  assert.deepEqual(f.startPage.column,{viewColumn:1,preserveFocus:true});
});
test('guided project access finishes before tutorial choice, naming or repository creation',async t=>{
  const events=[];let release;
  const f=await fixture(t,{empty:true,githubAccess:async()=>{events.push('access');await new Promise(resolve=>{release=resolve;});},pick:async items=>{events.push('tutorial');return items[0];},input:async()=>{events.push('name');return 'my-greeting';},clone:async({parentPath})=>{events.push('clone');return path.join(parentPath,'my-greeting');}});
  f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
  const pending=f.commands.get('zero.startProject')();await settle(()=>release);
  assert.ok(events.length>=1&&events.every(event=>event==='access'));assert.equal(f.calls.filter(([id])=>id==='createRepository').length,0);
  const count=events.length;await f.commands.get('zero.startProject')();assert.equal(events.length,count);
  release();await pending;
  assert.deepEqual(events.filter(event=>event!=='access'),['tutorial','name','clone']);assert.equal(f.calls.filter(([id])=>id==='createRepository').length,1);assert.deepEqual(f.errors,[]);
});
test('failed first sign-in can retry setup and reveal Zero without creating a project',async t=>{
  let checks=0;const f=await fixture(t,{empty:true,profile:new Map([['zero.githubSetupWelcomeShown',true]]),remembered:new Map([['zero.sidebarShown',true]]),openTabs:[{}],githubAccess:async()=>{checks++;}});
  await settle(()=>f.authCalls.length>0);f.setFailure(true);await f.commands.get('zero.signInToGitHub')();assert.match(f.errors.at(-1),/cancelled or unavailable/);
  f.setFailure(false);f.setInteractiveSession({id:'retry',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();
  assert.equal(checks,1);assert.equal(f.calls.filter(([id])=>id==='zero.controls.focus').length,0);assert.equal(f.startState.phase,'ready');assert.equal(f.startState.accountId,'17');assert.equal(f.startPage.reveals.length,1);
  assert.equal(f.calls.filter(([id])=>id==='createRepository'||id==='cloneRepository').length,0);
});
test('deliberate Zero launch preserves an existing editor until Start Page is requested',async t=>{
  const tabs=[{input:{viewType:'markdown.preview'}}];
  const f=await fixture(t,{empty:true,zeroLaunch:true,profile:new Map(),remembered:new Map([['zero.sidebarShown',true]]),openTabs:tabs});
  await settle(()=>f.authCalls.length>0);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.panels.length,0);assert.equal(f.calls.length,0);assert.equal(f.notices.length,0);
  await f.commands.get('zero.startPage')();await settle(()=>f.startState?.phase==='signed-out');
  assert.deepEqual(f.vscode.window.tabGroups.all[0].tabs,tabs);assert.equal(f.panels.length,1);
});
test('canceling initial access check creates nothing and retry reuses the saved connection',async t=>{
  let cancel,checks=0,entered;const ready=new Promise(resolve=>{entered=resolve;});
  const f=await fixture(t,{empty:true,githubAccess:async({signal})=>{checks++;if(checks!==2)return;await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(Error('Cancelled'),{code:'cancelled'})),{once:true});entered();});}});
  f.vscode.ProgressLocation={Notification:15};f.vscode.window.withProgress=async(options,run)=>run({}, {onCancellationRequested:fn=>{cancel=fn;return disposable();}});
  f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});const pending=f.commands.get('zero.startProject')();await ready;await settle(()=>cancel);cancel();await pending;
  await settle(()=>f.startState?.phase==='ready');assert.deepEqual(f.errors,[]);assert.equal(f.calls.filter(([id])=>id==='createRepository').length,0);
  await f.commands.get('zero.startProject')();assert.ok(checks>=3);assert.equal(f.authCalls.filter(x=>x.options.createIfNone).length,1);assert.equal(f.calls.filter(([id])=>id==='createRepository').length,0);
});
test('own tutorial opens Main and its lesson while installation check never opens a lesson',async t=>{
  const tutorial=await fixture(t,{tutorial:true});
  await settle(()=>tutorial.remembered.get(`zero.firstLessonShown:${tutorial.root}`));
  assert.ok(tutorial.calls.some(([id,uri])=>id==='showTextDocument'&&uri.fsPath===path.join(tutorial.root,'src/main/java/Main.java')));
  assert.equal(tutorial.calls.find(([id])=>id==='openExternal')[1].value,'https://zero.codepet.ca/tutorials/0');
  assert.equal(tutorial.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  const setup=await fixture(t,{setupCheck:true});
  await settle(()=>setup.webview.html.includes('Installation test · Hello World'));
  assert.match(setup.webview.html,/Installation test · Hello World/);
  assert.match(setup.webview.html,/Run test<\/button>/);
  assert.equal(setup.panels.length,0);assert.equal(setup.calls.filter(([id])=>id==='markdown.showPreview').length,0);
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
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,1,'Only the explicit command opens Tutorial Docs');
  assert.deepEqual(f.errors,[]);
});
test('an existing Markdown preview is preserved on first activation', async t=>{
  const f=await fixture(t,{openTabs:[{input:{viewType:'markdown.preview'}}]});
  await settle(()=>f.tabReads()>0);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  await f.commands.get('zero.openFirstLesson')();
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,1,'Explicit reopen remains available');
});
test('a tab opened during asynchronous lesson preparation is preserved', async t=>{
  const f=await fixture(t,{tabsDuringPreparation:true});
  await settle(()=>f.tabReads()>=2);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
  await f.commands.get('zero.openFirstLesson')();
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,1);
});
test('lessonless projects support native Run App and bundled Tutorials', async t=>{
  const f=await fixture(t,{lesson:false});
  await f.commands.get('zero.runApp')();assert.equal(f.launches.length,1);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview').length,0);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
  await f.commands.get('zero.openFirstLesson')();assert.deepEqual(f.errors,[]);
  assert.equal(f.calls.filter(([id])=>id==='openExternal').length,1);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),true);
});
test('only failed owned native tasks offer Problems; success and Stop are normal exits', async t=>{
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
  assert.match(f.webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Run<\/button>/);
});

test('new local project opens its bundled guide beside Main without replacing an editor', async t=>{
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
  assert.match(f.errors.at(-1),/Could not open Tutorial Docs in your browser/);
  assert.equal(f.remembered.get(`zero.firstLessonShown:${f.root}`),undefined);
});

test('Start Page sign-in is explicit and retry needs no project or welcome modal',async t=>{
  const f=await fixture(t,{empty:true,profile:new Map(),execute:async id=>f.commands.get(id)?.()});
  await settle(()=>f.startState?.phase==='signed-out');
  assert.ok(f.authCalls.every(call=>call.options.silent));assert.equal(f.notices.length,0);assert.match(f.webview.html,/Open Start Page/);
  f.setFailure(true);await f.startPage.message({type:'action',action:'signIn',token:f.startPage.restored.token});assert.match(f.errors.at(-1),/cancelled or unavailable/);assert.doesNotMatch(f.errors.at(-1),/PRIVATE/);
  f.setFailure(false);f.setInteractiveSession({id:'retry',account:{id:'18',label:'retry'},accessToken:'MOCK_ONLY'});await f.startPage.message({type:'action',action:'signIn',token:f.startPage.restored.token});assert.equal(f.startState.phase,'ready');assert.equal(f.startState.accountId,'18');assert.equal(f.startState.status,'');assert.doesNotMatch(f.webview.html,/data-command="zero.newProject"|data-command="zero.startProject"/);
  assert.equal(f.calls.filter(([id])=>id==='openExternal'||id==='createRepository').length,0);assert.equal(await fs.readFile(path.join(f.root,'zero.json'),'utf8'),'{}');
});

test('sign-out feedback is replaced by current sign-in failure and cleared after successful retry',async t=>{
  for (const failure of ['cancelled','unavailable']) {
    const session={id:'initial',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'};
    const f=await fixture(t,{empty:true,initialSession:session,pick:async()=>({action:'signOut'})});
    await settle(()=>f.startState?.phase==='ready');
    await f.commands.get('zero.githubAccount')();assert.equal(f.startState.phase,'signed-out');assert.equal(f.startState.status,'Signed out of Zero');
    if(failure==='unavailable')f.setFailure(true);
    await f.commands.get('zero.signInToGitHub')();
    assert.equal(f.startState.phase,'signed-out');assert.notEqual(f.startState.status,'Signed out of Zero');assert.match(f.errors.at(-1),/Sign in to GitHub|cancelled or unavailable/);
    f.setFailure(false);f.setInteractiveSession({...session,id:'retry'});await f.commands.get('zero.signInToGitHub')();
    assert.equal(f.startState.phase,'ready');assert.equal(f.startState.accountId,'17');assert.equal(f.startState.status,'');
  }
});

test('sign-out followed by successful sign-in clears stale feedback without hiding a new runtime failure',async t=>{
  for (const runtimeFailure of [false,true]) {
    const session={id:'initial',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'};
    const f=await fixture(t,{initialSession:session,pick:async()=>({action:'signOut'})});
    await f.commands.get('zero.startPage')();await settle(()=>f.startState?.phase==='ready');
    await f.commands.get('zero.githubAccount')();assert.equal(f.startState.status,'Signed out of Zero');
    if(runtimeFailure)await f.commands.get('zero.runApp')();
    let complete;
    f.setInteractiveSession(()=>new Promise(resolve=>{complete=resolve;}));
    const pending=f.commands.get('zero.signInToGitHub')();await settle(()=>complete);
    if(runtimeFailure) {
      // Native task ownership is independent of the pending browser callback.
      f.finish(f.launches.at(-1),1);
      assert.match(f.startState.status,/App ended with an error/);
    }
    complete({...session,id:'retry'});await pending;
    assert.equal(f.startState.phase,'ready');assert.equal(f.startState.accountId,'17');
    if(runtimeFailure)assert.match(f.startState.status,/App ended with an error/);
    else assert.equal(f.startState.status,'');
  }
});

test('setup sidebar never blocks local Run or replaces editors with a welcome modal',async t=>{
  const f=await fixture(t,{profile:new Map(),setupCheck:true,activeEditor:true});
  await settle(()=>f.remembered.has('zero.sidebarShown'));assert.equal(f.notices.length,0);
  // Showing the sidebar precedes the asynchronous project/status render.
  await settle(()=>/data-command="zero.toggleApp"/.test(f.webview.html));
  assert.match(f.webview.html,/Run test/);await f.commands.get('zero.runApp')();assert.equal(f.launches.length,1);
  assert.equal(f.calls.filter(([id])=>id==='markdown.showPreview'||id==='showTextDocument'||id==='openExternal').length,0);
  assert.ok(f.authCalls.every(call=>call.options.silent));
});

test('empty window with existing editor waits for explicit account action without consuming welcome',async t=>{
  const profile=new Map();const f=await fixture(t,{empty:true,profile,openTabs:[{}]});
  await settle(()=>f.authCalls.length>0);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(profile.size,0);assert.equal(f.notices.length,0);assert.equal(f.calls.length,0);
});

test('manual Zero launch leaves VS Code startup tabs untouched',async t=>{
  const profile=new Map(),tabs=[{input:{viewType:'welcome'}}];
  const f=await fixture(t,{empty:true,profile,zeroLaunch:true,openTabs:tabs});
  await settle(()=>f.authCalls.length>0);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.notices.length,0);assert.equal(f.panels.length,0);assert.equal(profile.size,0);
  assert.deepEqual(f.vscode.window.tabGroups.all[0].tabs,tabs);assert.equal(f.calls.length,0);
  assert.match(f.webview.html,/data-command="zero.startPage"[^>]*>Open Start Page/);
});
test('Get Started reveals setup without creating a project; unpublished tutorial remains unavailable',async t=>{
  let picks=0;const f=await fixture(t,{empty:true,profile:new Map(),unpublishedTutorials:true,pick:async items=>{picks++;return items[0];}});
  await settle(()=>f.startState?.phase==='signed-out');await f.commands.get('zero.getStarted')();assert.equal(picks,0);assert.equal(f.notices.length,0);
  f.setInteractiveSession({id:'native',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();await f.commands.get('zero.startProject')();
  assert.match(f.errors.at(-1),/template is not published yet/);assert.equal(picks,1);assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);
  assert.equal(f.calls.filter(([id])=>id==='createRepository'||id==='cloneRepository'||id==='openExternal').length,0);assert.equal(f.launches.length,0);
});

test('pending native connect prevents a duplicate and disposal ignores its late completion',async t=>{
  const f=await fixture(t,{empty:true,profile:new Map([['zero.githubWelcomeShown',true]])});let complete;
  await settle(()=>f.authCalls.length>0);f.setInteractiveSession(()=>new Promise(resolve=>{complete=resolve;}));
  const first=f.commands.get('zero.signInToGitHub')();await settle(()=>complete);
  await f.commands.get('zero.signInToGitHub')();assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);
  const before=f.notices.length,messages=f.startPage.messages.length;f.subscriptions.forEach(item=>item.dispose());complete({id:'late',account:{id:'19',label:'late'},accessToken:'MOCK_ONLY'});await first;
  assert.equal(f.errors.length,0);assert.equal(f.notices.length,before);assert.equal(f.startPage.messages.length,messages);assert.notEqual(f.startState.accountId,'19');
});


test('empty sidebar opens Start Page; direct authenticated clone remains serialized', async t=>{
  let finishClone;
  const f=await fixture(t,{empty:true,clone:async()=>new Promise(resolve=>{finishClone=resolve;})});
  assert.match(f.webview.html,/>Open Start Page<\/button>/);
  assert.doesNotMatch(f.webview.html,/data-command="zero.importAssets"|data-command="zero.recovery"/,'Empty windows have no file maintenance controls');
  assert.doesNotMatch(f.webview.html,/data-command="zero.chooseRepository"|data-command="zero.cloneRepository"|Current branch:/);
  f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
  const clone=f.commands.get('zero.cloneRepository')();await settle(()=>finishClone);
  assert.equal(f.startState.busy,true);assert.match(f.webview.html,/data-command="zero.startPage"[^>]*disabled/);
  assert.doesNotMatch(f.webview.html,/data-command="zero.githubAccount"/);
  await f.commands.get('zero.cloneRepository')();await f.commands.get('zero.startProject')();await f.commands.get('zero.signInToGitHub')();
  assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,1);assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,1);
  finishClone();await clone;
  assert.equal(f.errors.length,0);assert.ok(!f.calls.some(([id])=>id==='git.clone'));
  assert.equal(f.startState.busy,false);
  assert.doesNotMatch(f.webview.html,/Cloned|Repository cloned/,'Cancellation cannot imply clone success');
});

test('authenticated clone failures explain recovery and cancellation releases the busy guard', async t=>{
  let failure=new Error('Selected repository access was denied');
  const f=await fixture(t,{empty:true,clone:async()=>{if(failure)throw failure;}});
  f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
  await f.commands.get('zero.cloneRepository')();
  assert.match(f.errors.at(-1),/Could not clone.*Selected repository access was denied.*Zero’s GitHub access.*Clone from GitHub again/);
  assert.equal(f.startState.busy,false);
  failure=Object.assign(new Error('Cancelled'),{name:'CancellationError'});const count=f.errors.length;
  await f.commands.get('zero.cloneRepository')();assert.equal(f.errors.length,count);
  failure=undefined;await f.commands.get('zero.cloneRepository')();assert.equal(f.errors.length,count);
  assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,3);assert.ok(!f.calls.some(([id])=>id==='git.clone'));
});

test('tutorial creation serializes form and clone, then releases the shared busy guard', async t=>{
  let finishPick,finishClone;const picks=[];
  const f=await fixture(t,{empty:true,pick:(items,options)=>{picks.push(options.title);return options.title==='Start tutorial'?new Promise(resolve=>{finishPick=()=>resolve(items[0]);}):assert.fail('Unexpected picker: '+options.title);},clone:async()=>new Promise(resolve=>{finishClone=resolve;})});
  f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
  const start=f.commands.get('zero.startProject')();await settle(()=>finishPick);
  await f.commands.get('zero.cloneRepository')();await f.commands.get('zero.startProject')();assert.equal(picks.length,1);assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,0);
  finishPick();await settle(()=>finishClone);assert.deepEqual(picks,['Start tutorial']);assert.deepEqual(f.calls.find(([id])=>id==='createRepository')[1],{name:'my-project',private:false,template:{owner:'codepetca',repo:'zero-tutorial-greeting'}});
  assert.deepEqual(f.calls.find(([id])=>id==='cloneRepository')[1],{repositoryUrl:'https://github.com/student/my-project',parentPath:f.root});
  await f.commands.get('zero.cloneRepository')();assert.equal(f.calls.filter(([id])=>id==='cloneRepository').length,1);
  finishClone(path.join(f.root,'my-project'));await start;
  assert.ok(f.calls.some(([id,uri])=>id==='vscode.openFolder'&&uri.fsPath===path.join(f.root,'my-project')));
  assert.equal(f.calls.filter(([id])=>id==='openExternal'||id==='git.clone').length,0);assert.deepEqual(f.errors,[]);
  assert.equal(f.startState.busy,false);
});

test('empty project actions stay on Start Page and direct local open reuses a folder',async t=>{
  const picks=[];
  const f=await fixture(t,{empty:true,pick:async(items,options)=>{picks.push({items,options});}});
  assert.doesNotMatch(f.webview.html,/zero.chooseRepository|Current branch:/);
  await f.commands.get('zero.chooseRepository')();assert.equal(picks.length,0);
  f.setInteractiveSession({id:'native',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();
  assert.equal(f.startState.phase,'ready');assert.doesNotMatch(f.webview.html,/project-menu-button|zero.chooseRepository/);
  await f.commands.get('zero.chooseRepository')();assert.deepEqual(picks[0].items.map(item=>item.action),['account']);assert.equal(picks[0].options.title,'Project');
  await f.commands.get('zero.openLocalProject')();
  assert.ok(f.calls.some(([id,uri,options])=>id==='vscode.openFolder' && uri.fsPath===f.root && options.forceReuseWindow));assert.ok(!f.calls.some(([id])=>id==='git.clone'));
});

test('sign-in is independent of local practice while sharing stays unavailable',async t=>{
  const f=await fixture(t,{practice:true});await settle(()=>/>GitHub setup<\/button>/.test(f.webview.html));assert.match(f.webview.html,/>GitHub setup<\/button>/);assert.doesNotMatch(f.webview.html,/zero.chooseRepository/);
  f.setInteractiveSession({id:'native',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();
  assert.equal(f.startState.phase,'ready');assert.equal(f.startState.accountId,'17');assert.doesNotMatch(f.webview.html,/Signed in as student|data-command="zero.githubAccount"/);assert.match(f.webview.html,/Local practice · no GitHub sharing/);assert.doesNotMatch(f.webview.html,/zero.uploadToGitHub|zero.finishChange|zero.publishWeb/);
  await f.commands.get('zero.uploadToGitHub')();assert.match(f.errors.at(-1),/local lesson practice/);
});

test('clone parent preference survives extension activation through the local profile',async t=>{
  const profile=new Map(),first=await fixture(t,{empty:true,profile});
  first.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
  await first.commands.get('zero.cloneRepository')();
  assert.equal(profile.get('zero.cloneParent'),first.root);
  const next=await fixture(t,{empty:true,profile});let picker;next.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
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
 f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
 const pending=f.commands.get('zero.cloneRepository')();await ready;await f.commands.get('zero.cloneRepository')();assert.equal(attempts,1);cancel();await pending;
 assert.equal(signal.aborted,true);assert.deepEqual(f.errors,[]);assert.equal(f.startState.busy,false);
 await f.commands.get('zero.cloneRepository')();assert.equal(attempts,2);assert.equal(notifications,2);
});
test('tutorial creation and its authenticated clone share one cancellable native notification',async t=>{
 const notifications=[];const f=await fixture(t,{empty:true,pick:async(items,options)=>options.title==='Start tutorial'?items[0]:assert.fail('Unexpected picker: '+options.title),clone:async({parentPath,signal})=>{assert.equal(signal.aborted,false);return path.join(parentPath,'my-project');}});
 f.vscode.ProgressLocation={Notification:15};f.vscode.window.withProgress=async(options,run)=>{notifications.push(options);return run({report(){}},{onCancellationRequested:()=>disposable()});};
 f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.startProject')();assert.equal(notifications.length,2);assert.equal(notifications[0].title,'Checking GitHub setup');assert.equal(notifications[1].cancellable,true);assert.equal(f.calls.filter(c=>c[0]==='createRepository').length,1);assert.equal(f.calls.filter(c=>c[0]==='cloneRepository').length,1);assert.deepEqual(f.errors,[]);
});
test('extension disposal aborts the pending clone and prevents opening its late result',async t=>{
 let entered,signal;const ready=new Promise(resolve=>{entered=resolve;});
 const f=await fixture(t,{empty:true,clone:async options=>{signal=options.signal;return new Promise(resolve=>{signal.addEventListener('abort',()=>resolve(path.join(options.parentPath,'late-project')),{once:true});entered();});}});
 f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});const pending=f.commands.get('zero.cloneRepository')();await ready;f.subscriptions.forEach(item=>item.dispose());await pending;
 assert.equal(signal.aborted,true);assert.equal(f.calls.filter(c=>c[0]==='vscode.openFolder').length,0);
});

test('one Run/Stop button cancels native preparation and stays Stopping until the save settles',async t=>{
  const f=await fixture(t,{lesson:false});let release;
  f.vscode.workspace.saveAll=()=>new Promise(resolve=>{release=()=>resolve(true);});
  const running=f.commands.get('zero.runApp')();
  assert.match(f.webview.html,/data-command="zero.toggleApp"[^>]*>[\s\S]*Stop<\/button>/);
  await settle(()=>release);
  const stopping=f.commands.get('zero.toggleApp')(),again=f.commands.get('zero.toggleApp')();
  assert.match(f.webview.html,/data-command="zero.toggleApp" aria-disabled="true">[\s\S]*Stopping…<\/button>/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.webview.html,/Stopping…<\/button>/);
  release();await Promise.all([running,stopping,again]);
  assert.equal(f.launches.length,0);assert.match(f.webview.html,/Run<\/button>/);
  assert.equal((f.webview.html.match(/data-command="zero.toggleApp"/g)||[]).length,1);
});

test('saved ready session skips setup without interactive sign-in and exposes tutorial or original project',async t=>{
  const f=await fixture(t,{empty:true,zeroLaunch:true,initialSession:{id:'saved',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'}});
  await settle(()=>f.startState?.phase==='ready');
  assert.equal(f.startState.accountId,'17');assert.equal(f.startState.accountLabel,'student');assert.doesNotMatch(f.webview.html,/data-command="zero.newProject"|data-command="zero.startProject"/);assert.equal(f.authCalls.filter(call=>call.options.createIfNone).length,0);assert.equal(f.notices.length,0);
  assert.equal(f.calls.filter(([id])=>id==='createRepository'||id==='openExternal').length,0);
});
test('sign-in leads to install button; explicit install opens GitHub and only readiness unlocks tutorials',async t=>{
  let allowed=false,accept,hide,picker;
  const f=await fixture(t,{empty:true,githubAccess:async()=>{if(!allowed)throw Object.assign(Error('Install Zero for GitHub.'),{code:'installation-required',actionUrl:'https://github.com/apps/codepet-zero/installations/new'});}});
  f.vscode.window.createQuickPick=()=>picker={selectedItems:[],show(){},dispose(){},onDidAccept:fn=>{accept=fn;return disposable();},onDidHide:fn=>{hide=fn;return disposable();}};
  f.setInteractiveSession({id:'student',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});await f.commands.get('zero.signInToGitHub')();
  assert.equal(f.startState.phase,'install');assert.equal(f.startState.accountId,'17');assert.doesNotMatch(f.webview.html,/zero.startProject|zero.newProject|zero.chooseRepository/);assert.equal(f.calls.filter(([id])=>id==='openExternal').length,0);
  const cancelled=f.commands.get('zero.setupGitHub')();await settle(()=>hide);hide();await cancelled;await settle(()=>f.startState?.phase==='install');
  hide=undefined;const installing=f.commands.get('zero.setupGitHub')();await settle(()=>hide&&f.calls.filter(([id])=>id==='openExternal').length>=2);
  allowed=true;picker.selectedItems=picker.items.filter(item=>item.action==='check');accept();await installing;
  assert.equal(f.startState.phase,'ready');assert.equal(f.startState.busy,false);assert.equal(f.calls.filter(([id])=>id==='createRepository'||id==='cloneRepository').length,0);
});
test('offline readiness stays retryable while local Run and Files remain available',async t=>{
  let reachable=false;const f=await fixture(t,{initialSession:{id:'saved',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'},githubAccess:async()=>{if(!reachable)throw Error('Network unavailable');}});
  await settle(()=>f.webview.html.includes('GitHub setup')&&f.webview.html.includes('zero.toggleApp'));
  await f.commands.get('zero.startPage')();await settle(()=>f.startState?.phase==='unavailable');assert.equal(f.startState.accountId,'17');
  assert.match(f.webview.html,/zero.toggleApp/);assert.match(f.webview.html,/>New/);assert.doesNotMatch(f.webview.html,/role="tree"|id="files"/);assert.doesNotMatch(f.webview.html,/zero.chooseRepository|zero.uploadToGitHub/);
  reachable=true;await f.commands.get('zero.setupGitHub')();assert.equal(f.startState.phase,'ready');assert.match(f.webview.html,/zero.chooseRepository/);
});

test('Clone picker seeds the current project as a recent and opens it without duplicating its clone',async t=>{
 const profile=new Map();const f=await fixture(t,{empty:false,profile,initialSession:{id:'saved',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'}});
 await settle(()=>profile.get('zero.recentProjects.v1:17')?.length);
 const prior=f.vscode.window.createQuickPick;
 f.vscode.window.createQuickPick=()=>{
  const events={accept:new Set(),hide:new Set()};const event=name=>fn=>{events[name].add(fn);return {dispose:()=>events[name].delete(fn)};};
  const q={items:[],selectedItems:[],activeItems:[],onDidAccept:event('accept'),onDidHide:event('hide'),dispose(){},show(){
   assert.equal(q.title,'Clone from GitHub');assert.equal(q.items[0].label,'Recent projects');
   q.selectedItems=[q.items.find(item=>item.action==='recent')];queueMicrotask(()=>{for(const fn of events.accept)fn();});
  }};return q;
 };
 const before=f.calls.length;await f.commands.get('zero.cloneRepository')();f.vscode.window.createQuickPick=prior;
 assert.ok(f.calls.slice(before).some(([command,uri])=>command==='vscode.openFolder'&&uri.fsPath===f.root));assert.equal(f.calls.filter(([command])=>command==='cloneRepository').length,0);
});


test('account drift cannot publish an old ready state or reuse its Start Page action token',async t=>{
  let release,checks=0;
  const f=await fixture(t,{empty:true,initialSession:{id:'first',account:{id:'17',label:'student'},accessToken:'MOCK_FIRST'},githubAccess:async()=>{if(++checks===1)await new Promise(resolve=>{release=resolve;});}});
  await settle(()=>release&&f.startState?.phase==='checking');
  const oldToken=f.startPage.restored.token;
  f.setSession({id:'second',account:{id:'18',label:'other-student'},accessToken:'MOCK_SECOND'});
  await settle(()=>f.startState?.phase==='ready'&&f.startState.accountId==='18');
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(!f.startPage.messages.some(message=>message.state.phase==='ready'&&message.state.accountId==='17'));
  await f.startPage.message({type:'action',action:'tutorial',token:oldToken});
  assert.equal(f.calls.filter(([id])=>id==='zero.startProject'||id==='createRepository'||id==='cloneRepository').length,0);
  assert.equal(f.startState.accountLabel,'other-student');assert.equal(f.startState.busy,false);
});

test('native folder-open veto keeps creation recovery until the matching workspace is active',async t=>{
 const profile=new Map();let created;
 const git=core.git;t.mock.method(core,'git',async(root,args,...rest)=>args.join(' ')==='remote get-url origin'?'https://github.com/student/my-project':git(root,args,...rest));
 const f=await fixture(t,{empty:true,profile,initialSession:{id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'},clone:async({parentPath})=>{
  created=path.join(parentPath,'my-project');await fs.mkdir(created);await fs.writeFile(path.join(created,'zero.json'),'{}');await fs.writeFile(path.join(created,'mvnw'),'');return created;
 }});
 await settle(()=>f.startState?.phase==='ready');await f.commands.get('zero.newProject')();
 assert.equal(f.vscode.workspace.workspaceFolders.length,0,'Resolved openFolder can leave the current workspace untouched');
 assert.equal(profile.get('zero.repositoryCreationRecovery').stage,'created');
 assert.ok(f.calls.some(([command,uri,options])=>command==='vscode.openFolder'&&uri.fsPath===created&&options.forceReuseWindow));
 f.vscode.workspace.workspaceFolders=[{uri:{fsPath:created}}];f.folderChanged();
 await settle(()=>profile.get('zero.repositoryCreationRecovery')===undefined);
 assert.deepEqual(f.errors,[]);
});

test('active-workspace recovery acknowledgement requires its exact account, repository and completed creation',async t=>{
 const git=core.git;t.mock.method(core,'git',async(root,args,...rest)=>args.join(' ')==='remote get-url origin'?'https://github.com/student/my-project':git(root,args,...rest));
 for(const record of [
  {accountId:'18',repositoryUrl:'https://github.com/student/my-project',stage:'created'},
  {accountId:'17',repositoryUrl:'https://github.com/student/other-project',stage:'created'},
  {accountId:'17',repositoryUrl:'https://github.com/student/my-project',stage:'creating'},
  {accountId:'17',repositoryUrl:'https://github.com/student/my-project',stage:'created',projectRoot:'/another/project'}
 ]) {
  const profile=new Map([['zero.repositoryCreationRecovery',record]]);
  const f=await fixture(t,{profile,initialSession:{id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'}});
  await settle(()=>profile.has('zero.recentProjects.v1:17'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(profile.get('zero.repositoryCreationRecovery'),record);
  f.subscriptions.forEach(item=>item.dispose());
 }
});

test('stale tutorial evidence blocks the editor flow before forms or repository creation',async t=>{
 let inputs=0;const f=await fixture(t,{empty:true,staleTutorials:true,pick:async items=>items[0],input:async()=>{inputs++;return 'unused';}});
 f.setInteractiveSession({id:'app',account:{id:'17',label:'student'},accessToken:'MOCK_ONLY'});
 await f.commands.get('zero.startProject')();
 assert.match(f.errors.at(-1),/has not been verified/);assert.equal(inputs,0);
 assert.equal(f.calls.some(([id])=>['createRepository','cloneRepository','vscode.openFolder'].includes(id)),false);
});

test('student explorer is the first Zero sidebar and migrates a previously introduced workspace once',async t=>{
 const remembered=new Map([['zero.explorerShown',true]]),f=await fixture(t,{studentExplorer:true,remembered,activeEditor:true});
 await settle(()=>remembered.get('zero.studentExplorerShown')===true);
 const shown=f.calls.filter(([id])=>['workbench.view.extension.zero-student-explorer','zero.studentControls.focus'].includes(id));
 assert.deepEqual(shown.map(([id])=>id),['workbench.view.extension.zero-student-explorer','zero.studentControls.focus']);
 assert.ok(!f.calls.some(([id])=>id==='showTextDocument'),'Migration preserves the current editor');
 assert.ok(!f.calls.some(([id])=>id==='zero.controls.focus'));
});
test('an explicit standard Explorer preference does not get migrated to the student sidebar',async t=>{
 const remembered=new Map([['zero.explorerShown',true],['zero.sidebarShown',true],['zero.studentExplorerPreview',false]]),f=await fixture(t,{studentExplorer:true,remembered,activeEditor:true});
 await f.commands.get('zero.showSidebar')();
 assert.deepEqual(f.calls.slice(-2).map(([id])=>id),['workbench.view.explorer','zero.controls.focus']);
 assert.ok(!f.calls.some(([id])=>id==='workbench.view.extension.zero-student-explorer'));
 assert.equal(remembered.has('zero.studentExplorerShown'),false);
});
