'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const core=require('../src/core'),github=require('../src/github');
const {appSessions}=require('./fixtures/app-sessions'),{textInputs}=require('./fixtures/text-input');
const disposable=()=>({dispose(){}});
async function fixture(t,{trackFiles=false}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-commit-guards-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.mkdir(path.join(root,'.git'));
 const commands=new Map(),errors=[],logs=[],stored=new Map(),writes=[],warnings=[],gitCalls=[],transportEvents=[];let webviewProvider,authEvent,afterInput=async()=>{},afterPrepare=async()=>{},afterProgress=async()=>{},afterCommit=async()=>{},afterSync=async()=>{},afterWarning=async()=>{},afterReview=async()=>{},warningChoice,failReview=false,failClear=false,failLocalAdd=false,pushThroughTransport=false,commits=0,syncs=0,prepared=0,saves=0,inputs=0,inputResult='My changes';
 let remote='https://github.com/student/app.git',remoteCheck='synced',edited=true,authSelections=0,fileRefreshes=0,failFilesRefresh=false;const page='https://github.com/student/app',oldHead='a'.repeat(40),newHead='b'.repeat(40);
 const original={repo:core.repositoryRoot,git:core.git,resolve:core.resolveProject,prepare:github.prepareLocalCommit,upload:github.uploadPrepared,prepareUpload:github.prepareUpload,sync:github.syncExistingHead};
 core.repositoryRoot=async()=>root;core.resolveProject=async folders=>folders[0]===root?root:(()=>{throw Error('Project changed');})();core.git=async(_,args)=>{gitCalls.push(args);if(args[0]==='config')throw Object.assign(Error('No config'),{code:1});if(args[0]==='merge-base')return '';if(args[0]==='--no-replace-objects'&&args[1]==='merge-base'){if(args.at(-2)===oldHead&&args.at(-1)===newHead)return '';throw Error('Not an ancestor');}if(args[0]==='symbolic-ref'){if(args.at(-1)!=='HEAD')throw Object.assign(Error('Direct branch'),{code:1});return 'refs/heads/main';}if(args[0]==='remote')return remote;if(args[0]==='rev-list')return `${newHead} ${oldHead}`;if(args[0]==='rev-parse')return args.includes('--is-shallow-repository')?'false':args.includes('--show-toplevel')?root:args.includes('--git-common-dir')||args.includes('--absolute-git-dir')?path.join(root,'.git'):commits?newHead:oldHead;if(args[0]==='status')return '';throw Error('Unexpected Git command');};
 const plan=()=>({root,remote,page,branch:'main',head:commits>1?'c'.repeat(40):commits?newHead:oldHead,status:edited?' M a':'',fingerprint:edited?'before':'after',changes:edited?[{path:'a',kind:'M'}]:[]});
 github.prepareLocalCommit=async()=>{prepared++;await afterPrepare();return plan();};github.prepareUpload=async()=>plan();
 github.uploadPrepared=async(p,message,options)=>{assert.equal(options.localOnly,true);await options.beforeUpload();options.onProgress?.('Saving the reviewed project changes in Git…');await afterProgress();commits++;edited=false;await afterCommit();return {committed:true,uploaded:false,branch:'main',head:commits>1?'c'.repeat(40):newHead};};
 github.syncExistingHead=async(p,options)=>{await options.beforeUpload();if(pushThroughTransport)await options.networkRun(root,['push',remote,`${p.head}:refs/heads/main`]);syncs++;await afterSync();return {uploaded:true,head:p.head,branch:'main'};};
 const session={id:'session',account:{id:'1',label:'student'},accessToken:'test',scopes:[]};
 const vscode={authentication:{registerAuthenticationProvider:disposable,getSession:async()=>session,onDidChangeSessions:fn=>{authEvent=fn;return disposable();}},workspace:{isTrusted:true,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],textDocuments:[],registerTextDocumentContentProvider:disposable,onDidCloseTextDocument:disposable,onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}})},window:{createOutputChannel:()=>({appendLine:text=>logs.push(text),clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showInputBox:async()=>{inputs++;await afterInput();return inputResult;},showQuickPick:async()=>undefined,showWarningMessage:async(text,options,...buttons)=>{warnings.push({text,options,buttons});await afterWarning();return warningChoice;},showInformationMessage:async()=>undefined,showErrorMessage:async text=>errors.push(text)},tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath,scheme:'file'})},EventEmitter:class{event(){}fire(){}dispose(){}}};
 if(trackFiles)vscode.window.createTreeView=()=>disposable();
 const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){if(id==='./student-explorer'&&trackFiles)return {createStudentExplorer:()=>({commands:{},isPreview:()=>true,invalidate(){fileRefreshes++;if(failFilesRefresh)throw Error('injected Files refresh failure');},dispose(){}})};if(id==='./transport')return {createTransport:(_remote,authenticate,options)=>async(root,args,binding)=>{if(args[0]==='ls-remote'){await authenticate();options.assertCurrentNow();if(remoteCheck==='offline')throw Object.assign(Error('Network unavailable'),{kind:'network'});return remoteCheck==='missing'?'':`${oldHead}\t${args[3]}`;}binding.assertCurrentNow();transportEvents.push({root,args,binding,locked:await fs.readFile(path.join(root,'.git','zero-commit-provenance.lock'),'utf8'),receiptPresent:await fs.stat(path.join(root,'.git','zero-commit-provenance.json')).then(()=>true,()=>false)});return '';}};if(id==='./git-tracking')return {updateRemoteTracking:async()=>({updated:true})};if(id==='./web-publish-upload-auth')return {selectUploadAuthentication:async({authentication,initialTicket})=>{authSelections++;return {ticket:initialTicket,authentication,permissions:{contents:'write'},dispose(){}};}};return id==='vscode'?textInputs(vscode):oldLoad.call(this,id,...args);};
 let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
 const subscriptions=[];extension.activate({subscriptions,workspaceState:{get:key=>stored.get(key),keys:()=>[...stored.keys()],update:async(key,value)=>{writes.push({key,value});if(failLocalAdd&&value?.type==='local')throw Error('Local reminder storage unavailable');if(key.startsWith('zero.resolvedSync.v1:')){if(failReview)throw Error('Storage unavailable');await afterReview();}if(failClear&&key.startsWith('zero.gitUploadRecovery:')&&value===undefined)throw Error('Storage unavailable');stored.set(key,value);}}},{repositoryLedgerFactory:require('./fixtures/repository-ledger').repositoryLedgerFactory,provider:appSessions(vscode,{dispose(){},async removeSession(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
 t.after(()=>{subscriptions.forEach(value=>value.dispose());core.repositoryRoot=original.repo;core.git=original.git;core.resolveProject=original.resolve;github.prepareLocalCommit=original.prepare;github.uploadPrepared=original.upload;github.prepareUpload=original.prepareUpload;github.syncExistingHead=original.sync;delete require.cache[require.resolve('../src/extension')];});
 const webview={html:'',onDidReceiveMessage:disposable};webviewProvider.resolveWebviewView({webview,onDidDispose:disposable});
 const deadline=Date.now()+3000;while(!webview.html.includes('Current branch: main')){assert.ok(Date.now()<deadline,'project should become ready');await new Promise(resolve=>setImmediate(resolve));}
 const dirty=()=>({isDirty:true,version:2,uri:{scheme:'file',fsPath:path.join(root,'a')}});
 return {root,commands,errors,logs,stored,writes,warnings,gitCalls,transportEvents,vscode,webview,dirty,changeAccount(){session.id='other-session';session.account={id:'2',label:'other'};authEvent();},get remote(){return remote;},set remote(value){remote=value;},set remoteCheck(value){remoteCheck=value;},set pushThroughTransport(value){pushThroughTransport=value;},set afterReview(value){afterReview=value;},set failClear(value){failClear=value;},set failLocalAdd(value){failLocalAdd=value;},set warningChoice(value){warningChoice=value;},set failReview(value){failReview=value;},set afterWarning(value){afterWarning=value;},get saves(){return saves;},get inputs(){return inputs;},set inputResult(value){inputResult=value;},editAgain(){edited=true;},get authSelections(){return authSelections;},get fileRefreshes(){return fileRefreshes;},set failFilesRefresh(value){failFilesRefresh=value;},get commits(){return commits;},get syncs(){return syncs;},get prepared(){return prepared;},set afterInput(value){afterInput=value;},set afterPrepare(value){afterPrepare=value;},set afterProgress(value){afterProgress=value;},set afterCommit(value){afterCommit=value;},set afterSync(value){afterSync=value;}};
}
async function checkStatus(f,mode,expected){
 const until=Date.now()+3000;while(f.webview.html.includes('Checking this branch on GitHub')){assert.ok(Date.now()<until);await new Promise(resolve=>setImmediate(resolve));}
 f.remoteCheck=mode;await f.commands.get('zero.checkBranchConnection')();
 while(!f.webview.html.includes(expected)&&Date.now()<until)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(f.webview.html.includes(expected),f.webview.html.match(/<div class="branch-connection"[\s\S]*?<\/div>/)?.[0]);
}
test('Commit retains a confirmed missing-branch observation for its new local head',async t=>{
 const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');
 await f.commands.get('zero.commitChanges')('My changes');
 assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.transportEvents.length,0);
 const record=[...f.stored.entries()].filter(([key])=>key.startsWith('zero.pendingSync.v1:')).map(([,value])=>value).find(value=>value.kind==='remote-missing');
 assert.ok(record);assert.equal(record.root,f.root);assert.equal(record.remote,f.remote);assert.equal(record.branch,'main');assert.equal(record.head,'b'.repeat(40));assert.equal(record.accountId,'1');assert.equal(record.pushStarted,false);
 assert.match(f.webview.html,/Review branch creation/);
 await f.commands.get('zero.retryBranchSync')();assert.match(f.warnings.at(-1).text,/Sync this missing GitHub branch/);assert.match(f.warnings.at(-1).options.detail,/refs\/heads\/main/);assert.equal(f.syncs,0);assert.equal(f.transportEvents.length,0);
});
test('a changed account after a missing-branch check blocks the commit',async t=>{
 const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');f.afterInput=async()=>f.changeAccount();
 await f.commands.get('zero.commitChanges')();assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.match(f.errors.at(-1),/changed after the connection check/i);
});
test('a changed destination after a missing-branch check blocks the commit',async t=>{
 const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');
 f.afterInput=async()=>{f.remote='https://github.com/student/other.git';};await f.commands.get('zero.commitChanges')();
 assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.match(f.errors.at(-1),/changed after the connection check/i);
});
test('a stale missing-branch observation still prevents an automatic push',async t=>{
 const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');
 const now=Date.now;Date.now=()=>now()+121000;
 try{await f.commands.get('zero.commitChanges')('My changes');}finally{Date.now=now;}
 assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.transportEvents.length,0);
 assert.ok([...f.stored.values()].some(value=>value?.kind==='remote-missing'&&value.head==='b'.repeat(40)));
});
test('an offline recheck does not erase an earlier missing-branch observation',async t=>{
 const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');await checkStatus(f,'offline','Offline or connection unavailable');
 await f.commands.get('zero.commitChanges')('My changes');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.ok([...f.stored.values()].some(row=>row?.kind==='remote-missing'&&row.head==='b'.repeat(40)));
});
test('legacy upload preserves changes and records a known missing branch for review',async t=>{
 const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');await f.commands.get('zero.uploadToGitHub')();
 assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.equal(f.transportEvents.length,0);assert.match(f.errors.at(-1),/Review branch creation/);
 assert.ok([...f.stored.values()].some(value=>value?.kind==='remote-missing'&&value.head==='a'.repeat(40)&&value.accountId==='1'));
});
test('saved-commit and local-reminder sync disclose missing-branch creation before confirmation',async t=>{
 for(const local of [false,true])await t.test(local?'local reminder':'saved commits',async t=>{
  const f=await fixture(t);await checkStatus(f,'missing','This branch was missing on GitHub at the last check');
  if(local)f.stored.set('zero.pendingSync.v1:local',{id:'local',root:f.root,branch:'main',head:'a'.repeat(40),remote:'',type:'local'});
  await f.commands.get(local?'zero.syncLocalCommit':'zero.syncSavedCommits')();
  assert.equal(f.syncs,0);assert.equal(f.transportEvents.length,0);assert.match(f.warnings.at(-1).options.detail,/refs\/heads\/main/);assert.match(f.warnings.at(-1).options.detail,/check and push are not atomic/);
 });
});
test('an offline branch check does not become a missing-branch reminder',async t=>{
 const f=await fixture(t);await checkStatus(f,'offline','Offline or connection unavailable');
 await f.commands.get('zero.commitChanges')('My changes');assert.equal(f.commits,1);assert.equal(f.syncs,1);assert.equal([...f.stored.values()].some(value=>value?.kind==='remote-missing'),false);
});
test('Commit preserves incomplete deleted-file recovery and does not stage or sync',async t=>{
 for(const timing of ['before review','after review'])await t.test(timing,async t=>{
  const f=await fixture(t),folder=path.join(f.root,'.git','zero-file-restore-recovery-abc123');
  if(timing==='before review')await fs.mkdir(folder);else f.afterPrepare=async()=>{await fs.mkdir(folder,{recursive:true});};
  await f.commands.get('zero.commitChanges')('My changes');
  assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.equal(f.transportEvents.length,0);assert.ok(await fs.stat(folder));assert.match(f.errors.at(-1),/restoration or initial project discard needs inspection/i);
 });
});
test('student Commit blocks unsaved project aliases before prompting or preparing',async t=>{
 const f=await fixture(t),alias=f.root+'-alias';await fs.symlink(f.root,alias);t.after(()=>fs.unlink(alias));
 const doc={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(alias,'a')}};f.vscode.workspace.textDocuments=[doc];
 await f.commands.get('zero.commitChanges')();assert.equal(f.inputs,0);assert.equal(f.prepared,0);assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.equal(f.saves,0);assert.equal(doc.isDirty,true);assert.match(f.errors.at(-1),/Save or undo/);
});
test('student Commit preserves unrelated open editors through successful sync and cancellation',async t=>{
 for(const cancelled of [true,false])await t.test(cancelled?'cancel':'success',async t=>{
  const f=await fixture(t),doc={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(path.dirname(f.root),'other-project.txt')}};f.vscode.workspace.textDocuments=[doc];
  if(cancelled)f.inputResult=undefined;await f.commands.get('zero.commitChanges')();assert.equal(f.saves,0);assert.equal(doc.isDirty,true);
  assert.equal(f.commits,cancelled?0:1);assert.equal(f.syncs,cancelled?0:1);assert.equal(f.prepared,cancelled?0:2);assert.deepEqual(f.errors,[]);
 });
});
test('a project editor made dirty after the commit prompt blocks the commit',async t=>{
 const f=await fixture(t);f.afterInput=async()=>{f.vscode.workspace.textDocuments=[f.dirty()];};await f.commands.get('zero.commitChanges')();
 assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.match(f.errors.at(-1),/Save or undo your project editor changes.*edits are kept/i);
});
test('a project edit made during commit planning blocks staging and commit',async t=>{
 const f=await fixture(t);f.afterPrepare=async()=>{f.vscode.workspace.textDocuments=[f.dirty()];};await f.commands.get('zero.commitChanges')('My changes');
 assert.equal(f.prepared,1);assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.equal(f.saves,0);assert.match(f.errors.at(-1),/Save your project files.*newer edits are kept/i);
});
test('unsaved project edits made while syncing are reported as kept',async t=>{
 const f=await fixture(t);f.afterSync=async()=>{f.vscode.workspace.textDocuments=[f.dirty()];};await f.commands.get('zero.commitChanges')('My changes');
 assert.equal(f.commits,1);assert.equal(f.syncs,1);assert.deepEqual(f.errors,[]);assert.match(f.logs.at(-1),/newer edits kept/i);assert.equal(f.vscode.workspace.textDocuments[0].isDirty,true);
});
test('the local student commit records verified provenance before sync starts',async t=>{
 const f=await fixture(t);let receipt;
 f.afterSync=async()=>{receipt=JSON.parse(await fs.readFile(path.join(f.root,'.git','zero-commit-provenance.json'),'utf8'));};
 await f.commands.get('zero.commitChanges')('My changes');
 assert.equal(f.commits,1);assert.equal(f.syncs,1);assert.equal(receipt.root,f.root);assert.equal(receipt.branch,'main');assert.equal(receipt.head,'b'.repeat(40));assert.equal(receipt.parent,'a'.repeat(40));assert.equal(receipt.pushStarted,false);
});
test('an existing provenance lock blocks the commit without stealing the lock',async t=>{
 const f=await fixture(t),lock=path.join(f.root,'.git','zero-commit-provenance.lock');await fs.writeFile(lock,'active');
 await f.commands.get('zero.commitChanges')('My changes');assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.equal(await fs.readFile(lock,'utf8'),'active');assert.match(f.errors.at(-1),/Close other Zero windows/);
});
test('student sync uses the common lock and bound transport after invalidating the receipt',async t=>{
 const f=await fixture(t);f.pushThroughTransport=true;
 await f.commands.get('zero.commitChanges')('My changes');
 assert.equal(f.commits,1);assert.equal(f.syncs,1);assert.equal(f.transportEvents.length,1);const event=f.transportEvents[0];
 assert.equal(event.args[0],'push');assert.equal(event.binding.root,f.root);assert.equal(event.binding.commonDir,path.join(f.root,'.git'));assert.equal(event.receiptPresent,false);
 assert.equal(await fs.stat(path.join(f.root,'.git','zero-commit-provenance.lock')).then(()=>true,()=>false),false);
});
test('unresolved sync recovery blocks committing even when its origin differs',async t=>{
 for(const remote of ['https://github.com/student/app.git','https://github.com/student/other.git'])await t.test(remote,async t=>{
  const f=await fixture(t),key=`zero.gitUploadRecovery:${f.root}:main`,record={root:f.root,remote,page:remote.slice(0,-4),branch:'main',head:'c'.repeat(40),committed:true,pushStarted:true,kind:'network',accountId:'1'};f.stored.set(key,record);
  await f.commands.get('zero.commitChanges')('My changes');assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.deepEqual(f.stored.get(key),record);assert.match(f.errors.at(-1),/earlier sync reminder.*(?:inspection|not in this branch)/i);
 });
});

