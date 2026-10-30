'use strict';
const {LESSON_IDS} = require('./tutorial-catalog');
function browserUrl(id) {
  if (!LESSON_IDS.includes(id)) throw new Error('Unknown tutorial.');
  return `https://zero.codepet.ca/tutorials/${id}`;
}

// Older supported VS Code versions do not have the desktop integrated browser.
async function openTutorialDocs(vscode, lessonId = '15') {
  const url = browserUrl(lessonId);
  const command = 'workbench.action.browser.open';
  let commands = [];
  try { commands = await vscode.commands.getCommands(true); } catch { /* Use the regular browser. */ }
  if (commands.includes(command)) {
    try {
      await vscode.commands.executeCommand(command, {url, openToSide:true});
      return;
    } catch { /* Fall back if this host cannot open the integrated browser. */ }
  }
  if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error('Could not open Tutorial Docs in your browser.');
}
module.exports = {openTutorialDocs};
