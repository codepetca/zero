'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawnSync} = require('node:child_process');
const core = require('../src/core');
const workflow = require('../src/workflow');
const {cleanupAfterMerge} = require('../src/branch-cleanup');

// Every Git process, including those spawned internally by the production code,
// inherits the OS network denial. Skip elsewhere rather than weakening it.
if (process.env.ZERO_CLEANUP_SANDBOX !== '1') {
  test('real Git cleanup runs with OS network denial', {skip:process.platform !== 'darwin'}, () => {
    const env = {PATH:process.env.PATH, ZERO_CLEANUP_SANDBOX:'1'};
    const child = spawnSync('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network*)', process.execPath, '--test', __filename], {env, encoding:'utf8', timeout:120000});
    assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  });
} else {
  const branch = 'lesson/add-score';
  const ref = `refs/heads/${branch}`;
  const remote = 'https://github.com/student/cleanup.git';

  async function assertNetworkDenied() {
    const error = await new Promise(resolve => {
      const socket = net.createConnection({host:'127.0.0.1', port:9});
      socket.once('error', resolve);
    });
    assert.equal(error.code, 'EPERM');
  }

  async function fixture(t) {
    await assertNetworkDenied();
    const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-cleanup-real-')));
    t.after(() => fs.rm(parent, {recursive:true, force:true}));
    process.env.HOME = parent;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.GIT_CONFIG_GLOBAL = os.devNull;
    process.env.GIT_TERMINAL_PROMPT = '0';
    const root = path.join(parent, 'project');
    const bare = path.join(parent, 'remote.git');
    await fs.mkdir(root);
    const run = (cwd, args, options = {}) => {
      assert.equal(cwd, root);
      assert.ok(!args.some(arg => ['reset', '--reset', 'push', 'fetch', 'pull', 'clone', 'ls-remote'].includes(arg)));
      return core.git(cwd, args, options);
    };
    const git = (...args) => run(root, args);
    // Local file transport only, with the production URL translated at this seam.
    const localTransport = args => core.git(root, ['-c', 'protocol.file.allow=always', ...args]);
    const networkRun = (cwd, args) => {
      assert.equal(cwd, root);
      const translated = [...args];
      const index = translated.indexOf(remote);
      assert.notEqual(index, -1);
      translated[index] = bare;
      assert.ok(['push', 'ls-remote', 'fetch'].includes(translated[0]));
      return localTransport(translated);
    };
    await git('init', '-b', 'main');
    await core.git(parent, ['init', '--bare', bare]);
    await git('config', 'user.name', 'Cleanup fixture');
    await git('config', 'user.email', 'cleanup@example.invalid');
    await git('config', 'core.hooksPath', os.devNull);
    await git('remote', 'add', 'origin', remote);
    await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
    await fs.writeFile(path.join(root, 'Main.java'), 'class Main {}\n');
    await git('add', 'zero.json', 'Main.java');
    await git('commit', '-m', 'Initial project');
    const base = await git('rev-parse', 'HEAD');
    await git('switch', '-c', branch);
    await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int score; }\n');
    await git('add', 'Main.java');
    await git('commit', '-m', 'Add score');
    const featureHead = await git('rev-parse', 'HEAD');
    await git('branch', 'keep', featureHead);
    await git('tag', branch, featureHead);
    await localTransport(['push', bare, `${base}:refs/heads/main`, `${featureHead}:${ref}`, `${featureHead}:refs/heads/keep`, `${featureHead}:refs/tags/${branch}`]);
    const options = {run, networkRun};
    const result = await workflow.finishPrepared(await workflow.prepareFinish(root, options), options);
    const receipt = workflow.consumeFinishedBranchCleanup(root, result);
    assert.throws(() => workflow.consumeFinishedBranchCleanup(root, result), /exact confirmed merge/);
    const localOptions = {run, receipt, expectedMain:receipt.head, expectedRemote:remote, beforeMutationNow:() => {}};
    const readRemote = async name => {
      const target = `refs/heads/${name}`;
      const output = await networkRun(root, ['ls-remote', '--heads', remote, target]);
      return output ? output.split('\t')[0] : null;
    };
    const deleteRemote = () => networkRun(root, ['push', `--force-with-lease=${ref}:${featureHead}`, remote, `:${ref}`]);
    const inspectLocal = () => workflow.inspectFinishedBranchCleanup(root, branch, featureHead, localOptions);
    const deleteLocal = () => workflow.deleteFinishedBranch(root, branch, featureHead, localOptions);
    return {root, bare, git, localTransport, receipt, featureHead, readRemote, deleteRemote, inspectLocal, deleteLocal};
  }

  test('network sockets are denied by the operating system', async () => {
    await assertNetworkDenied();
  });

  test('confirmed merge deletes only the exact feature refs', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.inspectLocal(), f.receipt);
    assert.deepEqual(await cleanupAfterMerge({...f, receipt:f.receipt}), {local:'deleted', remote:'deleted'});
    assert.equal(await f.git('rev-parse', 'refs/heads/main'), f.receipt.head);
    await f.git('merge-base', '--is-ancestor', f.featureHead, 'refs/heads/main');
    assert.equal(await f.readRemote('main'), f.receipt.head);
    assert.equal(await f.readRemote(branch), null);
    await assert.rejects(f.git('show-ref', '--verify', ref));
    assert.equal(await f.git('rev-parse', 'refs/heads/keep'), f.featureHead);
    assert.equal(await f.git('rev-parse', `refs/tags/${branch}`), f.featureHead);
    assert.equal(await f.readRemote('keep'), f.featureHead);
    assert.match(await f.localTransport(['ls-remote', f.bare, `refs/tags/${branch}`]), new RegExp(`^${f.featureHead}\\t`));
  });

  test('a remote advance after inspection fails the real deletion lease and preserves local work', async t => {
    const f = await fixture(t);
    const tree = await f.git('rev-parse', `${f.featureHead}^{tree}`);
    const advanced = await f.git('commit-tree', tree, '-p', f.featureHead, '-m', 'Remote feature advance');
    let attempted = false;
    const deleteRemote = async () => {
      await f.localTransport(['push', f.bare, `${advanced}:${ref}`]);
      attempted = true;
      await f.deleteRemote();
    };
    const outcome = await cleanupAfterMerge({...f, receipt:f.receipt, deleteRemote});
    assert.equal(attempted, true);
    assert.equal(outcome.local, 'kept');
    assert.equal(outcome.remote, 'uncertain');
    assert.equal(await f.readRemote(branch), advanced);
    assert.equal(await f.git('rev-parse', ref), f.featureHead);
    assert.equal(await f.git('rev-parse', 'refs/heads/main'), f.receipt.head);
    assert.equal(await f.readRemote('main'), f.receipt.head);
  });
}
