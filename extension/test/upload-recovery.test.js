'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const github = require('../src/github');
const {createTransport} = require('../src/transport');
const remote = 'https://github.com/student/recovery.git';
const secret = 'PRIVATE_SECRET_MUST_NEVER_ESCAPE';

async function fixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-upload-recovery-')));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const root = path.join(directory, 'project'), bare = path.join(directory, 'remote.git');
  await fs.mkdir(root); await fs.mkdir(bare);
  await core.git(bare, ['init', '--bare', '-b', 'main']);
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', 'user.name', 'Upload Test']);
  await core.git(root, ['config', 'user.email', 'upload@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', remote]);
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main {}\n');
  const calls = [];
  // Only the injected network boundary substitutes a local bare repository.
  // Product destination checks always see the reviewed ordinary HTTPS URL.
  const networkRun = async (cwd, args) => {
    calls.push(args);
    if (args[0] === 'push') {
      assert.equal(args[1], remote);
      return core.git(cwd, ['push', bare, args[2]]);
    }
    assert.deepEqual(args.slice(0, 3), ['ls-remote', '--heads', remote]);
    return core.git(cwd, ['ls-remote', '--heads', bare, args[3]]);
  };
  return {root, bare, calls, networkRun};
}
async function failedUpload(root, networkRun) {
  let failure;
  try { await github.uploadPrepared(await github.prepareUpload(root), 'Save my app', {networkRun}); }
  catch (error) { failure = error; }
  assert.ok(failure, 'Expected a failed or interrupted transfer');
  return failure;
}
const offline = () => { throw Object.assign(new Error(secret), {stderr: `Could not resolve host ${secret}`}); };
function cleanError(error, kind) {
  assert.equal(error.kind, kind);
  assert.doesNotMatch(error.message + JSON.stringify(error), new RegExp(secret));
  assert.equal(error.stderr, undefined); assert.equal(error.cause, undefined);
}
async function snapshot(root) {
  return {head: await core.git(root, ['rev-parse', 'HEAD']),
    status: await core.git(root, ['status', '--porcelain=v1', '-z']),
    index: await fs.readFile(path.join(root, '.git', 'index')),
    source: await fs.readFile(path.join(root, 'Main.java'), 'utf8')};
}

test('offline after commit exposes only a frozen exact recovery record, and does not recommit', async t => {
  const {root, networkRun, calls} = await fixture(t);
  const error = await failedUpload(root, offline);
  cleanError(error, 'network');
  const record = error.uploadRecovery;
  assert.ok(Object.isFrozen(record));
  assert.deepEqual(Object.keys(record).sort(), ['root', 'remote', 'page', 'branch', 'head', 'committed', 'pushStarted', 'kind'].sort());
  assert.equal(record.root, root); assert.equal(record.remote, remote); assert.equal(record.branch, 'main');
  assert.equal(record.head, await core.git(root, ['rev-parse', 'HEAD']));
  assert.equal(record.committed, true); assert.equal(record.pushStarted, true);
  assert.equal(await core.git(root, ['status', '--porcelain=v1']), '');
  assert.deepEqual(await github.checkUpload(root, record, {networkRun}), {confirmed: false, remoteHead: null, kind: 'unconfirmed'});
  assert.deepEqual(calls.map(args => args[0]), ['ls-remote']);
  assert.equal(await core.git(root, ['rev-list', '--count', 'HEAD']), '1');
});

