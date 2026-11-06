'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./core');
const recovery = require('./git-update-recovery');
const os = require('node:os');
const crypto = require('node:crypto');
const {createReadStream} = require('node:fs');
const {assertShareable} = require('./lesson-projects');
const {prepareUpload, assertNoUrlRewrites} = require('./github');
const plans = new WeakSet();
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const drift = () => new Error('The project, branch, main, repository, or files changed after review. Review this step again. Your commits are preserved.');
function safeRunner(run) {
  return async (root, args) => {
    try { return await run(root, args); }
    catch (failure) {
      const error = new Error('Git could not inspect or update this project. Check native Source Control, then review again. Your files and commits are preserved.');
      error.code = failure.code;
      throw error;
    }
  };
}

async function local(run, root, args, action) {
  try { return await run(root, args); }
  catch { throw new Error(`Git could not ${action}. Check native Source Control, then review again. Your files and commits are preserved.`); }
}
async function ancestor(run, root, older, newer) {
  try { await run(root, ['merge-base', '--is-ancestor', older, newer]); return true; }
  catch (error) { if (error.code === 1) return false; throw new Error('Git could not check commit ancestry. Check this project with native Source Control.'); }
}
// Local branch creation keeps the same tree. Inspect refs and worktree state without
// reading every asset; source hashing belongs at content-changing boundaries.
async function state(project, run, {full = false, connected = false, allowMerge = false} = {}) {
  const root = await core.assertRepositoryRoot(project, run);
  if (!(await fs.stat(path.join(root, 'zero.json'))).isFile()) throw new Error('Open a standalone student project containing zero.json.');
  const gitDir = await run(root, ['rev-parse', '--absolute-git-dir']);
  const commonDir = await run(root, ['rev-parse', '--git-common-dir']);
  const worktrees = (await run(root, ['worktree', 'list', '--porcelain'])).split('\n').filter(line => line.startsWith('worktree ')).join('\n');
  if (await fs.realpath(path.resolve(root, commonDir)) !== await fs.realpath(gitDir) ||
      worktrees.split('\n').filter(line => line.startsWith('worktree ')).length !== 1) {
    throw new Error('This project uses multiple Git worktrees. Use a standalone student repository for New branch and Merge to main.');
  }
  for (const marker of [...(allowMerge ? [] : ['MERGE_HEAD']), 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG']) {
    try { await fs.access(path.join(gitDir, marker)); throw new Error('Finish or cancel the current Git merge, rebase, or other operation before continuing.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let branch;
  try { branch = await run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']); }
  catch { throw new Error('This project has a detached HEAD. Switch to your student branch before continuing.'); }
  if (!branch || branch.startsWith('-')) throw new Error('Choose a normal named Git branch.');
  let head = null, mainHead = null;
  try { head = await run(root, ['rev-parse', '--verify', 'HEAD^{commit}']); }
  catch (error) { if (error.code !== 128) throw error; }
  try { mainHead = await run(root, ['rev-parse', '--verify', 'refs/heads/main^{commit}']); }
  catch (error) { if (error.code !== 128) throw new Error('Git could not inspect main. Check native Source Control.'); }
  if (head && !shaPattern.test(head) || mainHead && !shaPattern.test(mainHead)) throw new Error('Git returned an unexpected commit. Check native Source Control.');
  await assertNoUrlRewrites(root, run);
  let repository = {page: null, remote: null};
  const remotes = (await run(root, ['remote'])).split('\n');
  if (remotes.includes('origin')) {
    const urls = (await run(root, ['remote', 'get-url', '--all', 'origin'])).split('\n');
    const pushUrls = (await run(root, ['remote', 'get-url', '--push', '--all', 'origin'])).split('\n');
    if (urls.length !== 1 || pushUrls.length !== 1) throw new Error('Origin has multiple destinations. Use one GitHub HTTPS repository for fetching and pushing.');
    repository = core.parseRepositoryUrl(urls[0]);
    if (core.parseRepositoryUrl(pushUrls[0]).remote !== repository.remote) throw new Error('Origin pushes to a different repository. Correct its push URL before continuing.');
  } else if (connected || full) throw new Error('Connect this student project to its GitHub repository before syncing or merging.');
  const status = await run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if ((await run(root, ['ls-files', '--stage', '-z'])).split('\0').some(entry => entry.startsWith('160000 '))) throw new Error('Nested repositories or submodules are not supported. Open a standalone student project.');
  const current = {root, ...repository, branch, head, mainHead, status, gitDir: await fs.realpath(gitDir), worktrees};
  if (!full) return current;
  const source = await prepareUpload(root, run);
  if (!['root', 'page', 'remote', 'branch', 'head', 'status'].every(key => source[key] === current[key])) throw drift();
  return {...source, ...current};
}
// Only dirty branch creation needs a content snapshot: the student confirms
// carrying these exact edits, and changes during the prompt require a retry.
async function startFingerprint(current, run) {
  const digest = crypto.createHash('sha256');
  digest.update(await run(current.root, ['ls-files', '--stage', '-z']));
  const records = current.status.split('\0').filter(Boolean);
  for (let i = 0; i < records.length; i++) {
    const record = records[i], kind = record.slice(0, 2);
    const names = [record.slice(3)];
    if (/[RC]/.test(kind)) names.push(records[++i]);
    for (const name of names) {
      const file = path.resolve(current.root, name);
      if (!file.startsWith(`${current.root}${path.sep}`)) throw new Error('Git includes a path outside the student project.');
      digest.update(JSON.stringify(name));
      try {
        const info = await fs.lstat(file);
        digest.update(JSON.stringify([info.mode, info.size]));
        if (info.isSymbolicLink()) digest.update(await fs.readlink(file));
        else if (info.isFile()) for await (const chunk of createReadStream(file)) digest.update(chunk);
        else throw new Error('A changed path is not a regular file. Check native Source Control.');
      } catch (error) { if (error.code === 'ENOENT') digest.update('missing'); else throw error; }
    }
  }
  return digest.digest('hex');
}
function clean(current) {
  if (!current.head) throw new Error('Save the initial project as a local commit on main using Source Control → Commit, then try New branch again. Pushing is not required.');
  if (current.status) throw new Error('Save your changes as a local commit using Source Control → Commit, then try again. Pushing is not required.');
  if (!current.mainHead) throw new Error('This project needs a committed main branch. Save the initial project as a local commit on main using Source Control → Commit. Pushing is not required.');
}
function same(a, b) {
  return ['root', 'page', 'remote', 'branch', 'head', 'mainHead', 'status', 'gitDir', 'worktrees'].every(key => a[key] === b[key]);
}
async function recheck(expected, run, {full = false} = {}) {
  const current = await state(expected.root, run, {full});
  if (!same(expected, current) || full && expected.fingerprint !== current.fingerprint) throw drift();
  return current;
}
function networkRequired(networkRun) {
  if (typeof networkRun !== 'function') throw new Error('Sign in to GitHub and review this step using the native GitHub connection.');
}
async function network(networkRun, root, args) {
  try { return await networkRun(root, args); }
  catch (error) {
    const detail = String(error.stderr || error.message || '');
    if (/non-fast-forward|fetch first|rejected.*behind|changes missing locally/i.test(detail)) throw Object.assign(new Error('GitHub main changed and refused this upload. Your feature remains checked out and your commits are preserved. Update from main, run the app, then merge again.'),{kind:'behind'});
    throw Object.assign(new Error('GitHub could not complete this step. Check your native GitHub sign-in, repository access and network, then review again. Your feature and commits are preserved; no upload was confirmed.'),{kind:error.kind||'network'});
  }
}
async function remoteBranch(current, branch, networkRun) {
  const ref = `refs/heads/${branch}`;
  const output = await network(networkRun, current.root, ['ls-remote', '--heads', current.remote, ref]);
  if (!output) return null;
  const rows = output.split('\n').filter(Boolean);
  if (rows.length !== 1 || !shaPattern.test(rows[0].split('\t')[0]) || rows[0].split('\t')[1] !== ref || rows[0].split('\t').length !== 2) throw new Error('GitHub returned an unexpected branch. Review the repository again.');
  return rows[0].split('\t')[0];
}
async function remoteMain(current, networkRun) { return remoteBranch(current, 'main', networkRun); }
async function validName(name, root, run) {
  // Keep names understandable and unambiguous; never accept an option or ref expression.
  if (typeof name !== 'string' || name.length > 80 || !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(name) || name === 'main') throw new Error('Name your feature with letters, numbers, hyphens, underscores or slashes; choose a name other than main.');
  try { await run(root, ['check-ref-format', '--branch', name]); }
  catch { throw new Error('Choose a valid feature branch name, such as add-score.'); }
  try { await run(root, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]); }
  catch (error) { if (error.code === 1) return; throw new Error('Git could not check this branch name.'); }
  throw new Error('That feature branch already exists. Choose a new name or use native Source Control to resume it.');
}
function planFor(kind, current, extra) {
  const plan = Object.freeze({...current, ...extra, kind});
  plans.add(plan);
  return plan;
}
async function prepareStart(project, name, {run = core.git} = {}) {
  await assertShareable(project);
  run = safeRunner(run);
  const current = await state(project, run);
  if (!current.head) throw new Error('Save the initial project as a local commit on main using Source Control → Commit, then try New branch again. Pushing is not required.');
  if (!current.mainHead) throw new Error('This project needs a committed main branch. Save the initial project as a local commit on main using Source Control → Commit. Pushing is not required.');
  if (current.branch !== 'main') throw new Error('Switch to main in native Source Control before starting another feature.');
  await validName(name, current.root, run);
  const startFingerprintValue = current.status ? await startFingerprint(current, run) : null;
  return planFor('start', current, {name, startFingerprint: startFingerprintValue, summary: `Create ${name} from your current local main.`});
}
const pendingFinishRef = 'refs/zero/pending-finish';
function finishMessage(branch) { return `Zero: finish ${branch}\n\nZero-Finished-Change: 1\nZero-Change-Branch: ${branch}`; }
// On main there is no checked-out feature name to authenticate the marker
// against. Validate the complete marker and its graph before retiring it.
async function mainPendingFinish(current, run) {
  let id;
  try { id = await run(current.root, ['rev-parse', '--verify', pendingFinishRef]); }
  catch (error) { if (error.code === 128) return null; throw error; }
  if (!shaPattern.test(id) || await run(current.root, ['cat-file', '-t', id]) !== 'commit') return {id, valid:false};
  const parents = (await run(current.root, ['rev-list', '--parents', '-n', '1', id])).split(' ');
  const message = await run(current.root, ['show', '-s', '--format=%B', id]);
  const match = /^Zero: finish ([a-zA-Z0-9][a-zA-Z0-9/_-]*)\n\nZero-Finished-Change: 1\nZero-Change-Branch: \1$/.exec(message);
  let branchValid = false;
  if (match && match[1] !== 'main' && match[1].length <= 80) {
    try { await run(current.root, ['check-ref-format', '--branch', match[1]]); branchValid = true; }
    catch (error) { if (error.code !== 128 && error.code !== 1) throw error; }
  }
  const structural = branchValid && parents.length === 3 && parents[0] === id &&
    await run(current.root, ['rev-parse', `${id}^{tree}`]) === await run(current.root, ['rev-parse', `${parents[2]}^{tree}`]) &&
    await ancestor(run, current.root, parents[1], parents[2]);
  return {id, structural, valid: structural && await ancestor(run, current.root, id, current.head), ...(structural ? {branch:match[1], base:parents[1], feature:parents[2]} : {})};
}
async function matchingFeature(current, pending, run) {
  let head;
  try { head = await run(current.root, ['rev-parse', '--verify', `refs/heads/${pending.branch}^{commit}`]); }
  catch (error) { if (error.code === 128) return false; throw error; }
  return shaPattern.test(head) && await ancestor(run, current.root, pending.feature, head);
}
// Retired candidates are hints, not authority: accept only exact, direct
// object-named refs with a valid boundary for this feature and both histories.
async function archivedFinishIn(current, descendant, run, {includeOnMain = false} = {}) {
  const rows = (await run(current.root, ['for-each-ref', '--format=%(refname) %(objectname) %(symref)', 'refs/zero/retired-finish/'])).split('\n').filter(Boolean);
  const matches = [];
  for (const row of rows) {
    const parts = row.trim().split(/\s+/);
    if (parts.length !== 2 || !shaPattern.test(parts[1]) || parts[0] !== `refs/zero/retired-finish/${parts[1]}`) continue;
    const id = parts[1];
    if (await run(current.root, ['cat-file', '-t', id]) !== 'commit') continue;
    const parents = (await run(current.root, ['rev-list', '--parents', '-n', '1', id])).split(' ');
    if (parents.length !== 3 || parents[0] !== id || await run(current.root, ['show', '-s', '--format=%B', id]) !== finishMessage(current.branch) ||
        await run(current.root, ['rev-parse', `${id}^{tree}`]) !== await run(current.root, ['rev-parse', `${parents[2]}^{tree}`]) ||
        !(await ancestor(run, current.root, parents[1], parents[2])) || !(await ancestor(run, current.root, parents[2], current.head)) ||
        !(await ancestor(run, current.root, id, descendant))) continue;
    if (await ancestor(run, current.root, id, current.mainHead) &&
        !(includeOnMain && (current.head === parents[2] || current.head === descendant))) continue;
    matches.push({id, feature:parents[2]});
  }
  if (matches.length > 1) throw new Error('More than one earlier merge needs attention. Check native Source Control; all commits are preserved.');
  return matches[0] || null;
}
async function assertNoArchivedFinishAhead(current, run) {
  if (await archivedFinishIn(current, current.head, run)) throw new Error('This feature contains an earlier finished merge missing from local main. Switch to main in Source Control, update it from GitHub, then review your feature again. Your commits are preserved.');
}
async function archivePendingFinish(current, pending, opts) {
  const savedRef = `refs/zero/retired-finish/${pending.id}`;
  await opts.beforeMutation();
  await recheck(current, opts.run, {full:true});
  if (!(await matchingFeature(current, pending, opts.run))) throw new Error('The pending feature branch changed. Check Source Control; its commits are preserved.');
  try { await opts.run(current.root, ['update-ref', '--no-deref', savedRef, pending.id, '0'.repeat(pending.id.length)]); }
  catch (error) {
    let existing;
    try { existing = await opts.run(current.root, ['rev-parse', '--verify', savedRef]); } catch { throw error; }
    let symbolic = false;
    try { await opts.run(current.root, ['symbolic-ref', '--quiet', savedRef]); symbolic = true; } catch (e) { if (e.code !== 1) throw e; }
    if (symbolic || existing !== pending.id) throw error;
  }
  await opts.beforeMutation();
  await recheck(current, opts.run, {full:true});
  if (!(await matchingFeature(current, pending, opts.run))) throw new Error('The pending feature branch changed. Check Source Control; its commits are preserved.');
  await local(opts.run, current.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, pending.id], 'retire the pending change');
}
async function pendingFinish(current, run, {allowDrift = false} = {}) {
  let id;
  try { id = await run(current.root, ['rev-parse', '--verify', `${pendingFinishRef}^{commit}`]); }
  catch (error) { if (error.code === 128) return null; throw error; }
  if (!shaPattern.test(id)) throw drift();
  const parents = (await run(current.root, ['rev-list', '--parents', '-n', '1', id])).split(' ');
  const message = await run(current.root, ['show', '-s', '--format=%B', id]);
  if (parents.length !== 3 || parents[0] !== id ||
      message !== finishMessage(current.branch) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(current.branch) || current.branch.length > 80 || current.branch === 'main' ||
      (current.mainHead !== parents[1] && current.mainHead !== id) ||
      await run(current.root, ['rev-parse', `${id}^{tree}`]) !== await run(current.root, ['rev-parse', `${parents[2]}^{tree}`]) ||
      !(await ancestor(run, current.root, parents[1], parents[2]))) {
    throw new Error('A pending finished change no longer matches this project. Check native Source Control before continuing; your commits are preserved.');
  }
  if (parents[2] !== current.head) {
    if (!(await ancestor(run, current.root, parents[2], current.head))) throw new Error('The feature no longer contains the pending change. Check native Source Control; all commits are preserved.');
    if (!allowDrift) throw Object.assign(new Error('This feature has newer commits after an interrupted finish. Recover the pending change first; your newer commits will stay on this branch.'), {pendingFinishDrift: true});
  }
  return {id, base: parents[1], feature: parents[2]};
}
async function prepareFinish(project, {run = core.git} = {}) {
  await assertShareable(project);
  run = safeRunner(run);
  const current = await state(project, run, {full: true});
  clean(current);
  if (current.branch === 'main') throw new Error('Start a feature first. Merge to main is for a completed feature branch.');
  if (current.branch.length > 80 || !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(current.branch)) throw new Error('Use a simple feature branch name before finishing this change.');
  await assertNoArchivedFinishAhead(current, run);
  const pending = await pendingFinish(current, run);
  const base = pending ? pending.base : current.mainHead;
  if (!(await ancestor(run, current.root, base, current.head))) throw new Error('Local main contains changes missing from this feature. Merge main into your feature with native Source Control, then review Merge to main again.');
  if (base === current.head) throw new Error('This change has no commits to finish.');
  const changedPaths = Object.freeze((await run(current.root, ['diff', '--name-only', '-z', base, current.head])).split('\0').filter(Boolean));
  const commitCount = await run(current.root, ['rev-list', '--count', `${base}..${current.head}`]);
  await recheck(current, run);
  return planFor('finish', current, {pending, changedPaths, commitCount: Number(commitCount), summary: `Merge ${current.branch} to main: ${commitCount} feature commit(s), ${changedPaths.length} changed path(s). Upload the completed main and switch to main. If GitHub main changed, Update from main, run the app, then merge again.`});
}
async function protectedNetwork(expected, options, operation, {full = false} = {}) {
  await options.beforeNetwork();
  await recheck(expected, options.run, {full});
  const result = await operation();
  await recheck(expected, options.run);
  return result;
}
async function prepareSync(project, options = {}) {
  const opts = {beforeNetwork: async () => {}, ...options, run: safeRunner(options.run || core.git)};
  networkRequired(opts.networkRun);
  const current = await state(project, opts.run, {full: true});
  if (!(await fs.lstat(path.join(current.root, '.git'))).isDirectory()) throw new Error('Use native Source Control for this separate Git directory. Guided updates need a standalone student repository with its own .git folder.');
  clean(current);
  const target = opts.target === undefined ? 'main' : opts.target;
  if (!['main', 'branch'].includes(target)) throw new Error('Choose main or the current branch to update.');
  const remoteBranchName = target === 'branch' ? current.branch : 'main';
  const remoteHead = await protectedNetwork(current, opts, () => remoteBranch(current, remoteBranchName, opts.networkRun));
  if (!remoteHead) throw new Error(`GitHub ${remoteBranchName} has no completed commit to update from.`);
  return planFor('sync', current, {target, remoteBranch: remoteBranchName, remoteMainHead: remoteHead, summary: `Download and merge GitHub ${remoteBranchName} into ${current.branch}, preserving your local commits.`});
}
async function fetchMain(expected, options) {
  try {
    const present = await options.run(expected.root, ['rev-parse', '--verify', `${expected.remoteMainHead}^{commit}`]);
    if (present !== expected.remoteMainHead) throw drift();
    return;
  } catch (error) { if (error.code !== 128) throw error; }
  options.onProgress('Downloading the reviewed GitHub main…');
  await network(options.networkRun, expected.root, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', expected.remote, expected.remoteMainHead]);
  const commit = await local(options.run, expected.root, ['rev-parse', '--verify', `${expected.remoteMainHead}^{commit}`], 'inspect the fetched main commit');
  if (commit !== expected.remoteMainHead) throw new Error('GitHub main did not resolve to the reviewed commit. Review this step again.');
}
async function preserveIgnored(expected, target, run) {
  const ignored = (await run(expected.root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  if (!ignored.length) return;
  const paths = (await run(expected.root, ['ls-tree', '-r', '--name-only', '-z', target])).split('\0').filter(Boolean);
  if (ignored.some(file => paths.some(tracked => file === tracked || file.startsWith(`${tracked}/`) || tracked.startsWith(`${file}/`)))) throw new Error('The incoming main would overwrite a local ignored file. Move that file safely outside the project, then review again.');
}
function executorOptions(plan, kind, options) {
  if (!plans.has(plan) || plan.kind !== kind) throw new Error('Review this project step before continuing.');
  if (kind !== 'start') networkRequired(options.networkRun);
  return {beforeNetwork: async () => {}, beforeMutation: async () => {}, onProgress: () => {}, ...options, run: safeRunner(options.run || core.git)};
}
async function startPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'start', options);
  await assertShareable(plan.root);
  opts.onProgress('Checking local main…');
  await validName(plan.name, plan.root, opts.run);
  await opts.beforeMutation();
  const reviewed = await recheck(plan, opts.run);
  if (plan.startFingerprint && await startFingerprint(reviewed, opts.run) !== plan.startFingerprint) throw drift();
  const oldPending = await mainPendingFinish(reviewed, opts.run);
  if (oldPending) {
    if (!oldPending.valid) throw new Error('A pending finished change needs attention in Source Control before starting another change.');
    await opts.beforeMutation();
    await recheck(plan, opts.run);
    await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, oldPending.id], 'clear the completed pending change');
    await recheck(plan, opts.run);
  }
  opts.onProgress('Creating your local feature branch…');
  await opts.beforeCheckout?.();
  let checkoutWarning = false;
  try {await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', '-b', plan.name, plan.head], 'create the reviewed feature branch');}
  catch (error) {
    let created;
    try {await opts.run(plan.root,['show-ref','--verify','--quiet',`refs/heads/${plan.name}`]);}
    catch (inspectionError) {
      if (inspectionError.code === 1) throw error;
      throw new Error('Git reported an error and the branch outcome could not be checked. Check Source Control before trying again. Your work is preserved.');
    }
    try {created = await opts.run(plan.root,['rev-parse','--verify',`refs/heads/${plan.name}^{commit}`]);}
    catch {throw new Error('Git reported an error and the branch outcome could not be checked. Check Source Control before trying again. Your work is preserved.');}
    if (created !== plan.head) throw new Error('Git reported an error and the branch has an unexpected commit. Check Source Control before trying again. Your work is preserved.');
    checkoutWarning = true;
  }
  let postCheckoutChanged = false, activeUncertain = false;
  try {const final = await state(plan.root, opts.run);const currentBranch = await opts.run(plan.root,['symbolic-ref','--quiet','--short','HEAD']);postCheckoutChanged = !same({...plan, branch: plan.name}, final);activeUncertain = final.branch !== plan.name || final.head !== plan.head || currentBranch !== plan.name;}
  catch {postCheckoutChanged = true;activeUncertain = true;}
  plans.delete(plan);
  return Object.freeze({branch: plan.name, head: plan.head, page: plan.page, postCheckoutChanged, activeUncertain, checkoutWarning});
}
async function syncPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'sync', options);
  await assertShareable(plan.root);
  opts.onProgress('Checking the reviewed GitHub main…');
  await protectedNetwork(plan, opts, () => fetchMain(plan, opts));
  let current = await recheck(plan, opts.run, {full: true});
  const remoteHead = plan.remoteMainHead;
  let confirmedFinish;
  let rejectedOnMain;
  if (current.branch !== 'main' && plan.target === 'main') {
    let pendingExists = true;
    try { await opts.run(plan.root, ['rev-parse', '--verify', pendingFinishRef]); }
    catch (error) { if (error.code !== 128) throw error; pendingExists = false; }
    const archived = pendingExists ? null : await archivedFinishIn(current, remoteHead, opts.run, {includeOnMain:true});
    if (archived) {
      if (!(await ancestor(opts.run, plan.root, current.mainHead, remoteHead))) throw new Error('Local main and the earlier finished merge need attention in Source Control. Your commits are preserved.');
      const switchToMain = current.head === archived.feature || current.head === remoteHead;
      if (switchToMain) await preserveIgnored(current, remoteHead, opts.run);
      await opts.beforeMutation();
      await recheck(current, opts.run, {full:true});
      if (current.mainHead !== remoteHead) await local(opts.run, plan.root, ['update-ref', '--no-deref', 'refs/heads/main', remoteHead, current.mainHead], 'record the reviewed main');
      current = {...current, mainHead:remoteHead};
      if (switchToMain) {
        await opts.beforeMutation();
        await recheck(current, opts.run, {full:true});
        await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', 'main'], 'switch to completed main');
        const switched = await state(plan.root, opts.run, {full:true});
        if (!same({...current, branch:'main', head:remoteHead}, switched)) throw drift();
        current = switched;
        confirmedFinish = Object.freeze({branch:plan.branch, featureHead:archived.feature, head:archived.id});
      }
    }
  }
  if (current.branch === 'main') {
    const pending = await mainPendingFinish(current, opts.run);
    if (pending?.structural && !(await ancestor(opts.run, plan.root, pending.id, remoteHead))) {
      // An older remote or a rewritten base cannot establish rejection. Keep
      // the exact candidate and let the student resume its feature instead.
      if (pending.valid || !(await ancestor(opts.run, plan.root, pending.base, remoteHead)) ||
          await ancestor(opts.run, plan.root, remoteHead, pending.id) || !(await matchingFeature(current, pending, opts.run))) {
        throw new Error('The earlier merge is still pending or its history changed. Switch to its feature in Source Control and review Merge to main or recovery. Your commits are preserved.');
      }
      rejectedOnMain = pending;
    }
  }
  if (current.branch !== 'main') {
    const pending = await pendingFinish(current, opts.run, {allowDrift:true});
    if (pending) {
      if (plan.target !== 'main') throw new Error('Retry Merge to main before updating this feature branch.');
      if (await ancestor(opts.run, plan.root, pending.id, remoteHead)) {
        // The reviewed remote contains the exact pending boundary. Record that
        // confirmation locally before merging the remote into the feature.
        if (current.mainHead !== pending.id) {
          await opts.beforeMutation();
          await recheck(current, opts.run, {full: true});
          const checked = await pendingFinish(current, opts.run, {allowDrift:true});
          if (!checked || checked.id !== pending.id) throw drift();
          await local(opts.run, plan.root, ['update-ref', 'refs/heads/main', pending.id, pending.base], 'record the confirmed finished change on local main');
          current = {...current, mainHead:pending.id};
        }
        await opts.beforeMutation();
        await recheck(current, opts.run, {full: true});
        if (pending.feature === current.head) {
          // No newer feature work remains: finish on main so a later finish
          // cannot create a second boundary for the same change.
          await preserveIgnored(current, pending.id, opts.run);
          await opts.beforeMutation();
          await recheck(current, opts.run, {full:true});
          await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', 'main'], 'switch to completed main');
          const switched = await state(plan.root, opts.run, {full:true});
          if (!same({...current, branch:'main', head:pending.id}, switched)) throw drift();
          current = switched;
          confirmedFinish = Object.freeze({branch:plan.branch, featureHead:pending.feature, head:pending.id});
          await opts.beforeMutation();
          await recheck(current, opts.run, {full:true});
        }
        await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, pending.id], 'clear the confirmed pending change');
      } else {
        if (current.mainHead === pending.id) throw new Error('This change may already be on GitHub. Recover the pending change before updating.');
        if (await ancestor(opts.run, plan.root, remoteHead, pending.id)) throw new Error('Recover the pending change before updating.');
        await opts.beforeMutation();
        await recheck(current, opts.run, {full: true});
        await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, pending.id], 'retire the rejected pending change');
      }
    }
  }
  const unchanged = await ancestor(opts.run, plan.root, remoteHead, current.head);
  if (!unchanged) {
    try { await opts.run(plan.root, ['merge-base', current.head, remoteHead]); }
    catch { throw new Error('GitHub main and this project have unrelated histories. Check the connected repository before syncing.'); }
    await preserveIgnored(current, remoteHead, opts.run);
    const expectedMerge = await recovery.preview(current, remoteHead, opts.run);
    await opts.beforeMutation();
    await recheck(current, opts.run, {full: true});
    opts.onProgress(current.branch === 'main' ? 'Updating local main…' : 'Merging GitHub main into your feature…');
    try { await opts.run(plan.root, ['-c', `core.hooksPath=${os.devNull}`, '-c', 'merge.conflictStyle=merge', '-c', 'merge.autoStash=false', '-c', 'rerere.enabled=false', 'merge', '--ff', '--no-gpg-sign', '--no-edit', '--no-overwrite-ignore', remoteHead]); }
    catch {
      let pending = false;
      try { await opts.run(plan.root, ['rev-parse', '--verify', 'MERGE_HEAD']); pending = true; } catch {}
      if (pending) {
        const managed = await recovery.create(current, remoteHead, plan.remoteBranch, opts.run, recoveryInspect, expectedMerge);
        plans.delete(plan);
        return {synced: false, updated: false, branch: plan.branch, remote: plan.remote, remoteBranch: plan.remoteBranch, remoteHead, recovery: managed};
      }
      throw new Error('Git could not update this branch. Check native Source Control and Git identity, then review again. Your files and commits are preserved.');
    }
  }
  const final = await state(plan.root, opts.run, {full: true});
  if (final.branch !== current.branch || final.remote !== plan.remote || final.status || final.gitDir !== plan.gitDir || final.worktrees !== plan.worktrees ||
      (final.branch === 'main' ? final.mainHead !== final.head : final.mainHead !== current.mainHead) ||
      !(await ancestor(opts.run, plan.root, current.head, final.head)) || !(await ancestor(opts.run, plan.root, remoteHead, final.head))) throw drift();
  if (unchanged && (final.head !== current.head || final.fingerprint !== current.fingerprint)) throw drift();
  if (final.branch === 'main') {
    const completed = await mainPendingFinish(final, opts.run);
    if (completed?.valid) {
      await opts.beforeMutation();
      await recheck(final, opts.run, {full:true});
      await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, completed.id], 'clear the confirmed pending change');
    } else if (rejectedOnMain) {
      if (!completed?.structural || completed.id !== rejectedOnMain.id) throw drift();
      await archivePendingFinish(final, completed, opts);
    }
  }
  plans.delete(plan);
  return Object.freeze({synced: true, updated: final.head !== current.head, branch: final.branch, head: final.head, page: plan.page, remote: plan.remote, remoteBranch: plan.remoteBranch, remoteHead, ...(confirmedFinish ? {confirmedFinish} : {})});
}
async function finishPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'finish', options);
  await assertShareable(plan.root);
  await opts.beforeMutation();
  const current = await recheck(plan, opts.run, {full: true});
  await assertNoArchivedFinishAhead(current, opts.run);
  let candidate = plan.pending;
  if (candidate) {
    const checked = await pendingFinish(current, opts.run);
    if (!checked || checked.id !== candidate.id) throw drift();
  } else {
    if (!(await ancestor(opts.run, plan.root, current.mainHead, current.head)) || current.mainHead === current.head) throw drift();
    const tree = await opts.run(plan.root, ['rev-parse', `${current.head}^{tree}`]);
    const id = await local(opts.run, plan.root, ['-c', `core.hooksPath=${os.devNull}`, 'commit-tree', tree, '-p', current.mainHead, '-p', current.head, '-m', finishMessage(current.branch)], 'record the finished change');
    if (!shaPattern.test(id)) throw drift();
    await opts.beforeMutation();
    await recheck(current, opts.run, {full: true});
    await local(opts.run, plan.root, ['update-ref', '--no-deref', pendingFinishRef, id, '0'.repeat(id.length)], 'save the pending finished change');
    candidate = {id, base: current.mainHead, feature: current.head};
  }
  const ready = current;
  opts.onProgress('Pushing the merged main…');
  let confirmed;
  try {
    await protectedNetwork(ready, opts, () => network(opts.networkRun, plan.root, ['push', plan.remote, `${candidate.id}:refs/heads/main`]), {full: true});
    opts.onProgress('Confirming main on GitHub…');
    confirmed = await protectedNetwork(ready, opts, () => remoteMain(ready, opts.networkRun));
    if (confirmed !== candidate.id) throw Object.assign(new Error('GitHub did not confirm the completed main commit.'), {kind:'unconfirmed'});
  } catch (error) {
    throw Object.assign(new Error(`${error.message} Your feature and local main are preserved. Retry Merge to main, or update from GitHub if main changed.`),{workflowRecovery:{root:plan.root,remote:plan.remote,page:plan.page,branch:plan.branch,head:candidate.id,committed:false,kind:error.kind||'network',operation:'merge'}});
  }
  if (current.mainHead !== candidate.id) {
    await opts.beforeMutation();
    await recheck(current, opts.run, {full: true});
    await local(opts.run, plan.root, ['update-ref', 'refs/heads/main', candidate.id, candidate.base], 'advance local main');
  }
  const completed = {...current, mainHead: candidate.id};
  await opts.beforeMutation();
  await recheck(completed, opts.run, {full: true});
  await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', 'main'], 'switch to completed main');
  const final = await state(plan.root, opts.run);
  if (!same({...completed, branch: 'main', head: candidate.id}, final)) throw drift();
  try { await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, candidate.id], 'clear the pending finished change'); } catch { /* Main and remote already contain the commit; a later start can clear the stale ref. */ }
  plans.delete(plan);
  return Object.freeze({finished: true, branch: 'main', head: final.head, featureHead: candidate.feature, page: plan.page, finishedBranch: plan.branch, remote: plan.remote});
}
// Recover an interrupted finish without moving the feature branch or its newer commits.
async function preparePendingFinishRecovery(project, {run = core.git} = {}) {
  await assertShareable(project);
  run = safeRunner(run);
  const current = await state(project, run, {full:true});
  clean(current);
  if (current.branch === 'main') throw new Error('Switch to the feature with the pending change first.');
  const pending = await pendingFinish(current, run, {allowDrift:true});
  if (!pending || pending.feature === current.head) throw new Error('There is no pending finished change with newer feature commits to recover.');
  await recheck(current, run, {full:true});
  return planFor('recover-finish', current, {pending, summary:`Confirm finished change ${pending.id} on ${current.page}. Your newer commits remain on ${current.branch}. If GitHub does not yet have it, an explicit retry may push that exact commit to main.`});
}
async function recoverPendingFinish(plan, options = {}) {
  const opts = executorOptions(plan, 'recover-finish', options);
  await assertShareable(plan.root);
  let current = await recheck(plan, opts.run, {full:true});
  const pending = await pendingFinish(current, opts.run, {allowDrift:true});
  if (!pending || pending.id !== plan.pending.id || pending.feature !== plan.pending.feature) throw drift();
  opts.onProgress('Checking the earlier finished change on GitHub…');
  const remoteHead = await protectedNetwork(current, opts, () => remoteMain(current, opts.networkRun), {full:true});
  if (remoteHead) {
    const reviewed = {...current, remoteMainHead:remoteHead};
    await protectedNetwork(current, opts, () => fetchMain(reviewed, opts));
  }
  const included = remoteHead && await ancestor(opts.run, plan.root, pending.id, remoteHead);
  if (!included && remoteHead && !(await ancestor(opts.run, plan.root, remoteHead, pending.id))) {
    plans.delete(plan);
    return Object.freeze({recovered:false, needsSync:true, branch:current.branch, remote:current.remote, remoteHead});
  }
  if (!included) {
    if (opts.allowPush !== true) return Object.freeze({recovered:false, needsPush:true, branch:current.branch, candidate:pending.id, remote:current.remote, page:current.page});
    opts.onProgress('Retrying the reviewed finished change…');
    await protectedNetwork(current, opts, () => network(opts.networkRun, plan.root, ['push', plan.remote, `${pending.id}:refs/heads/main`]), {full:true});
    const confirmed = await protectedNetwork(current, opts, () => remoteMain(current, opts.networkRun));
    if (confirmed !== pending.id) throw new Error('GitHub did not confirm the earlier finished change. Retry recovery; all commits are preserved.');
  }
  if (current.mainHead !== pending.id) {
    await opts.beforeMutation();
    await recheck(current, opts.run, {full:true});
    const checked = await pendingFinish(current, opts.run, {allowDrift:true});
    if (!checked || checked.id !== pending.id) throw drift();
    await local(opts.run, plan.root, ['update-ref', 'refs/heads/main', pending.id, pending.base], 'record the confirmed finished change on local main');
    current = {...current, mainHead:pending.id};
  }
  await opts.beforeMutation();
  await recheck(current, opts.run, {full:true});
  await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, pending.id], 'clear the confirmed pending change');
  plans.delete(plan);
  return Object.freeze({recovered:true, needsSync:true, branch:current.branch, head:current.head, finishedHead:pending.id, remoteHead:included ? remoteHead : pending.id, remote:current.remote});
}
async function deleteFinishedBranch(root, branch, expectedHead, {run = core.git, beforeMutation = async () => {}} = {}) {
  await assertShareable(root);
  run = safeRunner(run);
  if (!shaPattern.test(expectedHead) || typeof branch !== 'string' || branch === 'main' || !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(branch)) throw new Error('Choose the exact finished feature branch for local cleanup.');
  const current = await state(root, run);
  clean(current);
  if (current.branch !== 'main') throw new Error('Switch to clean main before deleting a finished local feature.');
  let actual;
  try { actual = await run(current.root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]); }
  catch { throw new Error('The finished feature branch is no longer available for cleanup.'); }
  if (actual !== expectedHead || !(await ancestor(run, current.root, actual, current.mainHead))) throw new Error('This feature branch changed or has work missing from main. Keep it and inspect native Source Control.');
  await beforeMutation();
  await recheck(current, run);
  if (await run(current.root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]) !== expectedHead) throw drift();
  // Compare-and-delete the exact reviewed SHA; branch -d bases its decision on
  // an upstream and cannot atomically guard a concurrently moved feature ref.
  await local(run, current.root, ['update-ref', '-d', `refs/heads/${branch}`, expectedHead], 'delete the finished local feature');
  return Object.freeze({deleted: true, branch});
}
function recoveryInspect(root, run) { return state(root, run, {allowMerge: true}); }
function recoveryOptions(options = {}) { return {beforeMutation: async () => {}, ...options, run: safeRunner(options.run || core.git), inspect: recoveryInspect}; }
async function readRecovery(root, options = {}) { return recovery.read(root, recoveryOptions(options)); }
async function resolveRecovery(root, choice, options = {}) { return recovery.resolve(root, choice, recoveryOptions(options)); }
async function cancelRecovery(root, options = {}) { return recovery.cancel(root, recoveryOptions(options)); }
async function checkpoint(root, options = {}) {
  const opts = recoveryOptions(options);
  opts.inspect = (project, run) => state(project, run);
  return recovery.checkpoint(root, opts);
}
module.exports = {preparePendingFinishRecovery, recoverPendingFinish, readRecovery, resolveRecovery, cancelRecovery, checkpoint, prepareStart, startPrepared, prepareSync, syncPrepared, prepareFinish, finishPrepared, deleteFinishedBranch};
