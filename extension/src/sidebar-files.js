'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {libraryLayout} = require('./library-files');
const omitted = new Set(['.git','target','node_modules','.DS_Store','.zero-sharing-recovery','.zero','.zero-web']);
const LIMIT = 250, MAX_ENTRIES = 2000;

// The browser receives only opaque handles. Every use rechecks the current
// project and each path component, including symlinks replaced after listing.
function createSidebarFiles({project, open}) {
  let root, generation = crypto.randomBytes(12).toString('hex'), revision = 0;
  let entries = new Map(), handles = new Map();
  const reset = () => {revision++; root = undefined; generation = crypto.randomBytes(12).toString('hex'); entries = new Map(); handles = new Map();};
  async function current() {
    const started = revision;
    const candidate = await project();
    if (started !== revision) throw new Error('Project changed. Refresh the file list.');
    if (candidate !== root) {reset(); root = candidate;}
    return {root, generation, revision};
  }
  function assertCurrent(snapshot) {
    if (snapshot.revision !== revision || snapshot.root !== root) throw new Error('Project changed. Refresh the file list.');
  }
  async function safe(filename, snapshot) {
    assertCurrent(snapshot);
    const relative = path.relative(snapshot.root, filename);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('File is outside this project.');
    if (relative.split(path.sep).length > 24) throw new Error('Folder nesting is too deep. Open it with Explorer.');
    const realRoot = await fs.realpath(snapshot.root);
    let walk = snapshot.root;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      if (omitted.has(component)) throw new Error('Generated and private project folders are hidden.');
      walk = path.join(walk, component);
      if ((await fs.lstat(walk)).isSymbolicLink()) throw new Error('Symbolic links are hidden from the project file list.');
    }
    const real = await fs.realpath(filename);
    const contained = path.relative(realRoot, real);
    if (contained === '..' || contained.startsWith(`..${path.sep}`) || path.isAbsolute(contained)) throw new Error('File is outside this project.');
    assertCurrent(snapshot);
    return fs.stat(filename);
  }
  function handle(entry, snapshot) {
    assertCurrent(snapshot);
    const key = `${entry.filename}\0${entry.projectFiles || false}`;
    let id = handles.get(key);
    if (!id) {
      if (entries.size >= MAX_ENTRIES) return null;
      id = crypto.randomBytes(16).toString('hex'); handles.set(key, id); entries.set(id, entry);
    }
    return {id, label:entry.label || path.basename(entry.filename), directory:entry.directory};
  }
  async function visible(directory, snapshot, omit = []) {
    if (!(await safe(directory, snapshot)).isDirectory()) return {items:[],truncated:false};
    const found = [];
    let scanned = 0, scanLimit = false;
    // opendir bounds enumeration and memory even in very large directories.
    const directoryHandle = await fs.opendir(directory);
    for await (const child of directoryHandle) {
      if (++scanned > 1000) {scanLimit=true;break;}
      if (omitted.has(child.name) || omit.includes(child.name) || child.isSymbolicLink() || (!child.isFile() && !child.isDirectory())) continue;
      found.push({filename:path.join(directory,child.name), directory:child.isDirectory()});
      if (found.length > LIMIT) break;
    }
    const truncated = scanLimit || found.length > LIMIT;
    return {items:found.slice(0,LIMIT).sort((a,b)=>Number(b.directory)-Number(a.directory)||path.basename(a.filename).localeCompare(path.basename(b.filename))), truncated};
  }
  async function list(id, requestedGeneration) {
    const snapshot = await current();
    if (id && requestedGeneration !== snapshot.generation) return null;
    let result;
    if (id) {
      const entry = entries.get(id);
      if (!entry?.directory) return null;
      result = await visible(entry.filename, snapshot, entry.projectFiles ? ['src','README.md'] : []);
    } else {
      await safe(snapshot.root, snapshot);
      const library = await libraryLayout(snapshot.root);
      const sources = path.join(snapshot.root,'src/main/java');
      try {result = await visible(sources, snapshot, library ? [] : ['zero']);}
      catch (error) {if(error.code !== 'ENOENT') throw error; result={items:[],truncated:false};}
      const extra = library ? [
        {filename:library.readme,directory:false}, {label:'Examples',filename:library.examples,directory:true}, {label:'Checks',filename:library.checks,directory:true}
      ] : [
        {label:'Libraries',filename:path.join(snapshot.root,'libraries'),directory:true},
        {label:'Resources',filename:path.join(snapshot.root,'src/main/resources'),directory:true},
        {label:'Toolkit',filename:path.join(sources,'zero'),directory:true},
        {filename:path.join(snapshot.root,'README.md'),directory:false}
      ];
      for (const entry of extra) {
        try {const stat = await safe(entry.filename,snapshot); if (entry.directory ? stat.isDirectory() : stat.isFile()) result.items.push(entry);}
        catch(error) {if(error.code !== 'ENOENT' && !/Symbolic links/.test(error.message)) throw error;}
      }
      result.items.push({label:'Project files',filename:snapshot.root,directory:true,projectFiles:true});
    }
    await current(); assertCurrent(snapshot);
    return {generation:snapshot.generation,parent:id || null,items:result.items.map(entry=>handle(entry,snapshot)).filter(Boolean),truncated:result.truncated || entries.size >= MAX_ENTRIES};
  }
  async function openFile(id, requestedGeneration) {
    const snapshot = await current();
    if (requestedGeneration !== snapshot.generation) return false;
    const entry = entries.get(id);
    if (!entry || entry.directory) return false;
    if (!(await safe(entry.filename,snapshot)).isFile()) return false;
    await current(); assertCurrent(snapshot);
    await open(entry.filename); return true;
  }
  return {reset,list,openFile};
}
module.exports = {createSidebarFiles};
