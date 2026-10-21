'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const core = require('./core');

const CLONE_PARENT_KEY = 'zero.cloneParent';

function throwIfCancelled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('GitHub operation cancelled.'), {name:'CancellationError',code:'cancelled'});
}
// One notification owns an operation; nested clone work reuses its signal.
function createProjectProgress(vscode, active = () => true) {
  const controllers = new Set(); let disposed = false;
  async function run(title, operation, outerSignal) {
    const controller = new AbortController(); controllers.add(controller);
    const signal = outerSignal ? AbortSignal.any([outerSignal,controller.signal]) : controller.signal;
    if (disposed || !active()) controller.abort();
    async function execute(progress, token) {
      const subscription = token?.onCancellationRequested(() => controller.abort());
      if (token?.isCancellationRequested) controller.abort();
      try {throwIfCancelled(signal);return await operation(signal, message => progress?.report({message}));}
      finally {subscription?.dispose();}
    }
    try {
      if (!outerSignal && vscode.window.withProgress) return await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title,cancellable:true}, execute);
      return await execute();
    } finally {controllers.delete(controller);}
  }
  return {run,dispose(){disposed=true;for(const controller of controllers)controller.abort();}};
}

// Projects are ordinary folders; Zero owns only its explicit authenticated clone action.
function createProjectFolders(vscode, {home = os.homedir(), globalState, active = () => true, report = () => {}, cloneRepository, onOpened=async()=>{}} = {}) {
  const defaultParent = path.join(home, 'Zero Projects');
  let disposed=false;const isActive=()=>!disposed&&active();const progress=createProjectProgress(vscode,isActive);
  async function chooseFolder(title, openLabel, createDefault = false) {
    if (!isActive()) return;
    let initial = defaultParent;
    const remembered = createDefault && globalState?.get(CLONE_PARENT_KEY);
    if (typeof remembered === 'string' && path.isAbsolute(remembered)) {
      try {
        if ((await fs.stat(remembered)).isDirectory()) initial = remembered;
      } catch(error) {
        report(`Saved clone folder unavailable; using the default location. ${error.message}`);
      }
    }
    try {
      if (createDefault && initial === defaultParent) await fs.mkdir(defaultParent, {recursive:true});
      if (!(await fs.stat(initial)).isDirectory()) throw new Error('The default project path is not a folder.');
    } catch(error) {
      initial = home;
      if (createDefault || error.code !== 'ENOENT') report(`Default project folder unavailable; choose another location. ${error.message}`);
    }
    if (!isActive()) return;
    const selection = await vscode.window.showOpenDialog({title, openLabel, canSelectFiles:false, canSelectFolders:true, canSelectMany:false, defaultUri:vscode.Uri.file(initial)});
    return isActive() ? selection?.[0] : undefined;
  }
  async function clone({repositoryUrl, parent: selectedParent, signal, assertCurrent=async()=>{}, beforeOpen=async()=>{}} = {}) {
    if (!isActive()) return;
    throwIfCancelled(signal);
    const url = repositoryUrl || await vscode.window.showInputBox({title:'GitHub repository URL', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
    if (!url || !isActive()) return;
    const destination = core.parseRepositoryUrl(url);
    const parent = selectedParent || await chooseCloneParent();
    if (!parent || !isActive()) return;
    await assertCurrent();
    if(!isActive())return;
    if (typeof cloneRepository !== 'function') throw new Error('Connect Zero to GitHub before cloning this project.');
    return progress.run('Clone from GitHub',async operationSignal => {
      const result = await cloneRepository({repositoryUrl:destination.page,parentPath:parent.fsPath,signal:operationSignal});
      throwIfCancelled(operationSignal);
      await assertCurrent();
      if (result && isActive()) {
        try {await onOpened({projectPath:result,repositoryUrl:destination.page});}catch(error){report(`Could not remember this project. ${error.message}`);}
        if(isActive()) {
          await assertCurrent();
          // Reusing the window replaces this extension host. Persist the handoff
          // before dispatch, and restore it if opening fails or is cancelled here.
          const restore=await beforeOpen();
          try {
            throwIfCancelled(operationSignal);await assertCurrent();
            if(!isActive()){await restore?.();return result;}
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result), {forceReuseWindow:true});
          } catch(error) {await restore?.();throw error;}
        }
      }
      return result;
    },signal);
  }

  async function chooseCloneParent() {
    const parent = await chooseFolder('Clone location', 'Clone here', true);
    if (!parent || !isActive()) return;
    if (globalState) {
      try {await globalState.update(CLONE_PARENT_KEY, parent.fsPath);}
      catch(error) {report(`Could not remember the clone location. ${error.message}`);}
    }
    return isActive() ? parent : undefined;
  }
  async function openLocal({projectPath,assertCurrent=async()=>{}}={}) {
    const folder = projectPath ? {fsPath:projectPath} : await chooseFolder('Open local project', 'Open project');
    if (!folder || !isActive()) return;
    const root = await core.resolveProject([folder.fsPath]);
    await assertCurrent();
    if(isActive()) {
      try {await onOpened({projectPath:root});}catch(error){report(`Could not remember this project. ${error.message}`);}
      if(isActive()){await assertCurrent();await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), {forceReuseWindow:true});}
    }
  }
  return {clone, openLocal, chooseCloneParent,dispose(){disposed=true;progress.dispose();}};
}
module.exports = {createProjectFolders,createProjectProgress,throwIfCancelled};