test('an unrelated pending local commit blocks a new commit and retains its reminder',async t=>{
 const f=await fixture(t),key=`zero.localCommitPending:${f.root}:main`,record={root:f.root,branch:'main',head:'c'.repeat(40)};f.stored.set(key,record);
 await f.commands.get('zero.commitChanges')('My changes');assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.deepEqual(f.stored.get(key),record);assert.match(f.errors.at(-1),/earlier local commit.*reminder is kept/i);
});
test('reviewing a behind or changed-destination reminder records review before clearing it',async t=>{
 for(const [kind,remote] of [['behind','https://github.com/student/app.git'],['destination-changed','https://github.com/student/other.git']])await t.test(kind,async t=>{
  const f=await fixture(t),key=`zero.gitUploadRecovery:${f.root}:main`,record={root:f.root,remote,page:remote.slice(0,-4),branch:'main',head:'c'.repeat(40),committed:true,pushStarted:true,kind,accountId:'1'};f.stored.set(key,record);f.warningChoice='Mark reviewed';
  await f.commands.get('zero.reviewPendingSync')();assert.deepEqual(f.errors,[]);assert.equal(f.warnings.length,1);assert.equal(f.warnings[0].options.modal,true);assert.match(f.warnings[0].options.detail,/does not confirm that GitHub received/i);assert.ok(f.warnings[0].options.detail.includes(record.page));
  const review=f.writes.findIndex(write=>write.key.startsWith('zero.resolvedSync.v1:'));assert.ok(review>=0);assert.equal(f.writes[review].value.record.head,record.head);assert.deepEqual(f.stored.get(key),record);assert.equal(f.writes.some(write=>write.key===key&&write.value===undefined),false);assert.equal(f.syncs,0);assert.match(f.logs.at(-1),/receipt was not inferred/i);
 });
});
test('cancelled, unrecorded, or stale sync review keeps the reminder and makes no sync claim',async t=>{
 for(const scenario of ['cancel','storage failure','changed reminder','changed workspace'])await t.test(scenario,async t=>{
  const f=await fixture(t),key=`zero.gitUploadRecovery:${f.root}:main`,record={root:f.root,remote:f.remote,page:'https://github.com/student/app',branch:'main',head:'c'.repeat(40),committed:true,pushStarted:true,kind:'behind',accountId:'1'};f.stored.set(key,record);
  f.warningChoice=scenario==='cancel'?undefined:'Mark reviewed';if(scenario==='storage failure')f.failReview=true;
  if(scenario==='changed reminder')f.afterWarning=async()=>{f.stored.set(key,{...record,head:'d'.repeat(40)});};
  if(scenario==='changed workspace')f.afterWarning=async()=>{f.vscode.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:path.dirname(f.root)}}];};
  await f.commands.get('zero.reviewPendingSync')();assert.ok(f.stored.get(key));assert.equal(f.writes.some(write=>write.key===key&&write.value===undefined),false);assert.equal(f.syncs,0);assert.ok(!f.logs.some(line=>/receipt was not inferred/i.test(line)));
  if(scenario!=='cancel')assert.ok(f.errors.length>0);
 });
});

