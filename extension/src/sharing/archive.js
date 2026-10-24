'use strict';

// Shared packaged editor/backend archive policy. This code never runs a game.
const { mkdir, writeFile, chmod, realpath, rm, lstat } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { inflateRawSync } = require('node:zlib');
const contracts = require('./contracts');
const {validateGameStructure,SAFE_GITIGNORE}=require('./game-structure');
const builderFormat = require('../project-builder-format');
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');

const required = ['zero.json','pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties'];
// Maintained Maven wrapper 3.3.4 / Maven 3.9.11. Updating the kit wrapper requires
// an explicit policy update, not accepting scripts supplied by a contributor.
const TRUSTED_WRAPPER_HASHES = Object.freeze({
  mvnw:'cae96cef89ebea3531221f4ae17c23cf8edf67d00eae8306d4186ae1bbed4d02',
  'mvnw.cmd':'46eedb8419bd14fe70d5bb2916d7b6f51806e51b39d5b76a42610384ca929c1c',
  '.mvn/wrapper/maven-wrapper.properties':'bb0b8f16b2661c3676ed5a6a15f5b11d864460c4e77cfb50c583f54708f944e7'
});
const fixed = new Set([...required,'zero-core.json','.gitignore','zero-game.json','zero-libraries.json','README.md','LICENSE','LICENSE.md','NOTICE','preview.png','.vscode/tasks.json','.vscode/extensions.json','.mvn/wrapper/LICENSE-APACHE-2.0.txt','.mvn/wrapper/NOTICE']);
const resourceExtensions = /\.(png|jpe?g|gif|webp|wav|mp3|ogg|txt|json|csv|properties|xml|fxml|css|ttf|otf|md)$/i;
function safeGamePath(value) {
  if (typeof value !== 'string' || value.length > 240 || value.includes('\\') || value.startsWith('/') || value.split('/').some(part => !/^[A-Za-z0-9_. -]{1,80}$/.test(part) || ['.','..'].includes(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /[. ]$/.test(part) || part.startsWith(' '))) throw new Error('Unsafe game archive path');
  return value;
}
function includeGamePath(value) {
  safeGamePath(value);
  if (value.split('/').some(part => /^(?:\.git|\.env(?:\..*)?|\.zero-sharing-recovery|target|build|dist|node_modules|\.idea|\.DS_Store)$/i.test(part))) return false;
  if (fixed.has(value)) return true;
  // Candidate saved-tooling paths are admitted only as a complete, data-validated
  // inventory below. Importing a shared game never executes these files.
  if (value.startsWith('.zero-build/')) return builderFormat.relativePath(value.slice('.zero-build/'.length));
  if (value.split('/').some(part => part.startsWith('.'))) return false;
  if (/^src\/(main|test)\/java\/.+\.java$/.test(value)) return true;
  if (/^(?:src\/main\/resources|assets)\//.test(value)) return resourceExtensions.test(value);
  const library = /^libraries\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/(.+)$/.exec(value);
  if (library) {
    contracts.validateSlug(library[1]);
    return /^(zero-library\.json|pom\.xml|README\.md|LICENSE(?:\.md)?|NOTICE|preview\.png)$/.test(library[2]) || /^src\/(main|test)\/java\/.+\.java$/.test(library[2]) || /^src\/main\/resources\//.test(library[2]) && resourceExtensions.test(library[2]) || /^examples\/(first|second)\/(?:.+\.java|pom\.xml|README\.md)$/.test(library[2]);
  }
  return false;
}
function normalizeGameFiles(files) {
  if (!Array.isArray(files) || files.length > contracts.LIMITS.gameFiles * 10) throw new Error('Source inventory exceeds limits');
  const seen = new Set(), folded = new Set(), included = [];
  let size = 0;
  for (const file of files) {
    safeGamePath(file.path);
    if (seen.has(file.path) || folded.has(file.path.toLowerCase())) throw new Error('Duplicate/case-colliding game path');
    seen.add(file.path); folded.add(file.path.toLowerCase());
    if (file.type && !['file','blob'].includes(file.type) || file.mode === '120000' || file.mode === 0o120000 || file.symlink) throw new Error('Symlink/non-file source is forbidden');
    if (!includeGamePath(file.path)) continue;
    const bytes = Buffer.from(file.data ?? file.bytes);
    if (TRUSTED_WRAPPER_HASHES[file.path] && byteHash(bytes) !== TRUSTED_WRAPPER_HASHES[file.path]) throw new Error('Game wrapper differs from the pinned trusted kit: ' + file.path);
    size += bytes.length;
    if (size > contracts.LIMITS.gameSourceBytes || included.length >= contracts.LIMITS.gameFiles) throw new Error('Game source exceeds limits');
    // Normalize regular-file modes. Only the known wrapper becomes executable;
    // setuid bits and submitted executable resources never survive extraction.
    const mode = file.path === 'mvnw' ? 0o100755 : 0o100644;
    if (file.path === '.vscode/tasks.json') {
      const tasks = JSON.parse(bytes.toString('utf8'));
      if (!Array.isArray(tasks.tasks) || tasks.tasks.some(task => task.runOptions?.runOn === 'folderOpen')) throw new Error('Editor tasks may not run automatically when opening a game');
    }
    included.push({path: file.path, data: bytes, mode});
  }
  for (const name of required) if (!seen.has(name) || !included.some(file => file.path === name)) throw new Error('Required game file missing: ' + name);
  const includedPaths = new Set(included.map(file => file.path));
  const builderFiles = included.filter(file => file.path.startsWith('.zero-build/'));
  if (builderFiles.length) {
    const manifest = builderFiles.find(file => file.path === '.zero-build/builder.json');
    if (!manifest || manifest.data.length > builderFormat.LIMITS.manifestBytes) throw new Error('Shared game is missing its complete saved browser builder.');
    builderFormat.validateBuilderFiles(JSON.parse(manifest.data.toString('utf8')),
      builderFiles.filter(file => file !== manifest).map(file => ({path:file.path.slice('.zero-build/'.length),bytes:file.data})));
    builderFormat.validateRuntimeLock(JSON.parse(builderFiles.find(file => file.path === '.zero-build/runtime-lock.json').data.toString('utf8')));
  }
  for (const file of included) {
    const segments = file.path.split('/');
    for (let end = 1; end < segments.length; end++) if (includedPaths.has(segments.slice(0,end).join('/'))) throw new Error('Game file shadows another file directory');
  }
  validateGameStructure(included);
  return included.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

/** Inspect central AND local headers before decompression; reject ZIP64,
 * encrypted/streamed files, overlapping ranges, links and resource bombs. */
function inspectGamePackage(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 22 || bytes.length > contracts.LIMITS.gameArchiveBytes) throw new Error('Archive size outside limits');
  const end = bytes.length - 22;
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end+20) !== 0 || bytes.readUInt16LE(end+4) || bytes.readUInt16LE(end+6)) throw new Error('Unsupported ZIP footer');
  const count = bytes.readUInt16LE(end+10), start = bytes.readUInt32LE(end+16), length = bytes.readUInt32LE(end+12);
  if (!count || count > contracts.LIMITS.gameFiles || count !== bytes.readUInt16LE(end+8) || start + length !== end) throw new Error('Invalid ZIP directory/count');
  let cursor = start, total = 0;
  const entries = [], names = new Set(), ranges = [];
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const flags = bytes.readUInt16LE(cursor+8), method = bytes.readUInt16LE(cursor+10);
    const compressed = bytes.readUInt32LE(cursor+20), size = bytes.readUInt32LE(cursor+24);
    const nameLength = bytes.readUInt16LE(cursor+28), extraLength = bytes.readUInt16LE(cursor+30), commentLength = bytes.readUInt16LE(cursor+32);
    const offset = bytes.readUInt32LE(cursor+42), mode = bytes.readUInt32LE(cursor+38) >>> 16;
    if (cursor + 46 + nameLength + extraLength + commentLength > end || extraLength || commentLength || flags & ~0x806 || ![0,8].includes(method) || bytes.readUInt16LE(cursor+34)) throw new Error('Unsupported ZIP entry');
    const rawName = bytes.subarray(cursor+46,cursor+46+nameLength);
    const name = rawName.toString('utf8');
    safeGamePath(name);
    if (!includeGamePath(name) || names.has(name.toLowerCase()) || (mode & 0o170000) !== 0o100000 || (mode & 0o7777) !== (name === 'mvnw' ? 0o755 : 0o644)) throw new Error('ZIP entry violates game file policy');
    names.add(name.toLowerCase()); total += size;
    if (total > contracts.LIMITS.gameSourceBytes || offset + 30 > start || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error('ZIP resource/header limit');
    const localName = bytes.readUInt16LE(offset+26), localExtra = bytes.readUInt16LE(offset+28);
    const dataStart = offset+30+localName+localExtra;
    if (localExtra || dataStart+compressed > start || bytes.readUInt16LE(offset+6) !== flags || bytes.readUInt16LE(offset+8) !== method || bytes.readUInt32LE(offset+18) !== compressed || bytes.readUInt32LE(offset+22) !== size || bytes.readUInt32LE(offset+14) !== bytes.readUInt32LE(cursor+16) || !bytes.subarray(offset+30,offset+30+localName).equals(rawName)) throw new Error('Local ZIP entry differs from central directory');
    ranges.push([offset,dataStart+compressed]);
    if (!Buffer.from(name,'utf8').equals(rawName)) throw new Error('Invalid UTF-8 ZIP name');
    entries.push({path:name,mode,size,method,compressed,dataStart,crc:bytes.readUInt32LE(cursor+16)});
    cursor += 46+nameLength+extraLength+commentLength;
  }
  if (cursor !== end || ranges.sort((a,b)=>a[0]-b[0]).some((range,index) => range[0] !== (index ? ranges[index-1][1] : 0)) || ranges.at(-1)[1] !== start) throw new Error('ZIP entries overlap or contain hidden data');
  const files = entries.map(entry => {
    const compressed = bytes.subarray(entry.dataStart,entry.dataStart+entry.compressed);
    const data = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed,{maxOutputLength:Math.max(1,entry.size)});
    if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error('ZIP bytes/CRC differ from manifest');
    return {path:entry.path,data,mode:entry.mode};
  });
  return normalizeGameFiles(files);
}

