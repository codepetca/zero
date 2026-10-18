'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const core = require('./core');

const CLONE_PARENT_KEY = 'zero.cloneParent';

// Projects are ordinary folders; Zero owns only its explicit authenticated clone action.
function createProjectFolders(vscode, {home = os.homedir(), globalState, active = () => true, report = () => {}, cloneRepository} = {}) {
  const defaultParent = path.join(home, 'Zero Projects');
  async function chooseFolder(title, openLabel, createDefault = false) {
    if (!active()) return;
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
    if (!active()) return;
    const selection = await vscode.window.showOpenDialog({title, openLabel, canSelectFiles:false, canSelectFolders:true, canSelectMany:false, defaultUri:vscode.Uri.file(initial)});
    return active() ? selection?.[0] : undefined;
  }
  async function clone({repositoryUrl, parent: selectedParent} = {}) {
    const url = repositoryUrl || await vscode.window.showInputBox({title:'Clone from GitHub', prompt:'Paste your GitHub repository link.', placeHolder:'https://github.com/you/your-project', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
    if (!url || !active()) return;
    const destination = core.parseRepositoryUrl(url);
    const parent = selectedParent || await chooseCloneParent();
    if (!parent || !active()) return;
    if (typeof cloneRepository !== 'function') throw new Error('Connect Zero to GitHub before cloning this project.');
    const result = await cloneRepository({repositoryUrl:destination.page,parentPath:parent.fsPath});
    if (result && active()) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result), {forceNewWindow:true});
    return result;
  }
  async function chooseCloneParent() {
    const parent = await chooseFolder('Clone location', 'Clone here', true);
    if (!parent || !active()) return;
    if (globalState) {
      try {await globalState.update(CLONE_PARENT_KEY, parent.fsPath);}
      catch(error) {report(`Could not remember the clone location. ${error.message}`);}
    }
    return active() ? parent : undefined;
  }
  async function openLocal() {
    const folder = await chooseFolder('Open local project', 'Open project');
    if (!folder || !active()) return;
    const root = await core.resolveProject([folder.fsPath]);
    if (active()) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), {forceNewWindow:true});
  }
  return {clone, openLocal, chooseCloneParent};
}
module.exports = {createProjectFolders};
