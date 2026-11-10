'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {repositoryLedgerFactory}=require('./fixtures/repository-ledger');
const disposable=()=>({dispose(){}});
const waitFor=async condition=>{const deadline=Date.now()+10000;while(!condition()){assert.ok(Date.now()<deadline,'Expected branch connection state');await new Promise(resolve=>setTimeout(resolve,5));}};
test('Project checks main on open and focus, distinguishes access and connection failures, and discards changed HEAD observations',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-branch-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('add','.');git('commit','-qm','base');git('remote','add','origin','https://github.com/student/project.git');
  let head=git('rev-parse','HEAD'),remote=head,view,focus,metadataChanged,accessError,release,entered,gate,authEvent,configurationChanged,onWarning,compareCommits,mode='live',sessionReads=0,saved=0;
  const calls=[],permissions=[],warnings=[],errors=[],commands=new Map(),subscriptions=[];
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'PRIVATE_TEST_TOKEN',scopes:[]};
  const vscode={
    authentication:{registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,textDocuments:[],registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],saveAll:async()=>{saved++;return true;},getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?mode:fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:fn=>{configurationChanged=fn;return disposable();},createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadataChanged=fn;return disposable();},dispose(){}})},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{view=provider;return disposable();},onDidChangeWindowState:fn=>{focus=fn;return disposable();},showWarningMessage:async(text,options)=>{warnings.push({text,options});return onWarning?.();},showErrorMessage:async text=>errors.push(text)},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();assert.equal(args[0],'ls-remote');assert.ok(['refs/heads/main','refs/heads/feature'].includes(args[3]));calls.push(args);const result=remote;if(gate){entered();await gate;}return `${result}\t${args[3]}`;}};return oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>{sessionReads++;return [session];},onDidChangeSessions:fn=>{authEvent=fn;return disposable();},dispose(){}},repositories:{checkSetup:async()=>({}),access:async(_,{permissions:requested})=>{permissions.push(requested);if(accessError)throw accessError;return {repository:{id:12},installation:{id:99}};},compareCommits:(...args)=>compareCommits?.(...args)}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  await waitFor(()=>webview.html.includes('data-branch-state="synced"'));assert.doesNotMatch(webview.html,/Branch matched GitHub at the last check/);assert.ok(calls.length);assert.ok(permissions.every(value=>value.contents==='read'));assert.doesNotMatch(webview.html,/PRIVATE_TEST_TOKEN/);
  assert.match(webview.html,/<button id="branch-sync"[^>]*Outgoing commits: 0\. Incoming commits: 0\./);
  assert.match(webview.html,/<button id="branch-sync"[^>]* disabled>/);
  // A focus while the old remote observation is in flight must queue one new check.
  gate=new Promise(resolve=>{release=resolve;});const focusEntered=new Promise(resolve=>{entered=resolve;});
  const oldCheck=commands.get('zero.checkBranchConnection')();await focusEntered;const beforeFocusCheck=calls.length;
  assert.match(webview.html,/<button id="branch-sync"[^>]*Outgoing commits: 0\. Incoming commits: 0\./,
    'Keep the last comparison visible during a fresh check');
  assert.match(webview.html,/<button id="branch-sync"[^>]* disabled>/);
  remote='a'.repeat(40);focus({focused:true});await new Promise(resolve=>setTimeout(resolve,150));
  gate=undefined;release();await oldCheck;await waitFor(()=>calls.length>beforeFocusCheck&&webview.html.includes('data-branch-state="remote-changed"'));
  focus({focused:true});await waitFor(()=>webview.html.includes('data-branch-state="remote-changed"'));assert.match(webview.html,/aria-label="Sync with GitHub/);
  const alias=root+'-alias';await fs.symlink(root,alias);t.after(()=>fs.unlink(alias));
  const dirty={isDirty:true,uri:{scheme:'file',fsPath:path.join(alias,'zero.json')}};vscode.workspace.textDocuments=[dirty];
  let beforeBlocked={warnings:warnings.length,calls:calls.length,saved};await commands.get('zero.reviewBranchUpdate')();
  assert.deepEqual({warnings:warnings.length,calls:calls.length,saved},beforeBlocked);assert.match(errors.at(-1),/Save or undo/);assert.equal(dirty.isDirty,true);
  vscode.workspace.textDocuments=[];await fs.writeFile(path.join(root,'uncommitted.txt'),'work');
  beforeBlocked={warnings:warnings.length,calls:calls.length,saved};await commands.get('zero.reviewBranchUpdate')();
  assert.deepEqual({warnings:warnings.length,calls:calls.length,saved},beforeBlocked);assert.match(errors.at(-1),/Commit or discard/);assert.equal(await fs.readFile(path.join(root,'uncommitted.txt'),'utf8'),'work');
  await fs.unlink(path.join(root,'uncommitted.txt'));await commands.get('zero.checkBranchConnection')();await waitFor(()=>webview.html.includes('data-branch-state="remote-changed"'));
  onWarning=()=>{vscode.workspace.textDocuments=[dirty];return 'Update branch';};
  const beforePromptDrift={calls:calls.length,saved};await commands.get('zero.reviewBranchUpdate')();onWarning=undefined;
  assert.equal(calls.length,beforePromptDrift.calls,'An edit during confirmation blocks update transport');assert.equal(saved,beforePromptDrift.saved);assert.equal(dirty.isDirty,true);assert.match(errors.at(-1),/Save or undo/);
  vscode.workspace.textDocuments=[];await commands.get('zero.checkBranchConnection')();await waitFor(()=>webview.html.includes('data-branch-state="remote-changed"'));
  const beforeCancel=calls.length;await commands.get('zero.reviewBranchUpdate')();assert.match(warnings.at(-1).options.detail,/https:\/\/github.com\/student\/project/);assert.match(warnings.at(-1).options.detail,/without uploading/);assert.equal(calls.length,beforeCancel,'Cancel does not start an update');
  const beforeUnavailable=calls.length;onWarning=()=>{remote='d'.repeat(40);return 'Update branch';};await commands.get('zero.reviewBranchUpdate')();onWarning=undefined;assert.match(errors.at(-1),/GitHub could not complete this step.*feature and commits are preserved/i);assert.ok(calls.slice(beforeUnavailable).every(args=>args[0]==='ls-remote'),'Unavailable changed target never pushes');assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('status','--porcelain'),'');await waitFor(()=>!webview.html.includes('data-branch-state="checking"'));
  accessError={code:'permission-required'};await commands.get('zero.checkBranchConnection')();assert.match(webview.html,/data-branch-state="access"/);
  accessError={code:'network-error'};await commands.get('zero.checkBranchConnection')();assert.match(webview.html,/data-branch-state="offline"/);
  accessError=undefined;remote=head;
  gate=new Promise(resolve=>{release=resolve;});const waiting=new Promise(resolve=>{entered=resolve;});const checking=commands.get('zero.checkBranchConnection')();await waiting;
  await fs.writeFile(path.join(root,'later'),'later');git('add','.');git('commit','-qm','later');head=git('rev-parse','HEAD');metadataChanged({fsPath:path.join(root,'.git','HEAD')});await new Promise(resolve=>setTimeout(resolve,100));
  gate=undefined;release();await checking;await waitFor(()=>!webview.html.includes('data-branch-state="checking"'));
  assert.doesNotMatch(webview.html,/data-branch-state="synced"/);assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('status','--porcelain'),'');
  remote=head;await commands.get('zero.checkBranchConnection')();assert.match(webview.html,/data-branch-state="synced"/);
  remote=git('commit-tree','-m','Incoming commit',git('rev-parse','HEAD^{tree}'),'-p',head);
  await commands.get('zero.checkBranchConnection')();
  assert.match(webview.html,/<button id="branch-sync"[^>]*data-command="zero.syncBranch"[^>]*Outgoing commits: 0\. Incoming commits: 1\./);
  assert.match(webview.html,/↑ 0<\/span><span aria-hidden="true">↓ 1<\/span>/);
  assert.doesNotMatch(webview.html,/<button id="branch-sync"[^>]* disabled>/);
  remote=head;await commands.get('zero.checkBranchConnection')();
  remote='e'.repeat(40);
  let comparison,finishComparison;
  const comparisonStarted=new Promise(resolve=>{comparison=resolve;});
  const comparisonGate=new Promise(resolve=>{finishComparison=resolve;});
  compareCommits=async(page,{base,head:target})=>{
    comparison({page,base,target});
    return comparisonGate;
  };
  let branchCheckDone=false;
  const countsCheck=commands.get('zero.checkBranchConnection')().then(()=>{branchCheckDone=true;});
  try {
    assert.deepEqual(await comparisonStarted,{page:'https://github.com/student/project',base:head,target:remote});
    await waitFor(()=>branchCheckDone);
    assert.match(webview.html,/<button id="branch-sync"[^>]*aria-label="Sync with GitHub"[^>]*>Sync<\/button>/);
    const beforeReview=warnings.length;
    await commands.get('zero.reviewBranchUpdate')();
    assert.equal(warnings.length,beforeReview+1,'Update review is available before the counts return');
  } finally {
    finishComparison({outgoing:0,incoming:3});await countsCheck;compareCommits=undefined;
  }
  await waitFor(()=>webview.html.includes('Incoming commits: 3.'));
  assert.match(webview.html,/↑ 0<\/span><span aria-hidden="true">↓ 3<\/span>/);
  remote=head;await commands.get('zero.checkBranchConnection')();
  // Replacing a token with identical session/account IDs invalidates the old
  // in-flight observation and immediately schedules a fresh one.
  gate=new Promise(resolve=>{release=resolve;});let tokenEntered;const tokenWaiting=new Promise(resolve=>{tokenEntered=resolve;});entered=tokenEntered;
  const tokenCheck=commands.get('zero.checkBranchConnection')();await tokenWaiting;const beforeToken=calls.length;remote='b'.repeat(40);session.accessToken='REPLACED_TEST_TOKEN';authEvent({changed:[session]});
  await new Promise(resolve=>setTimeout(resolve,10));gate=undefined;release();await tokenCheck;await waitFor(()=>calls.length>beforeToken&&webview.html.includes('data-branch-state="remote-changed"'));assert.doesNotMatch(webview.html,/Branch matched GitHub/);
  for(const name of ['info/grafts','shallow']) {
    remote=head;gate=new Promise(resolve=>{release=resolve;});const waitingGraph=new Promise(resolve=>{entered=resolve;});const graphCheck=commands.get('zero.checkBranchConnection')();await waitingGraph;
    const file=path.join(root,'.git',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,head+'\n');gate=undefined;release();await graphCheck;assert.doesNotMatch(webview.html,/data-branch-state="(?:synced|local-ahead)"/);await fs.unlink(file);
    await commands.get('zero.checkBranchConnection')();assert.match(webview.html,/data-branch-state="synced"/);
  }
  git('config','remote.origin.promisor','true');
  const beforePartial={transport:calls.length,access:permissions.length};
  await commands.get('zero.checkBranchConnection')();
  assert.match(webview.html,/data-branch-state="unknown"/);
  assert.deepEqual({transport:calls.length,access:permissions.length},beforePartial);
  git('config','--unset','remote.origin.promisor');
  git('checkout','-qb','feature');remote='c'.repeat(40);metadataChanged({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('Current branch: feature')&&webview.html.includes('data-branch-state="remote-changed"'));
  await commands.get('zero.reviewBranchUpdate')();assert.match(warnings.at(-1).options.detail,/Update feature from https:\/\/github.com\/student\/project/);assert.match(warnings.at(-1).options.detail,/automatically syncs the resulting branch commit to GitHub/);
  mode='simulation';configurationChanged({affectsConfiguration:key=>key==='zero.uploadMode'});assert.match(webview.html,/Simulation — nothing will be uploaded/);assert.doesNotMatch(webview.html,/data-command="zero.checkBranchConnection"/);const beforeSimulation=calls.length;await commands.get('zero.checkBranchConnection')();assert.equal(calls.length,beforeSimulation);
});

