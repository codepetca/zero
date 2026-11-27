'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {createGameJamProjectOpener} = require('../src/game-jam-project');
const exec = promisify(execFile);
const url = 'https://github.com/student/game';
async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-jam-project-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let remoteHead,compare=async()=>null;
  const head=async dir=>(await exec('git',['-C',dir,'rev-parse','HEAD'])).stdout.trim();
  async function repo(name,origin) {
    const dir=path.join(root,name);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'zero.json'),'{}');
    await exec('git',['init','-q',dir]);
    await exec('git',['-C',dir,'-c','user.name=Zero Test','-c','user.email=test@example.com','-c','commit.gpgsign=false','commit','--allow-empty','-qm',name]);
    await exec('git',['-C',dir,'remote','add','origin',origin]);
    if(origin===url || origin===url+'.git')remoteHead=await head(dir);
    return dir;
  }
  let current,items=[],choice,valid=true,lists=0,repositoryId=12;const opened=[],cloned=[];
  const ticket={session:{accountId:'17'}};
  const authentication={assertCurrent:async value=>{assert.equal(value,ticket);if(!valid)throw Error('account changed');}};
  const vscode={window:{showInformationMessage:async()=>choice}};
  const projectFolders={openLocal:async input=>{await input.assertCurrent();opened.push(input.projectPath);},clone:async input=>{await input.assertCurrent();assert.equal(input.expectedRepositoryId,'12');cloned.push(input.repositoryUrl);return '/cloned';}};
  const opener=createGameJamProjectOpener({vscode,authentication,repositories:{
    readOwnedRepository:async()=>({id:repositoryId,private:false,default_branch:'main'}),
    readRepositoryBranchHead:async(destination,{branch})=>{assert.equal(destination,url);assert.equal(branch,'main');return remoteHead;},
    compareCommits:(...args)=>compare(...args)
  },project:async()=>current,recentProjects:{list:async()=>{lists++;return items;}},projectFolders});
  return {repo,head,ticket,opener,opened,cloned,set remoteHead(v){remoteHead=v;},set compare(v){compare=v;},set current(v){current=v;},set items(v){items=v;},set choice(v){choice=v;},set valid(v){valid=v;},set repositoryId(v){repositoryId=v;},get lists(){return lists;},vscode,projectFolders};
}
const open=f=>f.opener.openGameJamProject({repositoryUrl:url,repositoryId:'12',ticket:f.ticket});
test('keeps the matching current project without listing recent projects',async t=>{const f=await fixture(t);f.current=await f.repo('current',url+'.git');assert.equal((await open(f)).status,'current');assert.equal(f.lists,0);});
test('checks actual origin and opens a verified recent copy',async t=>{const f=await fixture(t);const stale=await f.repo('stale','https://github.com/student/other');const match=await f.repo('match',url);f.items=[{path:stale,repositoryUrl:url},{path:'/missing',repositoryUrl:url},{path:match,repositoryUrl:'https://github.com/student/other'}];assert.equal((await open(f)).status,'open-requested');assert.deepEqual(f.opened,[match]);});
test('uses a recent copy if the current project pushes to a different repository',async t=>{
  const f=await fixture(t);
  const current=await f.repo('current',url),recent=await f.repo('recent',url);
  await exec('git',['-C',current,'remote','set-url','--push','origin','https://github.com/student/other']);
  f.current=current;f.items=[{path:recent}];
  assert.equal((await open(f)).status,'open-requested');
  assert.deepEqual(f.opened,[recent]);
});
test('opens a previously linked checkout with the older student-template layout',async t=>{
  const f=await fixture(t),gitRoot=await f.repo('legacy',url);
  const projectPath=path.join(gitRoot,'student-template');
  await fs.mkdir(projectPath);
  await fs.rename(path.join(gitRoot,'zero.json'),path.join(projectPath,'zero.json'));
  f.items=[{path:projectPath}];
  assert.equal((await open(f)).status,'open-requested');
  assert.deepEqual(f.opened,[projectPath]);
});
test('clone requires an explicit choice and uses the selected repository',async t=>{const f=await fixture(t);assert.equal((await open(f)).status,'cancelled');assert.deepEqual(f.cloned,[]);f.choice='Clone & open';assert.equal((await open(f)).status,'clone-requested');assert.deepEqual(f.cloned,[url]);});
test('account drift after the prompt blocks cloning',async t=>{const f=await fixture(t);f.vscode.window.showInformationMessage=async()=>{f.valid=false;return 'Clone & open';};await assert.rejects(open(f),/account changed/);assert.deepEqual(f.cloned,[]);});
test('rechecks the origin at the open boundary',async t=>{const f=await fixture(t);const dir=await f.repo('recent',url);f.items=[{path:dir}];f.projectFolders.openLocal=async input=>{await exec('git',['-C',dir,'remote','set-url','origin','https://github.com/student/other']);await input.assertCurrent();};await assert.rejects(open(f),/repository changed/);});
test('rejects non GitHub destinations before any lookup',async t=>{const f=await fixture(t);await assert.rejects(f.opener.openGameJamProject({repositoryUrl:'https://example.com/student/game',ticket:f.ticket}),/github/i);assert.equal(f.lists,0);});

test('recovery checks a preferred local path even when it is not recent',async t=>{const f=await fixture(t);const dir=await f.repo('recovered',url);const result=await f.opener.openGameJamProject({repositoryUrl:url,repositoryId:'12',ticket:f.ticket,preferredPath:dir});assert.equal(result.status,'open-requested');assert.deepEqual(f.opened,[dir]);});

test('a checkout whose origin now names a different GitHub repository is left closed',async t=>{
  const f=await fixture(t);
  f.items=[{path:await f.repo('recent',url)}];
  f.repositoryId=34;
  await assert.rejects(open(f),/repository changed/);
  assert.deepEqual(f.opened,[]);
});

test('a reused GitHub URL cannot open a checkout from unrelated history',async t=>{
  const f=await fixture(t);
  const old=await f.repo('old',url),replacement=await f.repo('replacement',url);
  f.current=old;
  // A fetch may have updated the tracking ref while leaving the old files checked out.
  await exec('git',['-C',old,'fetch','-q',replacement,'HEAD:refs/remotes/origin/main']);
  f.items=[{path:old}];
  f.compare=async(destination,{base,head})=>{
    assert.equal(destination,url);
    assert.equal(base,await f.head(old));
    assert.equal(head,await f.head(replacement));
    return {outgoing:1,incoming:1};
  };
  assert.equal((await open(f)).status,'cancelled');
  assert.deepEqual(f.opened,[]);
  f.choice='Clone & open';
  assert.equal((await open(f)).status,'clone-requested');
  assert.deepEqual(f.cloned,[url]);
});

test('a feature branch can open after GitHub main advances beyond its local tracking commit',async t=>{
  const f=await fixture(t),dir=await f.repo('student',url);
  const base=await f.head(dir),head='b'.repeat(base.length);
  await exec('git',['-C',dir,'update-ref','refs/remotes/origin/main',base]);
  await exec('git',['-C',dir,'-c','user.name=Zero Test','-c','user.email=test@example.com','-c','commit.gpgsign=false','commit','--allow-empty','-qm','student work']);
  f.remoteHead=head;
  f.items=[{path:dir}];
  f.compare=async(destination,request)=>{
    assert.equal(destination,url);
    assert.equal(request.base,base);
    assert.equal(request.head,head);
    return {incoming:2,outgoing:0};
  };
  assert.equal((await open(f)).status,'open-requested');
  assert.deepEqual(f.opened,[dir]);
});