async function extractGamePackage({bytes, destination, expectedSha256}) {
  if (expectedSha256 && byteHash(bytes) !== expectedSha256) throw new Error('Game download checksum mismatch');
  const files = inspectGamePackage(bytes);
  const absolute = path.resolve(destination);
  // A single exclusive mkdir owns the entire new project; existing destinations
  // and inherited Git repositories are refused before writing any file.
  const parent = await realpath(path.dirname(absolute));
  if (parent !== path.resolve(path.dirname(absolute))) throw new Error('Destination parent must not contain symlinks');
  for(let ancestor=parent;;ancestor=path.dirname(ancestor)) {
    if(await lstat(path.join(ancestor,'.git')).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))throw new Error('Open a shared game outside existing Git repositories');
    if(path.dirname(ancestor)===ancestor)break;
  }
  await mkdir(absolute);
  try {
    for (const file of files) {
      const target = path.join(absolute,file.path);
      await mkdir(path.dirname(target),{recursive:true});
      await writeFile(target,file.data,{flag:'wx',mode:file.mode & 0o777});
      await chmod(target,file.mode & 0o777);
    }
    const original=files.find(file=>file.path==='.gitignore')?.data||Buffer.alloc(0);
    await writeFile(path.join(absolute,'.gitignore'),Buffer.concat([original,Buffer.from('\n# Zero downloaded project exclusions\n'+SAFE_GITIGNORE)]),{mode:0o644});
  } catch (error) { await rm(absolute,{recursive:true,force:true}); throw error; }
  return {destination:absolute,files:files.map(file=>file.path),generatedFiles:['.gitignore']};
}

module.exports = {TRUSTED_WRAPPER_HASHES,safeGamePath,includeGamePath,normalizeGameFiles,inspectGamePackage,extractGamePackage};
