'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Status can invoke clean filters on tracked files. Adding a checkpoint can
// additionally invoke them for newly added, nonignored files.
async function refuseFilters(root, run, {untracked = false, extra = [], gitOptions, gitPrefix = []} = {}) {
  const args = untracked ? ['ls-files', '--cached', '--others', '--exclude-standard', '-z'] : ['ls-files', '--cached', '-z'];
  const names = [...new Set([...(await run(root, [...gitPrefix, ...args], gitOptions)).split('\0').filter(Boolean), ...extra])];
  let batch = [], size = 0; const ambiguous = new Set();
  async function check() {
    if (!batch.length) return;
    const fields = (await run(root, [...gitPrefix, '--literal-pathspecs', 'check-attr', '-z', 'filter', '--', ...batch], gitOptions)).split('\0').filter(Boolean);
    if (fields.length !== batch.length * 3) throw new Error('Git attributes could not be verified. Use native Source Control.');
    for (let i = 0; i < fields.length; i += 3) {
      if (fields[i] !== batch[i / 3] || fields[i + 1] !== 'filter') throw new Error('Git attributes could not be verified. Use native Source Control.');
      if (!['unset', 'unspecified'].includes(fields[i + 2])) throw new Error('Git filters require native Source Control for this project step.');
      // Git prints these same words for both special attribute states and
      // literal filter names. Treat either as active when a matching driver
      // is configured rather than guessing which meaning Git returned.
      ambiguous.add(fields[i + 2]);
    }
    batch = []; size = 0;
  }
  for (const name of names) {
    if (name.includes('\ufffd')) throw new Error('Git path encoding could not be verified. Use native Source Control.');
    const bytes = Buffer.byteLength(name) + 1;
    if (bytes > 24576) throw new Error('Git path is too long to verify safely. Use native Source Control.');
    if (batch.length >= 128 || size + bytes > 24576) await check();
    batch.push(name); size += bytes;
  }
  await check();
  if (ambiguous.size) {
    let configured;
    try { configured = await run(root, [...gitPrefix, 'config', '--name-only', '--get-regexp', '^filter\\.(unset|unspecified)\\.'], gitOptions); }
    catch (error) { if (error.code !== 1) throw error; }
    if (configured && configured.split('\n').some(key => {
      const match = /^filter\.(unset|unspecified)\./.exec(key);
      return match && ambiguous.has(match[1]);
    })) throw new Error('Git filters require native Source Control for this project step.');
  }
}
// A merge or checkout may materialize paths not present in the current index.
// Assess both pinned trees under the same config used by the live operation.
async function refuseUnsafeUpdateConversions(root, current, target, run) {
  if (![current, target].every(value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value || ''))) throw new Error('Update trees could not be verified. Use native Source Control.');
  if (Object.keys(process.env).some(key => /^GIT_REPLACE_REF_BASE$/i.test(key))) throw new Error('Git replacement objects require native Source Control for this update.');
  if (await run(root, ['for-each-ref', '--format=%(refname)', 'refs/replace/'])) throw new Error('Git replacement objects require native Source Control for this update.');
  const grafts = await run(root, ['rev-parse', '--git-path', 'info/grafts']);
  try { await fs.lstat(path.resolve(root, grafts)); throw new Error('Git grafts require native Source Control for this update.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = async pattern => {
    try { return await run(root, ['config', '--name-only', '--get-regexp', pattern]); }
    catch (error) { if (error.code === 1) return ''; throw error; }
  };
  // A checkout can change which on-branch includes Git loads while it runs.
  // Their target configuration cannot be inferred from the current branch.
  if (await config('^includeif\\..*\\.path$')) throw new Error('Conditional Git configuration requires native Source Control for this update.');
  // Arbitrary merge drivers can execute even without a conflicting worktree
  // path; refuse them before Git starts its live merge or checkout.
  if (await config('^merge\\..*\\.driver$')) throw new Error('Configured merge drivers require native Source Control for this update.');
  if (!await config('^filter\\..*\\.(clean|smudge|process)$')) return;
  const stock = new Map([
    ['.gitattributes', '* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n'],
    ['.zero-build/.gitattributes', '* -text\n']
  ]);
  const tree = async commit => {
    const rows = (await run(root, ['--no-replace-objects', 'ls-tree', '-r', '-z', commit])).split('\0').filter(Boolean);
    const paths = [], attributes = [];
    for (const row of rows) {
      const entry = /^(\d{6}) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)$/.exec(row);
      if (!entry || entry[4].includes('\ufffd')) throw new Error('Update tree paths could not be verified. Use native Source Control.');
      const name = entry[4]; paths.push(name);
      if (!name.split('/').some(part => part.toLowerCase() === '.gitattributes')) continue;
      if (!stock.has(name) || !/^100(?:644|755)$/.test(entry[1]) || entry[2] !== 'blob') throw new Error('Custom Git attributes require native Source Control for this update.');
      const content = await run(root, ['--no-replace-objects', 'cat-file', 'blob', entry[3]], {encoding:'buffer'});
      if (!Buffer.isBuffer(content) || (name === '.gitattributes' ? content.toString('utf8').replace(/\r\n/g, '\n') : content.toString('utf8')) !== stock.get(name)) throw new Error('Custom Git attributes require native Source Control for this update.');
      attributes.push(`${name}\0${entry[3]}`);
    }
    return {paths, attributes:attributes.sort()};
  };
  const [before, incoming] = await Promise.all([tree(current), tree(target)]);
  if (JSON.stringify(before.attributes) !== JSON.stringify(incoming.attributes)) throw new Error('Changed Git attributes require native Source Control for this update.');
  // With identical stock tree attributes, actual worktree, global and info
  // attributes can be checked for every current and incoming path.
  await refuseFilters(root, run, {extra:[...before.paths, ...incoming.paths]});
}
const guarded = Symbol('filter-guarded-runner');
function guardedRunner(run) {
  if (run[guarded]) return run;
  const wrapped = async (root, args, options) => {
    let index = 0; const gitPrefix = [];
    while (index < args.length) {
      if (args[index] === '-c') { if (index + 1 >= args.length) throw new Error('Git configuration could not be verified. Use native Source Control.'); gitPrefix.push(args[index], args[index + 1]); index += 2; continue; }
      if (['--literal-pathspecs', '--no-replace-objects'].includes(args[index])) { index++; continue; }
      break;
    }
    const gitOptions = options?.env ? {env:options.env} : undefined;
    if (args[index] === 'status') await refuseFilters(root, run, {gitOptions, gitPrefix});
    if (args[index] === 'add') await refuseFilters(root, run, {untracked:true, gitOptions, gitPrefix});
    return run(root, args, options);
  };
  wrapped[guarded] = true;
  return wrapped;
}
module.exports = {refuseFilters, guardedRunner, refuseUnsafeUpdateConversions};
