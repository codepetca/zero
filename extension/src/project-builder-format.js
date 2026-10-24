'use strict';
// Data-only format rules. Importing this module never loads project code or starts tools.
const crypto = require('node:crypto');
const SCHEMA = 1;
const PROTOCOL = 1;
const LIMITS = Object.freeze({ files: 256, fileBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, manifestBytes: 128 * 1024, requestBytes: 64 * 1024 });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error('Project browser tooling unavailable: ' + message); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('invalid ' + label + '.');
}
function relativePath(name) {
  return typeof name === 'string' && name.length <= 240 && name.split('/').every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}
function validateInventory(files) {
  if (!Array.isArray(files) || !files.length || files.length > LIMITS.files) fail('invalid file inventory size.');
  let previous = '', total = 0;
  const folded = new Set(), names = new Set(), prefixes = new Map();
  for (const file of files) {
    object(file, ['path', 'sha256', 'bytes'], 'file inventory entry');
    if (!relativePath(file.path) || file.path === 'builder.json' || file.path <= previous || !hash(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > LIMITS.fileBytes) fail('invalid or unsorted file inventory entry.');
    const lower = file.path.toLowerCase();
    if (folded.has(lower)) fail('case-colliding file paths.');
    const parts = file.path.split('/');
    for (let length = 1; length <= parts.length; length++) {
      const prefix = parts.slice(0, length).join('/'), key = prefix.toLowerCase();
      if (prefixes.has(key) && prefixes.get(key) !== prefix) fail('case-colliding file or directory paths.');
      prefixes.set(key, prefix);
    }
    folded.add(lower); names.add(lower); previous = file.path; total += file.bytes;
  }
  for (const name of names) {
    const parts = name.split('/');
    while (parts.length > 1) { parts.pop(); if (names.has(parts.join('/'))) fail('file and directory paths overlap.'); }
  }
  if (total > LIMITS.totalBytes) fail('saved files exceed the size limit.');
  return files;
}
function closureHash(files) { validateInventory(files); return sha256(Buffer.from(JSON.stringify(files))); }
function createBuilderManifest(files) {
  const inventory = files.map(file => ({path: file.path, sha256: sha256(file.bytes), bytes: file.bytes.length})).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifest = {schema: SCHEMA, protocol: PROTOCOL, entrypoint: 'run.cjs', files: inventory, closureSha256: closureHash(inventory)};
  return validateBuilderManifest(manifest);
}
function validateBuilderManifest(manifest) {
  object(manifest, ['schema', 'protocol', 'entrypoint', 'files', 'closureSha256'], 'builder manifest');
  if (manifest.schema !== SCHEMA || manifest.protocol !== PROTOCOL || manifest.entrypoint !== 'run.cjs') fail('unsupported builder schema, protocol or entrypoint; use the retained standalone instructions.');
  validateInventory(manifest.files);
  for (const name of ['run.cjs', 'runtime-lock.json', '.gitattributes', 'README.md', 'src/project-builder-format.js', 'src/web-export/index.js', 'src/web-export/snapshot.js', 'media/sharing-config.json']) if (!manifest.files.some(file => file.path === name)) fail('required saved file is absent: ' + name);
  if (!hash(manifest.closureSha256) || manifest.closureSha256 !== closureHash(manifest.files)) fail('closure hash differs from the inventory.');
  return manifest;
}
function validateBuilderFiles(manifest, files) {
  validateBuilderManifest(manifest);
  const actual = createBuilderManifest(files);
  if (JSON.stringify(actual.files) !== JSON.stringify(manifest.files)) fail('saved files are missing, changed or undeclared.');
  return manifest;
}
function validateRuntimeLock(lock) {
  object(lock, ['schema', 'requirements', 'pins', 'provenance'], 'runtime lock');
  object(lock.requirements, ['nodeMajor', 'javaMajor', 'sourceRelease'], 'runtime requirements');
  if (lock.schema !== 1 || lock.requirements.nodeMajor !== 22 || lock.requirements.javaMajor !== 21 || lock.requirements.sourceRelease !== 17) fail('unsupported runtime requirements.');
  if (!Array.isArray(lock.pins) || !lock.pins.length || lock.pins.length > 12) fail('invalid runtime pins.');
  const identities = new Set();
  for (const pin of lock.pins) {
    object(pin, ['tool', 'platform', 'version', 'url', 'sha256'], 'runtime pin');
    if (!['node', 'jdk'].includes(pin.tool) || !/^(darwin|win32|linux)-(arm64|x64)$/.test(pin.platform) || !hash(pin.sha256) || typeof pin.version !== 'string' || pin.version.length > 60) fail('invalid runtime pin.');
    let url; try {url = new URL(pin.url);} catch {fail('invalid runtime URL.');}
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['nodejs.org', 'github.com'].includes(url.hostname) || pin.tool === 'jdk' && !url.pathname.startsWith('/adoptium/temurin21-binaries/releases/download/') || pin.tool === 'node' && !url.pathname.startsWith('/dist/v22.')) fail('unreviewed runtime metadata origin.');
    const id = pin.tool + '/' + pin.platform;
    if (identities.has(id)) fail('duplicate runtime pin.');
    identities.add(id);
  }
  object(lock.provenance, ['node', 'jdk', 'checkedUtc', 'limits'], 'runtime provenance');
  if (Object.values(lock.provenance).some(value => typeof value !== 'string' || !value || value.length > 2048)) fail('invalid runtime provenance.');
  return lock;
}
module.exports = {SCHEMA, PROTOCOL, LIMITS, sha256, relativePath, closureHash, createBuilderManifest, validateBuilderManifest, validateBuilderFiles, validateRuntimeLock};
