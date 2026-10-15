'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const core=require('../src/core'),github=require('../src/github');
const {publishingFiles}=require('../src/web-publish-github');
const disposable=()=>({dispose(){}});
async function harness(t,{kit=true,workflowAvailable=true,cancel=false,workflowAccount='1',mode,confirm=true,practice=false}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-upload-auth-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify(practice?{localOnly:true}:{}));
  if(kit)for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
  const commands=new Map(),calls=[],errors=[],notices=[],listeners=new Set();let saves=0,reviews=0,uploads=0,disposed=0,inputs=0,failPush=false;
  const originalGit=core.git,originalPrepare=github.prepareUpload,originalUpload=github.uploadPrepared;
  core.git=async(_,args)=>{if(args[0]==='rev-parse')return root;if(args[0]==='remote')return 'https://github.com/student/app.git';if(args[0]==='symbolic-ref')return 'main';throw Error('Unexpected Git command in mocked native UI');};
  const plan={root,page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch:'main',head:'b'.repeat(40),status:'',summary:'No file changes; retry already committed branch',changes:[]};
  github.prepareUpload=async()=>{reviews++;return plan;};
  github.uploadPrepared=async(reviewed,message,options)=>{uploads++;assert.equal(reviewed,plan);const session=await options.beforeUpload();assert.deepEqual(session.scopes,kit?['repo','workflow']:['repo']);if(failPush){failPush=false;throw Error('GitHub transport failed. Your local commit is preserved.');}return {head:plan.head,branch:'main',uploaded:true};};
  const vscode={authentication:{getSession:async(provider,scopes,options)=>{
    calls.push({provider,scopes,options});const workflow=scopes.includes('workflow');
    if(workflow&&!workflowAvailable){if(!options.createIfNone||cancel)return undefined;workflowAvailable=true;}
    return {id:workflow?'workflow-session':'repo-session',account:{id:workflow?workflowAccount:'1',label:'student'},accessToken:workflow?'WORKFLOW_TEST_ONLY':'REPO_TEST_ONLY',scopes:[...scopes]};
  },onDidChangeSessions:listener=>{listeners.add(listener);return {dispose(){disposed++;listeners.delete(listener);}};}},
  workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?(mode??fallback):fallback}),saveAll:async()=>{saves++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
  window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showWarningMessage:async text=>notices.push(text),showInformationMessage:async(text,options)=>{notices.push(text);if(options?.modal&&confirm)return 'Commit & Upload';},showInputBox:async()=>{inputs++;return 'Retry my uploaded source';},showErrorMessage:async text=>errors.push(text)},
  tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}};
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}});await new Promise(resolve=>setImmediate(resolve));
  t.after(()=>{subscriptions.forEach(item=>item.dispose());core.git=originalGit;github.prepareUpload=originalPrepare;github.uploadPrepared=originalUpload;delete require.cache[require.resolve('../src/extension')];});
  return {commands,calls,errors,notices,get saves(){return saves;},get inputs(){return inputs;},get reviews(){return reviews;},get uploads(){return uploads;},get disposed(){return disposed;},set failPush(value){failPush=value;}};
}
test('native Upload changes uses existing workflow auth for a clean outgoing commit and retries after failed push',async t=>{
  const h=await harness(t);h.failPush=true;
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.uploads,1);assert.match(h.errors[0],/local commit is preserved/);assert.equal(h.disposed,1);
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.uploads,2);assert.equal(h.disposed,2);assert.match(h.notices.at(-1),/Uploaded bbbbbbb/);
  assert.ok(h.calls.some(call=>call.scopes.includes('workflow')));assert.ok(h.calls.every(call=>call.options.silent),'Stored native sessions need no grant or account changes');
});
test('native workflow permission cancellation stops before review UI or push and disposes scoped auth',async t=>{
  const h=await harness(t,{workflowAvailable:false,cancel:true});await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.uploads,0);assert.equal(h.inputs,0);assert.equal(h.disposed,1);assert.equal(h.calls.filter(call=>call.options.createIfNone).length,1);assert.match(h.errors[0],/Sign in|cancelled/);assert.ok(h.errors.every(text=>!text.includes('TEST_ONLY')));
});
test('native workflow account mismatch stops before review or push and disposes scoped auth',async t=>{
  const h=await harness(t,{workflowAccount:'2'});await h.commands.get('zero.uploadToGitHub')();assert.equal(h.uploads,0);assert.equal(h.inputs,0);assert.equal(h.disposed,1);assert.match(h.errors[0],/account changed/);
});
test('ordinary native uploads retain repository-only sessions',async t=>{
  const h=await harness(t,{kit:false});await h.commands.get('zero.uploadToGitHub')();assert.equal(h.uploads,1);assert.equal(h.disposed,0);assert.ok(h.calls.every(call=>call.scopes.join(',')==='repo'));
});
test('simulation skips managed kit authentication, saves and upload preparation',async t=>{
  const h=await harness(t,{mode:'simulation',workflowAvailable:false});const before=h.calls.length;await h.commands.get('zero.uploadToGitHub')();assert.equal(h.calls.length,before);assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);assert.equal(h.disposed,0);assert.match(h.notices.at(-1),/Simulation only/);
});

test('unset upload mode is live but activation and cancelled confirmation never upload',async t=>{
  assert.equal(require('../package.json').contributes.configuration.properties['zero.uploadMode'].default,'live');
  const h=await harness(t,{kit:false,confirm:false});
  assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);
  assert.ok(h.calls.every(call=>call.options.silent),'Activation only inspects existing sessions');
  await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.reviews,1,'Unset mode reaches the real review path');
  assert.equal(h.inputs,1);assert.equal(h.uploads,0,'Cancelling review must not call commit/push');
  assert.equal(h.errors.length,0);assert.ok(h.notices.includes('Upload this version to GitHub?'));
});
test('tutorial practice blocks GitHub actions even with the default live mode',async t=>{
  const h=await harness(t,{kit:false,practice:true});const before=h.calls.length;
  for(const id of ['zero.uploadToGitHub','zero.startChange','zero.finishChange','zero.publishWeb']) {
    assert.equal(typeof h.commands.get(id),'function');await h.commands.get(id)();
  }
  assert.equal(h.errors.length,4);assert.ok(h.errors.every(text=>/local lesson practice/.test(text)));
  assert.equal(h.calls.length,before);assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);
});