test('a changed reminder while its review is being recorded remains active',async t=>{
 const f=await fixture(t),key=`zero.gitUploadRecovery:${f.root}:main`,record={root:f.root,remote:f.remote,page:'https://github.com/student/app',branch:'main',head:'c'.repeat(40),committed:true,pushStarted:true,kind:'behind',accountId:'1'},newer={...record,head:'d'.repeat(40)};
 f.stored.set(key,record);f.warningChoice='Mark reviewed';f.afterReview=async()=>{f.stored.set(key,newer);};
 await f.commands.get('zero.reviewPendingSync')();assert.deepEqual(f.stored.get(key),newer);assert.equal(f.writes.some(write=>write.key===key&&write.value===undefined),false);assert.deepEqual(f.errors,[]);assert.ok(f.writes.some(write=>write.key.startsWith('zero.resolvedSync.v1:')&&write.value.record.head===record.head));assert.match(f.webview.html,/Review earlier sync/);assert.equal(f.syncs,0);
});
test('unrelated pending ancestry ignores replacement objects',async t=>{
 const f=await fixture(t),key=`zero.localCommitPending:${f.root}:main`,record={root:f.root,branch:'main',head:'c'.repeat(40)};f.stored.set(key,record);
 await f.commands.get('zero.commitChanges')('My changes');assert.equal(f.commits,0);assert.deepEqual(f.stored.get(key),record);assert.match(f.errors.at(-1),/earlier local commit/i);
 assert.ok(f.gitCalls.some(args=>args[0]==='--no-replace-objects'&&args[1]==='merge-base'&&args[2]==='--is-ancestor'&&args[3]===record.head));assert.equal(f.gitCalls.some(args=>args[0]==='merge-base'),false);
});

