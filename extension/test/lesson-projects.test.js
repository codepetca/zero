'use strict';
const {appSessions}=require('./fixtures/app-sessions');
const {textInputs} = require('./fixtures/text-input');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const lessons = require('../src/lesson-projects');
const core = require('../src/core');
const github = require('../src/github');
const workflow = require('../src/workflow');
const coreContract = require('../src/core-contract');
const sourceFiles = Object.fromEntries(coreContract.coreSourcePaths.map(name => [name,require('node:fs').readFileSync(path.resolve(__dirname,'../../framework',name))]));
const coreFiles = [...Object.entries(sourceFiles).map(([name,content])=>({path:name,content:content.toString('base64'),mode:420})),
  {path:'zero-core.json',content:Buffer.from(JSON.stringify(coreContract.makeCoreRecord(sourceFiles))).toString('base64'),mode:420}];
const sample = () => ({schema:2,projects:[['greeting','0','Greeting app'],['study','3','Study quiz'],['game','8','Coin game'],['pet','13','Animated pet']].map(([id,lesson,title])=>({id,lesson,title,folder:`zero-project-${id}`,template:null,files:[
  {path:'zero.json',content:Buffer.from(JSON.stringify({name:id,templateVersion:'0.1.0',mainClass:'Main',repositoryRequired:true,tutorialProjectId:id,lessonId:lesson})).toString('base64'),mode:420},
  {path:'.gitignore',content:Buffer.from('target/\n').toString('base64'),mode:420},
  {path:'.vscode/settings.json',content:Buffer.from('{"git.enabled":true}').toString('base64'),mode:420},
  {path:'src/main/java/Main.java',content:Buffer.from('class Main {}\n').toString('base64'),mode:420},
  ...coreFiles.map(file=>({...file}))
]}))});
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-lessons-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('bundle validation rejects traversal, bad base64, duplicate paths and false practice marker', () => {
  assert.equal(lessons.validateBundle(sample()).length,4);
  for(const unsafe of ['../secret','/secret','a/../../secret','a\\secret','.git/config','CON.txt','a:stream','trailing.','a/aux','bad?name','examples/Main.java','src/main/java/Question.java','src/main/resources/media-demo/player.png']) {
    const bundle=sample();bundle.projects[0].files[3].path=unsafe;
    assert.throws(()=>lessons.validateBundle(bundle));
  }
  const bad=sample();bad.projects[0].files[3].content='%%%';assert.throws(()=>lessons.validateBundle(bad));
  const duplicate=sample();duplicate.projects[0].files.push({...duplicate.projects[0].files[3]});assert.throws(()=>lessons.validateBundle(duplicate));
  const unignored=sample();unignored.projects[0].files[1].content=Buffer.from('*\n').toString('base64');assert.throws(()=>lessons.validateBundle(unignored));
  const marker=sample();marker.projects[0].files[0].content=Buffer.from('{"localOnly":false}').toString('base64');assert.throws(()=>lessons.validateBundle(marker));
  const missing=sample();missing.projects.pop();assert.throws(()=>lessons.validateBundle(missing));
  const wrongLesson=sample();wrongLesson.projects[1].lesson='4';assert.throws(()=>lessons.validateBundle(wrongLesson));
});
test('bundled projects retain a complete saved builder without executing it', async t => {
  const {projectBuilderFilesSync} = await import('../../scripts/prepare-project-builder.mjs');
  const builder = projectBuilderFilesSync().map(file => ({path:'.zero-build/' + file.path,content:file.bytes.toString('base64'),mode:420}));
  const bundle = sample();bundle.projects[0].files.push(...builder);
  const [project] = lessons.validateBundle(bundle), root = await temporary(t);
  const target = path.join(root,'saved-project');await lessons.createLessonProject(project,target);
  assert.deepEqual(await fs.readFile(path.join(target,'.zero-build/run.cjs')),Buffer.from(builder.find(file => file.path === '.zero-build/run.cjs').content,'base64'));
  for (const mode of ['missing','extra','changed','executable']) {
    const bad = structuredClone(bundle), files = bad.projects[0].files;
    const index = files.findIndex(file => file.path === '.zero-build/run.cjs');
    if (mode === 'missing') files.splice(index,1);
    if (mode === 'extra') files.push({path:'.zero-build/extra.js',content:Buffer.from('throw Error("must not execute")').toString('base64'),mode:420});
    if (mode === 'changed') files[index].content = Buffer.from('throw Error("must not execute")').toString('base64');
    if (mode === 'executable') files[index].mode = 493;
    assert.throws(() => lessons.validateBundle(bad));
  }
  const invalid = {...project,files:[...project.files,{path:'.zero-build/extra.js',content:Buffer.from(''),mode:420}]};
  const untouched = path.join(root,'untouched');await assert.rejects(lessons.createLessonProject(invalid,untouched));
  await assert.rejects(fs.stat(untouched),/ENOENT/);
});
test('creates an exclusive local folder, preserves existing content, rejects symlinks and Git ancestors', async t => {
  const root=await temporary(t),project=lessons.validateBundle(sample())[0],target=path.join(root,'practice');
  assert.equal(await lessons.createLessonProject(project,target),target);
  assert.equal(await fs.readFile(path.join(target,'src/main/java/Main.java'),'utf8'),'class Main {}\n');
  assert.equal(await lessons.isLocalPractice(target),false);
  await assert.rejects(lessons.createLessonProject(project,target),/EEXIST/);
  assert.equal(await fs.readFile(path.join(target,'src/main/java/Main.java'),'utf8'),'class Main {}\n');
  await assert.rejects(lessons.createLessonProject(project,path.join(root,'nested'),{forbiddenRoots:[root]}),/outside the current student project/);
  const symlink=path.join(root,'linked');await fs.symlink(root,symlink);
  await assert.rejects(lessons.createLessonProject(project,path.join(symlink,'practice')),/ordinary folder/);
  const gitParent=path.join(root,'git-parent');await fs.mkdir(gitParent);await fs.writeFile(path.join(gitParent,'.git'),'gitdir: elsewhere');
  await assert.rejects(lessons.createLessonProject(project,path.join(gitParent,'practice')),/outside a Git repository/);
  await assert.rejects(fs.stat(path.join(gitParent,'practice')),/ENOENT/);
});
test('failed materialization removes only files created by this operation', async t => {
  const root=await temporary(t),project=lessons.validateBundle(sample())[0];
  project.files.push({path:'src/main/java/Main.java',content:Buffer.from('other'),mode:420});
  const target=path.join(root,'practice');
  await assert.rejects(lessons.createLessonProject(project,target),/unsafe file/);
  await assert.rejects(fs.stat(target),/ENOENT/);
  await fs.writeFile(target,'student work');
  await assert.rejects(lessons.createLessonProject(project,target),/unsafe file/);
  assert.equal(await fs.readFile(target,'utf8'),'student work');
});
test('local practice blocks Git service entry points before Git or network calls', async t => {
  const root=await temporary(t);await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({localOnly:true,practiceProjectId:'greeting',lessonId:'0'}));
  let calls=0;const run=async()=>{calls++;throw new Error('Git called');};
  await assert.rejects(core.connectRepository(root,'https://github.com/student/app',async()=>true,run),/local lesson practice/i);
  await assert.rejects(core.assertRepositoryRoot(root,run),/local lesson practice/i);
  await assert.rejects(github.prepareUpload(root,run),/local lesson practice/i);
  await assert.rejects(workflow.prepareStart(root,'change',{run,networkRun:run}),/local lesson practice/i);
  await assert.rejects(workflow.prepareFinish(root,{run,networkRun:run}),/local lesson practice/i);
  assert.equal(calls,0);
  await fs.writeFile(path.join(root,'zero.json'),'{broken');
  assert.equal(await lessons.isLocalPractice(root),true);
  await assert.rejects(core.connectRepository(root,'https://github.com/student/app',async()=>true,run),/local lesson practice/i);
  assert.equal(calls,0);
});

