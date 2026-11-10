'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const core=require('../src/core'),github=require('../src/github');
const {createTransport}=require('../src/transport');
const {createRepositoryReminderStorage}=require('../src/repository-reminder-storage');
const {appSessions}=require('./fixtures/app-sessions'),{textInputs}=require('./fixtures/text-input');
const execute=promisify(execFile),disposable=()=>({dispose(){}});
const remote='https://github.com/student/descendant.git',page='https://github.com/student/descendant';

async function harness(t,scenario) {
  const denied=await new Promise(resolve=>{const server=net.createServer();server.once('error',resolve);server.listen(0,'127.0.0.1',()=>server.close(()=>resolve(null)));});assert.ok(denied&&['EPERM','EACCES'].includes(denied.code),'OS network denial is required');
  const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-descendant-real-git-'))),root=path.join(parent,'student'),bare=path.join(parent,'remote.git');
  const subscriptions=[],actualSync=github.syncExistingHead,originalEnv={...process.env};
  for(const key of Object.keys(process.env))if(/^(?:GIT_|SSH_|GH_|GITHUB_|GCM_)/i.test(key)||/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|AUTH_SOCK)/i.test(key)||/^(?:HOME|XDG_CONFIG_HOME|PATH)$/i.test(key))delete process.env[key];
  Object.assign(process.env,{HOME:parent,XDG_CONFIG_HOME:parent,PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'});
  t.after(async()=>{subscriptions.forEach(value=>value.dispose());github.syncExistingHead=actualSync;delete require.cache[require.resolve('../src/extension')];await fs.rm(parent,{recursive:true,force:true});for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,originalEnv);});
  await fs.mkdir(root);await fs.mkdir(bare);
  const git=async(cwd,args)=>{
    assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));
    if(['push','fetch','ls-remote','clone','pull'].includes(args[0]))assert.ok(args.includes(bare),'Every Git transfer uses only the disposable bare repository');
    return core.git(cwd,args);
  };
  await git(bare,['init','--bare','--template=','--initial-branch=main']);await git(root,['init','--template=','-b','feature']);await git(bare,['config','core.hooksPath',os.devNull]);await git(root,['config','core.hooksPath',os.devNull]);
  await git(root,['config','user.name','Student']);await git(root,['config','user.email','student@example.invalid']);
  await fs.writeFile(path.join(root,'zero.json'),'{}\n');await fs.writeFile(path.join(root,'Main.java'),'class Main {}\n');
  await git(root,['add','.']);await git(root,['commit','-m','Earlier saved work']);const a=await git(root,['rev-parse','HEAD']);
  await git(root,['push',bare,`${a}:refs/heads/feature`]);
  await fs.writeFile(path.join(root,'Main.java'),'class Main { int score; }\n');await git(root,['add','Main.java']);await git(root,['commit','-m','Updated saved work']);const b=await git(root,['rev-parse','HEAD']);
  if(scenario==='already-present')await git(root,['push',bare,`${b}:refs/heads/feature`]);
  await git(root,['remote','add','origin',remote]);
  const stored=new Map(),state={keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>{stored.set(key,structuredClone(value));}};
  const ledger=createRepositoryReminderStorage({state});assert.equal(await ledger.supportsFileLedger(root),true);
  const fields={root,branch:'feature',remote,page,accountId:'1',type:'push',committed:true,pushStarted:true};
  const earlier=await ledger.add(root,{...fields,head:a,kind:'behind'}),updated=await ledger.add(root,{...fields,head:b,kind:'network'});
  const local=scenario==='already-present'?await ledger.add(root,{root,branch:'feature',head:b,remote:'',type:'local'}):undefined;
  const late=[];
  // Preserve the actual implementation and its post-push beforeUpload guard.
  // Add fresh records only after the exact confirmation transaction finishes.
  github.syncExistingHead=async(...args)=>{
    const result=await actualSync(...args);
    if(scenario==='success'){
      late.push(await ledger.add(root,{...fields,head:b,kind:'network'}));
      late.push(await ledger.add(root,{...fields,branch:'another-branch',head:a,kind:'network'}));
    }
    return result;
  };
  const commands=new Map(),warnings=[],errors=[],logs=[],calls=[];let provider,mode='simulation';
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'LOCAL_FIXTURE_ONLY'};
  const vscode={
    authentication:{getSession:async()=>session,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:root}}],textDocuments:[],getConfiguration:section=>({get:(key,fallback)=>section==='zero'&&key==='uploadMode'?mode:fallback}),saveAll:async()=>true,registerTextDocumentContentProvider:disposable,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine:value=>logs.push(value),dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,showQuickPick:async()=>{},showInputBox:async()=>{},showInformationMessage:async()=>{},showWarningMessage:async(message,options,...actions)=>{warnings.push({message,options,actions});return actions[0];},showErrorMessage:async message=>errors.push(message)},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const load=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){
    if(id==='./transport')return {createTransport:(destination,authenticate,options)=>createTransport(destination,authenticate,{...options,spawn:async(command,args,spawnOptions)=>{
      assert.equal(command,'git');assert.ok(['push','ls-remote'].includes(args[0]));assert.ok(args.includes(remote));
      assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
      const localArgs=args.map(arg=>arg===remote?bare:arg);assert.ok(localArgs.includes(bare));assert.ok(!localArgs.some(arg=>/^https?:/.test(arg)));
      calls.push(args);
      if(args[0]==='push'&&scenario==='push-failure')throw Object.assign(Error('Injected offline failure before local dispatch'),{code:'ENETUNREACH'});
      const result=await execute(command,localArgs,spawnOptions);
      if(args[0]==='ls-remote'&&scenario==='confirmation-mismatch')return {...result,stdout:`${a}\trefs/heads/feature\n`};
      return result;
    }})};
    return id==='vscode'?textInputs(vscode):load.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
  extension.activate({extensionMode:2,subscriptions,workspaceState:state},{env:{},provider:appSessions(vscode,{dispose(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
  const webview={html:'',onDidReceiveMessage:disposable};provider.resolveWebviewView({webview,onDidDispose:disposable});
  const deadline=Date.now()+10000;while(!webview.html.includes('Current branch: feature')){assert.ok(Date.now()<deadline,'Project rendered');await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(calls.length,0,'Initial simulation mode never dispatches a transfer');mode='live';
  // The extension serializes its own background readers. This independent
  // observer waits for their foreign lock; it never removes or bypasses it.
  const activeRecords=async()=>{
    const deadline=Date.now()+5000;
    while(true){try{return await ledger.list(root);}catch(error){if(!/storage is locked/.test(error.message)||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,20));}}
  };
  return {root,bare,a,b,earlier,updated,local,late,ledger,stored,warnings,errors,logs,calls,git,activeRecords,retry:async()=>{await commands.get('zero.retryBranchSync')();mode='simulation';}};
}

test('real Git already-present descendant confirms reviewed records without a push',{skip:process.platform==='win32'||process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
  const h=await harness(t,'already-present');await h.retry();
  assert.deepEqual(h.errors,[]);assert.equal(h.warnings.length,1);assert.deepEqual(h.calls.map(args=>args[0]),['ls-remote','ls-remote']);
  assert.equal(await h.git(h.bare,['rev-parse','refs/heads/feature']),h.b);assert.equal(await h.git(h.root,['rev-parse','HEAD']),h.b);
  const remaining=await h.activeRecords();for(const row of [h.earlier,h.updated,h.local])assert.ok(!remaining.some(item=>item.id===row.id),'Reviewed record was reconciled');
  const confirmed=[...h.stored.entries()].filter(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.reason==='confirmed').map(([,value])=>value.record);
  for(const row of [h.earlier,h.updated,h.local])assert.ok(confirmed.some(item=>JSON.stringify(item)===JSON.stringify(row)),'Exact reviewed record is confirmed');
});

test('real Git descendant retry confirms exact reviewed attempts and retains later receipts',{skip:process.platform==='win32'||process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
  const h=await harness(t,'success');await h.retry();
  assert.deepEqual(h.errors,[]);assert.equal(h.warnings.length,1);assert.match(h.warnings[0].options.detail,new RegExp(h.a));assert.match(h.warnings[0].options.detail,new RegExp(h.b));
  assert.deepEqual(h.calls.map(args=>args[0]),['ls-remote','ls-remote','push','ls-remote']);assert.equal(await h.git(h.bare,['rev-parse','refs/heads/feature']),h.b);
  const remaining=await h.activeRecords();assert.deepEqual(new Set(remaining.map(row=>row.id)),new Set(h.late.map(row=>row.id)));
  const confirmed=[...h.stored.entries()].filter(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.reason==='confirmed').map(([,value])=>value.record);
  for(const record of [h.earlier,h.updated])assert.ok(confirmed.some(row=>JSON.stringify(row)===JSON.stringify(record)),'Exact reviewed record is confirmed');
  assert.ok(confirmed.some(row=>row.head===h.b&&row.id!==h.updated.id),'The real durable own attempt is confirmed');
  for(const record of h.late)assert.ok(!confirmed.some(row=>row.id===record.id),'Later matching and unrelated receipts stay unresolved');
  assert.equal(await h.git(h.root,['rev-parse','HEAD']),h.b);assert.equal(await h.git(h.root,['status','--porcelain=v1']), '');
  assert.ok((await fs.readdir(path.join(h.root,'.git','zero-pending-sync'))).length>0,'Production file-ledger records are present');
});
test('real Git descendant retry retains reviewed attempts when confirmation or push fails',{skip:process.platform==='win32'||process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
  for(const scenario of ['confirmation-mismatch','push-failure'])await t.test(scenario,async t=>{
    const h=await harness(t,scenario);await h.retry();
    assert.ok(h.errors.length);assert.equal(h.warnings.length,1);assert.deepEqual(h.calls.map(args=>args[0]),scenario==='push-failure'?['ls-remote','ls-remote','push']:['ls-remote','ls-remote','push','ls-remote']);
    const remaining=await h.activeRecords();
    for(const record of [h.earlier,h.updated])assert.ok(remaining.some(row=>JSON.stringify(row)===JSON.stringify(record)),'Failed confirmation retains exact earlier records');
    assert.ok(remaining.length>2,'Own attempt and failure evidence remain');
    assert.equal(await h.git(h.bare,['rev-parse','refs/heads/feature']),scenario==='push-failure'?h.a:h.b);
    assert.equal(await h.git(h.root,['rev-parse','HEAD']),h.b);assert.equal(await h.git(h.root,['status','--porcelain=v1']), '');
  });
});
