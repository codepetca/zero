'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { zipFiles } = require('../src/web-export/zip');
const { prepareMavenDistribution, verifyMavenDistribution, distributionPath, _test } = require('../src/web-export/compatibility/maven-distribution');
const lock = require('../src/web-export/compatibility/maven-distribution.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function temporary(t) { const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-maven-integrity-'))); t.after(() => fs.rm(root, { force: true, recursive: true })); return root; }
function fixture(extra = []) {
  const inputs = [ { path: 'bin/mvn', bytes: Buffer.from('trusted reviewed executable') }, { path: 'boot/plexus.jar', bytes: Buffer.from('trusted bootstrap') }, { path: 'lib/maven-core.jar', bytes: Buffer.from('trusted library') }, ...extra ];
  const bytes = zipFiles(inputs.map(file => ({ ...file, path: 'apache-maven-test/' + file.path })));
  let offset = bytes.readUInt32LE(bytes.length - 6);
  while (bytes.readUInt32LE(offset) === 0x02014b50) { bytes.writeUInt16LE(0x314, offset + 4); bytes.writeUInt32LE((0o100755 << 16) >>> 0, offset + 38); offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32); }
  const manifest = { version: 'test', archiveRoot: 'apache-maven-test', url: 'https://example.invalid/reviewed.zip', archiveBytes: bytes.length, archiveSha256: hash(bytes), files: inputs.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: hash(file.bytes), mode: 0o755 })) };
  return { bytes, manifest };
}
test('reviewed official Maven manifest binds full distribution and both wrapper selection algorithms', () => {
  assert.equal(lock.archiveSha256, '0d7125e8c91097b36edb990ea5934e6c68b4440eef4ea96510a0f6815e7eeadb');
  assert.equal(lock.files.length, 96);
  for (const name of ['bin/mvn', 'bin/mvn.cmd', 'boot/plexus-classworlds-2.9.0.jar', 'lib/maven-core-3.9.11.jar']) assert.ok(lock.files.some(file => file.path === name));
  assert.ok(distributionPath('/cache', 'darwin').endsWith(path.join('apache-maven-3.9.11', 'a2d47e15')));
  assert.ok(distributionPath('/cache', 'win32').endsWith(path.join('apache-maven-3.9.11', hash(Buffer.from(lock.url)))));
});
test('fresh installation checks ZIP before writing and all files before reuse; execution requires no first-run bootstrap', async t => {
  const root = await temporary(t), target = path.join(root, 'owned/distribution'), { bytes, manifest } = fixture();
  assert.equal((await _test.installArchive({ root: target, bytes, manifest })).files, 3);
  assert.equal((await _test.verifyTree(target, manifest)).files, 3);
  assert.deepEqual(await fs.readdir(path.dirname(target)), ['distribution']);
  const corrupt = Buffer.from(bytes); corrupt[20] ^= 1;
  await assert.rejects(_test.installArchive({ root: path.join(root, 'never-installed'), bytes: corrupt, manifest }), /checksum mismatch/);
  await assert.rejects(fs.access(path.join(root, 'never-installed')), { code: 'ENOENT' });
});
test('intact wrapper and repository cannot authorize edited cached executable, bootstrap or library', async t => {
  const root = await temporary(t), { bytes, manifest } = fixture();
  await fs.writeFile(path.join(root, 'mvnw'), 'unchanged wrapper'); await fs.mkdir(path.join(root, 'repository'));
  for (const name of ['bin/mvn', 'boot/plexus.jar', 'lib/maven-core.jar']) {
    const target = path.join(root, name.replaceAll('/', '-'));
    await _test.installArchive({ root: target, bytes, manifest });
    await fs.writeFile(path.join(target, name), 'a fake compiler could fabricate a site');
    await assert.rejects(_test.verifyTree(target, manifest), /modified or unsafe/);
  }
  assert.equal(await fs.readFile(path.join(root, 'mvnw'), 'utf8'), 'unchanged wrapper');
});
test('missing, partial, extra files/folders and symbolic links fail closed', async t => {
  const root = await temporary(t), { bytes, manifest } = fixture();
  await assert.rejects(_test.verifyTree(path.join(root, 'missing'), manifest), { code: 'ENOENT' });
  for (const [name, change] of [
    ['partial', target => fs.unlink(path.join(target, 'lib/maven-core.jar'))],
    ['extra', target => fs.writeFile(path.join(target, 'bin/unsafe-hook'), 'extra')],
    ['folder', target => fs.mkdir(path.join(target, 'extra'))],
    ['marker', target => fs.writeFile(path.join(target, 'mvnw.url'), 'https://unreviewed.invalid/')],
    ['symlink', async target => { await fs.unlink(path.join(target, 'bin/mvn')); await fs.symlink(path.join(root, 'outside'), path.join(target, 'bin/mvn')); }]
  ]) {
    const target = path.join(root, name); await _test.installArchive({ root: target, bytes, manifest }); await change(target); await assert.rejects(_test.verifyTree(target, manifest), /incomplete, modified or unsafe/);
  }
  const cacheRoot = path.join(root, 'cache'), selected = distributionPath(cacheRoot);
  await fs.mkdir(selected, { recursive: true });
  let downloads = 0;
  await assert.rejects(prepareMavenDistribution({ cacheRoot, getArtifact: async () => { downloads++; return bytes; } }), /missing files/);
  assert.equal(downloads, 0);
  await assert.rejects(verifyMavenDistribution({ cacheRoot }), /missing files/);
});
test('safe archive extraction rejects traversal, duplicate entries and symlink metadata even with a matching archive digest', () => {
  for (const extras of [[{ path: '../outside', bytes: Buffer.from('unsafe') }], [{ path: 'bin/mvn', bytes: Buffer.from('trusted reviewed executable') }]]) {
    const { bytes, manifest } = fixture(extras); assert.throws(() => _test.readArchive(bytes, manifest), /unsafe ZIP path|duplicate ZIP entry/);
  }
  const { bytes, manifest } = fixture(); let central = bytes.readUInt32LE(bytes.length - 6); bytes.writeUInt32LE((0o120755 << 16) >>> 0, central + 38); manifest.archiveSha256 = hash(bytes);
  assert.throws(() => _test.readArchive(bytes, manifest), /unsupported ZIP entry metadata/);
});
test('fresh owned-cache preparation rejects unapproved archive bytes without executing its contents', async t => {
  const root = await temporary(t); let downloads = 0;
  await assert.rejects(prepareMavenDistribution({ cacheRoot: root, getArtifact: async url => { assert.equal(url, lock.url); downloads++; return Buffer.from('untrusted distribution'); } }), /checksum mismatch/);
  assert.equal(downloads, 1);
  await assert.rejects(fs.access(distributionPath(root)), { code: 'ENOENT' });
});
