'use strict';
const {appSessions}=require('./fixtures/app-sessions');
const {textInputs} = require('./fixtures/text-input');
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const core=require('../src/core'),github=require('../src/github');
const {publishingFiles}=require('../src/web-publish-github');
const {createWebPublishCommands}=require('../src/web-publish-ui');
const {createTransport}=require('../src/transport');
const disposable=()=>({dispose(){}});
async function harness(t,{kit=true,mode,cancelMessage=false,practice=false,tutorial=false,selected=true,publishing=false,dirty=false,branch='main',lateTransport=false,correctionValidator,realLedger=false,capabilities={contents:'write',workflows:'write'}}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-upload-auth-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify(practice?{localOnly:true}:{}));
  if(publishing || practice) {
    const {loadBundle}=require('../src/lesson-projects');
    // Exercise the real pre-publication builder review with an already-current project.
    for(const file of (await loadBundle(path.resolve(__dirname,'..')))[0].files.filter(file=>file.path.startsWith('.zero-build/')||file.path==='zero-core.json'||file.path.startsWith('src/main/java/zero/'))) {
      const destination=path.join(root,...file.path.split('/'));
      await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,file.content);
    }
  }
  if(tutorial || publishing){
    if(tutorial)await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({tutorialProjectId:'study',lessonId:'3',repositoryRequired:true}));
    const {execFileSync}=require('node:child_process'),git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
    git(['init','-q','-b','main']);git(['add','zero.json']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','Tutorial clone fixture']);git(['remote','add','origin','https://github.com/student/app.git']);
  }
  else await fs.mkdir(path.join(root,'.git'));
  if(kit)for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
  const commands=new Map(),calls=[],errors=[],notices=[],results=[],picks=[],listeners=new Set();let webviewProvider;let repositoryId=12,installationId=99,privacy=true;let saves=0,reviews=0,uploads=0,pushes=0,disposed=0,inputs=0,failPush=false,accountId='1',ancestor=true,afterWarning=async()=>{},afterAccess=async()=>{},afterInput=async()=>{},afterUpload=async()=>{},afterSave=async()=>{},afterTransportPreparation=async()=>{},transportDispatches=0,trackingError;
  const originalGit=core.git,originalPrepare=github.prepareUpload,originalUpload=github.uploadPrepared;
  if(!realLedger)core.git=async(_,args)=>{if(args[0]==='--no-replace-objects'){if(!ancestor||args.includes('d'.repeat(40)))throw Object.assign(Error('Not ancestor'),{code:1});return '';}if(args[0]==='rev-parse')return args.includes('HEAD^{commit}')?'b'.repeat(40):args.includes('--git-common-dir')||args.includes('--absolute-git-dir')?path.join(root,'.git'):root;if(args[0]==='remote')return 'https://github.com/student/app.git';if(args[0]==='symbolic-ref'){if(args.at(-1)!=='HEAD')throw Object.assign(Error('Direct branch'),{code:1});return 'refs/heads/main';}throw Error('Unexpected Git command in mocked native UI');};
  const plan=realLedger?await originalPrepare(root):{root,page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch,head:'b'.repeat(40),status:dirty?' M Main.java':'',fingerprint:'source-v1',summary:'Source fixture',changes:dirty?[{path:'Main.java',kind:'M'}]:[]};
  let confirmedHead=plan.head;
  if(!realLedger)github.prepareUpload=async()=>{reviews++;return plan;};
  github.uploadPrepared=async(reviewed,message,options)=>{
    uploads++;assert.equal(reviewed,plan);assert.equal(typeof options.withLocalMutation,'function');await afterUpload();
    const session=await options.beforeUpload();
    assert.deepEqual(session.scopes,[]);assert.equal(session.accountId,'1');assert.equal(session.accessToken,'APP_TEST_ONLY');
    await options.networkRun(root,['push',plan.remote,`${plan.head}:refs/heads/main`]);
    await options.networkRun(root,['ls-remote','--heads',plan.remote,'refs/heads/main']);
    pushes++;if(failPush){failPush=false;throw Error('GitHub transport failed. Your local commit is preserved.');}
    return {head:plan.head,branch:'main',uploaded:true};
  };
  const accessCalls=[];
  const repositories={checkSetup:async()=>({}),access:async(repositoryUrl,{ticket,permissions})=>{
    accessCalls.push({repositoryUrl,permissions,accountId:ticket.session.accountId});
    assert.equal(repositoryUrl,plan.page);assert.deepEqual(ticket.session.scopes,[]);
    if(ticket.session.accountId!==accountId || accountId!=='1')throw Error('The GitHub account changed. Review your upload again.');
    if(!selected)throw Error('Add this repository to Zero’s selected repositories on GitHub.');
    for(const [name,level] of Object.entries(permissions))if(capabilities[name]!==level)throw Error('Zero GitHub App '+name+' permission was removed. Review its permissions on GitHub.');
    await afterAccess();
    return {ticket,repository:{id:repositoryId,private:privacy,full_name:'student/app',owner:{id:1,type:'User'},default_branch:'main'},installation:{id:installationId}};
  }};
  const appProvider={dispose(){},async removeSession(){assert.fail('Upload must not remove a GitHub session');}};
  const vscode={authentication:{registerAuthenticationProvider:(id,label,provider,options)=>{assert.equal(id,'zero-github');assert.equal(label,'Zero GitHub');assert.equal(provider,appProvider);assert.deepEqual(options,{supportsMultipleAccounts:false});return disposable();},getSession:async(provider,scopes,options)=>{
    calls.push({provider,scopes,options});
    assert.equal(provider,'zero-github','Zero must never fall back to the built-in broad GitHub provider');
    assert.deepEqual(scopes,[],'GitHub App sessions never request repo/workflow OAuth scopes');
    return {id:'zero-app-session-'+accountId,account:{id:accountId,label:accountId==='1'?'student':'other'},accessToken:'APP_TEST_ONLY',scopes:[]};
  },onDidChangeSessions:listener=>{listeners.add(listener);return {dispose(){disposed++;listeners.delete(listener);}};}},
  workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],isTrusted:true,textDocuments:[],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?(mode??fallback):fallback}),saveAll:async()=>{saves++;await afterSave();return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
  window:{createOutputChannel:()=>({appendLine:text=>results.push(text),dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showQuickPick:async(items,options)=>{picks.push({items,options});},showWarningMessage:async(text,options)=>{notices.push(text);await afterWarning(text,options);return text==='Sync saved project commits?'?'Sync commits':undefined;},showInformationMessage:async(text,options)=>{notices.push(text);assert.ok(!options?.modal,'Routine push needs no confirmation');},showInputBox:async()=>{inputs++;await afterInput();return cancelMessage?undefined:'Retry my uploaded source';},showErrorMessage:async text=>errors.push(text)},
  tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}};
  let publishReviews=0,deploys=0,publishApi;
  const publishPublisher={review:async()=>{
    publishReviews++;
    if(plan.branch!=='main')throw Error('Finish your change with Merge to main before publishing the app.');
    if(publishReviews===1)throw Object.assign(Error('Upload required'),{code:'WEB_PUBLISH_UPLOAD_REQUIRED',plan:{...plan}});
    return {status:'review',repository:plan.page,publicUrl:'https://student.github.io/app/',sha:plan.head,account:'1'};
  },publish:async()=>{deploys++;return {status:'live',url:'https://student.github.io/app/',sha:plan.head,resume:{repository:plan.page,sha:plan.head,runId:42}};}};
  const stored=new Map();
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){
    if(correctionValidator&&id==='./project-restore-plan')return {...require('../src/project-restore-plan'),validatedCompletedProjectRestore:correctionValidator};
    if(id==='./git-tracking')return {updateRemoteTracking:async()=>{if(trackingError)throw trackingError;return {updated:true};}};
    if(!lateTransport && id==='./transport')return {createTransport:(remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{
      await authenticate();assertCurrentNow();transportDispatches++;
      return args[0]==='ls-remote'?`${confirmedHead}\trefs/heads/main`:'';
    }};
    if(lateTransport && id==='./transport')return {createTransport:(remote,authenticate,options)=>createTransport(remote,authenticate,{...options,
      localRun:async(_root,args)=>{
        if(args[0]==='--version')return 'git version 2.45.0';
        if(args[0]==='rev-parse')return root;
        if(args[0]==='config'){await afterTransportPreparation();throw Object.assign(Error('No rewrites'),{code:1});}
        throw Error('Unexpected local transport check');
      },spawn:async()=>{transportDispatches++;return {stdout:''};}})};
    if(publishing && id==='./web-publish-ui')return {createWebPublishCommands:(v,options)=>(publishApi=createWebPublishCommands(v,{...options,publisherFactory:()=>publishPublisher}))};
    return id==='vscode'?textInputs(vscode):originalLoad.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];extension.activate({subscriptions,workspaceState:{keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>{stored.set(key,value);}}},{...(realLedger?{}:{repositoryLedgerFactory:require('./fixtures/repository-ledger').repositoryLedgerFactory}),provider:appSessions(vscode,appProvider),repositories});await new Promise(resolve=>setImmediate(resolve));
  t.after(()=>{subscriptions.forEach(item=>item.dispose());core.git=originalGit;github.prepareUpload=originalPrepare;github.uploadPrepared=originalUpload;delete require.cache[require.resolve('../src/extension')];});
  return {root,vscode,commands,calls,accessCalls,errors,notices,results,picks,plan,stored,set confirmedHead(value){confirmedHead=value;},get publishApi(){return publishApi;},get transportDispatches(){return transportDispatches;},set ancestor(value){ancestor=value;},set afterWarning(value){afterWarning=value;},set trackingError(value){trackingError=value;},set afterTransportPreparation(value){afterTransportPreparation=value;},set mode(value){mode=value;},get deploys(){return deploys;},get pushes(){return pushes;},set repositoryId(value){repositoryId=value;},set installationId(value){installationId=value;},set privacy(value){privacy=value;},set selected(value){selected=value;},set accountId(value){accountId=value;},set afterAccess(value){afterAccess=value;},set afterInput(value){afterInput=value;},set afterSave(value){afterSave=value;},set afterUpload(value){afterUpload=value;},removePermission(name){delete capabilities[name];},render(){const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});return webview;},get saves(){return saves;},get inputs(){return inputs;},get reviews(){return reviews;},get uploads(){return uploads;},get disposed(){return disposed;},set failPush(value){failPush=value;}};
}
test('direct upload blocks dirty project aliases before auth and leaves unrelated editors untouched',async t=>{
  const h=await harness(t),alias=h.root+'-alias';await fs.symlink(h.root,alias);t.after(()=>fs.unlink(alias));
  const doc={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(alias,'zero.json')}};h.vscode.workspace.textDocuments=[doc];
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.reviews,0);assert.equal(h.accessCalls.length,0);assert.equal(h.uploads,0);assert.equal(h.saves,0);assert.equal(doc.isDirty,true);assert.match(h.errors.at(-1),/Save or undo/);
  const other={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(path.dirname(h.root),'unrelated.txt')}};h.vscode.workspace.textDocuments=[other];
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.pushes,1);assert.equal(h.saves,0);assert.equal(other.isDirty,true);
});
test('direct upload rechecks unsaved edits after prompt and before its local mutation',async t=>{
  for(const stage of ['input','upload'])await t.test(stage,async t=>{
    const h=await harness(t,{dirty:true}),doc={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(h.root,'zero.json')}};
    if(stage==='input')h.afterInput=async()=>{h.vscode.workspace.textDocuments=[doc];};else h.afterUpload=async()=>{h.vscode.workspace.textDocuments=[doc];};
    await h.commands.get('zero.uploadToGitHub')();assert.equal(h.pushes,0);assert.equal(h.transportDispatches,0);assert.equal(h.saves,0);assert.equal(doc.isDirty,true);assert.match(h.errors.at(-1),/Save or undo/);
  });
});
test('native App Commit & push retries a failed push using the same reviewed repository and empty scopes',async t=>{
  const h=await harness(t);h.failPush=true;
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.pushes,1);assert.match(h.errors[0],/local commit is preserved/);
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.pushes,2);assert.match(h.results.at(-1),/Pushed bbbbbbb/);assert.match(h.render().html,/Pushed to main/);
  assert.ok(!h.notices.some(text=>text.startsWith('Pushed ')));assert.equal(h.disposed,0,'No temporary scope-expansion façade exists');
  assert.equal(h.accessCalls.length,4,'Each attempt checks access before input and once at first transport, with no duplicate confirmation check');
  assert.equal(h.transportDispatches,4,'The safe transport fixture exercises push and confirmation on each attempt');
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
    const h=await harness(t,{dirty:true});h.afterInput=async()=>{if(change==='account')h.accountId='2';else if(change==='repository')h.selected=false;else h.removePermission('workflows');};
    await h.commands.get('zero.uploadToGitHub')();assert.equal(h.inputs,1);assert.equal(h.pushes,0);
    assert.equal(h.transportDispatches,0,'Revocation must stop before credential-bearing transport dispatch');
    assert.match(h.errors[0],/account|sign-in changed|permission was removed|selected repositories/);assert.ok(h.errors.every(text=>!text.includes('TEST_ONLY')));
  });
});
test('ordinary native uploads require only App Contents access',async t=>{
  const h=await harness(t,{kit:false,capabilities:{contents:'write'}});await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.pushes,1);assert.equal(h.inputs,0,'Pushing saved commits needs no new commit message');assert.equal(h.disposed,0);assert.ok(h.accessCalls.length>0);
  assert.ok(h.accessCalls.every(call=>JSON.stringify(call.permissions)===JSON.stringify({contents:'write'})));assert.ok(h.calls.every(call=>call.scopes.length===0));
});
test('reconnecting syncs the saved head while preserving newer dirty work',async t=>{
  const h=await harness(t,{kit:false,dirty:true,tutorial:true});
  const saved={root:h.plan.root,branch:h.plan.branch,head:h.plan.head};
  h.stored.set(`zero.localCommitPending:${saved.root}:${saved.branch}`,saved);
  const original=github.syncExistingHead;let reviewed;
  github.syncExistingHead=async(plan,options)=>{reviewed=plan;await options.beforeUpload();await options.networkRun(saved.root,['push',plan.remote,`${saved.head}:refs/heads/${saved.branch}`]);await options.networkRun(saved.root,['ls-remote','--heads',plan.remote,`refs/heads/${saved.branch}`]);return {uploaded:true,head:saved.head,branch:saved.branch};};
  t.after(()=>{github.syncExistingHead=original;});
  await h.commands.get('zero.syncLocalCommit')();
  assert.deepEqual(h.errors,[]);
  assert.equal(reviewed,h.plan);assert.equal(reviewed.changes.length,1);
  assert.equal(h.transportDispatches,2);assert.deepEqual(h.stored.get(`zero.localCommitPending:${saved.root}:${saved.branch}`),saved,'Legacy data stays intact; its exact record is resolved in the ledger');
  assert.match(h.results.join('\n'),/newer local work remains/);assert.equal(h.errors.length,0);
});
test('reconnection reviews current head and preserves unrelated or changed reminders',async t=>{
 for(const scenario of ['included','other-unrelated','unrelated','restore','drift','push'])await t.test(scenario,async t=>{
  const h=await harness(t,{kit:false,tutorial:true}),old='a'.repeat(40),base={root:h.plan.root,branch:h.plan.branch,remote:'',type:'local'};
  h.stored.set('zero.pendingSync.v1:first',{...base,id:'first',head:old});
  h.stored.set('zero.pendingSync.v1:second',{...base,id:'second',head:scenario==='other-unrelated'?'d'.repeat(40):h.plan.head,...(scenario==='restore'?{operation:'restore'}:{})});
  if(scenario==='unrelated')h.ancestor=false;
  if(scenario==='push')h.stored.set('zero.pendingSync.v1:push',{id:'push',root:h.plan.root,branch:h.plan.branch,head:old,remote:h.plan.remote});
  if(scenario==='drift')h.afterWarning=async text=>{if(text==='Sync saved project commits?')h.stored.set('zero.pendingSync.v1:first',{...base,id:'first',head:'d'.repeat(40)});};
  const original=github.syncExistingHead;let synced=0;
  github.syncExistingHead=async(plan,options)=>{assert.equal(plan.head,h.plan.head);await options.beforeUpload();synced++;return {head:plan.head,branch:plan.branch};};
  t.after(()=>{github.syncExistingHead=original;});
  await h.commands.get('zero.syncLocalCommit')();
  const resolved=[...h.stored.entries()].filter(([key])=>key.startsWith('zero.resolvedSync.v1:')).map(([,value])=>value.id);
  if(['included','other-unrelated'].includes(scenario)){assert.equal(synced,1);assert.deepEqual(resolved.sort(),scenario==='included'?['first','second']:['first']);assert.deepEqual(h.errors,[]);}
  else {assert.equal(synced,0);assert.deepEqual(resolved,[]);assert.ok(h.errors.length);}
 });
});
test('no-file-change push still rejects account, access and repository identity drift at transfer without prompting',async t=>{
  for(const change of ['account','permission','repository','installation'])await t.test(change,async t=>{
    const h=await harness(t);
    h.afterUpload=async()=>{
      if(change==='account')h.accountId='2';
      else if(change==='permission')h.removePermission('workflows');
      else if(change==='repository')h.repositoryId=13;
      else h.installationId=100;
    };
    await h.commands.get('zero.uploadToGitHub')();
    assert.equal(h.inputs,0);assert.equal(h.uploads,1);assert.equal(h.pushes,0);assert.equal(h.transportDispatches,0);
    assert.match(h.errors.at(-1),/account|sign-in changed|permission was removed|repository or Zero installation changed/);
    assert.ok(h.errors.every(text=>!text.includes('TEST_ONLY')));
  });
});
test('simulation skips managed kit authentication, saves, App access and upload preparation',async t=>{
  const h=await harness(t,{mode:'simulation',selected:false});const before=h.calls.length;await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.calls.length,before);assert.equal(h.accessCalls.length,0);assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);assert.match(h.notices.at(-1),/Simulation only/);
});