test('real rejected non-fast-forward push preserves both histories and reports behind', async t => {
  const {root, bare, networkRun} = await fixture(t);
  await github.uploadPrepared(await github.prepareUpload(root), 'Initial', {networkRun});
  const peer = path.join(path.dirname(root), 'peer');
  await core.git(path.dirname(root), ['clone', bare, peer]);
  await core.git(peer, ['config', 'user.name', 'Other Student']);
  await core.git(peer, ['config', 'user.email', 'other@example.invalid']);
  await fs.writeFile(path.join(peer, 'remote.txt'), 'Remote work\n');
  await core.git(peer, ['add', 'remote.txt']); await core.git(peer, ['commit', '-m', 'Remote work']);
  await core.git(peer, ['push', 'origin', 'main']);
  const remoteHead = await core.git(bare, ['rev-parse', 'main']);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int local; }\n');
  const error = await failedUpload(root, networkRun); cleanError(error, 'behind');
  assert.equal(error.uploadRecovery.head, await core.git(root, ['rev-parse', 'HEAD']));
  assert.equal(await core.git(bare, ['rev-parse', 'main']), remoteHead);
  assert.notEqual(error.uploadRecovery.head, remoteHead);
  assert.equal(await core.git(root, ['status', '--porcelain=v1']), '');
});

test('guarded transport emits separate sanitized auth, access and protected rejection kinds', async t => {
  for (const [kind, stderr] of [['auth', 'Authentication failed'], ['access', '403 Permission denied'], ['protected', 'GH013 repository rule violations'], ['network', 'Connection reset']]) await t.test(kind, async t => {
    const {root} = await fixture(t);
    const session = {id: 'session', accountId: 'student', accessToken: secret};
    const networkRun = createTransport(remote, async () => session, {assertCurrentNow: () => session,
      spawn: async () => { throw Object.assign(new Error(secret), {stderr: `${stderr} ${secret}`}); }});
    const error = await failedUpload(root, networkRun); cleanError(error, kind);
    assert.equal(error.uploadRecovery.kind, kind); assert.equal(error.uploadRecovery.committed, true);
  });
});

test('accepted push with interrupted confirmation is confirmed read-only despite newer staged edits and commits', async t => {
  const {root, bare, calls, networkRun} = await fixture(t);
  const error = await failedUpload(root, (cwd, args) => args[0] === 'push' ? networkRun(cwd, args) : offline());
  cleanError(error, 'unconfirmed');
  const record = error.uploadRecovery;
  assert.equal(await core.git(bare, ['rev-parse', 'main']), record.head);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int newerCommit; }\n');
  await core.git(root, ['add', 'Main.java']); await core.git(root, ['commit', '-m', 'Newer local work']);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int stagedEdit; }\n');
  await core.git(root, ['add', 'Main.java']);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int newestWorkingEdit; }\n');
  const before = await snapshot(root); calls.length = 0;
  let guards = 0;
  const result = await github.checkUpload(root, record, {networkRun, beforeNetwork: async () => { guards++; }});
  assert.equal(result.confirmed, true); assert.equal(result.head, record.head); assert.notEqual(result.head, before.head);
  assert.equal(guards, 2); assert.deepEqual(calls, [['ls-remote', '--heads', remote, 'refs/heads/main']]);
  assert.deepEqual(await snapshot(root), before);
  assert.equal(await core.git(bare, ['rev-parse', 'main']), record.head);
});

test('advanced or divergent remote branch never confirms the recorded commit', async t => {
  const {root, bare, networkRun} = await fixture(t);
  const error = await failedUpload(root, (cwd, args) => args[0] === 'push' ? networkRun(cwd, args) : offline());
  await core.git(root, ['commit', '--allow-empty', '-m', 'Advance']);
  await core.git(root, ['push', bare, 'HEAD:refs/heads/main']);
  const remoteHead = await core.git(bare, ['rev-parse', 'main']);
  assert.deepEqual(await github.checkUpload(root, error.uploadRecovery, {networkRun}), {confirmed: false, remoteHead, kind: 'unconfirmed'});
  await core.git(root, ['checkout', '--orphan', 'unrelated']);
  await core.git(root, ['commit', '-m', 'Unrelated history']);
  const unrelated = await core.git(root, ['rev-parse', 'HEAD']);
  await core.git(root, ['push', bare, `${unrelated}:refs/heads/other`]);
  await core.git(bare, ['update-ref', 'refs/heads/main', unrelated]);
  await core.git(root, ['checkout', 'main']);
  assert.deepEqual(await github.checkUpload(root, error.uploadRecovery, {networkRun}), {confirmed: false, remoteHead: unrelated, kind: 'unconfirmed'});
});

