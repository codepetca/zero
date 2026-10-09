'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const workflow = require('../src/workflow');
const remote = 'https://github.com/student/workflow.git';
async function write(root, filename, content) { await fs.writeFile(path.join(root, filename), content); }
async function commit(root, filename, content) {
  await write(root, filename, content);
  await core.git(root, ['add', '--', filename]);
  await core.git(root, ['commit', '-m', 'Test change']);
  return core.git(root, ['rev-parse', 'HEAD']);
}
async function fixture(t, {empty = false, unborn = false} = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-workflow-')));
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  const root = path.join(parent, 'student'); const bare = path.join(parent, 'remote.git');
  await fs.mkdir(root); await fs.mkdir(bare);
  await core.git(bare, ['init', '--bare', '--initial-branch=main']);
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', 'user.name', 'Test']);
  await core.git(root, ['config', 'user.email', 'test@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', remote]);
  await write(root, 'zero.json', '{}\n'); await write(root, '.gitignore', 'secret.txt\n');
  await write(root, 'secret.txt', 'kept locally'); await write(root, 'Main.java', 'class Main {}\n');
  if (!unborn) {
    await core.git(root, ['add', 'zero.json', '.gitignore', 'Main.java']);
    await core.git(root, ['commit', '-m', 'Initial project']);
    if (!empty) await core.git(root, ['push', bare, 'HEAD:refs/heads/main']);
  }
  const calls = []; let failPush = false; let hook;
  const networkRun = async (cwd, args) => {
    calls.push(args);
    assert.ok(['ls-remote', 'fetch', 'push'].includes(args[0]));
    assert.ok(args.includes(remote));
    if (hook) await hook(cwd, args);
    if (failPush && args[0] === 'push') throw Object.assign(new Error('SECRET'), {stderr: 'network failed SECRET'});
    // Test-only transport redirects an exact reviewed URL to a disposable local bare repository.
    return core.git(cwd, args.map(arg => arg === remote ? bare : arg));
  };
  const run = (cwd, args) => { assert.ok(!['push', 'fetch', 'ls-remote', 'pull', 'clone'].includes(args[0]), 'Production local runner must not receive network work'); return core.git(cwd, args); };
  return {root, bare, parent, calls, run, networkRun, options: {run, networkRun}, setFailure(value) { failPush = value; }, setHook(value) { hook = value; }};
}
async function start(f, name = 'add-score') {
  const plan = await workflow.prepareStart(f.root, name, f.options);
  return workflow.startPrepared(plan, f.options);
}
async function finish(f) { return workflow.finishPrepared(await workflow.prepareFinish(f.root, f.options), f.options); }
async function remoteChange(f, filename, content) {
  const other = path.join(f.parent, 'other');
  try { await fs.access(other); } catch {
    await core.git(f.parent, ['clone', f.bare, other]);
    await core.git(other, ['config', 'user.name', 'Remote Test']);
    await core.git(other, ['config', 'user.email', 'remote@example.invalid']);
  }
  const head = await commit(other, filename, content);
  await core.git(other, ['push', f.bare, 'HEAD:refs/heads/main']);
  return head;
}
test('individual start/finish cycle uploads exact feature SHA to main and safely deletes only local feature', async t => {
  const f = await fixture(t); const baseline = await core.git(f.root, ['rev-parse', 'HEAD']);
  const started = await start(f); assert.equal(started.branch, 'add-score'); assert.equal(started.head, baseline);
  const feature = await commit(f.root, 'Score.java', 'class Score {}\n');
  const review = await workflow.prepareFinish(f.root, f.options);
  assert.deepEqual(review.changedPaths, ['Score.java']); assert.equal(review.commitCount, 1); assert.ok(Object.isFrozen(review));
  const result = await workflow.finishPrepared(review, f.options);
  assert.equal(result.finished, true); assert.equal(result.branch, 'main'); assert.equal(result.head, feature);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), feature);
  assert.equal(await fs.readFile(path.join(f.root, 'secret.txt'), 'utf8'), 'kept locally');
  assert.deepEqual(f.calls.find(args => args[0] === 'fetch'), ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, baseline]);
  await assert.rejects(fs.access(path.join(f.root, '.git', 'FETCH_HEAD')));
  await workflow.deleteFinishedBranch(f.root, result.finishedBranch, result.head, {run: f.run});
  await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/add-score']));
  assert.equal(await core.git(f.bare, ['for-each-ref', '--format=%(refname)']), 'refs/heads/main');
});
test('Start fast-forwards a clean main to pinned newer remote main', async t => {
  const f = await fixture(t); const updated = await remoteChange(f, 'Remote.java', 'class Remote {}');
  const result = await start(f); assert.equal(result.head, updated);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), updated);
  assert.equal(await fs.readFile(path.join(f.root, 'Remote.java'), 'utf8'), 'class Remote {}');
});
test('disjoint updated main merges into feature and stops for a fresh app run/review before publication', async t => {
  const f = await fixture(t); await start(f);
  const feature = await commit(f.root, 'Score.java', 'class Score {}');
  const remoteHead = await remoteChange(f, 'Remote.java', 'class Remote {}');
  const localMain = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  const result = await finish(f);
  assert.equal(result.updated, true); assert.equal(result.finished, false); assert.equal(result.branch, 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), localMain);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
  await core.git(f.root, ['merge-base', '--is-ancestor', feature, result.head]);
  await core.git(f.root, ['merge-base', '--is-ancestor', remoteHead, result.head]);
  assert.ok(!f.calls.some(args => args[0] === 'push'));
  const final = await finish(f); assert.equal(final.finished, true); assert.equal(final.head, result.head);
});
test('conflict preserves merge state and original main, then resolution can Finish again', async t => {
  const f = await fixture(t); await start(f);
  await commit(f.root, 'Main.java', 'class Main { int score; }\n');
  const initialMain = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  await remoteChange(f, 'Main.java', 'class Main { int lives; }\n');
  await assert.rejects(finish(f), error => error.conflict === true && /Resolve conflicts/.test(error.message));
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), initialMain);
  assert.ok(await core.git(f.root, ['rev-parse', '--verify', 'MERGE_HEAD']));
  assert.ok(!f.calls.some(args => args[0] === 'push'));
  await commit(f.root, 'Main.java', 'class Main { int score; int lives; }\n');
  assert.equal((await finish(f)).finished, true);
});
test('failed push keeps feature checked out and advanced local main; retry publishes preserved SHA', async t => {
  const f = await fixture(t); await start(f);
  const head = await commit(f.root, 'Score.java', 'class Score {}');
  f.setFailure(true);
  await assert.rejects(finish(f), error => /commits are preserved/.test(error.message) && !/SECRET/.test(error.message));
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), head);
  f.setFailure(false); assert.equal((await finish(f)).head, head);
});
test('remote racing the final push rejects non-fast-forward; retry integrates main without losing work', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'class Score {}');
  let remoteHead;
  f.setHook(async (_, args) => { if (args[0] === 'push') { f.setHook(null); remoteHead = await remoteChange(f, 'Remote.java', 'class Remote {}'); } });
  await assert.rejects(finish(f), /GitHub main changed and refused/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
  assert.equal((await finish(f)).updated, true);
  assert.equal((await finish(f)).finished, true);
});
test('cancelled executor and forged plans leave refs and files untouched', async t => {
  const f = await fixture(t); const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  const refs = await core.git(f.root, ['show-ref']); const before = f.calls.length;
  await assert.rejects(workflow.startPrepared(plan, {...f.options, beforeNetwork: async () => { throw new Error('Cancelled'); }}), /Cancelled/);
  assert.equal(await core.git(f.root, ['show-ref']), refs); assert.equal(f.calls.length, before);
  await assert.rejects(workflow.startPrepared({...plan}, f.options), /Review this project/);
});
test('post-review file, branch, destination, main and remote drift invalidate before mutation', async t => {
  for (const kind of ['file', 'branch', 'destination', 'main', 'remote']) {
    const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'class Score {}');
    const plan = await workflow.prepareFinish(f.root, f.options);
    if (kind === 'file') await write(f.root, 'Score.java', 'changed');
    if (kind === 'branch') await core.git(f.root, ['checkout', '-b', 'other']);
    if (kind === 'destination') await core.git(f.root, ['remote', 'set-url', 'origin', 'https://github.com/other/project.git']);
    if (kind === 'main') await core.git(f.root, ['update-ref', 'refs/heads/main', plan.head]);
    if (kind === 'remote') await remoteChange(f, 'Remote.java', 'class Remote {}');
    const calls = f.calls.length;
    await assert.rejects(workflow.finishPrepared(plan, f.options), /changed after review/);
    assert.ok(!f.calls.slice(calls).some(args => ['fetch', 'push'].includes(args[0])));
  }
});
test('drift introduced during pinned fetch stops before main/feature mutation', async t => {
  const f = await fixture(t); const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  f.setHook(async (_, args) => { if (args[0] === 'fetch') await write(f.root, 'Main.java', 'edited during fetch'); });
  await assert.rejects(workflow.startPrepared(plan, f.options), /changed after review/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'main');
  await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/feature']));
});
test('unsafe/duplicate names, dirty/unborn/main/detached and pending-operation guards are actionable', async t => {
  const f = await fixture(t);
  for (const name of ['main', '-x', 'x..y', 'x@{1}', 'HEAD~1', 'x//y', 'x.lock', '', 'a b', 'x:main', '../x']) await assert.rejects(workflow.prepareStart(f.root, name, f.options), /name|valid feature/);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), /Start a feature/);
  await write(f.root, 'Main.java', 'dirty'); await assert.rejects(workflow.prepareStart(f.root, 'feature', f.options), /Save and commit/);
  await core.git(f.root, ['restore', 'Main.java']);
  await start(f); await assert.rejects(workflow.prepareStart(f.root, 'other', f.options), /Switch to main/);
  await core.git(f.root, ['checkout', 'main']); await assert.rejects(workflow.prepareStart(f.root, 'add-score', f.options), /already exists/);
  await core.git(f.root, ['checkout', '--detach']); await assert.rejects(workflow.prepareStart(f.root, 'other', f.options), /detached HEAD/);
  await core.git(f.root, ['checkout', 'main']); await write(f.root, '.git/MERGE_HEAD', 'pending');
  await assert.rejects(workflow.prepareStart(f.root, 'other', f.options), /current Git merge/);
  const u = await fixture(t, {unborn: true}); await assert.rejects(workflow.prepareStart(u.root, 'feature', u.options), /first Upload on main/);
});
test('local main divergence and unrelated history are refused while empty remote can accept initial baseline', async t => {
  const f = await fixture(t); await commit(f.root, 'Local.java', 'local');
  await assert.rejects(start(f), /cannot fast-forward/);
  await core.git(f.root, ['checkout', '-b', 'feature', 'HEAD~1']);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), /Local main contains changes/);
  const e = await fixture(t, {empty: true}); await start(e); await commit(e.root, 'Score.java', 'score');
  assert.equal((await finish(e)).finished, true);
});
test('cleanup refuses modified feature, missing commits and a dirty/non-main worktree', async t => {
  const f = await fixture(t); await start(f); const head = await commit(f.root, 'Score.java', 'score'); await finish(f);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'main', head, {run: f.run}), /exact finished/);
  await write(f.root, 'Main.java', 'dirty'); await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run: f.run}), /Save and commit/);
  await core.git(f.root, ['restore', 'Main.java']); await core.git(f.root, ['checkout', 'add-score']);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run: f.run}), /Switch to clean main/);
  const changed = await commit(f.root, 'More.java', 'more'); await core.git(f.root, ['checkout', 'main']);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run: f.run}), /changed or has work/);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', changed, {run: f.run}), /changed or has work/);
});
test('incoming main cannot overwrite ignored local files and no helper/network fallback is used', async t => {
  const f = await fixture(t);
  // Remote removes ignore and introduces a file deliberately kept private locally.
  const other = path.join(f.parent, 'other'); await remoteChange(f, 'Remote.java', 'remote');
  await write(other, '.gitignore', ''); await core.git(other, ['add', '.gitignore']);
  await commit(other, 'secret.txt', 'remote file'); await core.git(other, ['push', f.bare, 'HEAD:refs/heads/main']);
  await assert.rejects(start(f), /overwrite a local ignored file/);
  assert.equal(await fs.readFile(path.join(f.root, 'secret.txt'), 'utf8'), 'kept locally');
  await assert.rejects(workflow.prepareStart(f.root, 'feature'), /native GitHub connection/);
});

