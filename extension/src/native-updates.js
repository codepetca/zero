'use strict';
const {execFile, spawn} = require('node:child_process');
const path = require('node:path');
const {promisify} = require('node:util');
const executeFile = promisify(execFile);

// Wait only for process creation, never for the native updater window to close.
// A stuck handoff fails after a bounded wait without terminating the controller.
function launchWindowsUpdater(executable, argument, spawnProcess) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, [argument], {
      shell:false, windowsHide:true, detached:false, stdio:'ignore'
    });
    const timer = setTimeout(() => {
      child.unref();
      reject(new Error('Native updater handoff timed out'));
    }, 5000);
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('spawn', () => {
      clearTimeout(timer);
      child.unref();
      resolve();
    });
  });
}

function windowsUpdaterPath(environment) {
  const local = environment.LOCALAPPDATA;
  // A root-relative path or network share is not the local per-user install.
  if (typeof local !== 'string' || !path.win32.isAbsolute(local) ||
      !/^[a-z]:[\\/]/i.test(local) || /[\x00-\x1f]/.test(local)) {
    throw new Error('Local application data path is unavailable');
  }
  return path.win32.join(local, 'Zero', 'Zero.exe');
}

function createNativeUpdateCommands(vscode, {
  platform = process.platform, execute = executeFile,
  spawnProcess = spawn, environment = process.env
} = {}) {
  const request = (url, argument) => async () => {
    if (platform !== 'darwin' && platform !== 'win32') {
      await vscode.window.showErrorMessage('Zero: Native update controls are available only on macOS and Windows.');
      return;
    }
    try {
      if (platform === 'win32' && ['store', 'msix-feasibility'].includes(environment.ZERO_WINDOWS_DISTRIBUTION)) {
        const opened = await vscode.env.openExternal(vscode.Uri.parse('ms-windows-store://downloadsandupdates'));
        if (!opened) throw new Error('Store could not open');
        return;
      }
      if (platform === 'win32') {
        await launchWindowsUpdater(windowsUpdaterPath(environment), argument, spawnProcess);
        return;
      }
      // Address Zero directly: a different registered URL handler must not receive
      // this request. The fixed cold-launch marker prevents ordinary setup before
      // LaunchServices delivers the URL; an existing process receives only the URL.
      await execute('/usr/bin/open', ['-b', 'ca.codepet.zero', url, '--args', '--update-request'], {
        shell:false, timeout:10000, killSignal:'SIGKILL', maxBuffer:64 * 1024,
        env:{PATH:'/usr/bin:/bin'}
      });
    } catch {
      // Native launch errors include machine-specific details. Keep recovery
      // useful without surfacing process output or interpreting it as a command.
      if (platform === 'win32' && ['store', 'msix-feasibility'].includes(environment.ZERO_WINDOWS_DISTRIBUTION)) {
        await vscode.window.showErrorMessage('Zero: Could not open Microsoft Store. Open its Library to manage updates, or ask your teacher or IT if the Store is blocked.');
        return;
      }
      if (platform === 'win32') {
        await vscode.window.showErrorMessage('Zero: Could not open Zero’s update controls. Install the latest Zero for Windows, then try again. On a school computer, ask your teacher or IT if opening Zero is blocked.');
        return;
      }
      await vscode.window.showErrorMessage('Zero: Could not open Zero’s update controls. Install the latest Zero.app in Applications, then try again. On a school Mac, ask your teacher or IT if opening Zero is blocked.');
    }
  };
  return {
    'zero.checkForUpdates':request('zero-updates://check', '--check-for-updates'),
    'zero.updateSettings':request('zero-updates://settings', '--update-settings')
  };
}

module.exports = {createNativeUpdateCommands};