test('focus refreshes externally changed branch and remote in a linked worktree',async t=>{
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-branch-ui-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  let root=base;
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','base');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('add','.');git('commit','-qm','base');git('remote','add','origin','https://github.com/student/project.git');
  const linked=path.join(base,'linked');git('worktree','add','-qb','main',linked);root=linked;
  let head=git('rev-parse','HEAD'),remote=head,view,focus,metadataChanged,accessError,release,entered,gate,authEvent,configurationChanged,onWarning,mode='live';
  const calls=[],permissions=[],warnings=[],errors=[],commands=new Map(),subscriptions=[];let treeInvalidations=0;
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'PRIVATE_TEST_TOKEN',scopes:[]};
  const vscode={
    authentication:{registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],saveAll:async()=>true,getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?mode:fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:fn=>{configurationChanged=fn;return disposable();},createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadataChanged=fn;return disposable();},dispose(){}})},
    window:{createTreeView:disposable,createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{view=provider;return disposable();},onDidChangeWindowState:fn=>{focus=fn;return disposable();},showWarningMessage:async(text,options)=>{warnings.push({text,options});return onWarning?.();},showErrorMessage:async text=>errors.push(text)},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./student-explorer')return {createStudentExplorer:()=>({commands:{},invalidate(){treeInvalidations++;},dispose(){}})};if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();assert.equal(args[0],'ls-remote');assert.ok(['refs/heads/main','refs/heads/feature'].includes(args[3]));calls.push(args);const result=remote;if(gate){entered();await gate;}return `${result}\t${args[3]}`;}};return oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>[session],onDidChangeSessions:fn=>{authEvent=fn;return disposable();},dispose(){}},repositories:{checkSetup:async()=>({}),access:async(_,{permissions:requested})=>{permissions.push(requested);if(accessError)throw accessError;return {repository:{id:12},installation:{id:99}};}}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  await waitFor(()=>webview.html.includes('data-branch-state="synced"'));assert.ok(calls.length);assert.ok(permissions.every(value=>value.contents==='read'));assert.doesNotMatch(webview.html,/PRIVATE_TEST_TOKEN/);
  const beforeFocus=treeInvalidations;
  git('checkout','-qb','feature');git('remote','set-url','origin','https://github.com/student/other.git');remote='c'.repeat(40);focus({focused:true});
  await waitFor(()=>webview.html.includes('Current branch: feature')&&webview.html.includes('data-branch-state="remote-changed"'));
  assert.ok(treeInvalidations>beforeFocus,'Focus invalidates the file tree');
  assert.ok(calls.some(args=>args[2]==='https://github.com/student/other.git'&&args[3]==='refs/heads/feature'));
});