test('a possibly started push requires status confirmation and resolves only its exact group',async t=>{
 const f=await fixture(t),base={root:f.root,remote:f.remote,page:'https://github.com/student/app',branch:'main',head:'a'.repeat(40),committed:true,pushStarted:true,kind:'network',accountId:'1'};
 const entries=[{...base,id:'match'}, {...base,id:'other-remote',remote:'https://github.com/student/else.git'}, {...base,id:'other-account',accountId:'2'}, {...base,id:'merge',operation:'merge'}];
 for(const entry of entries)f.stored.set('zero.pendingSync.v1:'+entry.id,entry);
 await f.commands.get('zero.retryBranchSync')();assert.match(f.errors.at(-1),/Check GitHub status/);assert.equal(f.syncs,0);assert.equal([...f.stored.keys()].filter(key=>key.startsWith('zero.resolvedSync.v1:')).length,0);
 const original=github.checkUpload;let checked=0;t.after(()=>{github.checkUpload=original;});
 github.checkUpload=async(root,record,{beforeNetwork})=>{assert.equal(root,f.root);assert.equal(record.id,'match');await beforeNetwork();checked++;return {confirmed:true,head:record.head};};
 await f.commands.get('zero.checkPush')();assert.equal(checked,1);assert.equal(f.syncs,0);
 const markers=[...f.stored.entries()].filter(([key])=>key.startsWith('zero.resolvedSync.v1:')).map(([,value])=>value);
 assert.deepEqual(markers.map(value=>value.id),['match']);assert.equal(markers[0].reason,'confirmed');
 for(const entry of entries.slice(1))assert.deepEqual(f.stored.get('zero.pendingSync.v1:'+entry.id),entry);
});
test('earlier push reminder permits repeated local commits without auth or transport',async t=>{
 const f=await fixture(t),prior={id:'prior',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,page:'https://github.com/student/app',type:'push',operation:'branch',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true};f.stored.set('zero.pendingSync.v1:prior',prior);
 for(let i=0;i<2;i++){if(i)f.editAgain();await f.commands.get('zero.commitChanges')('Save offline work');assert.equal(f.commits,i+1);assert.equal(f.syncs,0);assert.equal(f.authSelections,0);assert.equal(f.transportEvents.length,0);assert.deepEqual(f.stored.get('zero.pendingSync.v1:prior'),prior);assert.match(f.logs.at(-1),/earlier sync reminder is kept/i);}
 const locals=[...f.stored.values()].filter(row=>row?.type==='local');assert.ok(locals.some(row=>row.head==='b'.repeat(40)));assert.ok(locals.some(row=>row.head==='c'.repeat(40)));assert.deepEqual(f.errors,[]);
});
test('unrecognized push reminder still blocks local commit',async t=>{const f=await fixture(t);f.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,type:'push',operation:'unknown',kind:'network'});await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.match(f.errors.at(-1),/reminder needs inspection/i);});
test('a reminder arriving after the commit defers transport and retains local work',async t=>{const f=await fixture(t);let preparations=0;const prior={id:'late',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,type:'push',operation:'branch',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true};f.afterPrepare=async()=>{if(++preparations===2)f.stored.set('zero.pendingSync.v1:late',prior);};await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.authSelections,0);assert.deepEqual(f.stored.get('zero.pendingSync.v1:late'),prior);assert.ok([...f.stored.values()].some(row=>row?.type==='local'&&row.head==='b'.repeat(40)));});
test('failed local reminder publication reports saved commit and retains earlier reminder',async t=>{const f=await fixture(t),prior={id:'prior',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,type:'push',operation:'branch',accountId:'1',kind:'network',committed:true,pushStarted:false};f.stored.set('zero.pendingSync.v1:prior',prior);f.failLocalAdd=true;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.deepEqual(f.stored.get('zero.pendingSync.v1:prior'),prior);assert.match(f.errors.at(-1),/saved locally.*reminder could not be recorded/i);});

