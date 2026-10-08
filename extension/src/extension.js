'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const core = require('./core');
const github = require('./github');
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
    repository = 'No repository connected';
    try {
      const root = await project();
      await core.assertRepositoryRoot(root);
      repository = core.parseRepositoryUrl(await core.git(root, ['remote', 'get-url', 'origin'])).page;
    } catch (error) { repository = error.message.includes('different Git repository') ? 'Standalone student copy needed to connect' : 'No repository connected'; }
    refresh();
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
  const actions = {
    'zero.signInToGitHub': async () => {
      if (uploading || connecting || signingIn) return;
      signingIn = true; refresh();
      try {
        void vscode.window.showInformationMessage('VS Code will sign you into GitHub. Zero requests repository access (repo), including private repositories, so live uploads can use your chosen repository. VS Code stores the sign-in; Zero keeps no password or token file.');
        await auth.signIn(auth.signedIn);
        state = auth.status;
      } finally { signingIn = false; refresh(); }
    },
    'zero.createRepository': async () => {
      if (uploading || connecting || signingIn) return;
      if (!auth.signedIn) throw new Error('Sign in to GitHub first.');
      void vscode.window.showInformationMessage('Create your own empty GitHub repository: choose Public or Private, and leave README, .gitignore and license unselected. Use the same account shown in Zero. Then return here and choose Connect existing repository.');
      if (!(await vscode.env.openExternal(vscode.Uri.parse('https://github.com/new')))) throw new Error('Could not open GitHub. Open https://github.com/new in your browser, create an empty repository, then connect its link.');
    },
    'zero.runApp': queuedRun,
    'zero.stopApp': stopRequested,
    'zero.showSidebar': async () => {
      await vscode.commands.executeCommand('workbench.view.extension.zero');
      if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    },
    'zero.uploadToGitHub': async () => {
      if (uploading || connecting || signingIn) return;
      uploading = true; refresh();
      try {
        const root = await project();
        if (uploadMode(root) !== 'live') {
          const result = core.simulatedUpload();
          state = result.message; refresh();
          await vscode.window.showWarningMessage(result.message);
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
        const assertCurrent = () => auth.assertCurrent(ticket);
        const result = await github.uploadPrepared(plan, message, {beforeUpload:assertCurrent, networkRun:createTransport(plan.remote, assertCurrent), onProgress:text => {state=text; refresh();}});
        state = `Uploaded ${result.head.slice(0,7)} to ${result.branch}. Copy your repository link for Pika.`;
        refresh(); await repositoryStatus();
        vscode.window.showInformationMessage(state);
      } finally {uploading = false; refresh();}
    },
    'zero.connectRepository': async () => {
      if (uploading || connecting || signingIn) return;
      connecting = true; refresh();
      try {
        const root = await project();
        const value = await vscode.window.showInputBox({title:'Connect your student repository', prompt:'Use your existing GitHub repository page URL. This changes only this project’s origin remote; no files are uploaded.', placeHolder:'https://github.com/you/your-app', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
        if (!value) return;
        const result = await core.connectRepository(root, value, async () => (await vscode.window.showWarningMessage('Replace this student project’s existing origin remote with the repository you entered?', {modal:true}, 'Replace origin')) === 'Replace origin');
        if (result) { await repositoryStatus(); vscode.window.showInformationMessage('Repository connected locally. No files uploaded.'); }
      } finally {connecting = false; refresh();}
    },
    'zero.copyRepositoryLink': async () => {
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
      output.appendLine(`Upload mode: ${uploadMode()}. Simulation makes no Git changes. Live mode reviews files, commits and pushes using your VS Code GitHub sign-in. Git still needs your name/email identity configured for this repository; Zero does not change your Git identity or store passwords/tokens.`);
    }
  };
  for (const [id, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
    try {await action();} catch(error) {state = error.message; refresh(); output.appendLine(error.message); vscode.window.showErrorMessage(`Zero: ${error.message}`);}
  }));
  function render(webview) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const busy = uploading || connecting || signingIn;
    const disabled = busy ? 'disabled' : '';
    const connected = repository.startsWith('https://github.com/');
    const githubActions = !auth.signedIn
      ? `<button class="secondary" data-command="zero.signInToGitHub" ${disabled}>Sign in to GitHub</button>`
      : connected
        ? `<p class="muted status">${escape(repository)}</p><button class="secondary" data-command="zero.uploadToGitHub" ${disabled}>Upload to GitHub</button><p class="badge">${uploadMode() === 'live' ? 'Reviews files before a real upload' : 'SIMULATION — nothing will be uploaded'}</p><button class="link" data-command="zero.copyRepositoryLink">Copy repository link</button>`
        : `<p class="muted status">${escape(repository)}</p><button class="secondary" data-command="zero.createRepository" ${disabled}>Create repository</button><button class="link" data-command="zero.connectRepository" ${disabled}>Connect existing repository…</button>`;
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
      body{color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);padding:12px;margin:0}.muted{color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.5}button{font:inherit;width:100%;padding:9px 8px;margin-top:8px;border:1px solid var(--vscode-button-border,transparent);border-radius:5px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button:hover{filter:brightness(.95)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}button:disabled{opacity:.45;cursor:default}.run{background:#6655cd;color:white}.row{display:flex;gap:8px}.row .run{flex:2}.row .secondary{flex:1}.repository{padding-top:12px;margin-top:12px;border-top:1px solid var(--vscode-panel-border)}.status{overflow-wrap:anywhere;line-height:1.5;margin:10px 0}.badge{font-size:11px;color:var(--vscode-descriptionForeground);margin:6px 0}button.link{background:transparent;color:var(--vscode-textLink-foreground);text-align:left;border:0;padding:4px 0;margin:0;font-size:12px}
      </style></head><body><div class="row"><button class="run" data-command="zero.runApp">▶ Run App</button><button class="secondary" data-command="zero.stopApp" ${execution ? '' : 'disabled'}>■ Stop</button></div><p class="muted status" role="status" aria-live="polite">${escape(state)}</p><div class="repository"><strong>GitHub</strong><p class="muted status">${escape(auth.status)}</p>${githubActions}${auth.signedIn ? `<button class="link" data-command="zero.signInToGitHub" ${disabled}>Change GitHub account…</button>` : ''}<button class="link" data-command="zero.showSetup">Setup help</button></div><script nonce="${nonce}">const api=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>api.postMessage({command:button.dataset.command})));</script></body></html>`;
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