test('a changed branch queues a fresh in-flight main update check',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-branch-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('add','.');git('commit','-qm','base');git('remote','add','origin','https://github.com/student/project.git');
  git('checkout','-qb','feature');git('branch','feature-two');
  let head=git('rev-parse','HEAD'),remote=head,view,focus,metadataChanged,accessError,release,entered,gate,authEvent,configurationChanged,onWarning,mode='live';
  const calls=[],permissions=[],warnings=[],errors=[],commands=new Map(),subscriptions=[],mainChecks=[];let treeInvalidations=0,releaseMain,enteredMain;const waitingMain=new Promise(resolve=>{enteredMain=resolve;});const mainGate=new Promise(resolve=>{releaseMain=resolve;});
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'PRIVATE_TEST_TOKEN',scopes:[]};
  const vscode={
    authentication:{registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],saveAll:async()=>true,getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?mode:fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:fn=>{configurationChanged=fn;return disposable();},createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadataChanged=fn;return disposable();},dispose(){}})},
    window:{createTreeView:disposable,createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{view=provider;return disposable();},onDidChangeWindowState:fn=>{focus=fn;return disposable();},showWarningMessage:async(text,options)=>{warnings.push({text,options});return onWarning?.();},showErrorMessage:async text=>errors.push(text)},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./github-app/readiness')return {createGitHubReadiness:()=>({phase:'ready',sync(){},refresh:async()=>{},confirm(){},dispose(){}})};if(id==='./main-update-status')return {checkMainUpdate:async({readState})=>{const state=await readState();mainChecks.push(state.branch);if(mainChecks.length===1){enteredMain();await mainGate;}return {state:'current',localUpdate:false};}};if(id==='./student-explorer')return {createStudentExplorer:()=>({commands:{},invalidate(){treeInvalidations++;},dispose(){}})};if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();assert.equal(args[0],'ls-remote');assert.ok(['refs/heads/main','refs/heads/feature','refs/heads/feature-two'].includes(args[3]));calls.push(args);const result=remote;if(gate){entered();await gate;}return `${result}\t${args[3]}`;}};return oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>[session],onDidChangeSessions:fn=>{authEvent=fn;return disposable();},dispose(){}},repositories:{checkSetup:async()=>({}),access:async(_,{permissions:requested})=>{permissions.push(requested);if(accessError)throw accessError;return {repository:{id:12},installation:{id:99}};}}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  await waitingMain;git('checkout','-q','feature-two');focus({focused:true});
  await waitFor(()=>webview.html.includes('Current branch: feature-two'));releaseMain();
  await waitFor(()=>mainChecks.includes('feature-two'));assert.deepEqual(mainChecks.slice(0,2),['feature','feature-two']);
});

