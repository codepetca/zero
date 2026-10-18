import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {deflateSync, inflateSync} from 'node:zlib';
import path from 'node:path';
import {readBrand, brandSample} from './brand-icon.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type), output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length); name.copy(output, 4); bytes.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, bytes])), bytes.length + 8);
  return output;
}
export function iconPng(size, color, brand = readBrand(path.resolve(import.meta.dirname, '..')), inset = .1) {
  assert.ok(Number.isInteger(size) && size >= 16 && size <= 1024);
  assert.match(color, /^#[0-9a-f]{6}$/i);
  const purple = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const rows = Buffer.alloc(size * (size * 4 + 1));
  // Match the canonical circle and softly rounded slash on its white tile.
  // macOS keeps its established safe-area inset; Windows uses the full tile.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let mark = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = ((x + (sx + .5) / 4) / size - inset) * 24 / (1 - 2 * inset);
      const py = ((y + (sy + .5) / 4) / size - inset) * 24 / (1 - 2 * inset);
      if (brandSample(px, py, brand)) mark++;
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let channel = 0; channel < 3; channel++) rows[offset + channel] = Math.round(255 + (purple[channel] - 255) * mark / 16);
    rows[offset + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export function buildMacIcon(run, root, work, destination) {
  const brand = readBrand(root);
  const color = brand.color;
  const folder = path.join(work, 'Zero.iconset'); mkdirSync(folder);
  for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
    writeFileSync(path.join(folder, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), iconPng(size * scale, color, brand));
  }
  run('/usr/bin/iconutil', ['--convert', 'icns', '--output', destination, folder]);
  verifyMacIcon(readFileSync(destination));
}
export function verifyMacIcon(bytes) {
  assert.ok(bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'icns', 'App icon must be a real ICNS');
  assert.equal(bytes.readUInt32BE(4), bytes.length, 'ICNS length');
  const types = new Set(); let offset = 8;
  while (offset < bytes.length) {
    assert.ok(offset + 8 <= bytes.length, 'ICNS chunk header');
    const size = bytes.readUInt32BE(offset + 4);
    assert.ok(size >= 8 && offset + size <= bytes.length, 'ICNS chunk bounds');
    const type = bytes.toString('ascii', offset, offset + 4);
    types.add(type);
    if (type === 'ic10') {
      const png = bytes.subarray(offset + 8, offset + size);
      assert.ok(png.length >= 33 && png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), '1024px icon must contain PNG pixels');
      assert.equal(png.toString('ascii', 12, 16), 'IHDR', 'Icon PNG header');
      assert.equal(png.readUInt32BE(16), 1024, 'Icon width');
      assert.equal(png.readUInt32BE(20), 1024, 'Icon height');
      assert.deepEqual([...png.subarray(24, 29)], [8, 6, 0, 0, 0], 'Icon must be an ordinary RGBA PNG');
      const compressed = []; let cursor = 8, ended = false;
      while (cursor < png.length) {
        assert.ok(cursor + 12 <= png.length, 'Icon PNG chunk header');
        const count = png.readUInt32BE(cursor), end = cursor + count + 12;
        assert.ok(end <= png.length, 'Icon PNG chunk bounds');
        const kind = png.toString('ascii', cursor + 4, cursor + 8);
        assert.equal(png.readUInt32BE(end - 4), crc32(png.subarray(cursor + 4, end - 4)), 'Icon PNG checksum');
        if (kind === 'IDAT') compressed.push(png.subarray(cursor + 8, end - 4));
        if (kind === 'IEND') { assert.equal(count, 0); assert.equal(end, png.length); ended = true; }
        cursor = end;
      }
      assert.ok(ended && compressed.length, 'Icon must contain complete PNG pixels');
      const rowBytes = 1024 * 4 + 1, expectedSize = 1024 * rowBytes;
      const pixels = inflateSync(Buffer.concat(compressed), {maxOutputLength:expectedSize});
      assert.equal(pixels.length, expectedSize, 'Icon pixel data length');
      for (let row = 0; row < 1024; row++) assert.ok(pixels[row * rowBytes] <= 4, 'Icon PNG row filter');
    }
    offset += size;
  }
  assert.ok(types.has('ic10'), 'ICNS must include its 1024px representation');
}
