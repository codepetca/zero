'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const github = require('../src/github');
const disposable = () => ({dispose(){}});
test('commands simulate upload without Git and explicit native diagnostic tasks retain restart and stop ownership', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-extension-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,'mvnw'),'');
  const commands = new Map();const starts=[];const ends=[];const launches=[];const notices=[],results=[];let provider, saved=0, mutations=0, saveGate, mode='simulation', commitMessage;
  const originalGit=core.git;core.git=async(_,args)=>{if (args[0] === 'remote' || args[0] === 'rev-parse' || args[0] === 'symbolic-ref') throw new Error('No repository'); mutations++;throw new Error('Unexpected git');};t.after(()=>{core.git=originalGit;});
  class Task {constructor(definition,scope,name,source,execution,matcher){Object.assign(this,{definition,scope,name,source,execution,matcher});}}
  const vscode={
    authentication:{getSession:async(provider,scopes)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);return {id:'test-session',account:{id:'1',label:'student'},accessToken:'INTERCEPTED',scopes:[]};},onDidChangeSessions:disposable},
    workspace:{registerTextDocumentContentProvider:disposable,getConfiguration:(section,uri)=>({get:()=> {if(section!=='zero') return false; assert.equal(uri?.fsPath,root,'Upload mode must use the student folder scope, overriding global live'); return mode;}}),onDidChangeConfiguration:disposable,workspaceFolders:[{uri:{fsPath:root}}],saveAll:async()=>{saved++;if(saveGate) await saveGate;return true;},createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable},
    window:{createOutputChannel:()=>({appendLine:text=>results.push(text),clear(){},show(){},dispose(){}}),registerWebviewViewProvider:disposable,registerTreeDataProvider:disposable,showWarningMessage:async text=>{notices.push(text);},showInputBox:async options=>{assert.equal(options.title,'Commit & push');assert.match(options.prompt,/https:\/\/github.com\/student\/app · main/);return commitMessage;},showInformationMessage:async(text,options)=>{notices.push(text);assert.ok(!options?.modal,'Routine upload must not open a confirmation');},showErrorMessage:async text=>{throw new Error(text);}},
    tasks:{onDidStartTask:fn=>{starts.push(fn);return disposable();},onDidEndTaskProcess:disposable,onDidEndTask:fn=>{ends.push(fn);return disposable();},registerTaskProvider:(_,value)=>{provider=value;return disposable();},executeTask:async task=>{const execution={task,terminate(){ends.forEach(fn=>fn({execution}));}};launches.push(execution);starts.forEach(fn=>fn({execution}));return execution;}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},executeCommand:async()=>{}},
    Task,TaskScope:{Workspace:2},TaskGroup:{Build:{}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:2},ShellQuoting:{Strong:2},ProcessExecution:class{constructor(command,args,options){Object.assign(this,{command,args,options});}},ShellExecution:class{},
    EventEmitter:class{event(){}fire(){}dispose(){}},Uri:{file:fsPath=>({fsPath})}
  };
  const originalLoad=Module._load;Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try {extension=require('../src/extension');}finally{Module._load=originalLoad;}
  const subscriptions=[];t.after(()=>{subscriptions.forEach(item=>item.dispose());delete require.cache[require.resolve('../src/extension')];});
  const accessCalls=[];
  const repositories={access:async(repositoryUrl,{ticket,permissions})=>{assert.equal(repositoryUrl,'https://github.com/student/app');assert.equal(ticket.session.accountId,'1');assert.deepEqual(ticket.session.scopes,[]);accessCalls.push(permissions);return {ticket,repository:{id:12},installation:{id:99}};}};
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}}},{repositories});
  await commands.get('zero.uploadToGitHub')();
  assert.match(notices[0],/Simulation only — nothing uploaded/);assert.equal(mutations,0);
  await commands.get('zero.publishWeb')();
  assert.equal(saved,0,'Simulated publishing must not save student files');
  assert.equal(mutations,0,'Simulated publishing must not change Git or setup files');
  await commands.get('zero.runNativeApp')();assert.equal(launches.length,1);assert.equal(saved,1);
  assert.deepEqual(launches[0].task.execution.args,['clean','compile','javafx:run']);assert.equal(launches[0].task.matcher,'$zero-java');
  await commands.get('zero.runNativeApp')();assert.equal(launches.length,2);
  await commands.get('zero.stopApp')();
  assert.deepEqual(await provider.provideTasks(),[], 'Detected executable tasks would bypass the save/restart resolver');
  const shortcut=await provider.resolveTask({definition:{type:'zero',task:'native-run'},scope:2});
  await vscode.tasks.executeTask(shortcut);assert.equal(saved,3);
  const rerun=await provider.resolveTask({definition:{type:'zero',task:'native-run'},scope:2});
  await vscode.tasks.executeTask(rerun);assert.equal(saved,4);
  await commands.get('zero.stopApp')();assert.equal(launches.length,4);
  let releaseSave;
  saveGate = new Promise(resolve => {releaseSave=resolve;});
  const pendingRun = commands.get('zero.runNativeApp')();
  const queuedRun = commands.get('zero.runNativeApp')();
  while(saved < 5) await new Promise(resolve => setImmediate(resolve));
  await commands.get('zero.stopApp')();
  releaseSave();
  await Promise.all([pendingRun,queuedRun]);
  assert.equal(launches.length,4,'Stop must cancel saving and queued Run requests');
  saveGate=undefined; mode='live';
  const originals={prepare:github.prepareUpload,upload:github.uploadPrepared};
  t.after(()=>{github.prepareUpload=originals.prepare;github.uploadPrepared=originals.upload;});
  let reviewed=0, uploaded=0;
  github.prepareUpload=async()=>{reviewed++;return {page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch:'main',summary:'1 changed path',changes:[{kind:'M',path:'Main.java'}]};};
  github.uploadPrepared=async(plan,message)=>{uploaded++;assert.equal(message,'Describe changes');return {head:'a'.repeat(40),branch:plan.branch,uploaded:true};};
  await commands.get('zero.uploadToGitHub')();
  assert.equal(reviewed,1);assert.equal(uploaded,0,'Cancel must not call the commit/push engine');
  let releaseReview;
  github.prepareUpload=async()=>{await new Promise(resolve=>{releaseReview=resolve;});return {page:'https://github.com/student/app',branch:'main',summary:'No changes',changes:[]};};
  const heldUpload=commands.get('zero.uploadToGitHub')();
  while(!releaseReview) await new Promise(resolve=>setImmediate(resolve));
  await commands.get('zero.connectRepository')();
  await commands.get('zero.githubAccount')();
  await commands.get('zero.chooseRepository')();
  assert.equal(mutations,0,'Connect must not mutate origin while an upload review is pending');
  releaseReview(); await heldUpload;
  github.prepareUpload=async()=>({page:'https://github.com/student/app',remote:'https://github.com/student/app.git',branch:'main',summary:'1 changed path',changes:[{kind:'M',path:'Main.java'}]});
  commitMessage='Describe changes';
  await commands.get('zero.uploadToGitHub')();
  assert.equal(uploaded,1);assert.match(results.at(-1),/Pushed aaaaaaa/);assert.ok(!notices.some(text=>text.startsWith('Pushed ')),'Successful upload stays in sidebar/Output');
  assert.equal(mutations,0,'All real transport is mocked in the live UI test');assert.ok(accessCalls.length>0);assert.ok(accessCalls.every(permissions=>permissions.contents==='write'&&!permissions.workflows));
});