test('same-account session replacement queues a fresh main update check',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-branch-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('add','.');git('commit','-qm','base');git('remote','add','origin','https://github.com/student/project.git');
  git('checkout','-qb','feature');git('branch','feature-two');
  let head=git('rev-parse','HEAD'),remote=head,view,focus,metadataChanged,accessError,release,entered,gate,authEvent,configurationChanged,onWarning,mode='live';
  const calls=[],permissions=[],warnings=[],errors=[],commands=new Map(),subscriptions=[],mainChecks=[];let treeInvalidations=0,releaseMain,enteredMain;const waitingMain=new Promise(resolve=>{enteredMain=resolve;});const mainGate=new Promise(resolve=>{releaseMain=resolve;});
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'PRIVATE_TEST_TOKEN',scopes:[]};
  const vscode={
    authentication:{registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],saveAll:async()=>true,getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?mode:fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:fn=>{configurationChanged=fn;return disposable();},createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadataChanged=fn;return disposable();},dispose(){}})},
    window:{createTreeView:disposable,createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{view=provider;return disposable();},onDidChangeWindowState:fn=>{focus=fn;return disposable();},showWarningMessage:async(text,options)=>{warnings.push({text,options});return onWarning?.();},showErrorMessage:async text=>errors.push(text)},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const oldLoad=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){if(id==='vscode')return vscode;if(id==='./github-app/readiness')return {createGitHubReadiness:()=>({phase:'ready',sync(){},refresh:async()=>{},confirm(){},dispose(){}})};if(id==='./main-update-status')return {checkMainUpdate:async({readState})=>{const state=await readState();mainChecks.push(state.branch);if(mainChecks.length===1){enteredMain();await mainGate;}return {state:'current',localUpdate:false};}};if(id==='./student-explorer')return {createStudentExplorer:()=>({commands:{},invalidate(){treeInvalidations++;},dispose(){}})};if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();assert.equal(args[0],'ls-remote');assert.ok(['refs/heads/main','refs/heads/feature','refs/heads/feature-two'].includes(args[3]));calls.push(args);const result=remote;if(gate){entered();await gate;}return `${result}\t${args[3]}`;}};return oldLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=oldLoad;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>[session],onDidChangeSessions:fn=>{authEvent=fn;return disposable();},dispose(){}},repositories:{checkSetup:async()=>({}),access:async(_,{permissions:requested})=>{permissions.push(requested);if(accessError)throw accessError;return {repository:{id:12},installation:{id:99}};}}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  await waitingMain;session.accessToken='NEW_TEST_TOKEN';authEvent({changed:[session]});releaseMain();
  await waitFor(()=>mainChecks.length>=2);assert.deepEqual(mainChecks.slice(0,2),['feature','feature']);
});

