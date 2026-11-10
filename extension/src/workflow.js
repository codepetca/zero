'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./core');
const recovery = require('./git-update-recovery');
const {guardedRunner, refuseUnsafeUpdateConversions} = require('./git-filter-guard');
const os = require('node:os');
const crypto = require('node:crypto');
const {createReadStream,constants} = require('node:fs');
const {assertShareable} = require('./lesson-projects');
const {prepareUpload, assertNoUrlRewrites, validBranch} = require('./github');
const {finishMessage,readFinishedBranch,validFinishedBranch}=require('./finished-change-marker');
const {updateDirectMain,checkoutDirectMain,preflightDirectMain,attachSameTreeMain,deleteDirectFeature}=require('./direct-main-transaction');
// Only equal-tree, ref-only fast-forwards may use this path.
const ENABLE_REFTABLE_REF_ONLY = true;
const plans = new WeakSet();
const finishedBranchCleanups = new WeakMap();
const finishedBranchCleanupLayouts = new WeakMap();
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const switchEnvironment=()=>({...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_ATTR_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:''});
const startCheckoutEnvironment=()=>({...switchEnvironment(),GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'core.attributesFile',GIT_CONFIG_VALUE_0:os.devNull,GIT_CONFIG_KEY_1:'core.fsmonitor',GIT_CONFIG_VALUE_1:'false'});
const nativeUpdateHandoff = message => Object.assign(new Error(message), {nativeUpdateHandoff:true});
const drift = () => new Error('The project, branch, main, repository, or files changed after review. Review this step again. Your commits are preserved.');
function safeRunner(run) {
  return async (root, args, options) => {
    let index=0;while(index<args.length){if(args[index]==='-c'){index+=2;continue;}if(['--no-replace-objects','--literal-pathspecs'].includes(args[index])){index++;continue;}break;}
    const readOnlyStatus=args[index]==='status',effective=readOnlyStatus?{...options,env:{...(options?.env||process.env),GIT_OPTIONAL_LOCKS:'0'}}:options;
    try { return await run(root, args, effective); }
    catch (failure) {
      const error = new Error('Git could not inspect or update this project. Check native Source Control, then review again. Your files and commits are preserved.');
      error.code = failure.code;
      throw error;
    }
  };
}
// Finish graph and tree reads must agree with the no-replacement view used by
// the locked transaction, including when callers supply an isolated env.
function finishRunner(run) {
  return (root,args,options)=>run(root,args,{...options,env:{...(options?.env||process.env),GIT_NO_REPLACE_OBJECTS:'1'}});
}
async function refuseFinishReplacements(expected,run) {
  if(Object.keys(process.env).some(key=>/^(?:GIT_REPLACE_REF_BASE|GIT_GRAFT_FILE)$/i.test(key)))throw new Error('Git replacement objects or grafts require native Source Control for this merge.');
  if(await run(expected.root,['for-each-ref','--format=%(refname)','refs/replace/']))throw new Error('Git replacement objects require native Source Control for this merge.');
  try{await fs.lstat(path.join(expected.gitDir,'info','grafts'));throw new Error('Git grafts require native Source Control for this merge.');}catch(error){if(error.code!=='ENOENT')throw error;}
}

