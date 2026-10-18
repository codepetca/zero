'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const core=require('../src/core'),github=require('../src/github');
const {publishingFiles}=require('../src/web-publish-github');
const disposable=()=>({dispose(){}});
async function harness(t,{kit=true,mode,cancelMessage=false,practice=false,tutorial=false,selected=true,capabilities={contents:'write',workflows:'write'}}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-upload-auth-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify(practice?{localOnly:true}:{}));
  if(tutorial){
    await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({tutorialProjectId:'study',lessonId:'3',repositoryRequired:true}));
    const {execFileSync}=require('node:child_process'),git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
    git(['init','-q','-b','main']);git(['add','zero.json']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','Tutorial clone fixture']);git(['remote','add','origin','https://github.com/student/app.git']);
  }
  if(kit)for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
  const commands=new Map(),calls=[],errors=[],notices=[],results=[],listeners=new Set();let webviewProvider;let saves=0,reviews=0,uploads=0,pushes=0,disposed=0,inputs=0,failPush=false,accountId='1',afterAccess=async()=>{},afterInput=async()=>{};
  const originalGit=core.git,originalPrepare=github.prepareUpload,originalUpload=github.uploadPrepared;
  core.git=async(_,args)=>{if(args[0]==='rev-parse')return root;if(args[0]==='remote')return 'https://github.com/student/app.git';if(args[0]==='symbolic-ref')return 'main';throw Error('Unexpected Git command in mocked native UI');};
  const plan={root,page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch:'main',head:'b'.repeat(40),status:'',summary:'No file changes; retry already committed branch',changes:[]};
  github.prepareUpload=async()=>{reviews++;return plan;};
  github.uploadPrepared=async(reviewed,message,options)=>{
    uploads++;assert.equal(reviewed,plan);
    const session=await options.beforeUpload();
    assert.deepEqual(session.scopes,[]);assert.equal(session.accountId,'1');assert.equal(session.accessToken,'APP_TEST_ONLY');
    pushes++;if(failPush){failPush=false;throw Error('GitHub transport failed. Your local commit is preserved.');}
    return {head:plan.head,branch:'main',uploaded:true};
  };
  const accessCalls=[];
  const repositories={access:async(repositoryUrl,{ticket,permissions})=>{
    accessCalls.push({repositoryUrl,permissions,accountId:ticket.session.accountId});
    assert.equal(repositoryUrl,plan.page);assert.deepEqual(ticket.session.scopes,[]);
    if(ticket.session.accountId!==accountId || accountId!=='1')throw Error('The GitHub account changed. Review your upload again.');
    if(!selected)throw Error('Add this repository to Zero’s selected repositories on GitHub.');
    for(const [name,level] of Object.entries(permissions))if(capabilities[name]!==level)throw Error('Zero GitHub App '+name+' permission was removed. Review its permissions on GitHub.');
    await afterAccess();
    return {ticket,repository:{id:12,full_name:'student/app',owner:{id:1,type:'User'},default_branch:'main'},installation:{id:99}};
  }};
  const vscode={authentication:{getSession:async(provider,scopes,options)=>{
    calls.push({provider,scopes,options});
    assert.equal(provider,'zero-github','Zero must never fall back to the built-in broad GitHub provider');
    assert.deepEqual(scopes,[],'GitHub App sessions never request repo/workflow OAuth scopes');
    return {id:'zero-app-session-'+accountId,account:{id:accountId,label:accountId==='1'?'student':'other'},accessToken:'APP_TEST_ONLY',scopes:[]};
  },onDidChangeSessions:listener=>{listeners.add(listener);return {dispose(){disposed++;listeners.delete(listener);}};}},
  workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?(mode??fallback):fallback}),saveAll:async()=>{saves++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
  window:{createOutputChannel:()=>({appendLine:text=>results.push(text),dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showWarningMessage:async text=>notices.push(text),showInformationMessage:async(text,options)=>{notices.push(text);assert.ok(!options?.modal,'Routine push needs no confirmation');},showInputBox:async()=>{inputs++;await afterInput();return cancelMessage?undefined:'Retry my uploaded source';},showErrorMessage:async text=>errors.push(text)},
  tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}};
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{repositories});await new Promise(resolve=>setImmediate(resolve));
  t.after(()=>{subscriptions.forEach(item=>item.dispose());core.git=originalGit;github.prepareUpload=originalPrepare;github.uploadPrepared=originalUpload;delete require.cache[require.resolve('../src/extension')];});
  return {commands,calls,accessCalls,errors,notices,results,get pushes(){return pushes;},set selected(value){selected=value;},set accountId(value){accountId=value;},set afterAccess(value){afterAccess=value;},set afterInput(value){afterInput=value;},removePermission(name){delete capabilities[name];},render(){const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});return webview;},get saves(){return saves;},get inputs(){return inputs;},get reviews(){return reviews;},get uploads(){return uploads;},get disposed(){return disposed;},set failPush(value){failPush=value;}};
}
test('native App Commit & push retries a failed push using the same reviewed repository and empty scopes',async t=>{
  const h=await harness(t);h.failPush=true;
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.pushes,1);assert.match(h.errors[0],/local commit is preserved/);
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.pushes,2);assert.match(h.results.at(-1),/Pushed bbbbbbb/);assert.match(h.render().html,/Pushed to main/);
  assert.ok(!h.notices.some(text=>text.startsWith('Pushed ')));assert.equal(h.disposed,0,'No temporary scope-expansion façade exists');
  assert.ok(h.accessCalls.some(call=>call.permissions.workflows==='write'));assert.ok(h.calls.every(call=>call.provider==='zero-github'&&call.scopes.length===0&&call.options.silent));
});
test('unselected repository and denied App workflow capability stop before commit input or upload',async t=>{
  for(const options of [{selected:false},{capabilities:{contents:'write'}}])await t.test(options.selected===false?'unselected':'workflows denied',async t=>{
    const h=await harness(t,options);await h.commands.get('zero.uploadToGitHub')();
    assert.equal(h.uploads,0);assert.equal(h.inputs,0);assert.match(h.errors[0],/selected repositories|permission was removed/);
    assert.ok(h.calls.every(call=>call.scopes.length===0&&call.options.silent));assert.ok(h.errors.every(text=>!text.includes('TEST_ONLY')));
  });
});
test('App account drift while checking repository access rejects before commit input',async t=>{
  const h=await harness(t);h.afterAccess=async()=>{h.accountId='2';};await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.uploads,0);assert.equal(h.inputs,0);assert.match(h.errors[0],/account|sign-in changed/);assert.ok(h.errors.every(text=>!text.includes('TEST_ONLY')));
});
test('App account and permission removal after commit input reject the final upload guard',async t=>{
  for(const change of ['account','permission','repository'])await t.test(change,async t=>{
    const h=await harness(t);h.afterInput=async()=>{if(change==='account')h.accountId='2';else if(change==='repository')h.selected=false;else h.removePermission('workflows');};
    await h.commands.get('zero.uploadToGitHub')();assert.equal(h.inputs,1);assert.equal(h.pushes,0);
    assert.match(h.errors[0],/account|sign-in changed|permission was removed|selected repositories/);assert.ok(h.errors.every(text=>!text.includes('TEST_ONLY')));
  });
});
test('ordinary native uploads require only App Contents access',async t=>{
  const h=await harness(t,{kit:false,capabilities:{contents:'write'}});await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.pushes,1);assert.equal(h.disposed,0);assert.ok(h.accessCalls.length>0);
  assert.ok(h.accessCalls.every(call=>JSON.stringify(call.permissions)===JSON.stringify({contents:'write'})));assert.ok(h.calls.every(call=>call.scopes.length===0));
});
test('simulation skips managed kit authentication, saves, App access and upload preparation',async t=>{
  const h=await harness(t,{mode:'simulation',selected:false});const before=h.calls.length;await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.calls.length,before);assert.equal(h.accessCalls.length,0);assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);assert.match(h.notices.at(-1),/Simulation only/);
});

