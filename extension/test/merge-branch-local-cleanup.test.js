'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {existsSync} = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const workflow = require('../src/workflow');
const {preflightDirectMain} = require('../src/direct-main-transaction');

const branch = 'lesson/add-score';
const featureRef = `refs/heads/${branch}`;
const remote = 'https://github.com/student/cleanup.git';

async function fixture(t, {onFeature = false, refStorage} = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-local-cleanup-')));
  t.after(() => fs.rm(parent, {recursive:true, force:true}));
  const root = path.join(parent, 'project');
  await fs.mkdir(root);
  const run = (cwd, args, options = {}) => {
    assert.equal(cwd, root);
    assert.ok(!args.some(arg => ['reset', '--reset', 'push', 'fetch', 'pull', 'clone', 'ls-remote'].includes(arg)));
    const env = {...(options.env || process.env), GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull};
    return core.git(cwd, args, {...options, env});
  };
  const git = (...args) => run(root, args);
  try { await git('init', '-b', 'main', ...(refStorage ? [`--ref-format=${refStorage}`] : [])); }
  catch (error) {
    if (refStorage && /unknown option.*ref-format/i.test(error.stderr || '')) {
      t.skip('This Git does not support reftable repositories.');
      return null;
    }
    throw error;
  }
  await git('config', 'user.name', 'Cleanup fixture');
  await git('config', 'user.email', 'cleanup@example.invalid');
  await git('config', 'core.hooksPath', os.devNull);
  await git('remote', 'add', 'origin', remote);
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.writeFile(path.join(root, '.gitignore'), 'private.txt\n');
  await fs.writeFile(path.join(root, 'private.txt'), 'keep this file\n');
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main {}\n');
  await git('add', 'zero.json', '.gitignore', 'Main.java');
  await git('commit', '-m', 'Initial project');
  const base = await git('rev-parse', 'HEAD');
  await git('switch', '-c', branch);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int score; }\n');
  await git('add', 'Main.java');
  await git('commit', '-m', 'Add score');
  const featureHead = await git('rev-parse', 'HEAD');
  if (!onFeature) {
    await git('switch', 'main');
    await git('merge', '--ff-only', featureRef);
  }
  return {root, parent, run, git, base, featureHead, expectedMain:featureHead};
}

function cleanup(f, options = {}) {
  return workflow.deleteFinishedBranch(f.root, branch, f.featureHead, {
    run:f.run, expectedMain:f.expectedMain, expectedRemote:remote, beforeMutationNow:() => {}, ...options
  });
}

test('only the exact confirmed finish result yields a single cleanup receipt', async t => {
  const f = await fixture(t, {onFeature:true});
  let remoteMain = f.base;
  const networkRun = async (root, args) => {
    assert.equal(root, f.root);
    if (args[0] === 'push') {
      assert.equal(args[1], remote);
      assert.match(args[2], /^[a-f0-9]{40}:refs\/heads\/main$/);
      remoteMain = args[2].split(':')[0];
      return '';
    }
    assert.deepEqual(args, ['ls-remote', '--heads', remote, 'refs/heads/main']);
    return `${remoteMain}\trefs/heads/main`;
  };
  const options = {run:f.run, networkRun};
  const result = await workflow.finishPrepared(await workflow.prepareFinish(f.root, options), options);
  assert.equal(result.head, remoteMain);
  assert.throws(() => workflow.consumeFinishedBranchCleanup(f.root, {...result}), /exact confirmed merge/);
  assert.throws(() => workflow.consumeFinishedBranchCleanup(f.parent, result), /exact confirmed merge/);
  const receipt = workflow.consumeFinishedBranchCleanup(f.root, result);
  assert.deepEqual(receipt, {root:f.root, branch, head:remoteMain, featureHead:f.featureHead, remote, page:remote.slice(0,-4)});
  assert.ok(Object.isFrozen(receipt));
  assert.throws(() => workflow.consumeFinishedBranchCleanup(f.root, result), /exact confirmed merge/);
  const localOptions = {run:f.run, receipt, expectedMain:receipt.head, expectedRemote:receipt.remote};
  const local = await workflow.inspectFinishedBranchCleanup(f.root, branch, f.featureHead, localOptions);
  assert.deepEqual(local, receipt);
  await assert.rejects(workflow.inspectFinishedBranchCleanup(f.root, branch, f.featureHead, {...localOptions, receipt:{...receipt}}), /exact confirmed merge/);
  const headLock = path.join(f.root, '.git', 'HEAD.lock');
  await fs.writeFile(headLock, 'simulated competing HEAD lock', {flag:'wx'});
  try {
    await assert.rejects(workflow.inspectFinishedBranchCleanup(f.root, branch, f.featureHead, localOptions), /transaction/);
  } finally { await fs.unlink(headLock); }
  const inspect = core.inspectGitLayout;
  try {
    core.inspectGitLayout = async (...args) => ({...await inspect(...args), identity:'different repository instance'});
    await assert.rejects(workflow.inspectFinishedBranchCleanup(f.root, branch, f.featureHead, localOptions), /changed after review/);
    await assert.rejects(cleanup(f, localOptions), /changed after review/);
  } finally { core.inspectGitLayout = inspect; }
  assert.equal(await f.git('rev-parse', featureRef), f.featureHead);
});

