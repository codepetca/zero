'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const {updateRemoteTracking} = require('../src/git-tracking');
const remote = 'https://github.com/student/project.git';
const tracking = 'refs/remotes/origin/main';

async function fixture(t, format) {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-tracking-')));
  t.after(() => fs.rm(temporary, {recursive: true, force: true}));
  const root = path.join(temporary, 'project');
  const bare = path.join(temporary, 'remote.git');
  await fs.mkdir(root);
  const options = format ? [`--object-format=${format}`] : [];
  await core.git(temporary, ['init', '--bare', ...options, bare]);
  await core.git(root, ['init', '-b', 'main', ...options]);
  await core.git(root, ['config', '--local', 'user.name', 'Zero Test']);
  await core.git(root, ['config', '--local', 'user.email', 'zero-test@example.invalid']);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main {}\n');
  await core.git(root, ['add', 'Main.java']);
  await core.git(root, ['commit', '-m', 'Base']);
  const base = await core.git(root, ['rev-parse', 'HEAD']);
  await core.git(root, ['remote', 'add', 'origin', bare]);
  await core.git(root, ['push', '-u', 'origin', 'main']);
  await core.git(root, ['remote', 'set-url', 'origin', remote]);
  let sequence = 0;
  const commit = async () => {
    await core.git(root, ['commit', '--allow-empty', '-m', `Next ${++sequence}`]);
    return core.git(root, ['rev-parse', 'HEAD']);
  };
  return {root, bare, base, commit, update: (head, options, branch = 'main') => updateRemoteTracking(root, {remote, branch, head}, options)};
}
function observedRun() {
  const calls = [];
  return {calls, run: async (root, args) => { calls.push(args); return core.git(root, args); }};
}
async function snapshot(root) {
  return {
    head: await core.git(root, ['rev-parse', 'HEAD']),
    branch: await core.git(root, ['symbolic-ref', 'HEAD']),
    index: await fs.readFile(path.join(root, '.git', 'index')),
    source: await fs.readFile(path.join(root, 'Main.java')),
    config: await fs.readFile(path.join(root, '.git', 'config')),
    branches: await core.git(root, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'])
  };
}

test('confirmed upload refreshes native ahead count while preserving local work and Git settings', async t => {
  const f = await fixture(t);
  const head = await f.commit();
  // A local bare remote supplies real upload evidence without network/authentication.
  await core.git(f.root, ['push', f.bare, `${head}:refs/heads/main`]);
  assert.equal(await core.git(f.root, ['rev-parse', 'origin/main']), f.base);
  assert.equal(await core.git(f.root, ['rev-list', '--count', '@{upstream}..HEAD']), '1');
  await fs.writeFile(path.join(f.root, 'Main.java'), 'class Main { int unsaved; }\n');
  const before = await snapshot(f.root);
  const observed = observedRun();
  assert.deepEqual(await f.update(head, observed), {updated: true, ref: tracking, head});
  assert.equal(await core.git(f.root, ['rev-list', '--count', '@{upstream}..HEAD']), '0');
  assert.deepEqual(await snapshot(f.root), before);
  assert.ok(!observed.calls.some(args => ['push', 'fetch', 'pull', 'ls-remote', 'clone', 'credential'].includes(args[0])));
  assert.deepEqual(observed.calls.filter(args => args.includes('update-ref')), [['-c', `core.hooksPath=${os.devNull}`, 'update-ref', '--no-deref', tracking, head, f.base]]);
  assert.equal((await f.update(head)).updated, false);
});

test('tracking main can refresh while a different feature branch is checked out', async t => {
  const f = await fixture(t); const head = await f.commit();
  await core.git(f.root, ['switch', '-c', 'feature']);
  await f.commit();
  const before = await snapshot(f.root);
  await f.update(head);
  assert.equal(await core.git(f.root, ['rev-parse', tracking]), head);
  assert.deepEqual(await snapshot(f.root), before);
});

test('missing tracking refs use the matching object-format zero OID', async t => {
  for (const format of [undefined, 'sha256']) await t.test(format || 'sha1', async t => {
    const f = await fixture(t, format); const head = await f.commit();
    await core.git(f.root, ['update-ref', '-d', tracking]);
    const observed = observedRun();
    await f.update(head, observed);
    assert.equal(await core.git(f.root, ['rev-parse', tracking]), head);
    assert.deepEqual(observed.calls.at(-1), ['-c', `core.hooksPath=${os.devNull}`, 'update-ref', '--no-deref', tracking, head, '0'.repeat(head.length)]);
  });
});

test('invalid branch, SHA, noncommit and missing objects cannot update tracking', async t => {
  const f = await fixture(t);
  const tree = await core.git(f.root, ['rev-parse', 'HEAD^{tree}']);
  for (const [branch, head] of [['main\nother', f.base], ['../main', f.base], ['-main', f.base], ['main@{1}', f.base], ['main', '--all'], ['main', 'a'.repeat(39)], ['main', '0'.repeat(40)], ['main', tree]]) {
    const observed = observedRun();
    await assert.rejects(f.update(head, observed, branch));
    assert.ok(!observed.calls.some(args => args.includes('update-ref')));
    assert.equal(await core.git(f.root, ['rev-parse', tracking]), f.base);
  }
});

test('nested project roots and moved repository roots are refused', async t => {
  const f = await fixture(t); const head = await f.commit();
  const child = path.join(f.root, 'child'); await fs.mkdir(child);
  await assert.rejects(updateRemoteTracking(child, {remote, branch: 'main', head}), /repository changed/);
  let roots = 0;
  const observed = observedRun();
  const run = async (root, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel' && ++roots === 2) return child;
    return observed.run(root, args);
  };
  await assert.rejects(f.update(head, {run}), /repository changed/);
  assert.ok(!observed.calls.some(args => args.includes('update-ref')));
});

test('origin mismatch, multiple URLs and URL rewrites are refused without writes', async t => {
  for (const change of ['fetch', 'push', 'multiple', 'insteadOf', 'pushInsteadOf']) await t.test(change, async t => {
    const f = await fixture(t); const head = await f.commit();
    if (change === 'fetch') await core.git(f.root, ['remote', 'set-url', 'origin', 'https://github.com/foreign/other.git']);
    else if (change === 'push') await core.git(f.root, ['config', '--local', 'remote.origin.pushurl', 'https://github.com/foreign/other.git']);
    else if (change === 'multiple') await core.git(f.root, ['config', '--local', '--add', 'remote.origin.url', remote]);
    else await core.git(f.root, ['config', '--local', `url.https://github.com/foreign/.${change}`, 'https://github.com/student/']);
    const before = await snapshot(f.root); const observed = observedRun();
    await assert.rejects(f.update(head, observed));
    assert.ok(!observed.calls.some(args => args.includes('update-ref')));
    assert.deepEqual(await snapshot(f.root), before);
  });
});

test('origin changes during inspection are preserved and prevent the update', async t => {
  const f = await fixture(t); const head = await f.commit();
  const run = async (root, args) => {
    if (args.includes('cat-file')) await core.git(root, ['remote', 'set-url', 'origin', 'https://github.com/foreign/other.git']);
    return core.git(root, args);
  };
  await assert.rejects(f.update(head, {run}), /Origin changed/);
  assert.equal(await core.git(f.root, ['remote', 'get-url', 'origin']), 'https://github.com/foreign/other.git');
  assert.equal(await core.git(f.root, ['rev-parse', tracking]), f.base);
});

test('symbolic tracking refs are refused without writing their target or replacing the symbol', async t => {
  const f = await fixture(t); const head = await f.commit();
  await core.git(f.root, ['symbolic-ref', tracking, 'refs/heads/main']);
  const before = await snapshot(f.root);
  await assert.rejects(f.update(head), /symbolic/);
  assert.equal(await core.git(f.root, ['symbolic-ref', tracking]), 'refs/heads/main');
  assert.deepEqual(await snapshot(f.root), before);
});

test('newer and divergent tracking refs never rewind', async t => {
  for (const divergent of [false, true]) await t.test(divergent ? 'divergent' : 'newer', async t => {
    const f = await fixture(t); const head = await f.commit(); const newer = await f.commit();
    await core.git(f.root, ['update-ref', tracking, newer]);
    await core.git(f.root, ['reset', '--hard', divergent ? f.base : head]);
    const confirmed = divergent ? await f.commit() : head;
    await assert.rejects(f.update(confirmed), /newer or different/);
    assert.equal(await core.git(f.root, ['rev-parse', tracking]), newer);
  });
});

test('concurrent OID moves survive compare-and-swap and errors omit raw secret output', async t => {
  const f = await fixture(t); const head = await f.commit(); const concurrent = await f.commit();
  const run = async (root, args) => {
    if (args.includes('update-ref')) await core.git(root, ['update-ref', tracking, concurrent]);
    return core.git(root, args);
  };
  await assert.rejects(f.update(head, {run}), /Could not refresh local Git tracking/);
  assert.equal(await core.git(f.root, ['rev-parse', tracking]), concurrent);
  const privateRun = async () => { throw Object.assign(new Error('PRIVATE TOKEN'), {stderr: 'PRIVATE CREDENTIAL', code: 128}); };
  await assert.rejects(f.update(head, {run: privateRun}), error => {
    assert.doesNotMatch(`${error.message} ${error.stack}`, /PRIVATE|TOKEN|CREDENTIAL/);
    assert.equal(error.cause, undefined); assert.equal(error.stderr, undefined); return true;
  });
});

test('reference-transaction hooks cannot execute during the metadata write', async t => {
  const f = await fixture(t); const head = await f.commit();
  const hook = path.join(f.root, '.git', 'hooks', 'reference-transaction');
  await fs.writeFile(hook, '#!/bin/sh\ntouch hook-ran\n'); await fs.chmod(hook, 0o755);
  await f.update(head);
  await assert.rejects(fs.access(path.join(f.root, 'hook-ran')), {code: 'ENOENT'});
});

test('partial clone settings are refused before object reads that could lazily fetch', async t => {
  for (const key of ['remote.origin.promisor', 'extensions.partialclone']) await t.test(key, async t => {
    const f = await fixture(t); const head = await f.commit();
    await core.git(f.root, ['config', '--local', key, key.startsWith('remote') ? 'true' : 'origin']);
    const observed = observedRun();
    await assert.rejects(f.update(head, observed), /complete local Git history/);
    assert.ok(!observed.calls.some(args => args.includes('cat-file') || args.includes('merge-base') || args.includes('update-ref')));
  });
});

test('replacement refs cannot disguise a cached newer commit as an ancestor', async t => {
  const f = await fixture(t); const head = await f.commit(); const newer = await f.commit();
  await core.git(f.root, ['update-ref', tracking, newer]);
  await core.git(f.root, ['replace', newer, f.base]);
  await assert.rejects(f.update(head), /newer or different/);
  assert.equal(await core.git(f.root, ['rev-parse', tracking]), newer);
});

test('a symbolic ref introduced at write time cannot redirect the update into another branch', async t => {
  const f = await fixture(t); const head = await f.commit();
  await core.git(f.root, ['branch', 'other', f.base]);
  const run = async (root, args) => {
    if (args.includes('update-ref')) await core.git(root, ['symbolic-ref', tracking, 'refs/heads/other']);
    return core.git(root, args);
  };
  await f.update(head, {run});
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/other']), f.base);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), head);
});
