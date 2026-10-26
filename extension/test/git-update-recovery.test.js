'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const workflow = require('../src/workflow');
const remote = 'https://github.com/student/recovery.git';
async function write(root, name, value) { await fs.writeFile(path.join(root, name), value); }
async function commit(root, name, value) {
  if (name) await write(root, name, value);
  await core.git(root, ['add', '-A']);
  await core.git(root, ['commit', '-m', 'Test change']);
  return core.git(root, ['rev-parse', 'HEAD']);
}
async function fixture(t) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-update-')));
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  const root = path.join(parent, 'student'); const bare = path.join(parent, 'remote.git'); const other = path.join(parent, 'other');
  await fs.mkdir(root); await fs.mkdir(bare);
  await core.git(bare, ['init', '--bare', '--initial-branch=main']);
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', 'user.name', 'Test']); await core.git(root, ['config', 'user.email', 'test@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', remote]);
  await write(root, 'zero.json', '{}\n'); await write(root, '.gitignore', 'private.txt\n'); await write(root, 'private.txt', 'private');
  const original = await commit(root, 'Main.java', 'class Main { int score; }\n');
  await core.git(root, ['push', bare, 'main']);
  await core.git(parent, ['clone', bare, other]);
  await core.git(other, ['config', 'user.name', 'Other']); await core.git(other, ['config', 'user.email', 'other@example.invalid']);
  const calls = [];
  const options = {
    run: (cwd, args) => { assert.ok(!['push', 'fetch', 'ls-remote'].includes(args[0])); return core.git(cwd, args); },
    networkRun: (cwd, args) => { calls.push(args); return core.git(cwd, args.map(arg => arg === remote ? bare : arg)); }
  };
  const publish = async (branch = 'main') => core.git(other, ['push', bare, `HEAD:refs/heads/${branch}`]);
  return {root, bare, other, parent, original, options, calls, publish};
}
async function update(f, extra = {}) { const opts = {...f.options, ...extra}; return workflow.syncPrepared(await workflow.prepareSync(f.root, opts), opts); }
async function conflict(f) {
  const local = await commit(f.root, 'Main.java', 'class Main { int localScore; }\n');
  await commit(f.other, 'Main.java', 'class Main { int incomingScore; }\n'); await f.publish();
  const result = await update(f);
  assert.equal(result.synced, false); assert.equal(result.recovery.files[0].kind, 'text');
  return {local, result};
}
function choose(recovery, side = 'local') {
  const file = recovery.files[0]; return {path: file.path, conflictId: file.conflicts[0].id, side};
}
test('diverged main merges disjoint histories and repeated/ahead updates preserve local commits', async t => {
  const f = await fixture(t); const local = await commit(f.root, 'Local.java', 'local\n');
  const incoming = await commit(f.other, 'Incoming.java', 'incoming\n'); await f.publish();
  const result = await update(f);
  assert.equal(result.synced, true); assert.equal(result.branch, 'main');
  await core.git(f.root, ['merge-base', '--is-ancestor', local, result.head]);
  await core.git(f.root, ['merge-base', '--is-ancestor', incoming, result.head]);
  assert.equal((await update(f)).updated, false);
  assert.equal(await fs.readFile(path.join(f.root, 'private.txt'), 'utf8'), 'private');
  assert.ok(!f.calls.some(args => args[0] === 'push'));
});
test('main conflict resumes from disk and guided resolution commits both histories without network', async t => {
  const f = await fixture(t); const {local, result} = await conflict(f);
  const persisted = await workflow.readRecovery(f.root, {run: f.options.run});
  assert.deepEqual(persisted, result.recovery);
  delete require.cache[require.resolve('../src/git-update-recovery')];
  const calls = f.calls.length;
  const final = await workflow.resolveRecovery(f.root, choose(persisted, 'incoming'), {run: f.options.run});
  assert.equal(final.synced, true); assert.equal(final.branch, 'main'); assert.equal(f.calls.length, calls);
  await core.git(f.root, ['merge-base', '--is-ancestor', local, final.head]);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'class Main { int incomingScore; }\n');
  assert.equal(await workflow.readRecovery(f.root, {run: f.options.run}), null);
});
test('individual text choices retain auto-merged edits and all unchosen conflicting sections', async t => {
  const f = await fixture(t);
  const base = ['first', ...Array.from({length: 12}, (_, i) => `line${i}`), 'last', ...Array.from({length: 12}, (_, i) => `tail${i}`), 'end'].join('\n') + '\n';
  await commit(f.root, 'Main.java', base); await core.git(f.root, ['push', f.bare, 'main']);
  await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', base.replace('first', 'local-first').replace('last', 'local-last'));
  await commit(f.other, 'Main.java', base.replace('first', 'incoming-first').replace('last', 'incoming-last').replace('end\n', 'incoming-end\n')); await f.publish();
  let result = await update(f); assert.equal(result.recovery.files[0].conflicts.length, 2);
  result = await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run});
  assert.equal(result.recovery.files[0].conflicts.length, 1);
  const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run});
  assert.equal(final.synced, true);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), base.replace('first', 'local-first').replace('last', 'incoming-last').replace('end\n', 'incoming-end\n'));
});
test('cancel restores committed checkpoint and refuses later working/index/untracked/ref drift', async t => {
  const f = await fixture(t); const {local} = await conflict(f);
  const cancelled = await workflow.cancelRecovery(f.root, {run: f.options.run});
  assert.equal(cancelled.head, local); assert.equal(await core.git(f.root, ['status', '--porcelain']), '');
  assert.equal(await fs.readFile(path.join(f.root, 'private.txt'), 'utf8'), 'private');
  await update(f);
  await write(f.root, 'after.txt', 'external work');
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'after.txt'), 'utf8'), 'external work');
  await fs.unlink(path.join(f.root, 'after.txt'));
  await write(f.root, 'Main.java', 'external editing');
  await assert.rejects(workflow.resolveRecovery(f.root, {path: 'Main.java', conflictId: 'file', side: 'local'}, {run: f.options.run}), /changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'external editing');
});
test('current remote feature updates independently from remote main', async t => {
  const f = await fixture(t); await core.git(f.root, ['checkout', '-b', 'feature']); await core.git(f.other, ['checkout', '-b', 'feature']);
  await commit(f.root, 'Local.java', 'local'); const remoteHead = await commit(f.other, 'Feature.java', 'remote feature'); await f.publish('feature');
  const result = await update(f, {target: 'branch'});
  assert.equal(result.synced, true); assert.equal(result.remoteBranch, 'feature'); assert.equal(result.remoteHead, remoteHead);
  assert.equal(await core.git(f.root, ['rev-parse', 'main']), f.original);
  await assert.rejects(update(f, {target: 'invalid'}), /Choose main/);
});
test('binary and modify/delete conflicts support guarded whole-file choices', async t => {
  for (const kind of ['binary', 'delete']) {
    const f = await fixture(t);
    if (kind === 'binary') {
      await commit(f.root, 'Main.java', Buffer.from([0, 1, 2])); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
      await commit(f.root, 'Main.java', Buffer.from([0, 3, 4])); await commit(f.other, 'Main.java', Buffer.from([0, 5, 6]));
    } else {
      await commit(f.root, 'Main.java', 'local modification'); await fs.unlink(path.join(f.other, 'Main.java')); await commit(f.other);
    }
    await f.publish(); const result = await update(f);
    assert.equal(result.recovery.files[0].kind, kind);
    const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run});
    assert.equal(final.synced, true);
    if (kind === 'binary') assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), Buffer.from([0, 5, 6]));
    else await assert.rejects(fs.access(path.join(f.root, 'Main.java')));
  }
});
test('rename and symlink conflicts preserve native fallback and remain cancellable', async t => {
  for (const kind of ['rename', 'symlink']) {
    const f = await fixture(t);
    if (kind === 'rename') {
      await core.git(f.root, ['mv', 'Main.java', 'Local.java']); await commit(f.root);
      await core.git(f.other, ['mv', 'Main.java', 'Incoming.java']); await commit(f.other);
    } else {
      await fs.unlink(path.join(f.root, 'Main.java')); await fs.symlink('local.txt', path.join(f.root, 'Main.java')); await commit(f.root);
      await fs.unlink(path.join(f.other, 'Main.java')); await fs.symlink('incoming.txt', path.join(f.other, 'Main.java')); await commit(f.other);
    }
    await f.publish(); const result = await update(f);
    assert.equal(result.synced, false); assert.ok(result.recovery.files.every(file => file.kind === 'complex'));
    await assert.rejects(workflow.resolveRecovery(f.root, {path: result.recovery.files[0].path, conflictId: 'file', side: 'local'}, {run: f.options.run}), /native/);
    assert.equal((await workflow.cancelRecovery(f.root, {run: f.options.run})).cancelled, true);
  }
});
test('checkpoint saves nonignored work offline with no origin, detects drift and clean is a no-op', async t => {
  const f = await fixture(t); await core.git(f.root, ['remote', 'remove', 'origin']);
  assert.equal((await workflow.checkpoint(f.root, {run: f.options.run})).checkpointed, false);
  await write(f.root, 'Main.java', 'edited'); await write(f.root, 'New.java', 'new');
  const result = await workflow.checkpoint(f.root, {run: f.options.run});
  assert.equal(result.checkpointed, true); assert.equal(await core.git(f.root, ['status', '--porcelain']), '');
  assert.equal(await core.git(f.root, ['ls-files', 'private.txt']), ''); assert.equal(f.calls.length, 0);
  await fs.unlink(path.join(f.root, 'New.java'));
  assert.equal((await workflow.checkpoint(f.root, {run: f.options.run})).checkpointed, true);
  await write(f.root, 'Main.java', 'reviewed');
  await assert.rejects(workflow.checkpoint(f.root, {run: f.options.run, beforeMutation: () => write(f.root, 'Main.java', 'changed')}), /changed/);
});
test('beforeMutation authority cancellation leaves pending update intact; no-pending read invokes no Git', async t => {
  const f = await fixture(t); assert.equal(await workflow.readRecovery(f.root, {run: () => { throw new Error('unexpected Git'); }}), null);
  const {result} = await conflict(f); const before = await fs.readFile(path.join(f.root, 'Main.java'));
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run, beforeMutation: () => { throw new Error('Session changed'); }}), /Session changed/);
  assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), before);
});
test('cancel and choices refuse index-only and reference drift, including drift inside authority callback', async t => {
  for (const mutation of ['index', 'ref', 'callback']) {
    const f = await fixture(t); const {result} = await conflict(f);
    if (mutation === 'index') await core.git(f.root, ['--literal-pathspecs', 'add', '--', 'Main.java']);
    if (mutation === 'ref') await core.git(f.root, ['update-ref', 'refs/heads/another', f.original]);
    const options = {...f.options, ...(mutation === 'callback' ? {beforeMutation: () => write(f.root, 'new.txt', 'external')} : {})};
    await assert.rejects(workflow.cancelRecovery(f.root, options), /changed/);
    assert.ok(await core.git(f.root, ['rev-parse', 'MERGE_HEAD']));
    await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), options), /changed/);
  }
});
test('literal conflict-marker source is native fallback and stale record after native completion is harmless', async t => {
  const f = await fixture(t);
  const base = '<<<<<<< literal\na\n=======\nb\n>>>>>>> literal\n' + Array.from({length: 12}, (_, i) => `line${i}\n`).join('') + 'score\n';
  await commit(f.root, 'Main.java', base); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', base.replace('score\n', 'local\n')); await commit(f.other, 'Main.java', base.replace('score\n', 'incoming\n')); await f.publish();
  const result = await update(f); assert.equal(result.recovery.files[0].kind, 'complex');
  await core.git(f.root, ['merge', '--abort']);
  assert.equal(await workflow.readRecovery(f.root, {run: f.options.run}), null);
  const again = await update(f); assert.equal(again.recovery.files[0].kind, 'complex');
  assert.equal((await workflow.cancelRecovery(f.root, {run: f.options.run})).cancelled, true);
});
test('checkpoint supports unborn original projects and preserves executable/symlink and ignored bytes', async t => {
  const f = await fixture(t);
  const fresh = path.join(f.parent, 'original'); await fs.mkdir(fresh); await core.git(fresh, ['init', '-b', 'main']);
  await core.git(fresh, ['config', 'user.name', 'Test']); await core.git(fresh, ['config', 'user.email', 'test@example.invalid']);
  await write(fresh, 'zero.json', '{}'); await write(fresh, 'Main.java', 'main'); await write(fresh, '.gitignore', 'private.txt\n'); await write(fresh, 'private.txt', 'private');
  await fs.symlink('Main.java', path.join(fresh, 'link.java'));
  assert.equal((await workflow.checkpoint(fresh, {run: f.options.run})).checkpointed, true);
  assert.equal(await core.git(fresh, ['status', '--porcelain']), ''); assert.equal(await fs.readlink(path.join(fresh, 'link.java')), 'Main.java');
});
test('a saved partial text choice can be cancelled, but later edits remain protected', async t => {
  const f = await fixture(t); const base = 'first\n' + Array.from({length: 15}, (_, i) => `line${i}\n`).join('') + 'last\n';
  await commit(f.root, 'Main.java', base); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  const local = await commit(f.root, 'Main.java', base.replace('first', 'local-first').replace('last', 'local-last'));
  await commit(f.other, 'Main.java', base.replace('first', 'incoming-first').replace('last', 'incoming-last')); await f.publish();
  let result = await update(f);
  result = await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run});
  assert.equal(result.recovery.files[0].conflicts.length, 1);
  assert.equal((await workflow.cancelRecovery(f.root, {run: f.options.run})).head, local);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), base.replace('first', 'local-first').replace('last', 'local-last'));
  result = await update(f); result = await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run});
  await fs.appendFile(path.join(f.root, 'Main.java'), 'new external work\n');
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  assert.match(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), /new external work/);
});
test('an edit introduced while staging a choice is detected and never accepted as managed recovery', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const run = async (root, args) => {
    const value = await f.options.run(root, args);
    if (args[0] === '--literal-pathspecs' && args[1] === 'add') await write(root, 'outside.java', 'external work');
    return value;
  };
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), {run}), /changed/);
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'outside.java'), 'utf8'), 'external work');
});
