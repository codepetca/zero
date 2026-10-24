'use strict';
const editor = require('vscode');
const {minimalPrompts} = require('./prompts');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./core');
const {nativeBuildIdentity,createNativeRuntimeExecution} = require('./native-runtime-task');
const lessonProjects = require('./lesson-projects');
const github = require('./github');
const workflow = require('./workflow');
const {createAuthentication,ownedProviderApi} = require('./authentication');
const {githubAppConfiguration} = require('./github-app/config');
const {createGitHubAppProvider} = require('./github-app/provider');
const {createGitHubAppRepositories,repositoryIdentity,assertRepositoryIdentity} = require('./github-app/repositories');
const {createGitHubAppClone} = require('./github-app/clone');
const {createGitHubProjectCommands} = require('./github-app/projects-ui');
const {createProjectFolders} = require('./project-folders');
const {createProjectWindow} = require('./project-window');
const {createRecentProjects} = require('./recent-projects');
const {createProjectPicker} = require('./project-picker');
const {createGitHubReadiness} = require('./github-app/readiness');
const {createGitHubSetup} = require('./github-app/setup-ui');
const {selectUploadAuthentication} = require('./web-publish-upload-auth');
const {createTransport} = require('./transport');
const {createSharingEditor} = require('./sharing/editor');
const {readKitConfiguration} = require('./sharing/configuration');
const {createSetupHelp} = require('./setup');
const {isSetupProject,findSetupProject} = require('./setup-project');
const {createNativeUpdateCommands} = require('./native-updates');
const {createNativeUpdateReload} = require('./native-update-reload');
const {createWebExportCommands} = require('./web-export-ui');
const {createProjectBuilder,readSavedBuilder} = require('./project-builder');
const {createBrowserRunCommands,sourceDiagnostics} = require('./web-run-ui');
const {createSavedSourceStatus}=require('./saved-source-status');
const {createSavedSourceHost}=require('./saved-source-host');
const {runtimeDiagnostics}=require('./runtime-session');
const {createTutorialReader} = require('./tutorial-reader');
const {createStartPage} = require('./start-page');
const {createWebPublishCommands} = require('./web-publish-ui');
const {createAssetCommands} = require('./assets');
const {createFileCommands} = require('./file-actions');
const {createRecoveryCommands} = require('./recovery');
const {sidebarStyles} = require('./sidebar-style');
const {sidebarScript} = require('./sidebar-script');
const {icon} = require('./sidebar-icons');
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function activate(context, services = {}) {
  const vscode = minimalPrompts(editor);
  const launchedForZero = path.isAbsolute((services.env || process.env).ZERO_KIT_DIR || '');
  for (const [id, action] of Object.entries(createNativeUpdateCommands(vscode))) {
    context.subscriptions.push(vscode.commands.registerCommand(id, action));
  }
  const output = vscode.window.createOutputChannel('Zero');
  let execution, ending, view, pendingLaunch;
  let runGeneration = 0;
  let nativeStarting = 0, stopPromise;
  const nativeIdleWaiters = new Set();
  function nativePrepared() {
    nativeStarting--;
    if (!nativeStarting) {for (const resolve of nativeIdleWaiters) resolve();nativeIdleWaiters.clear();}
    refresh();
  }
  const nativeIdle = () => nativeStarting ? new Promise(resolve=>nativeIdleWaiters.add(resolve)) : Promise.resolve();
  let uploading = false;
  let uploadProgress = '';
  let connecting = false;
  let startingTutorial = false;
  let signingIn = false;
  let disposed = false;
  context.subscriptions.push({dispose() { disposed = true; }});
  let changing = false;
  let menuOpen = false;
  let componentBusy = false;
  let maintenanceBusy = false;
  let exportingWeb = false;
  let browserBusy = false;
  let browserActive = false;
  let publishingWeb = false;
  let exportReadyRoot;
  let branch = '';
  let branchDetached = false;
  let statusGeneration = 0;
  const isBusy = () => Boolean(stopPromise) || uploading || connecting || startingTutorial || signingIn || changing || menuOpen || componentBusy || maintenanceBusy || exportingWeb || publishingWeb || browserBusy;
  let projectRoot;
  let renderedWebview, startPage;
  const uploadMode = (root = projectRoot) => root ? vscode.workspace.getConfiguration('zero', vscode.Uri.file(root)).get('uploadMode', 'live') : 'live';
  let runQueue = Promise.resolve();
  let state = '';
  let buildFailed = false;
  const stoppedTasks = new WeakSet();
  const taskExitCodes = new WeakMap();
  let repository = 'No repository connected';
  let localPractice = false;
  let originalWork = false;
  let savedBuilderInspectedRoot,savedChecks,savedChecksRoot,savedChecksState,savedPreparation;
  let savedChecksEnableGeneration=0;
  const project = async () => {
    let root;
    try {root = await core.resolveProject((vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath));}
    catch(error) {projectRoot=undefined;localPractice=false;originalWork=false;throw error;}
    const practice = await lessonProjects.isLocalPractice(root);
    const original = !practice && !await lessonProjects.tutorialMarker(root);
    if(savedBuilderInspectedRoot!==root){savedBuilderInspectedRoot=root;try{await readSavedBuilder(root,{metadataOnly:true});}catch(error){output.appendLine(error.message);}}
    if(savedChecksRoot&&savedChecksRoot!==root){savedChecks.dispose();savedChecks=undefined;savedChecksRoot=undefined;savedChecksState=undefined;}
    projectRoot = root; localPractice = practice; originalWork = original;
    return root;
  };
  const refresh = () => { if (view) render(view.webview); startPage?.refresh(); };
  const report = (text, detail = text) => {state=text;output.appendLine(detail);refresh();};
  const tutorials = createTutorialReader(vscode,{context,output,project});
  context.subscriptions.push(tutorials);
  const hasOpenEditors = () => Boolean(vscode.window.activeTextEditor) || Boolean(vscode.window.tabGroups?.all.some(group => group.tabs.some(tab => !startPage?.owns(tab))));
  async function openFirstLesson(root, onlyWhenEmpty = false) {
    if (isSetupProject(root)) return false;
    let filename;
    // Older kits start with the quiz; preserve their first-lesson entry point.
    const practice = await lessonProjects.isLocalPractice(root);
    let marker = null;
    const tutorial = practice ? null : await lessonProjects.tutorialMarker(root);
    if (tutorial) {
      if (await project() !== root || (onlyWhenEmpty && hasOpenEditors())) return false;
      if (!hasOpenEditors()) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'src/main/java/Main.java'))), {preview:false});
      await tutorials.open(root, tutorial.lessonId);
      return true;
    }
    if (practice) {
      try {marker = JSON.parse(await fs.readFile(path.join(root, 'zero.json'), 'utf8'));}
      catch {throw new Error('This practice project’s zero.json is damaged. Restore its project marker or start a new project to open the guide. GitHub sharing stays blocked until the marker is restored.');}
      if (!marker || typeof marker.lessonId !== 'string' || !/^(?:[0-9]|1[0-2])(?:-[a-z]+)?$/.test(marker.lessonId)) throw new Error('This project’s zero.json has no valid lessonId. Restore its project marker or start a new project to open the guide.');
      if (['greeting','study','game'].includes(marker.practiceProjectId)) {
        const firstLessons = {greeting:'0',study:'3',game:'8'};
        if (marker.lessonId !== firstLessons[marker.practiceProjectId]) throw new Error('This project’s zero.json has an invalid first lesson. Restore its project marker or start a new project.');
        if (await project() !== root || (onlyWhenEmpty && hasOpenEditors())) return false;
        if (!hasOpenEditors()) {
          const main = path.join(root, 'src', 'main', 'java', 'Main.java');
          await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(main)), {preview:false});
        }
        await tutorials.open(root, marker.lessonId);
        return true;
      }
    }
    const lessonPrefix = marker ? `${marker.lessonId.split('-')[0].padStart(2,'0')}-` : '';
    const lessonNames = practice
      ? (await fs.readdir(path.join(root, 'lessons')).catch(() => [])).filter(name => name.startsWith(lessonPrefix) && name.endsWith('.md')).sort()
      : ['00-hello-world.md', '01-quiz.md'];
    for (const name of lessonNames) {
      const candidate = path.join(root, 'lessons', name);
      try {if ((await fs.stat(candidate)).isFile()) {filename = candidate; break;}}
      catch (error) {if (error.code !== 'ENOENT') throw error;}
    }
    if (!filename) return false;
    // A folder switch during preparation must not open another project's lesson.
    if (await project() !== root) return false;
    if (onlyWhenEmpty && hasOpenEditors()) return false;
    if (practice) {
      const main = path.join(root, 'src', 'main', 'java', 'Main.java');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(main)), {preview:false});
    }
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filename));
    return true;
  }
  async function introduceProject() {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length && hasOpenEditors() && !launchedForZero) return;
    const root = folders.length ? await project() : undefined;
    if (!root) {
      if (!hasOpenEditors() && !startPage.isOpen()) await startPage.show({preserveFocus:false});
      return;
    }
    if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    if (launchedForZero || !context.workspaceState.get('zero.explorerShown')) {
      await actions['zero.showSidebar']();
      await context.workspaceState.update('zero.explorerShown', true);
      await context.workspaceState.update('zero.sidebarShown', true);
    }
    if (!root || isSetupProject(root)) return;
    const key = `zero.firstLessonShown:${root}`;
    // Preserve text editors and non-text tabs, including other lesson previews.
    if (!context.workspaceState.get(key) && !hasOpenEditors() && await openFirstLesson(root, true)) await context.workspaceState.update(key, true);
  }
  let githubReadiness,projectPicker;
  const appConfiguration = githubAppConfiguration();
  const appProvider = services.provider || (appConfiguration ? createGitHubAppProvider({vscode,context,configuration:appConfiguration,onDiagnostic:message=>output.appendLine(message)}) : null);
  const auth = createAuthentication(ownedProviderApi(appProvider), () => {if (state.startsWith('Signed in as ')) state='';githubReadiness?.sync();projectPicker?.sessionChanged();refresh();});
  context.subscriptions.push(auth);
  if (appProvider) {
    context.subscriptions.push(appProvider);
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('zero-github','Zero GitHub',appProvider,{supportsMultipleAccounts:false}));
  }
  const repositories = services.repositories || createGitHubAppRepositories({authentication:auth,configuration:appConfiguration});
  githubReadiness = createGitHubReadiness({authentication:auth,repositories,installationUrl:appConfiguration && `https://github.com/apps/${appConfiguration.slug}/installations/new`,active:()=>!disposed,onChange:()=>{if (/^(?:Checking GitHub|GitHub sign-in|GitHub setup paused|GitHub is ready for your projects|Install Zero for GitHub\.)/.test(state)) state='';refresh();}});
  context.subscriptions.push(githubReadiness);
  const githubReady = () => auth.signedIn && githubReadiness.phase === 'ready';
  const cloneRepository = services.cloneRepository || createGitHubAppClone({authentication:auth,repositories});
  const recentProjects=createRecentProjects({globalState:context.globalState,active:()=>!disposed,eligible:root=>!isSetupProject(root)});
  async function rememberOpened({projectPath,repositoryUrl}) {
    const accountId=auth.accountId,label=auth.accountLabel;
    if(!accountId||disposed||!projectPath||isSetupProject(projectPath))return;
    if(!repositoryUrl) {try {repositoryUrl=core.parseRepositoryUrl(await core.git(projectPath,['remote','get-url','origin'])).page;}catch{}}
    if(repositoryUrl&&core.parseRepositoryUrl(repositoryUrl).page.split('/')[3].toLowerCase()!==label?.toLowerCase())return;
    await recentProjects.remember(projectPath,{accountId,repositoryUrl,isCurrent:()=>!disposed&&auth.accountId===accountId&&auth.accountLabel===label});
    startPage?.refresh({recent:true});
    // Folder opening can be vetoed without rejecting its command. Retain the
    // creation receipt until the intended workspace is actually active.
    const recovery=context.globalState?.get('zero.repositoryCreationRecovery');
    if(!repositoryUrl||recovery?.stage!=='created'||recovery.projectRoot||recovery.accountId!==accountId)return;
    let recoveryUrl;
    try {recoveryUrl=core.parseRepositoryUrl(recovery.repositoryUrl).page;}catch{return;}
    if(recoveryUrl!==repositoryUrl)return;
    try {if(await project()!==projectPath)return;}catch{return;}
    if(disposed||auth.accountId!==accountId||auth.accountLabel!==label||JSON.stringify(context.globalState.get('zero.repositoryCreationRecovery'))!==JSON.stringify(recovery))return;
    await context.globalState.update('zero.repositoryCreationRecovery',undefined);
  }
  const projectWindow = createProjectWindow(vscode, {globalState:context.globalState, startPage:()=>startPage, active:()=>!disposed});
  const projectFolders = createProjectFolders(vscode, {globalState:context.globalState, active:() => !disposed, report:text => output.appendLine(text), cloneRepository,onOpened:rememberOpened,openFolder:projectWindow.open});
  projectPicker=createProjectPicker(vscode,{authentication:auth,repositories,history:recentProjects,active:()=>!disposed,report:text=>output.appendLine(text)});
  const githubProjects = createGitHubProjectCommands({vscode,authentication:auth,repositories,folders:projectFolders,prepare:prepareGitHub,extensionPath:context.extensionPath || path.resolve(__dirname,'..'),project,active:()=>!disposed,onProgress:text=>report(text),onRecovery:record=>context.globalState?.update('zero.repositoryCreationRecovery',record)});
  context.subscriptions.push(projectFolders,githubProjects,projectPicker);
  startPage=createStartPage(vscode,{
    getState:()=>({phase:githubReady()?'ready':auth.signedIn?githubReadiness.phase:'signed-out',accountId:auth.accountId,accountLabel:auth.accountLabel,busy:disposed||isBusy(),status:state}),
    listRecent:accountId=>recentProjects.list(accountId),
    openRecent:async(item,accountId)=>{
      if(disposed||isBusy()||auth.accountId!==accountId)return;
      connecting=true;refresh();
      try {
        const ticket=await auth.capture();
        const assertCurrent=async()=>{if(disposed||auth.accountId!==accountId)throw new Error('The GitHub account changed. Open the project again.');await auth.assertCurrent(ticket);};
        await assertCurrent();
        await projectFolders.openLocal({projectPath:item.path,assertCurrent});
      } finally {connecting=false;if(!disposed)refresh();}
    },report:(message,detail)=>report(message,detail)
  });
  context.subscriptions.push(startPage);
  const githubSetup = createGitHubSetup({vscode, authentication:auth, repositories,
    installationUrl:appConfiguration && `https://github.com/apps/${appConfiguration.slug}/installations/new`,
    active:() => !disposed, report});
  context.subscriptions.push(githubSetup);
  async function prepareGitHub({openBrowser = false} = {}) {
    await actions['zero.startPage']();
    if (disposed) return false;
    await auth.refresh();
    if (disposed) return false;
    if (!auth.signedIn) await auth.signIn(false);
    if (disposed) return false;
    const ticket = await auth.capture();
    if (disposed) return false;
    const ready = await githubSetup.ensure({openBrowser});
    if (!disposed && ready) {await auth.assertCurrent(ticket);githubReadiness.confirm(ticket);}
    if (!disposed && !ready) {report('GitHub setup paused');void githubReadiness.refresh();}
    return !disposed && ready ? ticket : false;
  }
  async function signIn(changeAccount = auth.signedIn) {
    if (disposed || isBusy()) return;
    signingIn = true; refresh();
    try {
      if (disposed) return;
      if (!appProvider) throw new Error('The Codepet GitHub App is not configured in this Zero release. Local running still works.');
      if (changeAccount && auth.sessionId) {await appProvider.removeSession(auth.sessionId);await auth.refresh();}
      await actions['zero.startPage']();
      await auth.refresh();
      if (!auth.signedIn) await auth.signIn(false);
      if (!disposed) {await githubReadiness.refresh();output.appendLine(auth.status);try {await rememberOpened({projectPath:await project()});}catch{}}
    } catch (error) {
      if (!disposed) throw error;
    } finally { signingIn = false; if (!disposed) refresh(); }
  }
  async function repositoryStatus() {
    const generation = ++statusGeneration;
    let nextRepository = 'No repository connected', nextBranch = '', nextDetached = false;
    try {
      const root = await project();
      if (localPractice) {nextRepository = 'Local practice'; throw new Error('Local practice');}
      await core.assertRepositoryRoot(root);
      nextRepository = core.parseRepositoryUrl(await core.git(root, ['remote', 'get-url', 'origin'])).page;
      try {nextBranch = (await core.git(root, ['symbolic-ref', '--short', 'HEAD'])).trim();}
      catch {try {nextDetached = /^[a-f0-9]{40,64}$/.test(await core.git(root, ['rev-parse', '--verify', 'HEAD']));} catch {}}
    } catch (error) { if (!localPractice) nextRepository = error.message.includes('different Git repository') ? 'Standalone student copy needed to connect' : 'No repository connected'; }
    if (generation === statusGeneration) {repository = nextRepository; branch = nextBranch; branchDetached = nextDetached; refresh();}
  }
  async function stop() {
    if (!execution) return;
    const active = execution;
    stoppedTasks.add(active);
    active.terminate();
    state = 'Stopping app…'; refresh();
    let timer;
    try {await Promise.race([ending, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('The app task has not stopped. Close its terminal before restarting.')), 10000);})]);}
    finally {clearTimeout(timer);}
    if (!execution) {state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped'; refresh();}
  }
  async function stopRequested() {
    runGeneration++;
    if (pendingLaunch) await pendingLaunch.catch(() => {});
    await stop();
    state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped'; refresh();
  }
  const nativeTaskStates = new WeakMap();
  const nativeProblems=vscode.languages?.createDiagnosticCollection('zero-native-runtime');
  if(nativeProblems)context.subscriptions.push(nativeProblems);
  function nativeRuntimeState(task, event) {
    const metadata = nativeTaskStates.get(task);
    if (!metadata) return;
    metadata.latest = event;
    if (event.type === 'fatal') metadata.failed = true;
    if (disposed || metadata.generation !== runGeneration || execution?.task !== task || stoppedTasks.has(execution)) return;
    if (event.type === 'ui-ready') state = 'App UI ready';
    else if (event.type === 'first-frame') state = 'App running · first game frame ready';
    else if (event.type === 'fatal') {buildFailed = true;state = `App failed (${event.stage}/${event.code}). Check Problems or the task terminal.`;
      if(nativeProblems){const grouped=new Map();for(const item of runtimeDiagnostics(event.diagnostic||'',metadata.root)){const point=new vscode.Position(Math.max(0,item.line-1),0),diagnostic=new vscode.Diagnostic(new vscode.Range(point,point),item.message,vscode.DiagnosticSeverity.Error);diagnostic.source='Zero native runtime';if(!grouped.has(item.file))grouped.set(item.file,[]);grouped.get(item.file).push(diagnostic);}for(const [file,items]of grouped)nativeProblems.set(vscode.Uri.file(file),items);}
    }
    else if (event.type === 'stopped') state = 'App stopped';
    if (event.diagnostic) output.appendLine(`[Native ${event.stage}/${event.code}] ${event.diagnostic}`);
    refresh();
  }
  async function makeTask(root, definition = {type:'zero',task:'run'}, scope = vscode.TaskScope.Workspace) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
    await core.assertTutorialRepository(root);
    const spec = core.runSpecification(root);
    await fs.access(spec.command);
    const metadata = {generation:runGeneration,root,failed:false};nativeProblems?.clear();
    let task, transport;
    const processExecution = typeof vscode.CustomExecution === 'function'
      ? (transport = createNativeRuntimeExecution({vscode,spec,buildId:await nativeBuildIdentity(root),...services.nativeRuntime,
          isCurrent:()=>!disposed && metadata.generation === runGeneration,
          onEvent:event => nativeRuntimeState(task,event),onExit:code => {metadata.exitCode = code;}
        })).execution
      : spec.shell
        ? new vscode.ShellExecution({value: spec.command, quoting: vscode.ShellQuoting.Strong}, spec.args, {cwd: root})
        : new vscode.ProcessExecution(spec.command, spec.args, {cwd: root});
    task = new vscode.Task(definition, scope, 'Run App', 'Zero', processExecution, '$zero-java');
    // Complete compiler problem collection before the long-lived JavaFX process
    // exits, so a corrected running app does not retain the last build's errors.
    task.isBackground = true;
    metadata.custom=Boolean(transport);nativeTaskStates.set(task,metadata);
    if (transport) context.subscriptions.push(transport);
    task.presentationOptions = {reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true, focus: false};
    task.group = vscode.TaskGroup.Build;
    return task;
  }
  const taskFinishes = new Map();
  function track(active) {
    if (taskFinishes.has(active)) return;
    if (execution && execution !== active) {stoppedTasks.add(execution); execution.terminate();}
    execution = active;
    buildFailed = false;
    ending = new Promise(resolve => taskFinishes.set(active, resolve));
    const metadata = nativeTaskStates.get(active.task);
    if (disposed || metadata && metadata.generation !== runGeneration) {stoppedTasks.add(active);active.terminate();return;}
    state = 'Building / running · readiness unverified — output is in the terminal'; refresh();
    const latest = nativeTaskStates.get(active.task)?.latest;
    if (latest) nativeRuntimeState(active.task,latest);
  }
  context.subscriptions.push(vscode.tasks.onDidStartTask(event => {
    if (event.execution.task.definition.type === 'zero' && ['run','native-run'].includes(event.execution.task.definition.task)) track(event.execution);
  }), vscode.tasks.onDidEndTask(event => {
    const finish = taskFinishes.get(event.execution);
    if (!finish) return;
    taskFinishes.delete(event.execution); finish();
    if (execution === event.execution) {
      execution = undefined;
      const metadata = nativeTaskStates.get(event.execution.task);
      const exitCode = metadata?.exitCode ?? taskExitCodes.get(event.execution);
      buildFailed = Boolean(metadata?.failed || typeof exitCode === 'number' && exitCode !== 0 && (metadata?.custom || !stoppedTasks.has(event.execution)));
      state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped';
      refresh();
    }
  }), vscode.tasks.onDidEndTaskProcess(event => {
    if (!taskFinishes.has(event.execution)) return;
    taskExitCodes.set(event.execution, event.exitCode);
  }));
  context.subscriptions.push(vscode.tasks.registerTaskProvider('zero', {
    // Configured tasks must pass through resolveTask for saving and restart checks.
    provideTasks: async () => [],
    resolveTask: async configured => {
      if (!['run','native-run'].includes(configured.definition.task)) return undefined;
      if (stopPromise || isBusy()) return undefined;
      nativeStarting++;refresh();
      try {
        browserRun.stop({quiet:true});
        const generation = runGeneration;
        await stop();
        const root=await project();
        if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
        if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
        if (disposed || generation !== runGeneration) return undefined;
        if (await project() !== root) throw new Error('The student project changed during run preparation. Run the current app explicitly.');
        const task = await makeTask(root, configured.definition, configured.scope);
        if (disposed || generation !== runGeneration) return undefined;
        if (await project() !== root) throw new Error('The student project changed during run preparation. Run the current app explicitly.');
        if (disposed || generation !== runGeneration) return undefined;
        task.group = configured.group || vscode.TaskGroup.Build;
        return task;
      } finally {nativePrepared();}
    }
  }));
  async function run(generation, expectedRoot) {
    if (disposed || generation !== runGeneration) return;
    await stop();
    const root = await project();
    if (expectedRoot && root !== expectedRoot) throw new Error('The student project changed before running the dependency update. Run the original app explicitly.');
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
    await core.assertTutorialRepository(root);
    if (generation !== runGeneration) return;
    if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
    if (disposed || generation !== runGeneration) return;
    const task = await makeTask(root);
    if (disposed || generation !== runGeneration) return;
    if (await project() !== root) throw new Error('The student project changed during run preparation. Run the current app explicitly.');
    if (disposed || generation !== runGeneration) return;
    pendingLaunch = vscode.tasks.executeTask(task).then(active => {
      if (disposed || generation !== runGeneration) {stoppedTasks.add(active);active.terminate();}
      else track(active);
      return active;
    });
    try {await pendingLaunch;} finally {pendingLaunch = undefined;}
  }
  function queuedRun(expectedRoot) {
    const generation = runGeneration;
    nativeStarting++;refresh();
    const next = runQueue.then(() => run(generation,expectedRoot)).finally(nativePrepared);
    runQueue = next.catch(() => {});
    return next;
  }
  async function quickPick(items, options) {
    menuOpen = true; refresh();
    try {return await vscode.window.showQuickPick(items, options);}
    finally {menuOpen = false; refresh();}
  }
  function simulation(action) {
    state = `Simulation only — ${action}: nothing changed. No files saved, Git changes, sign-in or upload.`;
    refresh(); void vscode.window.showWarningMessage(state);
  }
  async function conflictHelp() {
    void vscode.window.showInformationMessage('Resolve the conflicts in VS Code Source Control. Stage the resolved files, then commit the merge with standard VS Code Git controls. Run your app to check it, then choose Merge to main again. Zero leaves your files and merge in place.');
    try {
      const available = await vscode.commands.getCommands(true);
      if (available.includes('workbench.view.scm')) {await vscode.commands.executeCommand('workbench.view.scm'); return;}
    } catch {}
    void vscode.window.showInformationMessage('Open Source Control from the VS Code Activity Bar to resolve and commit the merge.');
  }
  async function change(kind) {
    if (isBusy()) return;
    changing = true; refresh();
    try {
      const root = await project();
      await lessonProjects.assertShareable(root);
      if (uploadMode(root) !== 'live') {simulation(kind === 'start' ? 'New branch' : 'Merge to main'); return;}
      let name;
      if (kind === 'start') {
        name = await vscode.window.showInputBox({title:'Branch name', validateInput:value => /^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : 'Use lowercase letters, numbers and dashes, starting with a letter or number.'});
        if (!name) return;
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Use lowercase letters, numbers and dashes for your change name.');
      }
      const ticket = await auth.capture();
      if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before reviewing the change.');
      const destination = await github.prepareUpload(root);
      const identity=repositoryIdentity(await repositories.access(destination.page,{ticket,permissions:{contents:'write'}}));
      const assertCurrent = async () => {assertRepositoryIdentity(identity,await repositories.access(destination.page,{ticket,permissions:{contents:'write'}}));return auth.assertCurrent(ticket);};
      const networkRun = createTransport(destination.remote, assertCurrent, {assertCurrentNow:() => auth.assertCurrentNow(ticket)});
      const options = {networkRun, beforeNetwork:assertCurrent, onProgress:text => {state=text; refresh();}};
      const plan = kind === 'start' ? await workflow.prepareStart(root, name, options) : await workflow.prepareFinish(root, options);
      if (plan.remote !== destination.remote) throw new Error('The connected repository changed. Review your change again.');
      if (await project() !== root) throw new Error('The student project changed. Review your change again.');
      await assertCurrent();
      const result = kind === 'start' ? await workflow.startPrepared(plan, options) : await workflow.finishPrepared(plan, options);
      if (kind === 'finish' && result.updated && !result.finished) {
        report('Branch updated. Run App, then Merge to main.', 'Main updates added to your change. Run App, then choose Merge to main again to review.');
        return;
      }
      let cleanupError;
      if (kind === 'finish' && result.finished) {
        try {
          if (await project() !== root) throw new Error('The student project changed.');
          await workflow.deleteFinishedBranch(root, result.finishedBranch, result.head);
        } catch(error) {
          cleanupError = error;
          output.appendLine(`Main was merged and pushed. Finished local branch kept: ${error.message}`);
        }
      }
      await refreshNativeGit(root);
      state = kind === 'start' ? `Created ${result.branch}` : cleanupError ? 'Merged to main · local branch kept; see Output' : 'Merged to main';
      if (cleanupError) void vscode.window.showWarningMessage(state);
      else report(state, kind === 'start' ? `Started ${result.branch}. Make your changes, then Commit & push.` : `Merged ${result.finishedBranch} to main and pushed ${result.head}. Finished local branch deleted.`);
    } catch(error) {if (error.conflict) await conflictHelp(); throw error;}
    finally {await repositoryStatus(); changing = false; refresh();}
  }
  async function refreshNativeGit(root) {
    try {
      const extension=vscode.extensions?.getExtension('vscode.git');
      if(!extension)return;
      const api=(extension.isActive ? extension.exports : await extension.activate()).getAPI(1);
      const native=api.getRepository(vscode.Uri.file(root));
      if(native && await fs.realpath(native.rootUri.fsPath)===root)await native.status();
    } catch(error) {output.appendLine(`Source Control refresh: ${error.message}`);}
  }
  async function uploadProject(uploadAuth = auth, {forPublish=false,expectedRoot,expectedPlan,assertPublishCurrent=async()=>{},assertPublishCurrentNow=()=>{}} = {}) {
      if (isBusy()) return;
      uploading = true; uploadProgress = 'Preparing commit…'; refresh();
      let selectedAuth;
      try {
        const root = await project();
        if(expectedRoot && root!==expectedRoot)throw new Error('The student project changed. Choose Publish app again.');
        await assertPublishCurrent();
        await lessonProjects.assertShareable(root);
        if (uploadMode(root) !== 'live') {
          const result = core.simulatedUpload();
          state = `${result.message} Nothing changed: no files saved, Git changes or sign-in.`; refresh();
          void vscode.window.showWarningMessage(state);
          return;
        }
        const initialTicket = await uploadAuth.capture();
        if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before reviewing the upload.');
        const assertCurrentProject=async()=>{
          await assertPublishCurrent();
          if(await project()!==root)throw new Error('The student project changed. Review the upload again.');
          if(uploadMode(root)!=='live')throw new Error('Live uploads were disabled. Review the upload again.');
        };
        const plan = await github.prepareUpload(root);
        if(forPublish && plan.branch!=='main')throw new Error('Finish your change with Merge to main before publishing the app.');
        if(expectedPlan && ['root','remote','branch','head','status','fingerprint'].some(key=>plan[key]!==expectedPlan[key]))throw new Error('The project changed before upload. Choose Publish app again.');
        selectedAuth=await selectUploadAuthentication({root,authentication:uploadAuth,initialTicket,repositories,repositoryUrl:plan.page,assertCurrentProject});
        const ticket=selectedAuth.ticket, activeAuth=selectedAuth.authentication;
        uploadProgress = ''; refresh();
        const message = forPublish && !plan.changes.length ? 'Publish app' : await vscode.window.showInputBox({title:'Commit Message', validateInput:value => value.trim() && !value.includes('\0') ? undefined : 'Describe your changes in a short message.'});
        if (!message) return;
        uploadProgress = 'Committing & pushing…'; refresh();
        if (await project() !== root) throw new Error('The student project changed. Review the upload again.');
        const assertCurrent = async () => {await assertCurrentProject();assertRepositoryIdentity(selectedAuth.identity,await repositories.access(plan.page,{ticket,permissions:selectedAuth.permissions}));await assertCurrentProject();return activeAuth.assertCurrent(ticket);};
        const result = await github.uploadPrepared(plan, message, {beforeUpload:assertCurrent, networkRun:createTransport(plan.remote, assertCurrent, {assertCurrentNow:() => {assertPublishCurrentNow();return activeAuth.assertCurrentNow(ticket);}}), onProgress:text => {state=text; refresh();}});
        await refreshNativeGit(root);
        await repositoryStatus();
        report(`Pushed to ${result.branch}`, `Pushed ${result.head} to ${result.branch}. Copy your repository link for Pika.`);
        return result;
      } finally {selectedAuth?.dispose();await repositoryStatus(); uploadProgress = ''; uploading = false; refresh();}
  }
  const actions = {
    'zero.getStarted': () => actions['zero.startPage'](),
    'zero.startPage': () => startPage.show(),
    'zero.githubAccount': async () => {
      if (isBusy()) return;
      if (!auth.signedIn) return actions['zero.signInToGitHub']();
      const choice = await quickPick([
        {label:'Change GitHub account…', action:'change'},
        {label:'Sign out', description:'Disconnect Zero on this computer', action:'signOut'}
      ], {title:`GitHub: ${auth.accountLabel}`});
      if (isBusy()) return;
      if (choice?.action === 'change') await actions['zero.signInToGitHub']();
      if (choice?.action === 'signOut') {
        if (appProvider && auth.sessionId) await appProvider.removeSession(auth.sessionId);
        await auth.refresh();report('Signed out of Zero');
      }
    },
    'zero.chooseRepository': async () => {
      if (isBusy() || !auth.signedIn) return;
      await repositoryStatus();
      const root = projectRoot;
      const tutorial = root && !localPractice && await lessonProjects.tutorialMarker(root);
      if (isBusy()) return;
      const connected = repository.startsWith('https://github.com/');
    const ready = githubReady();
    const phase = auth.signedIn ? githubReadiness.phase : 'signed-out';
      const currentRepository = repository, currentBranch = branch;
      const items = connected ? [
        {label:'Open on GitHub', action:'open'},
        {label:'Copy repository link', description:'Submit the link separately in Pika', action:'copy'},
        ...(auth.signedIn ? [{label:'Publish app', action:'publish'}] : []),
        ...(branch === 'main' ? [{label:'New branch…', action:'start'}] : []),
        {label:'Switch branch…', action:'switch'},
        ...(!tutorial ? [{label:'Connect to GitHub…', action:'connect'}] : [])
      ] : [
        ...(!root || tutorial || localPractice ? [] : [
          {label:'Connect to GitHub…', action:'connect'},
          {label:'Create a repository…', description:'Create and connect this project', action:'create'}
        ])
      ];
      const recovery=context.globalState?.get('zero.repositoryCreationRecovery');
      const recoveryUrl=recovery&&typeof recovery.repositoryUrl==='string'?recovery.repositoryUrl:undefined;
      const projectChoices = [...(recoveryUrl?[{label:'Resume created project…',description:recoveryUrl,action:'recover'}]:[])];
      if (connected) items.push(...projectChoices); else items.unshift(...projectChoices);
      if (root) items.push({label:'Review or restore changes…', action:'recovery'});
      items.push({label:'GitHub account…', action:'account'});
      const choice = await quickPick(items, {title:connected ? repository : root ? path.basename(root) : 'Project'});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || repository !== currentRepository || branch !== currentBranch) return;
      if (choice?.action === 'recover') {
        connecting=true;refresh();
        try{if(uploadMode()!=='live')return simulation('Resume created project');await githubProjects.resumeCreated(recovery);}
        finally{connecting=false;refresh();}
      }
      if (choice?.action === 'account') await actions['zero.githubAccount']();
      if (choice?.action === 'recovery') await actions['zero.recovery']();
      if (choice?.action === 'connect') await actions['zero.connectRepository']();
      if (choice?.action === 'copy') await actions['zero.copyRepositoryLink']();
      if (choice?.action === 'publish') await actions['zero.publishWeb']();
      if (choice?.action === 'open' && !await vscode.env.openExternal(vscode.Uri.parse(currentRepository))) throw new Error('Could not open the repository. Try Open on GitHub again.');
      if (choice?.action === 'start') await actions['zero.startChange']();
      if (choice?.action === 'switch') await actions['zero.switchBranch']();
      if (choice?.action === 'create') {
        if (!auth.signedIn) await actions['zero.signInToGitHub']();
        await actions['zero.createRepository']();
      }
    },
    'zero.signInToGitHub': signIn,
    'zero.setupGitHub': async () => {
      if (disposed || isBusy()) return;
      signingIn = true;refresh();
      try {await prepareGitHub({openBrowser:true});}
      finally {signingIn=false;if(!disposed)refresh();}
    },
    'zero.createRepository': async () => {
      if (disposed || isBusy()) return;
      connecting=true;refresh();
      try {if(uploadMode()!=='live')return simulation('Create repository');return await githubProjects.createRepository();}
      finally {connecting=false;await repositoryStatus();refresh();}
    },
    'zero.newProject': async () => {
      if (disposed || isBusy()) return;
      startingTutorial=true;refresh();
      try {if(uploadMode()!=='live')return simulation('New project');return await githubProjects.newProject();}
      finally {startingTutorial=false;if(!disposed)refresh();}
    },
    'zero.chooseBranch': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      if (isBusy() || !branch || !repository.startsWith('https://github.com/')) return;
      const root = projectRoot, currentBranch = branch, currentRepository = repository;
      const choice = await quickPick(currentBranch === 'main' ? [{label:'New branch…', action:'start'}] : [{label:'Merge to main…', action:'finish'}], {title:`${currentRepository.replace('https://github.com/','')} · ${currentBranch}`});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || branch !== currentBranch || repository !== currentRepository) return;
      await change(choice.action);
    },
    'zero.startChange': () => change('start'),
    'zero.finishChange': () => change('finish'),
    'zero.switchBranch': async () => {
      if (isBusy()) return;
      changing = true; refresh();
      try {
        const root = await project();
        await lessonProjects.assertShareable(root);
        await core.assertRepositoryRoot(root);
        if (uploadMode(root) !== 'live') {simulation('Switch branch'); return;}
        const previous = await core.git(root, ['symbolic-ref', '--short', 'HEAD']).catch(() => '');
        const gitExtension = vscode.extensions?.getExtension('vscode.git');
        const gitApi = gitExtension && (gitExtension.isActive ? gitExtension.exports : await gitExtension.activate()).getAPI(1);
        const nativeRepository = gitApi?.getRepository(vscode.Uri.file(root));
        if (!nativeRepository || await fs.realpath(nativeRepository.rootUri.fsPath) !== root) throw new Error('Open this project in VS Code Source Control and enable the built-in Git extension, then try Switch branch again.');
        if (await project() !== root) return;
        if (!gitApi.repositories.some(candidate => candidate.rootUri.fsPath === nativeRepository.rootUri.fsPath)) throw new Error('This project was closed in Source Control. Reopen it, then try Switch branch again.');
        // Native Git owns branch selection and dirty-file/conflict recovery.
        // Pass the exact project URI instead of asking it to choose a repository.
        await vscode.commands.executeCommand('git.checkout', vscode.Uri.file(root));
        if (await project() !== root) return;
        await repositoryStatus();
        if (branch && branch !== previous) report(`Switched to ${branch}`);
      } finally {await repositoryStatus(); changing = false; refresh();}
    },
    // Retain the former native diagnostic command as a compatibility alias.
    'zero.runNativeApp': expectedRoot => actions['zero.runApp'](expectedRoot),
    'zero.stopApp': stopRequested,
    'zero.openFirstLesson': async () => {
      if (!(vscode.workspace.workspaceFolders || []).length) {await tutorials.open(undefined,'0');return;}
      const root = await project();
      if (await openFirstLesson(root)) {
        await context.workspaceState.update(`zero.firstLessonShown:${root}`, true);
      } else await tutorials.open(root);
    },
    'zero.startProject': async () => {
      if (disposed || isBusy()) return;
      startingTutorial=true;refresh();
      try {if(uploadMode()!=='live')return simulation('Start tutorial');return await githubProjects.startTutorial();}
      finally {startingTutorial=false;if(!disposed)refresh();}
    },
    'zero.cloneRepository': async () => {
      if (disposed || isBusy()) return;
      connecting = true; refresh();
      try {
        if(uploadMode()!=='live')return simulation('Clone from GitHub');
        if(!auth.signedIn)await auth.signIn();
        try {await rememberOpened({projectPath:await project()});}catch{}
        const choice=await projectPicker.choose();
        if(!choice||disposed)return;
        const assertCurrent=()=>auth.assertCurrent(choice.ticket);
        await assertCurrent();
        if(choice.action==='recent')await projectFolders.openLocal({projectPath:choice.projectPath,assertCurrent});
        else await projectFolders.clone({repositoryUrl:choice.repositoryUrl,assertCurrent});
      } catch (error) {
        if (error?.name !== 'Canceled' && error?.name !== 'CancellationError') {output.appendLine(error.message);throw new Error(`Could not clone this repository. ${error.message} Check Zero’s GitHub access, then try Clone from GitHub again.`);}
      } finally {connecting = false; if (!disposed) refresh();}
    },
    'zero.openLocalProject': async () => {
      if (disposed || isBusy()) return;
      connecting = true; refresh();
      try {await projectFolders.openLocal();}
      finally {connecting = false; if (!disposed) refresh();}
    },
    'zero.browseZeroHub': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      if (isBusy()) return;
      const root = projectRoot;
      const choice = await quickPick([
        {label:'Projects', description:'Browse shared games', action:'projects'},
        {label:'Libraries', description:'Inspect libraries and exact versions', action:'libraries'},
        ...(githubReady() && originalWork ? [{label:'Share project', action:'share'}] : [])
      ], {title:'ZeroHub'});
      if (isBusy()) return;
      if (choice?.action === 'projects' && !(await vscode.env.openExternal(vscode.Uri.parse('https://zero.codepet.ca/hub?kind=game')))) {
        throw new Error('Could not open ZeroHub. Open https://zero.codepet.ca/hub in your browser.');
      }
      if (choice?.action === 'libraries') await actions['zero.browseHub']();
      if (choice?.action === 'share') {
        await repositoryStatus();
        if (isBusy() || projectRoot !== root || !auth.signedIn || !originalWork) return;
        await actions['zero.shareGame']();
      }
    },
    'zero.showOutput': () => output.show(true),
    'zero.showProblems': () => vscode.commands.executeCommand('workbench.actions.view.problems'),
    'zero.showSidebar': async () => {
      await vscode.commands.executeCommand('workbench.view.explorer');
      await vscode.commands.executeCommand('zero.controls.focus');
      if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    },
    'zero.uploadToGitHub': () => uploadProject(),
    'zero.connectRepository': async () => {
      if (isBusy()) return;
      connecting = true; refresh();
      try {
        const root = await project();
        await lessonProjects.assertShareable(root);
        const value = await vscode.window.showInputBox({title:'GitHub repository URL', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
        if (!value) return;
        if (await project() !== root) throw new Error('The student project changed. Connect the repository again.');
        const result = await core.connectRepository(root, value, async () => (await vscode.window.showWarningMessage('Replace this student project’s existing origin remote with the repository you entered?', {modal:true}, 'Replace origin')) === 'Replace origin');
        if (result) { await repositoryStatus(); report('Repository connected', 'Repository connected locally. No files uploaded.'); }
      } finally {await repositoryStatus(); connecting = false; refresh();}
    },
    'zero.copyRepositoryLink': async () => {
      if (isBusy()) return;
      const root = await project();
      await core.assertRepositoryRoot(root);
      const {page} = core.parseRepositoryUrl(await core.git(root, ['remote','get-url','origin']));
      await vscode.env.clipboard.writeText(page);
      report('Repository link copied', 'Repository link copied. Paste it into Pika when submitting.');
    },
    'zero.showSetup': createSetupHelp(vscode,{project,output,run:root => actions['zero.runApp'](root),testInstallation:async()=>{const root=await findSetupProject();await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(root),{forceNewWindow:true});},uploadMode})
  };
  const webCacheRoot=context.globalStorageUri ? path.join(context.globalStorageUri.fsPath,'web-compiler') : undefined;
  const savedBuilder=createProjectBuilder({isTrusted:()=>vscode.workspace.isTrusted===true});
  const savedProblems=vscode.languages?.createDiagnosticCollection('zero-browser-compatibility');
  const relevantSource=uri=>{
    if(!savedChecksRoot||!uri?.fsPath?.startsWith(savedChecksRoot+path.sep))return false;
    const relative=path.relative(savedChecksRoot,uri.fsPath).split(path.sep).join('/');
    return /^(?:src\/main\/(?:java|resources)\/|libraries\/|\.zero-build\/|\.mvn\/|(?:pom\.xml|mvnw|mvnw\.cmd|zero-core\.json|zero-libraries\.json|zero\.json)$)/.test(relative);
  };
  const hasDirtySource=()=>Boolean(vscode.workspace.textDocuments?.some(document=>document.isDirty&&relevantSource(document.uri)));
  const sourceChanged=uri=>{if(relevantSource(uri))savedChecks?.changed({dirty:hasDirtySource()});};
  for(const [method,callback]of [['onDidChangeTextDocument',event=>sourceChanged(event.document.uri)],['onDidSaveTextDocument',document=>sourceChanged(document.uri)],['onDidCloseTextDocument',document=>sourceChanged(document.uri)]]){
    const subscription=vscode.workspace[method]?.(callback);if(subscription)context.subscriptions.push(subscription);
  }
  const sourceWatcher=vscode.workspace.createFileSystemWatcher('**/*');
  for(const method of ['onDidCreate','onDidChange','onDidDelete'])sourceWatcher[method]?.(sourceChanged,undefined,context.subscriptions);
  context.subscriptions.push(sourceWatcher,{dispose(){savedChecksEnableGeneration++;savedPreparation?.abort();savedChecks?.dispose();savedProblems?.dispose();}});
  actions['zero.enableBrowserChecks']=async()=>{
    if(isBusy())return;
    const attempt=++savedChecksEnableGeneration,controller=new AbortController();savedPreparation=controller;maintenanceBusy=true;refresh();
    const current=()=>!disposed&&attempt===savedChecksEnableGeneration&&!controller.signal.aborted;
    try{
      const root=await runnableProject();if(!current())return;
      if(vscode.workspace.isTrusted!==true)throw Error('Trust your own project before enabling its saved browser tooling.');
      if(!await vscode.workspace.saveAll(false))throw Error('Save your files before preparing browser checks.');
      if(!current())return;
      savedChecks?.dispose();savedChecks=undefined;savedChecksRoot=root;savedChecksState={status:'unavailable',message:'Preparing verified dependencies for browser checks.'};savedProblems?.clear();refresh();
      const work=async(progress,token)=>{const listener=token?.onCancellationRequested(()=>controller.abort());
        try{await savedBuilder.prepareBrowserChecks({projectRoot:root,cacheRoot:webCacheRoot,explicitAction:true,signal:controller.signal,onProgress:message=>{if(!current())return;output.appendLine(message);progress?.report({message:String(message)});}});}finally{listener?.dispose();}};
      if(vscode.window.withProgress)await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Prepare browser checks for this project',cancellable:true},work);else await work();
      if(!current())return;const selected=await project();if(!current()||selected!==root)return;
      const host=createSavedSourceHost({projectRoot:root,cacheRoot:webCacheRoot,builder:savedBuilder});
      const checks=createSavedSourceStatus({...host,isTrusted:()=>!disposed&&vscode.workspace.isTrusted===true&&projectRoot===root,onChange:next=>{
        if(disposed||savedChecksRoot!==root)return;savedChecksState=next;savedProblems?.clear();
        if(next.status==='unsupported'&&savedProblems){const grouped=new Map();
          for(const entry of sourceDiagnostics((next.diagnostics||[]).map(item=>item.message).join('\n'),root)){
            const position=new vscode.Position(Math.max(0,entry.line-1),Math.max(0,entry.column-1)),item=new vscode.Diagnostic(new vscode.Range(position,position),entry.message,vscode.DiagnosticSeverity.Error);item.source='Zero saved-source browser check';
            if(!grouped.has(entry.file))grouped.set(entry.file,[]);grouped.get(entry.file).push(item);
          }
          for(const [file,items]of grouped)savedProblems.set(vscode.Uri.file(file),items);
        }
        refresh();
      }});
      savedChecks=checks;await checks.enable({explicitAction:true});if(!current()){checks.dispose();return;}
      checks.changed({dirty:hasDirtySource(),reason:'Saved source ready for checking.'});await checks.flush();
    }catch(error){if(current()&&error.name!=='AbortError')throw error;}
    finally{if(savedPreparation===controller)savedPreparation=undefined;maintenanceBusy=false;refresh();}
  };
  actions['zero.disableBrowserChecks']=()=>{
    savedChecksEnableGeneration++;savedPreparation?.abort();savedChecks?.disable();savedProblems?.clear();
    if(!savedChecks)savedChecksState={status:'unavailable',message:'Browser checks are disabled.'};refresh();
  };

  const buildWithSavedProject=options=>savedBuilder.ensureValidatedExport({...options,explicitAction:true});
  const validateWithSavedProject=options=>savedBuilder.validateExport({...options,explicitAction:true});
  const runnableProject=async()=>{const root=await project();await core.assertTutorialRepository(root);return root;};
  const browserRun=createBrowserRunCommands(vscode,{project:runnableProject,output,ensureValidatedExport:buildWithSavedProject,validateExport:validateWithSavedProject,validateRetainedExport:savedBuilder.validateRetainedExport,isBusy,setBusy:value=>{browserBusy=value;refresh();},setActive:value=>{browserActive=value;refresh();},setFailed:value=>{buildFailed=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot,beforeRun:stopRequested,preferredPreviewColumn:root=>tutorials.columnFor(root)});
  Object.assign(actions,browserRun.commands);
  actions['zero.runApp']=expectedRoot=>{
    if (stopPromise) return stopPromise;
    if (isBusy()) return Promise.resolve();
    browserRun.stop({quiet:true});
    return queuedRun(expectedRoot);
  };
  actions['zero.stopApp']=()=>{
    if (stopPromise) return stopPromise;
    stopPromise=Promise.resolve().then(async()=>{
      browserRun.stop();
      await Promise.all([stopRequested(),browserRun.whenIdle(),nativeIdle()]);
    }).finally(()=>{stopPromise=undefined;refresh();});
    refresh();return stopPromise;
  };
  actions['zero.toggleApp']=()=>{
    if (stopPromise) return stopPromise;
    if (execution || pendingLaunch || nativeStarting || browserActive || browserBusy) return actions['zero.stopApp']();
    if (!isBusy()) return actions['zero.runApp']();
  };
  context.subscriptions.push(...browserRun.disposables);
  const webPublish=createWebPublishCommands(vscode,{project,authentication:auth,repositories,isSimulation:root=>uploadMode(root)!=='live',isBusy,setBusy:value=>{publishingWeb=value;refresh();},setState:text=>{state=text;refresh();},output,workspaceState:context.workspaceState,cacheRoot:webCacheRoot,localBuild:buildWithSavedProject,validateExport:validateWithSavedProject,assertBuildInputsAtCommit:savedBuilder.assertBuildInputsAtCommit,uploadChanges:(uploadAuth,options)=>uploadProject(uploadAuth,options)});
  Object.assign(actions,webPublish.commands);
  context.subscriptions.push(...webPublish.disposables);
  const sharingHandoff=async(root,action)=>{
    if(await project()!==root)throw new Error('The project changed. Prepare sharing again.');
    componentBusy=false;
    try {return await action();} finally {componentBusy=true;refresh();}
  };
  const assets=createAssetCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output});
  const fileCreation=createFileCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output});
  Object.assign(actions,fileCreation.commands);
  context.subscriptions.push(fileCreation);
  const recovery=createRecoveryCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output});
  Object.assign(actions,assets.commands,recovery.commands);
  context.subscriptions.push(assets,recovery);
  const sharing=createSharingEditor(vscode,{project,auth,output,isBusy,setState:report,verifiedPublication:webPublish.verifiedPublication,uploadForSharing:root=>sharingHandoff(root,()=>uploadProject()),publishForSharing:root=>sharingHandoff(root,()=>webPublish.publish()),setBusy:value=>{componentBusy=value;refresh();}},{kitConfiguration:readKitConfiguration(context.extensionPath || path.resolve(__dirname,'..'))});
  Object.assign(actions, sharing.commands);
  context.subscriptions.push(...sharing.disposables);
  const webExport=createWebExportCommands(vscode,{project:runnableProject,output,ensureValidatedExport:buildWithSavedProject,validateExport:savedBuilder.validateRetainedExport,setAvailable:root=>{exportReadyRoot=root;},publish:()=>webPublish.publish(),openPreview:(root,result)=>browserRun.preview(root,result,{retained:true}),isBusy,setBusy:value=>{exportingWeb=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot});
  Object.assign(actions,webExport.commands);
  context.subscriptions.push(...webExport.disposables);
  for (const [id, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
    try {await action();} catch(error) {
      const message = error.zeroRunMessage || error.message;
      state = /^GitHub sign-in was cancelled or unavailable\./.test(message) ? 'GitHub sign-in cancelled or unavailable. Try again.' : message;refresh();output.appendLine(error.message);
      const installUrl=appConfiguration&&`https://github.com/apps/${appConfiguration.slug}/installations/new`;
      if(installUrl && error.actionUrl===installUrl){
        void githubReadiness.refresh();
        const choice=await vscode.window.showErrorMessage(`Zero: ${state}`,'Open GitHub');
        if(choice==='Open GitHub'&&!disposed)await vscode.env.openExternal(vscode.Uri.parse(installUrl));
      }else if(error.code==='creation-uncertain'&&typeof error.repositoryUrl==='string'){
        const destination=core.parseRepositoryUrl(error.repositoryUrl);
        const prior=context.globalState?.get('zero.repositoryCreationRecovery');
        await context.globalState?.update('zero.repositoryCreationRecovery',{...(prior?.repositoryUrl===destination.page?prior:{}),repositoryUrl:destination.page,at:Date.now()});
        vscode.window.showErrorMessage(`Zero: ${state} Use Zero: Repository Actions → Resume created project to continue.`);
      }else vscode.window.showErrorMessage(`Zero: ${state}`);
    }
  }));
  function render(webview) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const disabled = isBusy() ? 'disabled' : '';
    const connected = repository.startsWith('https://github.com/');
    const ready = githubReady();
    const phase = auth.signedIn ? githubReadiness.phase : 'signed-out';
    const repoName = connected ? repository.slice('https://github.com/'.length) : projectRoot ? path.basename(projectRoot) : 'Project';
    const repoControl = `<button class="repo-choice" data-command="zero.chooseRepository" title="${escape(connected ? repository : 'Project actions')}" aria-label="${escape(`Project: ${repoName}. Open project actions`)}" aria-haspopup="dialog" ${disabled}><span class="repo-label">${escape(repoName).replace('/', '/<wbr>')}</span>${icon('ChevronDown')}</button>`;
    const branchControl = auth.signedIn && connected && (branch || branchDetached) ? `<div class="branch-row"><span class="branch" title="${escape(branch ? `Current branch: ${branch}` : 'Detached HEAD. Use Switch branch in repository actions.')}">${icon('GitBranch')}${escape(branch || 'Detached HEAD')}</span>${auth.signedIn && branch && branch !== 'main' ? `<button class="link change" data-command="zero.finishChange" ${disabled}>Merge to main</button>` : ''}</div>` : '';
    const githubActions = connected && auth.signedIn ? `<button class="secondary upload" data-command="zero.uploadToGitHub" ${uploadProgress ? 'aria-busy="true"' : ''} ${disabled}>${uploadProgress ? '<span class="busy-indicator" aria-hidden="true"></span>' : icon('CloudUpload')}${uploadProgress ? escape(uploadProgress) : 'Commit &amp; push'}</button>${uploadMode() === 'live' ? '' : '<p class="badge">Simulation — nothing will be uploaded</p>'}` : '';
    const repositoryWarning = auth.signedIn && !connected && repository !== 'No repository connected' ? `<p class="muted status">${escape(repository)}</p>` : '';
    const published = context.workspaceState?.get('zero.webPublish.lastLive');
    const publishedActions = auth.signedIn && connected && uploadMode() === 'live' && published && published.root === projectRoot && published.account === auth.accountId && published.resume?.repository === repository ? `<div class="row"><button class="link" data-command="zero.openPublishedWeb" ${disabled}>Open app</button><button class="link" data-command="zero.copyPublishedWebLink" ${disabled}>Copy playable link</button></div>` : '';
    const exportActions = projectRoot && exportReadyRoot === projectRoot ? `<div class="row"><button class="link" data-command="zero.previewWebExport" ${disabled}>Preview export</button><button class="link" data-command="zero.saveWebExport" ${disabled}>Save ZIP</button><button class="link" data-command="zero.shareWebExport" ${disabled}>Share export…</button></div>` : '';
    const browserCheckStatus=savedChecksRoot===projectRoot&&savedChecksState?`<p class="muted status" title="${escape(savedChecksState.message||'')}">Browser checks: ${escape(savedChecksState.status)}</p>`:'';
    const browserAction = browserActive && !stopPromise && browserRun.canOpenInBrowser ? `<button class="secondary browser-open" data-command="zero.openRunningAppInBrowser" title="Open in browser" aria-label="Open in browser" ${disabled}>${icon('ExternalLink')}</button>` : '';
    const githubPanel = !ready || !projectRoot ? '' : `<div class="context-row">${repoControl}</div>${localPractice ? '<p class="muted">Local practice · no GitHub sharing</p>' : `${repositoryWarning}${branchControl}${githubActions}${publishedActions}`}`;
    const fileActions=projectRoot ? `<h2 id="files-heading"><button id="files-menu-button" class="link files-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="files-menu" ${disabled}>New${icon('ChevronDown')}</button></h2><div id="files-menu" class="files-dropdown" role="menu" aria-labelledby="files-menu-button" hidden>${[['zero.newClass','New class…'],['zero.newFile','New file…'],['zero.newFolder','New folder…'],['zero.importAssets','New asset…'],...(assets.canCopyPaths() ? [['zero.copyImportedAssetPaths','Copy asset paths']] : [])].map(([command,label])=>`<button role="menuitem" tabindex="-1" data-command="${command}" ${disabled}>${label}</button>`).join('')}</div>` : '';
    const activeRun = execution || pendingLaunch || nativeStarting || browserActive || browserBusy;
    const setupCheck = projectRoot && isSetupProject(projectRoot);
    const runLabel = stopPromise ? 'Stopping…' : activeRun ? 'Stop' : setupCheck ? 'Run test' : 'Run';
    const runDisabled = stopPromise ? 'aria-disabled="true"' : !activeRun && isBusy() ? 'disabled' : '';
    const publishMenu = !setupCheck && ready && auth.signedIn && connected ? `<button id="run-menu-button" class="run-menu-button" aria-label="Run options" title="Run options" aria-haspopup="menu" aria-expanded="false" aria-controls="run-menu" ${isBusy() || activeRun ? 'disabled' : ''}>${icon('ChevronDown')}</button><div id="run-menu" class="files-dropdown run-dropdown" role="menu" aria-labelledby="run-menu-button" hidden><button role="menuitem" tabindex="-1" data-command="zero.publishWeb" ${isBusy() || activeRun ? 'disabled' : ''}>Publish app</button></div>` : '';
    const runControl = `<div class="run-split"><button class="${ready ? 'run' : 'secondary'}" data-command="zero.toggleApp" ${runDisabled}>${icon(activeRun || stopPromise ? 'Square' : 'Play')}${runLabel}</button>${publishMenu}</div>`;
    const controls = !projectRoot ? `<button class="link" data-command="zero.startPage" ${disabled}>Open Start Page</button>` : `${setupCheck ? '<p class="muted">Installation test · Hello World</p>' : ''}${!ready ? `<button class="link" data-command="zero.startPage" ${disabled}>GitHub setup</button>` : ''}<div class="main-controls"><div class="run-controls">${runControl}${browserAction}</div>${exportActions}${browserCheckStatus}</div>${ready ? `<section class="repository">${githubPanel}</section>` : ''}<section class="hub-actions"><button class="link hub" data-command="zero.browseZeroHub" aria-haspopup="dialog" ${disabled}>ZeroHub</button></section>`;
    // Keep the controls document alive across progress updates; VS Code owns the file tree.
    if (renderedWebview === webview && webview.postMessage) {
      void webview.postMessage({type:'sidebar.update',controls,fileActions,status:state,failed:buildFailed}); return;
    }
    renderedWebview = webview;
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">${sidebarStyles()}</style></head><body><div id="controls">${controls}</div><div class="feedback"><p id="run-status" class="muted status" role="status" aria-live="polite">${escape(state)}</p><div id="recovery" ${buildFailed ? '' : 'hidden'}>${buildFailed ? '<button class="link" data-command="zero.showProblems">Show Problems</button><button class="link" data-command="zero.showOutput">Show Output</button>' : ''}</div></div><div id="file-actions" class="file-actions">${fileActions}</div><script nonce="${nonce}">${sidebarScript()}</script></body></html>`;
  }
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('zero.controls', {resolveWebviewView(candidate) {
    view = candidate; candidate.webview.options = {enableScripts:true, localResourceRoots:[]};
    candidate.webview.onDidReceiveMessage(message => {
      if (!message || typeof message !== 'object' || disposed) return;
      if (message.type === 'sidebar.ready') {refresh();return;}
      if (Object.hasOwn(actions, message.command)) vscode.commands.executeCommand(message.command);
    }, undefined, context.subscriptions);
    candidate.onDidDispose(() => {if(view === candidate) {view = undefined; renderedWebview = undefined;}}, undefined, context.subscriptions); refresh(); repositoryStatus();
  }}));
  context.subscriptions.push(output);
  const watcher = vscode.workspace.createFileSystemWatcher('**/zero.json');
  for(const method of ['onDidCreate','onDidChange','onDidDelete']) watcher[method](uri=>{if(path.basename(uri.fsPath)==='zero.json')browserRun.stop();},undefined,context.subscriptions);
  const metadataWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,config}');
  for (const method of ['onDidCreate','onDidChange','onDidDelete']) metadataWatcher[method](uri => {
    if (!projectRoot) return;
    const filename = path.resolve(uri.fsPath);
    if (['HEAD','config'].some(name => filename === path.join(projectRoot, '.git', name))) void repositoryStatus();
  }, undefined, context.subscriptions);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {if (event.affectsConfiguration('zero.uploadMode')) refresh();}));
  // The Start Page owns onboarding; authentication remains explicit and local work stays available.
  const startup = auth.refresh().catch(error => {
    if (!disposed) output.appendLine(`Getting started: ${error.message}`);
  });
  if (!(vscode.workspace.workspaceFolders || []).length) void introduceProject().catch(error=>output.appendLine(`Start Page: ${error.message}`));
  const introduceAfterConnection = () => startup.then(async() => {if (!disposed) {try {await rememberOpened({projectPath:await project()});}catch{}await projectWindow.restore();await introduceProject();}}).catch(error => output.appendLine(`Getting started: ${error.message}`));
  context.subscriptions.push(watcher, metadataWatcher, vscode.workspace.onDidChangeWorkspaceFolders(() => {
    runGeneration++;
    if (execution || pendingLaunch || nativeStarting) void actions['zero.stopApp']().catch(error => output.appendLine(error.message));
    savedChecksEnableGeneration++;savedPreparation?.abort();savedChecks?.dispose();savedChecks=undefined;savedChecksRoot=undefined;savedChecksState=undefined;savedProblems?.clear();
    projectRoot = undefined; repositoryStatus(); void introduceAfterConnection();
  }));
  context.subscriptions.push({dispose:() => {runGeneration++;if (execution) execution.terminate();}});
  context.subscriptions.push(createNativeUpdateReload(vscode, {context,
    isBusy:()=>disposed || isBusy() || auth.busy || Boolean(appProvider?.busy || execution || pendingLaunch || nativeStarting || browserActive),
    log:message=>output.appendLine(message)}));
  void introduceAfterConnection();
}
module.exports = {activate};
