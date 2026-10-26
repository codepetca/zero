'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./core');
const recovery = require('./git-update-recovery');
const os = require('node:os');
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
function clean(current) {
  if (!current.head) throw new Error('Use Commit & push on main to save the initial project, then New branch.');
  if (current.status) throw new Error('Use Commit & push first, then review New branch or Merge to main again. For the initial project, commit and push on main.');
  if (!current.mainHead) throw new Error('This project needs a committed main branch. Save the initial project on main with Commit & push first.');
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
  clean(current);
  if (current.branch !== 'main') throw new Error('Switch to main in native Source Control before starting another feature.');
  await validName(name, current.root, run);
  return planFor('start', current, {name, summary: `Create ${name} from your current local main.`});
}
async function prepareFinish(project, {run = core.git} = {}) {
  await assertShareable(project);
  run = safeRunner(run);
  const current = await state(project, run, {full: true});
  clean(current);
  if (current.branch === 'main') throw new Error('Start a feature first. Merge to main is for a completed feature branch.');
  if (!(await ancestor(run, current.root, current.mainHead, current.head))) throw new Error('Local main contains changes missing from this feature. Merge main into your feature with native Source Control, then review Merge to main again.');
  const changedPaths = Object.freeze((await run(current.root, ['diff', '--name-only', '-z', current.mainHead, current.head])).split('\0').filter(Boolean));
  const commitCount = await run(current.root, ['rev-list', '--count', `${current.mainHead}..${current.head}`]);
  await recheck(current, run);
  return planFor('finish', current, {changedPaths, commitCount: Number(commitCount), summary: `Merge ${current.branch} to main: ${commitCount} feature commit(s), ${changedPaths.length} changed path(s). Upload the completed main and switch to main. If GitHub main changed, Update from main, run the app, then merge again.`});
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
  await recheck(plan, opts.run);
  opts.onProgress('Creating your local feature branch…');
  await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', '-b', plan.name, plan.head], 'create the reviewed feature branch');
  const final = await state(plan.root, opts.run);
  if (!same({...plan, branch: plan.name}, final)) throw drift();
  plans.delete(plan);
  return Object.freeze({branch: final.branch, head: final.head, page: plan.page});
}
async function syncPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'sync', options);
  await assertShareable(plan.root);
  opts.onProgress('Checking the reviewed GitHub main…');
  await protectedNetwork(plan, opts, () => fetchMain(plan, opts));
  const current = await recheck(plan, opts.run, {full: true});
  const remoteHead = plan.remoteMainHead;
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
      (final.branch === 'main' ? final.mainHead !== final.head : final.mainHead !== plan.mainHead) ||
      !(await ancestor(opts.run, plan.root, current.head, final.head)) || !(await ancestor(opts.run, plan.root, remoteHead, final.head))) throw drift();
  if (unchanged && (final.head !== current.head || final.fingerprint !== current.fingerprint)) throw drift();
  plans.delete(plan);
  return Object.freeze({synced: true, updated: final.head !== current.head, branch: final.branch, head: final.head, page: plan.page, remote: plan.remote, remoteBranch: plan.remoteBranch, remoteHead});
}
async function finishPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'finish', options);
  await assertShareable(plan.root);
  await opts.beforeMutation();
  const current = await recheck(plan, opts.run, {full: true});
  if (!(await ancestor(opts.run, plan.root, current.mainHead, current.head))) throw drift();
  opts.onProgress('Saving completed work on local main…');
  await local(opts.run, plan.root, ['update-ref', 'refs/heads/main', current.head, current.mainHead], 'fast-forward local main');
  const ready = {...current, mainHead: current.head};
  opts.onProgress('Pushing the merged main…');
  let confirmed;
  try {
    await protectedNetwork(ready, opts, () => network(opts.networkRun, plan.root, ['push', plan.remote, `${ready.head}:refs/heads/main`]), {full: true});
    opts.onProgress('Confirming main on GitHub…');
    confirmed = await protectedNetwork(ready, opts, () => remoteMain(ready, opts.networkRun));
  } catch (error) {
    throw Object.assign(new Error(`${error.message} Local main already contains the completed commit; your feature remains available. Update from main, run the app, then merge again.`),{workflowRecovery:{root:plan.root,remote:plan.remote,page:plan.page,branch:plan.branch,head:ready.head,committed:false,kind:error.kind||'network',operation:'merge'}});
  }
  if (confirmed !== ready.head) throw new Error('GitHub did not confirm the completed main commit. Your feature remains checked out and local main keeps the completed commit. Review Merge to main again.');
  await opts.beforeMutation();
  await recheck(ready, opts.run, {full: true});
  await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', 'main'], 'switch to completed main');
  const final = await state(plan.root, opts.run);
  if (!same({...ready, branch: 'main'}, final)) throw drift();
  plans.delete(plan);
  return Object.freeze({finished: true, branch: 'main', head: final.head, page: plan.page, finishedBranch: plan.branch, remote: plan.remote});
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
module.exports = {readRecovery, resolveRecovery, cancelRecovery, checkpoint, prepareStart, startPrepared, prepareSync, syncPrepared, prepareFinish, finishPrepared, deleteFinishedBranch};