test('precommit identity failure never claims a completed commit or carries a recovery record', async t => {
  const {root} = await fixture(t);
  const run = (cwd, args) => args[0] === 'commit'
    ? Promise.reject(Object.assign(new Error(secret), {stderr: `Author identity unknown ${secret}`})) : core.git(cwd, args);
  await assert.rejects(github.uploadPrepared(await github.prepareUpload(root), 'Save', {run, networkRun: offline}), error => {
    cleanError(error, 'changed'); assert.equal(error.uploadRecovery, undefined); return true;
  });
});

test('malformed persisted records and changed project, branch or destination cannot transfer', async t => {
  const {root} = await fixture(t); const {uploadRecovery: record} = await failedUpload(root, offline);
  let calls = 0; const networkRun = async () => { calls++; throw new Error('Unexpected network'); };
  for (const patch of [
    {head: '--upload-pack=bad'}, {head: `${record.head}~1`}, {head: 'a'.repeat(41)},
    {branch: 'main:refs/heads/other'}, {branch: 'bad..ref'}, {branch: 'main\nsecret'}, {branch: 'foo.lock/bar'},
    {remote: 'https://user:secret@github.com/student/recovery.git'}, {remote: 'ssh://github.com/student/recovery.git'},
    {remote: 'https://github.com/student/other.git'}, {page: 'https://github.com/student/other'},
    {root: path.dirname(root)}, {committed: 'true'}, {pushStarted: undefined}
  ]) await assert.rejects(github.checkUpload(root, {...record, ...patch}, {networkRun}), error => error.kind === 'changed');
  await core.git(root, ['checkout', '-b', 'other']);
  await assert.rejects(github.checkUpload(root, record, {networkRun}), error => error.kind === 'changed');
  await core.git(root, ['checkout', 'main']);
  await core.git(root, ['remote', 'set-url', 'origin', 'https://github.com/student/other.git']);
  await assert.rejects(github.checkUpload(root, record, {networkRun}), error => error.kind === 'changed');
  assert.equal(calls, 0);
});

test('confirmation rechecks project destination and session before transfer and after response', async t => {
  for (const stage of ['before', 'after']) await t.test(stage, async t => {
    const {root, networkRun, calls} = await fixture(t); const {uploadRecovery: record} = await failedUpload(root, offline);
    let guard = 0;
    await assert.rejects(github.checkUpload(root, record, {networkRun, beforeNetwork: async () => {
      guard++;
      if (guard === (stage === 'before' ? 1 : 2)) throw new Error(`Your GitHub account or sign-in changed ${secret}`);
    }}), error => { cleanError(error, 'changed'); return true; });
    assert.equal(calls.length, stage === 'before' ? 0 : 1);
    calls.length = 0;
    await assert.rejects(github.checkUpload(root, record, {networkRun: async (cwd, args) => {
      const result = await networkRun(cwd, args);
      if (stage === 'after') await core.git(root, ['remote', 'set-url', 'origin', 'https://github.com/student/other.git']);
      return result;
    }, beforeNetwork: async () => {
      if (stage === 'before') await core.git(root, ['remote', 'set-url', 'origin', 'https://github.com/student/other.git']);
    }}), error => error.kind === 'changed');
    assert.equal(calls.length, stage === 'before' ? 0 : 1);
  });
});

test('session change while a transfer is in flight yields a sanitized recovery record', async t => {
  const {root} = await fixture(t);
  const session = {id: 'one', accountId: 'student', accessToken: secret};
  const networkRun = createTransport(remote, async () => session, {assertCurrentNow: () => session, spawn: async () => {
    session.id = 'two'; session.accountId = 'other'; return {stdout: ''};
  }});
  const error = await failedUpload(root, networkRun); cleanError(error, 'changed');
  assert.equal(error.uploadRecovery.pushStarted, true); assert.equal(error.uploadRecovery.committed, true);
});