test('unset upload mode is live but activation and cancelled commit message never upload',async t=>{
  assert.equal(require('../package.json').contributes.configuration.properties['zero.uploadMode'].default,'live');
  const h=await harness(t,{kit:false,dirty:true,cancelMessage:true});
  assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);assert.equal(h.accessCalls.length,0);
  assert.ok(h.calls.every(call=>call.options.silent),'Activation only inspects existing sessions');
  await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.reviews,1,'Unset mode reaches the real review path');
  assert.equal(h.inputs,1);assert.equal(h.uploads,0,'Cancelling the message must not call commit/push');
  assert.equal(h.errors.length,0);assert.ok(!h.notices.includes('Commit and push this version to GitHub?'));
});
test('legacy local-only practice blocks GitHub actions even with the default live mode',async t=>{
  const h=await harness(t,{kit:false,practice:true});const before=h.calls.length;
  for(const id of ['zero.uploadToGitHub','zero.startChange','zero.finishChange','zero.syncProject','zero.publishWeb']) {
    assert.equal(typeof h.commands.get(id),'function');await h.commands.get(id)();
  }
  assert.equal(h.errors.length,5);assert.ok(h.errors.every(text=>/local lesson practice/.test(text)));
  assert.equal(h.calls.length,before);assert.equal(h.saves,0);assert.equal(h.reviews,0);assert.equal(h.uploads,0);
});

