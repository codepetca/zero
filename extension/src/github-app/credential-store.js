'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {failure, wait} = require('./device-flow');
const SECRET_KEY = 'zero.githubApp.credentials.v1';
function binding(configuration) { return `${configuration.appId}:${configuration.clientId}:${configuration.owner}:${configuration.slug}`; }
function validateRecord(record, configuration) {
  if (!record || record.schema !== 1 || record.app !== binding(configuration) ||
      typeof record.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(record.sessionId) ||
      !record.account || typeof record.account.id !== 'string' || !/^[1-9][0-9]*$/.test(record.account.id) || typeof record.account.label !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(record.account.label) ||
      !['active','refreshing','reconnect'].includes(record.state) ||
      typeof record.accessToken !== 'string' || !/^ghu_[A-Za-z0-9_]{8,512}$/.test(record.accessToken) ||
      typeof record.refreshToken !== 'string' || !/^ghr_[A-Za-z0-9_]{8,512}$/.test(record.refreshToken) ||
      !Number.isSafeInteger(record.expiresAt) || !Number.isSafeInteger(record.refreshExpiresAt) || record.expiresAt < 1 || record.refreshExpiresAt < record.expiresAt) {
    throw failure('invalid-credentials', 'The saved Zero connection is invalid. Sign out of Zero and sign in again.');
  }
  return record;
}
function createCredentialStore({secrets, configuration}) {
  return {
    async read() {
      let raw;
      try { raw = await secrets.get(SECRET_KEY); } catch { throw failure('storage-unavailable', 'Zero connection storage is unavailable.'); }
      if (!raw) return undefined;
      try { return validateRecord(JSON.parse(raw), configuration); }
      catch { throw failure('invalid-credentials', 'The saved Zero connection is invalid. Sign out of Zero and sign in again.'); }
    },
    async write(record) {
      validateRecord(record, configuration);
      try { await secrets.store(SECRET_KEY, JSON.stringify(record)); }
      catch { throw failure('storage-unavailable', 'Zero connection storage did not confirm the update. Try again.'); }
    },
    async clear() {
      try { await secrets.delete(SECRET_KEY); }
      catch { throw failure('storage-unavailable', 'Zero connection storage did not confirm sign-out. Try again.'); }
    },
    async raw() {
      try { return await secrets.get(SECRET_KEY); }
      catch { throw failure('storage-unavailable', 'Zero connection storage is unavailable.'); }
    }
  };
}
// Lock files contain ownership metadata only. A persisted refreshing state also
// protects rotation if a host crashes after GitHub consumes its refresh token.
function createCredentialLock({globalStorageUri, now = Date.now, sleep = wait, timeoutMs = 20000}) {
  if (globalStorageUri?.scheme !== 'file' || !path.isAbsolute(globalStorageUri.fsPath || '')) {
    throw failure('local-storage-required', 'Zero GitHub sign-in requires local extension storage.');
  }
  const directory = globalStorageUri.fsPath;
  const lockPath = path.join(directory, 'github-app-refresh.lock');
  const recoveryPath = path.join(directory, 'github-app-refresh.recovery.lock');
  async function readLock() {
    try {
      const stat = await fs.lstat(lockPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048) return undefined;
      return JSON.parse(await fs.readFile(lockPath, 'utf8'));
    } catch { return undefined; }
  }
  async function recover() {
    let recovery;
    try { recovery = await fs.open(recoveryPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') return; throw error; }
    try {
      const owner = await readLock();
      if (!owner || owner.host !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid < 1 || !Number.isFinite(owner.startedAt) || now() - owner.startedAt < 120000) return;
      try { process.kill(owner.pid, 0); return; }
      catch (error) { if (error.code !== 'ESRCH') return; }
      // The recovery lock serializes stale inspection/removal among contenders.
      const current = await readLock();
      if (current?.nonce === owner.nonce) await fs.unlink(lockPath);
    } finally { await recovery.close(); await fs.unlink(recoveryPath).catch(() => {}); }
  }
  return async function withLock(callback, signal) {
    await fs.mkdir(directory, {recursive:true, mode:0o700});
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('unsafe-storage', 'Zero connection storage is unavailable.');
    const nonce = randomUUID(); const deadline = now() + timeoutMs;
    while (true) {
      if (signal?.aborted) throw failure('cancelled', 'GitHub sign-in was cancelled.');
      let handle;
      try { handle = await fs.open(lockPath, 'wx', 0o600); }
      catch (error) {
        if (error.code !== 'EEXIST') throw failure('storage-unavailable', 'Zero connection storage is unavailable.');
        await recover();
        if (now() >= deadline) throw failure('connection-busy', 'Another Zero window is updating this connection. Try again shortly.');
        await sleep(100, signal); continue;
      }
      try {
        await handle.writeFile(JSON.stringify({nonce, pid:process.pid, host:os.hostname(), startedAt:now()}));
        await handle.close(); handle = undefined;
        return await callback();
      } finally {
        await handle?.close();
        const owner = await readLock();
        if (owner?.nonce === nonce) await fs.unlink(lockPath).catch(() => {});
      }
    }
  };
}
module.exports = {SECRET_KEY, binding, validateRecord, createCredentialStore, createCredentialLock};
