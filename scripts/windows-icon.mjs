import {writeFileSync} from 'node:fs';
import {readBrand} from './brand-icon.mjs';
import {iconPng} from './mac-icon.mjs';

// ICO permits PNG payloads on supported Windows versions. Include real small
// sizes rather than relying on scaling the 256px taskbar/Explorer representation.
export function windowsIcon(root) {
  const brand = readBrand(root), sizes = [16,24,32,48,64,128,256];
  const images = sizes.map(size => iconPng(size, brand.color, brand, 0));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((bytes, index) => {
    const entry = 6 + index * 16, size = sizes[index];
    header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  return Buffer.concat([header,...images]);
}
export function buildWindowsIcon(root, destination) { writeFileSync(destination, windowsIcon(root), {flag:'wx'}); }
