'use strict';
// Policy for a Zero-created commit. The caller supplies a freshly read, guarded
// upstream snapshot, and every Zero push must use the provenance lock. This is
// evidence about Zero and that upstream, not proof that no other copy or tool
// has shared the commit. An external publisher can race the final check.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {parseRepositoryUrl} = require('./core');
const exec = promisify(execFile);
const oid = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const env = {...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))), GIT_NO_LAZY_FETCH:'1', GIT_NO_REPLACE_OBJECTS:'1', GIT_TERMINAL_PROMPT:'0'};
const unavailable = () => new Error('Cannot verify this local commit and its upstream. Review this commit instead.');
async function git(root, args) {
  return (await exec('git', ['--no-pager','-c','core.fsmonitor=false','-c',`core.hooksPath=${os.devNull}`,...args], {cwd:root,env,timeout:10000,maxBuffer:1024*1024})).stdout.trim();
}

async function destination(root, short) {
  let keys;
  try { keys = await git(root,['config','--name-only','--get-regexp','^url\\.']); }
  catch (error) { if (error.code !== 1) throw error; }
  if (keys && keys.split('\n').some(key => /\.(?:insteadof|pushinsteadof)$/i.test(key))) throw unavailable();
  const remotes = (await git(root,['config','--get-all',`branch.${short}.remote`])).split('\n');
  const refs = (await git(root,['config','--get-all',`branch.${short}.merge`])).split('\n');
  if (remotes.length !== 1 || refs.length !== 1) throw unavailable();
  const [remote] = remotes, [ref] = refs;
  if (remote !== 'origin' || !ref.startsWith('refs/heads/')) throw unavailable();
  await git(root,['check-ref-format',ref]);
  const upstream = await git(root,['rev-parse','--symbolic-full-name','@{upstream}']);
  if (upstream !== `refs/remotes/origin/${ref.slice('refs/heads/'.length)}`) throw unavailable();
  const fetch = (await git(root,['remote','get-url','--all','origin'])).split('\n');
  const push = (await git(root,['remote','get-url','--push','--all','origin'])).split('\n');
  if (fetch.length !== 1 || push.length !== 1) throw unavailable();
  const canonical = parseRepositoryUrl(fetch[0]).remote;
  if (parseRepositoryUrl(push[0]).remote !== canonical) throw unavailable();
  return {remote,ref,upstream,destination:canonical,fetch:fetch[0],push:push[0]};
}
// Local-only is a separate, explicit policy. An absent configured destination
// does not prove that another tool or copy never shared this commit.
async function noConfiguredDestination(root) {
  if(await git(root,['remote']))throw unavailable();
  try {
    const configured=await git(root,['config','--name-only','--get-regexp','^(remote\\.|url\\.|branch\\..*\\.(remote|merge|pushremote)$|extensions\\.partialclone$)']);
    if(configured)throw unavailable();
  } catch(error) {if(error.code!==1)throw error;}
  const packs=await fs.readdir(path.join(root,'.git','objects','pack'));
  if(packs.some(name=>name.endsWith('.promisor')))throw unavailable();
}
async function completeHistory(root) {
  try {if(await git(root,['config','--name-only','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']))throw unavailable();}
  catch(error) {if(error.code!==1)throw error;}
  const packs=await fs.readdir(path.join(root,'.git','objects','pack'));
  if(packs.some(name=>name.endsWith('.promisor')))throw unavailable();
}