test('deletes the exact packed branch while preserving main, files, index, tag and Git settings', async t => {
  const f = await fixture(t);
  await f.git('tag', branch, f.featureHead);
  await f.git('config', `branch.${branch}.remote`, 'origin');
  await f.git('pack-refs', '--all');
  const indexPath = path.join(f.root, '.git', 'index');
  const before = await fs.readFile(indexPath);
  assert.deepEqual(await cleanup(f), {deleted:true, branch});
  await assert.rejects(f.git('show-ref', '--verify', featureRef));
  assert.equal(await f.git('symbolic-ref', 'HEAD'), 'refs/heads/main');
  assert.equal(await f.git('rev-parse', 'refs/heads/main'), f.expectedMain);
  assert.equal(await f.git('rev-parse', `refs/tags/${branch}`), f.featureHead);
  assert.equal(await f.git('config', `branch.${branch}.remote`), 'origin');
  assert.deepEqual(await fs.readFile(indexPath), before);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'class Main { int score; }\n');
  assert.equal(await fs.readFile(path.join(f.root, 'private.txt'), 'utf8'), 'keep this file\n');
});

test('removes only the finished local ref in a reftable repository', async t => {
  const f = await fixture(t, {refStorage:'reftable'});
  if (!f) return;
  assert.deepEqual(await cleanup(f), {deleted:true, branch});
  await assert.rejects(f.git('show-ref', '--verify', featureRef));
  assert.equal(await f.git('symbolic-ref', 'HEAD'), 'refs/heads/main');
  assert.equal(await f.git('rev-parse', 'refs/heads/main'), f.expectedMain);
});

test('read-only cleanup preflight refuses filesystem links in ref storage', {skip:process.platform==='win32'}, async t => {
  const table = '0x000000000001-0x000000000003-4b0dc113.ref';
  const cases = [
    ['files', 'refs/heads/lesson', 'dir'],
    ['files', 'refs/heads/main', 'file'],
    ['files', 'logs/refs/heads/lesson', 'dir'],
    ['files', 'packed-refs', 'file'],
    ['reftable', 'reftable', 'dir'],
    ['reftable', 'reftable/tables.list', 'file'],
    ['reftable', `reftable/${table}`, 'file']
  ];
  for (const [format, linkedPath, type] of cases) {
    const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-cleanup-ref-path-')));
    t.after(() => fs.rm(parent, {recursive:true, force:true}));
    const root = path.join(parent, 'project');
    const gitDir = path.join(root, '.git');
    const outside = path.join(parent, 'outside');
    const sentinel = path.join(outside, 'keep');
    const link = path.join(gitDir, linkedPath);
    await fs.mkdir(outside);
    await fs.writeFile(sentinel, 'outside content\n');
    await fs.mkdir(path.dirname(link), {recursive:true});
    await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    if (linkedPath === `reftable/${table}`) await fs.writeFile(path.join(gitDir, 'reftable', 'tables.list'), `${table}\n`);
    await fs.symlink(type === 'dir' ? outside : sentinel, link, type);
    const run = async (cwd, args) => {
      assert.equal(cwd, root);
      assert.deepEqual(args, ['-c', 'core.fsmonitor=false', 'rev-parse', '--show-ref-format']);
      return format;
    };
    await assert.rejects(preflightDirectMain(root, gitDir, {run, allowReftable:true, skipProbe:true, cleanupBranch:branch}), /unsafe path/, linkedPath);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'outside content\n');
    assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
  }
});