test('minimal GitHub section follows Zero App sign-in and connection state; project creation and simulation stay explicit', async t => {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,'mvnw'),'');
  await core.git(root,['init','-b','main']);
  const commands=new Map(),authCalls=[],notices=[],errors=[],opened=[],picks=[],dispatched=[],copied=[],registered=[],removed=[],creations=[],clones=[],inputs=[];let session,connectionSession,authEvent,webviewProvider,repo,nextChoice,inputCount=0,currentBranch='main',mode='simulation',pickEffect,checkout,checkoutGate,nativeRoot=root;let gitChanges=0;
  let dismissWarning; const warningPending=new Promise(resolve=>{dismissWarning=resolve;});t.after(()=>dismissWarning());
  let reportWarning; const warningShown=new Promise(resolve=>{reportWarning=resolve;});
  const oldAssert=core.assertRepositoryRoot;core.assertRepositoryRoot=async()=>root;t.after(()=>{core.assertRepositoryRoot=oldAssert;});
  const oldGit=core.git;core.git=async(_,args)=>{if(args[0]==='rev-parse') return args.includes('--verify')?'a'.repeat(40):root;if(args[0]==='symbolic-ref'){if(currentBranch===undefined)throw new Error('Detached HEAD');return currentBranch;}if(args[0]==='remote'&&args[1]==='get-url'){if(!repo)throw new Error('no origin');return repo;}gitChanges++;throw new Error('Unexpected mutation');};t.after(()=>{core.git=oldGit;});
  const nativeRepository={rootUri:{fsPath:root}};
  const nativeApi={getRepository:()=>{nativeRepository.rootUri.fsPath=nativeRoot;return nativeRoot?nativeRepository:null;},get repositories(){return nativeRoot?[{rootUri:{fsPath:nativeRoot}}]:[];}};
  const vscode={
    extensions:{getExtension:()=>({isActive:true,exports:{getAPI:()=>nativeApi}})},
    authentication:{getSession:async(provider,scopes,options)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);authCalls.push({provider,scopes,options});if(options.createIfNone&&connectionSession)session=connectionSession;return session;},registerAuthenticationProvider:(id,label,provider)=>{registered.push({id,label,provider});return disposable();},onDidChangeSessions:fn=>{authEvent=fn;return disposable();}},
    workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:section=>({get:(_,fallback)=>section==='zero'?mode:fallback}),saveAll:async()=>true,createFileSystemWatcher:()=>({onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable,dispose(){}}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},
    window:{createOutputChannel:()=>({appendLine(){},clear(){},show(){},dispose(){}}),registerWebviewViewProvider:(_,provider)=>{webviewProvider=provider;return disposable();},registerTreeDataProvider:disposable,showInformationMessage:async message=>{notices.push(message);},showWarningMessage:async message=>{notices.push(message);reportWarning();await warningPending;},showQuickPick:async(items,options)=>{picks.push({items,options});if(pickEffect)await pickEffect();if(options.title==='Repository visibility')return items.find(item=>item.private===false);return items.find(item=>item.action===nextChoice);},showInputBox:async()=>{inputCount++;return inputs.shift();},showOpenDialog:async()=>[{fsPath:root}],showErrorMessage:async message=>{errors.push(message);}},
    tasks:{onDidStartTask:disposable,onDidEndTaskProcess:disposable,onDidEndTask:disposable,registerTaskProvider:disposable},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable();},getCommands:async()=>['workbench.action.manageAccounts'],executeCommand:async (id,uri)=>{dispatched.push(id);if(id==='git.checkout'){assert.equal(uri.fsPath,root);if(checkoutGate)await checkoutGate;if(checkout)await checkout();}}},
    env:{openExternal:async uri=>{opened.push(uri);return true;},clipboard:{writeText:async text=>{copied.push(text);}}},Uri:{file:fsPath=>({fsPath}),parse:url=>({url})},EventEmitter:class{event(){}fire(){}dispose(){}}
  };
  const originalLoad=Module._load;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let extension;try{extension=require('../src/extension');}finally{Module._load=originalLoad;}const subscriptions=[];t.after(()=>subscriptions.forEach(value=>value.dispose()));
  const appProvider={removeSession:async id=>{removed.push(id);session=undefined;},dispose(){}};
  const repositories={access:async()=>assert.fail('No live repository access is needed in this sidebar/checkout test'),create:async(input,{ticket})=>{assert.equal(ticket.session.accountId,'1');assert.deepEqual(ticket.session.scopes,[]);creations.push(input);return {ticket,repository:{id:12,html_url:'https://github.com/student/'+input.name},installation:{id:99}};}};
  const cloneRepository=async input=>{clones.push(input);return path.join(root,'new-project');};
  extension.activate({subscriptions,workspaceState:{get:()=>true,update:async()=>{}},globalState:{get:key=>key==='zero.cloneParent'?root:undefined,update:async()=>{}}},{provider:appProvider,repositories,cloneRepository});
  assert.deepEqual(registered.map(item=>item.id),['zero-github']);
  assert.equal(typeof commands.get('zero.checkForUpdates'),'function');
  assert.equal(typeof commands.get('zero.updateSettings'),'function');
  const webview={html:'',onDidReceiveMessage:disposable};const candidate={webview,onDidDispose:disposable};webviewProvider.resolveWebviewView(candidate);
  const settle=async predicate=>{
    const deadline=Date.now()+5000;
    while(!predicate()) {
      assert.ok(Date.now()<deadline,'Expected asynchronous sidebar state did not arrive');
      await new Promise(resolve=>setImmediate(resolve));
    }
  };await settle(()=>authCalls.length>0 && /Sign in to GitHub/.test(webview.html));
  assert.match(webview.html,/Sign in to GitHub/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"|data-command="zero.createRepository"/);
  await settle(()=>webview.html.includes('data-command="zero.importAssets"'));
  assert.match(webview.html,/data-command="zero.importAssets"[^>]*>Add assets…<\/button>/);
  assert.match(webview.html,/data-command="zero.recovery"[^>]*>Recovery…<\/button>/);
  assert.equal(typeof commands.get('zero.importAssets'),'function');assert.equal(typeof commands.get('zero.recovery'),'function');
  assert.doesNotMatch(webview.html,/zero.checkForUpdates|zero.updateSettings/,'Native update commands stay out of the sidebar');
  assert.match(webview.html,/class="account"[^>]*aria-label="Sign in to GitHub"/);
  assert.match(webview.html,/>Sign in<\/button>/);assert.doesNotMatch(webview.html,/data-command="zero.chooseRepository"/);assert.doesNotMatch(webview.html,/data-command="zero.cloneRepository"|data-command="zero.startChange"/);
  const githubSection=()=>webview.html.match(/<section class="repository">([\s\S]*?)<\/section>/)[1];
  assert.doesNotMatch(githubSection(),/data-command="zero.publishWeb"/);
  assert.doesNotMatch(webview.html.split('<section class="repository">')[0],/zero.publishWeb/,'Run controls stay separate from GitHub publishing');
  assert.ok(authCalls.every(call=>call.options.silent));
  await commands.get('zero.browseZeroHub')();
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['projects','libraries']);
  nextChoice='projects';await commands.get('zero.browseZeroHub')();assert.equal(opened.pop().url,'https://zero.codepet.ca/hub?kind=game');
  nextChoice='starters';await commands.get('zero.browseZeroHub')();assert.equal(opened.length,0,'Retired starters cannot open an old catalog route');
  nextChoice=undefined;
  await commands.get('zero.chooseRepository')();
  assert.equal(picks.at(-1).options.title,'ZeroHub','Signed-out Project menu is unavailable');
  assert.equal(inputCount,0,'Cancelled repository menu has no input or mutation');
  nextChoice='connect';await commands.get('zero.chooseRepository')();
  assert.equal(inputCount,0,'Signed-out project menu remains hidden');
  let simulationFinished=false;const simulation=commands.get('zero.uploadToGitHub')().then(()=>{simulationFinished=true;});
  await warningShown;await settle(()=>simulationFinished);assert.equal(simulationFinished,true,'Simulation must release commands while its notification is still open');
  assert.doesNotMatch(webview.html,/data-command="zero.githubAccount"[^>]* disabled/,'Account icon must remain available before notification dismissal');
  assert.match(notices.at(-1),/Simulation only/);assert.equal(gitChanges,0);dismissWarning();await simulation;
  await commands.get('zero.githubAccount')();assert.match(errors.at(-1),/Sign in to GitHub/);assert.equal(authCalls.at(-1).options.createIfNone,true);
  nextChoice='create';await commands.get('zero.chooseRepository')();assert.equal(opened.length,0,'Cancelled sign-in cannot open repository creation');
  session={id:'student-session',account:{id:'1',label:'student'},accessToken:'PRIVATE'};
  await commands.get('zero.signInToGitHub')();assert.match(webview.html,/title="Signed in as student"/);assert.match(webview.html,/>student<\/button>/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"|data-command="zero.createRepository"|data-command="zero.signInToGitHub"/);
  const beforeCreateInput=inputCount;
  await commands.get('zero.chooseRepository')();assert.equal(creations.length,0);assert.equal(inputCount,beforeCreateInput);assert.match(notices.at(-1),/Simulation only/);
  mode='live';inputs.push('score-game');nextChoice='new';await commands.get('zero.chooseRepository')();
  assert.deepEqual(creations,[{name:'score-game',private:false,template:{owner:'codepetca',repo:'zero-starter'}}]);
  assert.deepEqual(clones,[{repositoryUrl:'https://github.com/student/score-game',parentPath:root}]);
  assert.equal(dispatched.at(-1),'vscode.openFolder');assert.equal(opened.length,0,'App creation never opens a browser creation page');mode='simulation';
  nextChoice=undefined;await commands.get('zero.githubAccount')();
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['change','signOut']);
  const dispatchCount=dispatched.length;nextChoice='signOut';await commands.get('zero.githubAccount')();
  assert.deepEqual(removed,['student-session']);assert.equal(dispatched.length,dispatchCount,'Signing out removes only Zero’s App session');assert.match(webview.html,/Sign in to GitHub/);
  session={id:'student-session',account:{id:'1',label:'student'},accessToken:'PRIVATE',scopes:[]};authEvent({provider:{id:'zero-github'}});await settle(()=>webview.html.includes('Signed in as student'));
  connectionSession={...session,id:'replacement-session'};nextChoice='change';await commands.get('zero.githubAccount')();
  assert.deepEqual(removed,['student-session','student-session']);assert.equal(authCalls.at(-1).options.createIfNone,true);assert.equal(authCalls.at(-1).options.clearSessionPreference,undefined,'Account replacement stays within Zero’s provider');
  repo='https://github.com/student/app.git';webviewProvider.resolveWebviewView(candidate);await settle(()=>/Commit &amp; push/.test(webview.html) && />student\/app /.test(webview.html));
  assert.match(webview.html,/Commit &amp; push/);assert.match(webview.html,/>student\/app /);assert.doesNotMatch(webview.html,/Create repository|Connect existing repository|Copy repository link/);assert.doesNotMatch(webview.html,/PRIVATE/);
  assert.doesNotMatch(githubSection(),/data-command="zero.publishWeb"/,'Publishing lives in repository actions');
  nextChoice='copy';await commands.get('zero.chooseRepository')();assert.equal(copied.at(-1),'https://github.com/student/app');
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['open','copy','publish','start','switch','connect','new','clone','local']);
  const beforePublishAuth=authCalls.length;nextChoice='publish';await commands.get('zero.chooseRepository')();assert.match(webview.html,/Simulation only — no publishing files/);assert.equal(authCalls.length,beforePublishAuth,'Repository menu dispatch preserves publishing simulation isolation');
  session={...session,account:{id:'1',label:'<img src=x onerror="bad">'}};authEvent({provider:{id:'zero-github'}});await settle(()=>webview.html.includes('&lt;img src=x onerror=&quot;bad&quot;&gt;'));
  assert.match(webview.html,/&lt;img src=x onerror=&quot;bad&quot;&gt;/);assert.doesNotMatch(webview.html,/<img|PRIVATE/,'Account labels must be escaped and tokens excluded');
  connectionSession=undefined;session=undefined;authEvent({provider:{id:'zero-github'}});await settle(()=>/Sign in to GitHub/.test(webview.html) && !/data-command="zero.uploadToGitHub"/.test(webview.html));assert.match(webview.html,/Sign in to GitHub/);assert.doesNotMatch(webview.html,/data-command="zero.uploadToGitHub"/);
  assert.doesNotMatch(webview.html,/data-command="zero.chooseRepository"|Current branch:|student\/app/,'Signed-out GitHub area contains only Sign in');
  nextChoice=undefined;const signedOutPicks=picks.length;await commands.get('zero.chooseRepository')();assert.equal(picks.length,signedOutPicks);
  session={id:'student-session',account:{id:'1',label:'student'},accessToken:'PRIVATE'};authEvent({provider:{id:'zero-github'}});await settle(()=>webview.html.includes('Signed in as student'));
  nextChoice='open';await commands.get('zero.chooseRepository')();assert.equal(opened.at(-1).url,'https://github.com/student/app');
  const beforeSwitch=dispatched.length;nextChoice='switch';await commands.get('zero.chooseRepository')();assert.equal(dispatched.length,beforeSwitch,'Simulation does not switch a branch');
  mode='live';checkout=async()=>{currentBranch='add-score';};const beforeSwitchAuth=authCalls.length;
  let releaseCheckout;checkoutGate=new Promise(resolve=>{releaseCheckout=resolve;});
  const switching=commands.get('zero.chooseRepository')();await settle(()=>dispatched.at(-1)==='git.checkout');
  const pendingDispatches=dispatched.length;await commands.get('zero.cloneRepository')();await commands.get('zero.switchBranch')();assert.equal(dispatched.length,pendingDispatches,'Native checkout holds the operation lock');
  releaseCheckout();await switching;checkoutGate=undefined;
  assert.equal(authCalls.length,beforeSwitchAuth,'Switching does not reauthorize');assert.match(webview.html,/>Switched to add-score<\/p>/);assert.match(webview.html,/Current branch: add-score/);
  const beforeCancel=notices.length;checkout=undefined;await commands.get('zero.switchBranch')();assert.equal(notices.length,beforeCancel,'Cancel creates no success popup');
  nextChoice=undefined;await commands.get('zero.chooseRepository')();assert.ok(!picks.at(-1).items.some(item=>item.action==='start'),'New branch follows the existing main-only workflow');
  currentBranch=undefined;nextChoice=undefined;await commands.get('zero.chooseRepository')();assert.ok(picks.at(-1).items.some(item=>item.action==='switch'));assert.match(webview.html,/>Detached HEAD<\/span>/);
  checkout=async()=>{currentBranch='main';};nextChoice='switch';await commands.get('zero.chooseRepository')();assert.match(webview.html,/>Switched to main<\/p>/);assert.doesNotMatch(webview.html,/>Detached HEAD<\/span>/);
  for(const unavailable of [undefined,path.dirname(root)]) {nativeRoot=unavailable;const beforeUnavailable=dispatched.length;await commands.get('zero.switchBranch')();assert.equal(dispatched.length,beforeUnavailable,'Missing or mismatched native repository cannot fall back to another repository');assert.match(errors.at(-1),/Source Control.*built-in Git extension/);}nativeRoot=root;
  checkout=async()=>{throw new Error('Local changes would be overwritten. Commit or stash them first.');};await commands.get('zero.switchBranch')();assert.match(errors.at(-1),/Local changes would be overwritten/);assert.equal(currentBranch,'main');checkout=undefined;

  nextChoice='clone';pickEffect=async()=>{repo='https://github.com/student/changed.git';};const beforeDrift=dispatched.length;await commands.get('zero.chooseRepository')();assert.equal(dispatched.length,beforeDrift,'A changed destination invalidates a pending menu selection');pickEffect=undefined;repo='https://github.com/student/app.git';currentBranch='main';
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({tutorialProjectId:'greeting',repositoryRequired:true,lessonId:'0'}));
  nextChoice=undefined;await commands.get('zero.chooseRepository')();
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['open','copy','publish','start','switch','new','clone','local'],'A cloned tutorial keeps repository actions without offering rejected origin replacement');
  repo=undefined;webviewProvider.resolveWebviewView(candidate);await settle(()=>!webview.html.includes('student/app'));
  await commands.get('zero.chooseRepository')();
  assert.deepEqual(picks.at(-1).items.map(item=>item.action),['new','clone','local'],'An uncloned tutorial offers a new project, clone or opening an existing local copy');
  nextChoice='clone';const beforeClone=dispatched.length;await commands.get('zero.chooseRepository')();assert.equal(dispatched.length,beforeClone,'Cancelled clone URL does not launch Git');
  assert.equal(gitChanges,0);assert.ok(webview.html.includes('zero.runApp'),'Local Run is always available');
});

test("Zero controls and Files share one supported view with minimal overflow",()=>{
  const manifest=require("../package.json");
  assert.deepEqual(manifest.contributes.views.zero.map(view=>view.id),["zero.actions"]);
  assert.equal(manifest.contributes.views.zero[0].name,"Zero");
  assert.deepEqual(manifest.contributes.menus["view/title"].map(item=>item.command),["zero.exportWeb","zero.copyPublishedWebLink","zero.openPublishedWeb","zero.openFirstLesson","zero.showSetup","zero.startProject","zero.showOutput"]);
  assert.equal(manifest.contributes.commands.find(item=>item.command==="zero.startChange").title,"Zero: New Branch");
  assert.equal(manifest.contributes.commands.find(item=>item.command==="zero.startProject").title,"Zero: Start Tutorial");
  assert.equal(manifest.contributes.commands.find(item=>item.command==="zero.cloneRepository").title,"Zero: Clone from GitHub");
});
