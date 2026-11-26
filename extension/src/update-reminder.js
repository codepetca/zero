'use strict';

const os = require('node:os');
const path = require('node:path');
const {windowsNativeRoot} = require('./managed-java');
const {isNewer} = require('./native-update-reload');

const endpoint = 'https://zero.codepet.ca/updates/desktop.json';
const portableGuide = 'https://zero.codepet.ca/teachers/pilot#portable-windows';
const setting = 'showUpdateReminders';
const hour = 60 * 60 * 1000;
const checkInterval = 24 * hour;
const remindInterval = 7 * checkInterval;
const startupDelay = 15_000;
const busyDelay = 30_000;

function updateChannel({extensionPath}, platform, environment, home) {
  if (typeof extensionPath !== 'string') return null;
  if (platform === 'darwin') {
    const extensions = path.posix.join(home, 'Library/Application Support/Zero/editor/extensions');
    return path.posix.dirname(extensionPath) === extensions ? 'mac' : null;
  }
  if (platform !== 'win32') return null;
  const local = environment.LOCALAPPDATA;
  const marker = environment.ZERO_WINDOWS_DISTRIBUTION;
  if (typeof local !== 'string' || !/^[a-z]:[\\/]/i.test(local) || /[\x00-\x1f]/.test(local)) return null;
  try {
    const nativeRoot = windowsNativeRoot(local, path.win32.join(extensionPath, 'src'), marker);
    const extensions = path.win32.join(nativeRoot, 'editor', 'extensions');
    if (path.win32.dirname(extensionPath).toLowerCase() !== extensions.toLowerCase()) return null;
    if (marker === 'store') return 'windowsStore';
    if (marker === 'portable') return 'windowsPortable';
    if (marker === undefined && nativeRoot === path.win32.join(local, 'ZeroData')) return 'windowsInstaller';
  } catch {
    // A mismatched marker and profile does not identify a managed installation.
  }
  return null;
}

async function fetchVersion(fetchImpl, channel, signal) {
  const response = await fetchImpl(endpoint, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    headers: {Accept: 'application/json'},
  });
  if (!response.ok || !response.body) throw Error('Update versions unavailable.');
  // Bound the decoded response even when no Content-Length header is provided.
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        throw Error('Update versions exceed the response limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const latest = data?.versions?.[channel];
  if (data?.schema !== 1 || (latest !== null && !isNewer(latest, '0.0.0'))) {
    throw Error('Invalid update version.');
  }
  return latest;
}

function timeUntil(timestamp, interval, now) {
  return Number.isFinite(timestamp) && timestamp <= now ? Math.max(0, timestamp + interval - now) : 0;
}

function createUpdateReminder(vscode, {
  context, isBusy = () => false, platform = process.platform, environment = process.env,
  home = os.homedir(), fetchImpl = globalThis.fetch, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const installed = context.extension?.packageJSON?.version;
  const channel = updateChannel(context, platform, environment, home);
  if (!vscode.ExtensionMode || context.extensionMode !== vscode.ExtensionMode.Production ||
      vscode.env.remoteName || !channel || !isNewer(installed, '0.0.0')) return {dispose() {}};

  const stateKey = `zero.updateReminder.${channel}`;
  const lifetime = new AbortController();
  const pendingNotices = new Set();
  const active = () => !lifetime.signal.aborted && vscode.window.state.focused &&
    vscode.workspace.getConfiguration('zero').get(setting, true);
  let timer, failedAt, checking = false;
  function schedule(delay) {
    clearTimer(timer);
    if (!active()) return;
    timer = setTimer(check, delay);
    timer?.unref?.();
  }

  async function check() {
    if (checking || !active()) return;
    checking = true;
    let next = checkInterval;
    try {
      let saved = context.globalState.get(stateKey) ?? {};
      if (!timeUntil(saved.checkedAt, checkInterval, now())) {
        const retryDelay = timeUntil(failedAt, hour, now());
        if (retryDelay) {
          next = retryDelay;
          return;
        }
        const version = await fetchVersion(fetchImpl, channel, lifetime.signal);
        if (lifetime.signal.aborted) return;
        failedAt = undefined;
        saved = {...context.globalState.get(stateKey), version, checkedAt: now()};
        await context.globalState.update(stateKey, saved);
      }
      next = Math.max(busyDelay, timeUntil(saved.checkedAt, checkInterval, now()));
      if (!active() || !isNewer(saved.version, installed) || pendingNotices.has(saved.version)) return;
      if (saved.shownVersion === saved.version && timeUntil(saved.shownAt, remindInterval, now())) return;
      if (isBusy()) {
        next = busyDelay;
        return;
      }
      const version = saved.version;
      const portable = channel === 'windowsPortable';
      const action = portable ? 'View update instructions' : channel === 'windowsStore' ? 'Open Microsoft Store' : 'Update Zero';
      const message = `Zero ${version} is available.${portable ? ' Ask your school IT team to update this copy.' : ''}`;
      const answer = vscode.window.showInformationMessage(message, action, 'Later');
      pendingNotices.add(version);
      const shown = context.globalState.update(stateKey, {...saved, shownVersion: version, shownAt: now()});
      // A toast can disappear into the notification center without resolving.
      // Keep checking for newer releases while this notification is open.
      void Promise.resolve(answer).then(async choice => {
        if (lifetime.signal.aborted) return;
        if (choice === 'Later') {
          await shown;
          const current = context.globalState.get(stateKey);
          if (!lifetime.signal.aborted && current?.shownVersion === version) {
            await context.globalState.update(stateKey, {...current, shownAt: now()});
          }
          return;
        }
        if (choice !== action) return;
        if (portable) return vscode.env.openExternal(vscode.Uri.parse(portableGuide));
        return vscode.commands.executeCommand('zero.checkForUpdates');
      }).catch(() => {}).finally(() => pendingNotices.delete(version));
      await shown;
    } catch {
      // A blocked/offline check is ordinary on student devices. Try again later.
      failedAt = now();
      next = hour;
    } finally {
      checking = false;
      schedule(next);
    }
  }

  const focus = vscode.window.onDidChangeWindowState(() => schedule(startupDelay));
  const configuration = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(`zero.${setting}`)) schedule(startupDelay);
  });
  schedule(startupDelay);
  return {dispose() {
    lifetime.abort();
    clearTimer(timer);
    focus.dispose();
    configuration.dispose();
  }};
}

module.exports = {createUpdateReminder};
