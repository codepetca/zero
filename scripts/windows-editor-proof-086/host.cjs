'use strict';

// VS Code's documented extension test entry point. It exercises the installed
// bytes in ExtensionMode.Development, whose existing policy allows offline use.
// This is not proof of an authenticated, ordinary installed student session.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = process.env.ZERO_EDITOR_PROOF_DIRECTORY;
async function writeJson(filename, value) {
  const target = path.join(directory, filename);
  await fs.writeFile(`${target}.new`, JSON.stringify(value));
  await fs.rename(`${target}.new`, target);
}
async function wait(check, seconds = 90) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(250);
  }
  throw new Error('Hosted editor proof timed out.');
}
async function phase(name) {
  await writeJson('phase.json', {phase:name});
  await wait(async () => fs.stat(path.join(directory, `${name}.ack`)).then(() => true, () => false));
}

exports.run = async function run() {
  let stage = 'activate-exact-extension';
  const receipt = {schema:1, version:'0.5.86', outcome:'failed',
    execution:'installed extension bytes in supported VS Code development/test host; offline policy',
    limitations:['No authenticated student session, Store signing, physical Windows, browser build or live publication acceptance.']};
  try {
    assert.equal(process.platform, 'win32');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.ok(path.isAbsolute(directory));
    const extension = vscode.extensions.getExtension('zero.zero');
    assert.ok(extension);
    assert.equal(await fs.realpath(extension.extensionPath), await fs.realpath(process.env.ZERO_EDITOR_PROOF_EXTENSION));
    assert.equal(extension.packageJSON.version, receipt.version);
    await extension.activate();
    assert.equal(vscode.workspace.isTrusted, true);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.equal(await fs.realpath(root), await fs.realpath(process.env.ZERO_EDITOR_PROOF_PROJECT));
    stage = 'visible-start-page';
    await vscode.commands.executeCommand('zero.startPage');
    await phase('start-page');
    receipt.visibleStartPage = 'uia-acknowledged';
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    stage = 'real-native-compiler-source-error';
    const main = vscode.Uri.file(path.join(root, 'src', 'main', 'java', 'Main.java'));
    const text = await fs.readFile(main.fsPath, 'utf8');
    assert.ok(text.includes('ZERO_SYNTHETIC_COMPILER_ERROR'));
    let taskEnded = false;
    const listener = vscode.tasks.onDidEndTask(event => {
      if (event.execution.task.definition.type === 'zero' && ['run', 'native-run'].includes(event.execution.task.definition.task)) taskEnded = true;
    });
    try {
      await vscode.commands.executeCommand('zero.runNativeApp');
      await wait(async () => taskEnded && vscode.languages.getDiagnostics(main).some(item => item.severity === vscode.DiagnosticSeverity.Error));
    } finally { listener.dispose(); }
    const errors = vscode.languages.getDiagnostics(main).filter(item => item.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(item => item.range.start.line >= 0 && item.range.start.line < text.split('\n').length));
    receipt.compilerError = {source:'synthetic Main.java', diagnostics:errors.length, localSourceLine:true};
    await vscode.commands.executeCommand('zero.showSidebar');
    await phase('source-error');
    receipt.visibleRecovery = 'uia-acknowledged';
    receipt.outcome = 'passed';
  } catch (error) {
    receipt.stage = stage;
    receipt.failure = error?.code === 'ERR_ASSERTION' ? 'assertion' : 'host-check-or-timeout';
    throw error;
  } finally {
    await writeJson('host-proof.json', receipt);
  }
};