for (const changedRef of ['feature HEAD','local main']) test(`same-branch ${changedRef} invalidates in-flight and completed main notices`,async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-main-notice-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('add','.');git('commit','-qm','base');
  const base=git('rev-parse','HEAD');git('remote','add','origin','https://github.com/student/project.git');git('checkout','-qb','feature');git('commit','--allow-empty','-qm','feature');
  const feature=git('rev-parse','HEAD');let view,metadataChanged,focus,release,entered;const checks=[],subscriptions=[];
  const firstEntered=new Promise(resolve=>{entered=resolve;}),firstGate=new Promise(resolve=>{release=resolve;});
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'PRIVATE_TEST_TOKEN',scopes:[]};
  const vscode={authentication:{registerAuthenticationProvider:disposable},workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],saveAll:async()=>true,getConfiguration:()=>({get:(_,fallback)=>fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadataChanged=fn;return disposable();},dispose(){}})},
    window:{createTreeView:disposable,createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{view=provider;return disposable();},onDidChangeWindowState:fn=>{focus=fn;return disposable();},showWarningMessage:async()=>{},showErrorMessage:async error=>assert.fail(error)},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:()=>disposable(),executeCommand:async()=>{}},RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}};
  const load=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){
    if(id==='vscode')return vscode;
    if(id==='./github-app/readiness')return {createGitHubReadiness:()=>({phase:'ready',sync(){},refresh:async()=>{},confirm(){},dispose(){}})};
    if(id==='./main-update-status')return {checkMainUpdate:async({readState})=>{const state=await readState();checks.push(state);if(checks.length===1){entered();await firstGate;return {state:'available',localUpdate:false};}return {state:checks.length===2?'current':'available',localUpdate:false};}};
    if(id==='./student-explorer')return {createStudentExplorer:()=>({commands:{},invalidate(){},dispose(){}})};
    if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();assert.equal(args[0],'ls-remote');return `${git('rev-parse','HEAD')}\t${args[3]}`;}};
    return load.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>[session],onDidChangeSessions:disposable,dispose(){}},repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  await firstEntered;
  if(changedRef==='feature HEAD')git('commit','--allow-empty','-qm','new head');else git('update-ref','refs/heads/main',feature,base);
  metadataChanged({fsPath:path.join(root,'.git','refs','heads',changedRef==='feature HEAD'?'feature':'main')});
  await new Promise(resolve=>setTimeout(resolve,150));release();await waitFor(()=>checks.length>=2);
  await waitFor(()=>!webview.html.includes('GitHub main has new changes'));assert.notEqual(checks[0][changedRef==='feature HEAD'?'head':'localMain'],checks[1][changedRef==='feature HEAD'?'head':'localMain']);
  if(changedRef==='feature HEAD')git('commit','--allow-empty','-qm','another head');else {const tree=git('rev-parse',`${feature}^{tree}`),next=git('commit-tree',tree,'-p',feature,'-m','advance local main');git('update-ref','refs/heads/main',next,feature);}
  metadataChanged({fsPath:path.join(root,'.git','refs','heads',changedRef==='feature HEAD'?'feature':'main')});
  await waitFor(()=>checks.length>=3&&webview.html.includes('GitHub main has new changes'));
  const stable=checks.length;focus({focused:true});await new Promise(resolve=>setTimeout(resolve,250));assert.equal(checks.length,stable,'unchanged metadata must not trigger repeated main checks');
});

