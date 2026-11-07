'use strict';
// All Zero upload paths must hold this lock and invalidate the receipt before
// transfer. Evidence is available only where durable directory sync works.
// Evidence covers Zero-controlled pushes only. Native Git and other copies are
// outside this record. Every reader and writer must hold the repository lock.
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('./core');
const {assertNoUnresolvedFileRestore}=require('./git-retained-recovery');
const name='zero-commit-provenance.json',lockName='zero-commit-provenance.lock',switchOwners=new WeakMap();
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
async function directory(root) {
  if(typeof root!=='string'||await fs.realpath(root)!==root)throw new Error('The project changed; review it again.');
  const marker=path.join(root,'.git'),stat=await fs.stat(marker);
  if(!stat.isDirectory()&&!stat.isFile())throw new Error('The project Git directory cannot be verified.');
  if(await fs.realpath(await core.git(root,['rev-parse','--show-toplevel']))!==root)throw new Error('The project changed; review it again.');
  const dot=await fs.realpath(path.resolve(root,await core.git(root,['rev-parse','--git-common-dir'])));
  const common=await fs.lstat(dot);
  if(!common.isDirectory()||common.isSymbolicLink())throw new Error('The project Git directory cannot be verified.');
  return dot;
}
async function syncDir(dot) {if(process.platform==='win32')return;const h=await fs.open(dot,'r');try{await h.sync();}finally{await h.close();}}
async function assertLock(scope) {
  const current=await fs.lstat(scope.lock);
  if(!current.isFile()||current.isSymbolicLink()||current.dev!==scope.identity.dev||current.ino!==scope.identity.ino)throw new Error('The Zero operation lock changed; inspect the project before continuing.');
}
// Restore evidence belongs to the standalone worktree that created it. Linked
// worktrees share its common Git directory and must not bypass that evidence.
async function assertFileRestoreClear(root) {
  const dot=await directory(root),marker=await fs.lstat(path.join(root,'.git'));
  if(marker.isDirectory()&&!marker.isSymbolicLink()&&await fs.realpath(path.join(root,'.git'))===dot)return assertNoUnresolvedFileRestore(root);
  const worktreeGit=await fs.realpath(await core.git(root,['rev-parse','--absolute-git-dir']));
  for(const dir of new Set([dot,worktreeGit])) {
    const switches=(await fs.readdir(dir)).filter(name=>name.startsWith('zero-reftable-switch-recovery-')||name.startsWith('zero-reftable-update-recovery-')||name.startsWith('zero-conflict-preview-')||name==='zero-conflict-preview.lock'||name==='zero-reftable-switch.lock'||name==='zero-reftable-update.lock').sort();
    if(switches.length){let verifiedPrimary=false;if(dir===dot&&path.basename(dot)==='.git'){const primary=path.dirname(dot);try{if(await fs.realpath(path.join(primary,'.git'))===dot){await require('./reftable-switch-capture').assertNoUnresolvedSwitch(primary);verifiedPrimary=true;}}catch(error){if(error.recoveryPath)throw error;}}if(!verifiedPrimary){const failure=new Error('A reftable switch recovery folder or lock needs inspection. Open the original project and use Inspect recovery copies → Reftable switch before continuing. Keep all retained evidence.');failure.recoveryPath=path.join(dir,switches[0]);throw failure;}}
    const names=(await fs.readdir(dir)).filter(name=>name.startsWith('zero-file-restore-recovery-'));
    if(!names.length)continue;
    if(dir===dot&&path.basename(dot)==='.git') {
      const primary=path.dirname(dot);
      try {if(await fs.realpath(path.join(primary,'.git'))===dot){await assertNoUnresolvedFileRestore(primary);continue;}}catch(error){if(error.recoveryPath)throw error;}
    }
    const failure=new Error('A deleted-file restoration needs inspection before continuing. Inspect the recovery folder and project before retrying.');failure.recoveryPath=path.join(dir,names[0]);throw failure;
  }
}
async function locked(root,operation) {
  const dot=await directory(root),lock=path.join(dot,lockName);let h;
  try{h=await fs.open(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST'){const failure=new Error('Another Zero action may be running. Close other Zero windows, then inspect the lock before continuing; it will not be removed automatically.');failure.recoveryPath=lock;throw failure;}throw error;}
  const scope={dot,root,lock,identity:await h.stat(),retainLock:false};
  try{await h.sync();await syncDir(dot);if(await directory(root)!==dot)throw new Error('The project Git directory changed; review it again.');await assertLock(scope);return await operation(scope);}finally{
    try {await h.close();if(!scope.retainLock){await assertLock(scope);await fs.unlink(lock);await syncDir(dot);}}
    catch(error) {try{await fs.lstat(lock);error.recoveryPath=lock;}catch{}throw error;}
  }
}
async function invalidate({dot}) {
  try{await fs.unlink(path.join(dot,name));}catch(error){if(error.code!=='ENOENT')throw error;}
  await syncDir(dot);
}
async function save(scope,receipt) {
  if(receipt.root!==scope.root||!oid(receipt.head)||!(receipt.parent===null||oid(receipt.parent))||typeof receipt.branch!=='string'||!receipt.branch||receipt.head===receipt.parent)throw new Error('Cannot verify this local commit.');
  const body=JSON.stringify({version:1,root:receipt.root,branch:receipt.branch,parent:receipt.parent,head:receipt.head,pushStarted:false})+'\n';
  const temp=path.join(scope.dot,`${name}.${crypto.randomBytes(12).toString('hex')}`);let h;
  try {h=await fs.open(temp,'wx',0o600);await h.writeFile(body);await h.sync();await h.close();h=null;await fs.rename(temp,path.join(scope.dot,name));await syncDir(scope.dot);}
  finally {if(h)await h.close();await fs.rm(temp,{force:true});}
}
async function withCommit(root,commit) {
  let saved;
  try {return await locked(root,async scope=>{
    await assertFileRestoreClear(root);
    await invalidate(scope);
    const {result,parent}=await commit();
    saved=result;
    // Windows supports ordinary commits and uploads but not this receipt-based
    // rewrite. The authority separately rejects that platform.
    if(process.platform==='win32')return {...result,undoUnavailable:true};
    try {
      const current=await core.git(root,['rev-parse','--verify','HEAD^{commit}']);
      const branch=await core.currentBranch(root);
      const lineage=await core.git(root,['rev-list','--parents','-n','1',result.head]);
      await assertLock(scope);
      if(await directory(root)!==scope.dot||current!==result.head||branch!==result.branch||lineage!==`${result.head}${parent ? ` ${parent}` : ''}`)throw new Error('The commit changed.');
      await save(scope,{root,branch:result.branch,parent:parent||null,head:result.head});
    }
    catch(error) {
      try { await assertLock(scope); await invalidate(scope); }
      catch {
        // Never expose a potentially valid stale receipt without the lock.
        scope.retainLock=true;
        const failure=new Error('Your commit was saved locally, but its recovery record needs inspection before syncing.');
        failure.localCommitRecovery={root,branch:result.branch,head:result.head};failure.recoveryPath=path.join(scope.dot,lockName);throw failure;
      }
      return {...result,undoUnavailable:true};
    }
    return result;
  });} catch(error) {
    if(saved?.head && !error.localCommitRecovery) {
      const failure=new Error('Your commit was saved locally, but its recovery lock or record needs inspection before syncing.');
      failure.localCommitRecovery={root,branch:saved.branch,head:saved.head};
      if(error.recoveryPath)failure.recoveryPath=error.recoveryPath;
      throw failure;
    }
    throw error;
  }
}
async function pushBinding(scope) {
  const gitDir=await fs.realpath(await core.git(scope.root,['rev-parse','--absolute-git-dir']));
  if(await directory(scope.root)!==scope.dot)throw new Error('The project Git directory changed; review it again.');
  const marker=path.join(scope.root,'.git'),markerInfo=await fs.lstat(marker);
  const rootInfo=await fs.lstat(scope.root),gitInfo=await fs.lstat(gitDir),commonInfo=await fs.lstat(scope.dot);
  const readFile=async file=>{try{const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw new Error('The project Git directory cannot be verified.');return await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const markerText=markerInfo.isSymbolicLink()?await fs.readlink(marker):markerInfo.isFile()?await readFile(marker):null;
  const commonFile=path.join(gitDir,'commondir'),commonText=await readFile(commonFile);
  const equal=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
  const readNow=file=>{try{const info=fsSync.lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw new Error('The project Git directory cannot be verified.');return fsSync.readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  return Object.freeze({root:scope.root,gitDir,commonDir:scope.dot,assertCurrentNow(){
    try {
      if(!equal(rootInfo,fsSync.lstatSync(scope.root))||!equal(markerInfo,fsSync.lstatSync(marker))||
         !equal(gitInfo,fsSync.lstatSync(gitDir))||!equal(commonInfo,fsSync.lstatSync(scope.dot))||
         !equal(scope.identity,fsSync.lstatSync(scope.lock))||
         (markerInfo.isSymbolicLink()?fsSync.readlinkSync(marker)!==markerText:markerInfo.isFile()&&readNow(marker)!==markerText)||readNow(commonFile)!==commonText)throw new Error('changed');
    } catch {throw new Error('The project Git directory or Zero lock changed; review the sync again.');}
  }});
}
async function withPush(root,push) {
  let dispatchStarted=false;
  try {return await locked(root,async scope=>{await assertFileRestoreClear(root);await invalidate(scope);if(await directory(root)!==scope.dot)throw new Error('The project Git directory changed; review it again.');await assertLock(scope);const binding=await pushBinding(scope);dispatchStarted=true;return push(binding);});}
  catch(error){if(!dispatchStarted)error.pushNotStarted=true;throw error;}
}
// Local history-changing phases share the same common-directory lock as
// commits, pushes, and undo authority. The receipt is consumed before any
// mutation, even when the operation later fails. The binding is valid only
// while this call holds the original lock; it must not be used as a general
// exemption for other Zero locks or handed to another operation.
async function withLocalMutation(root,mutate) {
  if(typeof mutate!=='function')throw new Error('A local mutation is required.');
  return locked(root,async scope=>{
    await assertFileRestoreClear(root);
    await invalidate(scope);
    const base=await pushBinding(scope);
    const binding=Object.freeze({root:base.root,gitDir:base.gitDir,commonDir:base.commonDir,
      assertCurrentNow:base.assertCurrentNow,
      ownsLock(file,info) {
        base.assertCurrentNow();
        return file===scope.lock && Boolean(info?.isFile?.()) && !info.isSymbolicLink() &&
          info.dev===scope.identity.dev && info.ino===scope.identity.ino;
      }});
    return mutate(binding);
  });
}
// Read-only reviewed observations share the lock without consuming undo authority.
async function withReadOnly(root,observe){
  if(typeof observe!=='function')throw new Error('A read-only operation is required.');
  return locked(root,async scope=>{await assertFileRestoreClear(root);const base=await pushBinding(scope);return observe(base);});
}
// Ref-only transaction preparation is read-only. Keep the receipt until the
// transaction is prepared and all checks pass, then consume it under this
// same exclusive lock before the caller sends commit.
async function withDeferredRefMutation(root,operation){
  if(typeof operation!=='function')throw new Error('A ref mutation is required.');
  return locked(root,async scope=>{await assertFileRestoreClear(root);const base=await pushBinding(scope);let active=true,consumed=false;
    const check=()=>{if(!active)throw new Error('The ref mutation owner has expired.');base.assertCurrentNow();};
    const binding=Object.freeze({root:base.root,gitDir:base.gitDir,commonDir:base.commonDir,assertCurrentNow:check,ownsLock(file,info){check();return file===scope.lock&&Boolean(info?.isFile?.())&&!info.isSymbolicLink()&&info.dev===scope.identity.dev&&info.ino===scope.identity.ino;},async invalidateReceipt(){check();if(consumed)throw new Error('The ref mutation receipt was already consumed.');consumed=true;await assertFileRestoreClear(root);check();await invalidate(scope);check();}});
    try{return await operation(binding);}finally{active=false;}
  });
}
// The exclusion below is bound to a directory created by this lock scope.
async function withOwnedAddedRemovalMutation(root,operation){
 if(typeof operation!=='function')throw new Error('An added-file operation is required.');
 return locked(root,async scope=>{await assertFileRestoreClear(root);const base=await pushBinding(scope);if(base.gitDir!==path.join(root,'.git')||base.commonDir!==base.gitDir)throw new Error('Use a standalone project for added-file recovery.');let active=true,owned,consumed=false;
 const check=()=>{if(!active)throw new Error('The added-file owner has expired.');base.assertCurrentNow();if(owned){const info=fsSync.lstatSync(owned.folder);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==owned.dev||info.ino!==owned.ino||fsSync.realpathSync(owned.folder)!==owned.folder)throw new Error('The retained folder changed; preserve all entries.');}};
 const binding=Object.freeze({root,gitDir:base.gitDir,commonDir:base.commonDir,assertCurrentNow:check,
 async createRetention(){check();if(owned)throw new Error('This operation already has a retained folder.');const folder=await fs.mkdtemp(path.join(scope.dot,'zero-file-restore-recovery-'));try{const info=await fs.lstat(folder);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(folder)!==folder)throw new Error('The retained folder needs inspection.');await syncDir(scope.dot);base.assertCurrentNow();owned={folder,name:path.basename(folder),dev:info.dev,ino:info.ino};check();return folder;}catch(error){error.recoveryPath=folder;throw error;}},
 async invalidateReceipt(){check();if(!owned||consumed)throw new Error('The added-file receipt cannot be consumed.');await assertNoUnresolvedFileRestore(root,{own:{name:owned.name,dev:owned.dev,ino:owned.ino}});check();consumed=true;await invalidate(scope);check();}});
 try{return await operation(binding);}finally{active=false;}
 });
}
// An owner can adopt only the one-use token minted by capture itself while the
// provenance lock is held. No caller-supplied path grants an exemption.
async function withOwnedReftableAction(root,operation,kind) {
  const captureLock=kind==='update'?'zero-reftable-update.lock':'zero-reftable-switch.lock';
  if(typeof operation!=='function')throw new Error('A switch operation is required.');
  return locked(root,async scope=>{await assertFileRestoreClear(root);await invalidate(scope);const base=await pushBinding(scope);let active=true,owned;
    const checkNow=()=>{if(!active)throw new Error('The switch owner has expired.');base.assertCurrentNow();if(owned){const info=fsSync.lstatSync(owned.folder);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==owned.dev||info.ino!==owned.ino)throw new Error('The owned switch recovery folder changed.');try{const lock=fsSync.lstatSync(path.join(scope.dot,captureLock));if(!lock.isFile()||lock.isSymbolicLink()||lock.dev!==owned.lockDev||lock.ino!==owned.lockIno)throw new Error('The switch capture lock changed.');}catch(error){if(error.code!=='ENOENT')throw error;}}};
    const binding=Object.freeze({root:base.root,gitDir:base.gitDir,commonDir:base.commonDir,assertCurrentNow:checkNow,ownsLock(file,info){checkNow();return file===scope.lock&&Boolean(info?.isFile?.())&&!info.isSymbolicLink()&&info.dev===scope.identity.dev&&info.ino===scope.identity.ino;},async adoptCapture(token){checkNow();if(owned)throw new Error('This switch owner already has evidence.');const candidate=require('./reftable-switch-capture').consumeCaptureOwner(token,root,kind);if(candidate.folder!==path.join(scope.dot,candidate.name))throw new Error('The switch recovery folder changed.');owned=candidate;checkNow();},async assertCurrent(){checkNow();if(!owned){await assertFileRestoreClear(root);checkNow();return;}await require('./git-retained-recovery').assertNoUnresolvedFileRestoreOnly(root);const entries=(await fs.readdir(scope.dot)).filter(name=>name.startsWith('zero-reftable-switch-recovery-')||name.startsWith('zero-reftable-update-recovery-')||name.startsWith('zero-conflict-preview-')||name==='zero-conflict-preview.lock'||name==='zero-reftable-switch.lock'||name==='zero-reftable-update.lock');let found=false;for(const name of entries){if(name===owned.name){found=true;continue;}if(name===captureLock)continue;if(name.startsWith('zero-reftable-switch-recovery-')&&await require('./reftable-switch-resolution').validatedReftableSwitchResolution(root,name)||name.startsWith('zero-reftable-update-recovery-')&&await require('./reftable-update-resolution').validatedReftableUpdateResolution(root,name))continue;const error=new Error('Another switch recovery entry needs inspection.');error.recoveryPath=path.join(scope.dot,name);throw error;}if(!found)throw new Error('The owned switch recovery folder changed.');checkNow();}});
    switchOwners.set(binding,{root,kind,checkNow,owned:()=>owned});try{return await operation(binding);}finally{active=false;switchOwners.delete(binding);}
  });
}
async function withOwnedReftableSwitch(root,operation){return withOwnedReftableAction(root,operation,'switch');}
async function withOwnedReftableUpdate(root,operation){return withOwnedReftableAction(root,operation,'update');}
async function assertOwnedReftableSwitch(binding,root,folder){const state=switchOwners.get(binding);if(!state||state.root!==root||state.kind!=='switch')throw new Error('The switch owner has expired.');state.checkNow();const owned=state.owned();if(!owned||owned.folder!==folder)throw new Error('This switch owner does not own that recovery folder.');await binding.assertCurrent();state.checkNow();}
function assertReftableSwitchOwner(binding,root){const state=switchOwners.get(binding);if(!state||state.root!==root||state.kind!=='switch')throw new Error('A live switch owner is required.');state.checkNow();}
function assertReftableUpdateOwner(binding,root){const state=switchOwners.get(binding);if(!state||state.root!==root||state.kind!=='update')throw new Error('A live update owner is required.');state.checkNow();}
async function assertOwnedReftableUpdate(binding,root,folder){const state=switchOwners.get(binding);if(!state||state.root!==root||state.kind!=='update')throw new Error('The update owner has expired.');state.checkNow();const owned=state.owned();if(!owned||owned.folder!==folder)throw new Error('This update owner does not own that recovery folder.');await binding.assertCurrent();state.checkNow();}
module.exports={withCommit,withPush,withLocalMutation,withReadOnly,withDeferredRefMutation,withOwnedAddedRemovalMutation,withOwnedReftableSwitch,withOwnedReftableUpdate,assertOwnedReftableUpdate,assertReftableUpdateOwner,assertOwnedReftableSwitch,assertReftableSwitchOwner,assertFileRestoreClear};
