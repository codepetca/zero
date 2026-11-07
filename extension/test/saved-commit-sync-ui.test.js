'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const core=require('../src/core'),github=require('../src/github');
const {appSessions}=require('./fixtures/app-sessions'),{textInputs}=require('./fixtures/text-input');
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
const disposable=()=>({dispose(){}}),A='a'.repeat(40),B='b'.repeat(40),OTHER='d'.repeat(40);
const waitFor=async condition=>{const deadline=Date.now()+5000;while(!condition()){assert.ok(Date.now()<deadline,'Expected saved-commit sync state');await new Promise(resolve=>setTimeout(resolve,5));}};

// Git observations and authenticated transfers stay in memory. The real
// provenance lock and reminder gate operate only in this disposable folder.
async function harness(t,{missing=false,choice=true,dirty=false,dirtyBuffer=dirty,branch='main',disconnected=false,cancelInput=false,noLedger=false,productionCompatibility=false,graftsInCommonDir=false,mergeRecovery=false,updated=false,updateTo,correctionReceipt,realCheck=false,finishResult=false,mockPublish=false,mockStart=false,reftableUpdate=false,archivedGate=false,refOnlyFixture=false,nativeScm=false}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-saved-sync-')));
  await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.mkdir(path.join(root,'.git'));
  let commonDir=path.join(root,'.git');
  if(productionCompatibility){
    const {execFileSync}=require('node:child_process');
    const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull};
    const git=(...args)=>execFileSync('git',args,{cwd:root,env,stdio:'pipe'});
    git('init','-q');git('config','--local','core.worktree',root);
  }
  const original={git:core.git,assert:core.assertRepositoryRoot,repo:core.repositoryRoot,connect:core.connectRepository,prepare:github.prepareUpload,sync:github.syncExistingHead,upload:github.uploadPrepared,check:github.checkUpload};
  let head=B,remoteHead=missing?null:A,childRemoteHead=null,remote=disconnected?'':'https://github.com/student/app.git',status=dirty?' M Main.java':'',fingerprint='reviewed-files',view,authEvent,recovery;
  let session={id:'session',account:{id:'1',label:'student'},accessToken:'FIXTURE_ONLY'},afterWarning=async()=>{},onStart=async()=>{},afterBranchCreate=async()=>{},beforeDispatch=async()=>{},beforeBranchRead=async()=>{},afterPush=async()=>{},afterCheck=async()=>{},afterConfirmation=async()=>{},afterUpdate=async()=>{},failPush=false,failRead=false,failConfirmation=false,failResolution=false,failResolutionAfter=Infinity,resolutionWrites=0,failAdd=false,saves=0,syncs=0,checks=0;
  const commands=new Map(),stored=new Map(),warnings=[],errors=[],logs=[],pushes=[],mainChecks=[],gitCalls=[],nativeCommands=[],subscriptions=[];
  const documents=dirtyBuffer?[{isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(root,'Main.java')},save:async()=>assert.fail('Saved-commit sync must not save editor contents')}]:[];
  core.assertRepositoryRoot=async()=>root;core.repositoryRoot=async()=>root;
  core.connectRepository=async()=>{remote='https://github.com/student/app.git';return {page:'https://github.com/student/app',remote};};
  core.git=async(_,args)=>{
    gitCalls.push(args);if(args[0]==='-c'&&args[1]==='core.fsmonitor=false')args=args.slice(2);
    assert.ok(!args.some(arg=>['reset','--reset','add','commit','push','fetch','pull','clone','ls-remote'].includes(arg)),'No child Git mutation or transport');
    if(args[0]==='--no-replace-objects'&&args[1]==='cat-file')return 'commit';
    if(args[0]==='--no-replace-objects'||args[0]==='merge-base'){if(args.includes(OTHER))throw Object.assign(Error('Not ancestor'),{code:1});return '';}
    if(args[0]==='config')throw Object.assign(Error('No matching config'),{code:1});
    if(args[0]==='symbolic-ref'){if(args.at(-1)!=='HEAD')throw Object.assign(Error('Direct ref'),{code:1});return `refs/heads/${branch}`;}
    if(args[0]==='remote'){if(!remote){if(args.length===1)return '';throw Object.assign(Error('No origin'),{code:2});}return args.length===1?'origin':remote;}
    if(args[0]==='ls-files')return '';
    if(args[0]==='rev-parse')return args.includes('--is-shallow-repository')?'false':args.includes('--show-toplevel')?root:args.includes('--git-common-dir')?commonDir:args.includes('--absolute-git-dir')?path.join(root,'.git'):head;
    if(args[0]==='status')return status;
    throw Error('Unexpected Git command: '+args[0]);
  };
  github.prepareUpload=async()=>({root,branch,head,remote,page:core.parseRepositoryUrl(remote).page,changes:status?[{path:'Main.java',kind:'M'}]:[],status,fingerprint});
  github.syncExistingHead=async(plan,{beforeUpload,networkRun})=>{
    syncs++;
    await beforeUpload();
    try {
      await networkRun(root,['push',plan.remote,`${plan.head}:refs/heads/${plan.branch}`]);await beforeUpload();
      const response=await networkRun(root,['ls-remote','--heads',plan.remote,`refs/heads/${plan.branch}`]);
      if(response!==`${plan.head}\trefs/heads/${plan.branch}`)throw Object.assign(Error('Unconfirmed'),{kind:'unconfirmed'});
      await afterConfirmation();return {uploaded:true,branch:plan.branch,head:plan.head,localChanged:status!==plan.status||fingerprint!==plan.fingerprint};
    }catch(error){error.uploadRecovery={root,branch:plan.branch,head:plan.head,remote:plan.remote,page:plan.page,committed:false,pushStarted:true,kind:error.kind||'network'};throw error;}
  };
  github.uploadPrepared=(plan,_message,options)=>github.syncExistingHead(plan,options);
  if(!realCheck)github.checkUpload=async(project,record,{beforeNetwork,networkRun})=>{
    assert.equal(typeof record.committed,'boolean');assert.equal(typeof record.pushStarted,'boolean');
    await beforeNetwork();
    const response=await networkRun(project,['ls-remote','--heads',record.remote,`refs/heads/${record.branch}`]);
    await afterCheck(record);
    return response===`${record.head}\trefs/heads/${record.branch}`?{confirmed:true,head:record.head}:{confirmed:false,remoteHead:response?OTHER:null};
  };
  const vscode={
    authentication:{getSession:async()=>session,onDidChangeSessions:fn=>{authEvent=fn;return disposable();},registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:root}}],textDocuments:documents,getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>{saves++;return true;},registerTextDocumentContentProvider:disposable,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine:value=>logs.push(value),dispose(){}}),registerWebviewViewProvider:(_,value)=>{view=value;return disposable();},registerTreeDataProvider:disposable,showQuickPick:async()=>{},showInputBox:async options=>options?.title==='GitHub repository URL'?'https://github.com/student/app':cancelInput?undefined:'child',showInformationMessage:async()=>{},showWarningMessage:async(message,options,...actions)=>{warnings.push({message,options,actions});await afterWarning();return choice?actions[0]:undefined;},showErrorMessage:async message=>errors.push(message)},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async(...args)=>nativeCommands.push(args),...(nativeScm?{getCommands:async()=>['workbench.view.scm']}:{})},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const load=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){
    if(id==='./pending-sync-ledger'&&noLedger){const actual=load.call(this,id,...args);return {...actual,createPendingSyncLedger:()=>({enumerable:noLedger==='enumerable',list:(project,name)=>[...stored.entries()].filter(([key,value])=>key.startsWith('zero.pendingSync.v1:')&&value.root===project&&value.branch===name).map(([,value])=>value),listAll:project=>{if(noLedger!=='enumerable')throw Error('Sync reminders cannot be fully enumerated in this window. Inspect Source Control before syncing.');return [...stored.entries()].filter(([key,value])=>key.startsWith('zero.pendingSync.v1:')&&value.root===project).map(([,value])=>value).sort((a,b)=>a.id.localeCompare(b.id));},add:async record=>{const value={...record,id:'generated-'+stored.size};stored.set('zero.pendingSync.v1:'+value.id,value);return value;},resolve:async record=>stored.delete('zero.pendingSync.v1:'+record.id)})};}
    if(id==='./repository-reminder-storage'&&noLedger==='enumerable')return {...load.call(this,id,...args),createRepositoryReminderStorage:()=>undefined};
    if(id==='./project-restore-plan'&&correctionReceipt)return {...load.call(this,id,...args),validatedCompletedProjectRestore:async()=>correctionReceipt};
    if(id==='./start-page'&&mockStart)return {createStartPage:()=>({show:async()=>onStart(),refresh(){},isOpen:()=>false,owns:()=>false,dispose(){}})};
    if(id==='./web-publish-ui'&&mockPublish)return {createWebPublishCommands:(_v,options)=>({commands:{'zero.testPublishUpload':()=>options.uploadChanges(options.authentication,{forPublish:true,expectedRoot:root})},disposables:[],hasPublishedApp:()=>false,publish:async()=>undefined,verifiedPublication:async()=>undefined})};
    if(id==='./student-file-status')return {readStudentFileStatus:async()=>new Map()};
    if(id==='./main-update-status')return {checkMainUpdate:async()=>{mainChecks.push(branch);return {state:'current',localUpdate:false};}};
    if(id==='./workflow'&&refOnlyFixture)return {...load.call(this,id,...args),readRecovery:async()=>undefined,prepareSync:async()=>({root,branch,head,remote,page:core.parseRepositoryUrl(remote).page,refStorage:'reftable',reftableRefOnly:true,remoteMainHead:OTHER,remoteBranch:'main'}),syncPrepared:async()=>{const base={root,branch,head:OTHER,sourceHead:B,reviewedMainHead:A,reviewedRemoteHead:OTHER,remote,page:core.parseRepositoryUrl(remote).page,accountId:'1',sessionId:'session',type:'push',operation:'reftable-ref-only',committed:false,pushStarted:false},pending={...base,id:'ref-pending-id',kind:'ref-pending'},acknowledged={...base,id:'ref-ack-id',kind:'ref-acknowledged',intentId:pending.id};stored.set('zero.pendingSync.v1:'+pending.id,pending);stored.set('zero.pendingSync.v1:'+acknowledged.id,acknowledged);head=OTHER;return {updated:true,branch,head,remote,page:base.page,remoteBranch:'main',remoteHead:OTHER,refOnlyOutcome:{pending,acknowledged}};}};
    if(id==='./workflow')return {...load.call(this,id,...args),readRecovery:async()=>recovery,resolveRecovery:async()=>{recovery=undefined;head=OTHER;return {synced:true,branch,head,remote,page:core.parseRepositoryUrl(remote).page};},prepareStart:async(_,name)=>({root,name,branch,head,remote,page:core.parseRepositoryUrl(remote).page,status:''}),startPrepared:async(plan,options)=>{await options.beforeMutation();if(plan.remote!==remote||plan.branch!==branch||plan.head!==head)throw Error('The project changed after branch review');branch=plan.name;await afterBranchCreate();return {branch,head};},...(updated?{prepareSync:async()=>({root,branch,head,remote,page:core.parseRepositoryUrl(remote).page,...(archivedGate?{refStorage:'reftable',reftableArchived:{id:'c'.repeat(40),feature:head},preview:{paths:1}}:reftableUpdate?{refStorage:'reftable',reftableUpdate:true,remoteMainHead:'c'.repeat(40),remoteBranch:'main',preview:{paths:1,fileNames:['Main.java']},...(reftableUpdate==='merge'?{mergeCandidate:{candidate:'c'.repeat(40),head,target:'a'.repeat(40)}}:{})}:{})}),syncPrepared:async(_plan,options)=>{if(reftableUpdate)assert.ok(options.ownedUpdate);await options.beforeMutation();await beforeDispatch();options.beforeMutationNow();if(updateTo)head=updateTo;await afterUpdate();return {updated:true,branch,head,remote,page:core.parseRepositoryUrl(remote).page};}}:{}),...(mergeRecovery?{prepareFinish:async()=>{throw Object.assign(Error('Pending finish'),{pendingFinishDrift:true});},preparePendingFinishRecovery:async()=>({root,branch,remote,pending:{id:head}}),recoverPendingFinish:async(_plan,options)=>{await options.beforeMutation();return mergeRecovery==='missing'?{recovered:false,needsSync:true,remoteHead:null}:mergeRecovery==='needsPush'?{recovered:false,needsPush:true,candidate:B,remote,page:core.parseRepositoryUrl(remote).page}:{recovered:true,branch,finishedHead:head,remote};}}:finishResult?{prepareFinish:async()=>({root,branch,head,remote,page:core.parseRepositoryUrl(remote).page,mainHead:A,remoteMainHead:typeof finishResult==='string'?finishResult:A,pending:{id:B}}),finishPrepared:async(_plan,options)=>{await options.beforeMutation();await beforeDispatch();options.beforeMutationNow();const finishedBranch=branch;branch='main';return {finished:true,finishedBranch,branch,head:B,remote,page:core.parseRepositoryUrl(remote).page};}}:{})};
    if(id==='./transport')return {createTransport:(_,authenticate,{assertCurrentNow})=>async(_root,args)=>{
      await authenticate();assertCurrentNow();
      if(args[0]==='push'){pushes.push(args);if(failPush)throw Object.assign(Error('Offline fixture'),{kind:'network'});remoteHead=args[2].split(':')[0];if(args[2].endsWith(':refs/heads/child'))childRemoteHead=remoteHead;await afterPush();return '';}
      assert.equal(args[0],'ls-remote');checks++;await beforeBranchRead();if(failRead)throw Object.assign(Error('Offline fixture'),{kind:'network'});const observed=args[3]==='refs/heads/child'?childRemoteHead:remoteHead;return observed===null?'':`${failConfirmation?OTHER:observed}\t${args[3]}`;
    }};
    if(id==='./git-tracking')return {updateRemoteTracking:async()=>({updated:true})};
    return id==='vscode'?textInputs(vscode):load.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
  extension.activate({subscriptions,workspaceState:{keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>{if(failAdd&&key.startsWith('zero.pendingSync.v1:'))throw Error('Reminder storage unavailable');if(key.startsWith('zero.resolvedSync.v1:')&&(failResolution||++resolutionWrites>failResolutionAfter))throw Error('Fixture reminder resolution failed');stored.set(key,value);}}},{...(noLedger||productionCompatibility?{}:{repositoryLedgerFactory}),provider:appSessions(vscode,{dispose(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  t.after(async()=>{subscriptions.forEach(value=>value.dispose());core.git=original.git;core.assertRepositoryRoot=original.assert;core.repositoryRoot=original.repo;core.connectRepository=original.connect;github.prepareUpload=original.prepare;github.syncExistingHead=original.sync;github.uploadPrepared=original.upload;github.checkUpload=original.check;delete require.cache[require.resolve('../src/extension')];await fs.rm(root,{recursive:true,force:true});});
  await waitFor(()=>webview.html.includes(disconnected?'Local project · no GitHub remote connected.':'data-command="zero.syncSavedCommits"'));
  if(graftsInCommonDir){commonDir=path.join(root,'git-common');await fs.mkdir(path.join(commonDir,'info'),{recursive:true});await fs.writeFile(path.join(commonDir,'info','grafts'),`${B} ${A}\n`);}
  return {root,stored,warnings,errors,logs,pushes,webview,commands,documents,mainChecks,gitCalls,nativeCommands,setTrust(value){vscode.workspace.isTrusted=value;},setWorkspace(value){vscode.workspace.workspaceFolders=[{uri:{fsPath:value}}];},sync:()=>commands.get('zero.syncSavedCommits')(),check:()=>commands.get('zero.checkBranchConnection')(),get saves(){return saves;},get syncs(){return syncs;},get checks(){return checks;},set choice(value){choice=value;},set recovery(value){recovery=value;},set onStart(value){onStart=value;},set beforeDispatch(value){beforeDispatch=value;},set afterBranchCreate(value){afterBranchCreate=value;},set beforeBranchRead(value){beforeBranchRead=value;},set afterWarning(value){afterWarning=value;},set afterPush(value){afterPush=value;},set afterCheck(value){afterCheck=value;},set afterConfirmation(value){afterConfirmation=value;},set afterUpdate(value){afterUpdate=value;},set head(value){head=value;},set branch(value){branch=value;},set remote(value){remote=value;},set remoteHead(value){remoteHead=value;},set childRemoteHead(value){childRemoteHead=value;},set status(value){status=value;},set fingerprint(value){fingerprint=value;},set failAdd(value){failAdd=value;},get recovery(){return recovery;},set failPush(value){failPush=value;},set failRead(value){failRead=value;},set failConfirmation(value){failConfirmation=value;},set failResolution(value){failResolution=value;},set failResolutionAfter(value){failResolutionAfter=value;},changeSession(){session={...session,accessToken:'REPLACED_FIXTURE_ONLY'};authEvent({changed:[session]});},changeAccount(){session={...session,id:'other-session',account:{id:'2',label:'other'}};authEvent({changed:[session]});},activeRecords:()=>[...stored.entries()].filter(([key])=>key.startsWith('zero.pendingSync.v1:')).map(([,row])=>row).filter(row=>![...stored.entries()].some(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.record.id===row.id))};
}

test('clean local-ahead and missing remote branches offer exact saved-commit sync',async t=>{
  for(const missing of [false,true])await t.test(missing?'missing remote branch':'local ahead',async t=>{
    const h=await harness(t,{missing});await h.sync();
    assert.equal(h.errors.length,0);assert.equal(h.warnings.length,1);assert.match(h.warnings[0].options.detail,/Repository: https:\/\/github.com\/student\/app/);assert.match(h.warnings[0].options.detail,/Destination ref: refs\/heads\/main/);assert.match(h.warnings[0].options.detail,new RegExp(B));
    assert.deepEqual(h.pushes, [['push','https://github.com/student/app.git',`${B}:refs/heads/main`]]);assert.equal(h.saves,0);assert.equal(h.activeRecords().length,0);
    await waitFor(()=>h.webview.html.includes('Branch matched GitHub at the last check.'));
    assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);
    assert.match(h.logs.join('\n'),/reviewed saved commit was confirmed/);
  });
});
test('missing-branch manual sync rechecks absence after consent',async t=>{
 for(const local of [false,true])await t.test(local?'local reminder':'saved commits',async t=>{
  const h=await harness(t,{missing:true});if(local)h.stored.set('zero.pendingSync.v1:local',{id:'local',root:h.root,branch:'main',head:B,remote:'',type:'local'});
  h.afterWarning=async()=>{h.remoteHead=OTHER;};await h.commands.get(local?'zero.syncLocalCommit':'zero.syncSavedCommits')();
  assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),/branch now exists/i);assert.match(h.warnings.at(-1).options.detail,/check and push are not atomic/i);
  if(local)assert.ok(h.activeRecords().some(row=>row.id==='local'));
 });
});
test('public reconnect never turns non-auth sync outcomes into ready attempts',async t=>{
 for(const kind of ['remote-missing','behind','protected','unconfirmed'])await t.test(kind,async t=>{
  const h=await harness(t),record={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind,committed:false,pushStarted:false};
  h.stored.set('zero.pendingSync.v1:prior',record);await h.commands.get('zero.reconnectGitHub')();
  assert.match(h.errors.at(-1),/does not request sign-in/i);assert.deepEqual(h.activeRecords(),[record]);assert.equal(h.pushes.length,0);
 });
});
test('auth reconnect replaces only the exact same-account reminder',async t=>{
 for(const scenario of ['success','account drift','destination drift','reminder drift','unbound'])await t.test(scenario,async t=>{
  const h=await harness(t,{mockStart:true}),record={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',...(scenario==='unbound'?{}:{accountId:'1'}),kind:'auth',committed:false,pushStarted:true};
  h.stored.set('zero.pendingSync.v1:prior',record);h.onStart=async()=>{if(scenario==='account drift')h.changeAccount();if(scenario==='destination drift')h.remote='https://github.com/student/other.git';if(scenario==='reminder drift')h.stored.set('zero.pendingSync.v1:prior',{...record,head:A});};
  await h.commands.get('zero.reconnectGitHub')();assert.equal(h.pushes.length,0);
  if(scenario==='success'){assert.deepEqual(h.errors,[]);assert.ok(h.activeRecords().some(row=>row.kind==='ready'&&row.accountId==='1'&&row.head===B));assert.ok(!h.activeRecords().some(row=>row.id==='prior'));}
  else {assert.ok(h.errors.length);assert.ok(h.activeRecords().some(row=>row.id==='prior'));assert.ok(!h.activeRecords().some(row=>row.kind==='ready'));}
 });
});
test('Publish upload preserves a known missing main and stops before upload',async t=>{
 const h=await harness(t,{missing:true,mockPublish:true});await h.commands.get('zero.testPublishUpload')();
 assert.equal(h.pushes.length,0);assert.equal(h.syncs,0);assert.match(h.errors.at(-1),/Review branch creation/);
 assert.ok(h.activeRecords().some(row=>row.kind==='remote-missing'&&row.branch==='main'&&row.head===B&&row.accountId==='1'));
});
test('manual missing-branch review uses the real checkUpload contract',async t=>{
 for(const local of [false,true])await t.test(local?'local reminder':'saved commits',async t=>{
  const h=await harness(t,{missing:true,realCheck:true});if(local)h.stored.set('zero.pendingSync.v1:local',{id:'local',root:h.root,branch:'main',head:B,remote:'',type:'local'});
  await h.commands.get(local?'zero.syncLocalCommit':'zero.syncSavedCommits')();assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/main`]]);
 });
});
test('saved-commit sync preserves dirty files and unsaved editor contents',async t=>{
  const h=await harness(t,{dirty:true});await h.sync();assert.deepEqual(h.errors,[]);assert.equal(h.saves,0);assert.equal(h.pushes[0][2],`${B}:refs/heads/main`);assert.match(h.logs.join('\n'),/newer file changes and unsaved edits remain/);
});
test('cancelling saved-commit sync performs no transfer or reminder change',async t=>{
  const h=await harness(t,{choice:false}),before=h.checks;await h.sync();assert.equal(h.syncs,0);assert.equal(h.pushes.length,0);assert.deepEqual(h.activeRecords(),[]);assert.equal(h.checks,before,'Cancellation does not force a connection check');
});
test('saved-commit confirmation rechecks exact branch, head, files, destination, session and reminders',async t=>{
  for(const scenario of ['branch','head','status','fingerprint','destination','session','reminder'])await t.test(scenario,async t=>{
    const h=await harness(t);h.afterWarning=async()=>{
      if(scenario==='branch')h.branch='other';if(scenario==='head')h.head=OTHER;if(scenario==='status')h.status=' M Main.java';if(scenario==='fingerprint')h.fingerprint='changed';if(scenario==='destination')h.remote='https://github.com/student/other.git';if(scenario==='session')h.changeSession();
      if(scenario==='reminder')h.stored.set('zero.pendingSync.v1:foreign',{id:'foreign',root:h.root,branch:'other',head:A,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network'});
    };
    await h.sync();assert.equal(h.warnings.length,1);assert.equal(h.pushes.length,0);assert.ok(h.errors.length);if(scenario==='reminder')assert.ok(h.activeRecords().some(row=>row.id==='foreign'));
  });
});
test('remote-changed, synced and reminder states do not offer fresh saved-commit sync',async t=>{
  const h=await harness(t);h.remoteHead=OTHER;await h.check();assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);await h.sync();assert.equal(h.pushes.length,0);
  h.remoteHead=B;await h.check();assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);
  h.remoteHead=A;h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:A,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network'});
  await h.check();await h.sync();assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.id==='prior'));assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);
});
test('failed or unconfirmed saved-commit sync retains durable attempt evidence',async t=>{
  for(const scenario of ['offline','unconfirmed','changed-attempt'])await t.test(scenario,async t=>{
    const h=await harness(t);if(scenario==='offline')h.failPush=true;if(scenario==='unconfirmed')h.failConfirmation=true;
    if(scenario==='changed-attempt')h.afterPush=async()=>{const [key,row]=[...h.stored.entries()].find(([key])=>key.startsWith('zero.pendingSync.v1:'));h.stored.set(key,{...row,kind:'changed'});};
    await h.sync();assert.equal(h.pushes.length,1);assert.ok(h.errors.length);assert.ok(h.activeRecords().some(row=>row.head===B&&row.pushStarted===true));
  });
});
test('exact confirmation does not resolve later matching or unrelated reminders',async t=>{
  const h=await harness(t);h.afterConfirmation=async()=>{for(const [id,branch]of [['later','main'],['unrelated','another']])h.stored.set('zero.pendingSync.v1:'+id,{id,root:h.root,branch,head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network'});};
  await h.sync();assert.deepEqual(h.errors,[]);assert.deepEqual(h.activeRecords().map(row=>row.id).sort(),['later','unrelated']);
});
test('confirmed branch, local and legacy uploads preserve matching reminders added after confirmation',async t=>{
  for(const action of ['branch','local','upload'])await t.test(action,async t=>{
    const h=await harness(t,{branch:action==='branch'?'feature':'main'}),target=action==='branch'?'child':'main';
    if(action==='local')h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'',type:'local'});
    h.afterConfirmation=async()=>{
      h.stored.set('zero.pendingSync.v1:late-push',{id:'late-push',root:h.root,branch:target,head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network'});
      h.stored.set('zero.pendingSync.v1:late-local',{id:'late-local',root:h.root,branch:target,head:B,remote:'',type:'local'});
    };
    await h.commands.get(action==='branch'?'zero.startChange':action==='local'?'zero.syncLocalCommit':'zero.uploadToGitHub')();
    assert.deepEqual(h.errors,[]);assert.deepEqual(h.activeRecords().map(row=>row.id).sort(),['late-local','late-push']);
  });
});
test('accountless legacy retry never pushes or resolves its reminder',async t=>{
  for(const noLedger of [false,'enumerable'])await t.test(String(noLedger),async t=>{
    const h=await harness(t,{noLedger});
    h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',kind:'network',pushStarted:false});
    await h.commands.get('zero.retryBranchSync')();
    assert.equal(h.pushes.length,0);assert.ok(h.errors.some(message=>/not bound to a GitHub account/.test(message)));assert.ok(h.activeRecords().some(row=>row.id==='prior'));
  });
});
test('unrecognized compatibility reminder is never retried or resolved',async t=>{
  for(const field of [{operation:'unknown'},{type:'unknown'}])await t.test(JSON.stringify(field),async t=>{
    const h=await harness(t,{noLedger:'enumerable'});
    h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network',pushStarted:false,...field});
    h.stored.set('zero.pendingSync.v1:aaa',{id:'aaa',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network',pushStarted:false});
    await h.commands.get('zero.retryBranchSync')();
    assert.equal(h.pushes.length,0);assert.ok(h.errors.length);assert.deepEqual(h.activeRecords().map(row=>row.id).sort(),['aaa','prior']);assert.match(h.webview.html,/unrecognized sync reminder needs inspection/);assert.doesNotMatch(h.webview.html,/data-command="zero.retryBranchSync"|data-command="zero.syncSavedCommits"/);
  });
});
test('ref-only intent reminders are inspection-only in the sidebar',async t=>{
 for(const kind of ['ref-pending','ref-acknowledged'])await t.test(kind,async t=>{const h=await harness(t,{noLedger:'enumerable'});h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',operation:'reftable-ref-only',kind,committed:false,pushStarted:false});await h.commands.get('zero.retryBranchSync')();assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.id==='prior'));assert.match(h.webview.html,/ref-only update record needs inspection/i);assert.match(h.webview.html,/data-command="zero.reviewInterruptedRefOnlyUpdate"/);assert.doesNotMatch(h.webview.html,/data-command="zero.retryBranchSync"|data-command="zero.syncSavedCommits"/);});
});
test('ref-only confirmation drift preserves both intent records without a duplicate push',async t=>{
 const authority=require('../src/reftable-ref-only-intent'),original=authority.assertLiveRefOnlySync,expire=authority.expireLiveRefOnlySync;let validated=0;authority.assertLiveRefOnlySync=(outcome,context)=>{assert.ok(context.records.some(row=>row.id===outcome.pending.id));assert.ok(context.records.some(row=>row.id===outcome.acknowledged.id));validated++;return true;};authority.expireLiveRefOnlySync=()=>{};t.after(()=>{authority.assertLiveRefOnlySync=original;authority.expireLiveRefOnlySync=expire;});const h=await harness(t,{branch:'feature',refOnlyFixture:true});let injected=false;h.afterPush=async()=>{h.beforeBranchRead=async()=>{if(!injected){injected=true;h.changeSession();}};};await h.commands.get('zero.syncProject')();assert.equal(injected,true);assert.ok(validated>0);assert.equal(h.pushes.length,1);const records=h.activeRecords();assert.ok(records.some(row=>row.kind==='ref-pending'));assert.ok(records.some(row=>row.kind==='ref-acknowledged'));assert.ok(records.some(row=>row.pushStarted===true));assert.equal(h.pushes.length,1);
});
test('already-confirmed ref-only update retains pending evidence on session drift or partial resolution',async t=>{
 for(const scenario of ['session','partial'])await t.test(scenario,async t=>{const authority=require('../src/reftable-ref-only-intent'),original=authority.assertLiveRefOnlySync,expire=authority.expireLiveRefOnlySync;authority.assertLiveRefOnlySync=(outcome,context)=>{assert.ok(context.records.some(row=>row.id===outcome.pending.id));assert.ok(context.records.some(row=>row.id===outcome.acknowledged.id));return true;};authority.expireLiveRefOnlySync=()=>{};t.after(()=>{authority.assertLiveRefOnlySync=original;authority.expireLiveRefOnlySync=expire;});const h=await harness(t,{branch:'feature',refOnlyFixture:true});h.remoteHead=OTHER;if(scenario==='session')h.afterCheck=async()=>h.changeSession();else h.failResolutionAfter=1;await h.commands.get('zero.syncProject')();assert.equal(h.pushes.length,0);const rows=h.activeRecords();assert.ok(rows.some(row=>row.kind==='ref-pending'));if(scenario==='session')assert.ok(rows.some(row=>row.kind==='ref-acknowledged'));else assert.ok(!rows.some(row=>row.kind==='ref-acknowledged'));});
});
test('session drift during post-push confirmation preserves the attempted sync reminder',async t=>{
 const h=await harness(t);let injected=false;h.afterPush=async()=>{h.beforeBranchRead=async()=>{if(!injected){injected=true;h.changeSession();}};};await h.sync();assert.equal(injected,true);assert.equal(h.pushes.length,1);assert.ok(h.activeRecords().some(row=>row.pushStarted===true&&row.head===B));assert.ok(h.errors.length||h.webview.html.includes('needs attention'));assert.equal(h.pushes.length,1);
});
test('compatibility merge recovery resolves reviewed main reminder and retains unbound account',async t=>{
  const h=await harness(t,{branch:'feature',noLedger:'enumerable',mergeRecovery:true}),base={root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',operation:'merge',kind:'network'};
  h.stored.set('zero.pendingSync.v1:bound',{...base,id:'bound',accountId:'1'});
  h.stored.set('zero.pendingSync.v1:unbound',{...base,id:'unbound'});
  await h.commands.get('zero.finishChange')();
  assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.deepEqual(h.activeRecords().map(row=>row.id),['unbound']);
});
test('Merge recovery retains the account captured before a session change',async t=>{
  const h=await harness(t,{branch:'feature',finishResult:true});
  const recovery={root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',operation:'merge',kind:'unconfirmed',committed:false,pushStarted:true};
  h.beforeDispatch=async()=>{h.changeAccount();throw Object.assign(Error('Interrupted confirmation'),{workflowRecovery:recovery});};
  await h.commands.get('zero.finishChange')();
  assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),/Interrupted confirmation/);
  assert.deepEqual(h.activeRecords().map(row=>[row.operation,row.accountId,row.head]),[['merge','1',B]]);
});
test('production compatibility storage resolves an exact confirmed ordinary push',async t=>{
  const h=await harness(t,{productionCompatibility:true});
  await h.sync();
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/main`]]);
  assert.deepEqual(h.activeRecords(),[]);assert.ok([...h.stored.values()].some(row=>row?.reason==='confirmed'&&row.record?.head===B));
  assert.match(h.logs.join('\n'),/workspace reminder compatibility storage/);
});
test('production compatibility storage refuses descendant retry before review or transport',async t=>{
  const h=await harness(t,{productionCompatibility:true});
  const earlier={id:'earlier',root:h.root,branch:'main',head:A,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'network',committed:true,pushStarted:true};
  h.stored.set('zero.pendingSync.v1:earlier',earlier);
  const checks=h.checks;
  await h.commands.get('zero.retryBranchSync')();
  assert.match(h.errors.at(-1),/requires shared sync reminder storage/);assert.deepEqual(h.warnings,[]);assert.deepEqual(h.pushes,[]);assert.equal(h.syncs,0);assert.equal(h.checks,checks);
  assert.deepEqual(h.activeRecords(),[earlier]);
});
test('new branch completion immediately schedules current branch and main checks',async t=>{
  const h=await harness(t,{branch:'feature'}),before=h.checks;await h.commands.get('zero.startChange')();
  await waitFor(()=>h.webview.html.includes('Current branch: child')&&h.webview.html.includes('Branch matched GitHub at the last check')&&h.checks>before&&h.mainChecks.includes('child'));
  assert.deepEqual(h.errors,[]);assert.match(h.webview.html,/Branch matched GitHub at the last check/);
});
test('branch creation reports that only its saved commit was synced when edits remain',async t=>{
  for(const scenario of ['disk','editor','disk-during-sync','editor-during-sync','clean'])await t.test(scenario,async t=>{
    const h=await harness(t,{branch:'feature',dirty:scenario==='disk',dirtyBuffer:scenario==='editor'});
    if(scenario==='disk-during-sync')h.afterConfirmation=async()=>{h.status=' M Main.java';};
    if(scenario==='editor-during-sync')h.afterConfirmation=async()=>{h.documents.push({isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(h.root,'Main.java')},save:async()=>assert.fail('Must not save editor contents')});};
    await h.commands.get('zero.startChange')();
    assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/child`]]);assert.equal(h.saves,0);
    if(scenario==='clean'){assert.match(h.logs.join('\n'),/Branch created and confirmed on GitHub/);assert.doesNotMatch(h.webview.html,/check local edits/);}
    else {assert.match(h.logs.join('\n'),/saved branch commit was confirmed.*uncommitted changes or unsaved edits remain on this computer/i);assert.match(h.webview.html,/check local edits/);}
  });
});
test('new branch checks the exact remote name before any automatic push',async t=>{
  for(const scenario of ['absent','same head','different ancestor','offline'])await t.test(scenario,async t=>{
    const h=await harness(t,{branch:'feature',realCheck:true});h.childRemoteHead=scenario==='same head'?B:scenario==='different ancestor'?A:null;if(scenario==='offline')h.failRead=true;
    await h.commands.get('zero.startChange')();assert.deepEqual(h.errors,[]);
    if(scenario==='absent'){assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/child`]]);}
    else {assert.equal(h.pushes.length,0);if(scenario==='same head')assert.match(h.logs.join('\n'),/existing GitHub branch already matches/);else {assert.ok(h.activeRecords().some(row=>row.branch==='child'));assert.match(h.webview.html,/sync needs attention/i);}}
  });
});
test('new branch review discloses remote sync, preserves edits, and rejects cancellation or drift',async t=>{
  for(const scenario of ['cancel','account','session','destination','head'])await t.test(scenario,async t=>{
    const h=await harness(t,{branch:'feature',choice:scenario!=='cancel'});
    h.afterWarning=async()=>{if(scenario==='account')h.changeAccount();if(scenario==='session')h.changeSession();if(scenario==='destination')h.remote='https://github.com/student/other.git';if(scenario==='head')h.head=OTHER;};
    await h.commands.get('zero.startChange')();assert.equal(h.pushes.length,0);assert.equal(h.saves,0);
    const detail=h.warnings.at(-1).options.detail;assert.match(detail,/refs\/heads\/child/);assert.match(detail,/not atomic/);assert.match(detail,/fast-forward/);assert.match(detail,/without being committed/);assert.match(detail,/unsaved open files stay open/i);
    if(scenario==='cancel')assert.deepEqual(h.errors,[]);else assert.ok(h.errors.length);assert.doesNotMatch(h.webview.html,/Current branch: child/);
  });
});
test('account or session changes after local branch creation do not redirect automatic sync',async t=>{
 for(const scenario of ['account','session'])await t.test(scenario,async t=>{
  const h=await harness(t,{branch:'feature'});h.afterBranchCreate=async()=>scenario==='account'?h.changeAccount():h.changeSession();await h.commands.get('zero.startChange')();
  assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.branch==='child'&&row.accountId==='1'));assert.match(h.webview.html,/sync needs attention/i);
 });
});
test('updated feature sync reports edits introduced during upload',async t=>{
  const h=await harness(t,{branch:'feature',updated:true});h.afterConfirmation=async()=>{h.status=' M Main.java';};
  await h.commands.get('zero.syncProject')();
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/feature`]]);assert.equal(h.saves,0);
  assert.match(h.logs.join('\n'),/saved branch commit was confirmed.*uncommitted changes or unsaved edits remain on this computer/i);assert.match(h.webview.html,/Updated feature · synced to GitHub · check local edits/);
});
test('update and merge clean checks disable Git fsmonitor before status',async t=>{
 for(const action of ['zero.syncProject','zero.finishChange'])await t.test(action,async t=>{
  const h=await harness(t,{branch:'feature',...(action==='zero.syncProject'?{updated:true}:{finishResult:true})});h.gitCalls.length=0;
  await h.commands.get(action)();assert.deepEqual(h.errors,[]);
  const checks=h.gitCalls.filter(args=>args.includes('status'));assert.ok(checks.length);for(const args of checks)assert.deepEqual(args.slice(0,3),['-c','core.fsmonitor=false','status']);
 });
});
test('updating from main retains an observed missing feature and does not push',async t=>{
  const h=await harness(t,{branch:'feature',missing:true,updated:true,updateTo:'c'.repeat(40)});
  await h.commands.get('zero.syncProject')();assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);
  const records=h.activeRecords().filter(row=>row.kind==='remote-missing');assert.ok(records.some(row=>row.head===B));assert.ok(records.some(row=>row.head==='c'.repeat(40)));assert.ok(records.every(row=>row.accountId==='1'&&row.branch==='feature'));
  assert.match(h.webview.html,/review branch creation/i);
});
disabledSafetyTest('guided update completion retains a persisted missing-branch reminder',async t=>{
  const h=await harness(t,{branch:'feature',missing:true}),recovery={id:'update',branch:'feature',head:B,remote:'https://github.com/student/app.git',remoteBranch:'main',files:[{path:'Main.java',kind:'text',conflicts:[{id:'conflict',local:'local',incoming:'incoming'}]}]};
  h.stored.set('zero.pendingSync.v1:missing',{id:'missing',root:h.root,branch:'feature',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'remote-missing',pushStarted:false});
  h.recovery=recovery;await h.commands.get('zero.chooseRepository')();await h.commands.get('zero.keepLocalUpdate')(require('../src/git-recovery-panel').selection(recovery).token);
  assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.kind==='remote-missing'&&row.head===OTHER));
});
test('a confirmed existing merge resolves only its reviewed account-bound reminder',async t=>{
  const h=await harness(t,{branch:'feature',finishResult:true}),base={root:h.root,branch:'feature',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',operation:'merge',committed:false,pushStarted:true,kind:'unconfirmed'};
  for(const row of [{...base,id:'matching',accountId:'1'},{...base,id:'other-account',accountId:'2'},{...base,id:'unbound'},{...base,id:'other-head',head:A,accountId:'1'}])h.stored.set('zero.pendingSync.v1:'+row.id,row);
  await h.commands.get('zero.finishChange')();assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);
  assert.match(h.logs.at(-1),/confirmed .* on GitHub/);assert.doesNotMatch(h.logs.at(-1),/pushed/i);
  const ids=h.activeRecords().map(row=>row.id);assert.ok(!ids.includes('matching'));for(const id of ['other-account','unbound','other-head'])assert.ok(ids.includes(id));
});
test('pending merge recovery reports a missing main rather than an update',async t=>{
  const h=await harness(t,{branch:'feature',mergeRecovery:'missing'});await h.commands.get('zero.finishChange')();
  assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.match(h.webview.html,/GitHub main is missing · review before merging/);assert.match(h.logs.join('\n'),/inspect the repository before recreating/);
});
test('merge and earlier-merge retry disclose the non-atomic GitHub ref race',async t=>{
  for(const recovery of [false,true])await t.test(recovery?'retry':'merge',async t=>{
    const h=await harness(t,{branch:'feature',choice:false,...(recovery?{mergeRecovery:'needsPush'}:{finishResult:true})});
    await h.commands.get('zero.finishChange')();assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);
    assert.match(h.warnings.at(-1).options.detail,/refs\/heads\/main/);assert.match(h.warnings.at(-1).options.detail,/not atomic/);assert.match(h.warnings.at(-1).options.detail,/deleted or rewound/);assert.match(h.warnings.at(-1).options.detail,/recreate or fast-forward/);
  });
});
test('merge review identifies the actual remote main separately from local main',async t=>{
 const h=await harness(t,{branch:'feature',choice:false,finishResult:OTHER});await h.commands.get('zero.finishChange')();
 assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);const detail=h.warnings.at(-1).options.detail;
 assert.ok(detail.includes(`Local main at review: ${A}`));assert.ok(detail.includes(`GitHub main at review: ${OTHER}`));
});
test('merge refuses an unverified GitHub main before prompting',async t=>{
 const h=await harness(t,{branch:'feature',finishResult:'invalid'});await h.commands.get('zero.finishChange')();
 assert.equal(h.pushes.length,0);assert.equal(h.warnings.length,0);assert.match(h.errors.at(-1),/GitHub main could not be reviewed/);
});
test('synchronous merge authority stops trust, session, workspace and editor drift at dispatch',async t=>{
 for(const action of ['merge','update'])for(const scenario of ['trust','account','session','workspace','editor','editor-version'])await t.test(`${action}: ${scenario}`,async t=>{
  const h=await harness(t,{branch:'feature',...(action==='merge'?{finishResult:true}:{updated:true,updateTo:'c'.repeat(40)})});
  const other={isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(path.dirname(h.root),'other.java')}};if(scenario==='editor-version')h.documents.push(other);
  h.beforeDispatch=async()=>{if(scenario==='trust')h.setTrust(false);if(scenario==='account')h.changeAccount();if(scenario==='session')h.changeSession();if(scenario==='workspace')h.setWorkspace(path.dirname(h.root));if(scenario==='editor')h.documents.push({isDirty:true,version:1,uri:{scheme:'file',fsPath:path.join(h.root,'Main.java')}});if(scenario==='editor-version')other.version++;};
  await h.commands.get(action==='merge'?'zero.finishChange':'zero.syncProject')();assert.equal(h.pushes.length,0);assert.ok(h.errors.length);assert.doesNotMatch(h.webview.html,/Merged to main · branch kept/);
 });
});
disabledSafetyTest('a missing check begun during a paused conflict is saved before continuing',async t=>{
  const h=await harness(t,{branch:'feature'}),recovery={id:'update',branch:'feature',head:B,remote:'https://github.com/student/app.git',remoteBranch:'main',files:[{path:'Main.java',kind:'text',conflicts:[{id:'conflict',local:'local',incoming:'incoming'}]}]};
  h.recovery=recovery;await h.commands.get('zero.chooseRepository')();h.remoteHead=null;await h.check();
  assert.ok(h.webview.html.includes('This branch was missing on GitHub at the last check'));
  await h.commands.get('zero.keepLocalUpdate')(require('../src/git-recovery-panel').selection(recovery).token);
  assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.kind==='remote-missing'&&row.head===B));assert.ok(h.activeRecords().some(row=>row.kind==='remote-missing'&&row.head===OTHER));
});
test('gated conflict choice preserves the paused update and missing-branch evidence',async t=>{
  const h=await harness(t,{branch:'feature',missing:true}),recovery={id:'update',branch:'feature',head:B,remote:'https://github.com/student/app.git',remoteBranch:'main',files:[{path:'Main.java',kind:'text',conflicts:[{id:'conflict',local:'local',incoming:'incoming'}]}]};
  const reminder={id:'missing',root:h.root,branch:'feature',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'remote-missing',pushStarted:false};h.stored.set('zero.pendingSync.v1:missing',reminder);h.recovery=recovery;
  await h.commands.get('zero.chooseRepository')();await h.commands.get('zero.keepLocalUpdate')(require('../src/git-recovery-panel').selection(recovery).token);
  assert.ok(h.errors.some(message=>/temporarily unavailable/i.test(message)));assert.equal(h.recovery,recovery);assert.deepEqual(h.activeRecords().find(row=>row.id==='missing'),reminder);assert.equal(h.pushes.length,0);assert.doesNotMatch(h.webview.html,/data-command="zero.keepLocalUpdate"/);
});
test('paused conflict stops before mutation on missing-observation drift or reminder failure',async t=>{
 for(const reason of ['account','session','storage'])await t.test(reason,async t=>{
  const h=await harness(t,{branch:'feature',missing:true}),recovery={id:'update',branch:'feature',head:B,remote:'https://github.com/student/app.git',remoteBranch:'main',files:[{path:'Main.java',kind:'text',conflicts:[{id:'conflict',local:'local',incoming:'incoming'}]}]};
  h.recovery=recovery;await h.commands.get('zero.chooseRepository')();
  if(reason==='account')h.changeAccount();else if(reason==='session')h.changeSession();else h.failAdd=true;
  await h.commands.get('zero.keepLocalUpdate')(require('../src/git-recovery-panel').selection(recovery).token);
  assert.ok(h.errors.length);assert.equal(h.recovery,recovery);assert.equal(h.pushes.length,0);
 });
});
test('in-flight missing checks finish before update and legacy upload can mutate',async t=>{
  for(const action of ['update','legacy'])await t.test(action,async t=>{
    const h=await harness(t,{branch:'feature',updated:true,updateTo:'c'.repeat(40)});h.remoteHead=null;
    let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});h.beforeBranchRead=async()=>{entered();await gate;};
    const check=h.check();await started;const operation=h.commands.get(action==='update'?'zero.syncProject':'zero.uploadToGitHub')();
    await new Promise(resolve=>setImmediate(resolve));assert.equal(h.pushes.length,0);h.beforeBranchRead=async()=>{};release();await check;await operation;
    assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.kind==='remote-missing'&&row.head===B));
    if(action==='update'){assert.deepEqual(h.errors,[]);assert.ok(h.activeRecords().some(row=>row.kind==='remote-missing'&&row.head==='c'.repeat(40)));}
    else assert.match(h.errors.at(-1),/Review branch creation/);
  });
});
test('reviewed missing-branch retry validates and resolves an applied correction intent',async t=>{
  for(const valid of [true,false])await t.test(valid?'valid receipt':'invalid receipt',async t=>{
    const h=await harness(t,{missing:true,correctionReceipt:{commit:valid?B:OTHER,branch:'refs/heads/main'}});
    const remote='https://github.com/student/app.git';
    h.stored.set('zero.pendingSync.v1:missing',{id:'missing',root:h.root,branch:'main',head:A,remote,type:'push',accountId:'1',kind:'remote-missing',committed:false,pushStarted:false});
    h.stored.set('zero.pendingSync.v1:correction',{id:'correction',root:h.root,branch:'main',head:B,remote:'',type:'local',operation:'restore',recoveryPath:path.join(h.root,'.git','zero-project-restore-recovery-test')});
    await h.commands.get('zero.retryBranchSync')();
    if(valid){assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,1);assert.match(h.warnings.at(-1).options.detail,/check and push are not atomic/i);assert.ok(!h.activeRecords().some(row=>row.id==='correction'));}
    else {assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),/not confirmed applied/i);assert.ok(h.activeRecords().some(row=>row.id==='correction'));}
  });
});
test('confirmed branch sync reports unreadable editors even when disk edits remain',async t=>{
  const h=await harness(t,{branch:'feature',dirty:true,dirtyBuffer:false});
  h.afterConfirmation=async()=>h.documents.push({isDirty:true,uri:{scheme:'file',get fsPath(){throw Error('Editor unavailable');}}});
  await h.commands.get('zero.startChange')();
  assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,1);assert.match(h.logs.join('\n'),/uncommitted changes or unsaved edits remain on this computer/i);assert.match(h.logs.join('\n'),/Open files could not be checked/i);assert.match(h.webview.html,/check open files/);
});
test('incomplete deleted-file restoration blocks branch, update and saved-head uploads',async t=>{
  for(const action of ['start','update','sync','legacy'])await t.test(action,async t=>{
    const h=await harness(t,{branch:'feature',updated:true}),folder=path.join(h.root,'.git','zero-file-restore-recovery-abc123');await fs.mkdir(folder);
    await h.commands.get({start:'zero.startChange',update:'zero.syncProject',sync:'zero.syncSavedCommits',legacy:'zero.uploadToGitHub'}[action])();
    assert.equal(h.pushes.length,0);assert.ok(h.errors.some(message=>/restoration or initial project discard needs inspection/i.test(message)));assert.ok(await fs.stat(folder));
    if(action==='start')assert.doesNotMatch(h.webview.html,/Current branch: child/);
  });
});

test('reconnecting a project checks its branch after the connection finishes',async t=>{
  const h=await harness(t,{disconnected:true});await h.commands.get('zero.connectRepository')();
  await waitFor(()=>h.webview.html.includes('Local commits are not on this GitHub branch.'));
  assert.equal(h.checks,1);assert.deepEqual(h.errors,[]);
});
test('confirmed retry and local reminder sync refresh an unchanged branch observation',async t=>{
  for(const kind of ['retry','local'])await t.test(kind,async t=>{
    const h=await harness(t),remote='https://github.com/student/app.git';
    const record={id:'prior',root:h.root,branch:'main',head:B,remote:kind==='local'?'':remote,type:kind==='local'?'local':'push',accountId:'1',kind:'network',committed:true,pushStarted:false};
    h.stored.set('zero.pendingSync.v1:prior',record);
    await h.commands.get(kind==='local'?'zero.syncLocalCommit':'zero.retryBranchSync')();
    await waitFor(()=>h.webview.html.includes('Branch matched GitHub at the last check.'));
    assert.deepEqual(h.errors,[]);assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);
  });
});
test('unconfirmed retry does not force a fresh branch observation',async t=>{
  const h=await harness(t);h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network',committed:true,pushStarted:false});
  h.failConfirmation=true;const before=h.checks;await h.commands.get('zero.retryBranchSync')();
  assert.equal(h.checks,before+1,'Only the attempted upload confirmation ran');assert.ok(h.errors.length);
});
test('legacy saved-head upload and confirmed push review refresh an unchanged branch observation',async t=>{
  for(const action of ['upload','check'])await t.test(action,async t=>{
    const h=await harness(t);
    if(action==='check'){
      h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true});
      h.remoteHead=B;
    }
    await h.commands.get(action==='upload'?'zero.uploadToGitHub':'zero.checkPush')();
    await waitFor(()=>h.webview.html.includes('Branch matched GitHub at the last check.'));
    assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,action==='upload'?1:0);assert.equal(h.activeRecords().length,0);
  });
});
test('failed, unconfirmed and cancelled legacy uploads do not force branch checks',async t=>{
  for(const outcome of ['offline','unconfirmed','cancelled'])await t.test(outcome,async t=>{
    const h=await harness(t,{dirty:outcome==='cancelled',dirtyBuffer:false,cancelInput:outcome==='cancelled'}),before=h.checks;
    if(outcome==='offline')h.failPush=true;if(outcome==='unconfirmed')h.failConfirmation=true;
    await h.commands.get('zero.uploadToGitHub')();
    assert.equal(h.checks,before+(outcome==='unconfirmed'?1:0),'Only an attempted transfer confirmation may run');
    assert.equal(h.pushes.length,outcome==='cancelled'?0:1);assert.equal(h.errors.length,outcome==='cancelled'?0:1);
    assert.match(h.webview.html,/Local commits are not on this GitHub branch/);
  });
});
test('unconfirmed push review preserves its reminder without forcing a branch check',async t=>{
  const h=await harness(t),before=h.checks;
  h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true});
  await h.commands.get('zero.checkPush')();
  assert.equal(h.checks,before+1);assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.equal(h.activeRecords().length,1);
  assert.match(h.webview.html,/Local commits are not on this GitHub branch/);
});
test('missing branch check requires explicit review before exact non-force recreation',async t=>{
  const h=await harness(t,{missing:true,choice:false});
  h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true});
  await h.commands.get('zero.checkPush')();assert.deepEqual(h.errors,[]);assert.equal(h.activeRecords().length,1);assert.equal(h.activeRecords()[0].kind,'remote-missing');
  assert.match(h.webview.html,/branch missing/i);assert.match(h.webview.html,/Review branch creation/);
  await h.commands.get('zero.retryBranchSync')();assert.equal(h.pushes.length,0);assert.match(h.warnings.at(-1).options.detail,/Destination ref: refs\/heads\/main/);assert.match(h.warnings.at(-1).options.detail,new RegExp(B));assert.match(h.warnings.at(-1).options.detail,/create it if it remains absent/);assert.match(h.warnings.at(-1).options.detail,/not atomic.*fast-forward update.*without force/);
  assert.equal(h.activeRecords()[0].kind,'remote-missing');h.choice=true;await h.commands.get('zero.retryBranchSync')();
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/main`]]);assert.equal(h.activeRecords().length,0);
});
test('missing branch review rechecks account, destination, commit, reminders and remote state',async t=>{
  for(const scenario of ['account','session','no-account','destination','branch','head','reminder','record-changed','remote-appeared'])await t.test(scenario,async t=>{
    const h=await harness(t,{missing:true});
    h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',...(scenario==='no-account'?{}:{accountId:'1'}),kind:'remote-missing',committed:true,pushStarted:true});
    h.afterWarning=async()=>{if(scenario==='account')h.changeAccount();if(scenario==='session')h.changeSession();if(scenario==='destination')h.remote='https://github.com/student/other.git';if(scenario==='branch')h.branch='other';if(scenario==='head')h.head=OTHER;if(scenario==='remote-appeared')h.remoteHead=A;if(scenario==='record-changed')h.stored.set('zero.pendingSync.v1:prior',{...h.stored.get('zero.pendingSync.v1:prior'),head:A});if(scenario==='reminder')h.stored.set('zero.pendingSync.v1:foreign',{id:'foreign',root:h.root,branch:'other',head:A,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'network'});};
    await h.commands.get('zero.retryBranchSync')();assert.ok(h.errors.length);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.id==='prior'));
  });
});
test('missing branch can sync a reviewed descendant with explicit creation disclosure',async t=>{
  const h=await harness(t,{missing:true});
  h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:A,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'remote-missing',committed:true,pushStarted:true});
  await h.commands.get('zero.retryBranchSync')();assert.deepEqual(h.errors,[]);
  assert.match(h.warnings.at(-1).options.detail,/Destination ref: refs\/heads\/main/);assert.match(h.warnings.at(-1).options.detail,/create it if it remains absent/);assert.match(h.warnings.at(-1).options.detail,/not atomic.*fast-forward update.*without force/);
  assert.match(h.warnings.at(-1).options.detail,new RegExp(A));assert.match(h.warnings.at(-1).options.detail,new RegExp(B));assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${B}:refs/heads/main`]]);
});
test('offline status check keeps its uncertain reminder rather than marking a branch missing',async t=>{
  const h=await harness(t);h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true});
  h.failRead=true;await h.commands.get('zero.checkPush')();assert.ok(h.errors.length);assert.equal(h.pushes.length,0);assert.equal(h.activeRecords().find(row=>row.id==='prior').kind,'unconfirmed');
});
test('same-head sibling reminders prefer uncertainty and preserve later arrivals after a missing-ref check',async t=>{
  const h=await harness(t,{missing:true,choice:false}),base={root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',committed:false,pushStarted:true};
  h.stored.set('zero.pendingSync.v1:a-network',{...base,id:'a-network',kind:'network',operation:'branch'});h.stored.set('zero.pendingSync.v1:z-unconfirmed',{...base,id:'z-unconfirmed',kind:'unconfirmed'});
  let reviewed;h.afterCheck=async record=>{reviewed=record.id;h.stored.set('zero.pendingSync.v1:late',{...base,id:'late',kind:'network'});h.stored.set('zero.pendingSync.v1:unrelated',{...base,id:'unrelated',branch:'other',kind:'network'});};
  await h.commands.get('zero.checkPush')();assert.deepEqual(h.errors,[]);assert.equal(reviewed,'z-unconfirmed');
  const active=h.activeRecords();assert.ok(!active.some(row=>['a-network','z-unconfirmed'].includes(row.id)));assert.ok(active.some(row=>row.id==='late'));assert.ok(active.some(row=>row.id==='unrelated'));assert.ok(active.some(row=>row.kind==='remote-missing'));
  assert.match(h.webview.html,/branch missing/i);await h.commands.get('zero.retryBranchSync')();assert.equal(h.pushes.length,0);assert.match(h.warnings.at(-1).options.detail,/not atomic.*fast-forward update/);
});
test('a started network attempt cannot silently retry an exact head',async t=>{
  const h=await harness(t),base={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'network',committed:true,pushStarted:true};
  h.stored.set('zero.pendingSync.v1:prior',base);await h.commands.get('zero.retryBranchSync')();
  assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),/push may have started.*Check GitHub status/i);assert.ok(h.activeRecords().some(row=>row.id==='prior'));assert.match(h.webview.html,/Check GitHub status/);
});
test('status makes an uncertain exact head retryable only for a confirmed ancestor',async t=>{
  for(const scenario of ['cancel','confirmed','diverged'])await t.test(scenario,async t=>{
    const h=await harness(t,{realCheck:true,choice:scenario!=='cancel'});
    const record={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'network',committed:true,pushStarted:true};
    h.stored.set('zero.pendingSync.v1:prior',record);
    await h.commands.get('zero.checkPush')();
    assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.deepEqual(h.activeRecords().map(row=>[row.kind,row.pushStarted]),[['ready',false]]);
    if(scenario==='diverged')h.afterWarning=async()=>{h.remoteHead=OTHER;};
    await h.commands.get('zero.retryBranchSync')();
    assert.match(h.warnings.at(-1).message,/Retry syncing this saved commit/);
    if(scenario==='confirmed'){assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[['push',record.remote,`${B}:refs/heads/main`]]);assert.deepEqual(h.activeRecords(),[]);}
    else {assert.equal(h.pushes.length,0);assert.equal(h.activeRecords().length,1);if(scenario==='diverged')assert.match(h.errors.at(-1),/Check GitHub status again/);}
  });
});
test('status refuses to use ancestry when the Git common directory contains grafts',async t=>{
  const h=await harness(t,{realCheck:true,graftsInCommonDir:true});
  const record={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'network',committed:true,pushStarted:true};
  h.stored.set('zero.pendingSync.v1:prior',record);
  const calls=h.gitCalls.length;
  await h.commands.get('zero.checkPush')();
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.pushes,[]);assert.deepEqual(h.activeRecords().map(row=>[row.kind,row.pushStarted]),[['behind',true]]);
  assert.ok(!h.gitCalls.slice(calls).some(args=>args.includes('--is-ancestor')));
});
test('compatibility retry refuses other account, destination or branch groups',async t=>{
  for(const drift of ['account','destination','branch'])await t.test(drift,async t=>{
    const h=await harness(t,{noLedger:'enumerable'}),base={root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'network',committed:false};
    const first={...base,id:'a-unstarted',pushStarted:false},other={...base,id:'z-uncertain',pushStarted:true,...(drift==='account'?{accountId:'2'}:drift==='destination'?{remote:'https://github.com/student/other.git',page:'https://github.com/student/other'}:{branch:'other'})};
    h.stored.set('zero.pendingSync.v1:'+first.id,first);h.stored.set('zero.pendingSync.v1:'+other.id,other);
    await h.commands.get('zero.retryBranchSync')();assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),/earlier sync or local operation needs attention/i);
    assert.deepEqual(h.activeRecords().map(row=>row.id).sort(),['a-unstarted','z-uncertain']);
  });
});
test('non-enumerable compatibility storage refuses retry without losing reminders',async t=>{
  const h=await harness(t,{noLedger:true}),record={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'network',committed:false,pushStarted:false};
  h.stored.set('zero.pendingSync.v1:prior',record);await h.commands.get('zero.retryBranchSync')();assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),/cannot be fully enumerated/);assert.deepEqual(h.activeRecords().map(row=>row.id),['prior']);
});
test('confirmed status resolves only reviewed same-head records and leaves later attempts',async t=>{
  const h=await harness(t),base={root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',committed:false,pushStarted:true};
  h.stored.set('zero.pendingSync.v1:a-network',{...base,id:'a-network',kind:'network'});h.stored.set('zero.pendingSync.v1:z-unconfirmed',{...base,id:'z-unconfirmed',kind:'unconfirmed'});h.remoteHead=B;
  h.afterCheck=async()=>{h.stored.set('zero.pendingSync.v1:late',{...base,id:'late',kind:'network'});h.stored.set('zero.pendingSync.v1:unrelated',{...base,id:'unrelated',branch:'other',kind:'network'});};
  await h.commands.get('zero.checkPush')();assert.deepEqual(h.errors,[]);assert.deepEqual(h.activeRecords().map(row=>row.id).sort(),['late','unrelated']);assert.equal(h.pushes.length,0);
});
test('status check preserves reviewed records on account, destination or record drift',async t=>{
  for(const scenario of ['account','destination','record'])await t.test(scenario,async t=>{
    const h=await harness(t,{missing:true}),base={id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',page:'https://github.com/student/app',type:'push',accountId:'1',kind:'unconfirmed',committed:false,pushStarted:true};
    h.stored.set('zero.pendingSync.v1:prior',base);h.afterCheck=async()=>{if(scenario==='account')h.changeAccount();if(scenario==='destination')h.remote='https://github.com/student/other.git';if(scenario==='record')h.stored.set('zero.pendingSync.v1:prior',{...base,head:A});};
    await h.commands.get('zero.checkPush')();assert.ok(h.errors.length);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(row=>row.id==='prior'));assert.ok(!h.activeRecords().some(row=>row.kind==='remote-missing'));
  });
});
test('confirmed push review still refreshes when reminder bookkeeping fails',async t=>{
  const h=await harness(t);
  h.stored.set('zero.pendingSync.v1:prior',{id:'prior',root:h.root,branch:'main',head:B,remote:'https://github.com/student/app.git',type:'push',accountId:'1',kind:'unconfirmed',committed:true,pushStarted:true});
  h.remoteHead=B;h.failResolution=true;
  await h.commands.get('zero.checkPush')();
  await waitFor(()=>h.webview.html.includes('Branch matched GitHub at the last check.'));
  assert.match(h.errors.at(-1),/sync reminder could not be saved/);assert.equal(h.activeRecords().length,1);assert.equal(h.pushes.length,0);
});
function disabledSafetyTest(name, ...args) { return test(name, { skip: 'Temporarily unavailable: conflict choice or reftable update mutation is disabled for safety.' }, args.at(-1)); }
disabledSafetyTest('finishing conflict choices checks the automatically synced branch',async t=>{
  const h=await harness(t,{branch:'feature'});
  const recovery={id:'update',branch:'feature',head:B,remote:'https://github.com/student/app.git',remoteBranch:'main',files:[{path:'Main.java',kind:'text',conflicts:[{id:'conflict',local:'local',incoming:'incoming'}]}]};
  h.recovery=recovery;await h.commands.get('zero.chooseRepository')();
  const token=require('../src/git-recovery-panel').selection(recovery).token;
  await h.commands.get('zero.keepLocalUpdate')(token);
  await waitFor(()=>h.webview.html.includes('Branch matched GitHub at the last check.'));
  assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,1);
});
test('incomplete file restoration blocks guided update choice, continuation and cancellation',async t=>{
  for(const action of ['zero.keepLocalUpdate','zero.continueUpdate','zero.cancelUpdate'])await t.test(action,async t=>{
    const h=await harness(t,{branch:'feature'}),recovery={id:'update',branch:'feature',remoteBranch:'main',readyToCommit:true,readyFingerprint:'ready',files:[{path:'Main.java',kind:'text',conflicts:[{id:'conflict',local:'local',incoming:'incoming'}]}]};
    h.recovery=recovery;await h.commands.get('zero.chooseRepository')();
    const folder=path.join(h.root,'.git','zero-file-restore-recovery-abc123');await fs.mkdir(folder);
    await h.commands.get(action)(require('../src/git-recovery-panel').selection(recovery).token);
    assert.ok(h.errors.some(message=>(action==='zero.continueUpdate'?/restoration or initial project discard needs inspection/i:/temporarily unavailable/i).test(message)));assert.equal(h.pushes.length,0);assert.ok(await fs.stat(folder));assert.doesNotMatch(h.webview.html,/data-command="zero.keepLocalUpdate"/);
  });
});
disabledSafetyTest('reftable feature update syncs exact reviewed head through ledger',async t=>{const h=await harness(t,{branch:'feature',updated:true,updateTo:'c'.repeat(40),reftableUpdate:true});await h.commands.get('zero.syncProject')();assert.deepEqual(h.errors,[]);assert.match(h.warnings[0].options.detail,/try to sync the updated branch/i);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${'c'.repeat(40)}:refs/heads/feature`]]);assert.equal(h.activeRecords().length,0);});
disabledSafetyTest('reftable feature update defers a known-missing branch and retains reminder',async t=>{const h=await harness(t,{branch:'feature',missing:true,updated:true,updateTo:'c'.repeat(40),reftableUpdate:true});await h.commands.get('zero.syncProject')();assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(record=>record.kind==='remote-missing'&&record.head==='c'.repeat(40)));});
disabledSafetyTest('divergent feature update discloses merge and syncs exact candidate',async t=>{const h=await harness(t,{branch:'feature',updated:true,updateTo:'c'.repeat(40),reftableUpdate:'merge'});await h.commands.get('zero.syncProject')();assert.deepEqual(h.errors,[]);assert.match(h.warnings[0].options.detail,/creating merge commit/i);assert.match(h.warnings[0].options.detail,/try to sync the updated branch/i);assert.deepEqual(h.pushes,[['push','https://github.com/student/app.git',`${'c'.repeat(40)}:refs/heads/feature`]]);assert.equal(h.activeRecords().length,0);});
disabledSafetyTest('divergent feature update keeps known missing branch reminder without push',async t=>{const h=await harness(t,{branch:'feature',missing:true,updated:true,updateTo:'c'.repeat(40),reftableUpdate:'merge'});await h.commands.get('zero.syncProject')();assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(record=>record.kind==='remote-missing'&&record.head==='c'.repeat(40)));});
disabledSafetyTest('cancelling divergent merge confirmation does not apply or sync',async t=>{const h=await harness(t,{branch:'feature',updated:true,updateTo:'c'.repeat(40),reftableUpdate:'merge',choice:false});await h.commands.get('zero.syncProject')();assert.equal(h.pushes.length,0);assert.match(h.warnings[0].options.detail,/creating merge commit/i);assert.deepEqual(h.errors,[]);});
for(const change of ['session','account'])disabledSafetyTest(`completed divergent update retains exact reminder after ${change} drift`,async t=>{const h=await harness(t,{branch:'feature',updated:true,updateTo:'c'.repeat(40),reftableUpdate:'merge'});h.afterUpdate=async()=>{if(change==='session')h.changeSession();else h.changeAccount();};await h.commands.get('zero.syncProject')();assert.equal(h.pushes.length,0);const reminders=h.activeRecords();assert.ok(reminders.some(record=>record.head==='c'.repeat(40)&&record.branch==='feature'&&record.accountId==='1'));assert.match(h.webview.html,/locally.*sync needs attention/i);});
disabledSafetyTest('feature deleted after update review is not silently recreated',async t=>{const h=await harness(t,{branch:'feature',updated:true,updateTo:'c'.repeat(40),reftableUpdate:'merge'});h.afterUpdate=async()=>{h.remoteHead=null;};await h.commands.get('zero.syncProject')();assert.deepEqual(h.errors,[]);assert.equal(h.pushes.length,0);assert.ok(h.activeRecords().some(record=>record.kind==='remote-missing'&&record.head==='c'.repeat(40)));assert.match(h.warnings[0].options.detail,/not atomic/i);assert.match(h.webview.html,/review branch creation/i);});
test('stale archived reftable UI plan preserves undo provenance and hands off to Source Control',async t=>{const h=await harness(t,{branch:'feature',updated:true,archivedGate:true,nativeScm:true}),receipt=path.join(h.root,'.git','zero-commit-provenance.json');await fs.writeFile(receipt,'retained authority');await h.commands.get('zero.syncProject')();assert.equal(h.pushes.length,0);assert.equal(await fs.readFile(receipt,'utf8'),'retained authority');assert.deepEqual(h.errors,[]);assert.match(h.warnings.at(-1).message,/temporarily unavailable.*files and commits are kept/i);assert.deepEqual(h.nativeCommands.filter(args=>args[0]==='workbench.view.scm'),[['workbench.view.scm']]);});
for(const command of ['zero.discardProjectChanges','zero.removeAddedFile','zero.restoreModifiedFile','zero.restoreCommittedFile','zero.cancelUpdate','zero.keepLocalUpdate','zero.useIncomingUpdate'])test(`${command} refuses before consuming provenance`,async t=>{const h=await harness(t,{branch:'feature'}),receipt=path.join(h.root,'.git','zero-commit-provenance.json');await fs.writeFile(receipt,'retained authority');await h.commands.get(command)({root:h.root,relative:'student.txt'});assert.equal(await fs.readFile(receipt,'utf8'),'retained authority');assert.equal(h.pushes.length,0);assert.match(h.errors.at(-1),command==='zero.removeAddedFile'?/temporarily unavailable.*Source Control/i:/temporarily unavailable.*project files and commits are kept/i);});
test('interrupted ref-only review refuses missing evidence before transport',async t=>{const h=await harness(t,{branch:'feature'});await h.commands.get('zero.reviewInterruptedRefOnlyUpdate')();assert.equal(h.pushes.length,0);assert.ok(h.errors.some(message=>/cannot be uniquely identified/i.test(message)));assert.doesNotMatch(h.webview.html,/data-command="zero.reviewInterruptedRefOnlyUpdate"/);});
