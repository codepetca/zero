'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const core = require('./core');

const CLONE_PARENT_KEY = 'zero.cloneParent';

// Projects are ordinary folders. Native Git owns clone transport and credentials.
function createProjectFolders(vscode, {home = os.homedir(), globalState, active = () => true, report = () => {}} = {}) {
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
  async function clone() {
    const url = await vscode.window.showInputBox({title:'Clone from GitHub', prompt:'Paste your GitHub repository link.', placeHolder:'https://github.com/you/your-project', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
    if (!url || !active()) return;
    const destination = core.parseRepositoryUrl(url);
    const parent = await chooseFolder('Clone location', 'Clone here', true);
    if (!parent || !active()) return;
    // Remember the selected parent, rather than a returned clone folder, which
    // native Git may resolve to an existing clone elsewhere. This stays local to
    // the editor profile; it is not registered for Settings Sync.
    if (globalState) {
      try {await globalState.update(CLONE_PARENT_KEY, parent.fsPath);}
      catch(error) {report(`Could not remember the clone location. ${error.message}`);}
    }
    if (!active()) return;
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
