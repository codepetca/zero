'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const {prepareUpload, uploadPrepared} = require('../src/github');
async function project(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-upload-')));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', '--local', 'user.name', 'Zero Test']);
  await core.git(root, ['config', '--local', 'user.email', 'zero-test@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', 'https://github.com/student/test.git']);
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.writeFile(path.join(root, '.gitignore'), 'secret.txt\nbuild/\n');
  await fs.writeFile(path.join(root, 'secret.txt'), 'DO NOT UPLOAD');
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main {}\n');
  return root;
}
function transport(options = {}) {
  const calls = [];
  let pushedHead;
  const run = async (root, args) => {
    calls.push(args);
    // Every transport operation is intercepted; the real Git helper only sees local commands.
    if (['push', 'fetch', 'ls-remote', 'pull', 'clone'].includes(args[0])) {
      if (args[0] === 'push') {
        pushedHead = args[2].split(':')[0];
        if (options.onPush) await options.onPush(root, args);
        if (options.failure) throw Object.assign(new Error('private token'), {stderr: options.failure});
        return '';
      }
      if (args[0] === 'ls-remote') return `${options.wrongHead ? '0'.repeat(40) : pushedHead}\trefs/heads/main`;
      throw new Error('Unexpected transport command');
    }
    return core.git(root, args);
  };
  return {run, calls};
}
test('reviewed first upload commits project paths, preserves ignored files, and confirms mocked remote', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  assert.equal(plan.head, null); assert.equal(plan.page, 'https://github.com/student/test');
  assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.changes));
  assert.ok(!plan.changes.some(change => change.path === 'secret.txt'));
  const result = await uploadPrepared(plan, 'Start my app', {run: mock.run});
  assert.equal(result.uploaded, true); assert.equal(result.committed, true);
  assert.equal(await fs.readFile(path.join(root, 'secret.txt'), 'utf8'), 'DO NOT UPLOAD');
  assert.doesNotMatch(await core.git(root, ['ls-files']), /secret/);
  assert.deepEqual(mock.calls.find(args => args[0] === 'push'), ['push', plan.remote, `${result.head}:refs/heads/main`]);
  assert.equal(mock.calls.filter(args => args[0] === 'ls-remote').length, 1);
  const clean = await prepareUpload(root, mock.run);
  assert.equal((await uploadPrepared(clean, 'Save', {run: mock.run})).committed, false);
});
test('review detects edited source even when porcelain status is unchanged', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int score; }\n');
  await assert.rejects(uploadPrepared(plan, 'Save', {run: mock.run}), /changed after review/);
  assert.ok(!mock.calls.some(args => args[0] === 'push' || args[0] === 'commit' || args.includes('add')));
});
test('remote, branch, operation, detached HEAD, nested repository and ignored staging are refused', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  await core.git(root, ['remote', 'set-url', 'origin', 'https://github.com/other/test.git']);
  await assert.rejects(uploadPrepared(plan, 'Save', {run: mock.run}), /changed after review/);
  await core.git(root, ['config', '--local', 'remote.origin.pushurl', 'https://github.com/foreign/test.git']);
  await assert.rejects(prepareUpload(root, mock.run), /different repository/);
  await core.git(root, ['config', '--local', '--unset', 'remote.origin.pushurl']);
  await fs.writeFile(path.join(root, '.git', 'MERGE_HEAD'), 'pending');
  await assert.rejects(prepareUpload(root, mock.run), /current Git merge/);
  await fs.rm(path.join(root, '.git', 'MERGE_HEAD'));
  const nested = path.join(root, 'nested'); await fs.mkdir(nested);
  await core.git(nested, ['init']); await fs.writeFile(path.join(nested, 'child.txt'), 'child');
  await assert.rejects(prepareUpload(root, mock.run), /Nested repositories/);
  await fs.rm(nested, {recursive:true});
  await core.git(root, ['add', '-f', 'secret.txt']);
  await assert.rejects(prepareUpload(root, mock.run), /Ignored files/);
  await core.git(root, ['rm', '--cached', 'secret.txt']);
  await uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run});
  await core.git(root, ['checkout', '--detach']);
  await assert.rejects(prepareUpload(root, mock.run), /detached HEAD/);
});
test('wrong project root is refused before mutations', async t => {
  const root = await project(t); const child = path.join(root, 'child'); await fs.mkdir(child); await fs.writeFile(path.join(child, 'zero.json'), '{}');
  const mock = transport();
  await assert.rejects(prepareUpload(child, mock.run), /different Git repository/);
  assert.deepEqual(mock.calls, [['rev-parse', '--show-toplevel']]);
});
test('failed push or mismatched confirmation never reports success and masks private stderr', async t => {
  for (const failure of ['rejected non-fast-forward token=PRIVATE', 'Authentication failed token=PRIVATE', 'Permission denied token=PRIVATE']) {
    const root = await project(t); const mock = transport({failure});
    await assert.rejects(uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run}), error => {
      assert.doesNotMatch(error.message, /PRIVATE/); return /changes|authentication|refused/.test(error.message);
    });
    assert.ok(!mock.calls.some(args => args[0] === 'ls-remote'));
    assert.ok(await core.git(root, ['rev-parse', 'HEAD']));
  }
  const root = await project(t); const mock = transport({wrongHead: true});
  await assert.rejects(uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run}), /did not confirm/);
});
test('renames, deletions and filenames with pathspec syntax are staged literally', async t => {
  const root = await project(t); const mock = transport();
  await uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run});
  await core.git(root, ['mv', 'Main.java', 'Renamed.java']);
  await fs.rm(path.join(root, 'zero.json'));
  // Keep the required marker; delete another tracked file instead.
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.rm(path.join(root, '.gitignore'));
  await fs.rm(path.join(root, 'secret.txt'));
  await fs.writeFile(path.join(root, ':literal.java'), 'class Literal {}');
  const result = await uploadPrepared(await prepareUpload(root, mock.run), 'Rename and tidy', {run: mock.run});
  assert.equal(result.uploaded, true);
  assert.match(await core.git(root, ['ls-files']), /:literal.java/);
  assert.doesNotMatch(await core.git(root, ['ls-files']), /Main.java|\.gitignore/);
});
test('branch drift and multiple push destinations require a new review', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  await core.git(root, ['symbolic-ref', 'HEAD', 'refs/heads/other']);
  await assert.rejects(uploadPrepared(plan, 'Start', {run: mock.run}), /changed after review/);
  await core.git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  await core.git(root, ['config', '--local', '--add', 'remote.origin.pushurl', 'https://github.com/student/test.git']);
  await core.git(root, ['config', '--local', '--add', 'remote.origin.pushurl', 'https://github.com/student/second.git']);
  await assert.rejects(prepareUpload(root, mock.run), /multiple destinations/);
  assert.ok(!mock.calls.some(args => args[0] === 'push'));
});
test('commit identity failure is actionable and stops before transport', async t => {
  const root = await project(t); const mock = transport();
  const run = async (cwd, args) => {
    if (args[0] === 'commit') throw Object.assign(new Error('private'), {stderr: 'Author identity unknown private=SECRET'});
    return mock.run(cwd, args);
  };
  await assert.rejects(uploadPrepared(await prepareUpload(root, run), 'Start', {run}), error => {
    assert.match(error.message, /name and email/); assert.doesNotMatch(error.message, /SECRET/); return true;
  });
  assert.ok(!mock.calls.some(args => ['push', 'ls-remote'].includes(args[0])));
});
test('leading-space filenames remain exact and editing one after review stops before staging', async t => {
  const root = await project(t); const mock = transport();
  await fs.writeFile(path.join(root, ' leading.java'), 'class Leading {}\n');
  const plan = await prepareUpload(root, mock.run);
  assert.ok(plan.changes.some(change => change.path === ' leading.java'));
  await fs.writeFile(path.join(root, ' leading.java'), 'class Leading { int score; }\n');
  await assert.rejects(uploadPrepared(plan, 'Save', {run: mock.run}), /changed after review/);
  assert.ok(!mock.calls.some(args => args.includes('add') || args[0] === 'commit' || args[0] === 'push'));
  const reviewed = await prepareUpload(root, mock.run);
  const result = await uploadPrepared(reviewed, 'Save leading filename', {run: mock.run});
  assert.equal(result.uploaded, true);
  assert.ok((await core.git(root, ['ls-files', '-z'])).split('\0').includes(' leading.java'));
});
test('HEAD changed at dispatch cannot replace the captured reviewed commit', async t => {
  const root = await project(t);
  let dispatchedHead;
  const mock = transport({onPush: async (cwd, args) => {
    dispatchedHead = args[2].split(':')[0];
    await core.git(cwd, ['commit', '--allow-empty', '-m', 'Concurrent local commit']);
    assert.notEqual(await core.git(cwd, ['rev-parse', 'HEAD']), dispatchedHead);
  }});
  const plan = await prepareUpload(root, mock.run);
  await assert.rejects(uploadPrepared(plan, 'Save reviewed project', {run: mock.run}), /local project changed during upload/);
  assert.deepEqual(mock.calls.find(args => args[0] === 'push'), ['push', plan.remote, `${dispatchedHead}:refs/heads/main`]);
  assert.deepEqual(mock.calls.find(args => args[0] === 'ls-remote'), ['ls-remote', '--heads', plan.remote, 'refs/heads/main']);
});
test('origin changed at dispatch cannot replace the captured reviewed destination', async t => {
  const root = await project(t);
  const mock = transport({onPush: async cwd => {
    await core.git(cwd, ['remote', 'set-url', 'origin', 'https://github.com/foreign/other.git']);
  }});
  const plan = await prepareUpload(root, mock.run);
  await assert.rejects(uploadPrepared(plan, 'Save reviewed project', {run: mock.run}), /local project changed during upload/);
  assert.equal(mock.calls.find(args => args[0] === 'push')[1], plan.remote);
  assert.equal(mock.calls.find(args => args[0] === 'ls-remote')[2], plan.remote);
});
test('configured fetch or push URL rewrites are refused before staging and transport', async t => {
  for (const rule of ['insteadOf', 'pushInsteadOf']) {
    const root = await project(t); const mock = transport();
    await core.git(root, ['config', '--local', `url.https://github.com/foreign/.${rule}`, 'https://github.com/student/']);
    await assert.rejects(prepareUpload(root, mock.run), /URL rewriting is configured/);
    assert.ok(!mock.calls.some(args => args.includes('add') || ['commit', 'push', 'ls-remote'].includes(args[0])));
  }
});