test('missing local main stays quiet without looping and retries when main returns',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-main-missing-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('add','.');git('commit','-qm','base');
  const base=git('rev-parse','HEAD');git('remote','add','origin','https://github.com/student/project.git');git('checkout','-qb','feature');git('update-ref','-d','refs/heads/main',base);
  let view,metadataChanged,focus,invalidMain=false;const checks=[],subscriptions=[],commands=new Map();const session={id:'session',account:{id:'1',label:'student'},accessToken:'PRIVATE_TEST_TOKEN',scopes:[]};
  const vscode={authentication:{registerAuthenticationProvider:disposable},workspace:{isTrusted:true,registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],saveAll:async()=>true,getConfiguration:()=>({get:(_,fallback)=>fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadataChanged=fn;return disposable();},dispose(){}})},
    window:{createTreeView:disposable,createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{view=provider;return disposable();},onDidChangeWindowState:fn=>{focus=fn;return disposable();},showQuickPick:async()=>undefined,showWarningMessage:async()=>{},showErrorMessage:async error=>assert.fail(error)},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}};
  const load=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){
    if(id==='vscode')return vscode;
    if(id==='./core'){const original=load.call(this,id,...args);return {...original,git:async(cwd,argv,options)=>invalidMain&&argv.includes('refs/heads/main^{commit}')?'invalid-oid':original.git(cwd,argv,options)};}
    if(id==='./github-app/readiness')return {createGitHubReadiness:()=>({phase:'ready',sync(){},refresh:async()=>{},confirm(){},dispose(){}})};
    if(id==='./main-update-status')return {checkMainUpdate:async({readState})=>{checks.push(await readState());return {state:'current',localUpdate:false};}};
    if(id==='./student-explorer')return {createStudentExplorer:()=>({commands:{},invalidate(){},dispose(){}})};
    if(id==='./transport')return {createTransport:(_remote,authenticate,{assertCurrentNow})=>async(_root,args)=>{await authenticate();assertCurrentNow();assert.equal(args[0],'ls-remote');return `${base}\t${args[3]}`;}};
    return load.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>[session],onDidChangeSessions:disposable,dispose(){}},repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
  const webview={html:'',onDidReceiveMessage:disposable};view.resolveWebviewView({webview,onDidDispose:disposable});
  await waitFor(()=>webview.html.includes('Current branch: feature'));focus({focused:true});await new Promise(resolve=>setTimeout(resolve,250));assert.equal(checks.length,0,'missing main must not initiate or loop a main check');
  git('update-ref','refs/heads/main',base);metadataChanged({fsPath:path.join(root,'.git','refs','heads','main')});
  await waitFor(()=>checks.length===1&&!webview.html.includes('GitHub main may have new changes'));assert.equal(checks[0].localMain,base);
  focus({focused:true});await new Promise(resolve=>setTimeout(resolve,250));assert.equal(checks.length,1,'unchanged refs must retain the check deadline');
  invalidMain=true;await commands.get('zero.chooseRepository')();
  focus({focused:true});await new Promise(resolve=>setTimeout(resolve,250));assert.equal(checks.length,1,'invalid main must not initiate or loop a main check');
  invalidMain=false;metadataChanged({fsPath:path.join(root,'.git','refs','heads','main')});await waitFor(()=>checks.length===2&&!webview.html.includes('GitHub main may have new changes'));
});

