'use strict';
const {LESSON_IDS} = require('./tutorial-catalog');
function browserUrl(id) {
  if (!LESSON_IDS.includes(id)) throw new Error('Unknown tutorial.');
  return `https://zero.codepet.ca/tutorials/${id}`;
}

// Older supported VS Code versions do not have the desktop integrated browser.
async function openBrowser(vscode, url, label) {
  const command = 'workbench.action.browser.open';
  let commands = [];
  try { commands = await vscode.commands.getCommands(true); } catch { /* Use the regular browser. */ }
  if (commands.includes(command)) {
    try {
      await vscode.commands.executeCommand(command, {url, openToSide:true});
      return;
    } catch { /* Fall back if this host cannot open the integrated browser. */ }
  }
  if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error(`Could not open ${label} in your browser.`);
}
const openTutorialDocs = async (vscode, lessonId = '15') => openBrowser(vscode, browserUrl(lessonId), 'Tutorial Docs');
const openZeroDocs = vscode => openBrowser(vscode, 'https://zero.codepet.ca/resume-docs', 'Zero Docs');
module.exports = {openTutorialDocs, openZeroDocs};
