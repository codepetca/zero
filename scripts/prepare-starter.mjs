import {mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const coreSources = ['App.java', 'GameApp.java'];
const retiredSources = ['SketchApp.java', 'SimpleApp.java']; // Removed API; never include in new kits.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// This is maintainer tooling. Extracted student projects contain ordinary Java
// source and never run this script or depend on the surrounding repository.
export function prepareStarter(root = fileURLToPath(new URL('../', import.meta.url))) {
  const statePath = path.join(root, '.verification/starter-source.json');
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const files = coreSources.map(name => ({name,
    source: path.join(root, 'framework/src/main/java/zero', name),
    destination: path.join(root, 'student-template/src/main/java/zero', name)}));
  files.push({name: 'LICENSE', source: path.join(root, 'LICENSE'), destination: path.join(root, 'student-template/LICENSE')});
  // Retire only unchanged copies recorded by a previous preparation. Check them
  // before writing anything, with the same edit protection as current sources.
  const retired = Object.entries({...Object.fromEntries(retiredSources.map(name => [name, null])), ...previous}).filter(([name]) =>
    /^[A-Za-z][A-Za-z0-9]*\.java$/.test(name) && !coreSources.includes(name))
    .map(([name, sha256]) => {
      const destination = path.join(root, 'student-template/src/main/java/zero', name);
      if (!existsSync(destination)) return null;
      if (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink()
          || digest(readFileSync(destination)) !== sha256) {
        throw new Error(`Preserved edited retired starter source: ${destination}. Save edited files elsewhere before preparing again.`);
      }
      return destination;
    }).filter(Boolean);
  const updates = files.map(({name, source, destination}) => {
    if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error(`Expected ordinary canonical source: ${source}`);
    const bytes = readFileSync(source), sha256 = digest(bytes);
    if (existsSync(destination)) {
      if (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink()) throw new Error(`Expected ordinary generated source: ${destination}`);
      const current = digest(readFileSync(destination));
      if (current !== sha256 && current !== previous[name]) {
        throw new Error(`Preserved edited starter source: ${destination}. Move intended source edits into framework/src/main/java/zero or save edited files elsewhere before preparing again.`);
      }
    }
    return {name, destination, bytes, sha256};
  });
  // Check every file before changing any, so a drift failure preserves the pair.
  for (const destination of retired) unlinkSync(destination);
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