test('repository-required tutorial reaches default live Upload review and preserves cancellation',async t=>{
  const h=await harness(t,{kit:false,tutorial:true,dirty:true,cancelMessage:true});
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.reviews,1);assert.equal(h.inputs,1);assert.equal(h.uploads,0);assert.equal(h.errors.length,0);
  assert.ok(!h.notices.includes('Commit and push this version to GitHub?'));
});

test('tutorial sidebar retains normal GitHub controls and hides original-only Share project',async t=>{
  const h=await harness(t,{kit:false,tutorial:true});const webview=h.render();
  const deadline=Date.now()+5000;
  while(!webview.html.includes('data-command="zero.commitChanges"')) {assert.ok(Date.now()<deadline,'Tutorial repository controls should finish rendering');await new Promise(resolve=>setImmediate(resolve));}
  for(const command of ['zero.chooseRepository','zero.commitChanges','zero.browseZeroHub']) assert.ok(webview.html.includes(`data-command="${command}"`),command);
  assert.match(webview.html,/<div id="run-menu"[^>]*hidden><button[^>]*data-command="zero.publishAndOpenWeb"[^>]*>Publish &amp; open app<\/button>/);
  assert.doesNotMatch(webview.html,/data-command="zero.shareGame"|Local practice/);
  assert.match(webview.html,/id="branch-menu"[^>]*hidden>[\s\S]*?data-command="zero.startChange"/);
  assert.doesNotMatch(webview.html,/id="project-menu"|data-command="zero.cloneRepository"/);
  assert.match(webview.html,/Current branch: main/);
  await h.commands.get('zero.shareGame')();assert.match(h.errors.at(-1),/separate original project/);
});
test('original project keeps Share project inside the ZeroHub menu',async t=>{
  const h=await harness(t,{kit:false});const webview=h.render();const deadline=Date.now()+5000;
  while(!webview.html.includes('data-command="zero.chooseRepository"')) {assert.ok(Date.now()<deadline,'Signed-in original project should finish rendering');await new Promise(resolve=>setImmediate(resolve));}
  assert.doesNotMatch(webview.html,/data-command="zero.shareGame"/);
  await h.commands.get('zero.browseZeroHub')();assert.equal(h.picks.at(-1).options.title,'ZeroHub');assert.ok(h.picks.at(-1).items.some(item=>item.label==='Share project' && item.action==='share'));
});

