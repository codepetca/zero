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
const {createWebPublishCommands} = require('./web-publish-ui');
const {sidebarStyles} = require('./sidebar-style');
const {libraryLayout} = require('./library-files');
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
  let branch = '';
  let statusGeneration = 0;
  const isBusy = () => uploading || connecting || signingIn || changing || menuOpen || componentBusy || exportingWeb || publishingWeb || browserBusy;
  let projectRoot;
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
      if (!await vscode.env.openExternal(vscode.Uri.parse(`https://zero.codepet.ca/tutorials/${tutorial.lessonId}`))) throw new Error('Could not open the lesson guide in your browser.');
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
        if (!(await vscode.env.openExternal(vscode.Uri.parse(`https://zero.codepet.ca/tutorials/${marker.lessonId}`)))) throw new Error('Could not open the lesson guide in your browser.');
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
    let nextRepository = 'No repository connected', nextBranch = '';
    try {
      const root = await project();
      if (localPractice) {nextRepository = 'Local practice'; throw new Error('Local practice');}
      await core.assertRepositoryRoot(root);
      nextRepository = core.parseRepositoryUrl(await core.git(root, ['remote', 'get-url', 'origin'])).page;
      try {nextBranch = (await core.git(root, ['symbolic-ref', '--short', 'HEAD'])).trim();} catch {}
    } catch (error) { if (!localPractice) nextRepository = error.message.includes('different Git repository') ? 'Standalone student copy needed to connect' : 'No repository connected'; }
    if (generation === statusGeneration) {repository = nextRepository; branch = nextBranch; refresh();}
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
    void vscode.window.showInformationMessage('Resolve the conflicts in VS Code Source Control. Stage the resolved files, then commit the merge with standard VS Code Git controls. Run your app to check it, then choose Finish change again. Zero leaves your files and merge in place.');
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
      if (uploadMode(root) !== 'live') {simulation(kind === 'start' ? 'New branch' : 'Finish change'); return;}
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
      const detail = `${plan.page}\nGitHub account: ${ticket.session.label}\nCurrent branch: ${plan.branch} (${plan.head})\nMain: ${plan.mainHead}\nLatest uploaded main: ${plan.remoteMainHead || 'none'}\n${plan.summary}\n\n${kind === 'start' ? `Update local main to the reviewed latest main, then start ${name}.` : `Merge ${plan.branch} into main and upload main to this repository.\n${(plan.changedPaths || []).join('\n')}\n\nRun your app before finishing. If main must first be incorporated into your change, run and check the app again before choosing Finish change again.`}`;
      const button = kind === 'start' ? 'Create branch' : 'Merge & Upload main';
      const confirmed = await vscode.window.showInformationMessage(kind === 'start' ? 'Create this branch?' : 'Finish this change?', {modal:true, detail}, button);
      if (confirmed !== button) return;
      if (await project() !== root) throw new Error('The student project changed. Review your change again.');
      await assertCurrent();
      const result = kind === 'start' ? await workflow.startPrepared(plan, options) : await workflow.finishPrepared(plan, options);
      if (kind === 'finish' && result.updated && !result.finished) {
        state = 'Main updates added to your change. Run App, then choose Finish change again to review.';
        void vscode.window.showInformationMessage(state);
        return;
      }
      state = kind === 'start' ? `Started ${result.branch}. Make your changes, then Upload changes.` : 'Finished change and uploaded main. Run your app to check it.';
      void vscode.window.showInformationMessage(state);
      if (kind === 'finish') {
        const remove = await vscode.window.showInformationMessage(`Delete the finished local branch ${result.finishedBranch}?`, {modal:true, detail:'Your change is now on main. This only deletes the local branch; the GitHub branch stays available.'}, 'Delete local branch');
        if (remove === 'Delete local branch') {
          if (await project() !== root) throw new Error('The student project changed. The finished local branch was kept.');
          await workflow.deleteFinishedBranch(root, result.finishedBranch, result.head);
        }
      }
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
        const message = await vscode.window.showInputBox({title:'Describe this version', prompt:'A commit saves a version in Git. Upload sends it to your connected GitHub repository.', value:'Update my app', validateInput:value => value.trim() && !value.includes('\0') ? undefined : 'Describe your changes in a short message.'});
        if (!message) return;
        const detail = `${plan.page}\nGitHub account: ${ticket.session.label}\nBranch: ${plan.branch}\n${plan.summary}\n\n${plan.changes.map(change => `${change.kind}: ${change.path}`).join('\n')}\n\nIgnored files stay local. This will save a Git commit when files changed and upload your branch using your VS Code GitHub sign-in. Git still needs your repository name/email identity. Submit your repository link separately in Pika.`;
        const confirmed = await vscode.window.showInformationMessage('Upload this version to GitHub?', {modal:true, detail}, 'Commit & Upload');
        if (confirmed !== 'Commit & Upload') return;
        if (await project() !== root) throw new Error('The student project changed. Review the upload again.');
        const assertCurrent = async () => {await assertCurrentProject();return activeAuth.assertCurrent(ticket);};
        const result = await github.uploadPrepared(plan, message, {beforeUpload:assertCurrent, networkRun:createTransport(plan.remote, assertCurrent, {assertCurrentNow:() => activeAuth.assertCurrentNow(ticket)}), onProgress:text => {state=text; refresh();}});
        state = `Uploaded ${result.head.slice(0,7)} to ${result.branch}. Copy your repository link for Pika.`;
        refresh(); await repositoryStatus();
        vscode.window.showInformationMessage(state);
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
      await lessonProjects.assertShareable(await project());
      const connected = repository.startsWith('https://github.com/');
      const choice = await quickPick(connected ? [
        {label:'Copy repository link', description:'Submit the link separately in Pika', action:'copy'},
        {label:'Connect another repository…', action:'connect'}
      ] : [
        {label:'Create a repository…', description:'Open GitHub, then connect its link here', action:'create'},
        {label:'Connect an existing repository…', action:'connect'}
      ], {title:connected ? repository : 'Connect a repo', placeHolder:'Choose a repository action'});
      if (isBusy()) return;
      if (choice?.action === 'connect') await actions['zero.connectRepository']();
      if (choice?.action === 'copy') await actions['zero.copyRepositoryLink']();
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
      const choice = await quickPick(currentBranch === 'main' ? [{label:'New branch…', action:'start'}] : [{label:'Finish change…', action:'finish'}], {title:`${currentRepository} · ${currentBranch}`, placeHolder:'Choose a change action'});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || branch !== currentBranch || repository !== currentRepository) return;
      await change(choice.action);
    },
    'zero.startChange': () => change('start'),
    'zero.finishChange': () => change('finish'),
    'zero.runNativeApp': async () => {browserRun.stop({quiet:true});await queuedRun();},
    'zero.stopApp': stopRequested,
    'zero.openFirstLesson': async () => {
      const root = await project();
      if (await openFirstLesson(root)) {
        await context.workspaceState.update(`zero.firstLessonShown:${root}`, true);
      } else if (!(await vscode.env.openExternal(vscode.Uri.parse('https://zero.codepet.ca/learn')))) {
        throw new Error('Could not open the first lesson. Open https://zero.codepet.ca/learn in your browser.');
      }
    },
    'zero.startProject': async () => {
      const projects = await lessonProjects.loadBundle(context.extensionPath || path.resolve(__dirname,'..'));
      const choice = await quickPick(projects.map(item => ({label:item.title, description:`Lessons ${{greeting:'0–2',study:'3–7',game:'8–12'}[item.id]} · your GitHub repository`, project:item})), {title:'Start project', placeHolder:'Choose a tutorial repository to create and clone'});
      if (!choice) return;
      if (!choice.project.template) throw new Error(`The ${choice.project.title} tutorial template is not published yet. Ask your teacher when it is available, then create YOUR repository from that template and use VS Code Git: Clone. No local project was created.`);
      const template = choice.project.template;
      const next = await vscode.window.showInformationMessage('Create your own tutorial repository, then clone it', {modal:true, detail:`On GitHub, use this template to create a repository under your own account. Copy YOUR new repository URL. Return to VS Code, run Git: Clone, paste that URL, and open the cloned folder.\n\n${template.repositoryUrl}`}, 'Open template');
      if (next !== 'Open template') return;
      if (!await vscode.env.openExternal(vscode.Uri.parse(template.templateHref))) throw new Error('Could not open the published tutorial template. Try Start project again.');
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
        if (result) { await repositoryStatus(); vscode.window.showInformationMessage('Repository connected locally. No files uploaded.'); }
      } finally {await repositoryStatus(); connecting = false; refresh();}
    },
    'zero.copyRepositoryLink': async () => {
      if (isBusy()) return;
      const root = await project();
      await core.assertRepositoryRoot(root);
      const {page} = core.parseRepositoryUrl(await core.git(root, ['remote','get-url','origin']));
      await vscode.env.clipboard.writeText(page);
      vscode.window.showInformationMessage('Repository link copied. Paste it into Pika when submitting.');
    },
    'zero.showSetup': createSetupHelp(vscode,{project,output,run:root => actions['zero.runApp'](root),uploadMode})
  };
  const webCacheRoot=context.globalStorageUri ? path.join(context.globalStorageUri.fsPath,'web-compiler') : undefined;
  const runnableProject=async()=>{const root=await project();await core.assertTutorialRepository(root);return root;};
  const browserRun=createBrowserRunCommands(vscode,{project:runnableProject,output,isBusy,setBusy:value=>{browserBusy=value;refresh();},setActive:value=>{browserActive=value;refresh();},setFailed:value=>{buildFailed=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot,beforeRun:stopRequested});
  Object.assign(actions,browserRun.commands);
  actions['zero.stopApp']=async()=>{browserRun.stop();await stopRequested();};
  context.subscriptions.push(...browserRun.disposables);
  const webPublish=createWebPublishCommands(vscode,{project,authentication:auth,isSimulation:root=>uploadMode(root)!=='live',isBusy,setBusy:value=>{publishingWeb=value;refresh();},setState:text=>{state=text;refresh();},output,workspaceState:context.workspaceState,cacheRoot:webCacheRoot,uploadChanges:uploadAuth=>uploadProject(uploadAuth)});
  Object.assign(actions,webPublish.commands);
  context.subscriptions.push(...webPublish.disposables);
  const sharing=createSharingEditor(vscode,{project,auth,output,isBusy,verifiedPublication:webPublish.verifiedPublication,setBusy:value=>{componentBusy=value;refresh();}},{kitConfiguration:readKitConfiguration(context.extensionPath || path.resolve(__dirname,'..'))});
  Object.assign(actions, sharing.commands);
  context.subscriptions.push(...sharing.disposables);
  const webExport=createWebExportCommands(vscode,{project:runnableProject,output,publish:()=>webPublish.publish(),openPreview:browserRun.preview,isBusy,setBusy:value=>{exportingWeb=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot});
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
    const repoName = connected ? repository.slice('https://github.com/'.length) : 'Connect a repository';
    const repoControl = auth.signedIn ? `<button class="repo-choice" data-command="zero.chooseRepository" title="${escape(connected ? repository : 'Create or connect a GitHub repository')}" aria-label="${escape(connected ? `Repository: ${repoName}. Open repository actions` : 'Connect a repository')}" aria-haspopup="dialog" ${disabled}>${escape(repoName)} ${icon('ChevronDown')}</button>` : '';
    const branchControl = auth.signedIn && connected && branch ? `<div class="branch-row"><span class="branch" title="${escape(`Current branch: ${branch}`)}">${icon('GitBranch')}${escape(branch)}</span><button class="link change" data-command="${branch === 'main' ? 'zero.startChange' : 'zero.finishChange'}" ${disabled}>${branch === 'main' ? 'New branch' : 'Finish change'}</button></div>` : '';
    const githubActions = connected && auth.signedIn ? `<button class="secondary upload" data-command="zero.uploadToGitHub" ${disabled}>${icon('CloudUpload')}Upload changes</button>${uploadMode() === 'live' ? '' : '<p class="badge">Simulation — nothing will be uploaded</p>'}` : '';
    const repositoryWarning = auth.signedIn && !connected && repository !== 'No repository connected' ? `<p class="muted status">${escape(repository)}</p>` : '';
    const publishControl = `<button class="link" data-command="zero.publishWeb" ${disabled || (!auth.signedIn || !connected ? 'disabled' : '')} title="${auth.signedIn && connected ? 'Publish your uploaded app to GitHub Pages' : 'Sign in and connect your repository to publish'}">Publish app</button>`;
    const githubPanel = localPractice ? '<p class="muted">Local practice · no GitHub sharing</p>' : `<div class="github-header"><strong>GitHub</strong>${account}</div>${repoControl}${repositoryWarning}${branchControl}${githubActions}${publishControl}`;
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
      ${sidebarStyles()}
      </style></head><body><div class="main-controls"><div class="row"><button class="run" data-command="zero.runApp">${icon('Play')}Run App</button><button class="secondary" data-command="zero.stopApp" ${execution || browserActive ? '' : 'disabled'}>${icon('Square')}Stop</button></div><p class="muted status" role="status" aria-live="polite">${escape(state)}</p>${buildFailed ? '<button class="link" data-command="zero.showProblems">Show Problems</button>' : ''}</div><section class="repository">${githubPanel}</section><section class="repository"><strong>ZeroHub</strong><button class="secondary hub" data-command="zero.browseZeroHub" ${disabled}>${icon('Blocks')}Browse ZeroHub</button>${!originalWork || !auth.signedIn ? '' : `<button class="link share" data-command="zero.shareGame" ${disabled}>Share project ${icon('ArrowUpRight')}</button>`}</section><script nonce="${nonce}">const api=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>api.postMessage({command:button.dataset.command})));</script></body></html>`;
  }
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('zero.actions', {resolveWebviewView(candidate) {
    view = candidate; candidate.webview.options = {enableScripts:true, localResourceRoots:[]};
    candidate.webview.onDidReceiveMessage(message => {if (message && Object.hasOwn(actions, message.command)) vscode.commands.executeCommand(message.command);}, undefined, context.subscriptions);
    candidate.onDidDispose(() => {view = undefined;}, undefined, context.subscriptions); refresh(); repositoryStatus();
  }}));
  const changes = new vscode.EventEmitter();
  const files = {
    onDidChangeTreeData:changes.event,
    getTreeItem:entry => {
      const item = new vscode.TreeItem(entry.label || entry.uri, entry.directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
      item.resourceUri = entry.uri;
      if (!entry.directory) item.command = {command:'vscode.open', title:'Open file', arguments:[entry.uri]};
      return item;
    },
    getChildren:async entry => {
      try {
        const root = entry ? entry.uri.fsPath : await project();
        const visible = async (directory, omit = []) => (await fs.readdir(directory, {withFileTypes:true}))
          .filter(child => !['.git','target','node_modules','.DS_Store','.zero-sharing-recovery','.zero','.zero-web', ...omit].includes(child.name) && !child.isSymbolicLink())
          .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
          .map(child => ({uri:vscode.Uri.file(path.join(directory, child.name)), directory:child.isDirectory()}));
        if (entry) return visible(root, entry.projectFiles ? ['src','README.md'] : []);
        const library=await libraryLayout(root);
        const nested=await fs.lstat(path.join(root,'libraries')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(library) return [
          ...await visible(library.sources),
          {uri:vscode.Uri.file(library.readme),directory:false},
          {label:'Examples',uri:vscode.Uri.file(library.examples),directory:true},
          {label:'Checks',uri:vscode.Uri.file(library.checks),directory:true},
          {label:'Project files',uri:vscode.Uri.file(root),directory:true,projectFiles:true}
        ];
        return [
          ...await visible(path.join(root, 'src/main/java'), ['zero']),
          ...(nested?.isDirectory()&&!nested.isSymbolicLink()?[{label:'Libraries',uri:vscode.Uri.file(path.join(root,'libraries')),directory:true}]:[]),
          {label:'Resources', uri:vscode.Uri.file(path.join(root,'src/main/resources')), directory:true},
          {label:'Toolkit', uri:vscode.Uri.file(path.join(root,'src/main/java/zero')), directory:true},
          {uri:vscode.Uri.file(path.join(root,'README.md')), directory:false},
          {label:'Project files', uri:vscode.Uri.file(root), directory:true, projectFiles:true}
        ];
      } catch(error) {output.appendLine(`Files: ${error.message}`); return [];}
    }
  };
  context.subscriptions.push(output, changes, vscode.window.registerTreeDataProvider('zero.files', files));
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  for (const method of ['onDidCreate','onDidDelete']) watcher[method](uri => {if (/(?:^|[\\/])(?:target|node_modules|\.git|\.zero-sharing-recovery)(?:[\\/]|$)/.test(uri.fsPath)) return; changes.fire();}, undefined, context.subscriptions);
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
  context.subscriptions.push(watcher, metadataWatcher, vscode.workspace.onDidChangeWorkspaceFolders(() => {projectRoot = undefined; changes.fire(); repositoryStatus(); void introduceAfterWelcome();}));
  context.subscriptions.push({dispose:() => {if (execution) execution.terminate();}});
  void introduceAfterWelcome();
}
module.exports = {activate};
