'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { crc32 } = require('../zip');
const lock = require('./maven-distribution.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function abort(signal) { if (signal?.aborted) { const error = new Error('Maven preparation cancelled.'); error.name = 'AbortError'; throw error; } }
const invalid = detail => new Error('The cached Maven distribution is incomplete, modified or unsafe: ' + detail + '. Restore Zero’s owned compiler cache before running again.');
async function noSymlinks(file) {
  const absolute = path.resolve(file); let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw invalid('symbolic link ' + current); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function distributionPath(cacheRoot, platform = process.platform) {
  let hash = 0;
  for (const char of lock.url) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const name = platform === 'win32' ? sha(Buffer.from(lock.url, 'ascii')) : hash.toString(16);
  return path.join(cacheRoot, 'maven-home/wrapper/dists', lock.archiveRoot, name);
}
function safeRelative(name) { return name && !name.includes('\\') && !name.includes('\0') && !name.includes(':') && !name.startsWith('/') && name.split('/').every(part => part && part !== '.' && part !== '..'); }
function directoriesFor(files) {
  const result = new Set();
  for (const file of files) { let parent = path.posix.dirname(file.path); while (parent !== '.') { result.add(parent); parent = path.posix.dirname(parent); } }
  return result;
}
// This parser is used only after the complete official ZIP matches its pinned SHA-256.
// It still rejects unsafe paths, links, encryption, ZIP64 and inconsistent entry metadata.
function readArchive(bytes, manifest = lock) {
  if (bytes.length !== manifest.archiveBytes || sha(bytes) !== manifest.archiveSha256) throw new Error('Pinned Maven distribution ZIP checksum mismatch.');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end < bytes.length - 65557 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw invalid('unsupported ZIP directory');
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralStart = bytes.readUInt32LE(end + 16);
  if (count !== bytes.readUInt16LE(end + 8) || count === 0xffff || centralStart + centralSize !== end) throw invalid('unsupported ZIP directory bounds');
  const expected = new Map(manifest.files.map(file => [file.path, file]));
  const allowedDirectories = directoriesFor(manifest.files), seen = new Set(), files = [];
  let offset = centralStart, total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw invalid('malformed ZIP entry');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16), compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
    const nameSize = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42);
    const mode = bytes.readUInt32LE(offset + 38) >>> 16, type = mode & 0xf000;
    if (offset + 46 + nameSize + extra + comment > end || flags & 1 || ![0, 8].includes(method) || ![0, 0x8000, 0x4000].includes(type) || bytes.readUInt16LE(offset + 34)) throw invalid('unsupported ZIP entry metadata');
    const fullName = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    offset += 46 + nameSize + extra + comment;
    if (seen.has(fullName)) throw invalid('duplicate ZIP entry'); seen.add(fullName);
    const directory = fullName.endsWith('/'), name = fullName.slice(0, directory ? -1 : undefined);
    if (!safeRelative(name) || (name !== manifest.archiveRoot && !name.startsWith(manifest.archiveRoot + '/'))) throw invalid('unsafe ZIP path');
    const relative = name.slice(manifest.archiveRoot.length + 1);
    if (directory) { if (relative && !allowedDirectories.has(relative)) throw invalid('unexpected ZIP folder ' + relative); continue; }
    const file = expected.get(relative);
    if (!file || file.bytes !== size || (mode & 0o777) !== file.mode || size > 32 * 1024 * 1024 || compressed > 32 * 1024 * 1024) throw invalid('unexpected ZIP file ' + relative);
    if (local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) throw invalid('inconsistent ZIP local entry');
    const localNameSize = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), start = local + 30 + localNameSize + localExtra;
    if (start + compressed > centralStart || bytes.subarray(local + 30, local + 30 + localNameSize).toString('utf8') !== fullName) throw invalid('inconsistent ZIP entry bounds');
    const input = bytes.subarray(start, start + compressed), data = method === 0 ? input : zlib.inflateRawSync(input, { maxOutputLength: file.bytes });
    total += data.length;
    if (total > 64 * 1024 * 1024 || data.length !== file.bytes || crc32(data) !== crc || sha(data) !== file.sha256) throw invalid('ZIP file checksum ' + relative);
    files.push({ ...file, data });
  }
  if (offset !== end || files.length !== expected.size) throw invalid('missing ZIP files');
  return files;
}
async function verifyTree(root, manifest = lock, signal) {
  abort(signal); await noSymlinks(root);
  const expected = new Map(manifest.files.map(file => [file.path, file])), directories = directoriesFor(manifest.files), seen = new Set();
  if (!(await fs.lstat(root)).isDirectory()) throw invalid('distribution path is not a directory');
  async function walk(folder, prefix = '') {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      abort(signal); const relative = prefix + item.name, file = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw invalid('symbolic link ' + relative);
      if (item.isDirectory()) { if (!directories.has(relative)) throw invalid('unexpected folder ' + relative); await walk(file, relative + '/'); }
      else if (item.isFile()) {
        const bytes = await fs.readFile(file), reviewed = expected.get(relative);
        // Unix wrapper writes this informational marker on its first installation.
        if (relative === 'mvnw.url' && bytes.equals(Buffer.from(manifest.url + '\n'))) continue;
        if (!reviewed || bytes.length !== reviewed.bytes || sha(bytes) !== reviewed.sha256) throw invalid(relative);
        seen.add(relative);
      } else throw invalid('special file ' + relative);
    }
  }
  await walk(root);
  if (seen.size !== expected.size) throw invalid('missing files');
  abort(signal);
  return { version: manifest.version, archiveSha256: manifest.archiveSha256, manifestHash: sha(Buffer.from(JSON.stringify(manifest))), files: seen.size };
}
async function verifyMavenDistribution({ cacheRoot, platform = process.platform, signal }) { return verifyTree(distributionPath(cacheRoot, platform), lock, signal); }
async function installArchive({ root, bytes, manifest = lock, signal }) {
  const files = readArchive(bytes, manifest); abort(signal); await noSymlinks(root);
  await fs.mkdir(path.dirname(root), { recursive: true });
  const stage = await fs.mkdtemp(path.join(path.dirname(root), '.zero-maven-install-'));
  try {
    for (const file of files) {
      abort(signal); const output = path.join(stage, file.path);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, file.data, { flag: 'wx', mode: file.mode });
    }
    await verifyTree(stage, manifest, signal);
    try { await fs.rename(stage, root); }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
    return await verifyTree(root, manifest, signal);
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
async function prepareMavenDistribution({ cacheRoot, platform = process.platform, signal, getArtifact, onProgress = () => {} }) {
  abort(signal); const root = distributionPath(cacheRoot, platform); await noSymlinks(root);
  const existing = await fs.lstat(root).catch(error => { if (error.code !== 'ENOENT') throw error; });
  // An existing partial distribution must fail closed; only a wholly absent directory is installed.
  if (existing) return verifyTree(root, lock, signal);
  onProgress('Preparing and verifying the pinned Maven distribution');
  if (typeof getArtifact !== 'function') throw new Error('A trusted HTTPS Maven distribution downloader is required.');
  const bytes = await getArtifact(lock.url, signal); abort(signal);
  return installArchive({ root, bytes, signal });
}
module.exports = { prepareMavenDistribution, verifyMavenDistribution, distributionPath, _test: { readArchive, verifyTree, installArchive } };
