// Maintainer-only, read-only guard. Example:
// node scripts/check-core-version.mjs --base origin/main
// The caller selects an existing local base commit; this script never fetches
// history, evaluates historical modules or maintains old framework versions.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {parseXml, single, value} = require('../extension/src/project-pom');
const sourceRoot = 'framework/src/main/java';
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function normalized(bytes) {
  const text = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes);
  if (text.includes('\ufeff') || /\r(?!\n)/.test(text)) throw Error('Framework Java sources must be UTF-8 without a BOM or lone CR.');
  return text.replace(/\r\n/g, '\n');
}
function coreVersion(bytes) {
  const project = parseXml(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  if (value(single(project, 'groupId')) !== 'school.zero' || value(single(project, 'artifactId')) !== 'zero-core') throw Error('Expected the canonical school.zero:zero-core POM.');
  const version = value(single(project, 'version'));
  if (!/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(version)) throw Error('Core version must be an exact three-part version.');
  return version;
}
function compareVersion(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function ordinary(filename, directory = false) {
  const stat = lstatSync(filename);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) throw Error('Expected ordinary framework paths: ' + filename);
}
function inventory(files) {
  if (!files.length) throw Error('The canonical framework Java source inventory is empty.');
  return files.map(file => ({path:file.path, sha256:hash(normalized(file.bytes))})).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function checkCoreVersion({base, root = defaultRoot} = {}) {
  if (typeof base !== 'string' || !base || base !== base.trim() || base.startsWith('-') || /[\x00-\x1f\x7f]/.test(base)) throw Error('Provide an explicit local base revision with --base <revision>.');
  root = realpathSync(root);
  const git = args => execFileSync('git', args, {cwd:root, maxBuffer:8 * 1024 * 1024, stdio:['ignore', 'pipe', 'pipe']});
  const actualRoot = realpathSync(git(['rev-parse', '--show-toplevel']).toString().trim());
  if (actualRoot !== root) throw Error('Run the core version check against the repository root.');
  let commit;
  try {commit = git(['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).toString().trim();}
  catch {throw Error('Base revision is unavailable locally: ' + base + '. Supply an existing commit; shallow checkouts must include that base. No history was fetched.');}
  const entries = git(['ls-tree', '-r', '-z', commit, '--', sourceRoot, 'framework/pom.xml']).toString('utf8').split('\0').filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
    if (!match) throw Error('The base framework contains a nonordinary Git entry.');
    return {path:match[3], object:match[2]};
  });
  const basePom = entries.find(entry => entry.path === 'framework/pom.xml');
  if (!basePom) throw Error('The base revision has no canonical framework/pom.xml. Choose a base with the current framework layout.');
  const beforeVersion = coreVersion(git(['cat-file', 'blob', basePom.object]));
  const before = inventory(entries.filter(entry => entry.path.startsWith(sourceRoot + '/') && entry.path.endsWith('.java')).map(entry => ({path:entry.path, bytes:git(['cat-file', 'blob', entry.object])})));
  let folder = root;
  for (const part of sourceRoot.split('/')) {folder = path.join(folder, part); ordinary(folder, true);}
  ordinary(path.join(root, 'framework/pom.xml'));
  const afterVersion = coreVersion(readFileSync(path.join(root, 'framework/pom.xml')));
  const files = [];
  function walk(directory, relative) {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      const filename = path.join(directory, entry.name), name = relative + '/' + entry.name;
      if (entry.isDirectory()) {ordinary(filename, true); walk(filename, name);}
      else {
        ordinary(filename);
        if (name.endsWith('.java')) files.push({path:name, bytes:readFileSync(filename)});
      }
    }
  }
  walk(folder, sourceRoot);
  const after = inventory(files), beforeMap = new Map(before.map(file => [file.path, file.sha256])), afterMap = new Map(after.map(file => [file.path, file.sha256]));
  const changedPaths = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].filter(name => beforeMap.get(name) !== afterMap.get(name)).sort();
  if (compareVersion(afterVersion, beforeVersion) < 0 || changedPaths.length && compareVersion(afterVersion, beforeVersion) === 0) throw Error(`Framework ${changedPaths.length ? 'source or inventory changed' : 'version decreased'} against ${base} (${beforeVersion} → ${afterVersion}). Increase the zero-core version in framework/pom.xml and synchronize core-contract.js and release/kit.json. Changed Java paths: ${changedPaths.join(', ') || 'none'}.`);
  return {base:commit, beforeVersion, afterVersion, changedPaths, beforeSourceSha256:hash(JSON.stringify(before)), afterSourceSha256:hash(JSON.stringify(after))};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--base') throw Error('Usage: node scripts/check-core-version.mjs --base <local-revision>');
    const result = checkCoreVersion({base:args[1]});
    console.log(`Core version check passed: ${result.beforeVersion} → ${result.afterVersion}; ${result.changedPaths.length} changed Java paths against ${result.base}.`);
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
