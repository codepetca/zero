'use strict';
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./core');
const {assertShareable} = require('./lesson-projects');
const reviewedPlans = new WeakSet();
const localPlans = new WeakSet();

// Deliberately omit raw Git stderr: credential helpers can include private data.
function gitError(error, action) {
  const detail = String(error.stderr || error.message || '');
  const safe = (kind, message) => Object.assign(new Error(message), {kind});
  if (/identity unknown|unable to auto-detect email|user\.email|user\.name/i.test(detail)) return safe('changed', 'Git needs your name and email. Configure your Git identity for this student repository, then review the upload again.');
  if (error.kind === 'protected' || /protected branch|protected branch hook|GH006|GH013|repository rule|rule violations|pre-receive hook declined/i.test(detail)) return safe('protected', 'GitHub protected this branch. Your local commit is preserved. Check the repository rules before uploading again.');
  if (error.kind === 'behind' || /non-fast-forward|fetch first|rejected.*behind/i.test(detail)) return safe('behind', 'GitHub has changes that are not in your local branch. Sync from GitHub, resolve any conflicts, then Run and review again. Nothing was confirmed uploaded.');
  if (/publishing was cancelled/i.test(detail)) return safe('changed', 'Publishing was cancelled. Review the upload again.');
  if (/Live (?:publishing|Git actions|uploads) (?:was|were) disabled/i.test(detail)) return safe('changed', 'Live Git actions were disabled. Review the upload again.');
  if (error.kind === 'changed' || /account or sign-in changed|sign-in changed|project changed|changed after review/i.test(detail)) return safe('changed', 'Your project, GitHub account or sign-in changed. Review this step again.');
  if (error.kind === 'auth' || /authentication|credential|could not read username|terminal prompts disabled|\b401\b|sign in to GitHub/i.test(detail)) return safe('auth', 'GitHub authentication failed. Sign in to GitHub in Zero through VS Code, then review again.');
  if (error.kind === 'access' || /permission|\b403\b|denied|repository not found|refused access/i.test(detail)) return safe('access', 'GitHub refused access. Check that the connected repository exists and your GitHub account has permission to push.');
  if (error.kind === 'unconfirmed' || /did not confirm|unexpected remote response/i.test(detail)) return safe('unconfirmed', 'GitHub did not confirm this commit on your branch. Check the upload before trying again. Nothing was confirmed uploaded.');
  return safe('network', `GitHub transport failed. Git could not ${action}. Check the repository URL and network, then review again. Nothing was confirmed uploaded.`);
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
    throw Object.assign(new Error('Git URL rewriting is configured. Use a Git configuration without insteadOf or pushInsteadOf rules, then review the ordinary GitHub HTTPS destination again.'), {kind: 'changed'});
  }
}
async function localRepositoryRoot(project,run) {
  await assertShareable(project);
  return core.inspectGitLayout(project,run);
}
async function inspect(project, run, {allowMissingRemote=false}={}) {
  const layout=allowMissingRemote?await localRepositoryRoot(project,run):undefined;
  const root = layout?layout.root:await core.assertRepositoryRoot(project, run);
  await assertNoUrlRewrites(root, run);
  if (!(await fs.stat(path.join(root, 'zero.json'))).isFile()) throw new Error('Open a standalone student project containing zero.json.');
  const gitDir = layout?.gitDir ?? await run(root, ['rev-parse', '--absolute-git-dir']);
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG']) {
    try { await fs.access(path.join(gitDir, marker)); throw new Error('Finish or cancel the current Git merge, rebase, or other operation before uploading.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let branch;
  try { branch = await core.currentBranch(root,run); }
  catch (error) { if(error.code!==1)throw error;throw new Error('This project has a detached HEAD. Switch to your student branch before uploading.'); }
  if (!branch || branch.startsWith('-')) throw new Error('Choose a normal named Git branch before uploading.');
  let head = null;
  try { head = await run(root, ['rev-parse', '--verify', 'HEAD']); }
  catch (error) { if (error.code !== 128) throw error; }
  let urls, pushUrls,repository;
  try {
    const [fetchUrl,pushUrl] = await Promise.all([
      run(root, ['remote', 'get-url', '--all', 'origin']),
      run(root, ['remote', 'get-url', '--push', '--all', 'origin'])
    ]);
    urls = fetchUrl.split('\n');
    pushUrls = pushUrl.split('\n');
  } catch {
    const remotes=(await run(root,['remote'])).split('\n').filter(Boolean);
    if(!allowMissingRemote||remotes.includes('origin'))throw new Error('Connect this student project to its GitHub repository before uploading.');
  }
  if(urls) {
    if (urls.length !== 1 || pushUrls.length !== 1) throw new Error('Origin has multiple destinations. Use one GitHub HTTPS repository for fetching and pushing.');
    repository = core.parseRepositoryUrl(urls[0]);
    if (core.parseRepositoryUrl(pushUrls[0]).remote !== repository.remote) throw new Error('Origin pushes to a different repository. Correct its push URL before uploading.');
  } else repository={page:null,remote:null};
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
      const content = crypto.createHash('sha256');
      let type;
      if (stat.isSymbolicLink()) { type = 'symlink'; content.update(await fs.readlink(absolute)); }
      else if (stat.isFile()) {
        type = 'file';
        // Stream assets in bounded chunks; review memory must not grow with
        // the size of a student's picture, audio file, or other resource.
        for await (const chunk of createReadStream(absolute, {highWaterMark: 64 * 1024})) content.update(chunk);
      }
      else throw new Error('Nested repositories or special files are not supported.');
      digest.update(JSON.stringify([filename, type, stat.mode, content.digest('hex')])).update('\0');
    } catch (error) { if (error.code === 'ENOENT') continue; else throw error; }
  }
  const contentFingerprint = digest.copy().digest('hex');
  // Index entries contain exact blob IDs, modes, stages and paths. Together
  // with the working-byte hash and separately checked HEAD/status, they detect
  // index-only edits without producing an asset-sized Git binary patch.
  digest.update(JSON.stringify(entries));
  if(layout&&(await core.inspectGitLayout(root,run)).identity!==layout.identity)throw new Error('The project Git metadata changed after review. Review the commit again.');
  return {root, canonicalPage: repository.page, page: repository.page, remote: repository.remote, branch, head, status, changes, contentFingerprint, fingerprint: digest.digest('hex'),...(layout?{repositoryIdentity:layout.identity}:{})};
}
async function prepareUpload(project, run = core.git) {
  await assertShareable(project);
  const state = await inspect(project, run);
  const plan = Object.freeze({...state, changes: Object.freeze(state.changes.map(change => Object.freeze(change))), guards: Object.freeze({exactRoot: true, singleOrigin: true, sourceFingerprint: state.fingerprint}), summary: state.changes.length ? `${state.changes.length} changed path(s) to save on ${state.branch}` : `No file changes; upload branch ${state.branch}`});
  reviewedPlans.add(plan);
  return plan;
}
async function prepareLocalCommit(project,run=core.git) {
  const state=await inspect(project,run,{allowMissingRemote:true});
  const plan=Object.freeze({...state,changes:Object.freeze(state.changes.map(change=>Object.freeze(change)))});
  reviewedPlans.add(plan);localPlans.add(plan);return plan;
}
function sameReview(plan, current) {
  return ['root', 'remote', 'branch', 'head', 'status', 'fingerprint','repositoryIdentity'].every(key => plan[key] === current[key]);
}
function remoteBranchHead(response, branch) {
  const rows = typeof response === 'string' ? response.trim().split('\n').filter(Boolean) : null;
  if (!rows || rows.length > 1 || rows.some(row => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})\t/.test(row) || row.split('\t').length !== 2 || row.split('\t')[1] !== `refs/heads/${branch}`)) throw Object.assign(new Error('GitHub did not confirm this commit.'), {kind: 'unconfirmed'});
  return rows.length ? rows[0].split('\t')[0] : null;
}
async function uploadPrepared(plan, message, {run = core.git, networkRun, beforeUpload = async () => {}, onProgress = () => {}, localOnly = false, withLocalMutation} = {}) {
  if (plan?.root) await assertShareable(plan.root);
  // Production uploads require the guarded authentication transport. The
  // injectable run fallback is retained for isolated Git test doubles only.
  if (!localOnly && run === core.git && typeof networkRun !== 'function') throw new Error('A guarded GitHub connection is required.');
  const network = networkRun || ((root, args) => execute(run, root, args, 'upload or confirm the GitHub branch'));
  if (!reviewedPlans.has(plan)) throw new Error('Review the project upload before continuing.');
  if(localPlans.has(plan)&&!localOnly)throw new Error('Review the GitHub destination before uploading.');
  if (!localOnly && plan.changes.length && run === core.git && typeof withLocalMutation !== 'function') throw new Error('A guarded local commit is required before uploading.');
  if (typeof message !== 'string' || !message.trim() || message.includes('\0')) throw new Error('Enter a short commit message describing your changes.');
  if(localOnly && !plan.changes.length)throw new Error('There are no changes to commit.');
  await beforeUpload();
  const rootGuard=async()=>{
    if(!localPlans.has(plan))return core.assertRepositoryRoot(plan.root,run);
    if((await localRepositoryRoot(plan.root,run)).identity!==plan.repositoryIdentity)throw new Error('The project Git metadata changed after review. Review the commit again.');
  };
  const inspection=()=>inspect(plan.root,run,{allowMissingRemote:localPlans.has(plan)});
  const current = await inspection();
  if (!sameReview(plan, current)) throw new Error('The project, branch, repository, or files changed after review. Review the upload again.');
  let committed = false;
  let stagingAttempted = false, commitAttempted = false;
  let recovery;
  let pushStarted = false;
  let pushCompleted = false;
  try {
    const saveLocal = async binding => {
    if (!localOnly && withLocalMutation) {
      await beforeUpload();
      if (!sameReview(plan,await inspection())) throw new Error('The project, branch, repository, or files changed after review. Review the upload again.');
    }
    if (plan.changes.length) {
      onProgress('Saving the reviewed project changes in Git…');
      await rootGuard();
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
      await beforeUpload();
      await rootGuard();
      binding?.assertCurrentNow();
      stagingAttempted = true;
      if (paths.length) await execute(run, plan.root, ['--literal-pathspecs', 'add', '-A', '--', ...paths], 'stage the reviewed files');
      const staged = await inspection();
      if (staged.contentFingerprint !== plan.contentFingerprint || staged.head !== plan.head || staged.remote !== plan.remote || staged.branch !== plan.branch || staged.repositoryIdentity!==plan.repositoryIdentity) throw new Error('The project changed while staging. Review the upload again before committing.');
      await rootGuard();
      const tree = await run(plan.root, ['write-tree']);
      await beforeUpload();
      await rootGuard();
      // Guards can await editor/account state while another Git writer acts.
      // Recheck the exact staged tree and selected branch/parent afterward.
      // This is still not atomic with an uncooperative external Git process.
      const commitBranch=await core.currentBranch(plan.root,run);
      let commitHead=null;
      try {commitHead=await run(plan.root,['rev-parse','--verify','HEAD']);}
      catch(error){if(error.code!==128)throw error;}
      if(commitBranch!==plan.branch||commitHead!==plan.head||await run(plan.root,['write-tree'])!==tree)throw new Error('The project or staged changes changed before committing. Review the commit again.');
      binding?.assertCurrentNow();
      commitAttempted = true;
      await execute(run, plan.root, ['commit', '-m', message.trim()], 'commit the reviewed files');
      committed = true;
      const head = await run(plan.root, ['rev-parse', '--verify', 'HEAD^{commit}']);
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head) || await run(plan.root, ['rev-parse', `${head}^{tree}`]) !== tree) throw new Error('The project changed while saving. Review again before pushing.');
      const lineage = (await run(plan.root, ['rev-list', '--parents', '-n', '1', head])).split(' ');
      if (lineage.length !== (plan.head ? 2 : 1) || (plan.head && lineage[1] !== plan.head)) throw new Error('The project changed while saving. Review again before pushing.');
      recovery = {root: plan.root, remote: plan.remote, page: plan.page, branch: plan.branch, head, committed};
    }
    const ready = await inspection();
    if (!recovery && ready.head && ready.head === plan.head) recovery = {root: plan.root, remote: plan.remote, page: plan.page, branch: plan.branch, head: ready.head, committed};
    if (ready.remote !== plan.remote || ready.branch !== plan.branch || ready.contentFingerprint !== plan.contentFingerprint || ready.status || ready.repositoryIdentity!==plan.repositoryIdentity) throw new Error('The project changed while saving. Review again before pushing. Your local Git commit is preserved.');
    if (!ready.head) throw new Error('There is no commit to upload. Add your project files and review again.');
    if (ready.head !== recovery?.head) throw new Error('The project changed while saving. Review again before pushing. Your local Git commit is preserved.');
    binding?.assertCurrentNow();
    return ready;
    };
    const ready = !localOnly && plan.changes.length && withLocalMutation
      ? await withLocalMutation(plan.root,saveLocal)
      : await saveLocal();
    if(localOnly) return Object.freeze({uploaded:false,simulation:false,page:plan.page,branch:plan.branch,head:ready.head,committed:true});
    onProgress('Pushing your branch to GitHub…');
    await core.assertRepositoryRoot(plan.root, run);
    await assertNoUrlRewrites(plan.root, run);
    // Capture both the reviewed destination and commit, independent of later
    // origin/HEAD changes. Never force, create a remote, or rebase.
    pushStarted = true;
    await network(plan.root, ['push', plan.remote, `${ready.head}:refs/heads/${plan.branch}`]);
    pushCompleted = true;
    onProgress('Checking the branch on GitHub…');
    await assertNoUrlRewrites(plan.root, run);
    const remoteHead = await network(plan.root, ['ls-remote', '--heads', plan.remote, `refs/heads/${plan.branch}`]);
    if (remoteBranchHead(remoteHead, plan.branch) !== ready.head) throw new Error('GitHub did not confirm this commit on your branch. Check the repository before trying again. Nothing was confirmed uploaded.');
    // Remote success is already established. Later local drift cannot undo it or
    // turn a successful upload into a retry that might upload different work.
    let localChanged = false;
    try {
      const final = await inspect(plan.root, run);
      localChanged = final.head !== ready.head || Boolean(final.status) || final.remote !== plan.remote || final.branch !== plan.branch;
    } catch { localChanged = true; }
    return Object.freeze({uploaded: true, simulation: false, page: plan.page, canonicalPage: plan.page, branch: plan.branch, head: ready.head, committed,
      ...(localChanged ? {localChanged: true, warning: 'This commit was confirmed on GitHub. The local project changed during upload; review any newer work separately.'} : {})});
  } catch (error) {
    if (!recovery && committed) {
      // Git reported a successful commit, but verification failed before we
      // could bind it to the reviewed tree and parent. Do not claim a SHA or
      // offer an automatic retry for an unverified commit.
      const uncertain = new Error('Git reported that a commit was saved locally, but Zero could not verify it. Review project history before syncing.');
      uncertain.localCommitUncertain = Object.freeze({root: plan.root, branch: plan.branch});
      if(error.recoveryPath)uncertain.recoveryPath=error.recoveryPath;
      throw uncertain;
    }
    if (!recovery && stagingAttempted) {
      const message = commitAttempted ? 'Git could not confirm whether a commit was made. Review project history and staged changes before trying again.' : 'No commit was made; your changes may remain staged in Source Control. Review them before trying again.';
      const detail=commitAttempted && error.kind ? ` ${error.message}` : '';
      throw Object.assign(new Error(message+detail), {kind:error.kind || 'changed',...(error.recoveryPath?{recoveryPath:error.recoveryPath}:{})});
    }
    if (!recovery) throw error.stderr ? gitError(error, 'save the reviewed commit') : error;
    if (localOnly) {
      const safe = new Error('The commit was saved locally, but the project changed while it was being checked. Review your newer changes before syncing.');
      safe.localCommitRecovery = Object.freeze({root: recovery.root, branch: recovery.branch, head: recovery.head});
      if(error.recoveryPath)safe.recoveryPath=error.recoveryPath;
      throw safe;
    }
    let safe = gitError(error, 'upload or confirm the GitHub branch');
    if (error.pushNotStarted) pushStarted = false;
    if (error.recoveryPath) {safe.recoveryPath = error.recoveryPath;safe.message = error.message;}
    if (pushCompleted && safe.kind === 'network') safe = gitError({kind: 'unconfirmed'}, 'confirm the GitHub branch');
    // A rejected confirmation says nothing about whether the preceding push
    // reached GitHub. Keep the original destination and saved commit only.
    safe.uploadRecovery = Object.freeze({...recovery, pushStarted, kind: safe.kind});
    throw safe;
  }
}

