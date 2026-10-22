'use strict';
// Recovery never kills a process. A boot-scoped, short-lived guard serializes
// compare/remove/create so competing publishers cannot reclaim each other's lock.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function cancelled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Web export cancelled.'), { name: 'AbortError' });
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'ESRCH' ? false : null; }
}
async function bootIdentity() {
  try {
    if (process.platform === 'linux') {
      const id = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
      const stat = await fs.readFile('/proc/stat', 'utf8');
      const match = /^btime (\d+)$/m.exec(stat);
      if (id && match) return { id, startedAt: Number(match[1]) * 1000 };
    } else if (process.platform === 'darwin') {
      const { stdout } = await execute('/usr/sbin/sysctl', ['-n', 'kern.boottime'], { timeout: 5000 });
      const match = /sec = (\d+), usec = (\d+)/.exec(stdout);
      if (match) return { id: match[1] + '-' + match[2], startedAt: Number(match[1]) * 1000 + Number(match[2]) / 1000 };
    } else if (process.platform === 'win32') {
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString("o")'], { timeout: 5000, windowsHide: true });
      const startedAt = Date.parse(stdout.trim());
      if (Number.isFinite(startedAt)) return { id: String(startedAt), startedAt };
    }
  } catch { /* Unknown boot identity must not establish that an old compiler died. */ }
  return null;
}
async function snapshot(file) {
  let handle;
  try {
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 4096 || before.nlink !== 1 ||
      (process.getuid && before.uid !== process.getuid()) || (process.platform !== 'win32' && (before.mode & 0o022)))
      throw new Error('The browser build lock is not a trusted ordinary file: ' + file);
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    if (stat.dev !== before.dev || stat.ino !== before.ino) throw new Error('The browser build lock changed while reading: ' + file);
    const buffer = Buffer.alloc(4097);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 4096) throw new Error('The browser build lock is too large; it was preserved: ' + file);
    const bytes = buffer.subarray(0, bytesRead).toString('utf8');
    const record = JSON.parse(bytes);
    return { stat, bytes, record };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw Object.assign(new Error('The browser build lock is unreadable; it was preserved: ' + file), { code: 'LOCK_UNREADABLE' });
    throw error;
  } finally { await handle?.close(); }
}
function valid(record, projectRoot) {
  return record && record.projectRoot === projectRoot && Number.isSafeInteger(record.pid) && record.pid > 0 &&
    typeof record.startedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.startedAt) &&
    Number.isFinite(Date.parse(record.startedAt)) && Date.parse(record.startedAt) <= Date.now() + 60000 &&
    (record.schemaVersion === undefined || (record.schemaVersion === 2 && typeof record.token === 'string' && /^[a-f0-9-]{36}$/.test(record.token) &&
      ['preparing', 'launching', 'compiling', 'finished'].includes(record.phase)));
}
function stopped(record, boot, probe, platform) {
  // A reboot also defeats PID reuse: no pre-boot compiler or owner survived it.
  if (boot && Date.parse(record.startedAt) < boot.startedAt - 1000) return true;
  if (probe(record.pid) !== false) return false;
  if (record.schemaVersion !== 2) return false; // Legacy locks did not track detached compilers.
  if (record.phase === 'preparing' || record.phase === 'finished') return true;
  if (record.phase !== 'compiling' || record.platform !== platform || platform === 'win32' ||
      !Number.isSafeInteger(record.compilerPid) || record.compilerPid <= 0) return false;
  return probe(record.compilerPid) === false && probe(-record.compilerPid) === false;
}
async function unchanged(file, original) {
  const current = await snapshot(file);
  return current && current.stat.dev === original.stat.dev && current.stat.ino === original.stat.ino && current.bytes === original.bytes;
}
async function acquireBuildLock({ locks, projectRoot, signal, onProgress = () => {}, _test = {} }) {
  const boot = _test.boot === undefined ? await bootIdentity() : _test.boot;
  const probe = _test.alive || alive;
  const platform = _test.platform || process.platform;
  const lockPath = path.join(locks, hash(projectRoot) + '.lock');
  const guardPath = lockPath + '.guard-' + hash(boot?.id || 'unknown-boot').slice(0, 24);
  const busy = reason => new Error('A browser build is already running or its lock cannot safely be recovered. ' + reason + ' Lock: ' + lockPath);
  async function guarded(action) {
    let guard;
    for (let attempt = 0; attempt < 100; attempt++) {
      cancelled(signal);
      try { guard = await fs.open(guardPath, 'wx', 0o600); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let existing;
        try { existing = await snapshot(guardPath); }
        catch (error) {
          if (error.code !== 'LOCK_UNREADABLE') throw error;
          await new Promise(resolve => setTimeout(resolve, 20));
          continue;
        }
        // Never steal an uncertain/crashed guard in the same boot. Its critical
        // section may have been interrupted between lock removal and creation.
        if (existing && (!valid(existing.record, projectRoot) || probe(existing.record.pid) !== true))
          throw busy('The recovery guard needs inspection; it was preserved.');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    if (!guard) throw busy('Another publisher is checking this project.');
    const record = { pid: process.pid, projectRoot, startedAt: new Date().toISOString(), token: crypto.randomUUID() };
    let own;
    try {
      await guard.writeFile(JSON.stringify(record));
      own = await snapshot(guardPath);
      return await action();
    } finally {
      await guard.close();
      if (own && await unchanged(guardPath, own)) await fs.unlink(guardPath);
    }
  }
  let owned;
  let launchedCompilerPid;
  let compilerRegistrationPersisted = false;
  await guarded(async () => {
    const previous = await snapshot(lockPath);
    if (previous) {
      if (!valid(previous.record, projectRoot)) throw busy('The existing lock is unfamiliar; it was preserved.');
      if (!stopped(previous.record, boot, probe, platform)) throw busy('A live or unverified compiler may still be using it.');
      if (!await unchanged(lockPath, previous)) throw busy('The lock changed while checking it.');
      await fs.unlink(lockPath);
      onProgress('Recovered an interrupted browser build');
    }
    cancelled(signal);
    const record = { schemaVersion: 2, token: crypto.randomUUID(), pid: process.pid, projectRoot, startedAt: new Date().toISOString(), phase: 'preparing', platform };
    const handle = await fs.open(lockPath, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(record)); } finally { await handle.close(); }
    owned = await snapshot(lockPath);
  });
  async function update(changes) {
    await guarded(async () => {
      if (!await unchanged(lockPath, owned)) throw busy('The build lost ownership of its lock.');
      const temporary = lockPath + '.' + owned.record.token + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify({ ...owned.record, ...changes }), { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, lockPath);
        owned = await snapshot(lockPath);
        if (changes.phase === 'compiling' && changes.compilerPid === launchedCompilerPid)
          compilerRegistrationPersisted = true;
      } finally { await fs.rm(temporary, { force: true }); }
    });
  }
  function compilerStopped() {
    const pid = launchedCompilerPid ?? (owned.record.phase === 'compiling' ? owned.record.compilerPid : undefined);
    if (pid === undefined) return true;
    // Windows has no POSIX process-group probe. Preserve the launch-gap lock if
    // registration failed even when the wrapper itself has already exited.
    if (platform === 'win32') return launchedCompilerPid === undefined || compilerRegistrationPersisted;
    return probe(pid) === false && probe(-pid) === false;
  }
  const compilerBusy = () => busy('The compiler process group is still active or unverified; its lock was preserved.');
  return {
    path: lockPath,
    trackCompiler(pid) {
      // Synchronous and independent of disk: a failed post-spawn write must not
      // make finally cleanup forget the detached compiler that was just started.
      launchedCompilerPid = pid;
      compilerRegistrationPersisted = false;
    },
    update,
    canCleanTemporary() {
      return compilerStopped();
    },
    async compilerFinished() {
      if (!compilerStopped()) throw compilerBusy();
      await update({ phase: 'finished' });
    },
    async release() {
      // Cancellation must still release the caller's lock.
      const savedSignal = signal; signal = undefined;
      try { await guarded(async () => {
        if (!await unchanged(lockPath, owned)) return;
        if (!compilerStopped()) throw compilerBusy();
        await fs.unlink(lockPath);
      }); }
      finally { signal = savedSignal; }
    }
  };
}
module.exports = { acquireBuildLock, _test: { stopped, bootIdentity, alive } };