test('existing remote feature name is refused at review and if it appears after review', async t => {
  const f = await fixture(t); const head = await core.git(f.root, ['rev-parse', 'HEAD']);
  await core.git(f.root, ['push', f.bare, `${head}:refs/heads/old-feature`]);
  await assert.rejects(workflow.prepareStart(f.root, 'old-feature', f.options), /already exists on GitHub/);
  const plan = await workflow.prepareStart(f.root, 'new-feature', f.options);
  await core.git(f.root, ['push', f.bare, `${head}:refs/heads/new-feature`]);
  const refs = await core.git(f.root, ['show-ref']);
  await assert.rejects(workflow.startPrepared(plan, f.options), /now exists on GitHub/);
  assert.equal(await core.git(f.root, ['show-ref']), refs);
});

test('cleanup compare-and-delete preserves a branch concurrently moved to unmerged work', async t => {
  const f = await fixture(t); await start(f); const head = await commit(f.root, 'Score.java', 'score'); await finish(f);
  await core.git(f.root, ['checkout', '-b', 'unmerged']); const changed = await commit(f.root, 'More.java', 'more'); await core.git(f.root, ['checkout', 'main']);
  let attempted = false;
  const run = async (root, args) => {
    if (args[0] === 'update-ref' && args[1] === '-d') {
      attempted = true;
      await core.git(root, ['update-ref', 'refs/heads/add-score', changed]);
    }
    return f.run(root, args);
  };
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run}), /could not delete/);
  assert.equal(attempted, true);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/add-score']), changed);
});