// Publish the already-committed branch head without staging or committing the
// student's in-progress edits. Used after creating a branch and for retries.
async function syncExistingHead(plan,{run=core.git,networkRun,beforeUpload=async()=>{},onProgress=()=>{}}={}) {
  if(!reviewedPlans.has(plan)||localPlans.has(plan)||!plan.head)throw new Error('Review a connected branch with a saved commit before syncing.');
  if(typeof networkRun!=='function')throw new Error('A guarded GitHub connection is required.');
  await beforeUpload();const current=await inspect(plan.root,run);
  if(!sameReview(plan,current))throw new Error('The project, branch, repository, or files changed after review. Review the sync again.');
  const recovery={root:plan.root,remote:plan.remote,page:plan.page,branch:plan.branch,head:plan.head,committed:false};
  let pushStarted=false,pushCompleted=false;
  try {
    await core.assertRepositoryRoot(plan.root,run);await assertNoUrlRewrites(plan.root,run);await beforeUpload();
    if(!sameReview(plan,await inspect(plan.root,run)))throw new Error('The project changed before syncing.');
    onProgress('Syncing your branch to GitHub…');pushStarted=true;
    await networkRun(plan.root,['push',plan.remote,`${plan.head}:refs/heads/${plan.branch}`]);pushCompleted=true;
    await beforeUpload();await assertNoUrlRewrites(plan.root,run);
    const confirmed=await networkRun(plan.root,['ls-remote','--heads',plan.remote,`refs/heads/${plan.branch}`]);
    if(remoteBranchHead(confirmed,plan.branch)!==plan.head)throw Object.assign(new Error('GitHub did not confirm this commit.'),{kind:'unconfirmed'});
    let localChanged=false;try{const now=await inspect(plan.root,run);localChanged=!sameReview(plan,now);}catch{localChanged=true;}
    return Object.freeze({uploaded:true,committed:false,branch:plan.branch,head:plan.head,page:plan.page,localChanged});
  } catch(error) {
    let safe=gitError(error,'sync or confirm the GitHub branch');if(pushCompleted&&safe.kind==='network')safe=gitError({kind:'unconfirmed'},'confirm the GitHub branch');
    if(error.pushNotStarted)pushStarted=false;
    if(error.recoveryPath){safe.recoveryPath=error.recoveryPath;safe.message=error.message;}
    safe.uploadRecovery=Object.freeze({...recovery,pushStarted,kind:safe.kind});throw safe;
  }
}