test('a same-OID symbolic replacement after review is kept with its target', async t => {
  const f = await fixture(t);
  const target = 'refs/heads/retained-target';
  await f.git('branch', 'retained-target', f.featureHead);
  const run = async (root, args, options) => {
    if (args.includes('--show-ref-format')) await f.git('symbolic-ref', featureRef, target);
    return f.run(root, args, options);
  };
  await assert.rejects(cleanup(f, {run}), /symbolic reference/);
  assert.equal(await f.git('symbolic-ref', '--no-recurse', featureRef), target);
  assert.equal(await f.git('rev-parse', target), f.featureHead);
  assert.equal(await f.git('rev-parse', 'refs/heads/main'), f.expectedMain);
});

test('a main ref advance after review aborts cleanup even when it includes the feature', async t => {
  const f = await fixture(t);
  let newMain;
  const run = async (root, args, options) => {
    if (args.includes('--show-ref-format')) {
      await f.git('commit', '--allow-empty', '-m', 'External main advance');
      newMain = await f.git('rev-parse', 'HEAD');
    }
    return f.run(root, args, options);
  };
  await assert.rejects(cleanup(f, {run}), /could not delete/);
  assert.notEqual(newMain, f.expectedMain);
  assert.equal(await f.git('rev-parse', 'refs/heads/main'), newMain);
  assert.equal(await f.git('rev-parse', featureRef), f.featureHead);
});

test('prepared cleanup holds HEAD and main locks and rejects an unexpected HEAD target', async t => {
  const f = await fixture(t);
  const headLock = path.join(f.root, '.git', 'HEAD.lock');
  const mainLock = path.join(f.root, '.git', 'refs', 'heads', 'main.lock');
  let checkedUnderLock = false;
  const run = (root, args, options) => {
    if (args[0] === 'symbolic-ref' && args.at(-1) === 'HEAD' && existsSync(headLock)) {
      assert.ok(existsSync(mainLock));
      checkedUnderLock = true;
      return featureRef;
    }
    return f.run(root, args, options);
  };
  await assert.rejects(cleanup(f, {run}), /Switch to clean main/);
  assert.equal(checkedUnderLock, true);
  assert.equal(await f.git('symbolic-ref', 'HEAD'), 'refs/heads/main');
  assert.equal(await f.git('rev-parse', featureRef), f.featureHead);
  assert.equal(existsSync(headLock), false);
  assert.equal(existsSync(mainLock), false);
});

test('edits and a synchronous authority change abort cleanup after Git locks the refs', async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'Main.java');
  await assert.rejects(cleanup(f, {beforeMutationNow:() => {throw new Error('The workspace changed.');}}), /workspace changed/);
  assert.equal(await f.git('rev-parse', featureRef), f.featureHead);
  await assert.rejects(cleanup(f, {beforeMutation:() => fs.writeFile(file, 'new local work\n')}), /local commit/);
  assert.equal(await fs.readFile(file, 'utf8'), 'new local work\n');
  assert.equal(await f.git('rev-parse', featureRef), f.featureHead);
});

test('cleanup refuses replacement objects, hidden edits and additional worktrees', async t => {
  const f = await fixture(t);
  await f.git('replace', f.featureHead, f.base);
  await assert.rejects(cleanup(f), /replacement objects/);
  await f.git('replace', '-d', f.featureHead);
  await f.git('update-index', '--assume-unchanged', 'Main.java');
  await assert.rejects(cleanup(f), /index flags/);
  await f.git('update-index', '--no-assume-unchanged', 'Main.java');
  await f.git('worktree', 'add', path.join(f.parent, 'linked'), branch);
  await assert.rejects(cleanup(f), /multiple Git worktrees/);
  assert.equal(await f.git('rev-parse', featureRef), f.featureHead);
});

test('local deletion does not run a configured reference hook', {skip:process.platform==='win32'}, async t => {
  const f = await fixture(t);
  const hooks = path.join(f.root, '.git', 'cleanup-hooks');
  const sentinel = path.join(f.root, '.git', 'hook-ran');
  await fs.mkdir(hooks);
  await fs.writeFile(path.join(hooks, 'reference-transaction'), '#!/bin/sh\nprintf ran > .git/hook-ran\n', {mode:0o755});
  await f.git('config', 'core.hooksPath', hooks);
  await f.git('branch', 'hook-proof', f.featureHead);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'ran');
  await fs.unlink(sentinel);
  await cleanup(f);
  await assert.rejects(fs.lstat(sentinel), {code:'ENOENT'});
  assert.equal(await f.git('rev-parse', 'refs/heads/hook-proof'), f.featureHead);
});