test('unchanged URL and account cannot push to a replacement repository or installation after review',async t=>{
 for(const kind of ['repository','installation'])await t.test(kind,async t=>{
  const h=await harness(t,{dirty:true});h.afterInput=async()=>{if(kind==='repository'){h.repositoryId=13;h.privacy=false;}else h.installationId=100;};
  await h.commands.get('zero.uploadToGitHub')();assert.equal(h.inputs,1);assert.equal(h.pushes,0);assert.equal(h.transportDispatches,0);assert.match(h.errors.at(-1),/repository or Zero installation changed/);
 });
});


async function uploadSidebar(h) {
  const webview=h.render(),deadline=Date.now()+5000;
  while(!webview.html.includes('data-command="zero.commitChanges"')) {
    assert.ok(Date.now()<deadline,'Upload controls should finish initial rendering');
    await new Promise(resolve=>setImmediate(resolve));
  }
  return webview;
}

function uploadButton(webview) {
  return webview.html.match(/<button[^>]*data-command="zero.commitChanges"[^>]*>[\s\S]*?<\/button>/)?.[0] || '';
}

test('Commit & push shows preparation during slow access, rejects duplicates and resets after message cancellation',async t=>{
  const h=await harness(t,{kit:false,tutorial:true,dirty:true,cancelMessage:true}),webview=await uploadSidebar(h);
  let releaseAccess,accessStarted;
  const started=new Promise(resolve=>{accessStarted=resolve;});
  const accessGate=new Promise(resolve=>{releaseAccess=resolve;});
  h.afterAccess=async()=>{accessStarted();await accessGate;};
  h.afterInput=async()=>{
    assert.doesNotMatch(uploadButton(webview),/Preparing commit…|Committing &amp; pushing…|aria-busy="true"/,'Preparation ends when the input opens');
    assert.match(uploadButton(webview),/data-command="zero.commitChanges"[^>]*disabled/,'Input keeps duplicate submissions disabled');
  };
  const pending=h.commands.get('zero.uploadToGitHub')();
  try {
    await started;
    assert.match(uploadButton(webview),/data-command="zero.commitChanges"[^>]*aria-busy="true"[^>]*disabled>[\s\S]*?busy-indicator[\s\S]*?Preparing commit…<\/button>/);
    assert.equal(h.inputs,0);assert.equal(h.uploads,0);
    await h.commands.get('zero.uploadToGitHub')();assert.equal(h.reviews,1,'Repeated clicks cannot start a second preparation');
  } finally {releaseAccess();await pending;}
  assert.equal(h.inputs,1);assert.equal(h.uploads,0);
  assert.doesNotMatch(uploadButton(webview),/Preparing commit…|aria-busy="true"/);
  assert.match(uploadButton(webview),/data-command="zero.commitChanges"[^>]*>.*Commit<\/button>/);
  assert.match(uploadButton(webview),/data-command="zero.commitChanges"[^>]*disabled/,'Unknown file status keeps the commit button disabled');
});

