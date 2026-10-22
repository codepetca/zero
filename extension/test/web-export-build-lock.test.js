'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { acquireBuildLock, _test } = require('../src/web-export/build-lock');
const { _test: engine } = require('../src/web-export');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-build-lock-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project'), locks = path.join(root, 'locks');
  await fs.mkdir(projectRoot); await fs.mkdir(locks);
  const file = path.join(locks, crypto.createHash('sha256').update(projectRoot).digest('hex') + '.lock');
  const options = { locks, projectRoot };
  const record = changes => ({ pid: process.pid, projectRoot, startedAt: new Date().toISOString(), ...changes });
  const write = data => fs.writeFile(file, JSON.stringify(data), { mode: 0o600 });
  return { root, file, options, record, write };
}
async function deadChild() {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
  await once(child, 'close');
  assert.equal(_test.alive(child.pid), false);
  return child.pid;
}
test('dead legacy owner from before boot recovers even when its PID was reused', async t => {
  const f = await fixture(t), messages = [];
  await f.write(f.record({ startedAt: '2020-01-01T00:00:00.000Z' }));
  const lock = await acquireBuildLock({ ...f.options, onProgress: line => messages.push(line), _test: { boot: { id: 'new-boot', startedAt: Date.parse('2026-01-01') } } });
  assert.match(messages.join(), /Recovered/);
  const saved = JSON.parse(await fs.readFile(f.file));
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.pid, process.pid);
  await lock.release();
  await assert.rejects(fs.stat(f.file), { code: 'ENOENT' });
});
test('actual exited child owner recovers a new lock before a compiler was launched', async t => {
  const f = await fixture(t), pid = await deadChild();
  await f.write(f.record({ schemaVersion: 2, token: crypto.randomUUID(), phase: 'preparing', pid }));
  const lock = await acquireBuildLock(f.options);
  await lock.release();
});
test('live owner, legacy same-boot dead owner and unknown process status are preserved', async t => {
  const f = await fixture(t);
  for (const [pid, probe] of [[process.pid, () => true], [await deadChild(), () => false], [123, () => null]]) {
    const record = f.record({ pid }); await f.write(record);
    await assert.rejects(acquireBuildLock({ ...f.options, _test: { boot: null, alive: probe } }), /live or unverified compiler/);
    assert.deepEqual(JSON.parse(await fs.readFile(f.file)), record);
  }
});
test('orphaned compiler group protects the lock after its owner and group leader exited', async t => {
  const f = await fixture(t);
  const record = f.record({ schemaVersion: 2, token: crypto.randomUUID(), phase: 'compiling', platform: process.platform, compilerPid: 1234, pid: 5678 });
  await f.write(record);
  await assert.rejects(acquireBuildLock({ ...f.options, _test: { boot: null, alive: pid => pid === -1234 } }), /live or unverified compiler/);
  assert.deepEqual(JSON.parse(await fs.readFile(f.file)), record);
  if (process.platform !== 'win32') {
    const lock = await acquireBuildLock({ ...f.options, _test: { boot: null, alive: () => false } });
    await lock.release();
  }
});
test('unknown launch gap and Windows detached process status fail closed', async t => {
  const f = await fixture(t);
  for (const phase of ['launching', 'compiling']) {
    await f.write(f.record({ schemaVersion: 2, token: crypto.randomUUID(), phase, platform: 'win32', compilerPid: 123, pid: 456 }));
    await assert.rejects(acquireBuildLock({ ...f.options, _test: { boot: null, platform: 'win32', alive: () => false } }), /live or unverified compiler/);
  }
});
test('two stale-lock contenders admit exactly one build', async t => {
  const f = await fixture(t);
  await f.write(f.record({ startedAt: '2020-01-01T00:00:00.000Z' }));
  const results = await Promise.allSettled([acquireBuildLock(f.options), acquireBuildLock(f.options)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  await results.find(result => result.status === 'fulfilled').value.release();
});
test('mismatched project, malformed, untrusted and symlink locks are preserved', async t => {
  const f = await fixture(t);
  await f.write(f.record({ projectRoot: '/other/project', startedAt: '2020-01-01T00:00:00.000Z' }));
  await assert.rejects(acquireBuildLock(f.options), /unfamiliar/);
  await fs.writeFile(f.file, '{');
  await assert.rejects(acquireBuildLock(f.options), /unreadable/);
  assert.equal(await fs.readFile(f.file, 'utf8'), '{');
  await f.write(f.record()); await fs.chmod(f.file, 0o666);
  await assert.rejects(acquireBuildLock(f.options), /trusted ordinary/);
  await fs.unlink(f.file);
  const target = path.join(f.root, 'private'); await fs.writeFile(target, 'private');
  await fs.symlink(target, f.file);
  await assert.rejects(acquireBuildLock(f.options), /trusted ordinary/);
  assert.equal(await fs.readFile(target, 'utf8'), 'private');
});
test('cleanup and state updates never remove or overwrite a replacement lock', async t => {
  const f = await fixture(t), lock = await acquireBuildLock(f.options);
  const replacement = f.record({ token: crypto.randomUUID() });
  await fs.unlink(f.file); await f.write(replacement);
  await assert.rejects(lock.update({ phase: 'launching' }), /lost ownership/);
  await lock.release();
  assert.deepEqual(JSON.parse(await fs.readFile(f.file)), replacement);
});
test('cancellation still releases this build and leaves no recovery guard', async t => {
  const f = await fixture(t), controller = new AbortController();
  const lock = await acquireBuildLock({ ...f.options, signal: controller.signal });
  controller.abort(); await lock.release();
  assert.deepEqual(await fs.readdir(f.options.locks), []);
});
test('pre-boot guard does not block recovery and current-boot dead guard is preserved', async t => {
  const f = await fixture(t), boot = { id: 'current-test-boot', startedAt: Date.parse('2026-01-01') };
  const old = f.file + '.guard-' + crypto.createHash('sha256').update('previous-test-boot').digest('hex').slice(0, 24);
  await fs.writeFile(old, 'old interrupted recovery', { mode: 0o600 });
  const lock = await acquireBuildLock({ ...f.options, _test: { boot } }); await lock.release();
  const current = f.file + '.guard-' + crypto.createHash('sha256').update(boot.id).digest('hex').slice(0, 24);
  const record = f.record({ pid: await deadChild() });
  await fs.writeFile(current, JSON.stringify(record), { mode: 0o600 });
  await assert.rejects(acquireBuildLock({ ...f.options, _test: { boot } }), /guard needs inspection/);
  assert.deepEqual(JSON.parse(await fs.readFile(current)), record);
});
test('real Maven subprocess records its detached compiler before releasing', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), lock = await acquireBuildLock(f.options);
  const wrapper = path.join(f.root, 'mvnw');
  await fs.writeFile(wrapper, '#!/bin/sh\nsleep 0.1\n', { mode: 0o755 });
  const result = await engine.runMaven({ wrapper, projectRoot: f.options.projectRoot, buildRoot: f.root, cacheRoot: f.root, onProgress: () => {}, buildLock: lock });
  assert.equal(result.code, 0);
  const saved = JSON.parse(await fs.readFile(f.file));
  assert.equal(saved.phase, 'compiling'); assert.ok(saved.compilerPid > 0);
  await lock.release();
  await assert.rejects(fs.stat(f.file), { code: 'ENOENT' });
});
test('Maven cancellation with a real lock terminates the group before ownership cleanup', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), controller = new AbortController();
  const lock = await acquireBuildLock({ ...f.options, signal: controller.signal });
  const wrapper = path.join(f.root, 'mvnw');
  await fs.writeFile(wrapper, '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 });
  const running = engine.runMaven({ wrapper, projectRoot: f.options.projectRoot, buildRoot: f.root, cacheRoot: f.root, onProgress: () => {}, buildLock: lock, signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  assert.notEqual((await running).code, 0);
  await lock.release();
  assert.deepEqual(await fs.readdir(f.options.locks), []);
});
test('a surviving compiler group prevents completion and lock release', async t => {
  const f = await fixture(t), lock = await acquireBuildLock({ ...f.options, _test: { platform: 'linux', alive: () => true } });
  await lock.update({ phase: 'compiling', compilerPid: 1234 });
  assert.equal(lock.canCleanTemporary(), false);
  await assert.rejects(lock.compilerFinished(), /process group is still active/);
  await assert.rejects(lock.release(), /process group is still active/);
  assert.equal(JSON.parse(await fs.readFile(f.file)).compilerPid, 1234);
});
test('Maven spawn error does not leave a compiler PID or mask its error', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), lock = await acquireBuildLock(f.options);
  await assert.rejects(engine.runMaven({ wrapper: path.join(f.root, 'missing'), projectRoot: f.options.projectRoot, buildRoot: f.root, cacheRoot: f.root, onProgress: () => {}, buildLock: lock }), { code: 'ENOENT' });
  await lock.release();
  assert.deepEqual(await fs.readdir(f.options.locks), []);
});
test('failed compiler registration preserves a real orphan group and build folder until it exits', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), lock = await acquireBuildLock(f.options);
  const buildRoot = path.join(f.root, 'build');
  await fs.mkdir(buildRoot);
  const marker = path.join(buildRoot, 'keep-while-compiling');
  await fs.writeFile(marker, 'compiler work');
  const releaseMarker = path.join(f.root, 'release-compiler');
  const waiter = path.join(f.root, 'wait-for-release.js');
  await fs.writeFile(waiter, `
    const fs = require('node:fs');
    const deadline = Date.now() + 30000;
    const timer = setInterval(() => {
      if (fs.existsSync(process.env.ZERO_RELEASE_FILE) || Date.now() >= deadline) clearInterval(timer);
    }, 20);
  `);
  const wrapper = path.join(f.root, 'mvnw');
  await fs.writeFile(wrapper, '#!/bin/sh\n"$ZERO_NODE" "$ZERO_WAITER_SCRIPT" > /dev/null 2>&1 &\nexit 0\n', { mode: 0o755 });
  const writeFile = fs.writeFile;
  const failure = Object.assign(new Error('Injected compiler registration failure'), { code: 'EIO' });
  const writeMock = t.mock.method(fs, 'writeFile', async (file, data, ...args) => {
    if (file.startsWith(f.file + '.') && file.endsWith('.tmp') && JSON.parse(data).phase === 'compiling') throw failure;
    return writeFile(file, data, ...args);
  });
  let compilerPid;
  const trackedLock = { update: lock.update, trackCompiler(pid) { compilerPid = pid; lock.trackCompiler(pid); } };
  async function waitForCompilerExit() {
    if (!compilerPid) return;
    const deadline = Date.now() + 35000;
    while (_test.alive(-compilerPid) !== false && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(_test.alive(-compilerPid), false, 'the owned test descendant exited after release or its bounded fallback');
  }
  try {
    await assert.rejects(engine.runMaven({ wrapper, projectRoot: f.options.projectRoot, buildRoot, cacheRoot: f.root,
      env: { ZERO_NODE: process.execPath, ZERO_WAITER_SCRIPT: waiter, ZERO_RELEASE_FILE: releaseMarker },
      onProgress: () => {}, buildLock: trackedLock }), failure);
    writeMock.mock.restore();
    assert.ok(compilerPid > 0);
    assert.equal(_test.alive(compilerPid), false);
    assert.equal(_test.alive(-compilerPid), true);
    assert.equal(JSON.parse(await fs.readFile(f.file)).phase, 'launching');
    assert.equal(lock.canCleanTemporary(), false);
    if (lock.canCleanTemporary()) await fs.rm(buildRoot, { recursive: true });
    await assert.rejects(lock.compilerFinished(), /process group is still active or unverified/);
    await assert.rejects(lock.release(), /process group is still active or unverified/);
    assert.equal(await fs.readFile(marker, 'utf8'), 'compiler work');
    await fs.stat(f.file);
    await fs.writeFile(releaseMarker, 'release');
    await waitForCompilerExit();
    assert.equal(lock.canCleanTemporary(), true);
    await lock.compilerFinished();
    await fs.rm(buildRoot, { recursive: true });
    await lock.release();
    await assert.rejects(fs.stat(f.file), { code: 'ENOENT' });
    await assert.rejects(fs.stat(buildRoot), { code: 'ENOENT' });
  } finally {
    writeMock.mock.restore();
    await writeFile(releaseMarker, 'release');
    await waitForCompilerExit();
    if (lock.canCleanTemporary()) {
      await fs.rm(buildRoot, { recursive: true, force: true });
      await lock.release();
    }
  }
});
test('failed Windows compiler registration preserves unknown descendants even after the PID exits', async t => {
  const f = await fixture(t), lock = await acquireBuildLock({ ...f.options, _test: { platform: 'win32', alive: () => false } });
  await lock.update({ phase: 'launching' });
  lock.trackCompiler(1234);
  const writeFile = fs.writeFile;
  const writeMock = t.mock.method(fs, 'writeFile', async (file, data, ...args) => {
    if (file.startsWith(f.file + '.') && file.endsWith('.tmp')) throw Object.assign(new Error('Injected write failure'), { code: 'EIO' });
    return writeFile(file, data, ...args);
  });
  await assert.rejects(lock.update({ phase: 'compiling', compilerPid: 1234 }), { code: 'EIO' });
  writeMock.mock.restore();
  assert.equal(lock.canCleanTemporary(), false);
  await assert.rejects(lock.compilerFinished(), /active or unverified/);
  await assert.rejects(lock.release(), /active or unverified/);
  assert.equal(JSON.parse(await fs.readFile(f.file)).phase, 'launching');
});
