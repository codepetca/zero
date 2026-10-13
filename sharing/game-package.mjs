import { zipSync } from 'fflate';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import contracts from '../extension/src/sharing/contracts.js';
import archive from '../extension/src/sharing/archive.js';
import { canonical, digest } from './registry.mjs';
import { byteHash } from './file-storage.mjs';

const {normalizeGameFiles,safeGamePath,includeGamePath} = archive;
export const {TRUSTED_WRAPPER_HASHES,inspectGamePackage,extractGamePackage} = archive;
export {safeGamePath,includeGamePath};

/** Input is exact committed blobs from a trusted retriever, never a command,
 * GitHub archive URL, POM hook, source executable or claimed student ZIP. */
export function buildGamePackage({files}) {
  const included = normalizeGameFiles(files);
  const entries = Object.create(null);
  // fflate writes DOS timestamps using local date fields. Construct local
  // midnight so identical inputs produce the same header in every timezone.
  for (const file of included) entries[file.path] = [new Uint8Array(file.data), {mtime: new Date(1980,0,1,0,0,0), os: 3, attrs: file.mode << 16, level: 9}];
  const bytes = Buffer.from(zipSync(entries));
  if (bytes.length > contracts.LIMITS.gameArchiveBytes) throw new Error('Game archive exceeds limits');
  const inventory = included.map(file => ({path: file.path, size: file.data.length, sha256: byteHash(file.data), mode: file.mode}));
  return {bytes, sha256: byteHash(bytes), size: bytes.length, sourceDigest: digest(canonical(inventory)), files: inventory};
}

/** Local fixture helper. Production source comes from SHA-pinned Git blobs. */
export async function collectGameFiles(root) {
  const absolute = path.resolve(root);
  if ((await lstat(absolute)).isSymbolicLink()) throw new Error('Game root cannot be a symlink');
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const name = prefix + entry.name;
      if (/^(\.git|\.zero-sharing-recovery|target|build|dist|node_modules)$/.test(entry.name)) continue;
      safeGamePath(name);
      if (entry.isSymbolicLink()) throw new Error('Symlink source forbidden: ' + name);
      if (entry.isDirectory()) await walk(path.join(directory,entry.name),name + '/');
      else if (entry.isFile() && includeGamePath(name)) {
        const info = await lstat(path.join(directory,entry.name));
        if (info.size > contracts.LIMITS.gameSourceBytes) throw new Error('Game file exceeds source limit');
        files.push({path:name,data:await readFile(path.join(directory,entry.name)),mode:info.mode});
        if (files.length > contracts.LIMITS.gameFiles) throw new Error('Too many game files');
      }
    }
  }
  await walk(absolute);
  return normalizeGameFiles(files);
}
