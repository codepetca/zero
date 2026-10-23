'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadBundle} = require('./lesson-projects');
const {helperHashes} = require('./web-export/adapters');
const migration = require('./web-publish-migration');

// App.java shipped before f1830654's runtime-padding change. This reviewed source
// allowlist is never inferred from project metadata, syntax or student Git history.
const previousHashes = Object.freeze({
  'zero/App.java': Object.freeze(['bdcb1060ad5a30f16f1a395c522a520d2506530584bda71a0e4cbe1e7c467c09'])
});
const limit = 256 * 1024;
const plans = new WeakMap();
const names = Object.keys(helperHashes).sort();
const relative = name => 'src/main/java/' + name;
const identity = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
const digest = bytes => crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
const changed = () => Error('Zero helper files or paths changed. Preserve your edits and review Publish again.');
function conflict(name) {
  return Error(`Zero helper ${relative(name)} has custom or unknown content. Zero kept your source unchanged. Use the supported helper version or review its browser adapter before publishing.`);
}
function rootIdentity(root, io) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw Error('Choose an absolute Zero project folder before updating helpers.');
  const stat = io.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Zero helpers need an ordinary project directory, without symbolic links.');
  return [stat.dev, stat.ino, stat.mode].join(':');
}
function snapshot(root, io = fs) {
  const entries = new Map(), paths = new Map();
  for (const name of names) {
    const filename = relative(name), parts = filename.split('/');
    let target = root, missing = false;
    for (const [index, part] of parts.entries()) {
      target = path.join(target, part);
      let stat;
      try { stat = io.lstatSync(target); }
      catch (error) { if (error.code === 'ENOENT') { missing = true; break; } throw error; }
      const leaf = index === parts.length - 1;
      if (stat.isSymbolicLink() || (leaf ? !stat.isFile() : !stat.isDirectory())) throw Error('A Zero helper path is a symbolic link or is not a regular file or directory. Preserve it before publishing.');
      if (leaf && (stat.nlink !== 1 || stat.size > limit)) throw Error('A Zero helper is too large or has multiple hard links. Preserve it before publishing.');
      paths.set(target, identity(stat));
    }
    if (missing) { entries.set(filename, null); continue; }
    const fd = io.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = io.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit || identity(stat) !== paths.get(target)) throw changed();
      const bytes = Buffer.alloc(stat.size); let offset = 0;
      while (offset < bytes.length) {
        const count = io.readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (count <= 0) throw changed();
        offset += count;
      }
      if (identity(io.fstatSync(fd)) !== identity(stat)) throw changed();
      entries.set(filename, bytes);
    } finally { io.closeSync(fd); }
  }
  return {entries, paths};
}
async function canonical(extensionPath) {
  // Reuse the already packaged, validated readable tutorial sources. Pin them
  // to the browser adapter contract so a stale/corrupt bundle cannot downgrade
  // a project or silently loosen the adapter's safety gate.
  const projects = await loadBundle(extensionPath);
  const result = new Map();
  for (const name of names) {
    const copies = projects.map(project => project.files.find(file => file.path === relative(name))?.content);
    if (copies.some(bytes => !bytes || digest(bytes) !== helperHashes[name]) || copies.some(bytes => !bytes.equals(copies[0]))) throw Error('The bundled Zero helper sources do not match the reviewed browser adapters. Reinstall Zero before publishing.');
    result.set(relative(name), Buffer.from(copies[0]));
  }
  return result;
}
async function inspect(root, {extensionPath = path.resolve(__dirname, '..'), io = fs} = {}) {
  const current = await canonical(extensionPath), rootNode = rootIdentity(root, io), original = snapshot(root, io);
  const expected = new Map(), updates = [];
  for (const name of names) {
    const filename = relative(name), bytes = original.entries.get(filename);
    if (bytes === null) continue; // Do not add missing or retired helper files.
    const hash = digest(bytes);
    if (hash === helperHashes[name]) expected.set(filename, bytes);
    else if (previousHashes[name]?.includes(hash)) { expected.set(filename, current.get(filename)); updates.push(filename); }
    else throw conflict(name);
  }
  // A reviewed replacement may introduce a source dependency. Never install
  // that replacement unless its exact current dependency already exists; this
  // migration does not add source files or turn into a framework installer.
  if (updates.includes(relative('zero/App.java'))) {
    const dependency = relative('zero/ui/Element.java');
    const bytes = original.entries.get(dependency);
    if (!bytes || digest(bytes) !== helperHashes['zero/ui/Element.java']) {
      throw Error(`Zero cannot update ${relative('zero/App.java')} because its required current helper ${dependency} is missing or unsupported. Zero kept every source file unchanged. Use a project with the complete supported framework before publishing.`);
    }
  }
  // Keep mutable buffers and filesystem identities private to this module.
  const plan = Object.freeze({upgrade: updates.length > 0, changed: Object.freeze(updates)});
  plans.set(plan, {root, rootNode, original, expected});
  return plan;
}
function assertSnapshot(root, original, io) {
  const now = snapshot(root, io);
  if (now.paths.size !== original.paths.size || [...original.paths].some(([target, node]) => now.paths.get(target) !== node) || [...original.entries].some(([name, bytes]) => bytes === null ? now.entries.get(name) !== null : !now.entries.get(name)?.equals(bytes))) throw changed();
}
async function apply(root, plan, {beforeWrite, io = fs} = {}) {
  const state = plans.get(plan);
  if (!state || root !== state.root) throw Error('Review the Zero helper update for this project before applying it.');
  if (!plan.upgrade) return {updated: []};
  if (typeof beforeWrite !== 'function') throw Error('A current Publish project guard is required before updating Zero helpers.');
  await beforeWrite();
  if (rootIdentity(root, io) !== state.rootNode) throw changed();
  assertSnapshot(root, state.original, io);
  // The shared transaction retains original inodes under .git, stages complete
  // bytes first and installs exclusively. Failure never truncates student files;
  // its error identifies retained recovery copies when rollback cannot finish.
  // Only existing files participate; the full snapshot above also guards missing
  // helpers and every inspected parent against changes during the async guard.
  const original = {entries: new Map([...state.original.entries].filter(([, bytes]) => bytes !== null)), paths: state.original.paths};
  migration.apply(root, state.expected, original, io);
  plans.delete(plan);
  return {updated: [...plan.changed]};
}
module.exports = {inspect, apply};
