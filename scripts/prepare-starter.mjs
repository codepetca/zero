import {mkdirSync, readFileSync, writeFileSync, lstatSync, unlinkSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import core from '../extension/src/core-contract.js';
import {projectBuilderFilesSync, readBuilderTreeSync} from './prepare-project-builder.mjs';

export const coreSources = core.coreSourcePaths.map(name => name.slice('src/main/java/zero/'.length));
const retiredSources = ['SketchApp.java', 'SimpleApp.java']; // Removed API; never include in new kits.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// This is maintainer tooling. Extracted student projects contain ordinary Java
// source and never run this script or depend on the surrounding repository.
export function prepareStarter(root = fileURLToPath(new URL('../', import.meta.url))) {
  // Resolve the caller's root once (macOS temporary roots can contain /var),
  // then reject links within it before reading or mutating generated outputs.
  root = realpathSync(root);
  function outputStat(destination) {
    let directory = root;
    for (const part of path.relative(root, path.dirname(destination)).split(path.sep).filter(Boolean)) {
      directory = path.join(directory, part);
      const stat = lstatSync(directory, {throwIfNoEntry: false});
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
        throw new Error(`Expected ordinary generated directory: ${directory}. Linked output paths are preserved.`);
      }
    }
    return lstatSync(destination, {throwIfNoEntry: false});
  }
  const statePath = path.join(root, '.verification/starter-source.json');
  const stateStat = outputStat(statePath);
  if (stateStat && (!stateStat.isFile() || stateStat.isSymbolicLink())) throw new Error(`Expected ordinary starter ownership state: ${statePath}`);
  const previous = stateStat ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const files = coreSources.map(name => ({name,
    source: path.join(root, 'framework/src/main/java/zero', name),
    destination: path.join(root, 'student-template/src/main/java/zero', name)}));
  files.push({name: 'LICENSE', source: path.join(root, 'LICENSE'), destination: path.join(root, 'student-template/LICENSE')});
  const builderFiles = projectBuilderFilesSync({sourceRoot:root});
  for (const file of builderFiles) files.push({name:'.zero-build/' + file.path, bytes:file.bytes,
    destination:path.join(root,'student-template/.zero-build',file.path)});
  const builderNames = new Set(builderFiles.map(file => '.zero-build/' + file.path));
  const retiredBuilder = [];
  for (const file of readBuilderTreeSync(path.join(root,'student-template/.zero-build'),{optional:true})) {
    const name = '.zero-build/' + file.path;
    if (builderNames.has(name)) continue;
    if (!Object.hasOwn(previous,name) || digest(file.bytes) !== previous[name]) {
      throw new Error('Preserved unknown or edited retired starter builder file: ' + name);
    }
    retiredBuilder.push(path.join(root,'student-template',name));
  }
  // Only a previous ownership hash permits retirement. Unrecorded files and
  // symlinks (including dangling ones) are preserved before any output changes.
  const retired = Object.entries({...Object.fromEntries(retiredSources.map(name => [name, null])), ...previous})
    .filter(([name]) => /^(?:[A-Za-z][A-Za-z0-9]*\/)*[A-Za-z][A-Za-z0-9]*\.java$/.test(name) && !coreSources.includes(name))
    .map(([name, sha256]) => {
      const destination = path.join(root, 'student-template/src/main/java/zero', name);
      const stat = outputStat(destination);
      if (!stat) return null;
      if (!stat.isFile() || stat.isSymbolicLink() || digest(readFileSync(destination)) !== sha256) {
        throw new Error(`Preserved edited retired starter source: ${destination}. Save edited files elsewhere before preparing again.`);
      }
      return destination;
    }).filter(Boolean);
  const updates = files.map(({name, source, destination, bytes:provided}) => {
    if (source && (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink())) throw new Error(`Expected ordinary canonical source: ${source}`);
    const bytes = provided ?? readFileSync(source), sha256 = digest(bytes);
    const destinationStat = outputStat(destination);
    if (destinationStat) {
      if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) throw new Error(`Expected ordinary generated source: ${destination}`);
      const current = digest(readFileSync(destination));
      if (current !== sha256 && current !== previous[name]) {
        throw new Error(`Preserved edited starter source: ${destination}. Move intended source edits into framework/src/main/java/zero or save edited files elsewhere before preparing again.`);
      }
    }
    return {name, destination, bytes, sha256};
  });
  const recordBytes = Buffer.from(JSON.stringify(core.makeCoreRecord(Object.fromEntries(updates.filter(item => coreSources.includes(item.name)).map(item =>
    ['src/main/java/zero/' + item.name, item.bytes]))), null, 2) + '\n');
  const recordDestination = path.join(root,'student-template/zero-core.json');
  const recordStat = outputStat(recordDestination);
  const recordHash = digest(recordBytes);
  if (recordStat && (!recordStat.isFile() || recordStat.isSymbolicLink())) throw new Error('Expected ordinary generated source: ' + recordDestination);
  if (recordStat) {
    const existing = digest(readFileSync(recordDestination));
    if (existing !== recordHash && existing !== previous['zero-core.json']) throw new Error('Preserved edited starter source: ' + recordDestination);
  }
  updates.push({name:'zero-core.json',destination:recordDestination,bytes:recordBytes,sha256:recordHash});
  // Check every file before changing any, so a drift failure preserves all copies.
  for (const destination of [...retired,...retiredBuilder]) unlinkSync(destination);
  for (const item of updates) {
    mkdirSync(path.dirname(item.destination), {recursive: true});
    writeFileSync(item.destination, item.bytes);
  }
  mkdirSync(path.dirname(statePath), {recursive: true});
  writeFileSync(statePath, JSON.stringify(Object.fromEntries(updates.map(item => [item.name, item.sha256])), null, 2) + '\n');
  return updates;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareStarter();
  console.log('Prepared readable starter source from framework/. Edited starter copies are preserved on drift.');
}
