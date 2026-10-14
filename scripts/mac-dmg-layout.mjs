import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, lstatSync, readdirSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {macArtifactIdentity} from './mac-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const macDmgLayout = Object.freeze(JSON.parse(readFileSync(new URL('./mac-dmg-layout.json', import.meta.url), 'utf8')));
const requirements = 'scripts/mac-dmg-layout-requirements.txt';
export function macLayoutPython() {
  const python = path.join(root, '.verification/native-installer/dmg-layout-venv/bin/python');
  try { assert.ok(lstatSync(python).isFile() || lstatSync(python).isSymbolicLink()); }
  catch { throw new Error(`Prepare the maintainer DMG helper: python3 -m venv .verification/native-installer/dmg-layout-venv && .verification/native-installer/dmg-layout-venv/bin/python -m pip install --require-hashes --only-binary=:all: -r ${requirements}`); }
  return python;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name), output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length); type.copy(output, 4); bytes.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, output.length - 4)), output.length - 4); return output;
}
export function macArrowPng() {
  const {width, height, arrow} = macDmgLayout;
  assert.ok(width === 660 && height === 360, 'DMG canvas must retain reviewed bounds');
  const {start, end, head, stroke, gray} = arrow;
  const segments = [[...start, ...end], [end[0] - head, end[1] - head, ...end], [end[0] - head, end[1] + head, ...end]];
  const rows = Buffer.alloc(height * (width * 4 + 1));
  const distance = (x, y, [ax, ay, bx, by]) => { const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2))); return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let coverage = 0;
    // White canvas, one antialiased gray arrow; icons and labels belong to Finder.
    if (x >= start[0] - stroke && x <= end[0] + stroke && Math.abs(y - end[1]) <= head + stroke) {
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (segments.some(s => distance(x + (sx + .5) / 4, y + (sy + .5) / 4, s) <= stroke / 2)) coverage++;
    }
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    rows.fill(Math.round(255 + (gray - 255) * coverage / 16), offset, offset + 3); rows[offset + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  assert.equal(createHash('sha256').update(png).digest('hex'), macDmgLayout.backgroundSha256, 'Reviewed background hash drift');
  return png;
}
export function verifyMacStyledFiles(mount) {
  const folder = path.join(mount, '.background'), ds = path.join(mount, '.DS_Store'), png = path.join(folder, 'arrow.png');
  assert.ok(lstatSync(folder).isDirectory() && !lstatSync(folder).isSymbolicLink(), 'Background must be an owned directory');
  assert.deepEqual(readdirSync(folder), ['arrow.png'], 'Unexpected hidden background contents');
  for (const file of [ds, png]) { const stat = lstatSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 65536, 'Layout assets must be bounded owned regular files'); }
  assert.deepEqual(readFileSync(png), macArrowPng(), 'Background must contain the deterministic reviewed arrow');
}
function verifyVolumeName(volumeName) {
  assert.match(volumeName || '', /^Zero \d+\.\d+\.\d+$/, 'Styled image requires its exact versioned volume name');
  assert.equal(macArtifactIdentity(volumeName.slice(5)).volumeName, volumeName, 'Invalid styled volume generation');
}
export function verifyMacDmgLayout(mount, volumeName) {
  verifyVolumeName(volumeName);
  verifyMacStyledFiles(mount);
  const result = spawnSync(macLayoutPython(), [path.join(root, 'scripts/mac-dmg-layout.py'), 'verify', mount, '--volume-name', volumeName], {encoding:'utf8', timeout:30000, maxBuffer:65536});
  assert.equal(result.status, 0, result.error?.message || result.stderr || 'Finder layout verification failed');
}
export function buildStyledMacDmg(run, volume, work, destination, volumeName) {
  verifyVolumeName(volumeName);
  const python = macLayoutPython();
  run(python, ['-c', 'from importlib.metadata import version; assert version("ds_store") == "1.3.3" and version("mac_alias") == "2.2.3"']);
  const background = path.join(volume, '.background'); mkdirSync(background);
  writeFileSync(path.join(background, 'arrow.png'), macArrowPng());
  const writable = path.join(work, 'Zero-layout-writable.dmg'), mount = path.join(work, 'layout-mount'); mkdirSync(mount);
  run('/usr/bin/hdiutil', ['create', '-srcfolder', volume, '-volname', volumeName, '-fs', 'HFS+', '-format', 'UDRW', '-size', `${Math.ceil(folderSize(volume) / 1024 / 1024) + 64}m`, writable]);
  let attached = false;
  try {
    run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-noautoopen', '-owners', 'off', '-mountpoint', mount, writable]); attached = true;
    for (const name of ['.Trashes', '.fseventsd', '.Spotlight-V100']) rmSync(path.join(mount, name), {recursive:true, force:true});
    run(python, [path.join(root, 'scripts/mac-dmg-layout.py'), 'write', mount, '--volume-name', volumeName]);
    for (const name of ['.Trashes', '.fseventsd', '.Spotlight-V100']) rmSync(path.join(mount, name), {recursive:true, force:true});
    assert.deepEqual(readdirSync(mount).sort(), ['.DS_Store', '.background', 'Applications', 'Zero.app'].sort(), 'Unexpected writable image root');
    verifyMacDmgLayout(mount, volumeName);
  } finally { if (attached) run('/usr/bin/hdiutil', ['detach', mount]); }
  run('/usr/bin/hdiutil', ['convert', writable, '-format', 'UDZO', '-o', destination]);
}
function folderSize(folder) {
  return readdirSync(folder).reduce((total, name) => { const file = path.join(folder, name), stat = lstatSync(file); return total + (stat.isDirectory() ? folderSize(file) : stat.size) + 4096; }, 0);
}
