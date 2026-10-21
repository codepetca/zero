'use strict';
const crypto = require('node:crypto');
const path = require('node:path');

const HANDOFF_KEY = 'zero.startPageHandoff';
const HANDOFF_LIFETIME = 10 * 60 * 1000;

// Opening a folder restarts the extension host and restores the destination's
// editors. Carry only the Start Page, without restoring old project files.
function createProjectWindow(vscode, {globalState, startPage, active = () => true, now = Date.now} = {}) {
  const origin = crypto.randomUUID();
  let restoring = false;
  const currentRoot = () => {
    const folders = vscode.workspace.workspaceFolders || [];
    return folders.length === 1 ? path.resolve(folders[0].uri.fsPath) : undefined;
  };
  async function clear(record) {
    if (globalState?.get(HANDOFF_KEY)?.id === record.id) await globalState.update(HANDOFF_KEY, undefined);
  }
  async function open(root, assertCurrent = async () => {}) {
    if (!active()) return;
    let record;
    try {
      if (globalState && startPage()?.isOpen() && currentRoot() !== path.resolve(root)) {
        record = {id:crypto.randomUUID(), origin, root:path.resolve(root), createdAt:now()};
        await globalState.update(HANDOFF_KEY, record);
      }
      // Persistence is asynchronous; recheck the caller's account and lifetime.
      await assertCurrent();
      if (!active()) {if (record) await clear(record);return;}
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), {forceReuseWindow:true});
      // A native unload veto can resolve this command without a switch. The
      // originating host cannot consume its own ticket; abandoned tickets expire.
    } catch (error) {
      if (record) await clear(record);
      throw error;
    }
  }
  async function restore() {
    if (!active() || restoring || !globalState) return;
    const record = globalState.get(HANDOFF_KEY);
    if (!record || record.origin === origin) return;
    const age = now() - record.createdAt;
    if (!Number.isFinite(age) || age < 0 || age > HANDOFF_LIFETIME || typeof record.root !== 'string') {
      await clear(record);return;
    }
    if (currentRoot() !== record.root) return;
    restoring = true;
    try {
      await clear(record);
      if (active() && currentRoot() === record.root && !startPage()?.isOpen()) {
        startPage()?.show({preserveFocus:true, viewColumn:vscode.ViewColumn.One});
      }
    } finally {restoring = false;}
  }
  return {open, restore};
}

module.exports = {createProjectWindow};
