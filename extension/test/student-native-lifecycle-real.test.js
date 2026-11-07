'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const core=require('../src/core'),{createTransport}=require('../src/transport');
const {validatedCompletedProjectRestore}=require('../src/project-restore-plan');
const {createRepositoryReminderStorage}=require('../src/repository-reminder-storage');
const {appSessions}=require('./fixtures/app-sessions'),{textInputs}=require('./fixtures/text-input');
const execute=promisify(execFile),disposable=()=>({dispose(){}});
const remote='https://github.com/student/full-lifecycle.git';
const waitFor=async(condition,message)=>{const deadline=Date.now()+20000;while(!condition()){assert.ok(Date.now()<deadline,message||'Expected lifecycle UI state');await new Promise(resolve=>setTimeout(resolve,25));}};

test('student local-first lifecycle uses native review and preserves offline commits',{skip:process.platform==='win32'},async t=>{
 if(process.env.ZERO_LIFECYCLE_TEST_NETWORK_DENIED!=='1')return t.skip('Run only inside a verified OS network-denial sandbox');
 const denial=await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port:1});socket.once('error',error=>resolve(error.code));socket.once('connect',()=>{socket.destroy();resolve('CONNECTED');});socket.setTimeout(1000,()=>{socket.destroy();resolve('TIMEOUT');});});
 assert.equal(denial,'EPERM','OS sandbox must deny outbound loopback before any Git runs');
 const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-full-lifecycle-'))),bare=path.join(parent,'remote.git'),seed=path.join(parent,'seed'),root=path.join(parent,'student'),other=path.join(parent,'other'),fresh=path.join(parent,'fresh');
 // Only the Git child wrapper receives GIT_* overrides; recovery's parent
 // process retains its normal environment validation. The OS sandbox denies
 // all network access, including subprocesses.
 const originalEnv={...process.env},isolatedHome=path.join(parent,'home'),hooks=path.join(parent,'hooks'),template=path.join(parent,'template'),bin=path.join(parent,'bin');
 const realGit=(await execute('/usr/bin/which',['git'])).stdout.trim();assert.ok(path.isAbsolute(realGit));
 await Promise.all([fs.mkdir(isolatedHome),fs.mkdir(hooks),fs.mkdir(template),fs.mkdir(bin)]);
 await fs.writeFile(path.join(bin,'git'),'#!/bin/sh\nexport GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TEMPLATE_DIR="$ZERO_LIFECYCLE_TEMPLATE" GIT_ALLOW_PROTOCOL=file GIT_TERMINAL_PROMPT=0 GIT_ASKPASS= SSH_ASKPASS=\nexec "$ZERO_LIFECYCLE_REAL_GIT" -c "core.hooksPath=$ZERO_LIFECYCLE_HOOKS" -c core.attributesFile=/dev/null "$@"\n',{mode:0o700});
 for(const key of Object.keys(process.env))if(/^(?:GIT_|SSH_|GCM_|GH_|GITHUB_|AWS_|AZURE_|CURL_|NETRC|XDG_CONFIG_HOME)/i.test(key)||/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|AUTH_SOCK)/i.test(key))delete process.env[key];
 Object.assign(process.env,{HOME:isolatedHome,XDG_CONFIG_HOME:isolatedHome,PATH:bin+path.delimiter+originalEnv.PATH,ZERO_LIFECYCLE_REAL_GIT:realGit,ZERO_LIFECYCLE_HOOKS:hooks,ZERO_LIFECYCLE_TEMPLATE:template,GIT_TERMINAL_PROMPT:'0'});
 const subscriptions=[];t.after(async()=>{
  try {subscriptions.forEach(item=>item.dispose());delete require.cache[require.resolve('../src/extension')];/* Preserve the disposable fixture for inspection. */}
  finally {for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
 });
 const git=async(cwd,args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));if(['push','fetch','ls-remote','clone','pull'].includes(args[0]))assert.ok(args.includes(bare),'Only the disposable bare repository is allowed');return core.git(cwd,args);};
 await fs.mkdir(seed);await fs.mkdir(bare);await git(bare,['init','--bare','--initial-branch=main']);await git(seed,['init','-b','main']);
 await git(seed,['config','user.name','Student']);await git(seed,['config','user.email','student@example.invalid']);
 await fs.writeFile(path.join(seed,'zero.json'),'{}\n');await fs.writeFile(path.join(seed,'Main.java'),'class Main { int score; }\n');await git(seed,['add','.']);await git(seed,['commit','-m','Initial']);
 const initial=await git(seed,['rev-parse','HEAD']);await git(seed,['push',bare,'HEAD:refs/heads/main']);
 await git(parent,['clone',bare,root]);await git(parent,['clone',bare,other]);
 for(const cwd of [root,other]){await git(cwd,['config','user.name','Student']);await git(cwd,['config','user.email','student@example.invalid']);}
 await git(root,['remote','set-url','origin',remote]);
 const stored=new Map(),state={keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>stored.set(key,structuredClone(value))};
 const ledger=createRepositoryReminderStorage({state});assert.equal(await ledger.supportsFileLedger(root),true);const listLedger=async()=>{const deadline=Date.now()+5000;for(;;){try{return await ledger.list(root);}catch(error){if(!/sync record storage is locked/i.test(error.message)||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,20));}}};
 const commands=new Map(),errors=[],logs=[],calls=[],panels=[],nativeCalls=[];let provider,offline=false,holdMain=true,mainEntered,releaseMain,mainFinished;const mainStarted=new Promise(resolve=>{mainEntered=resolve;}),mainGate=new Promise(resolve=>{releaseMain=resolve;}),mainDone=new Promise(resolve=>{mainFinished=resolve;});t.after(()=>releaseMain());
 const session={id:'session',account:{id:'1',label:'student'},accessToken:'LOCAL_FIXTURE_ONLY'};
 const uri=value=>({scheme:value.startsWith('zero-change-history:')?'zero-change-history':'file',fsPath:value,toString:()=>value});
 const vscode={
  ViewColumn:{One:1},ProgressLocation:{Notification:1},authentication:{getSession:async()=>session,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
  workspace:{isTrusted:true,workspaceFolders:[{uri:uri(root)}],textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>true,registerTextDocumentContentProvider:disposable,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
  window:{createOutputChannel:()=>({appendLine:value=>logs.push(value),dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,
   createWebviewPanel:()=>{const panel={webview:{html:'',onDidReceiveMessage(callback){panel.receive=callback;}},onDidDispose(){},dispose(){}};panels.push(panel);return panel;},
   showQuickPick:async(_items,options)=>options?.canPickMany?[]:undefined,showInputBox:async()=> 'feature',showInformationMessage:async()=>{},showWarningMessage:async(_message,_options,...actions)=>actions[0],showErrorMessage:async message=>errors.push(message),withProgress:async(_options,callback)=>callback({report(){}})},
  tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},getCommands:async()=>['workbench.view.scm'],executeCommand:async(...args)=>{nativeCalls.push(args);}},Uri:{file:uri,parse:uri},EventEmitter:class{event(){}fire(){}dispose(){}}
 };
 const load=Module._load;delete require.cache[require.resolve('../src/extension')];
 Module._load=function(id,...args){
  if(id==='./transport')return {createTransport:(destination,authenticate,options)=>createTransport(destination,authenticate,{...options,spawn:async(command,argv,spawnOptions)=>{
   assert.equal(command,'git');assert.ok(['push','ls-remote','fetch'].includes(argv[0]));assert.ok(argv.includes(remote));assert.ok(!argv.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
   if(offline&&argv[0]==='push')throw Object.assign(Error('offline fixture'),{kind:'network'});const local=argv.map(arg=>arg===remote?bare:arg);assert.ok(local.includes(bare));assert.ok(!local.some(arg=>/^https?:/.test(arg)));calls.push(argv);if(holdMain&&argv[0]==='ls-remote'&&argv[3]==='refs/heads/main'&&await git(root,['branch','--show-current'])==='feature'){holdMain=false;mainEntered();await mainGate;try{return await execute(command,local,spawnOptions);}finally{mainFinished();}}return execute(command,local,spawnOptions);
  }})};
  return id==='vscode'?textInputs(vscode):load.call(this,id,...args);
 };
 let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
 extension.activate({subscriptions,workspaceState:state},{provider:appSessions(vscode,{dispose(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
 const webview={html:'',onDidReceiveMessage:disposable};provider.resolveWebviewView({webview,onDidDispose:disposable});
 await waitFor(()=>webview.html.includes('Current branch: main'));
 await commands.get('zero.startChange')();assert.deepEqual(errors,[]);assert.equal(await git(root,['branch','--show-current']),'feature');
 assert.equal(await git(bare,['rev-parse','refs/heads/feature']),initial);await Promise.race([mainStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('Expected delayed main check')),10000))]);
 await fs.writeFile(path.join(root,'Main.java'),'class Main { int first; }\n');
 await commands.get('zero.reviewChanges')();let review=panels.at(-1);const view=panel=>/view="([a-f0-9]+)"/.exec(panel.webview.html)[1];assert.match(review.webview.html,/Main.java/);await review.receive({type:'select',index:0,view:view(review)});assert.ok(nativeCalls.some(call=>call[0]==='vscode.diff'));
 // Run is deliberately mocked: this fixture asserts the requested handoff only.
 await vscode.commands.executeCommand('zero.runNativeApp');assert.ok(nativeCalls.some(call=>call[0]==='zero.runNativeApp'));
 offline=true;await commands.get('zero.commitChanges')('First offline edit');assert.deepEqual(errors,[]);const first=await git(root,['rev-parse','HEAD']);assert.notEqual(first,initial);assert.equal(await git(bare,['rev-parse','refs/heads/feature']),initial);
 const afterFirst=await listLedger(),prior=afterFirst.find(row=>row.type!=='local'&&row.branch==='feature'&&row.head===first);assert.ok(prior,'Failed sync retains exact first commit reminder');const pushesBeforeRelease=calls.filter(call=>call[0]==='push').length;releaseMain();await mainDone;assert.ok((await listLedger()).some(row=>row.id===prior.id&&JSON.stringify(row)===JSON.stringify(prior)));assert.equal(calls.filter(call=>call[0]==='push').length,pushesBeforeRelease,'A delayed main check cannot push or clear the reminder');
 await fs.writeFile(path.join(root,'Main.java'),'class Main { int second; }\n');const beforeSecond=calls.length;await commands.get('zero.commitChanges')('Second offline edit');assert.deepEqual(errors,[]);const second=await git(root,['rev-parse','HEAD']);assert.notEqual(second,first);assert.equal(await git(root,['rev-parse',`${second}^`]),first);const secondCalls=calls.slice(beforeSecond);const afterSecond=await listLedger();assert.ok(afterSecond.some(row=>row.id===prior.id&&JSON.stringify(row)===JSON.stringify(prior)));assert.ok(afterSecond.some(row=>row.type==='local'&&row.head===second));
 offline=false;await commands.get('zero.checkPush')();assert.equal(await git(bare,['rev-parse','refs/heads/feature']),initial);const beforeRetry=calls.length;await commands.get('zero.retryBranchSync')();assert.deepEqual(errors,[]);assert.equal(await git(bare,['rev-parse','refs/heads/feature']),second);await waitFor(()=>calls.slice(beforeRetry).some(call=>call[0]==='ls-remote'&&call[3]==='refs/heads/main'),'Automatic main check resumes after reminder resolution');const beforeExplicit=calls.length,pushCount=calls.filter(call=>call[0]==='push').length;await commands.get('zero.checkBranchConnection')();await waitFor(()=>calls.slice(beforeExplicit).some(call=>call[0]==='ls-remote'&&call[3]==='refs/heads/feature'),'Explicit branch check remains available');assert.equal(calls.filter(call=>call[0]==='push').length,pushCount,'Status checks never duplicate a push');assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'class Main { int second; }\n');
 await commands.get('zero.finishChange')();assert.deepEqual(errors,[]);const merged=await git(root,['rev-parse','HEAD']);assert.equal(await git(root,['branch','--show-current']),'main');assert.equal(await git(bare,['rev-parse','refs/heads/main']),merged);assert.equal(await git(root,['rev-parse','refs/heads/feature']),second);
 await commands.get('zero.changeHistory')();assert.match(panels.at(-1).webview.html,/Merge: feature/);await git(parent,['clone',bare,fresh]);assert.equal(await git(fresh,['rev-parse','HEAD']),merged);vscode.workspace.workspaceFolders=[{uri:uri(fresh)}];const freshHistory=require('../src/change-history').createChangeHistory(vscode,{project:async()=>fresh});await freshHistory.openHistory();assert.match(panels.at(-1).webview.html,/Merge: feature/);freshHistory.dispose();vscode.workspace.workspaceFolders=[{uri:uri(root)}];
 // A newer remote main must not be overwritten by a stale merge attempt.
 await git(other,['pull','--ff-only',bare,'main']);await fs.writeFile(path.join(other,'Other.java'),'class Other {}\n');await git(other,['add','Other.java']);await git(other,['commit','-m','Advance main']);const advanced=await git(other,['rev-parse','HEAD']);await git(other,['push',bare,'HEAD:refs/heads/main']);await git(root,['checkout','feature']);await fs.writeFile(path.join(root,'Local.java'),'class Local {}\n');await git(root,['add','Local.java']);await git(root,['commit','-m','Local follow-up']);const divergent=await git(root,['rev-parse','HEAD']),priorFiles=await fs.readFile(path.join(root,'Main.java')),beforeScm=nativeCalls.filter(call=>call[0]==='workbench.view.scm').length;const pushesBefore=calls.filter(call=>call[0]==='push').length;await commands.get('zero.syncProject')();assert.equal(await git(bare,['rev-parse','refs/heads/main']),advanced);assert.equal(await git(root,['rev-parse','HEAD']),divergent);assert.deepEqual(await fs.readFile(path.join(root,'Main.java')),priorFiles);assert.equal(await fs.readFile(path.join(root,'Local.java'),'utf8'),'class Local {}\n');assert.equal(calls.filter(call=>call[0]==='push').length,pushesBefore);assert.equal(nativeCalls.filter(call=>call[0]==='workbench.view.scm').length,beforeScm+1,'Diverged update hands off to native Source Control');assert.deepEqual(secondCalls,[],`Second local commit transport: ${JSON.stringify(secondCalls)}`);
});