test('unset upload mode is live but activation and cancelled commit message never upload',async t=>{
  assert.equal(require('../package.json').contributes.configuration.properties['zero.uploadMode'].default,'live');
  const h=await harness(t,{kit:false,cancelMessage:true});
  assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);assert.equal(h.accessCalls.length,0);
  assert.ok(h.calls.every(call=>call.options.silent),'Activation only inspects existing sessions');
  await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.reviews,1,'Unset mode reaches the real review path');
  assert.equal(h.inputs,1);assert.equal(h.uploads,0,'Cancelling the message must not call commit/push');
  assert.equal(h.errors.length,0);assert.ok(!h.notices.includes('Commit and push this version to GitHub?'));
});
test('legacy local-only practice blocks GitHub actions even with the default live mode',async t=>{
  const h=await harness(t,{kit:false,practice:true});const before=h.calls.length;
  for(const id of ['zero.uploadToGitHub','zero.startChange','zero.finishChange','zero.publishWeb']) {
    assert.equal(typeof h.commands.get(id),'function');await h.commands.get(id)();
  }
  assert.equal(h.errors.length,4);assert.ok(h.errors.every(text=>/local lesson practice/.test(text)));
  assert.equal(h.calls.length,before);assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);
});

test('repository-required tutorial reaches default live Upload review and preserves cancellation',async t=>{
  const h=await harness(t,{kit:false,tutorial:true,cancelMessage:true});
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.reviews,1);assert.equal(h.inputs,1);assert.equal(h.uploads,0);assert.equal(h.errors.length,0);
  assert.ok(!h.notices.includes('Commit and push this version to GitHub?'));
});

test('tutorial sidebar retains normal GitHub controls and hides original-only Share project',async t=>{
  const h=await harness(t,{kit:false,tutorial:true});const webview=h.render();
  const deadline=Date.now()+5000;
  while(!webview.html.includes('data-command="zero.uploadToGitHub"')) {assert.ok(Date.now()<deadline,'Tutorial repository controls should finish rendering');await new Promise(resolve=>setImmediate(resolve));}
  for(const command of ['zero.chooseRepository','zero.uploadToGitHub','zero.browseZeroHub']) assert.ok(webview.html.includes(`data-command="${command}"`),command);
  assert.doesNotMatch(webview.html,/data-command="zero.publishWeb"|data-command="zero.shareGame"|data-command="zero.startChange"|data-command="zero.cloneRepository"|Local practice/);
  assert.match(webview.html,/Current branch: main/);
  await h.commands.get('zero.shareGame')();assert.match(h.errors.at(-1),/separate original project/);
});
test('original project sidebar continues offering Share project',async t=>{
  const h=await harness(t,{kit:false});const webview=h.render();const deadline=Date.now()+5000;
  while(!webview.html.includes('data-command="zero.shareGame"')) {assert.ok(Date.now()<deadline,'Original project should retain sharing');await new Promise(resolve=>setImmediate(resolve));}
  assert.match(webview.html,/Share project/);
});