test('Commit & push clears its indicator on preparation failure and after a confirmed push succeeds or fails',async t=>{
  await t.test('access denied',async t=>{
    const h=await harness(t,{kit:false,tutorial:true,selected:false}),webview=await uploadSidebar(h);
    await h.commands.get('zero.uploadToGitHub')();
    assert.equal(h.inputs,0);assert.equal(h.uploads,0);assert.match(h.errors[0],/selected repositories/);
    assert.doesNotMatch(uploadButton(webview),/Preparing commit…|aria-busy="true"/);
  });
  for(const fail of [false,true])await t.test(fail?'push failed':'push completed',async t=>{
    const h=await harness(t,{kit:false,tutorial:true,dirty:true}),webview=await uploadSidebar(h);h.failPush=fail;
    let releaseUpload,uploadStarted;
    const started=new Promise(resolve=>{uploadStarted=resolve;});
    const uploadGate=new Promise(resolve=>{releaseUpload=resolve;});
    h.afterUpload=async()=>{uploadStarted();await uploadGate;};
    const pending=h.commands.get('zero.uploadToGitHub')();
    try {
      await started;
      assert.match(uploadButton(webview),/data-command="zero.commitChanges"[^>]*aria-busy="true"[^>]*disabled>[\s\S]*?Committing &amp; pushing…<\/button>/);
      assert.equal(h.inputs,1);
    } finally {releaseUpload();await pending;}
    assert.equal(h.pushes,1);assert.equal(h.errors.length,fail?1:0);
    assert.doesNotMatch(uploadButton(webview),/Preparing commit…|Committing &amp; pushing…|aria-busy="true"/);
  });
});

