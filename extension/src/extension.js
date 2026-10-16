'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./core');
const lessonProjects = require('./lesson-projects');
const github = require('./github');
const workflow = require('./workflow');
const {createAuthentication} = require('./authentication');
const {createWelcome} = require('./welcome');
const {selectUploadAuthentication} = require('./web-publish-upload-auth');
const {createTransport} = require('./transport');
const {createSharingEditor} = require('./sharing/editor');
const {readKitConfiguration} = require('./sharing/configuration');
const {createSetupHelp} = require('./setup');
const {createNativeUpdateCommands} = require('./native-updates');
const {createWebExportCommands} = require('./web-export-ui');
const {createBrowserRunCommands} = require('./web-run-ui');
const {createTutorialReader} = require('./tutorial-reader');
const {createWebPublishCommands} = require('./web-publish-ui');
const {sidebarStyles} = require('./sidebar-style');
const {createSidebarFiles} = require('./sidebar-files');
const {createSidebarBridge} = require('./sidebar-bridge');
const {sidebarScript} = require('./sidebar-script');
const {icon} = require('./sidebar-icons');
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function activate(context) {
  for (const [id, action] of Object.entries(createNativeUpdateCommands(vscode))) {
    context.subscriptions.push(vscode.commands.registerCommand(id, action));
  }
  const output = vscode.window.createOutputChannel('Zero');
  let execution, ending, view, pendingLaunch;
  let runGeneration = 0;
  let uploading = false;
  let connecting = false;
  let startingTutorial = false;
  let signingIn = false;
  let disposed = false;
  context.subscriptions.push({dispose() { disposed = true; }});
  let changing = false;
  let menuOpen = false;
  let componentBusy = false;
  let exportingWeb = false;
  let browserBusy = false;
  let browserActive = false;
  let publishingWeb = false;
  let exportReadyRoot;
  let branch = '';
  let branchDetached = false;
  let statusGeneration = 0;
  const isBusy = () => uploading || connecting || startingTutorial || signingIn || changing || menuOpen || componentBusy || exportingWeb || publishingWeb || browserBusy;
  let projectRoot;
  let renderedWebview;
  let fileRefreshTimer;
  const uploadMode = (root = projectRoot) => root ? vscode.workspace.getConfiguration('zero', vscode.Uri.file(root)).get('uploadMode', 'live') : 'live';
  let runQueue = Promise.resolve();
  let state = '';
  let buildFailed = false;
  const stoppedTasks = new WeakSet();
  const taskExitCodes = new WeakMap();
  let repository = 'No repository connected';
  let localPractice = false;
  let originalWork = false;
  const project = async () => {
    originalWork = false;
    projectRoot = await core.resolveProject((vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath));
    localPractice = await lessonProjects.isLocalPractice(projectRoot);
    originalWork = !localPractice && !await lessonProjects.tutorialMarker(projectRoot);
    return projectRoot;
  };
  const refresh = () => { if (view) render(view.webview); };
  const report = (text, detail = text) => {state=text;output.appendLine(detail);refresh();};
  const tutorials = createTutorialReader(vscode,{context,output,project});
  context.subscriptions.push(tutorials);
  const hasOpenEditors = () => Boolean(vscode.window.activeTextEditor) || Boolean(vscode.window.tabGroups?.all.some(group => group.tabs.length));
  async function openFirstLesson(root, onlyWhenEmpty = false) {
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
    const root = await project();
    if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    if (!context.workspaceState.get('zero.sidebarShown')) {
      await actions['zero.showSidebar']();
      await context.workspaceState.update('zero.sidebarShown', true);
    }
    const key = `zero.firstLessonShown:${root}`;
    // Preserve text editors and non-text tabs, including other lesson previews.
    if (!context.workspaceState.get(key) && !hasOpenEditors() && await openFirstLesson(root, true)) await context.workspaceState.update(key, true);
  }
  const auth = createAuthentication(vscode.authentication, refresh);
  context.subscriptions.push(auth);
  async function assertAccountAllowed() {
    // Connecting a native account needs no project. Retain local-practice
    // restrictions whenever a workspace is open, including damaged markers.
    if (vscode.workspace.workspaceFolders?.length) await lessonProjects.assertShareable(await project());
  }
  async function signIn(changeAccount = auth.signedIn) {
    if (disposed || isBusy()) return;
    signingIn = true; refresh();
    try {
      await assertAccountAllowed();
      if (disposed) return;
      void vscode.window.showInformationMessage('VS Code will sign you into GitHub. Zero requests repository access (repo), including private repositories, so live uploads can use your chosen repository. VS Code stores the sign-in; Zero keeps no password or token file.');
      await auth.signIn(changeAccount);
      if (!disposed) state = auth.status;
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
    if (!execution) {state = 'App stopped'; refresh();}
  }
  async function stopRequested() {
    runGeneration++;
    if (pendingLaunch) await pendingLaunch.catch(() => {});
    await stop();
    state = 'App stopped'; refresh();
  }
  async function makeTask(root, definition = {type:'zero',task:'native-run'}, scope = vscode.TaskScope.Workspace) {
    await core.assertTutorialRepository(root);
    const spec = core.runSpecification(root);
    await fs.access(spec.command);
    const processExecution = spec.shell
      ? new vscode.ShellExecution({value: spec.command, quoting: vscode.ShellQuoting.Strong}, spec.args, {cwd: root})
      : new vscode.ProcessExecution(spec.command, spec.args, {cwd: root});
    const task = new vscode.Task(definition, scope, 'Run Native App (diagnostic)', 'Zero', processExecution, '$zero-java');
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
    state = 'Building / running app — output is in the terminal'; refresh();
  }
  context.subscriptions.push(vscode.tasks.onDidStartTask(event => {
    if (event.execution.task.definition.type === 'zero' && event.execution.task.definition.task === 'native-run') track(event.execution);
  }), vscode.tasks.onDidEndTask(event => {
    const finish = taskFinishes.get(event.execution);
    if (!finish) return;
    taskFinishes.delete(event.execution); finish();
    if (execution === event.execution) {
      execution = undefined;
      buildFailed = !stoppedTasks.has(event.execution) && typeof taskExitCodes.get(event.execution) === 'number' && taskExitCodes.get(event.execution) !== 0;
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
      if (configured.definition.task === 'run') {
        return new vscode.Task(configured.definition, configured.scope, 'Run App', 'Zero', new vscode.CustomExecution(async () => {
          const closed=new vscode.EventEmitter();
          let ticket,settled=false;
          return {onDidClose:closed.event,open(){const running=browserRun.run();ticket=browserRun.generation;void running.then(()=>{settled=true;closed.fire(0);},error=>{settled=true;output.appendLine(error.message);closed.fire(1);});},close(){if(!settled && ticket===browserRun.generation)browserRun.stop();closed.dispose();}};
        }));
      }
      if (configured.definition.task !== 'native-run') return undefined;
      browserRun.stop({quiet:true});
      const generation = runGeneration;
      await stop();
      if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
      const root=await project();await core.assertTutorialRepository(root);
      const task = await makeTask(root, configured.definition, configured.scope);
      if (generation !== runGeneration) return undefined;
      task.group = configured.group || vscode.TaskGroup.Build;
      return task;
    }
  }));
  async function run(generation, expectedRoot) {
    if (generation !== runGeneration) return;
    await stop();
    const root = await project();
    if (expectedRoot && root !== expectedRoot) throw new Error('The student project changed before running the dependency update. Run the original app explicitly.');
    await core.assertTutorialRepository(root);
    if (generation !== runGeneration) return;
    if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
    const task = await makeTask(root);
    if (expectedRoot && await project() !== expectedRoot) throw new Error('The student project changed during run preparation. Run the original app explicitly.');
    if (generation !== runGeneration) return;
    pendingLaunch = vscode.tasks.executeTask(task).then(active => {track(active); return active;});
    try {await pendingLaunch;} finally {pendingLaunch = undefined;}
  }
  function queuedRun(expectedRoot) {
    const generation = runGeneration;
    const next = runQueue.then(() => run(generation,expectedRoot));
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
        name = await vscode.window.showInputBox({title:'New branch', prompt:'Create a branch for your next feature. Use lowercase words and dashes.', placeHolder:'add-score', validateInput:value => /^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : 'Use lowercase letters, numbers and dashes, starting with a letter or number.'});
        if (!name) return;
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Use lowercase letters, numbers and dashes for your change name.');
      }
      const ticket = await auth.capture();
      if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before reviewing the change.');
      const destination = await github.prepareUpload(root);
      const assertCurrent = () => auth.assertCurrent(ticket);
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
      state = kind === 'start' ? `Created ${result.branch}` : cleanupError ? 'Merged to main · local branch kept; see Output' : 'Merged to main';
      if (cleanupError) void vscode.window.showWarningMessage(state);
      else report(state, kind === 'start' ? `Started ${result.branch}. Make your changes, then Commit & push.` : `Merged ${result.finishedBranch} to main and pushed ${result.head}. Finished local branch deleted.`);
    } catch(error) {if (error.conflict) await conflictHelp(); throw error;}
    finally {await repositoryStatus(); changing = false; refresh();}
  }
  async function uploadProject(uploadAuth = auth) {
      if (isBusy()) return;
      uploading = true; refresh();
      let selectedAuth;
      try {
        const root = await project();
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
          if(await project()!==root)throw new Error('The student project changed. Review the upload again.');
          if(uploadMode(root)!=='live')throw new Error('Live uploads were disabled. Review the upload again.');
        };
        const plan = await github.prepareUpload(root);
        selectedAuth=await selectUploadAuthentication({root,authentication:uploadAuth,initialTicket,provider:vscode.authentication,assertCurrentProject});
        const ticket=selectedAuth.ticket, activeAuth=selectedAuth.authentication;
        const message = await vscode.window.showInputBox({title:'Commit & push', prompt:`${plan.page} · ${plan.branch}`, placeHolder:'Describe your changes', value:'Update my app', validateInput:value => value.trim() && !value.includes('\0') ? undefined : 'Describe your changes in a short message.'});
        if (!message) return;
        if (await project() !== root) throw new Error('The student project changed. Review the upload again.');
        const assertCurrent = async () => {await assertCurrentProject();return activeAuth.assertCurrent(ticket);};
        const result = await github.uploadPrepared(plan, message, {beforeUpload:assertCurrent, networkRun:createTransport(plan.remote, assertCurrent, {assertCurrentNow:() => activeAuth.assertCurrentNow(ticket)}), onProgress:text => {state=text; refresh();}});
        await repositoryStatus();
        report(`Pushed to ${result.branch}`, `Pushed ${result.head} to ${result.branch}. Copy your repository link for Pika.`);
        return result;
      } finally {selectedAuth?.dispose();await repositoryStatus(); uploading = false; refresh();}
  }
  const actions = {
    'zero.getStarted': () => welcome.show(true),
    'zero.githubAccount': async () => {
      if (isBusy()) return;
      await assertAccountAllowed();
      if (!auth.signedIn) return actions['zero.signInToGitHub']();
      const choice = await quickPick([
        {label:'Change GitHub account…', action:'change'},
        {label:'Sign out…', description:'Use VS Code’s Accounts controls', action:'signOut'}
      ], {title:`GitHub: ${auth.accountLabel}`, placeHolder:'Choose an account action'});
      if (isBusy()) return;
      if (choice?.action === 'change') await actions['zero.signInToGitHub']();
      if (choice?.action === 'signOut') {
        const available = await vscode.commands.getCommands(true);
        if (isBusy()) return;
        if (available.includes('workbench.action.manageAccounts')) {
          await vscode.commands.executeCommand('workbench.action.manageAccounts');
        } else {
          void vscode.window.showInformationMessage('Open VS Code’s Accounts menu, select your GitHub account and choose Sign Out. You can also update VS Code to use its Manage Accounts picker. Zero does not sign out other extensions itself.');
        }
      }
    },
    'zero.chooseRepository': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      const root = projectRoot;
      const tutorial = root && !localPractice && await lessonProjects.tutorialMarker(root);
      if (isBusy()) return;
      const connected = repository.startsWith('https://github.com/');
      const currentRepository = repository, currentBranch = branch;
      const items = connected ? [
        {label:'Open on GitHub', action:'open'},
        {label:'Copy repository link', description:'Submit the link separately in Pika', action:'copy'},
        ...(branch === 'main' ? [{label:'New branch…', action:'start'}] : []),
        {label:'Switch branch…', action:'switch'},
        ...(!tutorial ? [{label:'Connect another repository…', action:'connect'}] : [])
      ] : !root || tutorial || localPractice ? [
        {label:'Start tutorial…', action:'tutorial'}
      ] : [
        {label:'Create a repository…', description:'Open GitHub, then connect its link here', action:'create'},
        {label:'Connect an existing repository…', action:'connect'}
      ];
      items.push({label:'Clone repository…', action:'clone'});
      const choice = await quickPick(items, {title:connected ? repository : 'Repository', placeHolder:'Choose a repository action'});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || repository !== currentRepository || branch !== currentBranch) return;
      if (choice?.action === 'tutorial') await actions['zero.startProject']();
      if (choice?.action === 'clone') await actions['zero.cloneRepository']();
      if (choice?.action === 'connect') await actions['zero.connectRepository']();
      if (choice?.action === 'copy') await actions['zero.copyRepositoryLink']();
      if (choice?.action === 'open' && !await vscode.env.openExternal(vscode.Uri.parse(currentRepository))) throw new Error('Could not open the repository. Try Open on GitHub again.');
      if (choice?.action === 'start') await actions['zero.startChange']();
      if (choice?.action === 'switch') await actions['zero.switchBranch']();
      if (choice?.action === 'create') {
        if (!auth.signedIn) await actions['zero.signInToGitHub']();
        await actions['zero.createRepository']();
      }
    },
    'zero.signInToGitHub': signIn,
    'zero.createRepository': async () => {
      if (isBusy()) return;
      await lessonProjects.assertShareable(await project());
      if (!auth.signedIn) throw new Error('Sign in to GitHub first.');
      void vscode.window.showInformationMessage('Create your own empty GitHub repository: choose Public or Private, and leave README, .gitignore and license unselected. Use the same account shown in Zero. Then return here and choose Connect a repo → Connect an existing repository.');
      if (!(await vscode.env.openExternal(vscode.Uri.parse('https://github.com/new')))) throw new Error('Could not open GitHub. Open https://github.com/new in your browser, create an empty repository, then connect its link.');
    },
    'zero.chooseBranch': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      if (isBusy() || !branch || !repository.startsWith('https://github.com/')) return;
      const root = projectRoot, currentBranch = branch, currentRepository = repository;
      const choice = await quickPick(currentBranch === 'main' ? [{label:'New branch…', action:'start'}] : [{label:'Merge to main…', action:'finish'}], {title:`${currentRepository} · ${currentBranch}`, placeHolder:'Choose a change action'});
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
    'zero.runNativeApp': async () => {browserRun.stop({quiet:true});await queuedRun();},
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
      startingTutorial = true; refresh();
      try {
        const projects = await lessonProjects.loadBundle(context.extensionPath || path.resolve(__dirname,'..'));
        if (disposed) return;
        const choice = await quickPick(projects.map(item => ({label:item.title, description:`Lessons ${{greeting:'0–2',study:'3–7',game:'8–12'}[item.id]} · your GitHub repository`, project:item})), {title:'Start tutorial', placeHolder:'Choose a tutorial repository to create and clone'});
        if (disposed || !choice) return;
        if (!choice.project.template) throw new Error(`The ${choice.project.title} tutorial template is not published yet. Ask your teacher when it is available, then create YOUR repository from that template and choose Clone repository in Zero. No local project was created.`);
        const template = choice.project.template;
        const next = await vscode.window.showInformationMessage('Create your own tutorial repository, then clone it', {modal:true, detail:`On GitHub, use this template to create a repository under your own account. Copy YOUR new repository URL. Return to Zero and choose Clone repository, paste that URL, and open the cloned folder.\n\n${template.repositoryUrl}`}, 'Open template');
        if (disposed || next !== 'Open template') return;
        if (!await vscode.env.openExternal(vscode.Uri.parse(template.templateHref))) throw new Error('Could not open the published tutorial template. Try Start tutorial again.');
      } finally {startingTutorial = false; if (!disposed) refresh();}
    },
    'zero.cloneRepository': async () => {
      if (disposed || isBusy()) return;
      connecting = true; refresh();
      try {
        // VS Code owns the URL/destination pickers, authentication and opening.
        // A cancelled native picker is a normal completion, not clone success.
        await vscode.commands.executeCommand('git.clone');
      } catch (error) {
        if (error?.name !== 'Canceled' && error?.name !== 'CancellationError') throw new Error('Could not open Git: Clone. Check that Git is installed and VS Code’s built-in Git extension is enabled, then choose Clone repository again.');
      } finally {connecting = false; if (!disposed) refresh();}
    },
    'zero.browseZeroHub': async () => {
      if (isBusy()) return;
      const choice = await quickPick([
        {label:'Projects', description:'Browse complete examples and templates', action:'projects'},
        {label:'Libraries', description:'Inspect libraries and exact versions', action:'libraries'}
      ], {title:'ZeroHub', placeHolder:'What would you like to browse?'});
      if (isBusy()) return;
      if (choice?.action === 'projects' && !(await vscode.env.openExternal(vscode.Uri.parse('https://zero.codepet.ca/hub?kind=example')))) {
        throw new Error('Could not open ZeroHub. Open https://zero.codepet.ca/hub in your browser.');
      }
      if (choice?.action === 'libraries') await actions['zero.browseHub']();
    },
    'zero.showOutput': () => output.show(true),
    'zero.showProblems': () => vscode.commands.executeCommand('workbench.actions.view.problems'),
    'zero.showSidebar': async () => {
      await vscode.commands.executeCommand('workbench.view.extension.zero');
      if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    },
    'zero.uploadToGitHub': () => uploadProject(),
    'zero.connectRepository': async () => {
      if (isBusy()) return;
      connecting = true; refresh();
      try {
        const root = await project();
        await lessonProjects.assertShareable(root);
        const value = await vscode.window.showInputBox({title:'Connect your student repository', prompt:'Use your existing GitHub repository page URL. This changes only this project’s origin remote; no files are uploaded.', placeHolder:'https://github.com/you/your-app', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
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
    'zero.showSetup': createSetupHelp(vscode,{project,output,run:root => actions['zero.runApp'](root),uploadMode})
  };
  const webCacheRoot=context.globalStorageUri ? path.join(context.globalStorageUri.fsPath,'web-compiler') : undefined;
  const runnableProject=async()=>{const root=await project();await core.assertTutorialRepository(root);return root;};
  const browserRun=createBrowserRunCommands(vscode,{project:runnableProject,output,isBusy,setBusy:value=>{browserBusy=value;refresh();},setActive:value=>{browserActive=value;refresh();},setFailed:value=>{buildFailed=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot,beforeRun:stopRequested,preferredPreviewColumn:root=>tutorials.columnFor(root)});
  Object.assign(actions,browserRun.commands);
  actions['zero.stopApp']=async()=>{browserRun.stop();await stopRequested();};
  context.subscriptions.push(...browserRun.disposables);
  const webPublish=createWebPublishCommands(vscode,{project,authentication:auth,isSimulation:root=>uploadMode(root)!=='live',isBusy,setBusy:value=>{publishingWeb=value;refresh();},setState:text=>{state=text;refresh();},output,workspaceState:context.workspaceState,cacheRoot:webCacheRoot,uploadChanges:uploadAuth=>uploadProject(uploadAuth)});
  Object.assign(actions,webPublish.commands);
  context.subscriptions.push(...webPublish.disposables);
  const sharing=createSharingEditor(vscode,{project,auth,output,isBusy,setState:report,verifiedPublication:webPublish.verifiedPublication,setBusy:value=>{componentBusy=value;refresh();}},{kitConfiguration:readKitConfiguration(context.extensionPath || path.resolve(__dirname,'..'))});
  Object.assign(actions, sharing.commands);
  context.subscriptions.push(...sharing.disposables);
  const webExport=createWebExportCommands(vscode,{project:runnableProject,output,setAvailable:root=>{exportReadyRoot=root;},publish:()=>webPublish.publish(),openPreview:browserRun.preview,isBusy,setBusy:value=>{exportingWeb=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot});
  Object.assign(actions,webExport.commands);
  context.subscriptions.push(...webExport.disposables);
  for (const [id, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
    try {await action();} catch(error) {state = error.zeroRunMessage || error.message; refresh(); output.appendLine(error.message); vscode.window.showErrorMessage(`Zero: ${state}`);}
  }));
  function render(webview) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const disabled = isBusy() ? 'disabled' : '';
    const connected = repository.startsWith('https://github.com/');
    const accountTitle = auth.signedIn ? `Signed in as ${auth.accountLabel}` : 'Sign in to GitHub';
    const account = `<button class="account" data-command="zero.githubAccount" title="${escape(accountTitle)}" aria-label="${escape(accountTitle)}" aria-haspopup="dialog" ${disabled}>${auth.signedIn ? escape(auth.accountLabel) : 'Sign in'}</button>`;
    const repoName = connected ? repository.slice('https://github.com/'.length) : 'Repository';
    const repoControl = `<button class="repo-choice" data-command="zero.chooseRepository" title="${escape(connected ? repository : 'Repository actions')}" aria-label="${escape(`Repository: ${repoName}. Open repository actions`)}" aria-haspopup="dialog" ${disabled}>${escape(repoName)} ${icon('ChevronDown')}</button>`;
    const branchControl = connected && (branch || branchDetached) ? `<div class="branch-row"><span class="branch" title="${escape(branch ? `Current branch: ${branch}` : 'Detached HEAD. Use Switch branch in repository actions.')}">${icon('GitBranch')}${escape(branch || 'Detached HEAD')}</span>${auth.signedIn && branch && branch !== 'main' ? `<button class="link change" data-command="zero.finishChange" ${disabled}>Merge to main</button>` : ''}</div>` : '';
    const githubActions = connected && auth.signedIn ? `<button class="secondary upload" data-command="zero.uploadToGitHub" ${disabled}>${icon('CloudUpload')}Commit &amp; push</button>${uploadMode() === 'live' ? '' : '<p class="badge">Simulation — nothing will be uploaded</p>'}` : '';
    const repositoryWarning = auth.signedIn && !connected && repository !== 'No repository connected' ? `<p class="muted status">${escape(repository)}</p>` : '';
    const publishControl = `<button class="link" data-command="zero.publishWeb" ${disabled || (!auth.signedIn || !connected ? 'disabled' : '')} title="${auth.signedIn && connected ? 'Publish your pushed app to GitHub Pages' : 'Sign in and connect your repository to publish'}">${icon('Upload')}Publish app</button>`;
    const published = context.workspaceState?.get('zero.webPublish.lastLive');
    const publishedActions = auth.signedIn && connected && uploadMode() === 'live' && published?.root === projectRoot && published.account === auth.accountLabel && published.resume?.repository === repository ? `<div class="row"><button class="link" data-command="zero.openPublishedWeb" ${disabled}>Open app</button><button class="link" data-command="zero.copyPublishedWebLink" ${disabled}>Copy playable link</button></div>` : '';
    const exportActions = projectRoot && exportReadyRoot === projectRoot ? `<div class="row"><button class="link" data-command="zero.previewWebExport" ${disabled}>Preview export</button><button class="link" data-command="zero.saveWebExport" ${disabled}>Save ZIP</button><button class="link" data-command="zero.shareWebExport" ${disabled}>Share export…</button></div>` : '';
    const browserAction = browserActive && browserRun.canOpenInBrowser ? `<button class="link" data-command="zero.openRunningAppInBrowser" ${disabled}>${icon('ExternalLink')}Open in browser</button>` : '';
    const tutorialActions = projectRoot ? '' : `<button class="link" data-command="zero.startProject" ${disabled}>Start tutorial</button>`;
    const githubPanel = localPractice ? `<p class="muted">Local practice · no GitHub sharing</p>${repoControl}` : `${account}${tutorialActions}<div class="context-row">${repoControl}</div>${repositoryWarning}${branchControl}${githubActions}${publishControl}${publishedActions}`;
    const controls = `<div class="main-controls"><div class="row"><button class="run" data-command="zero.runApp">${icon('Play')}Run App</button><button class="secondary" data-command="zero.stopApp" ${execution || browserActive ? '' : 'disabled'}>${icon('Square')}Stop</button></div>${browserAction}${exportActions}</div><section class="repository">${githubPanel}</section><section class="hub-actions"><button class="link hub" data-command="zero.browseZeroHub" ${disabled}>${icon('ExternalLink')}Browse ZeroHub</button>${!originalWork || !auth.signedIn ? '' : `<button class="link share" data-command="zero.shareGame" ${disabled}>Share project ${icon('ArrowUpRight')}</button>`}</section>`;
    // Keep the webview document and file tree alive across progress updates.
    if (renderedWebview === webview && webview.postMessage) {
      void webview.postMessage({type:'sidebar.update',controls,status:state,failed:buildFailed}); return;
    }
    renderedWebview = webview;
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">${sidebarStyles()}</style></head><body><div id="controls">${controls}</div><div class="feedback"><p id="run-status" class="muted status" role="status" aria-live="polite">${escape(state)}</p><div id="recovery" ${buildFailed ? '' : 'hidden'}>${buildFailed ? '<button class="link" data-command="zero.showProblems">Show Problems</button><button class="link" data-command="zero.showOutput">Show Output</button>' : ''}</div></div><section class="files-section" aria-labelledby="files-heading"><h2 id="files-heading">Files</h2><div id="files" role="tree" aria-label="Project files" data-chevron-icon="${escape(icon('ChevronDown'))}" data-folder-icon="${escape(icon('Folder'))}" data-file-icon="${escape(icon('File'))}"></div><p id="file-status" class="muted status" role="status" aria-live="polite"></p></section><script nonce="${nonce}">${sidebarScript()}</script></body></html>`;
  }
  const files = createSidebarFiles({project,open:filename=>vscode.commands.executeCommand('vscode.open',vscode.Uri.file(filename))});
  const fileMessage = createSidebarBridge({files,isEmpty:()=>!(vscode.workspace.workspaceFolders || []).length,isCurrent:webview=>!disposed && view?.webview === webview,report:error=>output.appendLine(`Files: ${error.message}`)});
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('zero.actions', {resolveWebviewView(candidate) {
    view = candidate; candidate.webview.options = {enableScripts:true, localResourceRoots:[]};
    candidate.webview.onDidReceiveMessage(message => {
      if (!message || typeof message !== 'object' || disposed) return;
      if (message.type === 'sidebar.ready') {refresh();return;}
      if (message.type === 'files.list' || message.type === 'files.open') {void fileMessage(candidate.webview,message);return;}
      if (Object.hasOwn(actions, message.command)) vscode.commands.executeCommand(message.command);
    }, undefined, context.subscriptions);
    candidate.onDidDispose(() => {if(view === candidate) {view = undefined; renderedWebview = undefined;}}, undefined, context.subscriptions); refresh(); repositoryStatus();
  }}));
  const refreshFiles = () => {
    clearTimeout(fileRefreshTimer);
    fileRefreshTimer = setTimeout(()=>{if (!disposed) void view?.webview.postMessage?.({type:'files.reset'});},100);
  };
  context.subscriptions.push(output,{dispose:()=>clearTimeout(fileRefreshTimer)});
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  for (const method of ['onDidCreate','onDidDelete']) watcher[method](uri => {if (/(?:^|[\\/])(?:target|node_modules|\.git|\.zero-sharing-recovery|\.zero|\.zero-web)(?:[\\/]|$)/.test(uri.fsPath)) return; refreshFiles();}, undefined, context.subscriptions);
  for(const method of ['onDidCreate','onDidChange','onDidDelete']) watcher[method](uri=>{if(path.basename(uri.fsPath)==='zero.json')browserRun.stop();},undefined,context.subscriptions);
  const metadataWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,config}');
  for (const method of ['onDidCreate','onDidChange','onDidDelete']) metadataWatcher[method](uri => {
    if (!projectRoot) return;
    const filename = path.resolve(uri.fsPath);
    if (['HEAD','config'].some(name => filename === path.join(projectRoot, '.git', name))) void repositoryStatus();
  }, undefined, context.subscriptions);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {if (event.affectsConfiguration('zero.uploadMode')) refresh();}));
  const welcome = createWelcome({window:vscode.window,globalState:context.globalState,authentication:auth,connect:() => signIn(false),startProject:() => actions['zero.startProject'](),isBusy,
    eligible:async () => {
      if (!(vscode.workspace.workspaceFolders || []).length) return !hasOpenEditors();
      try {await lessonProjects.assertShareable(await project());return true;} catch {return false;}
    }});
  context.subscriptions.push(welcome);
  const startup = welcome.show().catch(error => {
    if (!disposed) {output.appendLine(`Getting started: ${error.message}`);void vscode.window.showErrorMessage(`Zero: ${error.message}`);}
  });
  const introduceAfterWelcome = () => startup.then(() => {if (!disposed) return introduceProject();}).catch(error => output.appendLine(`Getting started: ${error.message}`));
  context.subscriptions.push(watcher, metadataWatcher, vscode.workspace.onDidChangeWorkspaceFolders(() => {projectRoot = undefined; files.reset(); refreshFiles(); repositoryStatus(); void introduceAfterWelcome();}));
  context.subscriptions.push({dispose:() => {if (execution) execution.terminate();}});
  void introduceAfterWelcome();
}
module.exports = {activate};
