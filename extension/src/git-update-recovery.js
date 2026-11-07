'use strict';
// All durable recovery data is local to the repository. It contains commit IDs
// and fingerprints, never transport/session credentials. Guided text choices
// also retain displaced files in private recovery folders.
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const core = require('./core');
const filterGuard = require('./git-filter-guard');
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
  run = filterGuard.guardedRunner(run);
  let partial;
  try { partial = await run(root, ['config', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$']); }
  catch (error) { if (error.code !== 1) throw error; }
  if (partial) throw new Error('Use native Source Control for this partial clone. Local checkpoints and recovery require complete local Git history.');
  const current = await inspect(root, run);
  const index = await run(root, ['ls-files', '--stage', '-z']);
  const indexFlags = await run(root, ['ls-files', '-v', '-z']);
  const refs = await run(root, ['for-each-ref', '--format=%(refname) %(objectname) %(symref)']);
  // Replacement objects can make Git display different blob bytes from the
  // object ID later staged. Do not offer managed recovery in that repository.
  if (refs.split('\n').some(line => line.startsWith('refs/replace/'))) throw new Error('Git replacement objects require native Source Control for recovery.');
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
  return {...current, manifest, index, indexFlags, refs, markers, ignored, sourceFingerprint, fingerprint: hash(JSON.stringify([current, index, indexFlags, refs, sourceFingerprint, ignored, markers]))};
}
function sameContext(a, b) {
  return ['root', 'gitDir', 'branch', 'head', 'mainHead', 'remote', 'page', 'worktrees', 'refs', 'ignored'].every(key => a[key] === b[key]) && JSON.stringify(a.markers) === JSON.stringify(b.markers);
}
function outsideIndex(index, filename) {
  return nul(index).filter(line => line.slice(line.indexOf('\t') + 1) !== filename).join('\0');
}
function assertTransition(before, after, filename) {
  const without = manifest => Object.fromEntries(Object.entries(manifest).filter(([name]) => name !== filename));
  const outsideFlags = value => nul(value).filter(row=>row.slice(2)!==filename).join('\0');
  if (!sameContext(before, after) || outsideIndex(before.index, filename) !== outsideIndex(after.index, filename) || outsideFlags(before.indexFlags)!==outsideFlags(after.indexFlags) || JSON.stringify(without(before.manifest)) !== JSON.stringify(without(after.manifest))) throw changed();
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
            if (Number(await run(root, ['--no-replace-objects', 'cat-file', '-s', entry.oid])) > 512 * 1024) { literalMarkers = true; break; }
            if (/^(?:<{7}|={7}|>{7}|\|{7})(?:\s|$)/m.test(await run(root, ['--no-replace-objects', 'cat-file', 'blob', entry.oid]))) { literalMarkers = true; break; }
          }
          if (!literalMarkers) { kind = 'text'; conflicts = parsed.conflicts; }
        }
        else {
          // Git keeps the local worktree version for binary conflicts. Inspect
          // every stage as the incoming or base version alone may be binary.
          const attributes = await fileAttributes(root, filename, run);
          const binaryAttribute = attributes.some(([, name, value]) => name === 'merge' && value === 'unset');
          let binaryStage = false; let oversized = false;
          for (const entry of Object.values(stages)) {
            if (Number(await run(root, ['--no-replace-objects', 'cat-file', '-s', entry.oid])) > 1024 * 1024) { oversized = true; break; }
            const blob = await readBlob(root, entry.oid, 1024 * 1024);
            if (blob.includes(0) || !Buffer.from(blob.toString('utf8')).equals(blob)) binaryStage = true;
          }
          if (!oversized && (binaryAttribute || binaryStage)) kind = 'binary';
        }
      }
      if (kind === 'binary') conflicts = [{id: 'file', local: 'Keep local file', incoming: 'Keep incoming file'}];
    }
    files.push({path: filename, kind, conflicts, nativeRequired: kind === 'complex'});
  }
  const readyToCommit = saved.readyToCommit === true && files.length === 0;
  return {id: saved.id, branch: saved.branch, head: saved.head, remote: saved.remote, remoteBranch: saved.remoteBranch, remoteHead: saved.remoteHead, files, nativeRequired: !readyToCommit && (!files.length || files.some(file => file.nativeRequired)), ...(readyToCommit ? {readyToCommit:true, readyFingerprint:saved.fingerprint} : {})};
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
    // The preview repository has a fresh empty index and worktree. Populate it
    // with a one-tree merge; no reset is needed.
    await isolated(temporary, ['read-tree', '-m', '-u', current.head]);
    try {
      await isolated(temporary, ['-c', 'user.name=Zero merge preview', '-c', 'user.email=preview@example.invalid', 'merge', '--ff', '--no-gpg-sign', '--no-edit', '--no-commit', remoteHead]);
      return null; // No conflict; no managed recovery provenance is needed.
    } catch (error) { if (error.code !== 1) return null; }
    if (!(await isolated(temporary, ['ls-files', '--unmerged', '-z']))) return null;
    const expected = await snapshot(temporary, isolated, async () => ({...current, root: temporary, gitDir: path.join(temporary, '.git')}));
    return {refs, ignored, index: expected.index, indexFlags:expected.indexFlags, manifest: expected.manifest, markers: expected.markers};
  } catch {
    // Config-dependent, unsupported or unavailable preview stays native. Never
    // adopt the real merge's arbitrary resulting bytes as an abort baseline.
    return null;
  } finally { await fs.rm(temporary, {recursive: true, force: true}); }
}
async function create(current, remoteHead, remoteBranch, run, inspect, expected, cancelCapture) {
  const after = await snapshot(current.root, run, inspect);
  if (!expected || after.index !== expected.index || after.indexFlags !== expected.indexFlags || after.refs !== expected.refs || after.ignored !== expected.ignored || JSON.stringify(after.markers) !== JSON.stringify(expected.markers) || JSON.stringify(after.manifest) !== JSON.stringify(expected.manifest)) throw new Error('The merge result could not be verified as unchanged. Your files and edits are preserved. Resolve or cancel carefully in native Source Control; Zero will not offer a managed cancel.');
  if (after.head !== current.head || after.branch !== current.branch || after.remote !== current.remote || after.mainHead !== current.mainHead || (await marker(after.gitDir, 'MERGE_HEAD'))?.trim() !== remoteHead) throw changed();
  if (!cancelCapture || cancelCapture.head!==current.head || cancelCapture.remoteHead!==remoteHead) throw new Error('This conflict has no verified cancellation capture. Use native Source Control.');
  const capture = await readCancelCapture(current.root,cancelCapture);
  if (capture.branch!==current.branch) throw changed();
  const cancelAutoMerge=await marker(current.gitDir,'AUTO_MERGE');
  // Detect renames on both sides rather than guessing how multi-path conflicts
  // should map to a student's whole-file choice.
  const base = await run(current.root, ['merge-base', current.head, remoteHead]);
  const topology = await Promise.all([current.head, remoteHead].map(head => run(current.root, ['diff', '--name-status', '-M', '-z', base, head])));
  const complex = topology.some(output => nul(output).some(part => /^R\d+$/.test(part)));
  if (await marker(current.gitDir,'AUTO_MERGE')!==cancelAutoMerge) throw changed();
  const saved = {version: 2, provenance: 'isolated-merge-preview-v1', id: crypto.randomBytes(16).toString('hex'), root: current.root, gitDir: current.gitDir, branch: current.branch, mainHead: current.mainHead, head: current.head, remote: current.remote, page: current.page, remoteHead, remoteBranch, complex, fingerprint: after.fingerprint,cancelCapture,cancelAutoMerge};
  await save(current.gitDir, saved);
  return describe(current.root, saved, run);
}
async function pending(root, run, inspect) {
  // Standalone repositories have an ordinary .git directory. No Git invocation
  // or source hashing is needed for the common no-pending sidebar refresh.
  try { if (!(await fs.lstat(path.join(root, '.git'))).isDirectory()) return null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (await marker(path.join(root, '.git'), recordName) === null) return null;
  if (await marker(path.join(root, '.git'), 'MERGE_HEAD') === null) {
    const saved=await readRecord(path.join(root,'.git'));
    if(saved?.readyToCommit===true)throw new Error('The update commit may have completed. Inspect project history and Source Control before continuing.');
    return null;
  }
  // Sidebar reads also inspect Git status, which may invoke clean filters.
  await refuseTrackedFilters(root, undefined, run);
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

// Capture an exact pre-merge recovery receipt. The receipt is evidence for a
// future guarded applier, not permission to apply it. In particular, it must be
// bound to the managed merge record by the caller before cancellation is offered.
async function captureRegular(filename, max) {
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > max) throw changed();
  const handle = await fs.open(filename, require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size || stat.mode !== before.mode || stat.mtimeMs !== before.mtimeMs) throw changed();
    const buffer = Buffer.alloc(stat.size + 1); let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await fs.lstat(filename), end = await handle.stat();
    if (length !== stat.size || after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mode !== stat.mode || after.mtimeMs !== stat.mtimeMs || end.size !== stat.size || end.mtimeMs !== stat.mtimeMs) throw changed();
    return {bytes:buffer.subarray(0,length), mode:stat.mode, dev:stat.dev, ino:stat.ino, size:stat.size, mtimeMs:stat.mtimeMs};
  } finally {await handle.close();}
}
async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r');
  try {await handle.sync();} finally {await handle.close();}
}
async function captureCopy(filename, bytes) {
  const handle = await fs.open(filename, 'wx', 0o600);
  try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
  if (hash((await captureRegular(filename, bytes.length)).bytes) !== hash(bytes)) throw changed();
}
async function captureParent(root, filename) {
  let parent = root;
  for (const part of safePath(filename).split('/').slice(0,-1)) {
    parent = path.join(parent,part);
    const stat = await fs.lstat(parent).catch(error=>{if(error.code==='ENOENT' || error.code==='ENOTDIR')throw new Error('Directory changes require native Source Control.');throw error;});
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(parent) !== parent) throw changed();
  }
}
async function captureRepository(root, run) {
  if (Object.keys(process.env).some(key=>/^GIT_/i.test(key) && !['GIT_PAGER','GIT_OPTIONAL_LOCKS','GIT_TERMINAL_PROMPT','GIT_NO_LAZY_FETCH','GIT_NO_REPLACE_OBJECTS'].includes(key.toUpperCase()))) throw new Error('Git environment overrides require native Source Control.');
  const top=await run(root,['rev-parse','--show-toplevel']);
  const git=await run(root,['rev-parse','--absolute-git-dir']);
  const common=await run(root,['rev-parse','--git-common-dir']);
  const index=await run(root,['rev-parse','--git-path','index']);
  if(await fs.realpath(top)!==root || await fs.realpath(git)!==path.join(root,'.git') || await fs.realpath(path.resolve(root,common))!==git || path.resolve(root,index)!==path.join(root,'.git','index'))throw changed();
  const monitor=await run(root,['config','--get','core.fsmonitor']).catch(error=>{if(error.code===1)return '';throw error;});
  if(monitor && monitor.toLowerCase()!=='false')throw new Error('Git filesystem monitor requires native Source Control.');
}
async function prepareCancelCapture(root, remoteHead, options) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  if (process.platform === 'win32') throw new Error('Safe update cancellation capture is not supported on Windows yet. Use native Source Control for this update.');
  if (!oid(remoteHead) || typeof options?.run !== 'function' || typeof options.inspect !== 'function' || typeof options.beforeMutation !== 'function') throw changed();
  await captureRepository(root,options.run);
  await options.beforeMutation();
  const current = await snapshot(root,options.run,options.inspect);
  if (current.root !== root || current.gitDir !== path.join(root,'.git') || await fs.realpath(root) !== root || current.status || current.markers.slice(0,3).some(value=>value !== null)) throw new Error('A clean standalone project without an active merge is required for safe cancellation capture.');
  if (await marker(current.gitDir,'AUTO_MERGE') !== null) throw new Error('An existing merge marker requires native Source Control.');
  const gitStat = await fs.lstat(current.gitDir);
  if (!gitStat.isDirectory() || gitStat.isSymbolicLink() || await fs.realpath(current.gitDir) !== current.gitDir) throw changed();
  // Save actual worktree bytes and the exact index; no conversion or blob
  // materialization is needed to reconstruct the checkpoint.
  if (await options.run(root,['rev-parse','--shared-index-path'])) throw new Error('Split indexes require native Source Control.');
  if (nul(await options.run(root,['ls-files','-v','-z'])).some(row=>!row.startsWith('H '))) throw new Error('Special index flags require native Source Control.');
  const names = [...new Set(nul(await options.run(root,['diff','--no-ext-diff','--no-textconv','--name-only','--no-renames','-z',current.head,remoteHead,'--'])))].sort();
  if (names.length > 10000) throw new Error('Update is too large for safe cancellation capture.');
  const lowered = new Set();
  for (const name of names) {
    safePath(name);
    if (/[\x00-\x1f\x7f]/.test(name) || name.split('/').at(-1)==='.gitattributes' || lowered.has(name.toLowerCase())) throw changed();
    lowered.add(name.toLowerCase());
    await captureParent(root,name);
    for (const commit of [current.head,remoteHead]) {
      const tree = await options.run(root,['--literal-pathspecs','ls-tree','-z',commit,'--',name]);
      if (tree && !/^(?:100644|100755) blob (?:[a-f0-9]{40}|[a-f0-9]{64})\t[^\0]+\0$/.test(tree)) throw new Error('Symbolic links, submodules and directory changes require native Source Control.');
    }
  }
  const overlap = (a,b) => {a=a.toLowerCase();b=b.toLowerCase();return a===b || a.startsWith(b+'/') || b.startsWith(a+'/');};
  const ignored = nul(current.ignored);
  if (names.some(name=>ignored.some(other=>overlap(name,other)))) throw new Error('An ignored path overlaps this update. Use native Source Control.');
  const index = await captureRegular(path.join(current.gitDir,'index'),16*1024*1024);
  let recoveryPath;
  try {
    recoveryPath = await fs.mkdtemp(path.join(current.gitDir,'zero-cancel-recovery-'));
    await fs.chmod(recoveryPath,0o700);await syncDirectory(current.gitDir);
    await captureCopy(path.join(recoveryPath,'index'),index.bytes);
    let originalOrigHead=null;
    if(current.markers[3]!==null) {
      const value=await captureRegular(path.join(current.gitDir,'ORIG_HEAD'),1024*1024);
      if(value.bytes.toString('utf8')!==current.markers[3])throw changed();
      await captureCopy(path.join(recoveryPath,'orig-head'),value.bytes);
      originalOrigHead={copy:'orig-head',sha256:hash(value.bytes),mode:value.mode,size:value.size};
    }
    const files = []; let total = 0;
    for (let i=0;i<names.length;i++) {
      const name = names[i], stat = await safeFile(root,name);
      if (!stat) {files.push({name,missing:true});continue;}
      const file = await captureRegular(path.join(root,name),16*1024*1024);
      total += file.bytes.length;if (total>64*1024*1024) throw new Error('Update is too large for safe cancellation capture.');
      if (!current.manifest[name] || current.manifest[name][0] !== file.mode || current.manifest[name][1] !== hash(file.bytes)) throw changed();
      const copy = `file-${i}`;await captureCopy(path.join(recoveryPath,copy),file.bytes);
      files.push({name,copy,sha256:hash(file.bytes),mode:file.mode,size:file.size});
    }
    await options.beforeMutation();
    const after = await snapshot(root,options.run,options.inspect);
    if (after.fingerprint !== current.fingerprint) throw changed();
    const indexAfter = await captureRegular(path.join(current.gitDir,'index'),16*1024*1024);
    if (hash(index.bytes)!==hash(indexAfter.bytes) || index.mode!==indexAfter.mode) throw changed();
    const manifest = {version:1,kind:'pre-merge-cancel',root,head:current.head,remoteHead,branch:current.branch,fingerprint:current.fingerprint,index:{copy:'index',sha256:hash(index.bytes),mode:index.mode,size:index.size},indexEntries:current.index,indexFlags:current.indexFlags,baseline:current.manifest,ignored:current.ignored,markers:current.markers,originalOrigHead,files};
    const bytes = Buffer.from(JSON.stringify(manifest,null,2)+'\n');
    await captureCopy(path.join(recoveryPath,'manifest.json'),bytes);await syncDirectory(recoveryPath);
    const receipt = {recoveryPath,manifestHash:hash(bytes),head:current.head,remoteHead};
    await readCancelCapture(root,receipt);
    return receipt;
  } catch(error) {if(recoveryPath)error.recoveryPath=recoveryPath;throw error;}
}
async function readCancelCapture(root, receipt) {
  if (!receipt || typeof receipt.recoveryPath !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.manifestHash || '') || !oid(receipt.head) || !oid(receipt.remoteHead) || await fs.realpath(root)!==root) throw changed();
  const gitDir = path.join(root,'.git'), name = path.basename(receipt.recoveryPath);
  if (!/^zero-cancel-recovery-[A-Za-z0-9]+$/.test(name) || receipt.recoveryPath !== path.join(gitDir,name)) throw changed();
  for (const dir of [gitDir,receipt.recoveryPath]) {const stat=await fs.lstat(dir);if(!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(dir)!==dir) throw changed();}
  const raw=(await captureRegular(path.join(receipt.recoveryPath,'manifest.json'),1024*1024)).bytes;
  if(hash(raw)!==receipt.manifestHash)throw changed();
  let manifest;try{manifest=JSON.parse(raw.toString('utf8'));}catch{throw changed();}
  if (!manifest || manifest.version!==1 || manifest.kind!=='pre-merge-cancel' || manifest.root!==root || manifest.head!==receipt.head || manifest.remoteHead!==receipt.remoteHead || typeof manifest.branch!=='string' || !/^[a-f0-9]{64}$/.test(manifest.fingerprint || '') || !Array.isArray(manifest.files) || manifest.files.length>10000 || !manifest.index || manifest.index.copy!=='index' || typeof manifest.indexEntries!=='string' || typeof manifest.indexFlags!=='string' || !manifest.baseline || typeof manifest.baseline!=='object' || Array.isArray(manifest.baseline) || typeof manifest.ignored!=='string' || !Array.isArray(manifest.markers) || manifest.markers.length!==4 || manifest.markers.some(value=>value!==null && typeof value!=='string')) throw changed();
  const check = async (entry,max) => {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Number.isSafeInteger(entry.size) || entry.size<0 || entry.size>max || !Number.isInteger(entry.mode)) throw changed();
    const copy=await captureRegular(path.join(receipt.recoveryPath,entry.copy),max);
    if(copy.size!==entry.size || hash(copy.bytes)!==entry.sha256)throw changed();
  };
  await check(manifest.index,16*1024*1024);
  if(manifest.originalOrigHead!==null) {if(manifest.originalOrigHead?.copy!=='orig-head')throw changed();await check(manifest.originalOrigHead,1024*1024);}
  const seen=new Set();
  for (let i=0;i<manifest.files.length;i++) {
    const file=manifest.files[i];safePath(file?.name);
    if (/[\x00-\x1f\x7f]/.test(file.name) || seen.has(file.name.toLowerCase())) throw changed();
    seen.add(file.name.toLowerCase());
    if (file.missing===true) continue;
    if(file.copy!==`file-${i}`)throw changed();
    await check(file,16*1024*1024);
  }
  return manifest;
}
async function captureJournal(filename, entry) {
  const handle=await fs.open(filename,'a',0o600);
  try {await handle.writeFile(JSON.stringify(entry)+'\n');await handle.sync();} finally {await handle.close();}
}
// Applies only a receipt explicitly bound to this managed merge record. All
// displaced files and operation metadata are kept; failures do not roll back.
async function cancelCaptured(root, options) {
  await captureRepository(root,options.run);
  const {saved,current}=await guarded(root,options);
  const receipt=saved.cancelCapture;
  if (!receipt || receipt.head!==saved.head || receipt.remoteHead!==saved.remoteHead) throw new Error('This update has no bound safe cancellation capture. Use native Source Control.');
  const manifest=await readCancelCapture(root,receipt);
  if (manifest.branch!==saved.branch) throw changed();
  const affected=new Set(manifest.files.map(file=>file.name));
  const outsideIndexRows=value=>nul(value).filter(row=>!affected.has(row.slice(row.indexOf('\t')+1))).join('\0');
  const outsideFiles=value=>Object.fromEntries(Object.entries(value).filter(([name])=>!affected.has(name)));
  if(outsideIndexRows(manifest.indexEntries)!==outsideIndexRows(current.index) || JSON.stringify(outsideFiles(manifest.baseline))!==JSON.stringify(outsideFiles(current.manifest)) || manifest.ignored!==current.ignored)throw new Error('The merge affected additional paths. Use native Source Control.');
  const autoMerge=await marker(current.gitDir,'AUTO_MERGE');
  if (!Object.hasOwn(saved,'cancelAutoMerge') || saved.cancelAutoMerge!==autoMerge) throw changed();
  const directory=receipt.recoveryPath, log=path.join(directory,'cancel-journal.jsonl');
  const indexPath=path.join(current.gitDir,'index');
  const branchRef=`refs/heads/${saved.branch}`;
  safePath(branchRef);await captureParent(current.gitDir,branchRef);
  if(await options.run(root,['symbolic-ref','--quiet','--no-recurse','HEAD'])!==branchRef)throw changed();
  const symbolicBranch=await options.run(root,['symbolic-ref','--quiet','--no-recurse',branchRef]).catch(error=>{if(error.code===1)return '';throw error;});
  if(symbolicBranch)throw new Error('Symbolic branch references require native Source Control.');
  const heldLocks=[];let started=false;
  const acquire=async filename=>{const handle=await fs.open(filename,'wx',0o600);const identity=await handle.stat();heldLocks.push({filename,handle,identity});};
  const checkContext=async()=>{
    await options.beforeMutation();
    await captureRepository(root,options.run);
    for(const lock of heldLocks){const now=await fs.lstat(lock.filename);if(!now.isFile() || now.dev!==lock.identity.dev || now.ino!==lock.identity.ino)throw changed();}
    const now=await options.inspect(root,options.run);
    if(now.root!==current.root || now.gitDir!==current.gitDir || now.branch!==current.branch || now.head!==current.head || now.mainHead!==current.mainHead || now.remote!==current.remote || now.page!==current.page || now.worktrees!==current.worktrees || await options.run(root,['symbolic-ref','--quiet','--no-recurse','HEAD'])!==branchRef || await options.run(root,['for-each-ref','--format=%(refname) %(objectname) %(symref)'])!==current.refs)throw changed();
  };
  try {
    // Acquire all cooperating Git locks before creating a journal. A lock
    // contention failure must leave the existing capture available for retry.
    await acquire(path.join(current.gitDir,'HEAD.lock'));
    await acquire(path.join(current.gitDir,`${branchRef}.lock`));
    await acquire(path.join(current.gitDir,'ORIG_HEAD.lock'));
    await acquire(path.join(current.gitDir,'index.lock'));
    if((await pending(root,options.run,options.inspect))?.saved.fingerprint!==saved.fingerprint)throw changed();
    await checkContext();
    const priorAttempt=()=>new Error('An earlier cancellation attempt left recovery data. Inspect the retained folder before continuing in native Source Control.');
    try {await fs.lstat(log);throw priorAttempt();} catch(error) {if(error.code!=='ENOENT')throw error;}
    const currentIndex=await captureRegular(indexPath,16*1024*1024);
    const mergeIndex=path.join(directory,'merge-index');
    let existing;
    try {existing=await captureRegular(mergeIndex,16*1024*1024);}
    catch(error) {if(error.code!=='ENOENT')throw priorAttempt();}
    if(existing) {
      if(!existing.bytes.equals(currentIndex.bytes))throw priorAttempt();
      // A completed, identical copy with no journal can be reused after an
      // interruption. Sync it ourselves: the previous process might have
      // stopped before flushing its write. Never overwrite an unknown copy.
      try {
        const copy=await fs.open(mergeIndex,require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0));
        try {
          const same=stat=>stat.isFile() && stat.nlink===1 && stat.dev===existing.dev && stat.ino===existing.ino && stat.mode===existing.mode && stat.size===existing.size && stat.mtimeMs===existing.mtimeMs;
          if(!same(await copy.stat()))throw changed();
          await copy.sync();
          if(!same(await copy.stat()))throw changed();
        } finally {await copy.close();}
        const verified=await captureRegular(mergeIndex,16*1024*1024);
        if(verified.dev!==existing.dev || verified.ino!==existing.ino || verified.mode!==existing.mode || verified.mtimeMs!==existing.mtimeMs || !verified.bytes.equals(currentIndex.bytes))throw changed();
        await syncDirectory(directory);
      } catch {throw priorAttempt();}
    } else await captureCopy(mergeIndex,currentIndex.bytes);
    await captureCopy(log,Buffer.from(JSON.stringify({event:'start',head:saved.head,remoteHead:saved.remoteHead,mergeIndexHash:hash(currentIndex.bytes),capture:receipt.manifestHash})+'\n'));
    await syncDirectory(directory);started=true;
    const targetIndex=(await captureRegular(path.join(directory,'index'),16*1024*1024)).bytes;
    if(hash(targetIndex)!==manifest.index.sha256)throw changed();
    const stagedIndex=path.join(directory,'staged-index');await captureCopy(stagedIndex,targetIndex);
    const stagedHandle=await fs.open(stagedIndex,'r+');try{await stagedHandle.chmod(manifest.index.mode & 0o777);await stagedHandle.sync();}finally{await stagedHandle.close();}
    if((await pending(root,options.run,options.inspect))?.saved.fingerprint!==saved.fingerprint)throw changed();
    await checkContext();
    for(let i=0;i<manifest.files.length;i++) {
      const entry=manifest.files[i], filename=path.join(root,entry.name), expected=current.manifest[entry.name];
      await checkContext();await captureParent(root,entry.name);
      if(options._testBeforeCancelStep)await options._testBeforeCancelStep(`file-${i}`);
      const stat=await safeFile(root,entry.name);
      if(Boolean(stat)!==Boolean(expected))throw changed();
      if(stat) {
        const live=await captureRegular(filename,16*1024*1024);
        if(live.mode!==expected[0] || hash(live.bytes)!==expected[1])throw changed();
        await captureJournal(log,{event:'move-intent',index:i,name:entry.name});
        const moved=path.join(directory,`moved-${i}`);
        await fs.rename(filename,moved);await syncDirectory(path.dirname(filename));await syncDirectory(directory);
        const retained=await captureRegular(moved,16*1024*1024);
        if(retained.dev!==live.dev || retained.ino!==live.ino || retained.mode!==live.mode || hash(retained.bytes)!==hash(live.bytes))throw changed();
        await captureJournal(log,{event:'moved',index:i,sha256:hash(retained.bytes)});
        if(options._testBeforeCancelStep)await options._testBeforeCancelStep(`after-move-${i}`);
      }
      if(!entry.missing) {
        const bytes=(await captureRegular(path.join(directory,entry.copy),16*1024*1024)).bytes;
        if(hash(bytes)!==entry.sha256)throw changed();
        await captureJournal(log,{event:'install-intent',index:i,name:entry.name});
        const out=await fs.open(filename,'wx',entry.mode & 0o777);
        try {await out.writeFile(bytes);await out.chmod(entry.mode & 0o777);await out.sync();} finally {await out.close();}
        await syncDirectory(path.dirname(filename));
        await captureJournal(log,{event:'installed',index:i,sha256:entry.sha256});
      }
    }
    await checkContext();
    if(options._testBeforeCancelStep)await options._testBeforeCancelStep('before-index');
    for(const entry of manifest.files) {
      const stat=await safeFile(root,entry.name);
      if(entry.missing) {if(stat)throw changed();}
      else {const now=await captureRegular(path.join(root,entry.name),16*1024*1024);if(now.mode!==entry.mode || hash(now.bytes)!==entry.sha256)throw changed();}
    }
    const beforeIndex=await captureRegular(indexPath,16*1024*1024);
    if(beforeIndex.dev!==currentIndex.dev || beforeIndex.ino!==currentIndex.ino || hash(beforeIndex.bytes)!==hash(currentIndex.bytes))throw changed();
    await captureJournal(log,{event:'index-intent'});await checkContext();
    const staged=await captureRegular(stagedIndex,16*1024*1024);
    if(hash(staged.bytes)!==manifest.index.sha256 || (staged.mode & 0o777)!==(manifest.index.mode & 0o777))throw changed();
    await fs.rename(stagedIndex,indexPath);await syncDirectory(current.gitDir);await captureJournal(log,{event:'index-installed'});
    await checkContext();
    // Move the exact metadata aside instead of deleting it. A partial cleanup
    // remains inspectable, and a later writer's inode is never discarded.
    if (await marker(current.gitDir,'AUTO_MERGE')!==autoMerge) throw changed();
    for (let i=0;i<4;i++) {
      const name=['MERGE_HEAD','MERGE_MSG','MERGE_MODE','AUTO_MERGE'][i], expected=i<3?current.markers[i]:autoMerge;
      if(expected===null){if(await marker(current.gitDir,name)!==null)throw changed();continue;}
      const filename=path.join(current.gitDir,name), before=await captureRegular(filename,1024*1024);
      if(before.bytes.toString('utf8')!==expected)throw changed();
      await captureJournal(log,{event:'metadata-intent',name});
      const target=path.join(directory,`metadata-${name}`);await fs.rename(filename,target);await syncDirectory(current.gitDir);await syncDirectory(directory);
      const moved=await captureRegular(target,1024*1024);
      if(moved.dev!==before.dev || moved.ino!==before.ino || hash(moved.bytes)!==hash(before.bytes))throw changed();
      await captureJournal(log,{event:'metadata-moved',name});
    }
    const origPath=path.join(current.gitDir,'ORIG_HEAD');
    if(await marker(current.gitDir,'ORIG_HEAD')!==current.markers[3])throw changed();
    if(current.markers[3]!==null) {
      const before=await captureRegular(origPath,1024*1024);
      if(before.bytes.toString('utf8')!==current.markers[3])throw changed();
      await captureJournal(log,{event:'metadata-intent',name:'ORIG_HEAD'});
      const movedPath=path.join(directory,'metadata-ORIG_HEAD');await fs.rename(origPath,movedPath);await syncDirectory(current.gitDir);await syncDirectory(directory);
      const moved=await captureRegular(movedPath,1024*1024);
      if(moved.dev!==before.dev || moved.ino!==before.ino || hash(moved.bytes)!==hash(before.bytes))throw changed();
      await captureJournal(log,{event:'metadata-moved',name:'ORIG_HEAD'});
    }
    if(manifest.originalOrigHead) {
      const entry=manifest.originalOrigHead, bytes=(await captureRegular(path.join(directory,entry.copy),1024*1024)).bytes;
      if(hash(bytes)!==entry.sha256)throw changed();
      await captureJournal(log,{event:'metadata-restore-intent',name:'ORIG_HEAD'});
      const out=await fs.open(origPath,'wx',entry.mode & 0o777);
      try{await out.writeFile(bytes);await out.chmod(entry.mode & 0o777);await out.sync();}finally{await out.close();}
      await syncDirectory(current.gitDir);await captureJournal(log,{event:'metadata-restored',name:'ORIG_HEAD'});
    }
    await checkContext();
    const recordPath=path.join(current.gitDir,recordName),record=await captureRegular(recordPath,1024*1024);
    if(JSON.stringify(JSON.parse(record.bytes.toString('utf8')))!==JSON.stringify(saved))throw changed();
    await captureJournal(log,{event:'record-intent'});
    await fs.rename(recordPath,path.join(directory,'metadata-record'));await syncDirectory(current.gitDir);await syncDirectory(directory);
    const recordMoved=await captureRegular(path.join(directory,'metadata-record'),1024*1024);
    if(recordMoved.dev!==record.dev || recordMoved.ino!==record.ino || hash(recordMoved.bytes)!==hash(record.bytes))throw changed();
    await checkContext();
    const final=await snapshot(root,options.run,options.inspect);
    if(final.status || final.head!==saved.head || final.branch!==saved.branch || final.refs!==current.refs || final.index!==manifest.indexEntries || final.indexFlags!==manifest.indexFlags || final.ignored!==manifest.ignored || JSON.stringify(final.manifest)!==JSON.stringify(manifest.baseline) || JSON.stringify(final.markers)!==JSON.stringify(manifest.markers) || await marker(current.gitDir,'AUTO_MERGE')!==null)throw changed();
    await captureJournal(log,{event:'complete'});
    return {cancelled:true,branch:saved.branch,head:saved.head,recoveryPath:directory};
  } catch(error) {
    if(started || receipt?.recoveryPath) error.recoveryPath=directory;
    throw error;
  } finally {
    for(const lock of heldLocks.reverse()) {
      await lock.handle.close().catch(()=>{});
      try {const now=await fs.lstat(lock.filename);if(now.dev===lock.identity.dev && now.ino===lock.identity.ino)await fs.unlink(lock.filename);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
}
// Retain the actual displaced inode before installing a choice. The private
// folder survives ordinary interruption; this is not atomic with other writers.
async function replaceChoice(current, filename, expectedHash, content, mode, selectedMode = false, expectedMode) {
  const absolute = path.join(current.root, filename);
  const original = await safeFile(current.root, filename);
  if (Boolean(original) !== Boolean(expectedHash) || (original && (!original.isFile() || original.isSymbolicLink() || original.nlink !== 1 || (expectedMode !== undefined && original.mode !== expectedMode)))) throw changed();
  if (content !== null && (mode & 0o100 & process.umask()) !== 0) throw new Error('The process umask prevents the selected executable mode. Use native Source Control.');
  const recovery = await fs.mkdtemp(path.join(current.gitDir, 'zero-text-recovery-'));
  await fs.chmod(recovery, 0o700);
  await fs.writeFile(path.join(recovery, 'manifest.json'), JSON.stringify({version: 1, path: filename, original: original ? 'original' : null, expectedHash: expectedHash || null, mode: original ? original.mode & 0o777 : null}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  let moved = false, attemptedInstall = false;
  try {
    const before = await safeFile(current.root, filename);
    if (Boolean(before) !== Boolean(original) || (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.dev !== original.dev || before.ino !== original.ino))) throw changed();
    if (original) {
      const displaced = path.join(recovery, 'original');
      await fs.rename(absolute, displaced); moved = true;
      const handle = await fs.open(displaced, require('node:fs').constants.O_RDONLY | require('node:fs').constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat(); const bytes = await handle.readFile(); const after = await handle.stat();
        await fs.writeFile(path.join(recovery, 'observed.json'), JSON.stringify({hash: hash(bytes), size: bytes.length, dev: stat.dev, ino: stat.ino, mode: stat.mode, mtimeMs: stat.mtimeMs}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
        if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== original.dev || stat.ino !== original.ino || stat.mode !== original.mode || stat.size !== original.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || hash(bytes) !== expectedHash) throw changed();
      } finally { await handle.close(); }
    }
    if (content !== null) {
      // Preserve existing read/write restrictions and let the process umask
      // constrain new files. Refuse an executable choice the umask masks out.
      let createMode = mode & (original ? original.mode : 0o777);
      // Git tracks owner executability, not group/other access. A selected
      // executable may add owner execute, but never other permissions.
      if (selectedMode && (mode & 0o100)) createMode |= 0o100;
      attemptedInstall = true;
      const handle = await fs.open(absolute, 'wx', createMode);
      try { await handle.writeFile(content); } finally { await handle.close(); }
    } else if (await safeFile(current.root, filename)) throw changed();
    return recovery;
  } catch (error) {
    if (moved || attemptedInstall) {
      const failure = new Error(`The conflict choice stopped. Your displaced file is retained at ${recovery}; inspect it before continuing.`, {cause: error});
      failure.recoveryPath = recovery; throw failure;
    }
    throw error;
  }
}
async function fileAttributes(root, filename, run) {
  const value = await run(root, ['--literal-pathspecs', 'check-attr', '-z', '-a', '--', filename]);
  const fields = value ? value.split('\0').filter(Boolean) : [];
  if (fields.length % 3) throw changed();
  const attributes = [];
  for (let i = 0; i < fields.length; i += 3) {
    if (fields[i] !== filename) throw changed();
    attributes.push(fields.slice(i, i + 3));
  }
  return attributes;
}
async function refuseFilters(root, filename, run) {
  const attributes = await fileAttributes(root, filename, run);
  if (attributes.some(([, name, value]) => name === 'filter' && !['unset', 'unspecified'].includes(value))) throw new Error('Git filters require native Source Control for this conflict choice.');
  return attributes;
}
async function refuseTrackedFilters(root, filename, run) {
  await filterGuard.refuseFilters(root, run, {extra:filename === undefined ? [] : [safePath(filename)]});
}
async function textConversionGuard(root, filename, content, run) {
  const attributes = await refuseFilters(root, filename, run);
  if (attributes.some(([, name, value]) => !(name === 'text' && value === 'auto'))) throw new Error('Git attributes require native Source Control for this text choice.');
  let autocrlf;
  try { autocrlf = await run(root, ['config', '--get', 'core.autocrlf']); }
  catch (error) { if (error.code !== 1) throw error; }
  if (autocrlf && autocrlf.toLowerCase() !== 'false') throw new Error('Git line-ending conversion requires native Source Control for this text choice.');
  if (attributes.length && content.includes('\r')) throw new Error('Git text conversion requires native Source Control for this text choice.');
}
async function readBlob(root, id, maxBuffer) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, {GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0'});
  return (await execute('git', ['--no-replace-objects', 'cat-file', 'blob', id], {cwd: root, env, encoding: 'buffer', timeout: 15000, maxBuffer})).stdout;
}
async function stageBlob(root, entry, filename, run) {
  // Refuse worktree conversions; installing raw object bytes must correspond to
  // the selected stage on this machine, without invoking filters.
  const attributes = await fileAttributes(root, filename, run);
  const textAuto = attributes.length === 1 && attributes[0][1] === 'text' && attributes[0][2] === 'auto';
  const binaryAttributes = attributes.length > 0 && attributes.every(([, name, value]) => (['text', 'merge', 'diff'].includes(name) && value === 'unset') || (name === 'binary' && value === 'set'));
  if (attributes.length && !textAuto && !binaryAttributes) throw new Error('Git attributes require native Source Control for this whole-file choice.');
  let autocrlf;
  try { autocrlf = await run(root, ['config', '--get', 'core.autocrlf']); }
  catch (error) { if (error.code !== 1) throw error; }
  if (autocrlf && autocrlf.toLowerCase() !== 'false') throw new Error('Git line-ending conversion requires native Source Control for this whole-file choice.');
  if (Number(await run(root, ['--no-replace-objects', 'cat-file', '-s', entry.oid])) > 16 * 1024 * 1024) throw new Error('This file is too large for a guided choice. Use native Source Control.');
  const bytes = await readBlob(root, entry.oid, 16 * 1024 * 1024);
  if (textAuto && !bytes.subarray(0, 8000).includes(0)) throw new Error('Git text conversion requires native Source Control for this whole-file choice.');
  return bytes;
}
async function resolve(root, choice, options) {
  if (!choice || !['local', 'incoming'].includes(choice.side)) throw new Error('Choose the local or incoming conflicting section.');
  // Check before status/snapshot: Git status may itself invoke clean filters.
  await refuseTrackedFilters(root, choice.path, options.run);
  const {saved, current} = await guarded(root, options);
  let expectedContent, expectedIndex;
  const recovery = await describe(current.root, saved, options.run);
  const file = recovery.files.find(file => file.path === choice.path);
  if (!file || file.kind === 'complex' || !file.conflicts.some(conflict => conflict.id === choice.conflictId)) throw new Error('This conflict needs native Source Control, or the selected section changed.');
  const filename = safePath(file.path); const absolute = path.join(current.root, filename);
  await safeFile(current.root, filename);
  const fresh = await pending(root, options.run, options.inspect);
  if (!fresh || fresh.saved.fingerprint !== saved.fingerprint) throw changed();
  let displacedRecovery;
  try {
  if (file.kind === 'text') {
    const originalContent = await fs.readFile(absolute, 'utf8');
    const parsed = parseText(originalContent);
    if (hash(originalContent) !== current.manifest[filename]?.[1]) throw changed();
    if (!parsed) throw changed();
    const content = parsed.chunks.map(chunk => chunk.conflict?.id === choice.conflictId ? chunk.conflict[choice.side] : chunk.text).join('');
    await textConversionGuard(root, filename, content, options.run);
    expectedContent = hash(content);
    displacedRecovery = await replaceChoice(current, filename, current.manifest[filename][1], content, current.manifest[filename][0] & 0o777, false, current.manifest[filename][0]);
    if (parsed.conflicts.length === 1) {
      await textConversionGuard(root, filename, content, options.run);
      // Hash raw bytes, without invoking clean filters, then stage exactly that
      // object. Verify both the object and the resulting index before commit.
      const bytes = Buffer.from(content);
      const algorithm = saved.head.length === 64 ? 'sha256' : 'sha1';
      const expectedOid = crypto.createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      const actualOid = await options.run(root, ['--literal-pathspecs', 'hash-object', '-w', '--no-filters', '--', filename]);
      if (actualOid !== expectedOid) throw changed();
      const stages = stageEntries(await options.run(root, ['ls-files', '--unmerged', '-z'])).get(filename);
      if (!stages?.[2]) throw changed();
      let filemode;
      try { filemode = await options.run(root, ['config', '--get', 'core.filemode']); }
      catch (error) { if (error.code !== 1) throw error; }
      const mode = filemode?.toLowerCase() === 'false' ? stages[2].mode : (current.manifest[filename][0] & 0o100 ? '100755' : '100644');
      expectedIndex = `${mode} ${expectedOid} 0\t${filename}`;
      await options.run(root, ['--literal-pathspecs', 'update-index', '--add', '--cacheinfo', `${mode},${expectedOid},${filename}`]);
      await textConversionGuard(root, filename, content, options.run);
    }
  } else {
    const stages = stageEntries(await options.run(root, ['ls-files', '--unmerged', '-z'])).get(filename);
    if (!stages) throw changed();
    const entry = stages[choice.side === 'local' ? '2' : '3'];
    expectedIndex = entry ? `${entry.mode} ${entry.oid} 0\t${filename}` : null;
    const content = entry ? await stageBlob(root, entry, filename, options.run) : null;
    expectedContent = content === null ? null : hash(content);
    displacedRecovery = await replaceChoice(current, filename, current.manifest[filename]?.[1], content, entry?.mode === '100755' ? 0o755 : 0o644, true, current.manifest[filename]?.[0]);
    if (entry) await options.run(root, ['--literal-pathspecs', 'update-index', '--add', '--cacheinfo', `${entry.mode},${entry.oid},${filename}`]);
    else await options.run(root, ['--literal-pathspecs', 'update-index', '--force-remove', '--', filename]);

  }
  await refuseTrackedFilters(root, filename, options.run);
  const after = await snapshot(root, options.run, options.inspect);
  assertTransition(current, after, filename);
  // A selected path can change stage during the choice, but it must never
  // acquire assume-unchanged or skip-worktree (or other special) flags.
  if(nul(after.indexFlags).some(row=>!row.startsWith('H ') && !row.startsWith('M ')))throw changed();
  if (file.kind !== 'text' || expectedIndex !== undefined) {
    const selected = nul(after.index).filter(row => row.slice(row.indexOf('\t') + 1) === filename);
    if (expectedIndex === null ? selected.length !== 0 : selected.length !== 1 || selected[0] !== expectedIndex) throw changed();
  }
  if (expectedContent === null ? Boolean(after.manifest[filename]) : expectedContent && after.manifest[filename]?.[1] !== expectedContent) throw changed();
  saved.fingerprint = after.fingerprint;
  const remaining = await describe(root, saved, options.run);
  saved.readyToCommit = remaining.files.length === 0;
  await save(current.gitDir, saved);
  if (remaining.files.length) return {synced: false, recovery: remaining};
  return await complete(root, options, saved.id, saved.fingerprint);
  } catch (error) {
    if (displacedRecovery && !error.recoveryPath) {
      const failure = new Error(`The conflict choice stopped. Recovery data is retained at ${displacedRecovery}; inspect it before continuing.`, {cause: error});
      failure.recoveryPath = displacedRecovery; throw failure;
    }
    throw error;
  }
}
async function complete(root, options, expectedId, expectedFingerprint) {
  await refuseTrackedFilters(root, undefined, options.run);
  const {saved,current}=await guarded(root, options);
  if(saved.readyToCommit!==true || saved.id!==expectedId || saved.fingerprint!==expectedFingerprint || (await describe(root,saved,options.run)).files.length)throw changed();
  await refuseTrackedFilters(root, undefined, options.run);
  const again=await guarded(root, options);
  if(again.saved.readyToCommit!==true || again.saved.id!==expectedId || again.saved.fingerprint!==expectedFingerprint || (await options.run(root,['ls-files','--unmerged','-z'])))throw changed();
  try {await options.run(root, ['-c', `core.hooksPath=${os.devNull}`, 'commit', '--no-gpg-sign', '--no-edit']);}
  catch(error) {throw new Error('The update commit did not finish. Review the update in the sidebar; if its outcome is uncertain, inspect history and Source Control before continuing.',{cause:error});}
  const final = await snapshot(root, options.run, options.inspect);
  if (final.status || !sameOutsideCommit(current, final)) throw changed();
  if (await options.run(root, ['rev-list', '--parents', '-n', '1', final.head]) !== `${final.head} ${saved.head} ${saved.remoteHead}`) throw changed();
  await options.run(root, ['merge-base', '--is-ancestor', saved.head, final.head]);
  await options.run(root, ['merge-base', '--is-ancestor', saved.remoteHead, final.head]);
  await fs.unlink(path.join(current.gitDir, recordName));
  return {synced:true,updated:true,branch:final.branch,head:final.head,page:saved.page,remote:saved.remote,remoteBranch:saved.remoteBranch,remoteHead:saved.remoteHead};
}
async function checkpoint(root, options) {
  const before = await snapshot(root, options.run, options.inspect);
  if (!before.status) return {checkpointed: false, branch: before.branch, head: before.head};
  if (await options.run(root, ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'])) throw new Error('Ignored files are tracked. Remove them from Git tracking before making a checkpoint.');
  const message = options.message === undefined ? 'Save local checkpoint before updating' : options.message;
  if (typeof message !== 'string' || !message.trim() || message.includes('\0') || message.length > 500) throw new Error('Enter a short checkpoint message.');
  await options.beforeMutation();
  if ((await snapshot(root, options.run, options.inspect)).fingerprint !== before.fingerprint) throw changed();
  await filterGuard.guardedRunner(options.run)(root, ['--literal-pathspecs', 'add', '-A', '--', '.']);
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
const cancelUnavailable=async()=>{throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');};
module.exports = {preview, create, read, prepareCancelCapture, readCancelCapture, cancelCaptured: cancelUnavailable, resolve: cancelUnavailable, complete: (root, id, fingerprint, options) => locked(root, options, () => complete(root, options, id, fingerprint)), cancel: cancelUnavailable, checkpoint: (root, options) => locked(root, options, () => checkpoint(root, options))};
