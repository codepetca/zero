'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const core=require('../src/core'),github=require('../src/github');
const {appSessions}=require('./fixtures/app-sessions');
const {textInputs}=require('./fixtures/text-input');
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
const disposable=()=>({dispose(){}}),A='a'.repeat(40),B='b'.repeat(40),OTHER='d'.repeat(40);

// Exercise the registered command and real reminder gate. Git transport is an
// in-memory fixture: no child Git, network, push, reset or filesystem swap runs.
async function harness(t,{choice=true,pushStarted=true,kind='behind'}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-descendant-sync-')));
  await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.mkdir(path.join(root,'.git'));
  const original={git:core.git,assert:core.assertRepositoryRoot,repo:core.repositoryRoot,prepare:github.prepareUpload,sync:github.syncExistingHead,check:github.checkUpload};
  let head=B,observedHead=A,remote='https://github.com/student/app.git',session={id:'session',account:{id:'1',label:'student'},accessToken:'FIXTURE_ONLY'},afterWarning=async()=>{},afterPush=async()=>{},afterConfirmation=async()=>{},ancestor=true,failConfirmation=false,failPriorCheck=false;
  const commands=new Map(),stored=new Map(),warnings=[],errors=[],logs=[],transfers=[];let provider;
  const initial={id:'attempt-a',root,branch:'feature',head:A,remote,page:'https://github.com/student/app',accountId:'1',type:'push',kind,committed:true,pushStarted};
  stored.set('zero.pendingSync.v1:'+initial.id,initial);
  core.assertRepositoryRoot=async()=>root;core.repositoryRoot=async()=>root;
  core.git=async(_,args)=>{
    if(args[0]==='--no-replace-objects'){if(!ancestor||args.includes(OTHER))throw Object.assign(Error('Not ancestor'),{code:1});return '';}
    if(args[0]==='symbolic-ref'){if(args.at(-1)!=='HEAD')throw Object.assign(Error('Direct ref'),{code:1});return 'refs/heads/feature';}
    if(args[0]==='remote')return remote;
    if(args[0]==='rev-parse')return args.includes('--show-toplevel')?root:args.includes('--absolute-git-dir')||args.includes('--git-common-dir')?path.join(root,'.git'):head;
    if(args[0]==='status')return '';
    throw Error('Unexpected Git command: '+args[0]);
  };
  github.prepareUpload=async()=>({root,branch:'feature',head,remote,page:core.parseRepositoryUrl(remote).page,changes:[],status:'',fingerprint:'unchanged'});
  github.checkUpload=async(_root,record,{networkRun,beforeNetwork})=>{await beforeNetwork();if(failPriorCheck)throw Error('Prior upload check unavailable');const response=await networkRun(root,['ls-remote','--heads',record.remote,`refs/heads/${record.branch}`]);await beforeNetwork();const remoteHead=response?response.split('\t')[0]:null;return {confirmed:remoteHead===record.head,remoteHead};};
  github.syncExistingHead=async(plan,{beforeUpload,networkRun})=>{
    await beforeUpload();await networkRun(root,['push',plan.remote,`${plan.head}:refs/heads/${plan.branch}`]);await beforeUpload();
    const response=await networkRun(root,['ls-remote','--heads',plan.remote,`refs/heads/${plan.branch}`]);
    if(!response.startsWith(plan.head+'\t'))throw Object.assign(Error('Unconfirmed'),{kind:'unconfirmed'});
    await afterConfirmation();return {uploaded:true,branch:plan.branch,head:plan.head};
  };
  const vscode={
    authentication:{getSession:async()=>session,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:root}}],textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,registerTextDocumentContentProvider:disposable,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine:value=>logs.push(value),dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,showQuickPick:async()=>{},showInputBox:async()=>{},showInformationMessage:async()=>{},showWarningMessage:async(message,options,...actions)=>{warnings.push({message,options,actions});await afterWarning();return choice?actions[0]:undefined;},showErrorMessage:async message=>errors.push(message)},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const load=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){
    if(id==='./transport')return {createTransport:(_,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();transfers.push(args);if(args[0]==='push')await afterPush();return args[0]==='ls-remote'?`${failConfirmation?OTHER:transfers.some(row=>row[0]==='push')?head:observedHead}\t${args[3]}`:'';}};
    if(id==='./git-tracking')return {updateRemoteTracking:async()=>({updated:true})};
    return id==='vscode'?textInputs(vscode):load.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
  const subscriptions=[],context={extensionMode:2,subscriptions,workspaceState:{keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>{stored.set(key,value);}}};extension.activate(context,{repositoryLedgerFactory,provider:appSessions(vscode,{dispose(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
  const webview={html:'',onDidReceiveMessage:disposable};provider.resolveWebviewView({webview,onDidDispose:disposable});
  const deadline=Date.now()+5000;while(!webview.html.includes('Current branch: feature')){assert.ok(Date.now()<deadline,'Project rendered');await new Promise(resolve=>setTimeout(resolve,10));}
  t.after(async()=>{subscriptions.forEach(value=>value.dispose());core.git=original.git;core.assertRepositoryRoot=original.assert;core.repositoryRoot=original.repo;github.prepareUpload=original.prepare;github.syncExistingHead=original.sync;github.checkUpload=original.check;delete require.cache[require.resolve('../src/extension')];await fs.rm(root,{recursive:true,force:true});});
  return {root,stored,initial,warnings,errors,logs,transfers,webview,context,remove:()=>commands.get('zero.removeAddedFile')({root,relative:'student.txt'}),retry:()=>commands.get('zero.retryBranchSync')(),resolved:()=>[...stored.entries()].filter(([key])=>key.startsWith('zero.resolvedSync.v1:')).map(([,value])=>value.record.id),set afterWarning(value){afterWarning=value;},set afterPush(value){afterPush=value;},set afterConfirmation(value){afterConfirmation=value;},set remote(value){remote=value;},set head(value){head=value;},set observedHead(value){observedHead=value;},set accountId(value){session={...session,account:{id:value,label:'other'}};},set ancestor(value){ancestor=value;},set failConfirmation(value){failConfirmation=value;},set failPriorCheck(value){failPriorCheck=value;}};
}

test('an observed descendant already on GitHub reconciles reviewed reminders without a push',async t=>{const h=await harness(t);h.observedHead=B;const local={id:'local',root:h.root,branch:'feature',head:B,remote:'',type:'local'};h.stored.set('zero.pendingSync.v1:local',local);await h.retry();assert.deepEqual(h.transfers.map(row=>row[0]),['ls-remote']);assert.ok(h.resolved().includes('attempt-a'));assert.ok(h.resolved().includes('local'));assert.deepEqual(h.errors,[]);});

test('direct added-file removal stays unavailable in dev and release',async t=>{const h=await harness(t);for(const mode of [1,2]){h.context.extensionMode=mode;await h.remove();assert.match(h.errors.pop(),/temporarily unavailable.*Source Control.*Explorer/);}assert.deepEqual(h.transfers,[]);assert.deepEqual(h.resolved(),[]);assert.equal(h.warnings.length,0);});

test('unavailable prior upload check preserves evidence and prevents descendant push',async t=>{
  const h=await harness(t);h.failPriorCheck=true;await h.retry();assert.deepEqual(h.transfers,[]);assert.deepEqual(h.resolved(),[]);assert.deepEqual(h.stored.get('zero.pendingSync.v1:attempt-a'),h.initial);assert.ok(h.errors.length);
});
test('confirmed descendant resolves only reviewed included local reminders',async t=>{
  const h=await harness(t);const local={id:'local-reviewed',root:h.root,branch:'feature',head:B,remote:'',type:'local'};const other={...local,id:'local-other',branch:'elsewhere'};const late={...local,id:'local-late'};
  h.stored.set('zero.pendingSync.v1:'+local.id,local);h.stored.set('zero.pendingSync.v1:'+other.id,other);h.afterConfirmation=async()=>h.stored.set('zero.pendingSync.v1:'+late.id,late);
  await h.retry();assert.deepEqual(h.errors,[]);assert.ok(h.resolved().includes(local.id));assert.ok(!h.resolved().includes(other.id));assert.ok(!h.resolved().includes(late.id));assert.deepEqual(h.stored.get('zero.pendingSync.v1:'+late.id),late);
});

test('descendant retry confirms the new head and resolves only included reviewed attempts',async t=>{
  for(const pushStarted of [false,true])await t.test(pushStarted?'uncertain prior transfer':'unstarted prior transfer',async t=>{
    const h=await harness(t,{pushStarted});await h.retry();
    assert.equal(h.warnings.length,1,'Replacing the reviewed upload head requires confirmation');
    assert.match(h.warnings[0].options.detail,new RegExp(B));assert.match(h.warnings[0].options.detail,new RegExp(A));
    assert.equal(h.warnings[0].options.modal,true);assert.deepEqual(h.transfers.map(args=>args[0]),pushStarted?['ls-remote','push','ls-remote']:['push','ls-remote']);
    assert.equal(h.transfers.find(args=>args[0]==='push')[2],`${B}:refs/heads/feature`);assert.ok(h.resolved().includes('attempt-a'));assert.deepEqual(h.errors,[]);
  });
});
test('cancelled descendant retry preserves the exact earlier reminder without transfer',async t=>{
  const h=await harness(t,{choice:false});await h.retry();assert.equal(h.warnings.length,1);assert.equal(h.transfers.length,0);assert.deepEqual(h.resolved(),[]);assert.deepEqual(h.stored.get('zero.pendingSync.v1:attempt-a'),h.initial);
});
test('retry reconciles older attempts when the selected reminder already names the new head',async t=>{
  const h=await harness(t);h.stored.set('zero.pendingSync.v1:a-current-attempt',{...h.initial,id:'a-current-attempt',head:B,kind:'network'});
  await h.retry();assert.equal(h.warnings.length,1);assert.deepEqual(h.transfers.map(args=>args[0]),['ls-remote','ls-remote','push','ls-remote']);assert.ok(h.resolved().includes('attempt-a'));assert.ok(h.resolved().includes('a-current-attempt'));assert.deepEqual(h.errors,[]);
});
test('descendant retry refuses unrelated, foreign and local-operation evidence',async t=>{
  for(const scenario of ['unrelated','destination','account','merge','correction','unrelated-push','other-branch','other-account'])await t.test(scenario,async t=>{
    const h=await harness(t);if(scenario==='unrelated')h.ancestor=false;
    if(scenario==='destination')h.remote='https://github.com/student/other.git';
    if(scenario==='account')h.accountId='2';
    if(scenario==='merge')h.initial.operation='merge';
    if(scenario==='correction')h.stored.set('zero.pendingSync.v1:correction',{id:'correction',root:h.root,branch:'feature',head:A,remote:'',type:'local',operation:'restore'});
    if(scenario==='unrelated-push')h.stored.set('zero.pendingSync.v1:other',{...h.initial,id:'other',head:OTHER});
    if(scenario==='other-branch')h.stored.set('zero.pendingSync.v1:other',{...h.initial,id:'other',branch:'another'});
    if(scenario==='other-account')h.stored.set('zero.pendingSync.v1:other',{...h.initial,id:'other',accountId:'2'});
    await h.retry();assert.equal(h.transfers.length,0);assert.deepEqual(h.resolved(),[]);assert.ok(h.errors.length,'Explain the obstruction');
  });
});
test('descendant retry rechecks destination, account, head and reminder identity after confirmation',async t=>{
  for(const scenario of ['destination','account','head','changed-reminder','new-reminder'])await t.test(scenario,async t=>{
    const h=await harness(t);h.afterWarning=async()=>{
      if(scenario==='destination')h.remote='https://github.com/student/other.git';
      if(scenario==='account')h.accountId='2';
      if(scenario==='head')h.head=OTHER;
      if(scenario==='changed-reminder')h.stored.set('zero.pendingSync.v1:attempt-a',{...h.initial,pushStarted:false});
      if(scenario==='new-reminder')h.stored.set('zero.pendingSync.v1:new-attempt',{...h.initial,id:'new-attempt'});
    };
    await h.retry();assert.equal(h.warnings.length,1);assert.equal(h.transfers.length,0);assert.deepEqual(h.resolved(),[]);assert.ok(h.errors.length);
  });
});
test('an unconfirmed descendant transfer retains all earlier reminders',async t=>{
  const h=await harness(t);h.failConfirmation=true;await h.retry();assert.deepEqual(h.transfers.map(args=>args[0]),['ls-remote','push','ls-remote']);assert.ok(!h.resolved().includes('attempt-a'));assert.deepEqual(h.stored.get('zero.pendingSync.v1:attempt-a'),h.initial);assert.ok(h.errors.length);
});
test('a changed own push attempt blocks confirmation and retains the reviewed ancestor',async t=>{
  const h=await harness(t);h.afterPush=async()=>{
    const own=[...h.stored.entries()].find(([key,value])=>key.startsWith('zero.pendingSync.v1:')&&value.id!=='attempt-a');
    assert.ok(own,'Durable own attempt exists before dispatch');h.stored.set(own[0],{...own[1],kind:'changed'});
  };
  await h.retry();assert.deepEqual(h.transfers.map(args=>args[0]),['ls-remote','push']);assert.ok(!h.resolved().includes('attempt-a'));assert.ok(h.errors.length);
});
test('confirmation never resolves a new matching reminder outside the reviewed snapshot',async t=>{
  for(const descendant of [true,false])await t.test(descendant?'descendant retry':'exact retry',async t=>{
    const h=await harness(t,{kind:'network',pushStarted:descendant});if(!descendant)h.head=A;const late={...h.initial,id:'later-attempt',head:descendant?B:A};
    h.afterConfirmation=async()=>h.stored.set('zero.pendingSync.v1:'+late.id,late);
    await h.retry();assert.ok(h.resolved().includes('attempt-a'));assert.ok(!h.resolved().includes(late.id));assert.deepEqual(h.stored.get('zero.pendingSync.v1:'+late.id),late);assert.deepEqual(h.errors,[]);
  });
});
test('a behind reminder with no newer saved head explains which update is needed',async t=>{
  const h=await harness(t);h.head=A;await h.retry();assert.equal(h.warnings.length,0);assert.equal(h.transfers.length,0);assert.deepEqual(h.resolved(),[]);assert.match(h.errors[0],/no newer saved commits.*Update this branch from GitHub/);
});
