'use strict';
// All durable recovery data is local to the repository. It contains commit IDs
// and fingerprints, never transport/session credentials or file backups.
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const core = require('./core');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const execute = promisify(execFile);
const recordName = 'zero-update-recovery.json';
const oid = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const changed = () => new Error('The pending update, repository, index, or files changed. Keep your work and inspect native Source Control before continuing.');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const nul = value => value.split('\0').filter(Boolean);
function safePath(filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\\') || filename.includes('\0') || path.isAbsolute(filename) || filename.split('/').some(part => !part || ['.', '..', '.git'].includes(part.toLowerCase()))) throw changed();
  return filename;
}
async function safeFile(root, filename) {
  safePath(filename);
  const parts = filename.split('/');
  let current = root;
  for (let i = 0; i < parts.length - 1; i++) {
    current = path.join(current, parts[i]);
    try { if (!(await fs.lstat(current)).isDirectory()) throw changed(); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  try { return await fs.lstat(path.join(root, filename)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function marker(gitDir, name) {
  try {
    const filename = path.join(gitDir, name);
    if (!(await fs.lstat(filename)).isFile()) throw changed();
    return await fs.readFile(filename, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function snapshot(root, run, inspect) {
  let partial;
  try { partial = await run(root, ['config', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$']); }
  catch (error) { if (error.code !== 1) throw error; }
  if (partial) throw new Error('Use native Source Control for this partial clone. Local checkpoints and recovery require complete local Git history.');
  const current = await inspect(root, run);
  const index = await run(root, ['ls-files', '--stage', '-z']);
  const refs = await run(root, ['for-each-ref', '--format=%(refname) %(objectname) %(symref)']);
  const files = [...new Set(nul(await run(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])))].sort();
  const digest = crypto.createHash('sha256'); const manifest = Object.create(null);
  for (const filename of files) {
    const stat = await safeFile(root, filename);
    if (!stat) continue;
    const content = crypto.createHash('sha256');
    if (stat.isSymbolicLink()) content.update(await fs.readlink(path.join(root, filename)));
    else if (stat.isFile()) for await (const chunk of createReadStream(path.join(root, filename), {highWaterMark: 65536})) content.update(chunk);
    else throw new Error('Nested repositories and special files need native Source Control.');
    manifest[filename] = [stat.mode, content.digest('hex')];
    digest.update(JSON.stringify([filename, ...manifest[filename]]));
  }
  // Ignored paths are protected from merge/abort collisions; changes to their
  // contents are harmless because managed writes never target ignored files.
  const ignored = await run(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']);
  const markers = await Promise.all(['MERGE_HEAD', 'MERGE_MSG', 'MERGE_MODE', 'ORIG_HEAD'].map(name => marker(current.gitDir, name)));
  const sourceFingerprint = digest.digest('hex');
  return {...current, manifest, index, refs, markers, ignored, sourceFingerprint, fingerprint: hash(JSON.stringify([current, index, refs, sourceFingerprint, ignored, markers]))};
}
function sameContext(a, b) {
  return ['root', 'gitDir', 'branch', 'head', 'mainHead', 'remote', 'page', 'worktrees', 'refs', 'ignored'].every(key => a[key] === b[key]) && JSON.stringify(a.markers) === JSON.stringify(b.markers);
}
function outsideIndex(index, filename) {
  return nul(index).filter(line => line.slice(line.indexOf('\t') + 1) !== filename).join('\0');
}
function assertTransition(before, after, filename) {
  const without = manifest => Object.fromEntries(Object.entries(manifest).filter(([name]) => name !== filename));
  if (!sameContext(before, after) || outsideIndex(before.index, filename) !== outsideIndex(after.index, filename) || JSON.stringify(without(before.manifest)) !== JSON.stringify(without(after.manifest))) throw changed();
}
function sameOutsideCommit(before, after) {
  const otherRefs = state => state.refs.split('\n').filter(line => !line.startsWith(`refs/heads/${state.branch} `)).join('\n');
  return ['root', 'gitDir', 'branch', 'remote', 'page', 'worktrees', 'sourceFingerprint'].every(key => before[key] === after[key]) &&
    (before.branch === 'main' || before.mainHead === after.mainHead) && otherRefs(before) === otherRefs(after);
}
async function readRecord(gitDir) {
  const raw = await marker(gitDir, recordName);
  if (raw === null) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch { throw changed(); }
  if (saved.version !== 2 || saved.provenance !== 'isolated-merge-preview-v1' || !oid(saved.head) || !oid(saved.remoteHead) || !/^[a-f0-9]{32}$/.test(saved.id) || typeof saved.fingerprint !== 'string') throw changed();
  return saved;
}
async function save(gitDir, saved) {
  const filename = path.join(gitDir, recordName);
  // Refuse an existing symlink and atomically replace only this owned record.
  await marker(gitDir, recordName);
  const temporary = path.join(gitDir, `${recordName}.${crypto.randomBytes(8).toString('hex')}`);
  try { await fs.writeFile(temporary, JSON.stringify(saved), {flag: 'wx', mode: 0o600}); await fs.rename(temporary, filename); }
  finally { await fs.rm(temporary, {force: true}); }
}
function parseText(content) {
  if (content.includes('\0')) return null;
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) || [];
  const chunks = []; const conflicts = []; let position = 0; const seen = new Map();
  while (position < lines.length) {
    const start = position;
    if (!/^<{7} /.test(lines[position])) {
      if (/^(?:<{7}|={7}|>{7}|\|{7})(?:\s|$)/.test(lines[position])) return null;
      position++; chunks.push({text: lines[start]}); continue;
    }
    position++; const local = [];
    while (position < lines.length && !/^={7}\r?\n?$/.test(lines[position])) {
      if (/^(?:<{7}|>{7}|\|{7})(?:\s|$)/.test(lines[position])) return null;
      local.push(lines[position++]);
    }
    if (position === lines.length) return null;
    position++; const incoming = [];
    while (position < lines.length && !/^>{7} /.test(lines[position])) {
      if (/^(?:<{7}|={7}|\|{7})(?:\s|$)/.test(lines[position])) return null;
      incoming.push(lines[position++]);
    }
    if (position === lines.length) return null;
    position++;
    const key = hash(JSON.stringify([local, incoming])); const count = seen.get(key) || 0; seen.set(key, count + 1);
    const conflict = {id: `${key.slice(0, 20)}-${count}`, local: local.join(''), incoming: incoming.join('')};
    conflicts.push(conflict); chunks.push({conflict, text: lines.slice(start, position).join('')});
  }
  return {chunks, conflicts};
}
function stageEntries(output) {
  const files = new Map();
  for (const line of nul(output)) {
    const match = /^(\d{6}) ([a-f0-9]+) ([123])\t([\s\S]+)$/.exec(line);
    if (!match || !oid(match[2])) throw changed();
    safePath(match[4]);
    if (!files.has(match[4])) files.set(match[4], {});
    files.get(match[4])[match[3]] = {mode: match[1], oid: match[2]};
  }
  return files;
}
async function describe(root, saved, run) {
  const entries = stageEntries(await run(root, ['ls-files', '--unmerged', '-z']));
  const files = [];
  for (const [filename, stages] of entries) {
    let kind = 'complex'; let conflicts = [];
    const stat = await safeFile(root, filename);
    const ordinary = Object.values(stages).every(entry => /^100(?:644|755)$/.test(entry.mode));
    // Rename topology and unusual modes are preserved for Git's native editor.
    if (!saved.complex && ordinary && (!stat || stat.isFile())) {
      if (!stages[2] || !stages[3]) {
        kind = 'delete'; conflicts = [{id: 'file', local: stages[2] ? 'Keep local file' : 'Delete file', incoming: stages[3] ? 'Keep incoming file' : 'Delete file'}];
      } else if (stat && stat.size <= 1024 * 1024) {
        const bytes = await fs.readFile(path.join(root, filename));
        const content = bytes.toString('utf8');
        const parsed = !bytes.includes(0) && Buffer.from(content).equals(bytes) ? parseText(content) : null;
        if (parsed?.conflicts.length) {
          // Marker-looking source can be real student text. Offer no guided
          // choice unless all participating original blobs are marker-free.
          let literalMarkers = false;
          for (const entry of Object.values(stages)) {
            if (Number(await run(root, ['cat-file', '-s', entry.oid])) > 512 * 1024) { literalMarkers = true; break; }
            if (/^(?:<{7}|={7}|>{7}|\|{7})(?:\s|$)/m.test(await run(root, ['cat-file', 'blob', entry.oid]))) { literalMarkers = true; break; }
          }
          if (!literalMarkers) { kind = 'text'; conflicts = parsed.conflicts; }
        }
        else if (bytes.includes(0) || !Buffer.from(content).equals(bytes)) kind = 'binary';
      }
      if (kind === 'binary') conflicts = [{id: 'file', local: 'Keep local file', incoming: 'Keep incoming file'}];
    }
    files.push({path: filename, kind, conflicts, nativeRequired: kind === 'complex'});
  }
  return {id: saved.id, branch: saved.branch, head: saved.head, remote: saved.remote, remoteBranch: saved.remoteBranch, remoteHead: saved.remoteHead, files, nativeRequired: !files.length || files.some(file => file.nativeRequired)};
}
// A post-merge snapshot alone cannot prove ownership: another editor may have
// added work before Git returned its conflict result. Reproduce the pinned merge
// independently in disposable storage, without the project's executable Git
// configuration, and compare exact produced bytes and index before owning abort.
async function preview(current, remoteHead, run) {
  const refs = await run(current.root, ['for-each-ref', '--format=%(refname) %(objectname) %(symref)']);
  const ignored = await run(current.root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-merge-preview-'));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(environment, {GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'});
  const isolated = async (root, args) => {
    const {stdout} = await execute('git', ['-c', `core.hooksPath=${os.devNull}`, '-c', 'commit.gpgSign=false', '-c', 'core.autocrlf=false', '-c', 'core.attributesFile=' + os.devNull, '-c', 'merge.conflictStyle=merge', '-c', 'merge.autoStash=false', '-c', 'rerere.enabled=false', ...args], {cwd: root, env: environment, timeout: 15000, maxBuffer: 1024 * 1024});
    return args.includes('-z') ? stdout : stdout.trim();
  };
  try {
    await isolated(temporary, ['init', '--template=', '--object-format=' + (current.head.length === 64 ? 'sha256' : 'sha1'), '-b', current.branch]);
    await fs.writeFile(path.join(temporary, '.git', 'objects', 'info', 'alternates'), path.join(current.gitDir, 'objects') + '\n');
    await isolated(temporary, ['update-ref', `refs/heads/${current.branch}`, current.head]);
    await isolated(temporary, ['read-tree', '--reset', '-u', current.head]);
    try {
      await isolated(temporary, ['-c', 'user.name=Zero merge preview', '-c', 'user.email=preview@example.invalid', 'merge', '--ff', '--no-gpg-sign', '--no-edit', '--no-commit', remoteHead]);
      return null; // No conflict; no managed recovery provenance is needed.
    } catch (error) { if (error.code !== 1) return null; }
    if (!(await isolated(temporary, ['ls-files', '--unmerged', '-z']))) return null;
    const expected = await snapshot(temporary, isolated, async () => ({...current, root: temporary, gitDir: path.join(temporary, '.git')}));
    return {refs, ignored, index: expected.index, manifest: expected.manifest, markers: expected.markers};
  } catch {
    // Config-dependent, unsupported or unavailable preview stays native. Never
    // adopt the real merge's arbitrary resulting bytes as an abort baseline.
    return null;
  } finally { await fs.rm(temporary, {recursive: true, force: true}); }
}
async function create(current, remoteHead, remoteBranch, run, inspect, expected) {
  const after = await snapshot(current.root, run, inspect);
  if (!expected || after.index !== expected.index || after.refs !== expected.refs || after.ignored !== expected.ignored || JSON.stringify(after.markers) !== JSON.stringify(expected.markers) || JSON.stringify(after.manifest) !== JSON.stringify(expected.manifest)) throw new Error('The merge result could not be verified as unchanged. Your files and edits are preserved. Resolve or cancel carefully in native Source Control; Zero will not offer a managed cancel.');
  if (after.head !== current.head || after.branch !== current.branch || after.remote !== current.remote || after.mainHead !== current.mainHead || (await marker(after.gitDir, 'MERGE_HEAD'))?.trim() !== remoteHead) throw changed();
  // Detect renames on both sides rather than guessing how multi-path conflicts
  // should map to a student's whole-file choice.
  const base = await run(current.root, ['merge-base', current.head, remoteHead]);
  const topology = await Promise.all([current.head, remoteHead].map(head => run(current.root, ['diff', '--name-status', '-M', '-z', base, head])));
  const complex = topology.some(output => nul(output).some(part => /^R\d+$/.test(part)));
  const saved = {version: 2, provenance: 'isolated-merge-preview-v1', id: crypto.randomBytes(16).toString('hex'), root: current.root, gitDir: current.gitDir, branch: current.branch, mainHead: current.mainHead, head: current.head, remote: current.remote, page: current.page, remoteHead, remoteBranch, complex, fingerprint: after.fingerprint};
  await save(current.gitDir, saved);
  return describe(current.root, saved, run);
}
async function pending(root, run, inspect) {
  // Standalone repositories have an ordinary .git directory. No Git invocation
  // or source hashing is needed for the common no-pending sidebar refresh.
  try { if (!(await fs.lstat(path.join(root, '.git'))).isDirectory()) return null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (await marker(path.join(root, '.git'), recordName) === null) return null;
  if (await marker(path.join(root, '.git'), 'MERGE_HEAD') === null) return null;
  const current = await snapshot(root, run, inspect);
  if (await marker(current.gitDir, 'MERGE_HEAD') === null) return null;
  const saved = await readRecord(current.gitDir);
  if (!saved) return null;
  if (saved.root !== current.root || saved.gitDir !== current.gitDir || saved.branch !== current.branch || saved.head !== current.head || saved.mainHead !== current.mainHead || saved.remote !== current.remote || saved.fingerprint !== current.fingerprint || (await marker(current.gitDir, 'MERGE_HEAD'))?.trim() !== saved.remoteHead) throw changed();
  return {saved, current};
}
async function read(root, {run = core.git, inspect}) {
  const value = await pending(root, run, inspect);
  return value ? describe(value.current.root, value.saved, run) : null;
}
async function guarded(root, options) {
  const value = await pending(root, options.run, options.inspect);
  if (!value) throw new Error('There is no managed update to resolve. Check native Source Control.');
  await options.beforeMutation();
  const again = await pending(root, options.run, options.inspect);
  if (!again || again.saved.id !== value.saved.id || again.saved.fingerprint !== value.saved.fingerprint) throw changed();
  return again;
}
async function resolve(root, choice, options) {
  if (!choice || !['local', 'incoming'].includes(choice.side)) throw new Error('Choose the local or incoming conflicting section.');
  const {saved, current} = await guarded(root, options);
  let expectedContent;
  const recovery = await describe(current.root, saved, options.run);
  const file = recovery.files.find(file => file.path === choice.path);
  if (!file || file.kind === 'complex' || !file.conflicts.some(conflict => conflict.id === choice.conflictId)) throw new Error('This conflict needs native Source Control, or the selected section changed.');
  const filename = safePath(file.path); const absolute = path.join(current.root, filename);
  await safeFile(current.root, filename);
  const fresh = await pending(root, options.run, options.inspect);
  if (!fresh || fresh.saved.fingerprint !== saved.fingerprint) throw changed();
  if (file.kind === 'text') {
    const originalContent = await fs.readFile(absolute, 'utf8');
    const parsed = parseText(originalContent);
    if (hash(originalContent) !== current.manifest[filename]?.[1]) throw changed();
    if (!parsed) throw changed();
    const content = parsed.chunks.map(chunk => chunk.conflict?.id === choice.conflictId ? chunk.conflict[choice.side] : chunk.text).join('');
    expectedContent = hash(content);
    // Open the existing regular file without following a replaced final symlink.
    const handle = await fs.open(absolute, require('node:fs').constants.O_WRONLY | require('node:fs').constants.O_NOFOLLOW);
    try { if (!(await handle.stat()).isFile()) throw changed(); await handle.truncate(0); await handle.writeFile(content); }
    finally { await handle.close(); }
    if (parsed.conflicts.length === 1) await options.run(root, ['--literal-pathspecs', 'add', '--', filename]);
  } else {
    const stages = stageEntries(await options.run(root, ['ls-files', '--unmerged', '-z'])).get(filename);
    const stage = choice.side === 'local' ? '2' : '3';
    if (stages[stage]) await options.run(root, ['--literal-pathspecs', 'checkout', choice.side === 'local' ? '--ours' : '--theirs', '--', filename]);
    else if (await safeFile(root, filename)) await fs.unlink(absolute);
    await options.run(root, ['--literal-pathspecs', 'add', '-A', '--', filename]);
  }
  const after = await snapshot(root, options.run, options.inspect);
  assertTransition(current, after, filename);
  if (expectedContent && after.manifest[filename]?.[1] !== expectedContent) throw changed();
  saved.fingerprint = after.fingerprint;
  await save(current.gitDir, saved);
  const remaining = await describe(root, saved, options.run);
  if (remaining.files.length) return {synced: false, recovery: remaining};
  // A fresh authority check is required for the final local merge commit too.
  await guarded(root, options);
  await options.run(root, ['-c', `core.hooksPath=${os.devNull}`, 'commit', '--no-gpg-sign', '--no-edit']);
  const final = await snapshot(root, options.run, options.inspect);
  if (final.status || !sameOutsideCommit(after, final)) throw changed();
  if (await options.run(root, ['rev-list', '--parents', '-n', '1', final.head]) !== `${final.head} ${saved.head} ${saved.remoteHead}`) throw changed();
  await options.run(root, ['merge-base', '--is-ancestor', saved.head, final.head]);
  await options.run(root, ['merge-base', '--is-ancestor', saved.remoteHead, final.head]);
  await fs.unlink(path.join(current.gitDir, recordName));
  return {synced: true, updated: true, branch: final.branch, head: final.head, page: saved.page, remote: saved.remote, remoteBranch: saved.remoteBranch, remoteHead: saved.remoteHead};
}
async function cancel(root, options) {
  const {saved, current} = await guarded(root, options);
  await options.run(root, ['-c', `core.hooksPath=${os.devNull}`, 'merge', '--abort']);
  const final = await snapshot(root, options.run, options.inspect);
  if (final.head !== saved.head || final.branch !== saved.branch || final.status || final.remote !== saved.remote || final.refs !== current.refs) throw changed();
  await fs.unlink(path.join(current.gitDir, recordName));
  return {cancelled: true, branch: final.branch, head: final.head};
}
async function checkpoint(root, options) {
  const before = await snapshot(root, options.run, options.inspect);
  if (!before.status) return {checkpointed: false, branch: before.branch, head: before.head};
  if (await options.run(root, ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'])) throw new Error('Ignored files are tracked. Remove them from Git tracking before making a checkpoint.');
  const message = options.message === undefined ? 'Save local checkpoint before updating' : options.message;
  if (typeof message !== 'string' || !message.trim() || message.includes('\0') || message.length > 500) throw new Error('Enter a short checkpoint message.');
  await options.beforeMutation();
  if ((await snapshot(root, options.run, options.inspect)).fingerprint !== before.fingerprint) throw changed();
  await options.run(root, ['--literal-pathspecs', 'add', '-A', '--', '.']);
  const staged = await snapshot(root, options.run, options.inspect);
  if (staged.sourceFingerprint !== before.sourceFingerprint || !sameContext(before, staged)) throw changed();
  await options.beforeMutation();
  if ((await snapshot(root, options.run, options.inspect)).fingerprint !== staged.fingerprint) throw changed();
  await options.run(root, ['-c', `core.hooksPath=${os.devNull}`, 'commit', '--no-gpg-sign', '-m', message.trim()]);
  const final = await snapshot(root, options.run, options.inspect);
  if (final.status || !sameOutsideCommit(staged, final)) throw changed();
  if (await options.run(root, ['rev-list', '--parents', '-n', '1', final.head]) !== `${final.head}${before.head ? ` ${before.head}` : ''}`) throw changed();
  return {checkpointed: true, branch: final.branch, head: final.head, previousHead: before.head};
}
async function locked(root, options, operation) {
  const exact = await core.assertRepositoryRoot(root, options.run);
  if (!(await fs.lstat(path.join(exact, '.git'))).isDirectory()) throw changed();
  const lock = path.join(exact, '.git', 'zero-update-recovery.lock');
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another local Zero update is running. Wait for it, or use native Source Control if a previous editor stopped unexpectedly.'); throw error; }
  try { return await operation(); }
  finally { await handle.close(); await fs.unlink(lock); }
}
module.exports = {preview, create, read, resolve: (root, choice, options) => locked(root, options, () => resolve(root, choice, options)), cancel: (root, options) => locked(root, options, () => cancel(root, options)), checkpoint: (root, options) => locked(root, options, () => checkpoint(root, options))};
