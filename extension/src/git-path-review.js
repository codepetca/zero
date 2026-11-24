'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function nestedRepository(name, indexed = false) {
  // Only render an ordinary, bounded relative name in local editor text.
  const local = typeof name === 'string' && name.length <= 160 &&
    name.split('/').every(part => /^[\p{L}\p{N}_][\p{L}\p{M}\p{N} ._()-]*$/u.test(part));
  const lead = indexed ? 'Nested repositories or submodules are not supported.' : 'Nested repositories are not supported.';
  const where = local ? ` The project contains “${name}”.` : '';
  return new Error(`${lead}${where} Keep both repositories and open the intended project folder in its own window.`);
}

function indexEntriesByPath(entries) {
  return new Map(entries.map(entry => [entry.slice(entry.indexOf('\t') + 1), entry]));
}

function refuseGitlinks(entries) {
  for (const entry of entries) {
    if (entry.startsWith('160000 ')) throw nestedRepository(entry.slice(entry.indexOf('\t') + 1), true);
  }
}

async function checkNestedMarker(root, directory) {
  try { await fs.lstat(path.join(directory, '.git')); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return; throw error; }
  throw nestedRepository(path.relative(root, directory).split(path.sep).join('/'));
}

// A directory may occupy the name of a deleted file. The file's original mode
// comes from the index for an unstaged deletion, or HEAD for a staged deletion.
function deletedSource(kind, previous = false) {
  const marker = previous ? 'R' : 'D';
  if (kind[1] === marker) return 'index';
  if (kind[0] === marker) return 'head';
}

async function replacesRegularFile({root, head}, name, source, entries, run) {
  const absolute = path.resolve(root, name);
  if (await fs.realpath(absolute) !== absolute) return false;
  await checkNestedMarker(root, absolute);
  if (source === 'index') return /^(100644|100755) [a-f0-9]+ 0\t/.test(entries.get(name) || '');
  if (source !== 'head' || !head || entries.has(name)) return false;
  const row = await run(root, ['--literal-pathspecs', 'ls-tree', '-z', head, '--', name]);
  return /^(100644|100755) blob [a-f0-9]+\t/.test(row) && row.slice(row.indexOf('\t') + 1) === name + '\0';
}

module.exports = {refuseGitlinks, indexEntriesByPath, checkNestedMarker, deletedSource, replacesRegularFile};
