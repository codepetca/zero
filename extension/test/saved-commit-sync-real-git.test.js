'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const core=require('../src/core'),github=require('../src/github');
const {createTransport}=require('../src/transport');
const {createRepositoryReminderStorage}=require('../src/repository-reminder-storage');
const {appSessions}=require('./fixtures/app-sessions'),{textInputs}=require('./fixtures/text-input');
const execute=promisify(execFile),disposable=()=>({dispose(){}});
const remote='https://github.com/student/saved-commits.git',page='https://github.com/student/saved-commits';
const waitFor=async condition=>{const deadline=Date.now()+12000;while(!condition()){assert.ok(Date.now()<deadline,'Expected real saved-commit sync state');await new Promise(resolve=>setTimeout(resolve,15));}};

// All authenticated transfers use the actual transport, redirected at its spawn
// boundary to this local bare repository. No network or reset command is used.
async function harness(t,scenario,{missing=false,branch='main'}={}) {
  const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-saved-sync-real-'))),root=path.join(parent,'student'),bare=path.join(parent,'remote.git');
  const subscriptions=[],actualSync=github.syncExistingHead;
  t.after(async()=>{subscriptions.forEach(value=>value.dispose());github.syncExistingHead=actualSync;delete require.cache[require.resolve('../src/extension')];await fs.rm(parent,{recursive:true,force:true});});
  await fs.mkdir(root);await fs.mkdir(bare);
  const git=async(cwd,args)=>{
    assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
    if(['push','fetch','ls-remote','clone','pull'].includes(args[0]))assert.ok(args.includes(bare),'Setup transfers must use only the disposable bare repository');
    return core.git(cwd,args);
  };
  await git(bare,['init','--bare','--initial-branch=main']);await git(root,['init','-b','main']);
  await git(root,['config','user.name','Student']);await git(root,['config','user.email','student@example.invalid']);
  await fs.writeFile(path.join(root,'zero.json'),'{}\n');await fs.writeFile(path.join(root,'Main.java'),'class Main {}\n');
  await git(root,['add','.']);await git(root,['commit','-m','Earlier saved work']);const a=await git(root,['rev-parse','HEAD']);
  if(branch!=='main')await git(root,['switch','-c',branch]);
  if(!missing)await git(root,['push',bare,`${a}:refs/heads/${branch}`]);
  await fs.writeFile(path.join(root,'Main.java'),'class Main { int score; }\n');await git(root,['add','Main.java']);await git(root,['commit','-m','New saved work']);const b=await git(root,['rev-parse','HEAD']);
  await git(root,['remote','add','origin',remote]);
  const stored=new Map(),state={keys:()=>[...stored.keys()],get:key=>stored.get(key),update:async(key,value)=>{stored.set(key,structuredClone(value));}};
  const ledger=createRepositoryReminderStorage({state});assert.equal(await ledger.supportsFileLedger(root),true);
  const fields={root,branch:'main',remote,page,accountId:'1',type:'push',head:b,committed:false,pushStarted:true,kind:'network'},late=[];
  if(scenario==='late-reminders')github.syncExistingHead=async(...args)=>{
    const result=await actualSync(...args);
    late.push(await ledger.add(root,{...fields}));late.push(await ledger.add(root,{...fields,branch:'another',head:a}));
    return result;
  };
  const commands=new Map(),warnings=[],errors=[],logs=[],calls=[];let provider,attemptedPush=false,confirm=true,failRead=false;
  const session={id:'session',account:{id:'1',label:'student'},accessToken:'LOCAL_FIXTURE_ONLY'};
  const vscode={
    authentication:{getSession:async()=>session,onDidChangeSessions:disposable,registerAuthenticationProvider:disposable},
    workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:root}}],textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback}),saveAll:async()=>assert.fail('Saved-commit sync must not save editors'),registerTextDocumentContentProvider:disposable,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine:value=>logs.push(value),dispose(){}}),registerWebviewViewProvider:(_,value)=>{provider=value;return disposable();},registerTreeDataProvider:disposable,showQuickPick:async()=>{},showInputBox:async()=>assert.fail('Saved-commit sync must not request a commit message'),showInformationMessage:async()=>{},showWarningMessage:async(message,options,...actions)=>{warnings.push({message,options,actions});if(scenario==='foreign-review')late.push(await ledger.add(root,{...fields,branch:'another',head:a}));return confirm?actions[0]:undefined;},showErrorMessage:async message=>errors.push(message)},
    tasks:{onDidStartTask:disposable,onDidEndTask:disposable,onDidEndTaskProcess:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},Uri:{file:fsPath=>({fsPath})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const load=Module._load;delete require.cache[require.resolve('../src/extension')];
  Module._load=function(id,...args){
    if(id==='./transport')return {createTransport:(destination,authenticate,options)=>createTransport(destination,authenticate,{...options,spawn:async(command,args,spawnOptions)=>{
      assert.equal(command,'git');assert.ok(['push','ls-remote','fetch'].includes(args[0]));assert.ok(args.includes(remote));
      assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'||arg.startsWith('--force')));
      const localArgs=args.map(arg=>arg===remote?bare:arg);assert.ok(localArgs.includes(bare));assert.ok(!localArgs.some(arg=>/^https?:/.test(arg)));
      calls.push(args);
      if(args[0]==='ls-remote'&&failRead)throw Object.assign(Error('Injected offline failure before local dispatch'),{code:'ENETUNREACH'});
      if(args[0]==='push'){
        attemptedPush=true;assert.equal(args[2],`${b}^{commit}:refs/heads/${branch}`);
        if(scenario==='push-failure')throw Object.assign(Error('Injected offline failure before local dispatch'),{code:'ENETUNREACH'});
      }
      const result=await execute(command,localArgs,spawnOptions);
      if(args[0]==='ls-remote'&&attemptedPush&&scenario==='confirmation-mismatch')return {...result,stdout:`${a}\trefs/heads/main\n`};
      return result;
    }})};
    return id==='vscode'?textInputs(vscode):load.call(this,id,...args);
  };
  let extension;try{extension=require('../src/extension');}finally{Module._load=load;}
  extension.activate({extensionMode:2,subscriptions,workspaceState:state},{env:{},provider:appSessions(vscode,{dispose(){}}),repositories:{checkSetup:async()=>({}),access:async()=>({repository:{id:12},installation:{id:99}})}});
  const webview={html:'',onDidReceiveMessage:disposable};provider.resolveWebviewView({webview,onDidDispose:disposable});
  await waitFor(()=>webview.html.includes(missing?'data-branch-state="remote-missing"':'data-branch-state="local-ahead"'));
  const activeRecords=async()=>{
    const deadline=Date.now()+5000;while(true){try{return await ledger.list(root);}catch(error){if(!/storage is locked/.test(error.message)||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,20));}}
  };
  return {root,bare,a,b,late,stored,warnings,errors,logs,calls,git,webview,activeRecords,ledger,commands,set confirm(value){confirm=value;},set failRead(value){failRead=value;},sync:()=>commands.get('zero.syncSavedCommits')()};
}