test('local practice sharing commands stop before authentication, saves, Git or external pages; native diagnostic run remains local', async t => {
  const Module=require('node:module');
  const root=await temporary(t);await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({localOnly:true,practiceProjectId:'greeting',lessonId:'0'}));await fs.writeFile(path.join(root,'mvnw'),'');
  const commands=new Map(),errors=[];let authCalls=0,saves=0,external=0,launches=0;const repositoryPicks=[];
  const disposable=()=>({dispose(){}});
  const appProvider={dispose(){},async removeSession(){assert.fail('Local practice must not remove a GitHub session');}};
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);assert.equal(options.silent,true);authCalls++;return null;},onDidChangeSessions:disposable,registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.equal(provider,appProvider);assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();}},
    workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,textDocuments:[]},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showErrorMessage:async text=>{errors.push(text);},showInformationMessage:async()=>{},showQuickPick:async items=>{repositoryPicks.push(items);}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable,executeTask:async task=>{launches++;return {task,terminate(){}};}},
    Task:class{constructor(definition,scope,name,source,execution){Object.assign(this,{definition,scope,name,source,execution});}},TaskScope:{Workspace:1},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:1},ProcessExecution:class{constructor(command,args){Object.assign(this,{command,args});}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    env:{openExternal:async()=>{external++;return true;}},Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?textInputs(vscode):originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];t.after(()=>subscriptions.forEach(item=>item.dispose()));
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}},extensionPath:path.resolve(__dirname,'..')},{provider:appSessions(vscode,appProvider)});
  await commands.get('zero.chooseRepository')();assert.equal(repositoryPicks.length,0,'Signed-out practice hides the project menu');
  for(const id of ['zero.switchBranch','zero.connectRepository','zero.createRepository','zero.uploadToGitHub','zero.startChange','zero.finishChange','zero.extractLibrary','zero.shareGame','zero.shareLibrary']) {
    await commands.get(id)();assert.match(errors.at(-1),/local lesson practice/i,id);
  }
  assert.equal(saves,0);assert.equal(external,0);assert.equal(authCalls,1,'Only activation may inspect native sign-in silently');
  await fs.writeFile(path.join(root,'zero.json'),'{broken');
  await commands.get('zero.openFirstLesson')();
  assert.equal(external,1,'Tutorial Docs remains available when the project marker is damaged');
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({localOnly:true,lessonId:0}));
  await commands.get('zero.openFirstLesson')();assert.equal(external,2);
  await fs.writeFile(path.join(root,'zero.json'),'{broken');
  await commands.get('zero.shareGame')();assert.match(errors.at(-1),/local lesson practice/i);
  await commands.get('zero.runNativeApp')();assert.match(errors.at(-1),/zero.json is damaged/);assert.equal(launches,0);
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({tutorialProjectId:'greeting',lessonId:'0',repositoryRequired:true}));
  const beforeSaves=saves;
  for(const id of ['zero.runApp','zero.runNativeApp','zero.exportWeb']) {
    await commands.get(id)();assert.match(errors.at(-1),/own standalone Git repository.*Git: Clone/,id);
  }
  assert.equal(launches,0);assert.equal(saves,beforeSaves,'Tutorial compilation gates precede saves/builds');
  for(const id of ['zero.shareGame','zero.shareLibrary']) {
    await commands.get(id)();assert.match(errors.at(-1),/separate original project/,id);
  }
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({localOnly:true,lessonId:'0'}));
  await commands.get('zero.runNativeApp')();assert.equal(launches,1);
});

