'use strict';

// A synthetic extension activated in VS Code's normal development host. Both it
// and the installed Zero bytes are passed as extensionDevelopmentPath entries.
// Do not use extensionTestsPath: that selects ExtensionMode.Test, not Development.
// This is not proof of an authenticated, ordinary installed student session.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = process.env.ZERO_EDITOR_PROOF_DIRECTORY;
const started = Date.now();
function bounded(operation, seconds = 30) {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Hosted editor command timed out.')), seconds * 1000);
  })]).finally(() => clearTimeout(timer));
}
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

async function run(context) {
  let stage = 'driver-activated';
  const receipt = {schema:1, version:'0.5.86', outcome:'failed',
    driverExtensionMode:context.extensionMode,
    execution:'installed extension bytes and synthetic driver in normal VS Code development host; offline policy',
    limitations:['No authenticated student session, Store signing, physical Windows, browser build or live publication acceptance.']};
  async function progress(next, fields = {}) {
    stage = next;
    await writeJson('progress.json', {schema:1, stage, driverExtensionMode:context.extensionMode, elapsedSeconds:Math.round((Date.now()-started)/1000), ...fields});
  }
  try {
    // Persist before activating Zero or executing any command. A missing receipt
    // now means the driver did not start, rather than an awaited sign-in command.
    await progress('driver-activated');
    assert.equal(context.extensionMode, vscode.ExtensionMode.Development);
    assert.equal(process.platform, 'win32');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.ok(path.isAbsolute(directory));
    const extension = vscode.extensions.getExtension('zero.zero');
    assert.ok(extension);
    assert.equal(await fs.realpath(extension.extensionPath), await fs.realpath(process.env.ZERO_EDITOR_PROOF_EXTENSION));
    assert.equal(extension.packageJSON.version, receipt.version);
    await progress('activating-exact-extension');
    await bounded(() => extension.activate(), 45);
    assert.equal(vscode.workspace.isTrusted, true);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.equal(await fs.realpath(root), await fs.realpath(process.env.ZERO_EDITOR_PROOF_PROJECT));
    await progress('opening-start-page');
    await bounded(() => vscode.commands.executeCommand('zero.startPage'));
    await progress('awaiting-start-page-accessibility');
    await phase('start-page');
    receipt.visibleStartPage = 'uia-acknowledged';
    await bounded(() => vscode.commands.executeCommand('workbench.action.closeActiveEditor'));

    await progress('real-native-compiler-source-error');
    const main = vscode.Uri.file(path.join(root, 'src', 'main', 'java', 'Main.java'));
    const text = await fs.readFile(main.fsPath, 'utf8');
    assert.ok(text.includes('ZERO_SYNTHETIC_COMPILER_ERROR'));
    const matchesTask = task => task.definition.type === 'zero' && ['run', 'native-run'].includes(task.definition.task);
    const lifecycle = {started:0, ended:0, processStarted:0, processEnded:0, exitCode:null};
    const snapshot = () => ({...lifecycle,
      activeTasks:vscode.tasks.taskExecutions.filter(item => matchesTask(item.task)).length,
      mainErrors:vscode.languages.getDiagnostics(main).filter(item => item.severity === vscode.DiagnosticSeverity.Error).length,
      compilerErrors:vscode.languages.getDiagnostics(main).filter(item => item.severity === vscode.DiagnosticSeverity.Error && item.source === 'Zero Java compiler').length});
    const listeners = [
      vscode.tasks.onDidStartTask(event => { if (matchesTask(event.execution.task)) lifecycle.started++; }),
      vscode.tasks.onDidEndTask(event => { if (matchesTask(event.execution.task)) lifecycle.ended++; }),
      vscode.tasks.onDidStartTaskProcess(event => { if (matchesTask(event.execution.task)) lifecycle.processStarted++; }),
      vscode.tasks.onDidEndTaskProcess(event => { if (matchesTask(event.execution.task)) { lifecycle.processEnded++; lifecycle.exitCode=Number.isInteger(event.exitCode)?event.exitCode:null; } })
    ];
    try {
      await bounded(() => vscode.commands.executeCommand('zero.runNativeApp'));
      let lastProgress = 0;
      await wait(async () => {
        const current = snapshot();
        if (Date.now()-lastProgress >= 2000) { await progress('awaiting-native-compiler-diagnostic', {nativeTask:current}); lastProgress=Date.now(); }
        return current.ended > 0 && current.compilerErrors > 0;
      });
    } finally { receipt.nativeTask=snapshot(); for (const listener of listeners) listener.dispose(); }
    const errors = vscode.languages.getDiagnostics(main).filter(item => item.severity === vscode.DiagnosticSeverity.Error && item.source === 'Zero Java compiler');
    assert.ok(errors.length > 0);
    assert.ok(errors.some(item => item.range.start.line >= 0 && item.range.start.line < text.split('\n').length));
    receipt.compilerError = {source:'synthetic Main.java', diagnostics:errors.length, localSourceLine:true};
    await progress('opening-source-error-sidebar');
    await bounded(() => vscode.commands.executeCommand('zero.showSidebar'));
    await progress('awaiting-source-error-accessibility');
    await phase('source-error');
    receipt.visibleRecovery = 'uia-acknowledged';
    receipt.outcome = 'passed';
    await progress('completed');
  } catch (error) {
    receipt.stage = stage;
    receipt.failure = error?.code === 'ERR_ASSERTION' ? 'assertion' : 'host-check-or-timeout';
    // Public command exposes the synthetic task console for the failure capture;
    // no terminal contents, source text or raw logs enter the JSON receipt.
    await bounded(() => vscode.commands.executeCommand('workbench.action.terminal.focus'), 10).catch(() => {});
    throw error;
  } finally {
    await writeJson('host-proof.json', receipt);
  }
}

exports.activate = context => {
  // Keep ordinary extension activation finite; run reports its own final result.
  void run(context).catch(() => {});
};
