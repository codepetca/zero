import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const POLICY = 'zero-widgets-v1';
const MAX_REQUEST = 1024 * 1024;
const controls = /[\p{Cc}\p{Cf}]/u;
const javaName = /^[A-Z][A-Za-z0-9]{0,63}$/;
const ids = /^ui[1-9a-z][0-9a-z]{0,11}$/;
const semver = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
const required = ['checks/BehaviorCheck.java', 'examples/first/Main.java', 'examples/second/Main.java', 'API.md', 'CHANGELOG.md', 'LICENSE', 'preview.png'];
function object(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${name} must be an object`);
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string' || !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) throw new Error(`${name} has missing or unknown fields`);
  for (const k of keys) if (Object.getOwnPropertyDescriptor(value, k)?.get || Object.getOwnPropertyDescriptor(value, k)?.set) throw new Error(`${name} cannot have getters`);
}
function text(value, name, limit, multiline = false) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > limit || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\p{Cf}]/u : controls).test(value) || /[\uD800-\uDFFF]/u.test(value)) throw new Error(`${name} must be bounded plain UTF-8 text`);
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validatePng(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('preview.png must be canonical base64 PNG');
  const data = Buffer.from(value, 'base64');
  if (data.toString('base64') !== value || data.length > 256 * 1024 || !data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('preview.png is not a bounded PNG');
  let offset = 8, width, height, color, depth, ended = false, idatEnded = false; const payload = [];
  const ancillary = new Set();
  const colors = {0:1,2:3,4:2,6:4};
  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error('Truncated PNG');
    const length = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > data.length || crc32(data.subarray(offset + 4, offset + 8 + length)) !== data.readUInt32BE(offset + 8 + length)) throw new Error('Invalid PNG chunk');
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (offset === 8 && type !== 'IHDR') throw new Error('PNG needs first IHDR');
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) throw new Error('Invalid PNG header');
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); depth = chunk[8]; color = chunk[9];
      if (!width || !height || width > 2048 || height > 2048 || width * height > 1048576 || depth !== 8 || !colors[color] || chunk[10] || chunk[11] || chunk[12]) throw new Error('PNG policy allows non-interlaced 8-bit grayscale/RGB/gray-alpha/RGBA up to 1 megapixel');
    } else if (type === 'IDAT') {
      if (idatEnded) throw new Error('PNG IDAT chunks must be contiguous');
      payload.push(chunk);
    }
    else if (type === 'IEND') { if (length || offset + 12 !== data.length) throw new Error('Invalid PNG end'); ended = true; }
    else {
      if (!['tEXt','pHYs','sRGB','gAMA','cHRM','bKGD'].includes(type)) throw new Error('Unsupported PNG chunk');
      if (payload.length) idatEnded = true;
      if (type !== 'tEXt') {
        if (ancillary.has(type)) throw new Error('Duplicate PNG ancillary chunk');
        ancillary.add(type);
        const lengths = {pHYs:9,sRGB:1,gAMA:4,cHRM:32,bKGD:color===0||color===4?2:6};
        if (length !== lengths[type]) throw new Error('Invalid PNG ancillary chunk');
      }
    }
    offset += length + 12;
  }
  if (!ended || !payload.length) throw new Error('Incomplete PNG');
  const stride = width * colors[color] + 1;
  const pixels = inflateSync(Buffer.concat(payload), {maxOutputLength: stride * height});
  if (pixels.length !== stride * height) throw new Error('Invalid PNG pixel length');
  for (let i = 0; i < height; i++) if (pixels[i * stride] > 4) throw new Error('Invalid PNG filter');
  return data;
}
export function validateBundle(bundle) {
  object(bundle, ['descriptor', 'files'], 'bundle');
  const d = bundle.descriptor;
  object(d, ['schema','libraryId','version','title','description','category','components'], 'descriptor');
  if (d.schema !== 1 || typeof d.libraryId !== 'string' || typeof d.version !== 'string' || !ids.test(d.libraryId) || !semver.test(d.version)) throw new Error('Invalid schema/library ID/exact version');
  text(d.title, 'title', 120); text(d.description, 'description', 2000);
  if (!['ui','game','tools'].includes(d.category)) throw new Error('Invalid category');
  if (!Array.isArray(d.components) || !d.components.length || d.components.length > 32) throw new Error('Need 1–32 components');
  const names = new Set();
  for (const c of d.components) {
    object(c,['className','description','api','usage'],'component');
    if (typeof c.className !== 'string' || !javaName.test(c.className) || names.has(c.className) || ['Main','BehaviorCheck'].includes(c.className)) throw new Error('Invalid/duplicate className');
    names.add(c.className); text(c.description,'component description',1000); text(c.usage,'usage',4000,true);
    if (!Array.isArray(c.api) || !c.api.length || c.api.length > 32) throw new Error('Need public API descriptions');
    c.api.forEach(a => text(a,'API entry',500));
  }
  const paths = [...required, ...[...names].map(n => `src/zero/${d.libraryId}/${n}.java`)];
  object(bundle.files, paths, 'files');
  if (paths.length > 64) throw new Error('Too many files');
  for (const [path, content] of Object.entries(bundle.files)) {
    if (path === 'preview.png') validatePng(content);
    else {
      text(content,path,65536,true);
      if (path.endsWith('.java')) {
        if (/\\u+0*[0-9a-fA-F]{4}/.test(content)) throw new Error('Java Unicode escapes are excluded from this source-boundary policy');
        const visible = content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
        const packages = [...visible.matchAll(/\bpackage\s+([a-zA-Z0-9_.\s]+)\s*;/g)];
        if (path.startsWith('src/') ? packages.length !== 1 || packages[0][1].replace(/\s/g,'') !== `zero.${d.libraryId}` : packages.length !== 0) throw new Error('Foreign or missing Java namespace');
      }
    }
  }
  if (!/^MIT License\n\nCopyright \(c\) [^\n]+\n\n/.test(bundle.files.LICENSE) || !bundle.files.LICENSE.endsWith(MIT_BODY)) throw new Error('LICENSE must contain the complete MIT text and a copyright line');
  if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_REQUEST) throw new Error('Bundle exceeds 1 MiB');
  return bundle;
}
export const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
  return value;
}
export function sourceDigest(bundle) { validateBundle(bundle); return createHash('sha256').update(JSON.stringify(canonical(bundle))).digest('hex'); }
export function expectedPom(bundle) {
  validateBundle(bundle);
  const {libraryId,version} = bundle.descriptor;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>ca.codepet.zero.library</groupId>
  <artifactId>${libraryId}</artifactId>
  <version>${version}</version>
  <properties><maven.compiler.release>17</maven.compiler.release><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties>
  <licenses><license><name>MIT License</name><url>https://opensource.org/licenses/MIT</url><distribution>repo</distribution></license></licenses>
  <dependencies>
    <dependency><groupId>org.openjfx</groupId><artifactId>javafx-controls</artifactId><version>21.0.12</version></dependency>
    <dependency><groupId>org.openjfx</groupId><artifactId>javafx-swing</artifactId><version>21.0.12</version></dependency>
  </dependencies>
</project>
`);
}