test('Publish commits dirty main through guarded native upload and retains the verified playable link',async t=>{
  const h=await harness(t,{publishing:true,dirty:true});
  // Public-destination consent is the only publication dialog.
  h.stored.set('zero.webPublish.approval',{root:h.plan.root,account:'1',repository:h.plan.page,url:'https://student.github.io/app/'});
  await h.commands.get('zero.publishWeb')();
  assert.deepEqual(h.errors,[]);assert.equal(h.inputs,1);assert.equal(h.pushes,1);assert.equal(h.deploys,1);
  assert.equal(h.stored.get('zero.webPublish.lastLive').url,'https://student.github.io/app/');
  assert.match(h.results.at(-1),/https:\/\/student.github.io\/app\//);
  const webview=await uploadSidebar(h);assert.doesNotMatch(webview.html,/published-app-link|Open published app/);assert.doesNotMatch(webview.html,/Copy playable link/);assert.match(webview.html,/data-command="zero.publishAndOpenWeb"/);
});
test('Publish pushes already committed main without asking for another commit message',async t=>{
  const h=await harness(t,{publishing:true});
  h.stored.set('zero.webPublish.approval',{root:h.plan.root,account:'1',repository:h.plan.page,url:'https://student.github.io/app/'});
  await h.commands.get('zero.publishWeb')();
  assert.deepEqual(h.errors,[]);assert.equal(h.inputs,0);assert.equal(h.pushes,1);assert.equal(h.deploys,1);
});
test('Publish cancellation, push failure and change branch all stop before deployment',async t=>{
  for(const options of [{dirty:true,cancelMessage:true},{dirty:true,failPush:true},{branch:'add-score'}])await t.test(JSON.stringify(options),async t=>{
    const h=await harness(t,{publishing:true,...options});if(options.failPush)h.failPush=true;
    await h.commands.get('zero.publishWeb')();assert.equal(h.deploys,0);
    if(options.branch){assert.equal(h.inputs,0);assert.equal(h.pushes,0);assert.match(h.errors.at(-1),/Merge to main/);}
    if(options.failPush)assert.match(h.errors.at(-1),/local commit is preserved/);
    assert.equal(h.stored.has('zero.webPublish.lastLive'),false);
  });
});
test('Publish rejects branch or source drift before the upload handoff',async t=>{
  for(const field of ['branch','fingerprint'])await t.test(field,async t=>{
    const h=await harness(t,{publishing:true,dirty:true});
    h.afterSave=async()=>{h.plan[field]=field==='branch'?'other-change':'source-v2';};
    await h.commands.get('zero.publishWeb')();
    assert.equal(h.inputs,0);assert.equal(h.pushes,0);assert.equal(h.deploys,0);
    assert.match(h.errors.at(-1),/Merge to main|project changed before upload/);
  });
});

test('closing Publish during commit entry cancels before the upload network guard',async t=>{
  const h=await harness(t,{publishing:true,dirty:true});
  h.afterInput=async()=>h.publishApi.disposables[0].dispose();
  await h.commands.get('zero.publishWeb')();
  assert.equal(h.inputs,1);assert.equal(h.pushes,0);assert.equal(h.deploys,0);
  assert.match(h.errors.at(-1),/publishing was cancelled/);
});

test('late Publish cancellation and live-mode changes block transport dispatch after async preparation',async t=>{
  for(const change of ['cancel','simulation'])await t.test(change,async t=>{
    const h=await harness(t,{publishing:true,dirty:true,lateTransport:true});
    h.afterTransportPreparation=async()=>{if(change==='cancel')h.publishApi.disposables[0].dispose();else h.mode='simulation';};
    await h.commands.get('zero.publishWeb')();
    assert.equal(h.transportDispatches,0);assert.equal(h.pushes,0);assert.equal(h.deploys,0);
    assert.match(h.errors.at(-1),/Publishing was cancelled|Live (?:publishing|Git actions) (?:was|were) disabled/);
  });
});


test('a local tracking refresh failure preserves confirmed upload success',async t=>{
  const h=await harness(t,{kit:false});h.trackingError=Error('Fixture local tracking refresh failed');
  await h.commands.get('zero.uploadToGitHub')();
  assert.equal(h.pushes,1);assert.equal(h.errors.length,0);assert.match(h.results.at(-1),/Pushed bbbbbbb/);
  assert.match(h.render().html,/Pushed to main/);
  assert.ok(h.results.some(text=>/tracking|Source Control/i.test(text)),'The local refresh problem remains visible in Output');
});

test('correction reminders offer sync and inspection while retaining their records',async t=>{
 for(const operation of ['restore','undo',undefined])await t.test(operation||'ordinary commit',async t=>{
  const h=await harness(t,{kit:false,tutorial:true});
  const initial=h.render(),deadline=Date.now()+10000;while(!initial.html.includes('Current branch: main')){assert.ok(Date.now()<deadline,'Expected the tutorial branch controls');await new Promise(resolve=>setTimeout(resolve,10));}
  const record={id:'local',root:h.plan.root,branch:h.plan.branch,head:h.plan.head,remote:'',type:'local',...(operation?{operation,recoveryPath:path.join(h.plan.root,'.git','zero-project-restore-recovery-test')}: {})};
  h.stored.set('zero.pendingSync.v1:local',record);
  await h.commands.get('zero.reviewLocalCommit')();
  assert.deepEqual(h.errors,[]);
  const html=h.render().html;
  assert.ok(html.includes('data-command="zero.reviewLocalCommit"'));
  assert.ok(html.includes('data-command="zero.syncLocalCommit"'));
  assert.deepEqual(h.stored.get('zero.pendingSync.v1:local'),record);
  assert.equal(h.transportDispatches,0);
 });
});

test('correction sync validates receipt and rechecks it at push, preserving unrelated reminders',async t=>{
 for(const scenario of ['undo','restore','interrupted','wrong-commit','wrong-branch','changed'])await t.test(scenario,async t=>{
  let calls=0;const head='a'.repeat(40),validator=async()=>{calls++;if(scenario==='interrupted'||scenario==='changed'&&calls>3)return false;return {commit:scenario==='wrong-commit'?'c'.repeat(40):head,branch:scenario==='wrong-branch'?'refs/heads/other':'refs/heads/main'};};
  const h=await harness(t,{kit:false,tutorial:true,correctionValidator:validator});
  const record={id:'first',root:h.plan.root,branch:'main',head,remote:'',type:'local',operation:scenario==='restore'?'restore':'undo',recoveryPath:path.join(h.plan.root,'.git','zero-project-restore-recovery-test')};
  const other={id:'second',root:h.plan.root,branch:'main',head:h.plan.head,remote:'',type:'local'};
  h.stored.set('zero.pendingSync.v1:first',record);h.stored.set('zero.pendingSync.v1:second',other);
  const original=github.syncExistingHead;
  github.syncExistingHead=async(plan,{beforeUpload,networkRun})=>{await beforeUpload();await networkRun(plan.root,['push',plan.remote,`${plan.head}:refs/heads/main`]);await networkRun(plan.root,['ls-remote','--heads',plan.remote,'refs/heads/main']);return {head:plan.head,branch:plan.branch};};
  t.after(()=>{github.syncExistingHead=original;});
  await h.commands.get('zero.syncLocalCommit')();
  const resolved=[...h.stored.entries()].filter(([key])=>key.startsWith('zero.resolvedSync.v1:')).map(([,value])=>value.id);
  if(['undo','restore'].includes(scenario)){assert.equal(h.transportDispatches,2);assert.ok(resolved.includes('first'));assert.ok(!resolved.includes('second'));assert.deepEqual(h.errors,[]);}
  else {assert.equal(h.transportDispatches,0);assert.deepEqual(resolved,[]);assert.match(h.errors.at(-1),/not confirmed applied/);}
  assert.deepEqual(h.stored.get('zero.pendingSync.v1:first'),record);assert.deepEqual(h.stored.get('zero.pendingSync.v1:second'),other);
 });
});

test('actual sync confirms its own durable attempt with the repository ledger',async t=>{
 let validatedHead;const validator=async()=>({commit:validatedHead,branch:'refs/heads/main'});
 const h=await harness(t,{kit:false,tutorial:true,realLedger:true,correctionValidator:validator});validatedHead=h.plan.head;
 const {createRepositoryReminderStorage}=require('../src/repository-reminder-storage');
 const state={keys:()=>[...h.stored.keys()],get:key=>h.stored.get(key),update:async(key,value)=>h.stored.set(key,value)};
 const ledger=createRepositoryReminderStorage({state});
 await fs.writeFile(path.join(h.plan.root,'later.txt'),'later work');
 const git=(...args)=>require('node:child_process').execFileSync('git',args,{cwd:h.plan.root,encoding:'utf8'}).trim();
 git('add','later.txt');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','later work');h.confirmedHead=git('rev-parse','HEAD');
 const record=await ledger.add(h.plan.root,{root:h.plan.root,branch:'main',head:h.plan.head,remote:'',type:'local',operation:'undo',recoveryPath:path.join(h.plan.root,'.git','zero-project-restore-recovery-test')});
 await h.commands.get('zero.syncLocalCommit')();
 assert.deepEqual(h.errors,[]);assert.equal(h.transportDispatches,2,'Push and GitHub confirmation both run');
 assert.deepEqual(await ledger.list(h.plan.root),[],'Exact correction and own push attempt are confirmed');
 assert.match(h.results.join('\n'),/saved commit was confirmed on GitHub/);
});