test('unrecognized push kind blocks local commit and leaves evidence',async t=>{const f=await fixture(t),prior={id:'prior',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,type:'push',operation:'branch',kind:'unknown-kind',accountId:'1',committed:true,pushStarted:true};f.stored.set('zero.pendingSync.v1:prior',prior);await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,0);assert.equal(f.syncs,0);assert.equal(f.authSelections,0);assert.equal(f.transportEvents.length,0);assert.deepEqual(f.stored.get('zero.pendingSync.v1:prior'),prior);assert.match(f.errors.at(-1),/reminder needs inspection/i);});
test('legacy reminder without kind is preserved when local commit defers transport',async t=>{const f=await fixture(t),key=`zero.gitUploadRecovery:${f.root}:main`,prior={root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,page:'https://github.com/student/app',accountId:'1',committed:true,pushStarted:true};f.stored.set(key,prior);await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.authSelections,0);assert.equal(f.transportEvents.length,0);assert.deepEqual(f.stored.get(key),prior);assert.ok([...f.stored.values()].some(row=>row?.type==='local'&&row.head==='b'.repeat(40)));assert.deepEqual(f.errors,[]);});

test('Files refreshes once after a synced local commit without watcher events',async t=>{const f=await fixture(t,{trackFiles:true}),before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,1);assert.equal(f.fileRefreshes-before,1);assert.deepEqual(f.errors,[]);});
test('Files refreshes once after a local-only commit without a remote',async t=>{const f=await fixture(t,{trackFiles:true});f.remote='';const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.fileRefreshes-before,1);assert.deepEqual(f.errors,[]);});
test('Files refreshes after a saved commit even if its deferred reminder fails',async t=>{const f=await fixture(t,{trackFiles:true}),prior={id:'prior',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,type:'push',operation:'branch',accountId:'1',kind:'network',committed:true,pushStarted:false};f.stored.set('zero.pendingSync.v1:prior',prior);f.failLocalAdd=true;f.failFilesRefresh=true;const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.fileRefreshes-before,1);assert.match(f.errors.at(-1),/saved locally.*reminder could not be recorded/i);assert.ok(f.logs.some(text=>/Files refresh: injected Files refresh failure/.test(text)));});
test('cancelled Commit does not refresh Files',async t=>{const f=await fixture(t,{trackFiles:true});f.inputResult=undefined;const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')();assert.equal(f.commits,0);assert.equal(f.fileRefreshes-before,0);});
test('Files refreshes once when an earlier sync defers transport',async t=>{const f=await fixture(t,{trackFiles:true}),prior={id:'prior',root:f.root,branch:'main',head:'a'.repeat(40),remote:f.remote,type:'push',operation:'branch',accountId:'1',kind:'network',committed:true,pushStarted:false};f.stored.set('zero.pendingSync.v1:prior',prior);const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.syncs,0);assert.equal(f.fileRefreshes-before,1);assert.deepEqual(f.errors,[]);assert.deepEqual(f.stored.get('zero.pendingSync.v1:prior'),prior);});
test('Files refreshes when local commit recovery is reported as an error',async t=>{const f=await fixture(t,{trackFiles:true});f.afterCommit=async()=>{throw Object.assign(Error('Saved commit needs inspection'),{localCommitRecovery:{root:f.root,branch:'main',head:'b'.repeat(40)}});};const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,1);assert.equal(f.fileRefreshes-before,1);assert.match(f.errors.at(-1),/Saved commit needs inspection/);});
test('Files refreshes after staging fails with no confirmed commit',async t=>{const f=await fixture(t,{trackFiles:true});f.afterProgress=async()=>{throw Error('Staging failed; changes may remain staged');};const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.commits,0);assert.equal(f.fileRefreshes-before,1);assert.match(f.errors.at(-1),/Staging failed/);});
test('Files refreshes when commit outcome is uncertain',async t=>{const f=await fixture(t,{trackFiles:true});f.afterProgress=async()=>{throw Object.assign(Error('Commit outcome uncertain'),{localCommitUncertain:{root:f.root,branch:'main'}});};const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')('Save');assert.equal(f.fileRefreshes-before,1);assert.match(f.errors.at(-1),/Commit outcome uncertain/);});
test('Files does not refresh when Commit preflight rejects before staging',async t=>{const f=await fixture(t,{trackFiles:true});f.afterInput=async()=>{f.vscode.workspace.textDocuments=[f.dirty()];};const before=f.fileRefreshes;await f.commands.get('zero.commitChanges')();assert.equal(f.commits,0);assert.equal(f.fileRefreshes-before,0);assert.match(f.errors.at(-1),/Save or undo|Save your/);});
test('deleted-file restore direct command is deferred without changing the index',async t=>{
 const f=await fixture(t),index=path.join(f.root,'.git','index');await fs.writeFile(index,'retained index');const original=Object.getOwnPropertyDescriptor(process,'platform');
 try{for(const platform of ['darwin','win32','linux']){Object.defineProperty(process,'platform',{...original,value:platform});const calls=f.gitCalls.length;await f.commands.get('zero.restoreDeletedFile')({root:f.root,relative:'gone.txt'});assert.match(f.errors.at(-1),/temporarily unavailable.*Source Control/i);assert.equal(f.gitCalls.length,calls);assert.equal(await fs.readFile(index,'utf8'),'retained index');}}finally{Object.defineProperty(process,'platform',original);}
});