test('actual saved-commit sync and production ledger confirm exact HEAD and refresh sidebar',{skip:process.platform==='win32'},async t=>{
  for(const missing of [false,true])await t.test(missing?'creates missing remote branch':'syncs local-ahead branch',async t=>{
    const h=await harness(t,'success',{missing});await h.sync();
    await waitFor(()=>h.webview.html.includes('data-branch-state="synced"'));
    assert.deepEqual(h.errors,[]);assert.equal(h.warnings.length,1);assert.match(h.warnings[0].options.detail,new RegExp(h.b));assert.match(h.warnings[0].options.detail,/Destination ref: refs\/heads\/main/);
    assert.equal(h.calls.filter(args=>args[0]==='push').length,1);assert.equal(await h.git(h.bare,['rev-parse','refs/heads/main']),h.b);assert.deepEqual(await h.activeRecords(),[]);
    assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);assert.equal(await h.git(h.root,['rev-parse','HEAD']),h.b);assert.equal(await h.git(h.root,['status','--porcelain=v1']),'');
    const resolutions=[...h.stored.entries()].filter(([key,value])=>key.startsWith('zero.resolvedSync.v1:')&&value.reason==='confirmed').map(([,value])=>value.record);
    assert.equal(resolutions.length,1);assert.equal(resolutions[0].head,h.b);assert.equal(resolutions[0].pushStarted,true);assert.equal(resolutions[0].accountId,'1');
    assert.ok((await fs.readdir(path.join(h.root,'.git','zero-pending-sync'))).some(name=>name.startsWith('resolution-')),'Production file-backed confirmation is retained');
  });
});
test('actual saved-commit sync retains production attempts on failure or confirmation mismatch',{skip:process.platform==='win32'},async t=>{
  for(const scenario of ['push-failure','confirmation-mismatch'])await t.test(scenario,async t=>{
    const h=await harness(t,scenario);await h.sync();assert.ok(h.errors.length);assert.equal(h.calls.filter(args=>args[0]==='push').length,1);
    const records=await h.activeRecords();assert.ok(records.some(row=>row.head===h.b&&row.pushStarted===true));assert.ok(records.every(row=>row.accountId==='1'&&row.remote===remote&&row.branch==='main'));
    assert.equal(await h.git(h.bare,['rev-parse','refs/heads/main']),scenario==='push-failure'?h.a:h.b);assert.equal(await h.git(h.root,['rev-parse','HEAD']),h.b);assert.equal(await h.git(h.root,['status','--porcelain=v1']),'');
    assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);
  });
});
test('production foreign reminders stop reviewed saved-commit sync without being resolved',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'foreign-review');await h.sync();assert.ok(h.errors.length);assert.equal(h.calls.filter(args=>args[0]==='push').length,0);assert.deepEqual((await h.activeRecords()).map(row=>row.id),h.late.map(row=>row.id));assert.equal(await h.git(h.bare,['rev-parse','refs/heads/main']),h.a);
});
test('actual confirmation resolves only its own production attempt and retains later reminders',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'late-reminders');await h.sync();await waitFor(()=>h.webview.html.includes('data-branch-state="synced"'));
  assert.deepEqual(h.errors,[]);assert.equal(h.calls.filter(args=>args[0]==='push').length,1);assert.deepEqual(new Set((await h.activeRecords()).map(row=>row.id)),new Set(h.late.map(row=>row.id)));
  const resolved=[...h.stored.entries()].filter(([key])=>key.startsWith('zero.resolvedSync.v1:')).map(([,value])=>value.record.id);assert.ok(h.late.every(row=>!resolved.includes(row.id)));assert.doesNotMatch(h.webview.html,/data-command="zero.syncSavedCommits"/);
});

