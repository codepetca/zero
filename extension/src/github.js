'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./core');
const reviewedPlans = new WeakSet();

// Deliberately omit raw Git stderr: credential helpers can include private data.
function gitError(error, action) {
  const detail = String(error.stderr || error.message || '');
  if (/identity unknown|unable to auto-detect email|user\.email|user\.name/i.test(detail)) return new Error('Git needs your name and email. Configure your Git identity for this student repository, then review the upload again.');
  if (/non-fast-forward|fetch first|rejected.*behind/i.test(detail)) return new Error('GitHub has changes that are not in your local branch. Use Git to bring those changes into your project, resolve any conflicts, then review again. Nothing was confirmed uploaded.');
  if (/authentication|credential|could not read username|terminal prompts disabled/i.test(detail)) return new Error('GitHub authentication failed. Sign in using the standard Git credential/browser flow, then review again.');
  if (/permission|403|denied|repository not found/i.test(detail)) return new Error('GitHub refused access. Check that the connected repository exists and your Git account has permission to push.');
  return new Error(`Git could not ${action}. Check Git in the terminal, then review the upload again. Nothing was confirmed uploaded.`);
}
async function execute(run, root, args, action) {
  try { return await run(root, args); } catch (error) { throw gitError(error, action); }
}
function nul(text) { return text.split('\0').filter(Boolean); }
async function assertNoUrlRewrites(root, run) {
  let keys;
  try { keys = await run(root, ['config', '--name-only', '--get-regexp', '^url\\.']); }
  catch (error) { if (error.code === 1) return; throw error; }
  if (keys.split('\n').some(key => /\.(?:insteadof|pushinsteadof)$/i.test(key))) {
    throw new Error('Git URL rewriting is configured. Use a Git configuration without insteadOf or pushInsteadOf rules, then review the ordinary GitHub HTTPS destination again.');
  }
}
async function inspect(project, run) {
  const root = await core.assertRepositoryRoot(project, run);
  await assertNoUrlRewrites(root, run);
  if (!(await fs.stat(path.join(root, 'zero.json'))).isFile()) throw new Error('Open a standalone student project containing zero.json.');
  const gitDir = await run(root, ['rev-parse', '--absolute-git-dir']);
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG']) {
    try { await fs.access(path.join(gitDir, marker)); throw new Error('Finish or cancel the current Git merge, rebase, or other operation before uploading.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let branch;
  try { branch = await run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']); }
  catch { throw new Error('This project has a detached HEAD. Switch to your student branch before uploading.'); }
  if (!branch || branch.startsWith('-')) throw new Error('Choose a normal named Git branch before uploading.');
  let head = null;
  try { head = await run(root, ['rev-parse', '--verify', 'HEAD']); }
  catch (error) { if (error.code !== 128) throw error; }
  let urls, pushUrls;
  try {
    urls = (await run(root, ['remote', 'get-url', '--all', 'origin'])).split('\n');
    pushUrls = (await run(root, ['remote', 'get-url', '--push', '--all', 'origin'])).split('\n');
  } catch { throw new Error('Connect this student project to its GitHub repository before uploading.'); }
  if (urls.length !== 1 || pushUrls.length !== 1) throw new Error('Origin has multiple destinations. Use one GitHub HTTPS repository for fetching and pushing.');
  const repository = core.parseRepositoryUrl(urls[0]);
  if (core.parseRepositoryUrl(pushUrls[0]).remote !== repository.remote) throw new Error('Origin pushes to a different repository. Correct its push URL before uploading.');
  if (await run(root, ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'])) throw new Error('Ignored files are already staged or tracked. Remove them from Git tracking before uploading; local ignored files will be preserved.');
  const entries = nul(await run(root, ['ls-files', '--stage', '-z']));
  if (entries.some(entry => entry.startsWith('160000 '))) throw new Error('Nested repositories or submodules are not supported. Open a standalone student project.');
  const status = await run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  // NUL-delimited output is kept raw so leading spaces in filenames survive.
  const records = nul(status);
  const changes = [];
  for (let i = 0; i < records.length; i++) {
    const entry = records[i];
    const kind = entry.slice(0, 2);
    const filename = entry.slice(3);
    if (/U|AA|DD/.test(kind)) throw new Error('Resolve Git conflicts before uploading.');
    changes.push({path: filename, kind: kind.trim()});
    if (/[RC]/.test(kind)) changes.push({path: records[++i], kind: 'previous path'});
  }
  const files = nul(await run(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).sort();
  const digest = crypto.createHash('sha256');
  for (const filename of files) {
    const absolute = path.resolve(root, filename);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Git includes a path outside the student project.');
    // Detect repositories even when Git represents the directory as untracked.
    for (let directory = absolute; directory !== root; directory = path.dirname(directory)) {
      try { await fs.access(path.join(directory, '.git')); throw new Error('Nested repositories are not supported. Open a standalone student project.'); }
      catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    }
    try {
      const stat = await fs.lstat(absolute);
      digest.update(filename).update('\0');
      if (stat.isSymbolicLink()) digest.update(await fs.readlink(absolute));
      else if (stat.isFile()) digest.update(await fs.readFile(absolute));
      else throw new Error('Nested repositories or special files are not supported.');
      digest.update(String(stat.mode));
    } catch (error) { if (error.code === 'ENOENT') continue; else throw error; }
    digest.update('\0');
  }
  const contentFingerprint = digest.copy().digest('hex');
  digest.update(await run(root, ['diff', '--binary']));
  digest.update(await run(root, ['diff', '--cached', '--binary']));
  return {root, canonicalPage: repository.page, page: repository.page, remote: repository.remote, branch, head, status, changes, contentFingerprint, fingerprint: digest.digest('hex')};
}
async function prepareUpload(project, run = core.git) {
  const state = await inspect(project, run);
  const plan = Object.freeze({...state, changes: Object.freeze(state.changes.map(change => Object.freeze(change))), guards: Object.freeze({exactRoot: true, singleOrigin: true, sourceFingerprint: state.fingerprint}), summary: state.changes.length ? `${state.changes.length} changed path(s) to save on ${state.branch}` : `No file changes; upload branch ${state.branch}`});
  reviewedPlans.add(plan);
  return plan;
}
function sameReview(plan, current) {
  return ['root', 'remote', 'branch', 'head', 'status', 'fingerprint'].every(key => plan[key] === current[key]);
}
async function uploadPrepared(plan, message, {run = core.git, onProgress = () => {}} = {}) {
  if (!reviewedPlans.has(plan)) throw new Error('Review the project upload before continuing.');
  if (typeof message !== 'string' || !message.trim() || message.includes('\0')) throw new Error('Enter a short commit message describing your changes.');
  const current = await inspect(plan.root, run);
  if (!sameReview(plan, current)) throw new Error('The project, branch, repository, or files changed after review. Review the upload again.');
  let committed = false;
  if (plan.changes.length) {
    onProgress('Saving the reviewed project changes in Git…');
    await core.assertRepositoryRoot(plan.root, run);
    const indexed = new Set(nul(await run(plan.root, ['ls-files', '--cached', '-z'])));
    const paths = [];
    for (const filename of new Set(plan.changes.map(change => change.path))) {
      if (indexed.has(filename)) paths.push(filename);
      else {
        try { await fs.lstat(path.join(plan.root, filename)); paths.push(filename); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    // Already staged deletions/rename sources no longer exist in the index.
    if (paths.length) await execute(run, plan.root, ['--literal-pathspecs', 'add', '-A', '--', ...paths], 'stage the reviewed files');
    const staged = await inspect(plan.root, run);
    if (staged.contentFingerprint !== plan.contentFingerprint || staged.head !== plan.head || staged.remote !== plan.remote || staged.branch !== plan.branch) throw new Error('The project changed while staging. Review the upload again before committing.');
    await core.assertRepositoryRoot(plan.root, run);
    await execute(run, plan.root, ['commit', '-m', message.trim()], 'commit the reviewed files');
    committed = true;
  }
  const ready = await inspect(plan.root, run);
  if (ready.remote !== plan.remote || ready.branch !== plan.branch || ready.contentFingerprint !== plan.contentFingerprint || ready.status) throw new Error('The project changed while saving. Review again before pushing. Your local Git commit is preserved.');
  if (!ready.head) throw new Error('There is no commit to upload. Add your project files and review again.');
  onProgress('Uploading your branch to GitHub…');
  await core.assertRepositoryRoot(plan.root, run);
  await assertNoUrlRewrites(plan.root, run);
  // Capture both the reviewed destination and commit, independent of later
  // origin/HEAD changes. Never force, create a remote, or rebase.
  await execute(run, plan.root, ['push', plan.remote, `${ready.head}:refs/heads/${plan.branch}`], 'push the student branch');
  onProgress('Checking the branch on GitHub…');
  await assertNoUrlRewrites(plan.root, run);
  const remoteHead = await execute(run, plan.root, ['ls-remote', '--heads', plan.remote, `refs/heads/${plan.branch}`], 'confirm the GitHub branch');
  const rows = remoteHead.split('\n').filter(Boolean);
  if (rows.length !== 1 || rows[0].split(/\s+/)[0] !== ready.head || rows[0].split(/\s+/)[1] !== `refs/heads/${plan.branch}`) throw new Error('GitHub did not confirm this commit on your branch. Check the repository before trying again. Nothing was confirmed uploaded.');
  const final = await inspect(plan.root, run);
  if (final.head !== ready.head || final.status || final.remote !== plan.remote || final.branch !== plan.branch) throw new Error('The local project changed during upload. Review again to check which changes still need uploading.');
  return Object.freeze({uploaded: true, simulation: false, page: plan.page, canonicalPage: plan.page, branch: plan.branch, head: ready.head, committed});
}
module.exports = {prepareUpload, uploadPrepared};