test('Start project cancels cleanly and creates only from verified tutorial metadata through the App', async t => {
  const Module=require('node:module'),root=await temporary(t),media=path.join(root,'media');await fs.mkdir(media);
  const bundle=sample(),bundlePath=path.join(media,'lesson-projects.json');await fs.writeFile(bundlePath,JSON.stringify(bundle));
  const commands=new Map(),opened=[],errors=[],creates=[],clones=[],authCalls=[],dialogs=[];let choose=false,name='my-greeting',location=true;
  const disposable=()=>({dispose(){}}),session={id:'app',account:{id:'student',label:'student'},accessToken:'MOCK_ONLY',scopes:[]};
  const vscode={
    authentication:{getSession:async(provider,scopes,options)=>{authCalls.push({provider,scopes,options});return session;},onDidChangeSessions:disposable,registerAuthenticationProvider:(id,label)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');return disposable();}},
    workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showQuickPick:async(items,options)=>options.title==='Start tutorial'?(choose?items[0]:undefined):assert.fail('Unexpected picker: '+options.title),showInputBox:async()=>name,showOpenDialog:async options=>{dialogs.push(options);return location?[{fsPath:root}]:undefined;},showErrorMessage:async text=>errors.push(text),showInformationMessage:async()=>undefined},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async(id,uri,options)=>{if(['workbench.view.explorer','zero.controls.focus'].includes(id))return;assert.equal(id,'vscode.openFolder');opened.push({uri,options});}},
    env:{openExternal:async()=>{throw Error('Tutorial repository creation must use the App');}},Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  require('./fixtures/start-page-panel').startPagePanels(vscode);
  const filename=require.resolve('../src/extension'),oldCache=require.cache[filename],originalLoad=Module._load;delete require.cache[filename];Module._load=function(id,...args){if(id==='vscode')return textInputs(vscode);if(id==='./project-folders'){const mod=originalLoad.call(this,id,...args);return {createProjectFolders:(api,options)=>mod.createProjectFolders(api,{...options,home:root})};}return originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];t.after(()=>{subscriptions.forEach(item=>item.dispose());delete require.cache[filename];if(oldCache)require.cache[filename]=oldCache;});
  const profile=new Map();extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}},globalState:{get:key=>profile.get(key),update:async(key,value)=>profile.set(key,value)},extensionPath:root},{provider:appSessions(vscode,{dispose(){},async removeSession(){}}),repositories:{async checkSetup(){},async create(input,{ticket}){creates.push({input,account:ticket.session.accountId});return {repository:{html_url:'https://github.com/student/my-greeting'}};}},cloneRepository:async input=>{assert.ok(input.signal instanceof AbortSignal);assert.equal(input.signal.aborted,false);const {signal,...reviewed}=input;clones.push(reviewed);return path.join(root,'my-greeting');}});
  await commands.get('zero.startProject')();assert.equal(errors.length,0);assert.equal(creates.length,0);assert.equal(opened.length,0);
  choose=true;await commands.get('zero.startProject')();assert.match(errors.at(-1),/not published yet/);assert.equal(creates.length,0);assert.equal(opened.length,0);
  bundle.projects[0].template={repository:'codepetca/zero-tutorial-greeting',repositoryUrl:'https://github.com/codepetca/zero-tutorial-greeting',templateHref:'https://github.com/codepetca/zero-tutorial-greeting/generate'};await fs.writeFile(bundlePath,JSON.stringify(bundle));
  await commands.get('zero.startProject')();assert.match(errors.at(-1),/not been verified/);assert.equal(creates.length,0);assert.equal(opened.length,0);
  bundle.projects[0].template.scaffoldSha256=require('../src/tutorial-template-readiness').tutorialScaffoldSha256(bundle.projects[0].files);await fs.writeFile(bundlePath,JSON.stringify(bundle));
  name=undefined;await commands.get('zero.startProject')();assert.equal(creates.length,0);
  name='my-greeting';location=false;await commands.get('zero.startProject')();assert.equal(creates.length,0);
  location=true;const beforeErrors=errors.length;await commands.get('zero.startProject')();assert.equal(errors.length,beforeErrors);
  assert.deepEqual(creates,[{input:{name:'my-greeting',private:false,template:{owner:'codepetca',repo:'zero-tutorial-greeting'}},account:'student'}]);
  assert.deepEqual(clones,[{repositoryUrl:'https://github.com/student/my-greeting',parentPath:root}]);assert.deepEqual(opened,[{uri:{fsPath:path.join(root,'my-greeting')},options:{forceReuseWindow:true}}]);assert.equal(profile.get('zero.repositoryCreationRecovery').stage,'created');assert.ok(dialogs.every(dialog=>dialog.canSelectFolders&&!dialog.canSelectFiles));
  assert.ok(authCalls.every(call=>call.provider==='zero-github'&&call.scopes.length===0&&call.options.silent),'Activation and captured App sessions stay silent when already connected');
  bundle.projects[0].template.templateHref='https://github.com/attacker/template/generate';await fs.writeFile(bundlePath,JSON.stringify(bundle));
  await commands.get('zero.startProject')();assert.match(errors.at(-1),/invalid published template metadata/);assert.equal(creates.length,1);assert.equal(clones.length,1);
});

