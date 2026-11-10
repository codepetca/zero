'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const core=require('../src/core'),workflow=require('../src/workflow'),github=require('../src/github');
const {createTransport}=require('../src/transport');
const {createRepositoryReminderStorage}=require('../src/repository-reminder-storage');
const {appSessions}=require('./fixtures/app-sessions'),{textInputs}=require('./fixtures/text-input');
const execute=promisify(execFile),disposable=()=>({dispose(){}});
const remote='https://github.com/student/conflict-lifecycle.git',page='https://github.com/student/conflict-lifecycle';
const waitFor=async condition=>{const deadline=Date.now()+15000;while(!condition()){assert.ok(Date.now()<deadline,'Expected conflict recovery UI');await new Promise(resolve=>setTimeout(resolve,20));}};

test('feature conflict continuation survives restart and confirms its own real ledger attempt',{skip:process.platform==='win32'},async t=>{
  // Only an externally applied OS sandbox can deny all subprocess network
  // access. Do not attempt even the loopback denial probe in an ordinary run.
  if(process.env.ZERO_CONFLICT_TEST_NETWORK_DENIED!=='1')return t.skip('Run only inside a verified OS network-denial sandbox');
  const denial=await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port:1});socket.once('error',error=>resolve(error.code));socket.once('connect',()=>{socket.destroy();resolve('CONNECTED');});socket.setTimeout(1000,()=>{socket.destroy();resolve('TIMEOUT');});});
  assert.equal(denial,'EPERM','OS sandbox must deny outbound loopback before any Git runs');
  const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-conflict-real-'))),root=path.join(parent,'student'),bare=path.join(parent,'remote.git'),other=path.join(parent,'other');
  // The entire test process owns its environment. This also covers production
  // local Git calls which do not use the fixture helper. The Git wrapper disables
  // hooks and attributes; only local-file protocol is allowed. Global/system config,
  // inherited Git settings, credentials, templates and HOME are isolated.
  const originalEnv={...process.env},home=path.join(parent,'home'),hooks=path.join(parent,'hooks'),template=path.join(parent,'template'),bin=path.join(parent,'bin');
  const realGit=(await execute('/usr/bin/which',['git'])).stdout.trim();assert.ok(path.isAbsolute(realGit));
  await Promise.all([fs.mkdir(home),fs.mkdir(hooks),fs.mkdir(template),fs.mkdir(bin)]);
  await fs.writeFile(path.join(bin,'git'),'#!/bin/sh\nexport GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TEMPLATE_DIR="$ZERO_CONFLICT_TEMPLATE" GIT_ALLOW_PROTOCOL=file GIT_TERMINAL_PROMPT=0 GIT_ASKPASS= SSH_ASKPASS=\nexec "$ZERO_CONFLICT_REAL_GIT" -c "core.hooksPath=$ZERO_CONFLICT_HOOKS" -c core.attributesFile=/dev/null "$@"\n',{mode:0o700});
  for(const key of Object.keys(process.env))if(/^GIT_/i.test(key)||/^SSH_/i.test(key)||/^XDG_CONFIG_HOME$/i.test(key))delete process.env[key];
  Object.assign(process.env,{HOME:home,XDG_CONFIG_HOME:home,PATH:bin+path.delimiter+originalEnv.PATH,ZERO_CONFLICT_REAL_GIT:realGit,ZERO_CONFLICT_HOOKS:hooks,ZERO_CONFLICT_TEMPLATE:template,GIT_TERMINAL_PROMPT:'0'});
  t.after(()=>{for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);});
  const originalGit=core.git,originalSync=github.syncExistingHead;let subscriptions=[];
  t.after(async()=>{subscriptions.forEach(item=>item.dispose());core.git=originalGit;github.syncExistingHead=originalSync;delete require.cache[require.resolve('../src/extension')];await fs.rm(parent,{recursive:true,force:true});});
  const git=async(cwd,args)=>{
    assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
    if(['push','fetch','ls-remote','clone','pull'].includes(args[0]))assert.ok(args.includes(bare),'Transfers must use only the disposable bare repository');
    return originalGit(cwd,args);
  };
  await fs.mkdir(root);await fs.mkdir(bare);await git(bare,['init','--bare','--initial-branch=main']);await git(root,['init','-b','main']);
  await git(root,['config','user.name','Student']);await git(root,['config','user.email','student@example.invalid']);
  await fs.writeFile(path.join(root,'zero.json'),'{}\n');await fs.writeFile(path.join(root,'Main.java'),'class Main { int score; }\n');
  await git(root,['add','.']);await git(root,['commit','-m','Initial']);await git(root,['push',bare,'HEAD:refs/heads/main']);
  await git(parent,['clone',bare,other]);await git(other,['config','user.name','Other']);await git(other,['config','user.email','other@example.invalid']);
  await git(root,['checkout','-b','feature']);await fs.writeFile(path.join(root,'Main.java'),'class Main { int localScore; }\n');await git(root,['add','Main.java']);await git(root,['commit','-m','Local change']);
  const localHead=await git(root,['rev-parse','HEAD']);await git(root,['push',bare,'HEAD:refs/heads/feature']);
  await fs.writeFile(path.join(other,'Main.java'),'class Main { int incomingScore; }\n');await git(other,['add','Main.java']);await git(other,['commit','-m','Incoming change']);
  const mainHead=await git(other,['rev-parse','HEAD']);await git(other,['push',bare,'HEAD:refs/heads/main']);await git(root,['remote','add','origin',remote]);
  const localRun=(cwd,args,options)=>{assert.ok(!['push','fetch','ls-remote','pull','clone'].includes(args[0]));return originalGit(cwd,args,options);};
  const localTransport=(cwd,args)=>{assert.ok(['ls-remote','fetch'].includes(args[0]));assert.ok(args.includes(remote));return git(cwd,args.map(value=>value===remote?bare:value));};
  const options={run:localRun,networkRun:localTransport};const update=await workflow.syncPrepared(await workflow.prepareSync(root,options),options);
  assert.equal(update.synced,false);assert.equal(update.recovery.branch,'feature');assert.equal(update.recovery.files[0].kind,'text');
  const stored=new Map(),state={keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>stored.set(key,structuredClone(value))};
  const ledger=createRepositoryReminderStorage({state});assert.equal(await ledger.supportsFileLedger(root),true);
  const calls=[],errors=[],late=[];let failCommit=true;
  core.git=async(cwd,args,opts)=>{
    if(failCommit&&cwd===root&&args.includes('commit')&&args.includes('--no-edit')){failCommit=false;throw Error('Injected failure before merge commit dispatch');}
    assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
    return originalGit(cwd,args,opts);
  };
  github.syncExistingHead=async(...args)=>{
    const result=await originalSync(...args);
    late.push(await ledger.add(root,{root,branch:'another',head:localHead,remote,page,accountId:'1',type:'push',committed:false,pushStarted:true,kind:'network'}));
    return result;
  };
  const activate=()=>{
    const commands=new Map();let provider;subscriptions=[];
    const session={id:'session',account:{id:'1',label:'student'},accessToken:'LOCAL_FIXTURE_ONLY'};
    const vscode={
      authentication:{getSession:async()=>session,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
      workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:root}}],textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>assert.fail('Recovery must not save editors'),registerTextDocumentContentProvider:disposable,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
      window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,showQuickPick:async()=>{},showInputBox:async()=>assert.fail('Recovery must not request a message'),showInformationMessage:async()=>{},showWarningMessage:async(_message,_options,...actions)=>actions[0],showErrorMessage:async message=>errors.push(message)},
      tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
    };
    const load=Module._load;delete require.cache[require.resolve('../src/extension')];
    Module._load=function(id,...args){
      if(id==='./transport')return {createTransport:(destination,authenticate,transportOptions)=>createTransport(destination,authenticate,{...transportOptions,spawn:async(command,argv,spawnOptions)=>{
        assert.equal(command,'git');assert.ok(['push','ls-remote','fetch'].includes(argv[0]));assert.ok(argv.includes(remote));
        assert.ok(!argv.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
        const local=argv.map(arg=>arg===remote?bare:arg);assert.ok(local.includes(bare));assert.ok(!local.some(arg=>/^https?:/.test(arg)));calls.push(argv);
        return execute(command,local,spawnOptions);
      }})};
      return id==='vscode'?textInputs(vscode):load.call(this,id,...args);
    };
    let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
    extension.activate({subscriptions,workspaceState:state},{provider:appSessions(vscode,{dispose(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
    const webview={html:'',onDidReceiveMessage:disposable};provider.resolveWebviewView({webview,onDidDispose:disposable});
    return {commands,webview,dispose(){subscriptions.forEach(item=>item.dispose());subscriptions=[];}};
  };
  let ui=activate();await waitFor(()=>ui.webview.html.includes('data-command="zero.useIncomingUpdate"'));
  const choice=/data-command="zero.useIncomingUpdate" data-recovery="([a-f0-9]+)"/.exec(ui.webview.html);assert.ok(choice);
  await ui.commands.get('zero.useIncomingUpdate')(choice[1]);assert.equal(failCommit,false);assert.equal(errors.length,1);assert.match(errors[0],/conflict choice stopped/i);
  const ready=await workflow.readRecovery(root);assert.equal(ready.readyToCommit,true);assert.equal(await git(root,['rev-parse','HEAD']),localHead);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'class Main { int incomingScore; }\n');
  assert.equal(await git(bare,['rev-parse','refs/heads/feature']),localHead);assert.equal(await git(bare,['rev-parse','refs/heads/main']),mainHead);
  assert.equal(calls.filter(args=>args[0]==='push').length,0);
  ui.dispose();ui=activate();await waitFor(()=>ui.webview.html.includes('data-command="zero.continueUpdate"'));
  const continuation=/data-command="zero.continueUpdate" data-recovery="([a-f0-9]+)"/.exec(ui.webview.html);assert.ok(continuation);
  await ui.commands.get('zero.continueUpdate')(continuation[1]);await waitFor(()=>ui.webview.html.includes('synced to GitHub'));
  assert.equal(errors.length,1,'Continuing and syncing must not report another error');
  const finalHead=await git(root,['rev-parse','HEAD']);assert.equal(await git(root,['rev-list','--parents','-n','1',finalHead]),`${finalHead} ${localHead} ${mainHead}`);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'class Main { int incomingScore; }\n');
  const pushes=calls.filter(args=>args[0]==='push');assert.equal(pushes.length,1);assert.equal(pushes[0][2],`${finalHead}^{commit}:refs/heads/feature`);
  assert.equal(await git(bare,['rev-parse','refs/heads/feature']),finalHead);assert.equal(await git(bare,['rev-parse','refs/heads/main']),mainHead);
  assert.equal(await workflow.readRecovery(root),null);
  const active=await ledger.list(root);assert.deepEqual(active.map(record=>record.id),late.map(record=>record.id));assert.equal(late.length,1);
  const confirmed=[...stored.entries()].filter(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.reason==='confirmed').map(([,value])=>value.record);
  assert.equal(confirmed.length,1);assert.equal(confirmed[0].head,finalHead);assert.equal(confirmed[0].branch,'feature');assert.equal(confirmed[0].pushStarted,true);
  assert.ok(confirmed.every(record=>record.id!==late[0].id));
  const receipts=await fs.readdir(path.join(root,'.git','zero-pending-sync'));assert.ok(receipts.some(name=>name.startsWith('resolution-')));
});