function seedSiblingAttempts(h) {
  const base={root:h.root,branch:'main',head:h.b,remote,page,accountId:'1',type:'push',committed:false,pushStarted:true};
  const network='00000000-0000-4000-8000-000000000001',uncertain='ffffffff-ffff-4fff-bfff-ffffffffffff';
  h.stored.set('zero.pendingSync.v1:'+network,{...base,id:network,kind:'network',operation:'branch'});
  h.stored.set('zero.pendingSync.v1:'+uncertain,{...base,id:uncertain,kind:'unconfirmed'});
  return {base,network,uncertain};
}
test('real ledger groups adversarially ordered attempts and preserves later missing-ref evidence',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success',{missing:true}),{base,network,uncertain}=seedSiblingAttempts(h);
  await h.commands.get('zero.chooseRepository')();await waitFor(()=>h.webview.html.includes('Sync could not be confirmed. Try Sync again.'));
  assert.doesNotMatch(h.webview.html,/Check GitHub status|Review earlier sync/);
  const original=github.checkUpload;let later,unrelated,once=true;
  github.checkUpload=async(...args)=>{const result=await original(...args);if(once){once=false;later=await h.ledger.add(h.root,{...base,kind:'network'});unrelated=await h.ledger.add(h.root,{...base,branch:'other',kind:'network'});}return result;};
  t.after(()=>{github.checkUpload=original;});
  await h.commands.get('zero.checkPush')();assert.deepEqual(h.errors,[]);assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
  const active=await h.activeRecords();assert.ok(!active.some(row=>row.id===network||row.id===uncertain));assert.ok(active.some(row=>row.id===later.id));assert.ok(active.some(row=>row.id===unrelated.id));assert.equal(active.filter(row=>row.kind==='remote-missing').length,1);
  assert.doesNotMatch(h.webview.html,/Review branch creation/);h.confirm=false;await h.commands.get('zero.retryBranchSync')();
  assert.equal(h.calls.filter(args=>args[0]==='push').length,0);assert.match(h.warnings.at(-1).options.detail,/not atomic.*fast-forward update.*without force/);
  assert.ok((await h.activeRecords()).some(row=>row.id===later.id));assert.ok((await h.activeRecords()).some(row=>row.id===unrelated.id));
});
test('real ledger missing-ref retry requires confirmation and pushes only the reviewed ref',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success',{missing:true});seedSiblingAttempts(h);
  await h.commands.get('zero.checkPush')();assert.deepEqual(h.errors,[]);assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
  await h.commands.get('zero.retryBranchSync')();assert.deepEqual(h.errors,[]);
  const pushes=h.calls.filter(args=>args[0]==='push');assert.deepEqual(pushes,[['push',remote,`${h.b}^{commit}:refs/heads/main`]]);assert.equal(await h.git(h.bare,['rev-parse','refs/heads/main']),h.b);assert.deepEqual(await h.activeRecords(),[]);
});
test('real ledger keeps uncertain sibling attempts on offline status check',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success',{missing:true}),{network,uncertain}=seedSiblingAttempts(h);h.failRead=true;
  await h.commands.get('zero.checkPush')();assert.ok(h.errors.length);assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
  const active=await h.activeRecords();assert.ok(active.some(row=>row.id===network));assert.ok(active.some(row=>row.id===uncertain));assert.ok(!active.some(row=>row.kind==='remote-missing'));
});
test('real ledger rejects a reviewed-record change during status check',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success',{missing:true}),{network,uncertain}=seedSiblingAttempts(h);await h.activeRecords();
  const original=github.checkUpload;let once=true;
  github.checkUpload=async(...args)=>{const result=await original(...args);if(once){once=false;await h.ledger.resolve(h.root,uncertain,'reviewed');}return result;};
  t.after(()=>{github.checkUpload=original;});await h.commands.get('zero.checkPush')();assert.ok(h.errors.length);assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
  const active=await h.activeRecords();assert.ok(active.some(row=>row.id===network));assert.ok(!active.some(row=>row.kind==='remote-missing'));
});
test('real ledger confirmation resolves only reviewed siblings, keeping later exact attempts',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success');await h.git(h.root,['push',h.bare,`${h.b}:refs/heads/main`]);const {base,network,uncertain}=seedSiblingAttempts(h);
  const original=github.checkUpload;let later,unrelated,once=true;
  github.checkUpload=async(...args)=>{const result=await original(...args);if(once){once=false;later=await h.ledger.add(h.root,{...base,kind:'network'});unrelated=await h.ledger.add(h.root,{...base,branch:'other',kind:'network'});}return result;};
  t.after(()=>{github.checkUpload=original;});await h.commands.get('zero.checkPush')();assert.deepEqual(h.errors,[]);
  const active=await h.activeRecords();assert.ok(!active.some(row=>row.id===network||row.id===uncertain));assert.ok(active.some(row=>row.id===later.id));assert.ok(active.some(row=>row.id===unrelated.id));assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
});