test('exact project root, additional worktrees and unrelated remote main are refused', async t => {
  const f = await fixture(t); const child = path.join(f.root, 'child'); await fs.mkdir(child); await write(child, 'zero.json', '{}');
  await assert.rejects(workflow.prepareStart(child, 'feature', f.options), /different Git repository/);
  await fs.rm(child, {recursive: true});
  const extra = path.join(f.parent, 'worktree'); await core.git(f.root, ['worktree', 'add', '-b', 'extra', extra]);
  await assert.rejects(workflow.prepareStart(f.root, 'feature', f.options), /multiple Git worktrees/);
  await core.git(f.root, ['worktree', 'remove', extra]);
  await start(f); await commit(f.root, 'Score.java', 'score');
  await remoteChange(f, 'Remote.java', 'remote');
  const other = path.join(f.parent, 'other'); await core.git(other, ['checkout', '--orphan', 'unrelated']);
  await core.git(other, ['add', '.']); await core.git(other, ['commit', '-m', 'Unrelated root']);
  const foreign = await core.git(other, ['rev-parse', 'HEAD']);
  await core.git(other, ['push', f.bare, 'HEAD:refs/heads/unrelated']); await core.git(f.bare, ['update-ref', 'refs/heads/main', foreign]);
  await assert.rejects(finish(f), /unrelated histories/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.ok(!f.calls.some(args => args[0] === 'push'));
});

test('remote main changing during fetch invalidates Start before local main or branch mutation', async t => {
  const f = await fixture(t); const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  const refs = await core.git(f.root, ['show-ref']);
  f.setHook(async (_, args) => { if (args[0] === 'fetch') { f.setHook(null); await remoteChange(f, 'Remote.java', 'remote'); } });
  await assert.rejects(workflow.startPrepared(plan, f.options), /GitHub main changed after review/);
  assert.equal(await core.git(f.root, ['show-ref']), refs);
});
