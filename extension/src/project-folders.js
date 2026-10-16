'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const core = require('./core');

// Projects are ordinary folders. Native Git owns clone transport and credentials.
function createProjectFolders(vscode, {home = os.homedir(), active = () => true, report = () => {}} = {}) {
  const defaultParent = path.join(home, 'Zero Projects');
  async function chooseFolder(title, openLabel, createDefault = false) {
    if (!active()) return;
    let initial = defaultParent;
    try {
      if (createDefault) await fs.mkdir(defaultParent, {recursive:true});
      if (!(await fs.stat(defaultParent)).isDirectory()) throw new Error('The default project path is not a folder.');
    } catch(error) {
      initial = home;
      if (createDefault || error.code !== 'ENOENT') report(`Default project folder unavailable; choose another location. ${error.message}`);
    }
    if (!active()) return;
    const selection = await vscode.window.showOpenDialog({title, openLabel, canSelectFiles:false, canSelectFolders:true, canSelectMany:false, defaultUri:vscode.Uri.file(initial)});
    return active() ? selection?.[0] : undefined;
  }
  async function clone() {
    const url = await vscode.window.showInputBox({title:'Clone from GitHub', prompt:'Paste your GitHub repository link.', placeHolder:'https://github.com/you/your-project', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
    if (!url || !active()) return;
    const destination = core.parseRepositoryUrl(url);
    const parent = await chooseFolder('Clone location', 'Clone here', true);
    if (!parent || !active()) return;
    const extension = vscode.extensions?.getExtension('vscode.git');
    const api = extension && (extension.isActive ? extension.exports : await extension.activate()).getAPI(1);
    if (!active()) return;
    if (typeof api?.clone === 'function') {
      const result = await api.clone(vscode.Uri.parse(destination.remote), {parentPath:parent, postCloneAction:'none'});
      if (result && active()) await vscode.commands.executeCommand('vscode.openFolder', result, {forceNewWindow:true});
    } else {
      // VS Code 1.95 has no public clone API. Its native command owns opening
      // and cancellation, including the user's existing open-after-clone choice.
      await vscode.commands.executeCommand('git.clone', destination.remote, parent.fsPath);
    }
  }
  async function openLocal() {
    const folder = await chooseFolder('Open local project', 'Open project');
    if (!folder || !active()) return;
    const root = await core.resolveProject([folder.fsPath]);
    if (active()) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), {forceNewWindow:true});
  }
  return {clone, openLocal};
}
module.exports = {createProjectFolders};