test('lesson core record is required and bound to the actual included helper bytes',()=>{
 const missing=sample();missing.projects[0].files=missing.projects[0].files.filter(file=>file.path!=='zero-core.json');
 assert.throws(()=>lessons.validateBundle(missing),/core record/);
 const drift=sample(),file=drift.projects[0].files.find(file=>file.path===coreContract.coreSourcePaths[0]);file.content=Buffer.from('changed').toString('base64');
 assert.throws(()=>lessons.validateBundle(drift),/differs/);
 const forged=sample(),manifest=forged.projects[0].files.find(file=>file.path==='zero-core.json');const value=JSON.parse(Buffer.from(manifest.content,'base64'));value.sourceSha256='a'.repeat(64);manifest.content=Buffer.from(JSON.stringify(value)).toString('base64');
 assert.throws(()=>lessons.validateBundle(forged),/mismatched/);
});

test('legacy tutorial markers and Pet retain their exact entry while an own project remains original',async t=>{
 const root=await temporary(t);
 for(const [id,lesson] of Object.entries({greeting:'0',study:'3',game:'8',pet:'13'})) {
  const marker={tutorialProjectId:id,repositoryRequired:true,lessonId:lesson};
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify(marker));
  assert.deepEqual(await lessons.tutorialMarker(root),marker);
  await assert.rejects(lessons.assertOriginalProject(root),/separate original project/);
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({...marker,lessonId:'14'}));
  await assert.rejects(lessons.tutorialMarker(root),/invalid tutorial repository marker/);
 }
 await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({name:'My own game',mainClass:'Main'}));
 assert.equal(await lessons.tutorialMarker(root),null);
 await assert.doesNotReject(lessons.assertOriginalProject(root));
 const unexpected=sample();unexpected.projects.push({...unexpected.projects[3],id:'own-project',lesson:'14'});
 assert.throws(()=>lessons.validateBundle(unexpected));
});
