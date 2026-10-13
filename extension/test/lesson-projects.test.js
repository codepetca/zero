'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const lessons = require('../src/lesson-projects');
const core = require('../src/core');
const github = require('../src/github');
const workflow = require('../src/workflow');
const sample = () => ({schema:1,projects:[{id:'0',lesson:'0',title:'Hello',folder:'zero-lesson-0',files:[
  {path:'zero.json',content:Buffer.from(JSON.stringify({name:'Hello',templateVersion:'0.1.0',mainClass:'Main',localOnly:true,lessonId:'0'})).toString('base64'),mode:420},
  {path:'.gitignore',content:Buffer.from('*\n').toString('base64'),mode:420},
  {path:'src/main/java/Main.java',content:Buffer.from('class Main {}\n').toString('base64'),mode:420}
]}]});
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-lessons-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('bundle validation rejects traversal, bad base64, duplicate paths and false practice marker', () => {
  assert.equal(lessons.validateBundle(sample()).length,1);
  for(const unsafe of ['../secret','/secret','a/../../secret','a\\secret','.git/config','CON.txt','a:stream','trailing.','a/aux','bad?name']) {
    const bundle=sample();bundle.projects[0].files[2].path=unsafe;
    assert.throws(()=>lessons.validateBundle(bundle));
  }
  const bad=sample();bad.projects[0].files[2].content='%%%';assert.throws(()=>lessons.validateBundle(bad));
  const duplicate=sample();duplicate.projects[0].files.push({...duplicate.projects[0].files[2]});assert.throws(()=>lessons.validateBundle(duplicate));
  const unignored=sample();unignored.projects[0].files[1].content=Buffer.from('*.class\n').toString('base64');assert.throws(()=>lessons.validateBundle(unignored));
  const marker=sample();marker.projects[0].files[0].content=Buffer.from('{"localOnly":false}').toString('base64');assert.throws(()=>lessons.validateBundle(marker));
});
test('creates an exclusive local folder, preserves existing content, rejects symlinks and Git ancestors', async t => {
  const root=await temporary(t),project=lessons.validateBundle(sample())[0],target=path.join(root,'practice');
  assert.equal(await lessons.createLessonProject(project,target),target);
  assert.equal(await fs.readFile(path.join(target,'src/main/java/Main.java'),'utf8'),'class Main {}\n');
  assert.equal(await lessons.isLocalPractice(target),true);
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
  await assert.rejects(lessons.createLessonProject(project,target),/EEXIST/);
  await assert.rejects(fs.stat(target),/ENOENT/);
  await fs.writeFile(target,'student work');
  await assert.rejects(lessons.createLessonProject(project,target),/EEXIST/);
  assert.equal(await fs.readFile(target,'utf8'),'student work');
});
test('local practice blocks Git service entry points before Git or network calls', async t => {
  const root=await temporary(t);await fs.writeFile(path.join(root,'zero.json'),Buffer.from(sample().projects[0].files[0].content,'base64'));
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

test('local practice commands stop before authentication, saves, Git or external pages', async t => {
  const Module=require('node:module');
  const root=await temporary(t);await fs.writeFile(path.join(root,'zero.json'),Buffer.from(sample().projects[0].files[0].content,'base64'));
  const commands=new Map(),errors=[];let authCalls=0,saves=0,external=0;
  const disposable=()=>({dispose(){}});
  const vscode={
    authentication:{getSession:async()=>{authCalls++;return null;},onDidChangeSessions:disposable},
    workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,textDocuments:[]},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showErrorMessage:async text=>{errors.push(text);},showInformationMessage:async()=>{},showQuickPick:async()=>{throw new Error('picker opened');}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    env:{openExternal:async()=>{external++;return true;}},Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];t.after(()=>subscriptions.forEach(item=>item.dispose()));
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}},extensionPath:path.resolve(__dirname,'..')});
  for(const id of ['zero.chooseRepository','zero.connectRepository','zero.createRepository','zero.uploadToGitHub','zero.startChange','zero.finishChange','zero.extractLibrary','zero.shareGame','zero.shareLibrary']) {
    await commands.get(id)();assert.match(errors.at(-1),/local lesson practice/i,id);
  }
  assert.equal(saves,0);assert.equal(external,0);assert.equal(authCalls,1,'Only activation may inspect native sign-in silently');
});

test('Start lesson works without a workspace and opens only the freshly created folder in a new window', async t => {
  const Module=require('node:module'),root=await temporary(t),media=path.join(root,'media');await fs.mkdir(media);
  await fs.writeFile(path.join(media,'lesson-projects.json'),JSON.stringify(sample()));
  const commands=new Map(),opened=[];let choose=false,save=false;
  const disposable=()=>({dispose(){}});
  const vscode={
    authentication:{getSession:async()=>null,onDidChangeSessions:disposable},
    workspace:{workspaceFolders:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showQuickPick:async items=>choose?items[0]:undefined,showSaveDialog:async()=>save?{fsPath:path.join(root,'new-lesson')}:undefined,showErrorMessage:async text=>{throw new Error(text);}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async(...args)=>{opened.push(args);}},
    Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];t.after(()=>subscriptions.forEach(item=>item.dispose()));extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}},extensionPath:root});
  await commands.get('zero.startLesson')();choose=true;await commands.get('zero.startLesson')();
  await assert.rejects(fs.stat(path.join(root,'new-lesson')),/ENOENT/);
  save=true;await commands.get('zero.startLesson')();
  assert.equal(await lessons.isLocalPractice(path.join(root,'new-lesson')),true);
  assert.deepEqual(opened.at(-1),['vscode.openFolder',{fsPath:path.join(root,'new-lesson')},true]);
  assert.equal(opened.filter(call=>call[0]==='vscode.openFolder').length,1);
});
