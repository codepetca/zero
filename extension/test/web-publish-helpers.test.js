'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const helpers = require('../src/web-publish-helpers');
const {helperHashes, adaptSources} = require('../src/web-export/adapters');
const repository = path.resolve(__dirname, '../..');
const filename = 'src/main/java/zero/App.java';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let bundlePromise;
async function fixture(t, {old = true, crlf = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-helper-upgrade-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const extensionPath = path.join(root, 'extension');
  fs.mkdirSync(path.join(extensionPath, 'media'), {recursive: true});
  const bundle = await (bundlePromise ||= import('../../scripts/lesson-projects.mjs').then(module => module.lessonProjects(repository)));
  fs.writeFileSync(path.join(extensionPath, 'media/lesson-projects.json'), JSON.stringify(bundle));
  fs.mkdirSync(path.join(root, '.git'));
  const files = new Map(bundle.projects[0].files.filter(file => file.path.startsWith('src/main/java/zero/')).map(file => [file.path, Buffer.from(file.content, 'base64')]));
  const current = files.get(filename);
  // Immutable released bytes; the pinned hash prevents historical fixture drift.
  const previous = fs.readFileSync(path.join(__dirname, 'fixtures/stock-App.java'));
  assert.equal(hash(previous), 'bdcb1060ad5a30f16f1a395c522a520d2506530584bda71a0e4cbe1e7c467c09');
  if (old) files.set(filename, previous);
  for (const [name, bytes] of files) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), crlf ? bytes.toString().replaceAll('\n', '\r\n') : bytes);
  }
  return {root, extensionPath, current, previous, target: path.join(root, filename), files};
}
const inspect = h => helpers.inspect(h.root, {extensionPath: h.extensionPath});
const guard = {beforeWrite: async () => {}};
test('the exact released App upgrades to adapter-pinned readable source and retains its original inode', async t => {
  const h = await fixture(t), plan = await inspect(h), before = fs.statSync(h.target);
  assert.deepEqual(plan, {upgrade: true, changed: [filename]});
  const original = fs.openSync(h.target, 'r'); t.after(() => fs.closeSync(original));
  const others = [...h.files].filter(([name]) => name !== filename).map(([name, bytes]) => [name, bytes, fs.statSync(path.join(h.root, name)).ino]);
  let guards = 0;
  assert.deepEqual(await helpers.apply(h.root, plan, {beforeWrite: async () => { guards++; }}), {updated: [filename]});
  assert.equal(guards, 1);
  assert.deepEqual(fs.readFileSync(h.target), h.current);
  assert.equal(hash(fs.readFileSync(h.target)), helperHashes['zero/App.java']);
  assert.equal(fs.fstatSync(original).ino, before.ino);
  assert.deepEqual(fs.readFileSync(original), h.previous);
  for (const [name, bytes, inode] of others) { assert.deepEqual(fs.readFileSync(path.join(h.root, name)), bytes); assert.equal(fs.statSync(path.join(h.root, name)).ino, inode); }
  assert.equal((await inspect(h)).upgrade, false);
  assert.throws(() => adaptSources({sources: {'zero/App.java': h.previous.toString(), 'Main.java': 'class Main extends App {}'}}), /differs from the reviewed browser adapter/);
  assert.doesNotThrow(() => adaptSources({sources: {'zero/App.java': fs.readFileSync(h.target, 'utf8'), 'Main.java': 'class Main extends App {}'}}));
  await assert.rejects(helpers.apply(h.root, plan, guard), /Review/);
});
test('current helpers are a byte-preserving no-op and CRLF follows the existing adapter normalization', async t => {
  for (const old of [false, true]) await t.test(String(old), async t => {
    const h = await fixture(t, {old, crlf: true}), original = fs.readFileSync(h.target), plan = await inspect(h);
    assert.equal(plan.upgrade, old);
    await helpers.apply(h.root, plan, {beforeWrite: async () => { assert.ok(old); }});
    assert.deepEqual(fs.readFileSync(h.target), old ? h.current : original);
    if (!old) assert.equal(fs.existsSync(path.join(h.root, '.git/zero-publishing-upgrades')), false);
  });
});
test('edited, whitespace-changed and unknown helpers fail before replacing any source', async t => {
  for (const kind of ['App edit', 'App whitespace', 'other helper']) await t.test(kind, async t => {
    const h = await fixture(t), target = kind === 'other helper' ? path.join(h.root, 'src/main/java/zero/Sound.java') : h.target;
    fs.appendFileSync(target, kind === 'App whitespace' ? '\n' : '// Student change\n');
    const bytes = fs.readFileSync(target);
    await assert.rejects(inspect(h), /custom or unknown content/);
    assert.deepEqual(fs.readFileSync(target), bytes);
    if (target !== h.target) assert.deepEqual(fs.readFileSync(h.target), h.previous);
    assert.equal(fs.existsSync(path.join(h.root, '.git/zero-publishing-upgrades')), false);
  });
});
test('symbolic links, directories, hard links and oversized sources fail closed', async t => {
  for (const kind of ['leaf link', 'parent link', 'root link', 'directory', 'hard link', 'large']) await t.test(kind, async t => {
    const h = await fixture(t);
    if (kind === 'leaf link') { fs.renameSync(h.target, h.target + '.saved'); fs.symlinkSync(h.target + '.saved', h.target); }
    if (kind === 'parent link') { const parent = path.dirname(h.target); fs.renameSync(parent, parent + '.saved'); fs.symlinkSync(parent + '.saved', parent); }
    if (kind === 'root link') { const linkedRoot = h.root + '.link'; fs.symlinkSync(h.root, linkedRoot); t.after(() => fs.unlinkSync(linkedRoot)); h.root = linkedRoot; }
    if (kind === 'directory') { fs.unlinkSync(h.target); fs.mkdirSync(h.target); }
    if (kind === 'hard link') fs.linkSync(h.target, path.join(h.root, 'alias.java'));
    if (kind === 'large') fs.writeFileSync(h.target, Buffer.alloc(256 * 1024 + 1));
    await assert.rejects(inspect(h), /symbolic links?|regular file|hard links|too large/);
  });
});
test('mandatory project guard, guard failures and guarded byte/path drift preserve source', async t => {
  for (const kind of ['no guard', 'guard rejects', 'bytes', 'same-content inode', 'parent', 'missing created']) await t.test(kind, async t => {
    const h = await fixture(t);
    if (kind === 'missing created') fs.unlinkSync(path.join(h.root, 'src/main/java/zero/Music.java'));
    const plan = await inspect(h);
    const beforeWrite = async () => {
      if (kind === 'guard rejects') throw Error('Publish context changed');
      if (kind === 'bytes') fs.appendFileSync(h.target, '// Saved after review\n');
      if (kind === 'same-content inode') { fs.renameSync(h.target, h.target + '.old'); fs.copyFileSync(h.target + '.old', h.target); }
      if (kind === 'parent') { const parent = path.dirname(h.target); fs.renameSync(parent, parent + '.old'); fs.mkdirSync(parent); for (const [name, bytes] of h.files) { fs.mkdirSync(path.dirname(path.join(h.root,name)),{recursive:true}); fs.writeFileSync(path.join(h.root, name), bytes); } }
      if (kind === 'missing created') fs.writeFileSync(path.join(h.root, 'src/main/java/zero/Music.java'), 'Student source');
    };
    await assert.rejects(helpers.apply(h.root, plan, kind === 'no guard' ? {} : {beforeWrite}), /guard|changed/);
    assert.ok(fs.readFileSync(h.target).equals(h.previous) || fs.readFileSync(h.target, 'utf8').endsWith('// Saved after review\n'));
    assert.equal(fs.existsSync(path.join(h.root, '.git/zero-publishing-upgrades')), false);
  });
});
test('staging failures and failed installs restore the previous helper without truncating it', async t => {
  for (const kind of ['stage', 'install', 'short writes']) await t.test(kind, async t => {
    const h = await fixture(t), plan = await inspect(h); let failed = false;
    const io = {...fs,
      ftruncateSync() { assert.fail('Never truncate helper source'); },
      writeSync(fd, bytes, offset, length, position) { if (kind === 'stage' && !failed) { failed = true; throw Error('Disk full'); } return fs.writeSync(fd, bytes, offset, kind === 'short writes' ? Math.min(length, 13) : length, position); },
      linkSync(source, target) { if (kind === 'install' && !failed && target === h.target) { failed = true; throw Error('Install failed'); } return fs.linkSync(source, target); }
    };
    if (kind === 'short writes') { await helpers.apply(h.root, plan, {...guard, io}); assert.deepEqual(fs.readFileSync(h.target), h.current); }
    else { await assert.rejects(helpers.apply(h.root, plan, {...guard, io}), kind === 'stage' ? /not replaced/ : /restored/); assert.deepEqual(fs.readFileSync(h.target), h.previous); }
  });
});
test('a concurrent source edit during staging survives and aborts the update', async t => {
  const h = await fixture(t), plan = await inspect(h); let edited = false;
  const io = {...fs, writeSync(...args) { const count = fs.writeSync(...args); if (!edited) { edited = true; fs.appendFileSync(h.target, '// Concurrent edit\n'); } return count; }};
  await assert.rejects(helpers.apply(h.root, plan, {...guard, io}), /changed/);
  assert.ok(fs.readFileSync(h.target, 'utf8').endsWith('// Concurrent edit\n'));
});
test('corrupt or stale bundled canonical sources never alter the project', async t => {
  const h = await fixture(t), bundlePath = path.join(h.extensionPath, 'media/lesson-projects.json'), bundle = JSON.parse(fs.readFileSync(bundlePath));
  for (const project of bundle.projects) project.files.find(file => file.path === filename).content = h.previous.toString('base64');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle));
  await assert.rejects(inspect(h), /do not match the reviewed browser adapters/);
  assert.deepEqual(fs.readFileSync(h.target), h.previous);
});
test('plans cannot be forged, applied to another root or edited to select extra paths', async t => {
  const h = await fixture(t), other = await fixture(t), plan = await inspect(h);
  await assert.rejects(helpers.apply(h.root, {upgrade: true, changed: [filename]}, guard), /Review/);
  await assert.rejects(helpers.apply(other.root, plan, guard), /Review/);
  assert.throws(() => plan.changed.push('Main.java'), TypeError);
  assert.deepEqual(fs.readFileSync(h.target), h.previous);
});
test('missing helpers stay missing while an existing reviewed App can update', async t => {
  const h = await fixture(t), missing = path.join(h.root, 'src/main/java/zero/Music.java');
  fs.unlinkSync(missing);
  const plan = await inspect(h);
  await helpers.apply(h.root, plan, guard);
  assert.deepEqual(fs.readFileSync(h.target), h.current);
  assert.equal(fs.existsSync(missing), false);
});
test('linked Git worktrees are preserved and require an ordinary clone for source recovery', async t => {
  const h = await fixture(t), plan = await inspect(h);
  fs.rmdirSync(path.join(h.root, '.git'));
  fs.writeFileSync(path.join(h.root, '.git'), 'gitdir: elsewhere\n');
  await assert.rejects(helpers.apply(h.root, plan, guard), /ordinary Git clone/);
  assert.deepEqual(fs.readFileSync(h.target), h.previous);
});
test('concurrent writes through the old source descriptor survive in the recovery copy', async t => {
  const h = await fixture(t), plan = await inspect(h), descriptor = fs.openSync(h.target, 'a');
  t.after(() => fs.closeSync(descriptor));
  let edited = false;
  const io = {...fs, linkSync(source, target) { fs.linkSync(source, target); if (target === h.target && !edited) { edited = true; fs.writeSync(descriptor, Buffer.from('// Concurrent old-descriptor edit\n')); } }};
  await assert.rejects(helpers.apply(h.root, plan, {...guard, io}), /could not be restored[\s\S]*Recovery copies/);
  const directory = path.join(h.root, '.git/zero-publishing-upgrades');
  const backup = path.join(directory, fs.readdirSync(directory)[0], 'original-App.java');
  assert.ok(fs.readFileSync(backup, 'utf8').endsWith('// Concurrent old-descriptor edit\n'));
  assert.deepEqual(fs.readFileSync(h.target), h.current);
});


test('released App missing its current Element dependency rejects before any guard or source write', async t => {
  const h = await fixture(t), missing = path.join(h.root, 'src/main/java/zero/ui/Element.java');
  fs.unlinkSync(missing);
  const before = [...h.files].filter(([name]) => name !== 'src/main/java/zero/ui/Element.java').map(([name]) => [name, fs.readFileSync(path.join(h.root,name)), fs.statSync(path.join(h.root,name)).ino]);
  let guards = 0;
  await assert.rejects(async () => {
    const plan = await inspect(h);
    await helpers.apply(h.root, plan, {beforeWrite:async()=>{guards++;}});
  }, /required current helper src\/main\/java\/zero\/ui\/Element.java is missing or unsupported/);
  assert.equal(guards, 0);
  assert.equal(fs.existsSync(missing), false);
  for (const [name,bytes,inode] of before) { assert.deepEqual(fs.readFileSync(path.join(h.root,name)),bytes); assert.equal(fs.statSync(path.join(h.root,name)).ino,inode); }
  assert.equal(fs.existsSync(path.join(h.root,'.git/zero-publishing-upgrades')),false);
});
