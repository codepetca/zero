'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./core');
const {prepareUpload} = require('./github');
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
async function state(project, run) {
  const current = await prepareUpload(project, run);
  const gitDir = await run(current.root, ['rev-parse', '--absolute-git-dir']);
  const commonDir = await run(current.root, ['rev-parse', '--git-common-dir']);
  if (await fs.realpath(path.resolve(current.root, commonDir)) !== await fs.realpath(gitDir) ||
      (await run(current.root, ['worktree', 'list', '--porcelain'])).split('\n').filter(line => line.startsWith('worktree ')).length !== 1) {
    throw new Error('This project uses multiple Git worktrees. Use a standalone student repository for Start and Finish.');
  }
  let mainHead = null;
  try { mainHead = await run(current.root, ['rev-parse', '--verify', 'refs/heads/main^{commit}']); }
  catch (error) { if (error.code !== 128) throw new Error('Git could not inspect main. Check native Source Control.'); }
  if (current.head && !shaPattern.test(current.head) || mainHead && !shaPattern.test(mainHead)) throw new Error('Git returned an unexpected commit. Check native Source Control.');
  return {...current, mainHead};
}
function clean(current) {
  if (!current.head) throw new Error('Make your first Upload on main to save the initial project, then Start a new feature.');
  if (current.status) throw new Error('Save and commit your project changes with Upload first, then review Start or Finish again. For the initial project, use Upload on main.');
  if (!current.mainHead) throw new Error('This project needs a committed main branch. Save the initial project on main with Upload first.');
}
function same(a, b) {
  return ['root', 'page', 'remote', 'branch', 'head', 'mainHead', 'status', 'fingerprint'].every(key => a[key] === b[key]);
}
async function recheck(expected, run) {
  const current = await state(expected.root, run);
  if (!same(expected, current)) throw drift();
  return current;
}
function networkRequired(networkRun) {
  if (typeof networkRun !== 'function') throw new Error('Sign in to GitHub and review this step using the native GitHub connection.');
}
async function network(networkRun, root, args) {
  try { return await networkRun(root, args); }
  catch (error) {
    const detail = String(error.stderr || error.message || '');
    if (/non-fast-forward|fetch first|rejected.*behind|changes missing locally/i.test(detail)) throw new Error('GitHub main changed and refused this upload. Your feature remains checked out and your commits are preserved. Review Finish again to merge the new main.');
    throw new Error('GitHub could not complete this step. Check your native GitHub sign-in, repository access and network, then review again. Your feature and commits are preserved; no upload was confirmed.');
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
async function prepareStart(project, name, {run = core.git, networkRun} = {}) {
  networkRequired(networkRun);
  run = safeRunner(run);
  const current = await state(project, run);
  clean(current);
  if (current.branch !== 'main') throw new Error('Switch to main in native Source Control before starting another feature.');
  await validName(name, current.root, run);
  const remoteMainHead = await remoteMain(current, networkRun);
  if (await remoteBranch(current, name, networkRun)) throw new Error('That feature name already exists on GitHub. Choose a fresh unique name for your new feature.');
  await recheck(current, run);
  return planFor('start', current, {name, remoteMainHead, summary: `Update main from GitHub, then create ${name} from the completed main baseline.`});
}
async function prepareFinish(project, {run = core.git, networkRun} = {}) {
  networkRequired(networkRun);
  run = safeRunner(run);
  const current = await state(project, run);
  clean(current);
  if (current.branch === 'main') throw new Error('Start a feature first. Finish is for a completed feature branch.');
  if (!(await ancestor(run, current.root, current.mainHead, current.head))) throw new Error('Local main contains changes missing from this feature. Merge main into your feature with native Source Control, then review Finish again.');
  const remoteMainHead = await remoteMain(current, networkRun);
  const changedPaths = Object.freeze((await run(current.root, ['diff', '--name-only', '-z', current.mainHead, current.head])).split('\0').filter(Boolean));
  const commitCount = await run(current.root, ['rev-list', '--count', `${current.mainHead}..${current.head}`]);
  await recheck(current, run);
  return planFor('finish', current, {remoteMainHead, changedPaths, commitCount: Number(commitCount), summary: `Finish ${current.branch} into main: ${commitCount} feature commit(s), ${changedPaths.length} changed path(s). If GitHub main needs merging, stop on this feature so you can Run App and review Finish again. Otherwise upload the completed main and switch to main.`});
}
async function protectedNetwork(expected, options, operation) {
  await options.beforeNetwork();
  await recheck(expected, options.run);
  const result = await operation();
  await recheck(expected, options.run);
  return result;
}
async function ensureRemote(expected, options) {
  const head = await protectedNetwork(expected, options, () => remoteMain(expected, options.networkRun));
  if (head !== expected.remoteMainHead) throw new Error('GitHub main changed after review. Review this step again. Your commits are preserved.');
}
async function fetchMain(expected, options) {
  if (!expected.remoteMainHead) return;
  await protectedNetwork(expected, options, () => network(options.networkRun, expected.root, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', expected.remote, expected.remoteMainHead]));
  const commit = await local(options.run, expected.root, ['rev-parse', '--verify', `${expected.remoteMainHead}^{commit}`], 'inspect the fetched main commit');
  if (commit !== expected.remoteMainHead) throw new Error('GitHub main did not resolve to the reviewed commit. Review this step again.');
  await recheck(expected, options.run);
}
async function preserveIgnored(expected, target, run) {
  const ignored = (await run(expected.root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  if (!ignored.length) return;
  const paths = (await run(expected.root, ['ls-tree', '-r', '--name-only', '-z', target])).split('\0').filter(Boolean);
  if (ignored.some(file => paths.some(tracked => file === tracked || file.startsWith(`${tracked}/`) || tracked.startsWith(`${file}/`)))) throw new Error('The incoming main would overwrite a local ignored file. Move that file safely outside the project, then review again.');
}
function executorOptions(plan, kind, options) {
  if (!plans.has(plan) || plan.kind !== kind) throw new Error('Review this project step before continuing.');
  networkRequired(options.networkRun);
  return {beforeNetwork: async () => {}, onProgress: () => {}, ...options, run: safeRunner(options.run || core.git)};
}
async function startPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'start', options);
  await ensureRemote(plan, opts);
  await fetchMain(plan, opts);
  await ensureRemote(plan, opts);
  if (await protectedNetwork(plan, opts, () => remoteBranch(plan, plan.name, opts.networkRun))) throw new Error('That feature name now exists on GitHub. Choose a fresh unique name and review Start again.');
  await validName(plan.name, plan.root, opts.run);
  let current = await recheck(plan, opts.run);
  if (plan.remoteMainHead && plan.remoteMainHead !== plan.head) {
    if (!(await ancestor(opts.run, plan.root, plan.head, plan.remoteMainHead))) throw new Error('Local main cannot fast-forward to GitHub main. Bring the two histories together using native Source Control before Start. No branch was created.');
    await preserveIgnored(current, plan.remoteMainHead, opts.run);
    await recheck(plan, opts.run);
    opts.onProgress('Updating main to the reviewed GitHub commit…');
    await local(opts.run, plan.root, ['merge', '--ff-only', '--no-edit', '--no-overwrite-ignore', plan.remoteMainHead], 'fast-forward main');
    const updated = await state(plan.root, opts.run);
    if (updated.branch !== 'main' || updated.head !== plan.remoteMainHead || updated.mainHead !== plan.remoteMainHead || updated.status || updated.remote !== plan.remote) throw drift();
    current = updated;
  }
  await validName(plan.name, plan.root, opts.run);
  await recheck(current, opts.run);
  opts.onProgress('Creating your feature branch…');
  await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', '-b', plan.name, current.head], 'create the reviewed feature branch');
  const final = await state(plan.root, opts.run);
  if (final.branch !== plan.name || final.head !== current.head || final.mainHead !== current.mainHead || final.remote !== plan.remote || final.status || final.fingerprint !== current.fingerprint) throw drift();
  plans.delete(plan);
  return Object.freeze({branch: final.branch, head: final.head, page: plan.page});
}
async function finishPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'finish', options);
  await ensureRemote(plan, opts);
  await fetchMain(plan, opts);
  await ensureRemote(plan, opts);
  let current = await recheck(plan, opts.run);
  if (plan.remoteMainHead && !(await ancestor(opts.run, plan.root, plan.remoteMainHead, plan.head))) {
    // Refuse unrelated repositories, preserving the feature and every local file.
    try { await opts.run(plan.root, ['merge-base', plan.head, plan.remoteMainHead]); }
    catch { throw new Error('GitHub main and this feature have unrelated histories. Check the connected repository before finishing.'); }
    await preserveIgnored(current, plan.remoteMainHead, opts.run);
    await recheck(plan, opts.run);
    opts.onProgress('Merging the reviewed GitHub main into your feature…');
    try { await opts.run(plan.root, ['merge', '--no-edit', '--no-overwrite-ignore', plan.remoteMainHead]); }
    catch {
      let pending = false;
      try { await opts.run(plan.root, ['rev-parse', '--verify', 'MERGE_HEAD']); pending = true; } catch {}
      const error = new Error(pending ? 'GitHub main needs a merge resolution. Resolve conflicts in native Source Control, stage and commit the merge, then review Finish again. Your feature remains checked out; main was not uploaded.' : 'Git could not merge main into your feature. Check native Source Control and Git identity, then review Finish again. Your files and commits are preserved.');
      error.conflict = pending;
      error.branch = plan.branch;
      throw error;
    }
    current = await state(plan.root, opts.run);
    if (current.branch !== plan.branch || current.mainHead !== plan.mainHead || current.remote !== plan.remote || current.status || !(await ancestor(opts.run, plan.root, plan.head, current.head)) || !(await ancestor(opts.run, plan.root, plan.remoteMainHead, current.head))) throw drift();
    plans.delete(plan);
    return Object.freeze({updated: true, finished: false, branch: current.branch, head: current.head, page: plan.page});
  }
  // Merge hooks or concurrent work cannot move main or substitute the reviewed branch.
  await recheck(current, opts.run);
  await ensureRemote({...current, remoteMainHead: plan.remoteMainHead}, opts);
  if (!(await ancestor(opts.run, plan.root, current.mainHead, current.head))) throw drift();
  await recheck(current, opts.run);
  opts.onProgress('Saving completed work on local main…');
  await local(opts.run, plan.root, ['update-ref', 'refs/heads/main', current.head, current.mainHead], 'fast-forward local main');
  const ready = {...current, mainHead: current.head, remoteMainHead: plan.remoteMainHead};
  await recheck(ready, opts.run);
  opts.onProgress('Uploading the completed main…');
  let confirmed;
  try {
    await protectedNetwork(ready, opts, () => network(opts.networkRun, plan.root, ['push', plan.remote, `${ready.head}:refs/heads/main`]));
    opts.onProgress('Confirming main on GitHub…');
    confirmed = await protectedNetwork(ready, opts, () => remoteMain(ready, opts.networkRun));
  } catch (error) {
    throw new Error(`${error.message} Local main already contains the completed commit; your feature remains available. Review Finish again to retry.`);
  }
  if (confirmed !== ready.head) throw new Error('GitHub did not confirm the completed main commit. Your feature remains checked out and local main keeps the completed commit. Review Finish again.');
  await recheck(ready, opts.run);
  await preserveIgnored(ready, ready.head, opts.run);
  await recheck(ready, opts.run);
  await local(opts.run, plan.root, ['checkout', '--no-overwrite-ignore', 'main'], 'switch to completed main');
  const final = await state(plan.root, opts.run);
  if (final.branch !== 'main' || final.head !== ready.head || final.mainHead !== ready.head || final.remote !== plan.remote || final.status || final.fingerprint !== ready.fingerprint) throw drift();
  plans.delete(plan);
  return Object.freeze({finished: true, branch: 'main', head: final.head, page: plan.page, finishedBranch: plan.branch});
}
async function deleteFinishedBranch(root, branch, expectedHead, {run = core.git} = {}) {
  run = safeRunner(run);
  if (!shaPattern.test(expectedHead) || typeof branch !== 'string' || branch === 'main' || !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(branch)) throw new Error('Choose the exact finished feature branch for local cleanup.');
  const current = await state(root, run);
  clean(current);
  if (current.branch !== 'main') throw new Error('Switch to clean main before deleting a finished local feature.');
  let actual;
  try { actual = await run(current.root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]); }
  catch { throw new Error('The finished feature branch is no longer available for cleanup.'); }
  if (actual !== expectedHead || !(await ancestor(run, current.root, actual, current.mainHead))) throw new Error('This feature branch changed or has work missing from main. Keep it and inspect native Source Control.');
  await recheck(current, run);
  if (await run(current.root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]) !== expectedHead) throw drift();
  // Compare-and-delete the exact reviewed SHA; branch -d bases its decision on
  // an upstream and cannot atomically guard a concurrently moved feature ref.
  await local(run, current.root, ['update-ref', '-d', `refs/heads/${branch}`, expectedHead], 'delete the finished local feature');
  return Object.freeze({deleted: true, branch});
}
module.exports = {prepareStart, startPrepared, prepareFinish, finishPrepared, deleteFinishedBranch};