async function local(run, root, args, action, options) {
  try { return await run(root, args, options); }
  catch { throw new Error(`Git could not ${action}. Check native Source Control, then review again. Your files and commits are preserved.`); }
}
async function ancestor(run, root, older, newer) {
  try { await run(root, ['merge-base', '--is-ancestor', older, newer]); return true; }
  catch (error) { if (error.code === 1) return false; throw new Error('Git could not check commit ancestry. Check this project with native Source Control.'); }
}
async function assertDirectMain(root,run) {
  try {await run(root,['symbolic-ref','--quiet','--no-recurse','refs/heads/main']);}
  catch(error){if(error.code===1)return;throw new Error('Local main could not be verified as a direct branch. Inspect it in Source Control.');}
  throw new Error('Local main is a symbolic branch. Keep it and inspect Source Control before continuing.');
}
// Local branch creation keeps the same tree. Inspect refs and worktree state without
// reading every asset; source hashing belongs at content-changing boundaries.
async function state(project, run, {full = false, connected = false, allowMerge = false, localOnly = false} = {}) {
  let root;
  if(localOnly){
    root=await fs.realpath(project);const actual=await core.repositoryRoot(root,run);
    if(actual!==root)throw new Error(actual?'This project is inside a different Git repository. Open a standalone student copy.':'Open a standalone student project.');
    let dot;try{dot=await fs.lstat(path.join(root,'.git'));}catch(error){if(error.code==='ENOENT')throw new Error('Open a standalone student project.');throw error;}
    if(root!==project||!dot.isDirectory()||dot.isSymbolicLink())throw new Error('Open a standalone student project.');
  }
  else root = await core.assertRepositoryRoot(project, run);
  if (!(await fs.stat(path.join(root, 'zero.json'))).isFile()) throw new Error('Open a standalone student project containing zero.json.');
  const [gitDir, commonDir, listedWorktrees] = await Promise.all([
    run(root, ['rev-parse', '--absolute-git-dir']),
    run(root, ['rev-parse', '--git-common-dir']),
    run(root, ['worktree', 'list', '--porcelain'])
  ]);
  const worktrees = listedWorktrees.split('\n').filter(line => line.startsWith('worktree ')).join('\n');
  if (await fs.realpath(path.resolve(root, commonDir)) !== await fs.realpath(gitDir) ||
      worktrees.split('\n').filter(line => line.startsWith('worktree ')).length !== 1) {
    throw new Error('This project uses multiple Git worktrees. Use a standalone student repository for New branch and Merge to main.');
  }
  for (const marker of [...(allowMerge ? [] : ['MERGE_HEAD']), 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG']) {
    try { await fs.access(path.join(gitDir, marker)); throw new Error('Finish or cancel the current Git merge, rebase, or other operation before continuing.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const gitDirectory=await fs.realpath(gitDir);
  let refs,repository;
  if(localOnly){
    [refs,repository]=await Promise.all([
      readWorkflowRefs(root,run),
      readWorkflowOrigin(root,run,connected||full)
    ]);
    // Keep this immediately before status, which can invoke a clean filter.
    await noExternalCheckoutFilters({root,gitDir:gitDirectory},run);
  }else{
    refs=await readWorkflowRefs(root,run);
    repository=await readWorkflowOrigin(root,run,connected||full);
  }
  const statusArgs=['status','--porcelain=v1','-z','--untracked-files=all'];
  const status=localOnly?await run(root,['-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...statusArgs],{env:switchEnvironment()}):await run(root,['-c','core.fsmonitor=false',...statusArgs]);
  if ((await run(root, ['ls-files', '--stage', '-z'])).split('\0').some(entry => entry.startsWith('160000 '))) throw new Error('Nested repositories or submodules are not supported. Open a standalone student project.');
  const current = {root, ...repository, ...refs, status, gitDir: await fs.realpath(gitDir), worktrees};
  if (!full) return current;
  const source = await prepareUpload(root, (cwd,args,options)=>run(cwd,args[0]==='status'?['-c','core.fsmonitor=false',...args]:args,options));
  if (!['root', 'page', 'remote', 'branch', 'head', 'status'].every(key => source[key] === current[key])) throw drift();
  return {...source, ...current};
}
async function readWorkflowRefs(root,run) {
  let branch;
  try { branch = await core.currentBranch(root,run); }
  catch (error) { if(error.code!==1)throw error;throw new Error('This project has a detached HEAD. Switch to your student branch before continuing.'); }
  if (!branch || branch.startsWith('-')) throw new Error('Choose a normal named Git branch.');
  const [head, mainHead] = await Promise.all([
    run(root, ['rev-parse', '--verify', 'HEAD^{commit}']).catch(error=>{
      if(error.code===128)return null;
      throw error;
    }),
    run(root, ['rev-parse', '--verify', 'refs/heads/main^{commit}']).catch(error=>{
      if(error.code===128)return null;
      throw new Error('Git could not inspect main. Check native Source Control.');
    })
  ]);
  if (head && !shaPattern.test(head) || mainHead && !shaPattern.test(mainHead)) throw new Error('Git returned an unexpected commit. Check native Source Control.');
  if(mainHead)await assertDirectMain(root,run);
  return {branch,head,mainHead};
}
async function readWorkflowOrigin(root,run,requireOrigin) {
  await assertNoUrlRewrites(root,run);
  let repository = {page: null, remote: null};
  const remotes = (await run(root, ['remote'])).split('\n');
  if (remotes.includes('origin')) {
    const [fetch, push] = await Promise.all([
      run(root, ['remote', 'get-url', '--all', 'origin']),
      run(root, ['remote', 'get-url', '--push', '--all', 'origin'])
    ]);
    const urls = fetch.split('\n'), pushUrls = push.split('\n');
    if (urls.length !== 1 || pushUrls.length !== 1) throw new Error('Origin has multiple destinations. Use one GitHub HTTPS repository for fetching and pushing.');
    repository = core.parseRepositoryUrl(urls[0]);
    if (core.parseRepositoryUrl(pushUrls[0]).remote !== repository.remote) throw new Error('Origin pushes to a different repository. Correct its push URL before continuing.');
  } else if (requireOrigin) throw new Error('Connect this student project to its GitHub repository before syncing or merging.');
  return repository;
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
async function recheck(expected, run, {full = false,localOnly=false} = {}) {
  const current = await state(expected.root, run, {full,localOnly});
  if (!same(expected, current) || full && expected.fingerprint !== current.fingerprint) throw drift();
  return current;
}
async function advanceMain(expected,next,previous,opts,action) {
  try {const allowReftable=opts.refStorage==='reftable';const format=await preflightDirectMain(expected.root,expected.gitDir,{run:opts.run,allowReftable});if(opts.refStorage&&format!==opts.refStorage)throw drift();await updateDirectMain(expected.root,next,previous,{verify:async env=>{const run=(root,args,options)=>opts.run(root,['-c','core.fsmonitor=false',...args],{...options,env});await opts.beforeMutation();await recheck(expected,run,{full:true});await assertDirectMain(expected.root,run);if(await preflightDirectMain(expected.root,expected.gitDir,{run,allowReftable,skipProbe:true})!==format)throw drift();},checkNow:opts.beforeMutationNow||(()=>{})});}
  catch(error){error.message+=` Could not safely ${action}.`;throw error;}
}
async function checkFinishStorage(expected,opts,{probe=false}={}) {
 await refuseFinishReplacements(expected,opts.run);
 const format=await preflightDirectMain(expected.root,expected.gitDir,{run:opts.run,allowReftable:true});if(opts.refStorage&&format!==opts.refStorage)throw new Error('Git reference storage changed after review. Inspect this project and review again. Your commits are preserved.');
 if(format==='reftable'&&probe)await attachSameTreeMain(expected.root,expected.mainHead,expected.branch,{probeOnly:true,verify:async env=>{const run=(root,args,options)=>opts.run(root,['-c','core.fsmonitor=false',...args],{...options,env});await opts.beforeMutation?.();await recheck(expected,run,{full:true});await assertDirectMain(expected.root,run);if(await preflightDirectMain(expected.root,expected.gitDir,{run,allowReftable:true,skipProbe:true})!=='reftable')throw drift();},checkNow:opts.beforeMutationNow||(()=>{})});
 return format;
}
async function attachFinishedMain(expected,opts) {
 await attachSameTreeMain(expected.root,expected.mainHead,expected.branch,{verify:async env=>{const run=(root,args,options)=>opts.run(root,['-c','core.fsmonitor=false',...args],{...options,env});await opts.beforeMutation();await recheck(expected,run,{full:true});await assertDirectMain(expected.root,run);await refuseFinishReplacements(expected,run);if(await preflightDirectMain(expected.root,expected.gitDir,{run,allowReftable:true,skipProbe:true})!=='reftable')throw drift();const [featureTree,mainTree]=await Promise.all([run(expected.root,['rev-parse',`${expected.head}^{tree}`]),run(expected.root,['rev-parse',`${expected.mainHead}^{tree}`])]);if(featureTree!==mainTree)throw new Error('The completed main has different files. Keep this feature and inspect Source Control.');},checkNow:opts.beforeMutationNow||(()=>{})});
}
async function checkoutMain(expected,opts) {
  await preflightDirectMain(expected.root,expected.gitDir,{run:opts.run});
  return checkoutDirectMain(expected.root,expected.mainHead,{verify:async env=>{const run=(root,args,options)=>opts.run(root,['-c','core.fsmonitor=false',...args],{...options,env});await opts.beforeMutation();await recheck(expected,run,{full:true});await assertDirectMain(expected.root,run);await preflightDirectMain(expected.root,expected.gitDir,{run});},checkNow:opts.beforeMutationNow||(()=>{}),perform:env=>local(opts.run,expected.root,['-c','core.fsmonitor=false','-c',`core.hooksPath=${os.devNull}`,'checkout','--no-overwrite-ignore','main'],'switch to completed main',{env})});
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
  const current = await state(project, run,{localOnly:true});
  if (!current.head) throw new Error('Save the initial project as a local commit on main using Source Control → Commit, then try New branch again. Pushing is not required.');
  if (!current.mainHead) throw new Error('This project needs a committed main branch. Save the initial project as a local commit on main using Source Control → Commit. Pushing is not required.');
  await validName(name, current.root, run);
  const startFingerprintValue = current.status ? await startFingerprint(current, run) : null;
  return planFor('start', current, {name, startFingerprint: startFingerprintValue, summary: `Create ${name} from your current local branch ${current.branch}.`});
}
async function switchTarget(current,name,run) {
  // Existing branches can come from other Git tools. Keep creation's simpler
  // naming convention separate from safe selection of an exact local ref.
  if(!validBranch(name)||name===current.branch)throw new Error('Choose a different valid local branch.');
  await run(current.root,['check-ref-format','--branch',name]);
  const ref=`refs/heads/${name}`;
  try {await run(current.root,['symbolic-ref','--quiet',ref]);throw new Error('A symbolic branch cannot be switched here.');}
  catch(error){if(error.code!==1)throw error;}
  const target=await run(current.root,['rev-parse','--verify',`${ref}^{commit}`]);
  if(!shaPattern.test(target))throw drift();return target;
}
async function noExternalCheckoutFilters(current,run) {
  const inspect=(root,args,options={})=>run(root,args,{...options,env:switchEnvironment()});
  let filters;try {filters=await inspect(current.root,['config','--name-only','--get-regexp','^filter\\.']);}
  catch(error){if(error.code===1)return;throw error;}
  if(!filters)return;
  // Configured filters are inert unless an attributes file activates one.
  // Permit Zero's known line-ending-only template; refuse all other attribute
  // files in either tree, the worktree, or Git's local attributes override.
  const stock=new Map([
    ['.gitattributes','* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n'],
    ['.zero-build/.gitattributes','* -text\n']
  ]);
  const attr=name=>name.split('/').some(part=>part.toLowerCase()==='.gitattributes');
  const valid=(name,bytes)=>stock.has(name)&&Buffer.isBuffer(bytes)&&
    (name==='.gitattributes'?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes.toString('utf8'))===stock.get(name);
  const custom=()=>new Error('Custom Git attributes require Source Control for switching.');
  await Promise.all([current.head,current.target].filter(Boolean).map(async tree=>{
    const rows=(await inspect(current.root,['ls-tree','-r','-z',tree])).split('\0').filter(Boolean);
    for(const row of rows) {
      const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)$/.exec(row);
      if(!match)throw new Error('This branch contains unsupported file types. Use Source Control.');
      if(attr(match[3])&&!valid(match[3],await inspect(current.root,['cat-file','blob',match[2]],{encoding:'buffer'})))throw custom();
    }
  }));
  const inventories=await Promise.all([
    inspect(current.root,['ls-files','--cached','--others','--exclude-standard','-z']),
    inspect(current.root,['ls-files','--others','--ignored','--exclude-standard','-z'])
  ]);
  const names=inventories.flatMap(entries=>entries.split('\0').filter(Boolean));
  for(const name of new Set(names.filter(attr))) {
    if(!stock.has(name))throw custom();
    const file=path.join(current.root,name),parent=path.dirname(file),directory=await fs.lstat(parent),info=await fs.lstat(file);
    if(!directory.isDirectory()||directory.isSymbolicLink()||await fs.realpath(parent)!==parent||!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>4096)throw custom();
    const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
    try {
      const opened=await handle.stat();
      if(!opened.isFile()||opened.nlink!==1||opened.dev!==info.dev||opened.ino!==info.ino||opened.size!==info.size||!valid(name,await handle.readFile()))throw custom();
      const after=await fs.lstat(file),parentAfter=await fs.lstat(parent),final=await handle.stat();
      if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||after.dev!==info.dev||after.ino!==info.ino||after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs||final.size!==info.size||final.mtimeMs!==info.mtimeMs||final.ctimeMs!==info.ctimeMs||!parentAfter.isDirectory()||parentAfter.isSymbolicLink()||parentAfter.dev!==directory.dev||parentAfter.ino!==directory.ino||await fs.realpath(parent)!==parent)throw custom();
    } finally {await handle.close();}
  }
  try {await fs.lstat(path.join(current.gitDir,'info','attributes'));throw new Error('Git info attributes require Source Control for switching.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
async function prepareSwitch(project,name,{run=core.git}={}) {
  await assertShareable(project);
  run=offlineSwitchRunner(safeRunner(run));
  const current=await state(project,run,{localOnly:true});
  const target=await switchTarget(current,name,run);
  await noExternalCheckoutFilters({...current,target},run);
  if(!current.head)throw new Error('Commit the initial project before switching branches.');
  const fingerprint=current.status?await startFingerprint(current,run):null;
  if(current.status)await recheck(current,run,{localOnly:true});
  return planFor('switch',current,{name,target,startFingerprint:fingerprint});
}
function offlineSwitchRunner(run) {
  const env=switchEnvironment();
  return (root,args,options)=>run(root,args,{...options,env:options?.env??env});
}
const pendingFinishRef = 'refs/zero/pending-finish';
// On main there is no checked-out feature name to authenticate the marker
// against. Validate the complete marker and its graph before retiring it.
async function mainPendingFinish(current, run) {
  let id;
  try { id = await run(current.root, ['rev-parse', '--verify', pendingFinishRef]); }
  catch (error) { if (error.code === 128) return null; throw error; }
  if (!shaPattern.test(id) || await run(current.root, ['cat-file', '-t', id]) !== 'commit') return {id, valid:false};
  const parents = (await run(current.root, ['rev-list', '--parents', '-n', '1', id])).split(' ');
  const branch=await readFinishedBranch(current.root,id,run);
  let branchValid = false;
  if (branch) {
    try { await run(current.root, ['check-ref-format', '--branch', branch]); branchValid = true; }
    catch (error) { if (error.code !== 128 && error.code !== 1) throw error; }
  }
  const structural = branchValid && parents.length === 3 && parents[0] === id &&
    await run(current.root, ['rev-parse', `${id}^{tree}`]) === await run(current.root, ['rev-parse', `${parents[2]}^{tree}`]) &&
    await ancestor(run, current.root, parents[1], parents[2]);
  return {id, structural, valid: structural && await ancestor(run, current.root, id, current.head), ...(structural ? {branch, base:parents[1], feature:parents[2]} : {})};
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
    if (parents.length !== 3 || parents[0] !== id || await readFinishedBranch(current.root,id,run) !== current.branch ||
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
  const branch=await readFinishedBranch(current.root,id,run);
  if (parents.length !== 3 || parents[0] !== id ||
      branch !== current.branch ||
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
async function prepareFinish(project, options = {}) {
  await assertShareable(project);
  const opts={beforeNetwork:async()=>{},onProgress:()=>{},...options,run:finishRunner(guardedRunner(safeRunner(options.run||core.git)))},run=opts.run;
  networkRequired(opts.networkRun);
  const current = await state(project, run, {full: true});
  clean(current);
  if (current.branch === 'main') throw new Error('Start a feature first. Merge to main is for a completed feature branch.');
  if (!validFinishedBranch(current.branch)) throw new Error('Choose a valid bounded feature branch name before merging. Use Source Control to inspect this branch.');
  const refStorage=await checkFinishStorage(current,opts,{probe:true});
  await assertNoArchivedFinishAhead(current, run);
  const pending = await pendingFinish(current, run);
  const base = pending ? pending.base : current.mainHead;
  if (!(await ancestor(run, current.root, base, current.head))) throw new Error('Local main contains changes missing from this feature. Merge main into your feature with native Source Control, then review Merge to main again.');
  if (base === current.head) throw new Error('This change has no commits to finish.');
  const remoteMainHead=await protectedNetwork(current,opts,()=>remoteMain(current,opts.networkRun));
  if(!remoteMainHead)throw Object.assign(new Error('GitHub main is missing. Check the repository before merging; local commits are preserved.'),{kind:'behind'});
  if(pending){if(remoteMainHead!==pending.base&&remoteMainHead!==pending.id)throw Object.assign(new Error('GitHub main no longer matches the reviewed merge base. The pending merge is kept. Check GitHub and update from main before retrying.'),{kind:'behind'});}
  else {
    if(remoteMainHead!==current.mainHead){
      await protectedNetwork(current,opts,()=>fetchMain({...current,remoteMainHead,remoteBranch:'main'},opts),{full:true});
    }
    if(!await ancestor(run,current.root,current.mainHead,remoteMainHead)||!await ancestor(run,current.root,remoteMainHead,current.head))throw Object.assign(new Error('GitHub main is not included in the reviewed feature or has moved behind local main. Update from main and review the merge again.'),{kind:'behind',nativeUpdateHandoff:true});
    if(remoteMainHead===current.head)throw new Error('GitHub main already contains this feature head. There are no newer feature commits to merge.');
  }
  const [paths,commitCount]=await Promise.all([
    run(current.root,['diff','--name-only','-z',base,current.head]),
    run(current.root,['rev-list','--count',`${base}..${current.head}`])
  ]);
  const changedPaths=Object.freeze(paths.split('\0').filter(Boolean));
  // Compare the full snapshot after the read-only GitHub lookup and before
  // presenting the merge for confirmation.
  await recheck(current,run,{full:true});
  return planFor('finish', current, {pending,refStorage,remoteMainHead, changedPaths, commitCount: Number(commitCount), summary: `Merge ${current.branch} to main: ${commitCount} feature commit(s), ${changedPaths.length} changed path(s). Upload the completed main and switch to main. If GitHub main changed, Update from main, run the app, then merge again.`});
}
async function protectedNetwork(expected, options, operation, {full = false} = {}) {
  await options.beforeNetwork();
  await recheck(expected, options.run, {full});
  const result = await operation();
  await recheck(expected, options.run);
  return result;
}
async function prepareSync(project, options = {}) {
  const opts = {beforeNetwork: async () => {}, onProgress:()=>{}, ...options, run: finishRunner(guardedRunner(safeRunner(options.run || core.git)))};
  networkRequired(opts.networkRun);
  const current = await state(project, opts.run, {full: true});
  const refStorage=await preflightDirectMain(current.root,current.gitDir,{run:opts.run,allowReftable:true,skipProbe:true});
  clean(current);
  const target = opts.target === undefined ? 'main' : opts.target;
  if (!['main', 'branch'].includes(target)) throw new Error('Choose main or the current branch to update.');
  let retired=false;if(refStorage==='reftable'){opts.refStorage=refStorage;retired=Boolean(await opts.run(current.root,['for-each-ref','--format=%(refname)','refs/zero/retired-finish/']));if(retired)throw nativeUpdateHandoff('Updating files in this Git reference format is temporarily unavailable. Your files and commits are kept.');await require('./reftable-update-evidence').assertNoRetiredUpdateEvidence(current.root);}
  if(refStorage!=='reftable')await preflightDirectMain(current.root,current.gitDir,{run:opts.run});
  const remoteBranchName = target === 'branch' ? current.branch : 'main';
  const remoteHead = await protectedNetwork(current, opts, () => remoteBranch(current, remoteBranchName, opts.networkRun));
  if (!remoteHead) throw new Error(`GitHub ${remoteBranchName} has no completed commit to update from.`);
  let filesAncestryReviewed=false;if(refStorage==='files'&&remoteHead!==current.head){await protectedNetwork(current,opts,()=>fetchMain({...current,remoteMainHead:remoteHead,remoteBranch:remoteBranchName},opts),{full:true});await refuseFinishReplacements(current,opts.run);if(!await ancestor(opts.run,current.root,current.head,remoteHead)&&!await ancestor(opts.run,current.root,remoteHead,current.head))throw nativeUpdateHandoff('This branch and GitHub have different commits. Zero cannot update them automatically.');filesAncestryReviewed=true;}
  let reftableArchived,reftableUpdate,reftableNoop,reftableRefOnly,mergeCandidate,preview;if(refStorage==='reftable'){
    if(retired)throw nativeUpdateHandoff('Updating files in this Git reference format is temporarily unavailable. Your files and commits are kept.');
    if(!retired&&remoteHead===current.head)reftableNoop=true;
    else if(!retired&&ENABLE_REFTABLE_REF_ONLY){await protectedNetwork(current,opts,()=>fetchMain({...current,remoteMainHead:remoteHead,remoteBranch:remoteBranchName},opts),{full:true});await require('./reftable-update-evidence').assertNoRetiredUpdateEvidence(current.root);await refuseFinishReplacements(current,opts.run);if(!await ancestor(opts.run,current.root,current.head,remoteHead)||await opts.run(current.root,['rev-parse',`${current.head}^{tree}`])!==await opts.run(current.root,['rev-parse',`${remoteHead}^{tree}`]))throw nativeUpdateHandoff('Updating files in this Git reference format is temporarily unavailable. Your files and commits are kept.');reftableRefOnly=true;}
    else if(!retired){await protectedNetwork(current,opts,()=>fetchMain({...current,remoteMainHead:remoteHead,remoteBranch:remoteBranchName},opts),{full:true});await require('./reftable-update-evidence').assertNoRetiredUpdateEvidence(current.root);let updateHead=remoteHead;if(!await ancestor(opts.run,current.root,current.head,remoteHead)){
      if(target!=='main'||await ancestor(opts.run,current.root,remoteHead,current.head))throw new Error('This update needs a merge or conflict resolution, which is not available for this Git reference storage. Your commits are preserved.');
      mergeCandidate=await require('./reftable-merge-candidate').prepareReftableMergeCandidate({root:current.root,branch:current.branch,head:current.head,main:current.mainHead,target:remoteHead,beforeMutation:opts.beforeNetwork,beforeMutationNow:opts.beforeMutationNow||(()=>{})});updateHead=mergeCandidate.candidate;
    }await refuseUnsafeUpdateConversions(current.root,current.head,updateHead,opts.run);await preserveIgnored(current,updateHead,opts.run);preview=await require('./reftable-switch-capture').previewReftableUpdate({root:current.root,branch:current.branch,feature:current.head,main:current.mainHead,target:updateHead,beforeMutation:opts.beforeNetwork,beforeMutationNow:opts.beforeMutationNow||(()=>{})});reftableUpdate=true;}
    else {await protectedNetwork(current,opts,()=>fetchMain({...current,remoteMainHead:remoteHead,remoteBranch:'main'},opts),{full:true});let pending=false;try{await opts.run(current.root,['rev-parse','--verify',pendingFinishRef]);pending=true;}catch(error){if(error.code!==128)throw error;}if(pending)throw new Error('This update is not supported for this Git reference storage while a merge is pending. Your commits are preserved.');reftableArchived=await archivedFinishIn(current,remoteHead,opts.run,{includeOnMain:true});if(!reftableArchived||![reftableArchived.feature,remoteHead].includes(current.head)||!(await ancestor(opts.run,current.root,current.mainHead,remoteHead)))throw new Error('This update is not supported for this Git reference storage. Your files and commits are preserved.');await refuseUnsafeUpdateConversions(current.root,current.head,remoteHead,opts.run);await preserveIgnored(current,remoteHead,opts.run);preview=await require('./reftable-switch-capture').previewReftableSwitch({root:current.root,branch:current.branch,feature:current.head,main:current.mainHead,target:remoteHead,beforeMutation:opts.beforeNetwork,beforeMutationNow:opts.beforeMutationNow||(()=>{})});}
  }
  return planFor('sync', current, {target,refStorage,filesAncestryReviewed,reftableArchived,reftableUpdate,reftableNoop,reftableRefOnly,mergeCandidate,preview, remoteBranch: remoteBranchName, remoteMainHead: remoteHead, summary: `Download and merge GitHub ${remoteBranchName} into ${current.branch}, preserving your local commits.`});
}
async function fetchMain(expected, options) {
  const remoteBranch=expected.remoteBranch||'main';
  try {
    const present = await options.run(expected.root, ['rev-parse', '--verify', `${expected.remoteMainHead}^{commit}`]);
    if (present !== expected.remoteMainHead) throw drift();
    return;
  } catch (error) { if (error.code !== 128) throw error; }
  options.onProgress(`Downloading the reviewed GitHub ${remoteBranch}…`);
  await network(options.networkRun, expected.root, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', expected.remote, expected.remoteMainHead]);
  const commit = await local(options.run, expected.root, ['rev-parse', '--verify', `${expected.remoteMainHead}^{commit}`], 'inspect the fetched branch commit');
  if (commit !== expected.remoteMainHead) throw new Error(`GitHub ${remoteBranch} did not resolve to the reviewed commit. Review this step again.`);
}
async function preserveIgnored(expected, target, run) {
  const ignored = (await run(expected.root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  if (!ignored.length) return;
  const paths = (await run(expected.root, ['ls-tree', '-r', '--name-only', '-z', target])).split('\0').filter(Boolean);
  if (ignored.some(file => paths.some(tracked => file === tracked || file.startsWith(`${tracked}/`) || tracked.startsWith(`${file}/`)))) throw new Error('The incoming main would overwrite a local ignored file. Move that file safely outside the project, then review again.');
}
function executorOptions(plan, kind, options) {
  if (!plans.has(plan) || plan.kind !== kind) throw new Error('Review this project step before continuing.');
  if (!['start','switch'].includes(kind)) networkRequired(options.networkRun);
  return {beforeNetwork: async () => {}, beforeMutation: async () => {}, onProgress: () => {}, ...options, run: guardedRunner(safeRunner(options.run || core.git))};
}
async function switchPrepared(plan,options={}) {
  const opts=executorOptions(plan,'switch',options);
  await assertShareable(plan.root);
  const run=offlineSwitchRunner(opts.run);
  const recheckSwitch=async()=>{
    const current=await recheck(plan,run,{localOnly:true});
    if(await switchTarget(current,plan.name,run)!==plan.target ||
        (plan.startFingerprint&&await startFingerprint(current,run)!==plan.startFingerprint))throw drift();
  };
  await opts.beforeMutation();
  if(plan.status){
    await noExternalCheckoutFilters({root:plan.root,gitDir:path.join(plan.root,'.git')},run);
    await recheckSwitch();
  }
  await preserveIgnored(plan,plan.target,run);
  if(plan.status){
    await noExternalCheckoutFilters(plan,run);
    await opts.beforeMutation();
    await noExternalCheckoutFilters(plan,run);
    await recheckSwitch();
  }
  // On a clean switch one guarded recheck at the mutation boundary is enough.
  // It still checks the worktree and exact refs after the last editor guard.
  await opts.beforeMutation();
  await noExternalCheckoutFilters(plan,run);
  await recheckSwitch();
  try {await run(plan.root,['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false','checkout','--no-overwrite-ignore',plan.name]);}
  catch {throw new Error('These changes cannot be moved safely to the selected branch, or Git could not finish switching. Check your files and branch; commit or discard changes before trying again.');}
  plans.delete(plan);
  const final=await state(plan.root,run,{localOnly:true});
  if(final.branch!==plan.name||final.head!==plan.target)throw new Error('Git could not confirm the selected branch. Check Source Control before continuing.');
  return Object.freeze({branch:final.branch,head:final.head});
}
async function startPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'start', options);
  await assertShareable(plan.root);
  opts.onProgress('Checking your local branch…');
  await validName(plan.name, plan.root, opts.run);
  await opts.beforeMutation();
  const reviewed = await recheck(plan, opts.run,{localOnly:true});
  if (plan.startFingerprint && await startFingerprint(reviewed, opts.run) !== plan.startFingerprint) throw drift();
  const oldPending = await mainPendingFinish(reviewed, opts.run);
  if (oldPending) {
    if (reviewed.branch !== 'main') throw new Error('A pending finished change needs attention in Source Control before starting another change.');
    if (!oldPending.valid) throw new Error('A pending finished change needs attention in Source Control before starting another change.');
    await opts.beforeMutation();
    await recheck(plan, opts.run,{localOnly:true});
    await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, oldPending.id], 'clear the completed pending change');
    await recheck(plan, opts.run,{localOnly:true});
  }
  opts.onProgress('Creating your local feature branch…');
  await opts.beforeCheckout?.();
  const beforeCheckout=await recheck(plan,opts.run,{localOnly:true});
  if(plan.startFingerprint&&await startFingerprint(beforeCheckout,opts.run)!==plan.startFingerprint)throw drift();
  let checkoutWarning = false;
  try {await local(opts.run, plan.root, ['-c', `core.hooksPath=${os.devNull}`, 'checkout', '--no-overwrite-ignore', '-b', plan.name, plan.head], 'create the reviewed feature branch',{env:startCheckoutEnvironment()});}
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
  try {const final = await state(plan.root, opts.run,{localOnly:true});const currentBranch = await core.currentBranch(plan.root,opts.run);postCheckoutChanged = !same({...plan, branch: plan.name}, final);activeUncertain = final.branch !== plan.name || final.head !== plan.head || currentBranch !== plan.name;}
  catch {postCheckoutChanged = true;activeUncertain = true;}
  plans.delete(plan);
  return Object.freeze({branch: plan.name, head: plan.head, page: plan.page, postCheckoutChanged, activeUncertain, checkoutWarning});
}
async function syncPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'sync', options);
  if(plan.refStorage==='reftable'&&(plan.reftableUpdate||plan.reftableArchived))throw nativeUpdateHandoff('Updating files in this Git reference format is temporarily unavailable. Your files and commits are kept.');
  if(plan.refStorage==='files'&&plan.head!==plan.remoteMainHead&&!plan.filesAncestryReviewed)throw new Error('Review this update again before changing the project. Your files and commits are kept.');
  if(plan.reftableRefOnly){if(!ENABLE_REFTABLE_REF_ONLY||!options.refOnlyIntent||typeof opts.beforeMutationNow!=='function')throw drift();const current=await recheck(plan,finishRunner(guardedRunner(opts.run)),{full:true});const observed=await protectedNetwork(current,opts,()=>remoteBranch(current,plan.remoteBranch,opts.networkRun),{full:true});if(observed!==plan.remoteMainHead)throw drift();const outcome=await require('./reftable-ref-only').fastForwardEqualTree({root:plan.root,branch:plan.branch,head:plan.head,main:plan.mainHead,target:plan.remoteMainHead,beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow,intent:options.refOnlyIntent});plans.delete(plan);return Object.freeze({synced:true,updated:true,branch:plan.branch,head:plan.remoteMainHead,page:plan.page,remote:plan.remote,remoteBranch:plan.remoteBranch,remoteHead:observed,refOnlyOutcome:outcome});}
  opts.run = plan.refStorage==='reftable'?finishRunner(guardedRunner(opts.run)):guardedRunner(opts.run);
  if(plan.refStorage==='reftable'){if(typeof opts.beforeMutationNow!=='function')throw drift();if(plan.reftableArchived)require('./commit-provenance').assertReftableSwitchOwner(opts.ownedSwitch,plan.root);else if(plan.reftableUpdate)require('./commit-provenance').assertReftableUpdateOwner(opts.ownedUpdate,plan.root);else if(!plan.reftableNoop)throw drift();}
  if(plan.reftableNoop){await assertShareable(plan.root);await require('./reftable-update-evidence').assertNoRetiredUpdateEvidence(plan.root);const current=await recheck(plan,opts.run,{full:true});if(current.head!==plan.remoteMainHead)throw drift();const observed=await protectedNetwork(current,opts,()=>remoteBranch(current,plan.remoteBranch,opts.networkRun),{full:true});if(observed!==plan.remoteMainHead)throw drift();await require('./reftable-update-evidence').assertNoRetiredUpdateEvidence(plan.root);await opts.beforeMutation();await recheck(current,opts.run,{full:true});const finalAuthority=opts.beforeMutationNow();if(finalAuthority&&typeof finalAuthority.then==='function')throw drift();plans.delete(plan);return Object.freeze({synced:true,updated:false,noTracking:true,branch:current.branch,head:current.head,page:plan.page,remote:plan.remote,remoteBranch:plan.remoteBranch,remoteHead:observed});}
  await assertShareable(plan.root);
  opts.onProgress('Checking the reviewed GitHub main…');
  await protectedNetwork(plan, opts, () => fetchMain(plan, opts));
  let current = await recheck(plan, opts.run, {full: true});
  const format=await preflightDirectMain(current.root,current.gitDir,{run:opts.run,allowReftable:plan.refStorage==='reftable'});if(plan.refStorage&&format!==plan.refStorage)throw drift();
  const remoteHead = plan.remoteMainHead;
  await refuseUnsafeUpdateConversions(plan.root, current.head, plan.mergeCandidate?.candidate||remoteHead, opts.run);
  if(plan.refStorage==='reftable'&&plan.reftableUpdate){
    const observed=await protectedNetwork(current,opts,()=>remoteBranch(current,plan.remoteBranch,opts.networkRun),{full:true});if(observed!==remoteHead)throw drift();
    await require('./reftable-update-evidence').assertNoRetiredUpdateEvidence(current.root);const updateHead=plan.mergeCandidate?.candidate||remoteHead;if(plan.mergeCandidate){const candidate=plan.mergeCandidate;if(plan.target!=='main'||candidate.branch!==current.branch||candidate.head!==current.head||candidate.target!==remoteHead||await opts.run(current.root,['rev-list','--parents','-n','1',candidate.candidate])!==`${candidate.candidate} ${current.head} ${remoteHead}`||await opts.run(current.root,['rev-parse',`${candidate.candidate}^{tree}`])!==candidate.tree)throw drift();}else if(current.head===remoteHead||!await ancestor(opts.run,current.root,current.head,remoteHead))throw drift();await preserveIgnored(current,updateHead,opts.run);await opts.beforeMutation();await recheck(current,opts.run,{full:true});const preview=await require('./reftable-switch-capture').previewReftableUpdate({root:current.root,branch:current.branch,feature:current.head,main:current.mainHead,target:updateHead,beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow});if(JSON.stringify(preview)!==JSON.stringify(plan.preview))throw drift();let source;
    try{const guard={beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow};source=await require('./reftable-switch-capture').captureReftableUpdate({root:current.root,branch:current.branch,feature:current.head,main:current.mainHead,target:updateHead,...guard,onOwnedFolder:token=>opts.ownedUpdate.adoptCapture(token)});const staged=await require('./reftable-update-materialize').materializeReftableUpdate(current.root,source,guard);const apply=()=>require('./reftable-update-apply').applyReftableUpdate(current.root,staged,{...guard,ownedBinding:opts.ownedUpdate});if(plan.mergeCandidate){if(typeof opts.applyWithUpdateIntent!=='function')throw new Error('Durable update recovery is unavailable. No update was applied.');await opts.applyWithUpdateIntent({receipt:staged,branch:current.branch,head:updateHead,sourceHead:current.head,reviewedRemoteHead:remoteHead},apply);}else await apply();const resolution=require('./reftable-update-resolution'),review=await resolution.reviewReftableUpdateResolution(current.root,path.basename(source.recoveryPath),{beforeReview:opts.beforeMutation});await resolution.resolveReftableUpdate(review,{...guard,ownedBinding:opts.ownedUpdate});}catch(error){if(source&&!error.recoveryPath)error.recoveryPath=source.recoveryPath;error.message+=' Inspect the project and retained update copies before retrying.';throw error;}
    const final=await state(plan.root,opts.run,{full:true});if(final.branch!==plan.branch||final.head!==updateHead||final.mainHead!==(plan.branch==='main'?updateHead:plan.mainHead)||final.status)throw drift();plans.delete(plan);return Object.freeze({synced:true,updated:true,branch:final.branch,head:final.head,page:plan.page,remote:plan.remote,remoteBranch:plan.remoteBranch,remoteHead});
  }
  if(plan.refStorage==='reftable'){
    let pending=false;try{await opts.run(plan.root,['rev-parse','--verify',pendingFinishRef]);pending=true;}catch(error){if(error.code!==128)throw error;}if(pending)throw drift();const archived=await archivedFinishIn(current,remoteHead,opts.run,{includeOnMain:true});if(!archived||archived.id!==plan.reftableArchived.id||archived.feature!==plan.reftableArchived.feature||![archived.feature,remoteHead].includes(current.head)||!(await ancestor(opts.run,current.root,current.mainHead,remoteHead)))throw drift();
    await preserveIgnored(current,remoteHead,opts.run);await opts.beforeMutation();await recheck(current,opts.run,{full:true});const preview=await require('./reftable-switch-capture').previewReftableSwitch({root:current.root,branch:current.branch,feature:current.head,main:current.mainHead,target:remoteHead,beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow});if(JSON.stringify(preview)!==JSON.stringify(plan.preview))throw drift();let source;
    try{source=await require('./reftable-switch-capture').captureReftableSwitch({root:current.root,branch:current.branch,feature:current.head,main:current.mainHead,target:remoteHead,beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow,onOwnedFolder:token=>opts.ownedSwitch.adoptCapture(token)});const staged=await require('./reftable-switch-materialize').materializeReftableSwitch(current.root,source,{beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow});await require('./reftable-switch-apply').applyReftableSwitch(current.root,staged,{beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow});const resolution=require('./reftable-switch-resolution'),review=await resolution.reviewReftableSwitchResolution(current.root,path.basename(source.recoveryPath),{beforeReview:opts.beforeMutation});await resolution.resolveReftableSwitch(review,{beforeMutation:opts.beforeMutation,beforeMutationNow:opts.beforeMutationNow,ownedBinding:opts.ownedSwitch});}
    catch(error){if(source&&!error.recoveryPath)error.recoveryPath=source.recoveryPath;error.message+=' The feature branch and retained copies need inspection before retrying.';throw error;}
    const final=await state(plan.root,opts.run,{full:true});if(final.branch!=='main'||final.head!==remoteHead||final.mainHead!==remoteHead||final.status||await opts.run(plan.root,['rev-parse','--verify',`refs/heads/${plan.branch}^{commit}`])!==plan.head)throw drift();plans.delete(plan);return Object.freeze({synced:true,updated:final.head!==plan.head,branch:'main',head:final.head,page:plan.page,remote:plan.remote,remoteBranch:plan.remoteBranch,remoteHead,confirmedFinish:Object.freeze({branch:plan.branch,featureHead:archived.feature,head:archived.id})});
  }
  let confirmedFinish,confirmedMerge;
  let rejectedOnMain;
  if (current.branch !== 'main' && plan.target === 'main') {
    let pendingExists = true;
    try { await opts.run(plan.root, ['rev-parse', '--verify', pendingFinishRef]); }
    catch (error) { if (error.code !== 128) throw error; pendingExists = false; }
    const archived = pendingExists ? null : await archivedFinishIn(current, remoteHead, opts.run, {includeOnMain:true});
    if (archived) {
      confirmedMerge=Object.freeze({branch:plan.branch,head:archived.id});
      if (!(await ancestor(opts.run, plan.root, current.mainHead, remoteHead))) throw new Error('Local main and the earlier finished merge need attention in Source Control. Your commits are preserved.');
      const switchToMain = current.head === archived.feature || current.head === remoteHead;
      if (switchToMain) await preserveIgnored(current, remoteHead, opts.run);
      await opts.beforeMutation();
      await recheck(current, opts.run, {full:true});
      await refuseUnsafeUpdateConversions(plan.root, current.head, plan.mergeCandidate?.candidate||remoteHead, opts.run);
      if (current.mainHead !== remoteHead) await advanceMain(current,remoteHead,current.mainHead,opts,'record the reviewed main');
      current = {...current, mainHead:remoteHead};
      if (switchToMain) {
        await opts.beforeMutation();
        await refuseUnsafeUpdateConversions(plan.root, current.head, plan.mergeCandidate?.candidate||remoteHead, opts.run);
        await recheck(current, opts.run, {full:true});
        await checkoutMain(current,opts);
        const switched = await state(plan.root, opts.run, {full:true});
        if (!same({...current, branch:'main', head:remoteHead}, switched)) throw drift();
        current = switched;
        confirmedFinish = Object.freeze({branch:plan.branch, featureHead:archived.feature, head:archived.id});
      }
    }
  }
  if (current.branch === 'main') {
    const pending = await mainPendingFinish(current, opts.run);
    const included=pending?.structural&&await ancestor(opts.run,plan.root,pending.id,remoteHead);
    if(included)confirmedMerge=Object.freeze({branch:pending.branch,head:pending.id});
    if (pending?.structural && !included) {
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
        confirmedMerge=Object.freeze({branch:plan.branch,head:pending.id});
        await refuseUnsafeUpdateConversions(plan.root, current.head, pending.id, opts.run);
        // The reviewed remote contains the exact pending boundary. Record that
        // confirmation locally before merging the remote into the feature.
        if (current.mainHead !== pending.id) {
          await opts.beforeMutation();
          await recheck(current, opts.run, {full: true});
          const checked = await pendingFinish(current, opts.run, {allowDrift:true});
          if (!checked || checked.id !== pending.id) throw drift();
          await refuseUnsafeUpdateConversions(plan.root, current.head, pending.id, opts.run);
          await advanceMain(current,pending.id,pending.base,opts,'record the confirmed finished change on local main');
          current = {...current, mainHead:pending.id};
        }
        await opts.beforeMutation();
        await recheck(current, opts.run, {full: true});
        if (pending.feature === current.head) {
          // No newer feature work remains: finish on main so a later finish
          // cannot create a second boundary for the same change.
          await preserveIgnored(current, pending.id, opts.run);
          await opts.beforeMutation();
          await refuseUnsafeUpdateConversions(plan.root, current.head, pending.id, opts.run);
          await recheck(current, opts.run, {full:true});
          await checkoutMain(current,opts);
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
    catch { throw new Error(`GitHub ${plan.remoteBranch||'main'} and this project have unrelated histories. Check the connected repository before syncing.`); }
    await preserveIgnored(current, remoteHead, opts.run);
    const expectedMerge = !opts.fastForwardOnly && await recovery.preview(current, remoteHead, opts.run);
    // Only an understood conflict can become guided recovery. Save the exact
    // checkpoint before Git touches the worktree.
    let cancelCapture;
    if (expectedMerge) {
      cancelCapture = await recovery.prepareCancelCapture(plan.root, remoteHead, {run:opts.run,inspect:recoveryInspect,beforeMutation:opts.beforeMutation});
      if (cancelCapture.head !== current.head || cancelCapture.remoteHead !== remoteHead) throw drift();
    }
    await opts.beforeMutation();
    await recheck(current, opts.run, {full: true});
    await refuseUnsafeUpdateConversions(plan.root, current.head, plan.mergeCandidate?.candidate||remoteHead, opts.run);
    opts.onProgress(current.branch === 'main' ? 'Updating local main…' : `Merging GitHub ${plan.remoteBranch||'main'} into ${current.branch}…`);
    try { await opts.run(plan.root, ['-c', `core.hooksPath=${os.devNull}`, '-c', 'merge.conflictStyle=merge', '-c', 'merge.autoStash=false', '-c', 'rerere.enabled=false', 'merge', opts.fastForwardOnly?'--ff-only':'--ff', '--no-gpg-sign', '--no-edit', '--no-overwrite-ignore', remoteHead]); }
    catch {
      let pending = false;
      try { await opts.run(plan.root, ['rev-parse', '--verify', 'MERGE_HEAD']); pending = true; } catch {}
      if (pending) {
        const managed = await recovery.create(current, remoteHead, plan.remoteBranch, opts.run, recoveryInspect, expectedMerge, cancelCapture);
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
  if (opts.fastForwardOnly && !unchanged && final.head!==remoteHead) throw drift();
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
  return Object.freeze({synced: true, updated: final.head !== current.head, branch: final.branch, head: final.head, page: plan.page, remote: plan.remote, remoteBranch: plan.remoteBranch, remoteHead, ...(confirmedFinish ? {confirmedFinish} : {}),...(confirmedMerge?{confirmedMerge}:{})});
}
async function finishPrepared(plan, options = {}) {
  const opts = executorOptions(plan, 'finish', options);
  opts.run=finishRunner(opts.run);
  opts.refStorage=plan.refStorage;
  await assertShareable(plan.root);
  await opts.beforeMutation();
  let current = await recheck(plan, opts.run, {full: true});
  const cleanupLayout = await core.inspectGitLayout(plan.root, opts.run);
  await checkFinishStorage(current,opts,{probe:true});
  await assertNoArchivedFinishAhead(current, opts.run);
  let candidate = plan.pending;
  if (candidate) {
    const checked = await pendingFinish(current, opts.run);
    if (!checked || checked.id !== candidate.id) throw drift();
  } else {
    // A feature update can incorporate newer GitHub main without moving the
    // local main ref. Review that exact remote commit before constructing the
    // marker; only advance local main when both histories prove it is safe.
    const reviewedRemote=await protectedNetwork(current,opts,()=>remoteMain(current,opts.networkRun),{full:true});
    if(reviewedRemote!==plan.remoteMainHead)throw Object.assign(new Error('GitHub main changed after review. Check the repository and review the merge again; local commits are preserved.'),{kind:'behind'});
    if(reviewedRemote!==current.mainHead){
      await protectedNetwork(current,opts,()=>fetchMain({...current,remoteMainHead:reviewedRemote,remoteBranch:'main'},opts),{full:true});
    }
    if(!await ancestor(opts.run,plan.root,current.mainHead,reviewedRemote)||!await ancestor(opts.run,plan.root,reviewedRemote,current.head))throw Object.assign(new Error('GitHub main is not included in the reviewed feature or has moved behind local main. Update from main and review the merge again.'),{kind:'behind',nativeUpdateHandoff:true});
    if(current.mainHead!==reviewedRemote){
      await advanceMain(current,reviewedRemote,current.mainHead,opts,'advance local main to reviewed GitHub main');
      current={...current,mainHead:reviewedRemote};await recheck(current,opts.run,{full:true});
    }
    if (!(await ancestor(opts.run, plan.root, current.mainHead, current.head)) || current.mainHead === current.head) throw drift();
    await checkFinishStorage(current,opts);
    const tree = await opts.run(plan.root, ['rev-parse', `${current.head}^{tree}`]);
    const id = await local(opts.run, plan.root, ['-c', `core.hooksPath=${os.devNull}`, 'commit-tree', tree, '-p', current.mainHead, '-p', current.head, '-m', finishMessage(current.branch)], 'record the finished change');
    if (!shaPattern.test(id)) throw drift();
    await opts.beforeMutation();
    await recheck(current, opts.run, {full: true});
    await local(opts.run, plan.root, ['update-ref', '--no-deref', pendingFinishRef, id, '0'.repeat(id.length)], 'save the pending finished change');
    candidate = {id, base: current.mainHead, feature: current.head};
  }
  if(opts.refStorage==='reftable') {const [featureTree,candidateTree]=await Promise.all([opts.run(plan.root,['rev-parse',`${current.head}^{tree}`]),opts.run(plan.root,['rev-parse',`${candidate.id}^{tree}`])]);if(featureTree!==candidateTree)throw new Error('The completed main has different files. Keep this feature and inspect Source Control.');}
  const ready = current;
  opts.onProgress('Pushing the merged main…');
  let confirmed;
  try {
    // A non-force push alone permits recreating a deleted branch or advancing a
    // rewound ancestor. Require the exact reviewed base immediately beforehand.
    const remoteHead=await protectedNetwork(ready,opts,()=>remoteMain(ready,opts.networkRun),{full:true});
    if(plan.pending&&remoteHead!==plan.remoteMainHead)throw Object.assign(new Error('GitHub main changed after review. The pending merge is kept. Check the repository and review the merge again.'),{kind:'behind'});
    if(remoteHead!==candidate.base&&remoteHead!==candidate.id)throw Object.assign(new Error('GitHub main no longer matches the reviewed merge base. The pending merge is kept. Check GitHub and update from main before retrying.'),{kind:'behind'});
    if(remoteHead===candidate.id)confirmed=remoteHead;
    else {
      await protectedNetwork(ready, opts, async()=>{await checkFinishStorage(ready,opts,{probe:true});return network(opts.networkRun, plan.root, ['push', plan.remote, `${candidate.id}:refs/heads/main`]);}, {full: true});
      opts.onProgress('Confirming main on GitHub…');
      confirmed = await protectedNetwork(ready, opts, () => remoteMain(ready, opts.networkRun));
    }
    if (confirmed !== candidate.id) throw Object.assign(new Error('GitHub did not confirm the completed main commit.'), {kind:'unconfirmed'});
  } catch (error) {
    throw Object.assign(new Error(`${error.message} Your feature and local main are preserved. Retry Merge to main, or update from GitHub if main changed.`),{workflowRecovery:{root:plan.root,remote:plan.remote,page:plan.page,branch:plan.branch,head:candidate.id,committed:false,kind:error.kind||'network',operation:'merge'}});
  }
  let final;
  try {
    // These transactions recheck the full reviewed state and editor authority
    // while holding the relevant Git ref lock.
    if(current.mainHead!==candidate.id)await advanceMain(current,candidate.id,candidate.base,opts,'advance local main');
    const completed={...current,mainHead:candidate.id};
    if(opts.refStorage==='reftable')await attachFinishedMain(completed,opts);
    else await checkoutMain(completed,opts);
    final=await state(plan.root,opts.run,{full:true});
    if(!same({...completed,branch:'main',head:candidate.id},final)||final.fingerprint!==completed.fingerprint)throw drift();
  }
  catch(error){error.message+= ' This merge was confirmed on GitHub. The local switch may have completed; inspect the current branch and Source Control before retrying. The pending change is retained.';throw error;}
  try { await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, candidate.id], 'clear the pending finished change'); } catch { /* Main and remote already contain the commit; a later start can clear the stale ref. */ }
  plans.delete(plan);
  const result = Object.freeze({finished: true, branch: 'main', head: final.head, featureHead: candidate.feature, page: plan.page, finishedBranch: plan.branch, remote: plan.remote});
  const receipt = Object.freeze({root:plan.root, branch:plan.branch, featureHead:candidate.feature, head:confirmed, remote:plan.remote, page:plan.page});
  finishedBranchCleanups.set(result, receipt);
  finishedBranchCleanupLayouts.set(receipt, cleanupLayout.identity);
  return result;
}
function consumeFinishedBranchCleanup(root, result) {
  const receipt = finishedBranchCleanups.get(result);
  if (!receipt || receipt.root !== root) throw new Error('This finished branch cleanup needs the exact confirmed merge from this project.');
  finishedBranchCleanups.delete(result);
  return receipt;
}
// Recover an interrupted finish without moving the feature branch or its newer commits.
async function preparePendingFinishRecovery(project, options = {}) {
  await assertShareable(project);
  const opts={...options,run:finishRunner(guardedRunner(safeRunner(options.run || core.git)))};
  const run=opts.run;
  const current = await state(project, run, {full:true});
  clean(current);
  if (current.branch === 'main') throw new Error('Switch to the feature with the pending change first.');
  const refStorage=await checkFinishStorage(current,opts,{probe:true});
  const pending = await pendingFinish(current, run, {allowDrift:true});
  if (!pending || pending.feature === current.head) throw new Error('There is no pending finished change with newer feature commits to recover.');
  await recheck(current, run, {full:true});
  return planFor('recover-finish', current, {pending,refStorage, summary:`Confirm finished change ${pending.id} on ${current.page}. Your newer commits remain on ${current.branch}. If GitHub does not yet have it, an explicit retry may push that exact commit to main.`});
}
async function recoverPendingFinish(plan, options = {}) {
  const opts = executorOptions(plan, 'recover-finish', options);
  opts.run=finishRunner(opts.run);
  opts.refStorage=plan.refStorage;
  await assertShareable(plan.root);
  let current = await recheck(plan, opts.run, {full:true});
  await checkFinishStorage(current,opts,{probe:true});
  const pending = await pendingFinish(current, opts.run, {allowDrift:true});
  if (!pending || pending.id !== plan.pending.id || pending.feature !== plan.pending.feature) throw drift();
  opts.onProgress('Checking the earlier finished change on GitHub…');
  const remoteHead = await protectedNetwork(current, opts, () => remoteMain(current, opts.networkRun), {full:true});
  if (remoteHead) {
    const reviewed = {...current, remoteMainHead:remoteHead};
    await protectedNetwork(current, opts, () => fetchMain(reviewed, opts));
  }
  const included = remoteHead && await ancestor(opts.run, plan.root, pending.id, remoteHead);
  if (!included && remoteHead !== pending.base) {
    plans.delete(plan);
    return Object.freeze({recovered:false, needsSync:true, branch:current.branch, remote:current.remote, remoteHead});
  }
  if (!included) {
    if (opts.allowPush !== true) return Object.freeze({recovered:false, needsPush:true, branch:current.branch, candidate:pending.id, remote:current.remote, page:current.page});
    opts.onProgress('Retrying the reviewed finished change…');
    const latest=await protectedNetwork(current,opts,()=>remoteMain(current,opts.networkRun),{full:true});
    if(latest!==pending.base&&latest!==pending.id)throw Object.assign(new Error('GitHub main no longer matches the reviewed merge base. The pending merge is kept. Check GitHub and update from main before retrying.'),{kind:'behind'});
    let confirmed=latest;
    if(latest!==pending.id){await protectedNetwork(current, opts, async()=>{await checkFinishStorage(current,opts,{probe:true});return network(opts.networkRun, plan.root, ['push', plan.remote, `${pending.id}:refs/heads/main`]);}, {full:true});confirmed = await protectedNetwork(current, opts, () => remoteMain(current, opts.networkRun));}
    if (confirmed !== pending.id) throw new Error('GitHub did not confirm the earlier finished change. Retry recovery; all commits are preserved.');
  }
  if (current.mainHead !== pending.id) {
    await opts.beforeMutation();
    await recheck(current, opts.run, {full:true});
    const checked = await pendingFinish(current, opts.run, {allowDrift:true});
    if (!checked || checked.id !== pending.id) throw drift();
    await advanceMain(current,pending.id,pending.base,opts,'record the confirmed finished change on local main');
    current = {...current, mainHead:pending.id};
  }
  await opts.beforeMutation();
  await recheck(current, opts.run, {full:true});
  await local(opts.run, plan.root, ['update-ref', '--no-deref', '-d', pendingFinishRef, pending.id], 'clear the confirmed pending change');
  plans.delete(plan);
  return Object.freeze({recovered:true, needsSync:true, branch:current.branch, head:current.head, finishedHead:pending.id, remoteHead:included ? remoteHead : pending.id, remote:current.remote});
}
function cleanupRunner(run) {
  const read = finishRunner(guardedRunner(safeRunner(run)));
  return (root, args, options) => read(root, args, {...options, env:{...process.env, GIT_NO_LAZY_FETCH:'1'}});
}
async function cleanupState(root, run, expectedLayout) {
  const layout = await core.inspectGitLayout(root, run);
  if (expectedLayout !== undefined && layout.identity !== expectedLayout) throw drift();
  // Older Git may lazily fetch even with GIT_NO_LAZY_FETCH. Cleanup is local.
  try {
    await run(root, ['config', '--name-only', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$']);
    throw new Error('A partial clone requires native Source Control for finished branch cleanup.');
  } catch (error) { if (error.code !== 1) throw error; }
  await refuseFinishReplacements(layout, run);
  const entries = (await run(root, ['ls-files', '--stage', '-v', '-z'])).split('\0').filter(Boolean);
  if (entries.some(entry => /^[a-zS] /.test(entry))) throw new Error('Git index flags can hide local changes. Check native Source Control before cleaning up this branch.');
  if (entries.some(entry => /^[A-Z] 160000 /.test(entry))) throw new Error('Nested repositories or submodules are not supported. Open a standalone student project.');
  const current = await state(root, run);
  clean(current);
  if (current.branch !== 'main' || current.head !== current.mainHead) throw new Error('Switch to clean main before deleting a finished local feature.');
  return {current, layout};
}
async function assertNoPendingFinish(root,gitDir,run) {
  const pending=()=>new Error('Resolve the pending merge before deleting a local branch.');
  // Listing refs can omit a dangling symbolic ref or a broken loose ref.
  try {
    await fs.lstat(path.join(gitDir,pendingFinishRef));
    throw pending();
  } catch(error) {if(error.code!=='ENOENT')throw error;}
  try {
    await run(root,['symbolic-ref','--quiet','--no-recurse',pendingFinishRef]);
    throw pending();
  } catch(error) {if(error.code!==1)throw error;}
  if(await run(root,['for-each-ref','--format=%(refname)',pendingFinishRef]))throw pending();
}
async function prepareFinishedBranchDeletion(root,{run=core.git}={}) {
  run=cleanupRunner(run);
  const {current,layout}=await cleanupState(root,run);
  await assertNoPendingFinish(root,current.gitDir,run);
  const choices=await core.localBranchChoices(root,{run,mergedInto:current.mainHead});
  return {mainHead:current.mainHead,layout:layout.identity,branches:choices.filter(choice=>validFinishedBranch(choice.name))};
}
async function checkFinishedFeature(root, ref, expectedHead, mainHead, run) {
  try {
    await run(root, ['symbolic-ref', '--quiet', '--no-recurse', ref]);
    throw new Error('The finished feature is a symbolic reference. Keep it and inspect Source Control.');
  } catch (error) { if (error.code !== 1) throw error; }
  let actual;
  try { actual = await run(root, ['rev-parse', '--verify', ref]); }
  catch { throw new Error('The finished feature branch is no longer available for cleanup.'); }
  if (actual !== expectedHead || !(await ancestor(run, root, actual, mainHead))) throw new Error('This feature branch changed or has work missing from main. Keep it and inspect native Source Control.');
}
async function reviewFinishedBranchCleanup(root, branch, expectedHead, {run = core.git, expectedMain, expectedRemote, expectedLayout, receipt} = {}) {
  if (typeof expectedHead !== 'string' || !shaPattern.test(expectedHead) || !validFinishedBranch(branch) ||
      (expectedMain !== undefined && (typeof expectedMain !== 'string' || !shaPattern.test(expectedMain) || expectedMain.length !== expectedHead.length))) {
    throw new Error('Choose the exact finished feature branch for local cleanup.');
  }
  const receiptLayout = finishedBranchCleanupLayouts.get(receipt);
  if (receipt !== undefined && (!receiptLayout || receipt.root !== root || receipt.branch !== branch ||
      receipt.featureHead !== expectedHead || receipt.head !== expectedMain || receipt.remote !== expectedRemote)) {
    throw new Error('This finished branch cleanup needs the exact confirmed merge from this project.');
  }
  run = cleanupRunner(run);
  const {current, layout} = await cleanupState(root, run, receiptLayout??expectedLayout);
  if ((expectedMain !== undefined && current.mainHead !== expectedMain) ||
      (expectedRemote !== undefined && current.remote !== expectedRemote)) throw drift();
  const ref = `refs/heads/${branch}`;
  await checkFinishedFeature(current.root, ref, expectedHead, current.mainHead, run);
  return {current, layout, ref, run};
}
async function inspectFinishedBranchCleanup(root, branch, expectedHead, options = {}) {
  if (!options.receipt) throw new Error('This finished branch cleanup needs the exact confirmed merge from this project.');
  await options.beforeMutation?.();
  const {current, ref, run} = await reviewFinishedBranchCleanup(root, branch, expectedHead, options);
  const refStorage = await preflightDirectMain(current.root, current.gitDir, {run, allowReftable:true, skipProbe:true, cleanupBranch:branch});
  await deleteDirectFeature(current.root, current.mainHead, branch, expectedHead, {
    probeOnly: true,
    refStorage,
    verify: async () => {
      if (await core.currentBranch(root, run) !== 'main' ||
          await run(root, ['rev-parse', '--verify', 'refs/heads/main']) !== current.mainHead) throw drift();
      await checkFinishedFeature(root, ref, expectedHead, current.mainHead, run);
    },
    checkNow: options.beforeMutationNow
  });
  return Object.freeze({root:current.root, branch, featureHead:expectedHead, head:current.mainHead, remote:current.remote, page:current.page});
}
async function deleteFinishedBranch(root, branch, expectedHead, options = {}) {
  const {beforeMutation = async () => {}, beforeMutationNow} = options;
  if ((options.receipt !== undefined || beforeMutationNow !== undefined) &&
      (typeof beforeMutationNow !== 'function' || options.expectedMain === undefined)) {
    throw new Error('Confirm the exact main commit and local authority before deleting the finished feature.');
  }
  const {current, layout, ref, run} = await reviewFinishedBranchCleanup(root, branch, expectedHead, options);
  try {
    const refStorage = await preflightDirectMain(current.root, current.gitDir, {run, allowReftable:true, skipProbe:true, cleanupBranch:branch});
    await deleteDirectFeature(current.root, current.mainHead, branch, expectedHead, {
      refStorage,
      verify: async () => {
        await beforeMutation();
        const checked = await cleanupState(root, run, layout.identity);
        if (!same(current, checked.current)) throw drift();
        if(!options.receipt&&options.expectedMain!==undefined)await assertNoPendingFinish(root,current.gitDir,run);
        // An OID comparison alone can accept a same-OID symbolic replacement.
        // Recheck the ref type while Git holds HEAD and both branch locks.
        await checkFinishedFeature(current.root, ref, expectedHead, current.mainHead, run);
      },
      checkNow: beforeMutationNow
    });
  } catch (error) {
    if (!error.refOutcomeUncertain) error.message += ' Git could not delete the finished local feature safely.';
    throw error;
  }
  return Object.freeze({deleted: true, branch});
}
function recoveryInspect(root, run) { return state(root, run, {allowMerge: true}); }
function recoveryOptions(options = {}) { return {beforeMutation: async () => {}, ...options, run: guardedRunner(safeRunner(options.run || core.git)), inspect: recoveryInspect}; }
async function readRecovery(root, options = {}) { return recovery.read(root, recoveryOptions(options)); }
async function resolveRecovery(root, choice, options = {}) { return recovery.resolve(root, choice, recoveryOptions(options)); }
async function completeRecovery(root, id, fingerprint, options = {}) { return recovery.complete(root, id, fingerprint, recoveryOptions(options)); }
async function cancelRecovery(root, options = {}) { return recovery.cancel(root, recoveryOptions(options)); }
async function checkpoint(root, options = {}) {
  const opts = recoveryOptions(options);
  opts.inspect = (project, run) => state(project, run);
  return recovery.checkpoint(root, opts);
}
module.exports = {preparePendingFinishRecovery, recoverPendingFinish, readRecovery, resolveRecovery, completeRecovery, cancelRecovery, checkpoint, prepareStart, startPrepared, prepareSwitch, switchPrepared, prepareSync, syncPrepared, prepareFinish, finishPrepared, consumeFinishedBranchCleanup, inspectFinishedBranchCleanup, prepareFinishedBranchDeletion, deleteFinishedBranch};
