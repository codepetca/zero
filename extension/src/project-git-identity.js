'use strict';

const fs = require('node:fs/promises');
const {O_RDONLY, O_NOFOLLOW} = require('node:fs').constants;
const path = require('node:path');
const core = require('./core');

async function missingIdentity(root) {
  let configured;
  try {
    configured = await core.git(root, ['config', '--includes', '--null', '--get-regexp', '^user\\.(name|email)$']);
  } catch (error) {
    if (error.code !== 1 || error.stderr) throw error;
    configured = '';
  }
  const keys = new Set(configured.split('\0').map(entry => entry.split('\n', 1)[0]));
  return ['name', 'email'].filter(key => !keys.has(`user.${key}`));
}

async function configureGitIdentity(root, {accountId, login}, isCurrent) {
  if (!isCurrent() || typeof accountId !== 'string' || !/^[1-9][0-9]*$/.test(accountId) ||
      typeof login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return false;
  // Discovery and mutation must refer to this project's own repository config.
  if (Object.keys(process.env).some(key => /^GIT_(DIR|COMMON_DIR|WORK_TREE|CONFIG)$/i.test(key))) return false;
  const marker = await fs.lstat(path.join(root, '.git')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!marker || marker.isSymbolicLink()) return false;
  const layout = await core.inspectGitLayout(root);
  if (!(await missingIdentity(root)).length || !isCurrent()) return false;

  const config = path.join(layout.commonDir, 'config');
  const lockPath = `${config}.lock`;
  const original = await fs.lstat(config);
  if (!original.isFile() || original.nlink !== 1) return false;
  // Use Git's config lock so a concurrent Git writer can't add a value between
  // the final read and the update. Publish both defaults in one replacement.
  const lock = await fs.open(lockPath, 'wx', 0o600);
  let updated = false;
  try {
    const missing = await missingIdentity(root);
    if (!missing.length || !isCurrent()) return false;

    const values = {name: login, email: `${accountId}+${login}@users.noreply.github.com`};
    const lines = missing.map(key => `\t${key} = ${values[key]}\n`).join('');
    const source = await fs.open(config, O_RDONLY | (O_NOFOLLOW || 0));
    let current;
    try {
      current = await source.stat();
      if (!current.isFile() || current.nlink !== 1 || !(await fs.lstat(config)).isFile()) return false;
      await lock.writeFile(await source.readFile());
    } finally {
      await source.close();
    }
    await lock.writeFile(`\n\n[user]\n${lines}`);
    await lock.chmod(current.mode & 0o777);
    await lock.close();

    if ((await core.inspectGitLayout(root)).identity !== layout.identity) return false;
    const latest = await fs.lstat(config);
    if (latest.dev !== current.dev || latest.ino !== current.ino || latest.mode !== current.mode ||
        latest.nlink !== current.nlink || latest.size !== current.size || latest.mtimeMs !== current.mtimeMs ||
        !isCurrent()) return false;
    await fs.rename(lockPath, config);
    updated = true;
    return true;
  } finally {
    await lock.close();
    if (!updated) await fs.unlink(lockPath);
  }
}

module.exports = {configureGitIdentity};
