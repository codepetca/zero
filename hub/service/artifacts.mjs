import {createHash, randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {constants} from 'node:fs';
import {mkdir, realpath, lstat, open, link, unlink} from 'node:fs/promises';
import path from 'node:path';

export const POLICY = 'zero-widgets-v1';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const limit = 16 * 1024 * 1024;

// Read bounded ordinary ZIPs; no extraction, execution, submitted tools or paths.
export function zipEntries(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > limit) throw new Error('Invalid artifact size');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error('Missing ZIP directory');
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10) || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw new Error('Unsupported ZIP layout');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (count > 512 || offset + directorySize !== end) throw new Error('Invalid ZIP directory bounds');
  const entries = new Map();
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const packed = bytes.readUInt32LE(offset + 20);
    const size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength + extraLength + commentLength > end) throw new Error('Invalid ZIP name bounds');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (!name || name.includes('..') || name.includes('\\') || name.startsWith('/') || /[\x00-\x1f\x7f]/.test(name) || entries.has(name) || flags & 1 || ![0,8].includes(method)) throw new Error('Unsafe ZIP entry');
    total += size;
    if (size > limit || total > limit || local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method) throw new Error('Invalid ZIP content bounds');
    const localNameLength = bytes.readUInt16LE(local + 26);
    const localExtraLength = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localNameLength + localExtraLength;
    if (start + packed > bytes.readUInt32LE(end + 16) || bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name) throw new Error('ZIP entry mismatch');
    const content = method === 0 ? Buffer.from(bytes.subarray(start,start+packed)) : inflateRawSync(bytes.subarray(start,start+packed),{maxOutputLength:limit});
    if (content.length !== size) throw new Error('ZIP content size mismatch');
    entries.set(name,content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) throw new Error('ZIP directory size mismatch');
  return entries;
}

export function validateArtifacts(bundle, artifacts, expectedPom) {
  if (!artifacts || Object.keys(artifacts).sort().join(',') !== 'jar,pom,sources') throw new Error('Missing exact artifact set');
  for (const bytes of Object.values(artifacts)) if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limit) throw new Error('Invalid artifact bytes');
  if (!artifacts.pom.equals(Buffer.from(expectedPom(bundle)))) throw new Error('Artifact POM differs from trusted policy');
  const sources = zipEntries(artifacts.sources);
  const expectedSources = new Map(Object.entries(bundle.files).filter(([name]) => name.startsWith('src/')).map(([name,text]) => [name.slice(4),Buffer.from(text)]));
  expectedSources.set('META-INF/LICENSE',Buffer.from(bundle.files.LICENSE));
  for (const [name,bytes] of sources) {
    if (name.endsWith('/') && bytes.length === 0 || name === 'META-INF/MANIFEST.MF') continue;
    if (!expectedSources.has(name) || !bytes.equals(expectedSources.get(name))) throw new Error('Source artifact differs from submission');
  }
  for (const [name,bytes] of expectedSources) if (!sources.get(name)?.equals(bytes)) throw new Error('Source artifact omits declared source/license');
  const jar = zipEntries(artifacts.jar);
  const prefix = `zero/${bundle.descriptor.libraryId}/`;
  const classes = bundle.descriptor.components.map(component => component.className);
  for (const [name,bytes] of jar) {
    if (name.endsWith('/') && bytes.length === 0 || name === 'META-INF/MANIFEST.MF') continue;
    if (name === 'META-INF/LICENSE' && bytes.equals(Buffer.from(bundle.files.LICENSE))) continue;
    if (!name.startsWith(prefix) || !name.endsWith('.class')) throw new Error('Artifact includes undeclared content');
    const simple = name.slice(prefix.length,-6);
    if (!classes.some(className => simple === className || simple.startsWith(className + '$')) || bytes.length < 8 || bytes.readUInt32BE(0) !== 0xcafebabe || bytes.readUInt16BE(6) !== 61) throw new Error('Artifact includes undeclared or unsupported class');
  }
  if (!jar.get('META-INF/LICENSE')?.equals(Buffer.from(bundle.files.LICENSE))) throw new Error('Binary artifact license mismatch');
  for (const className of classes) if (!jar.has(`${prefix}${className}.class`)) throw new Error('Binary artifact omits declared class');
  return Object.fromEntries(Object.entries(artifacts).map(([kind,bytes]) => [kind,{sha256:sha256(bytes),size:bytes.length}]));
}

export async function createStorage(storageRoot) {
  if (!path.isAbsolute(storageRoot)) throw new Error('Storage root must be absolute');
  await mkdir(storageRoot,{recursive:true,mode:0o700});
  const stat = await lstat(storageRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Storage root must be a plain directory');
  const root = await realpath(storageRoot);
  async function read(digest,size) {
    if (!/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(size) || size < 1 || size > limit) throw new Error('Invalid stored artifact');
    const handle = await open(path.join(root,digest),constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== size) throw new Error('Stored artifact size drift');
      const bytes = await handle.readFile();
      if (sha256(bytes) !== digest) throw new Error('Stored artifact digest drift');
      return bytes;
    } finally { await handle.close(); }
  }
  async function put(bytes) {
    const digest = sha256(bytes);
    const target = path.join(root,digest);
    // Write/sync first, then atomically link exclusively. A process crash cannot
    // leave a partial immutable destination that prevents a publication retry.
    const temporary = path.join(root,`.pending-${randomUUID()}`);
    const handle = await open(temporary,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o400);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      try { await link(temporary,target); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      await read(digest,bytes.length);
      return {sha256:digest,size:bytes.length};
    } finally { await handle.close().catch(()=>{}); await unlink(temporary).catch(()=>{}); }
  }
  return {put,read};
}