function recoveryChanged() { return Object.assign(new Error('The saved upload no longer matches this project, branch or GitHub destination. Review the upload again.'), {kind: 'changed'}); }
function validBranch(branch) {
  return core.validBranchName(branch);
}
async function uploadDestination(project, record, run) {
  try {
    const root = await core.assertRepositoryRoot(project, run);
    if (root !== record.root) throw recoveryChanged();
    await assertNoUrlRewrites(root, run);
    if (!(await fs.stat(path.join(root, 'zero.json'))).isFile()) throw recoveryChanged();
    if (await core.currentBranch(root,run) !== record.branch) throw recoveryChanged();
    const urls = (await run(root, ['remote', 'get-url', '--all', 'origin'])).split('\n');
    const pushUrls = (await run(root, ['remote', 'get-url', '--push', '--all', 'origin'])).split('\n');
    if (urls.length !== 1 || pushUrls.length !== 1 || core.parseRepositoryUrl(urls[0]).remote !== record.remote || core.parseRepositoryUrl(pushUrls[0]).remote !== record.remote) throw recoveryChanged();
    // Resolve only a validated full object ID. No fetch, checkout, staging or ref
    // update is needed, and newer local commits/files remain intact.
    let partial;
    try { partial = await run(root, ['config', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$']); }
    catch (error) { if (error.code !== 1) throw error; }
    if (partial || await run(root, ['--no-replace-objects', 'cat-file', '-t', record.head]) !== 'commit') throw recoveryChanged();
    return root;
  } catch { throw recoveryChanged(); }
}
async function checkUpload(project, record, {run = core.git, networkRun, beforeNetwork = async () => {}} = {}) {
  try {
    // Snapshot selected fields before validation or asynchronous work; workspace
    // state supplies data only, never executable Git options or a new URL.
    record = record && Object.freeze({root: record.root, remote: record.remote, page: record.page, branch: record.branch, head: record.head, committed: record.committed, pushStarted: record.pushStarted});
    if (!record || typeof record.root !== 'string' || !path.isAbsolute(record.root) || typeof record.head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.head) || !validBranch(record.branch) || typeof record.committed !== 'boolean' || typeof record.pushStarted !== 'boolean') throw recoveryChanged();
    let destination;
    try { destination = core.parseRepositoryUrl(record.remote); } catch { throw recoveryChanged(); }
    if (destination.remote !== record.remote || destination.page !== record.page) throw recoveryChanged();
    await uploadDestination(project, record, run);
    await beforeNetwork();
    const root = await uploadDestination(project, record, run);
    const network = networkRun || ((cwd, args) => execute(run, cwd, args, 'confirm the GitHub branch'));
    const response = await network(root, ['ls-remote', '--heads', record.remote, `refs/heads/${record.branch}`]);
    await beforeNetwork();
    await uploadDestination(project, record, run);
    const remoteHead = remoteBranchHead(response, record.branch);
    if (remoteHead !== record.head) return Object.freeze({confirmed: false, remoteHead, kind: 'unconfirmed'});
    return Object.freeze({confirmed: true, head: record.head, branch: record.branch, remote: record.remote, page: record.page, canonicalPage: record.page, committed: record.committed});
  } catch (error) {
    // Saved state and local Git failures may contain arbitrary text. Return only
    // bounded diagnostics and never persist a child error or its stderr.
    const safe = error.kind === 'changed' ? recoveryChanged() : gitError(error, 'confirm the GitHub branch');
    throw safe;
  }
}
module.exports = {prepareUpload, prepareLocalCommit, uploadPrepared, syncExistingHead, checkUpload, assertNoUrlRewrites, gitError, validBranch};
