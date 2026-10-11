import {unzipSync} from 'fflate';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

// Maintainer-side extraction of the measured kit. Check metadata before inflating
// so unsafe members and excessive sizes fail before writing any student files.
export function kitEntries(input) {
  const bytes = Buffer.from(input);
  if (bytes.length > 32 * 1024 * 1024) throw new Error('Kit archive too large');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {end = i; break;}
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('Invalid kit ZIP');
  const count = bytes.readUInt16LE(end + 10), offset = bytes.readUInt32LE(end + 16), length = bytes.readUInt32LE(end + 12);
  if (!count || count > 4096 || bytes.readUInt16LE(end + 8) !== count || offset + length !== end) throw new Error('Invalid kit directory');
  let cursor = offset, total = 0;
  const metadata = [], seen = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid kit member');
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extra + comment;
    if (next > end || bytes.readUInt16LE(cursor + 8) & 1) throw new Error('Invalid or encrypted kit member');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const relative = name.slice('zero-kit/'.length), components = relative.split('/');
    if (!name.startsWith('zero-kit/') || !relative || components.some(part => !part || part === '.' || part === '..' || /[\\:\x00-\x1f]/.test(part))) throw new Error(`Unsafe kit path: ${name}`);
    if (seen.has(name.toLowerCase())) throw new Error(`Duplicate kit path: ${name}`);
    seen.add(name.toLowerCase());
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16, type = mode & 0o170000;
    if (type && type !== 0o100000) throw new Error(`Kit member must be a regular file: ${name}`);
    const size = bytes.readUInt32LE(cursor + 24);
    total += size;
    if (size > 16 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('Expanded kit too large');
    metadata.push({name, relative, size, mode:mode & 0o777}); cursor = next;
  }
  if (cursor !== end) throw new Error('Unexpected kit directory bytes');
  const data = unzipSync(bytes);
  return metadata.map(entry => {
    if (data[entry.name]?.length !== entry.size) throw new Error(`Kit size mismatch: ${entry.name}`);
    return {...entry, bytes:data[entry.name]};
  });
}

export function extractKit(input, destination) {
  const entries = kitEntries(input);
  for (const entry of entries) {
    const filename = path.join(destination, entry.relative);
    mkdirSync(path.dirname(filename), {recursive:true});
    writeFileSync(filename, entry.bytes, {flag:'wx', mode:entry.mode || 0o644});
  }
  return entries;
}