test('sidebar Sync creates the current GitHub branch without dialogs and leaves working edits local',{skip:process.platform==='win32'},async t=>{
  for(const branch of ['main','feature'])await t.test(branch,async t=>{
    const h=await harness(t,'success',{missing:true,branch});
    await h.git(h.root,['update-ref',`refs/heads/${h.b}`,h.a]);
    await h.git(h.root,['tag','-a','extra-tag','-m','Never publish this tag',h.a]);
    await h.git(h.root,['config','push.followTags','true']);
    await fs.writeFile(path.join(h.root,'Main.java'),'class Main { int unsavedCommit; }\n');
    assert.match(h.webview.html,/<button id="branch-sync"[^>]*data-command="zero.syncBranch"/);
    assert.doesNotMatch(h.webview.html,/branch was missing|Review branch creation|Check GitHub status|Review earlier sync/i);
    await h.commands.get('zero.syncBranch')('stale-branch-scope');
    assert.match(h.webview.html,/branch or account changed/);
    assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
    await h.commands.get('zero.syncBranch')();
    assert.deepEqual(h.warnings,[]);assert.deepEqual(h.errors,[]);
    assert.deepEqual(h.calls.filter(args=>args[0]==='push'),[['push',remote,`${h.b}^{commit}:refs/heads/${branch}`]]);
    assert.equal(await h.git(h.bare,['for-each-ref','--format=%(refname) %(objectname)']),`refs/heads/${branch} ${h.b}`);
    assert.equal(await h.git(h.root,['status','--porcelain']),'M Main.java');
    assert.match(h.webview.html,/<p id="run-status"[^>]*>Synced to GitHub<\/p>/);
    assert.equal((h.webview.html.match(/role="status"/g)||[]).length,1);
    await waitFor(()=>h.webview.html.includes('data-branch-state="synced"'));
    assert.match(h.webview.html,/<button id="branch-sync"[^>]* disabled>/,'Uncommitted edits do not create outgoing commits');
    assert.deepEqual(await h.activeRecords(),[]);
  });
});

