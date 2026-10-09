'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const core = require('./core');
const github = require('./github');
const workflow = require('./workflow');
const {createAuthentication} = require('./authentication');
const {createTransport} = require('./transport');
const execute = promisify(execFile);
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function activate(context) {
  const output = vscode.window.createOutputChannel('Zero');
  let execution, ending, view, pendingLaunch;
  let runGeneration = 0;
  let uploading = false;
  let connecting = false;
  let signingIn = false;
  let changing = false;
  let menuOpen = false;
  let branch = '';
  let statusGeneration = 0;
  const isBusy = () => uploading || connecting || signingIn || changing || menuOpen;
  let projectRoot;
  const uploadMode = (root = projectRoot) => root ? vscode.workspace.getConfiguration('zero', vscode.Uri.file(root)).get('uploadMode', 'simulation') : 'simulation';
  let runQueue = Promise.resolve();
  let state = 'Ready to run';
  let repository = 'No repository connected';
  const project = async () => {
    projectRoot = await core.resolveProject((vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath));
    return projectRoot;
  };
  const refresh = () => { if (view) render(view.webview); };
  const auth = createAuthentication(vscode.authentication, refresh);
  context.subscriptions.push(auth);
  void auth.refresh();
  async function repositoryStatus() {
    const generation = ++statusGeneration;
    let nextRepository = 'No repository connected', nextBranch = '';
    try {
      const root = await project();
      await core.assertRepositoryRoot(root);
      nextRepository = core.parseRepositoryUrl(await core.git(root, ['remote', 'get-url', 'origin'])).page;
      try {nextBranch = (await core.git(root, ['symbolic-ref', '--short', 'HEAD'])).trim();} catch {}
    } catch (error) { nextRepository = error.message.includes('different Git repository') ? 'Standalone student copy needed to connect' : 'No repository connected'; }
    if (generation === statusGeneration) {repository = nextRepository; branch = nextBranch; refresh();}
  }
  async function stop() {
    if (!execution) return;
    const active = execution;
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
  async function makeTask(root, definition = {type:'zero',task:'run'}, scope = vscode.TaskScope.Workspace) {
    const spec = core.runSpecification(root);
    await fs.access(spec.command);
    const processExecution = spec.shell
      ? new vscode.ShellExecution({value: spec.command, quoting: vscode.ShellQuoting.Strong}, spec.args, {cwd: root})
      : new vscode.ProcessExecution(spec.command, spec.args, {cwd: root});
    const task = new vscode.Task(definition, scope, 'Run App', 'Zero', processExecution, '$zero-java');
    task.presentationOptions = {reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true, focus: false};
    task.group = vscode.TaskGroup.Build;
    return task;
  }
  const taskFinishes = new Map();
  function track(active) {
    if (taskFinishes.has(active)) return;
    if (execution && execution !== active) execution.terminate();
    execution = active;
    ending = new Promise(resolve => taskFinishes.set(active, resolve));
    state = 'Running app — build output is in the terminal'; refresh();
  }
  context.subscriptions.push(vscode.tasks.onDidStartTask(event => {
    if (event.execution.task.definition.type === 'zero') track(event.execution);
  }), vscode.tasks.onDidEndTask(event => {
    const finish = taskFinishes.get(event.execution);
    if (!finish) return;
    taskFinishes.delete(event.execution); finish();
    if (execution === event.execution) {execution = undefined; state = 'App stopped. Check the task terminal for build errors.'; refresh();}
  }));
  context.subscriptions.push(vscode.tasks.registerTaskProvider('zero', {
    // Configured tasks must pass through resolveTask for saving and restart checks.
    provideTasks: async () => [],
    resolveTask: async configured => {
      if (configured.definition.task !== 'run') return undefined;
      const generation = runGeneration;
      await stop();
      if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
      const task = await makeTask(await project(), configured.definition, configured.scope);
      if (generation !== runGeneration) return undefined;
      task.group = configured.group || vscode.TaskGroup.Build;
      return task;
    }
  }));
  async function run(generation) {
    if (generation !== runGeneration) return;
    await stop();
    const root = await project();
    if (generation !== runGeneration) return;
    if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
    const task = await makeTask(root);
    if (generation !== runGeneration) return;
    pendingLaunch = vscode.tasks.executeTask(task).then(active => {track(active); return active;});
    try {await pendingLaunch;} finally {pendingLaunch = undefined;}
  }
  function queuedRun() {
    const generation = runGeneration;
    const next = runQueue.then(() => run(generation));
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
      if (uploadMode(root) !== 'live') {simulation(kind === 'start' ? 'Start a change' : 'Finish change'); return;}
      let name;
      if (kind === 'start') {
        name = await vscode.window.showInputBox({title:'Start a change', prompt:'Name your change using lowercase words and dashes.', placeHolder:'add-score', validateInput:value => /^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : 'Use lowercase letters, numbers and dashes, starting with a letter or number.'});
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
      const button = kind === 'start' ? 'Start change' : 'Merge & Upload main';
      const confirmed = await vscode.window.showInformationMessage(kind === 'start' ? 'Start this change?' : 'Finish this change?', {modal:true, detail}, button);
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
  const actions = {
    'zero.githubAccount': async () => {
      if (isBusy()) return;
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
    'zero.signInToGitHub': async () => {
      if (isBusy()) return;
      signingIn = true; refresh();
      try {
        void vscode.window.showInformationMessage('VS Code will sign you into GitHub. Zero requests repository access (repo), including private repositories, so live uploads can use your chosen repository. VS Code stores the sign-in; Zero keeps no password or token file.');
        await auth.signIn(auth.signedIn);
        state = auth.status;
      } finally { signingIn = false; refresh(); }
    },
    'zero.createRepository': async () => {
      if (isBusy()) return;
      if (!auth.signedIn) throw new Error('Sign in to GitHub first.');
      void vscode.window.showInformationMessage('Create your own empty GitHub repository: choose Public or Private, and leave README, .gitignore and license unselected. Use the same account shown in Zero. Then return here and choose Connect a repo → Connect an existing repository.');
      if (!(await vscode.env.openExternal(vscode.Uri.parse('https://github.com/new')))) throw new Error('Could not open GitHub. Open https://github.com/new in your browser, create an empty repository, then connect its link.');
    },
    'zero.chooseBranch': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      if (isBusy() || !branch || !repository.startsWith('https://github.com/')) return;
      const root = projectRoot, currentBranch = branch, currentRepository = repository;
      const choice = await quickPick(currentBranch === 'main' ? [{label:'Start a change…', action:'start'}] : [{label:'Finish change…', action:'finish'}], {title:`${currentRepository} · ${currentBranch}`, placeHolder:'Choose a change action'});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || branch !== currentBranch || repository !== currentRepository) return;
      await change(choice.action);
    },
    'zero.startChange': () => change('start'),
    'zero.finishChange': () => change('finish'),
    'zero.runApp': queuedRun,
    'zero.stopApp': stopRequested,
    'zero.showSidebar': async () => {
      await vscode.commands.executeCommand('workbench.view.extension.zero');
      if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    },
    'zero.uploadToGitHub': async () => {
      if (isBusy()) return;
      uploading = true; refresh();
      try {
        const root = await project();
        if (uploadMode(root) !== 'live') {
          const result = core.simulatedUpload();
          state = `${result.message} Nothing changed: no files saved, Git changes or sign-in.`; refresh();
          void vscode.window.showWarningMessage(state);
          return;
        }
        const ticket = await auth.capture();
        if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before reviewing the upload.');
        const plan = await github.prepareUpload(root);
        const message = await vscode.window.showInputBox({title:'Describe this version', prompt:'A commit saves a version in Git. Upload sends it to your connected GitHub repository.', value:'Update my app', validateInput:value => value.trim() && !value.includes('\0') ? undefined : 'Describe your changes in a short message.'});
        if (!message) return;
        const detail = `${plan.page}\nGitHub account: ${ticket.session.label}\nBranch: ${plan.branch}\n${plan.summary}\n\n${plan.changes.map(change => `${change.kind}: ${change.path}`).join('\n')}\n\nIgnored files stay local. This will save a Git commit when files changed and upload your branch using your VS Code GitHub sign-in. Git still needs your repository name/email identity. Submit your repository link separately in Pika.`;
        const confirmed = await vscode.window.showInformationMessage('Upload this version to GitHub?', {modal:true, detail}, 'Commit & Upload');
        if (confirmed !== 'Commit & Upload') return;
        if (await project() !== root) throw new Error('The student project changed. Review the upload again.');
        const assertCurrent = () => auth.assertCurrent(ticket);
        const result = await github.uploadPrepared(plan, message, {beforeUpload:assertCurrent, networkRun:createTransport(plan.remote, assertCurrent, {assertCurrentNow:() => auth.assertCurrentNow(ticket)}), onProgress:text => {state=text; refresh();}});
        state = `Uploaded ${result.head.slice(0,7)} to ${result.branch}. Copy your repository link for Pika.`;
        refresh(); await repositoryStatus();
        vscode.window.showInformationMessage(state);
      } finally {await repositoryStatus(); uploading = false; refresh();}
    },
    'zero.connectRepository': async () => {
      if (isBusy()) return;
      connecting = true; refresh();
      try {
        const root = await project();
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
    'zero.showSetup': async () => {
      output.clear(); output.show(true);
      output.appendLine('Zero setup — local running does not require GitHub sign-in.');
      for (const [name, args] of [['java',['-version']], ['javac',['-version']], ['git',['--version']]]) {
        try {const result = await execute(name, args, {timeout:10000}); output.appendLine(`${name}: ${(result.stdout || result.stderr).trim()}`);}
        catch(error) {output.appendLine(`${name}: unavailable. Install ${name !== 'git' ? 'JDK 17 or newer and ensure java is on PATH' : 'Git and ensure git is on PATH'}. ${error.message}`);}
      }
      for (const id of ['redhat.java','vscjava.vscode-java-debug']) output.appendLine(`${id}: ${vscode.extensions.getExtension(id) ? 'installed' : 'missing — install this Java extension'}`);
      try {output.appendLine(`Student project: ${await project()}`);} catch(error) {output.appendLine(error.message);}
      output.appendLine('First builds download Maven and JavaFX dependencies. Run App saves files, rebuilds and opens a separate JavaFX window. Read errors in its task terminal.');
      output.appendLine(`Upload mode: ${uploadMode()}. Simulation makes no Git changes. Live upload needs Git 2.31 or newer and uses your VS Code GitHub sign-in. Git still needs your name/email identity configured for this repository; Zero does not change your Git identity or store passwords/tokens.`);
    }
  };
  for (const [id, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
    try {await action();} catch(error) {state = error.message; refresh(); output.appendLine(error.message); vscode.window.showErrorMessage(`Zero: ${error.message}`);}
  }));
  function render(webview) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const busy = isBusy();
    const disabled = busy ? 'disabled' : '';
    const connected = repository.startsWith('https://github.com/');
    const accountName = auth.accountLabel || '';
    const accountTitle = auth.signedIn ? `Signed in as ${accountName}` : 'Sign in to GitHub';
    const avatar = auth.signedIn ? escape(Array.from(accountName.trim())[0]?.toLocaleUpperCase() || '?')
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></svg>';
    const repoName = connected ? repository.slice('https://github.com/'.length) : 'Connect a repo';
    const githubActions = connected && auth.signedIn
      ? `<button class="secondary" data-command="zero.uploadToGitHub" ${disabled}>Upload changes</button><p class="badge">${uploadMode() === 'live' ? 'Reviews files before a real upload' : 'SIMULATION — nothing will be changed'}</p>` : '';
    const branchControl = connected && branch ? `<button class="repo-choice" data-command="zero.chooseBranch" title="${escape(`Current branch: ${branch}. Start or finish a change`)}" aria-label="${escape(`Current branch: ${branch}. Open change actions`)}" aria-haspopup="dialog" ${disabled}>${escape(branch)} ▾</button>` : '';
    const repositoryWarning = !connected && repository !== 'No repository connected'
      ? `<p class="muted status">${escape(repository)}</p>` : '';
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
      body{color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);padding:12px;margin:0}.muted{color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.5}button{font:inherit;width:100%;padding:9px 8px;margin-top:8px;border:1px solid var(--vscode-button-border,transparent);border-radius:5px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button:hover{filter:brightness(.95)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}button:disabled{opacity:.45;cursor:default}.run{background:#6655cd;color:white}.row{display:flex;gap:8px}.row .run{flex:2}.row .secondary{flex:1}.repository{padding-top:12px;margin-top:12px;border-top:1px solid var(--vscode-panel-border)}.status{overflow-wrap:anywhere;line-height:1.5;margin:10px 0}.badge{font-size:11px;color:var(--vscode-descriptionForeground);margin:6px 0}button.link{background:transparent;color:var(--vscode-textLink-foreground);text-align:left;border:0;padding:4px 0;margin:0;font-size:12px}
      .github-header{display:flex;align-items:center;justify-content:space-between;gap:8px}.account{width:28px;height:28px;flex:none;border-radius:50%;padding:0;margin:0;display:inline-flex;align-items:center;justify-content:center;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-weight:600}.account svg{width:16px;height:16px;fill:currentColor}.repo-choice{width:100%;margin:8px 0 0;padding:5px 0;background:transparent;color:var(--vscode-textLink-foreground);border:0;text-align:left;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.repo-choice:hover{text-decoration:underline}
      </style></head><body><div class="row"><button class="run" data-command="zero.runApp">▶ Run App</button><button class="secondary" data-command="zero.stopApp" ${execution ? '' : 'disabled'}>■ Stop</button></div><p class="muted status" role="status" aria-live="polite">${escape(state)}</p><div class="repository"><div class="github-header"><strong>GitHub</strong><button class="account" data-command="zero.githubAccount" title="${escape(accountTitle)}" aria-label="${escape(accountTitle)}" aria-haspopup="dialog" ${disabled}>${avatar}</button></div><button class="repo-choice" data-command="zero.chooseRepository" title="${escape(connected ? repository : 'Create or connect a GitHub repository')}" aria-label="${escape(connected ? `Repository: ${repoName}. Open repository actions` : 'Connect a repo')}" aria-haspopup="dialog" ${disabled}>${escape(repoName)}</button>${repositoryWarning}${branchControl}${githubActions}<button class="link" data-command="zero.showSetup">Setup help</button></div><script nonce="${nonce}">const api=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>api.postMessage({command:button.dataset.command})));</script></body></html>`;
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
          .filter(child => !['.git','target','node_modules','.DS_Store', ...omit].includes(child.name) && !child.isSymbolicLink())
          .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
          .map(child => ({uri:vscode.Uri.file(path.join(directory, child.name)), directory:child.isDirectory()}));
        if (entry) return visible(root, entry.projectFiles ? ['src','README.md'] : []);
        return [
          ...await visible(path.join(root, 'src/main/java'), ['zero']),
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
  for (const method of ['onDidCreate','onDidDelete']) watcher[method](uri => {if (/(?:^|[\\/])(?:target|node_modules|\.git)(?:[\\/]|$)/.test(uri.fsPath)) return; changes.fire();}, undefined, context.subscriptions);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {if (event.affectsConfiguration('zero.uploadMode')) refresh();}));
  context.subscriptions.push(watcher, vscode.workspace.onDidChangeWorkspaceFolders(() => {projectRoot = undefined; changes.fire(); repositoryStatus();}));
  context.subscriptions.push({dispose:() => {if (execution) execution.terminate();}});
  project().then(async () => {if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar'); if (!context.workspaceState.get('zero.sidebarShown')) {await actions['zero.showSidebar'](); await context.workspaceState.update('zero.sidebarShown',true);}}).catch(() => {});
}
module.exports = {activate};