// snapshot({root, remote, ref, head, destination}) must read the exact
// canonical HTTPS destination during this call, return {remote, ref, oid, destination},
// and reject on missing/inaccessible/ambiguous evidence. It must not push.
// All Zero commit and upload paths must participate in the same lock and
// invalidate the receipt before initiating any transfer. The snapshot alone
// does not establish that a commit was never shared elsewhere.
function createCommitUndoAuthority({snapshot,mode='upstream'}={}) {
  if (!['upstream','local-only'].includes(mode) || (mode==='upstream'&&typeof snapshot !== 'function')) throw unavailable();
  return async (scope, perform) => {
    const {root, branch, head, parent} = scope;
    if (typeof root !== 'string' || await fs.realpath(root) !== root || !branch.startsWith('refs/heads/') || !oid(head) || !oid(parent)) throw unavailable();
    const dot = path.join(root,'.git'), lock = path.join(dot,'zero-commit-provenance.lock');
    const dotStat = await fs.lstat(dot);
    if (!dotStat.isDirectory() || dotStat.isSymbolicLink()) throw unavailable();
    let handle, identity, primary, completed=false, result,active=true;
    try {
      handle = await fs.open(lock,'wx',0o600); identity = await handle.stat();
      const file = path.join(dot,'zero-commit-provenance.json');
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw unavailable();
      const receipt = JSON.parse(await fs.readFile(file,'utf8'));
      const short = branch.slice('refs/heads/'.length);
      if (receipt.version !== 1 || receipt.root !== root || receipt.branch !== short || receipt.head !== head || receipt.parent !== parent || receipt.pushStarted !== false) throw unavailable();
      let reviewed,remoteHead;
      const sameDestination=async()=>{const now=await destination(root,short);if(Object.keys(reviewed).some(key=>reviewed[key]!==now[key]))throw unavailable();};
      const readUpstream=async()=>{
        await completeHistory(root);
        const evidence=await snapshot({root,remote:reviewed.remote,ref:reviewed.ref,destination:reviewed.destination,head});
        if(!evidence||evidence.remote!==reviewed.remote||evidence.ref!==reviewed.ref||evidence.destination!==reviewed.destination||!oid(evidence.oid)||evidence.oid.length!==head.length)throw unavailable();
        // Refuse missing objects and divergence: the checked upstream must be
        // in the parent's history. No implicit fetch or replace objects.
        await git(root,['cat-file','-e',`${evidence.oid}^{commit}`]);
        try {await git(root,['merge-base','--is-ancestor',evidence.oid,parent]);} catch {throw unavailable();}
        await sameDestination();await completeHistory(root);
        return evidence.oid;
      };
      if(mode==='local-only') {
        await noConfiguredDestination(root);
      } else {
        reviewed=await destination(root,short);
        remoteHead=await readUpstream();
      }
      const currentLock = await fs.lstat(lock);
      if (currentLock.dev !== identity.dev || currentLock.ino !== identity.ino) throw unavailable();
      if(mode==='local-only')await noConfiguredDestination(root);
      const finalLock=await fs.lstat(lock);
      if(finalLock.dev!==identity.dev||finalLock.ino!==identity.ino)throw unavailable();
      // Consume evidence before moving the branch: a later return to the same
      // object must not resurrect authority from an old receipt.
      await fs.unlink(file);
      const directory = await fs.open(dot,'r');
      try { await directory.sync(); } finally { await directory.close(); }
      const beforeRef=async()=>{
        const held=await fs.lstat(lock);if(held.dev!==identity.dev||held.ino!==identity.ino)throw unavailable();
        if(mode==='local-only')await noConfiguredDestination(root);
        else {await sameDestination();if(await readUpstream()!==remoteHead)throw unavailable();}
        const current=await fs.lstat(lock);if(current.dev!==identity.dev||current.ino!==identity.ino)throw unavailable();
      };
      const beforeRefNow=()=>{const current=fsSync.lstatSync(lock);if(!current.isFile()||current.isSymbolicLink()||current.dev!==identity.dev||current.ino!==identity.ino)throw unavailable();};
      const binding=Object.freeze({root,gitDir:dot,commonDir:dot,assertCurrentNow(){if(!active)throw unavailable();const current=fsSync.lstatSync(dot);if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==dotStat.dev||current.ino!==dotStat.ino)throw unavailable();beforeRefNow();},ownsLock(file,info){this.assertCurrentNow();return file===lock&&Boolean(info?.isFile?.())&&!info.isSymbolicLink()&&info.dev===identity.dev&&info.ino===identity.ino;}});
      result=await perform('rewrite',beforeRef,beforeRefNow,binding);completed=true;return result;
    } catch (error) {
      if (!handle && error.code === 'EEXIST') {
        const failure = new Error('Another Zero action may be running. Close other Zero windows, then inspect the lock before continuing; it will not be removed automatically.');
        failure.recoveryPath = lock;
        primary=failure;throw failure;
      }
      primary=error;throw error;
    } finally {
      active=false;
      try {
        if(handle)await handle.close();
        // Without the identity we cannot safely remove even the lock we just
        // created: another process may have replaced it since acquisition.
        if(handle&&!identity)throw new Error('The undo lock identity could not be verified.');
        if(identity) {const current=await fs.lstat(lock);if(!current.isFile()||current.isSymbolicLink()||current.dev!==identity.dev||current.ino!==identity.ino)throw unavailable();await fs.unlink(lock);}
      } catch(cleanup) {
        if(primary){
          if(!primary.lockRecoveryPath)primary.lockRecoveryPath=lock;
          else if(!primary.additionalLockRecoveryPath)primary.additionalLockRecoveryPath=lock;
          else primary.message+=` Additional lock requiring inspection: ${lock}.`;
          primary.lockCleanupFailures=[...(primary.lockCleanupFailures||[]),{path:lock,error:cleanup}];
          primary.lockCleanupError=cleanup;throw primary;
        }
        const failure=new Error(completed?'The local undo completed, but its lock needs inspection.':'The undo lock needs inspection; review project history.');
        if(result?.recoveryPath)failure.recoveryPath=result.recoveryPath;
        failure.lockRecoveryPath=lock;failure.lockCleanupError=cleanup;failure.undoCompleted=completed;throw failure;
      }
    }
  };
}
module.exports = {createCommitUndoAuthority};