test('sidebar Sync refuses a tracked clean filter before status or transport',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success');
  const marker=path.join(path.dirname(h.root),'filter-ran'),file=path.join(h.root,'Main.java');
  await fs.writeFile(path.join(h.root,'.git','info','attributes'),'Main.java filter=marker\n');
  await h.git(h.root,['config','filter.marker.clean',`touch "${marker}"; cat`]);
  await fs.writeFile(file,'class Main { int other; }\n');
  const calls=h.calls.length;
  await h.commands.get('zero.syncBranch')();
  assert.match(h.webview.html,/Git filters require native Source Control/);
  await assert.rejects(fs.stat(marker),{code:'ENOENT'});
  assert.equal(h.calls.length,calls);
  assert.equal(await h.git(h.bare,['rev-parse','refs/heads/main']),h.a);
});

test('sidebar Sync confirms a prior accepted upload and leaves other branches alone',{skip:process.platform==='win32'},async t=>{
  const h=await harness(t,'success');
  await h.git(h.root,['push',h.bare,`${h.b}:refs/heads/main`]);
  const {base}=seedSiblingAttempts(h);
  const unrelated=await h.ledger.add(h.root,{...base,branch:'other',accountId:'2',kind:'network'});
  await h.commands.get('zero.syncBranch')();
  assert.deepEqual(h.warnings,[]);assert.deepEqual(h.errors,[]);
  assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
  assert.deepEqual((await h.activeRecords()).map(row=>row.id),[unrelated.id]);
  assert.match(h.webview.html,/Up to date with GitHub/);
});

test('sidebar Sync fast-forwards incoming commits or hands off divergent history',{skip:process.platform==='win32'},async t=>{
  for(const scenario of ['behind','diverged','concurrent commit'])await t.test(scenario,async t=>{
    const diverged=scenario==='diverged';
    const h=await harness(t,'success');
    const writer=path.join(path.dirname(h.root),'remote-writer');
    await h.git(h.root,['push',h.bare,`${diverged?h.a:h.b}:refs/heads/main`]);
    await h.git(h.root,['clone',h.bare,writer]);
    await h.git(writer,['config','user.name','Student']);await h.git(writer,['config','user.email','student@example.invalid']);
    await fs.writeFile(path.join(writer,'Incoming.java'),'class Incoming {}\n');
    await h.git(writer,['add','Incoming.java']);await h.git(writer,['commit','-m','Incoming work']);
    const incoming=await h.git(writer,['rev-parse','HEAD']);
    await h.git(writer,['push',h.bare,`${incoming}:refs/heads/main`]);
    let concurrent;
    if(scenario==='concurrent commit'){
      const git=core.git;
      t.after(()=>{core.git=git;});
      core.git=async(cwd,args,options)=>{
        if(cwd===h.root&&args.includes('merge')&&args.includes('--no-overwrite-ignore')){
          assert.ok(args.includes('--ff-only'));
          await git(cwd,['commit','--allow-empty','-m','Concurrent local commit']);
          concurrent=await git(cwd,['rev-parse','HEAD']);
        }
        return git(cwd,args,options);
      };
    }
    await h.commands.get('zero.syncBranch')();
    assert.deepEqual(h.warnings,[]);assert.deepEqual(h.errors,[]);
    assert.equal(h.calls.filter(args=>args[0]==='push').length,0);
    if(scenario==='concurrent commit'){
      assert.ok(concurrent,'Concurrent commit was injected immediately before the fast-forward');
      assert.equal(await h.git(h.root,['rev-parse','HEAD']),concurrent);
      assert.equal(await h.git(h.bare,['rev-parse','refs/heads/main']),incoming);
      assert.match(h.webview.html,/could not update this branch/i);
    }else{
      assert.equal(await h.git(h.root,['rev-parse','HEAD']),diverged?h.b:incoming);
      if(diverged)assert.match(h.webview.html,/Open Source Control to sync this branch/);
      else {
        assert.match(h.webview.html,/Updated from GitHub/);
        assert.match(h.webview.html,/<button id="branch-sync"[^>]*Outgoing commits: 0\. Incoming commits: 0\./);
      }
    }
  });
});
