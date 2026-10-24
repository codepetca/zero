#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const format = require('../extension/src/project-builder-format');
const {browserExternalFiles} = require('../extension/src/web-export/snapshot');
const {validateKitConfiguration} = require('../extension/src/sharing/configuration');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function regularPath(filename) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat; try {stat = fsSync.lstatSync(current);} catch(error) {if(error.code !== 'ENOENT') throw error;}
    if (stat?.isSymbolicLink()) throw new Error('Saved builder refuses symbolic links: ' + current);
  }
}
export function readBuilderTreeSync(root, {optional = false} = {}) {
  regularPath(root);
  let stat; try {stat = fsSync.lstatSync(root);} catch(error) {if(!optional || error.code !== 'ENOENT') throw error;}
  if (!stat) return [];
  if (!stat.isDirectory()) throw new Error('Expected a saved builder directory: ' + root);
  const files = []; let total = 0;
  function walk(dir, prefix = '') {
    for (const entry of fsSync.readdirSync(dir, {withFileTypes: true})) {
      const name = prefix + entry.name, filename = path.join(dir, entry.name);
      if (!format.relativePath(name)) throw new Error('Unsafe saved builder path: ' + name);
      if (entry.isDirectory()) walk(filename, name + '/');
      else if (entry.isFile()) {
        const stat = fsSync.lstatSync(filename);
        if (stat.nlink !== 1 || stat.size > format.LIMITS.fileBytes) throw new Error('Linked or oversized saved builder file: ' + name);
        const bytes=fsSync.readFileSync(filename); total+=bytes.length; files.push({path: name, bytes});
        if (files.length > format.LIMITS.files + 1 || total > format.LIMITS.totalBytes) throw new Error('Saved builder exceeds inventory limits.');
      } else throw new Error('Saved builder refuses links or special files: ' + name);
    }
  }
  walk(root); return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export async function readBuilderTree(root, options) {return readBuilderTreeSync(root, options);}
export function projectBuilderFilesSync({sourceRoot = repositoryRoot} = {}) {
  const files = [];
  for (const file of readBuilderTreeSync(path.join(sourceRoot, 'extension/src/web-export'))) files.push({path: 'src/web-export/' + file.path, bytes: file.bytes});
  for (const name of browserExternalFiles) {
    const filename = path.join(sourceRoot, 'extension/src', name); regularPath(filename);
    const stat = fsSync.lstatSync(filename);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > format.LIMITS.fileBytes) throw new Error('Invalid builder source: ' + filename);
    files.push({path: 'src/' + name, bytes: fsSync.readFileSync(filename)});
  }
  for (const file of readBuilderTreeSync(path.join(sourceRoot, 'framework/project-builder'))) files.push(file);
  format.validateRuntimeLock(JSON.parse(files.find(file => file.path === 'runtime-lock.json').bytes));
  const sharingPath = path.join(sourceRoot, 'release/sharing.json'); regularPath(sharingPath);
  const sharingBytes = fsSync.readFileSync(sharingPath);
  if(sharingBytes.length > 4096) throw new Error('Release sharing configuration exceeds limits.');
  validateKitConfiguration(JSON.parse(sharingBytes.toString('utf8')));
  files.push({path: 'media/sharing-config.json', bytes: sharingBytes});
  const manifest = format.createBuilderManifest(files);
  return [...files, {path: 'builder.json', bytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n')}].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export async function projectBuilderFiles(options) {return projectBuilderFilesSync(options);}
// Preflight every existing byte before the first write. Assemblers can use the
// in-memory file list with their own existing generated-file ownership guards.
export async function prepareProjectBuilder({destination, sourceRoot = repositoryRoot} = {}) {
  if (!destination || path.basename(path.resolve(destination)) !== '.zero-build') throw new Error('Choose a project .zero-build destination.');
  const files = await projectBuilderFiles({sourceRoot});
  const existing = await readBuilderTree(destination, {optional: true});
  if (existing.length) {
    if (existing.length !== files.length || existing.some((file, index) => file.path !== files[index].path || !file.bytes.equals(files[index].bytes))) throw new Error('The existing saved builder differs. Keep it unchanged; deliberately upgrade a copy.');
    return {destination: path.resolve(destination), files, changed: false};
  }
  // Even an empty existing directory is safe: no valuable bytes are replaced.
  await regularPath(destination);
  await fs.mkdir(destination, {recursive: true});
  for (const file of files) {
    const filename = path.join(destination, ...file.path.split('/'));
    await fs.mkdir(path.dirname(filename), {recursive: true});
    await fs.writeFile(filename, file.bytes, {flag: 'wx'});
  }
  return {destination: path.resolve(destination), files, changed: true};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {console.error('Usage: node scripts/prepare-project-builder.mjs /project/.zero-build'); process.exitCode = 2;}
  else try {const result = await prepareProjectBuilder({destination: path.resolve(process.argv[2])}); console.log(JSON.stringify({destination: result.destination, files: result.files.length, changed: result.changed}));}
  catch (error) {console.error(error.message); process.exitCode = 1;}
}
