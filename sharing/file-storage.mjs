import { constants } from 'node:fs';
import { mkdir, lstat, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export function safeObjectPath(value) {
  if (typeof value !== 'string' || value.length > 1024 || value.includes('\\') || value.startsWith('/') || value.split('/').some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) || part === '.' || part === '..' || part.length > 255)) throw new Error('Unsafe artifact path');
  return value;
}
export const byteHash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');

/** Local immutable object fixture. No network/provider authority is implied. */
export class FileStorage {
  constructor({root, maxBytes = 104857600}) { this.root = path.resolve(root); this.maxBytes = maxBytes; }
  async locate(key, create = false) {
    safeObjectPath(key);
    if (create) await mkdir(this.root, {recursive: true});
    const root = await lstat(this.root);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Artifact root must be a real directory');
    const parts = key.split('/');
    let parent = this.root;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      if (create) await mkdir(parent).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const info = await lstat(parent);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Artifact path contains a symlink or non-directory');
    }
    return path.join(parent, parts.at(-1));
  }
  async get(key) {
    const location = await this.locate(key);
    const handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size <= 0 || info.size > this.maxBytes) throw new Error('Artifact size/type exceeds policy');
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async putImmutable(key, input) {
    const bytes = Buffer.from(input);
    if (!bytes.length || bytes.length > this.maxBytes) throw new Error('Artifact size exceeds policy');
    const location = await this.locate(key, true);
    const temporary = path.join(path.dirname(location), '.blob-' + randomUUID());
    const handle = await open(temporary, 'wx', 0o644);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try {
      await link(temporary, location).catch(error => { if (error.code !== 'EEXIST') throw error; });
      // Read after either creation or an identical retry, rejecting symlinks and
      // comparing actual bytes instead of trusting uploader metadata.
      const stored = await this.get(key);
      if (stored.length !== bytes.length || byteHash(stored) !== byteHash(bytes)) throw new Error('Immutable artifact conflict: ' + key);
      const directory = await open(path.dirname(location), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      return {path: key, size: bytes.length, sha256: byteHash(bytes)};
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async verify(key, expected) {
    const bytes = await this.get(key);
    if (bytes.length !== expected.size || byteHash(bytes) !== expected.sha256) throw new Error('Stored artifact integrity failure: ' + key);
    return bytes;
  }
  async removeVerified(key, expected) {
    try { await this.verify(key, expected); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    await unlink(await this.locate(key));
  }
}
