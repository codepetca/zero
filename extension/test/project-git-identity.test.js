'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {git} = require('../src/core');
const {configureGitIdentity} = require('../src/project-git-identity');

const account = {accountId: '17', login: 'student'};
const noreply = '17+student@users.noreply.github.com';

async function repository(t) {
  const sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-identity-')));
  const globalConfig = path.join(sandbox, 'global.gitconfig');
  const saved = {GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM};
  process.env.GIT_CONFIG_GLOBAL = globalConfig;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(sandbox, {recursive: true, force: true});
  });
  const root = path.join(sandbox, 'project');
  await fs.mkdir(root);
  await git(root, ['init', '-q', '--template=']);
  return {sandbox, root, globalConfig, localConfig: path.join(root, '.git', 'config')};
}

test('defaults allow a normal Git commit and a second account cannot replace them', async t => {
  const {root, localConfig, globalConfig} = await repository(t);
  assert.equal(await configureGitIdentity(root, account, () => true), true);
  await git(root, ['-c', 'user.useConfigOnly=true', 'commit', '--allow-empty', '-qm', 'first commit']);
  assert.equal(await git(root, ['log', '-1', '--format=%an <%ae>']), `student <${noreply}>`);
  const config = await fs.readFile(localConfig, 'utf8');
  assert.equal(await configureGitIdentity(root, {accountId: '25', login: 'other'}, () => true), false);
  assert.equal(await fs.readFile(localConfig, 'utf8'), config);
  await assert.rejects(fs.stat(globalConfig), {code: 'ENOENT'});
});

test('a local name is preserved and an email inherited through a global include is respected', async t => {
  const {root, globalConfig, localConfig} = await repository(t);
  const included = path.join(path.dirname(globalConfig), 'identity.gitconfig');
  await fs.writeFile(included, '[user]\n\temail = school@example.invalid\n');
  await fs.writeFile(globalConfig, '[include]\n\tpath = identity.gitconfig\n');
  await git(root, ['config', '--local', 'user.name', 'School-approved name']);
  const config = await fs.readFile(localConfig, 'utf8');
  assert.equal(await configureGitIdentity(root, account, () => true), false);
  assert.equal(await fs.readFile(localConfig, 'utf8'), config);
  await fs.unlink(included);
  assert.equal(await configureGitIdentity(root, account, () => true), true);
  assert.equal(await git(root, ['config', '--local', 'user.name']), 'School-approved name');
  assert.equal(await git(root, ['config', '--local', 'user.email']), noreply);
});

test('fills a missing name without replacing an existing global email', async t => {
  const {root, globalConfig} = await repository(t);
  await fs.writeFile(globalConfig, '[user]\n\temail = school@example.invalid\n');
  assert.equal(await configureGitIdentity(root, account, () => true), true);
  assert.equal(await git(root, ['config', '--local', 'user.name']), 'student');
  assert.equal(await git(root, ['config', '--get', 'user.email']), 'school@example.invalid');
  await assert.rejects(git(root, ['config', '--local', '--get', 'user.email']), {code: 1});
});

test('leaves a concurrent Git config writer in control and permits the next attempt', async t => {
  const {root, localConfig} = await repository(t);
  const lock = `${localConfig}.lock`;
  const config = await fs.readFile(localConfig, 'utf8');
  await fs.writeFile(lock, 'other writer');
  await assert.rejects(configureGitIdentity(root, account, () => true), {code: 'EEXIST'});
  assert.equal(await fs.readFile(lock, 'utf8'), 'other writer');
  assert.equal(await fs.readFile(localConfig, 'utf8'), config);
  await fs.unlink(lock);
  await git(root, ['config', '--local', 'user.email', 'chosen@example.invalid']);
  assert.equal(await configureGitIdentity(root, account, () => true), true);
  assert.equal(await git(root, ['config', '--local', 'user.email']), 'chosen@example.invalid');
});

test('skips a nested project and abandons the update when its session changes', async t => {
  const {root, localConfig} = await repository(t);
  const nested = path.join(root, 'nested');
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, 'zero.json'), '{}');
  assert.equal(await configureGitIdentity(nested, account, () => true), false);
  const config = await fs.readFile(localConfig, 'utf8');
  let checks = 0;
  assert.equal(await configureGitIdentity(root, account, () => ++checks < 4), false);
  assert.equal(await fs.readFile(localConfig, 'utf8'), config);
  await assert.rejects(fs.stat(`${localConfig}.lock`), {code: 'ENOENT'});
});