test('unborn branch keeps its GitHub origin visible until first commit and reports removed origin',async t=>{
  const core=require('../src/core'),root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-unborn-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();};
  git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'zero.json'),'{}');git('remote','add','origin','https://github.com/student/project.git');
  let provider,metadata,forceHeadError=false,forceUnbornRace=false,forceOriginError=false;const commands=new Map(),subscriptions=[],errors=[];
  const vscode={authentication:{registerAuthenticationProvider:disposable},workspace:{isTrusted:true,textDocuments:[],registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],getConfiguration:()=>({get:(_,fallback)=>fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,createFileSystemWatcher:pattern=>({onDidCreate:disposable,onDidDelete:disposable,onDidChange:fn=>{if(typeof pattern==='string'&&pattern.startsWith('**/.git/{HEAD,config,'))metadata=fn;return disposable();},dispose(){}})},window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},showErrorMessage:async message=>errors.push(message)},tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}};
  const originalGit=core.git;core.git=async(cwd,args,...rest)=>{if(forceOriginError&&args[0]==='remote'&&args[1]==='get-url')throw Object.assign(Error('Injected remote error'),{code:128});if(forceHeadError&&args[0]==='rev-parse'&&args.includes('HEAD^{commit}'))throw Object.assign(Error('Injected Git error'),{code:128});if(forceUnbornRace&&args[0]==='rev-parse'&&args.includes('--quiet')){try{return await originalGit(cwd,args,...rest);}catch(error){forceUnbornRace=false;await fs.writeFile(path.join(root,'.git','refs','heads','main'),'broken ref\n');throw error;}}return originalGit(cwd,args,...rest);};
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){if(id==='vscode')return vscode;return originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}
  t.after(()=>{subscriptions.forEach(value=>value.dispose());core.git=originalGit;delete require.cache[require.resolve('../src/extension')];});
  extension.activate({subscriptions,workspaceState:{get:(_,fallback)=>fallback,keys:()=>[],update:async()=>{}}},{repositoryLedgerFactory,provider:{getSessions:async()=>[],onDidChangeSessions:disposable,dispose(){}},repositories:{checkSetup:async()=>({})}});
  const webview={html:'',onDidReceiveMessage:disposable};provider.resolveWebviewView({webview,onDidDispose:disposable});
  await waitFor(()=>webview.html.includes('Make your first commit.'));assert.match(webview.html,/student\/<wbr>project/);assert.doesNotMatch(webview.html,/Branch matched GitHub/);assert.match(webview.html,/data-command="zero.changeHistory"[^>]*disabled/);
  const badRef=path.join(root,'.git','refs','heads','main');await fs.writeFile(badRef,'broken ref\n');metadata({fsPath:badRef});
  await waitFor(()=>/branch (?:commit cannot be verified|cannot be displayed safely)/i.test(webview.html));assert.doesNotMatch(webview.html,/[Mm]ake your first commit/);assert.match(webview.html,/student\/<wbr>project/);
  await fs.unlink(badRef);metadata({fsPath:badRef});await waitFor(()=>webview.html.includes('Make your first commit.'));
  const packed=path.join(root,'.git','packed-refs');
  for(const content of ['malformed packed reference\n',`${'a'.repeat(40)} refs/heads/main\n`]) {
    await fs.writeFile(packed,content);metadata({fsPath:packed});await waitFor(()=>/branch (?:commit cannot be verified|cannot be displayed safely)|Project Git status is unavailable/i.test(webview.html));
    assert.doesNotMatch(webview.html,/[Mm]ake your first commit|Connect a GitHub repository/);
    await fs.unlink(packed);metadata({fsPath:packed});await waitFor(()=>webview.html.includes('Make your first commit.'));
  }
  forceUnbornRace=true;metadata({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>/branch (?:commit cannot be verified|cannot be displayed safely)/i.test(webview.html));
  assert.doesNotMatch(webview.html,/[Mm]ake your first commit/);assert.equal(await fs.readFile(badRef,'utf8'),'broken ref\n');await fs.unlink(badRef);metadata({fsPath:badRef});
  await waitFor(()=>webview.html.includes('Make your first commit.'));
  git('remote','remove','origin');metadata({fsPath:path.join(root,'.git','config')});await waitFor(()=>webview.html.includes('Make your first commit.'));
  git('remote','add','origin','https://github.com/student/project.git');git('add','.');git('commit','-qm','first');metadata({fsPath:path.join(root,'.git','HEAD')});
  await waitFor(()=>webview.html.includes('Sign in to GitHub to sync.'));assert.match(webview.html,/student\/<wbr>project/);assert.doesNotMatch(webview.html,/[Mm]ake your first commit/);
  forceHeadError=true;metadata({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>webview.html.includes('The branch commit cannot be verified.'));assert.doesNotMatch(webview.html,/[Mm]ake your first commit/);assert.match(webview.html,/student\/<wbr>project/);
  forceHeadError=false;metadata({fsPath:path.join(root,'.git','HEAD')});await waitFor(()=>!webview.html.includes('The branch commit cannot be verified.'));
  forceOriginError=true;metadata({fsPath:path.join(root,'.git','config')});await waitFor(()=>webview.html.includes('Repository connection cannot be verified.'));
  assert.doesNotMatch(webview.html,/Local project · no GitHub remote connected/,'An unknown origin must not be reported as missing, even while signed out');
  forceOriginError=false;metadata({fsPath:path.join(root,'.git','config')});await waitFor(()=>webview.html.includes('student/<wbr>project'));
  git('remote','remove','origin');metadata({fsPath:path.join(root,'.git','config')});await waitFor(()=>webview.html.includes('Connect a GitHub repository to sync.'));assert.doesNotMatch(webview.html,/student\/<wbr>project/);
  git('remote','add','origin','https://github.com/student/project.git');
  const linked=root+'-linked';t.after(()=>fs.rm(linked,{recursive:true,force:true}));git('worktree','add','--orphan','-b','linked-feature',linked);await fs.writeFile(path.join(linked,'zero.json'),'{}');
  vscode.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:linked}}];metadata({fsPath:path.join(linked,'zero.json')});
  await waitFor(()=>webview.html.includes('Current branch: linked-feature')&&webview.html.includes('Make your first commit.'));
  assert.doesNotMatch(webview.html,/Branch matched GitHub/);

});
