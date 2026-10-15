'use strict';
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const executeFile = promisify(execFile);

function createNativeUpdateCommands(vscode, {platform = process.platform, execute = executeFile} = {}) {
  const request = url => async () => {
    if (platform !== 'darwin') {
      await vscode.window.showErrorMessage('Zero: Native update controls are available only on macOS.');
      return;
    }
    try {
      // Address Zero directly: a different registered URL handler must not receive
      // this request. The fixed cold-launch marker prevents ordinary setup before
      // LaunchServices delivers the URL; an existing process receives only the URL.
      await execute('/usr/bin/open', ['-b', 'ca.codepet.zero', url, '--args', '--update-request'], {
        shell:false, timeout:10000, killSignal:'SIGKILL', maxBuffer:64 * 1024,
        env:{PATH:'/usr/bin:/bin'}
      });
    } catch {
      // LaunchServices errors include machine-specific details. Keep recovery
      // useful without surfacing process output or interpreting it as a command.
      await vscode.window.showErrorMessage('Zero: Could not open Zero’s update controls. Install the latest Zero.app in Applications, then try again. On a school Mac, ask your teacher or IT if opening Zero is blocked.');
    }
  };
  return {
    'zero.checkForUpdates':request('zero-updates://check'),
    'zero.updateSettings':request('zero-updates://settings')
  };
}

module.exports = {createNativeUpdateCommands};
