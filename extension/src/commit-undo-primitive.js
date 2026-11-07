'use strict';
// Unwired primitive. Its caller must supply a policy and explain its limits.
// A remote snapshot and Zero's provenance receipt cannot prove that a commit
// was never shared, or exclude publication through another tool or copy.
// It keeps the index and working files unchanged; the removed commit's
// changes remain uncommitted.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const fsSync=require('node:fs');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {validatedCompletedProjectRestore}=require('./project-restore-plan');
const {validatedCompletedDiscard}=require('./discard-preview');
const {inspectInverseRecovery,validatedCompletedFileRestore}=require('./git-retained-recovery');
const exec=promisify(execFile);
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'};
const fail=()=>new Error('Project state changed or cannot be verified. Review the commit again.');
async function git(root,args) {return (await exec('git',['--no-pager','-c','core.fsmonitor=false','-c',`core.hooksPath=${os.devNull}`,'-c','commit.gpgSign=false',...args],{cwd:root,env,timeout:10000,maxBuffer:1024*1024})).stdout.trim();}
async function syncDir(dir) {const h=await fs.open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function write(file,value) {const h=await fs.open(file,'wx',0o600);try{await h.writeFile(value);await h.sync();}finally{await h.close();}}
async function direct(root,branch) {try{await git(root,['symbolic-ref','--quiet','--no-recurse',branch]);}catch(e){if(e.code===1)return;throw e;}throw fail();}
async function recoveryJson(folder,name) {
 const file=path.join(folder,name),before=await fs.lstat(file);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>16384)throw fail();
 const handle=await fs.open(file,fsSync.constants.O_RDONLY|(fsSync.constants.O_NOFOLLOW||0));
 try {
  const same=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs'].every(key=>a[key]===b[key]);
  const opened=await handle.stat();if(!same(before,opened))throw fail();
  const buffer=Buffer.alloc(16385);let length=0;
  while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}
  if(length!==before.size||!same(before,await handle.stat())||!same(before,await fs.lstat(file)))throw fail();
  return JSON.parse(buffer.subarray(0,length).toString('utf8'));
 } finally {await handle.close();}
}
// A pinned inverse alone is an unapplied intention. Permit its retained folder
// only when an independently validated restore applied that exact target, and
// the correction will remain in this branch after the proposed local undo.
async function completedInverse(root,dot,name,entries,recovery) {
 try {
  if(!/^zero-inverse-recovery-[A-Za-z0-9]+$/.test(name))return false;
  const folder=path.join(dot,name),before=await fs.lstat(folder);
  if(!before.isDirectory()||before.isSymbolicLink()||await fs.realpath(folder)!==folder)return false;
  await recovery.charge(name);
  const info=await inspectInverseRecovery(root,name);
  if(!info.packMatches||!info.observedRef||info.observedRef.symbolic||info.observedRef.object!==info.commit)return false;
  const intent=await recoveryJson(folder,'intent.json'),imported=await recoveryJson(folder,'imported.json'),pinned=await recoveryJson(folder,'pinned.json');
  if(intent.schema!==1||intent.status!=='import-intended'||imported.status!=='imported'||pinned.status!=='pinned'||!oid(imported.packObject)||pinned.packObject!==imported.packObject||
     [imported,pinned].some(record=>Object.keys(intent).some(key=>key!=='status'&&record[key]!==intent[key]))||
     ['head','branch','change','commit','ref'].some(key=>intent[key]!==info[key])||!oid(intent.tree))return false;
  if(await git(root,['show','-s','--format=%T%n%P',info.commit])!==`${intent.tree}\n${info.head}`)return false;
  const branch=await git(root,['symbolic-ref','--quiet','--no-recurse','HEAD']);
  if(branch!==info.branch)return false;await direct(root,branch);
  const lineage=(await git(root,['rev-list','--parents','-n','1','HEAD'])).split(' ');
  if(lineage.length!==2||!lineage.every(oid))return false;
  const restores=entries.filter(entry=>entry.name.startsWith('zero-project-restore-recovery-'));
  if(restores.length>500)return false;
  for(const entry of restores) {
   if(!entry.isDirectory()||entry.isSymbolicLink())continue;
   const receipt=await recovery.pin(entry.name);
   if(receipt.selected!==info.commit||receipt.head!==info.head||receipt.branch!==branch||receipt.tree!==intent.tree)continue;
   const completed=await recovery.restore(entry.name);if(!completed||completed.branch!==branch||receipt.commit!==completed.commit)continue;
   if(JSON.stringify(receipt)!==JSON.stringify(await recoveryJson(path.join(dot,entry.name),'pinned.json')))return false;
   try {await git(root,['merge-base','--is-ancestor',completed.commit,lineage[1]]);}catch(error){if(error.code===1)continue;throw error;}
   const after=await fs.lstat(folder);
   return after.isDirectory()&&!after.isSymbolicLink()&&before.dev===after.dev&&before.ino===after.ino;
  }
 } catch {}
 return false;
}
function recoveryChecks(root,dot,entries) {
 const names=entries.filter(entry=>/^zero-(?:inverse-recovery-|project-restore-recovery-|discard-recovery-|file-restore-recovery-)/.test(entry.name));
 if(names.length>500)throw new Error('Too many retained recovery folders to inspect safely before undo.');
 let bytes=0,files=0;const charged=new Set(),restores=new Map(),pins=new Map();
 const charge=async name=>{
  if(charged.has(name))return;charged.add(name);
  // Validators read fixed files directly inside each retained folder. Count
  // their aggregate input before hashing; temporary nested trees are not read.
  const directory=await fs.opendir(path.join(dot,name));
  for await(const entry of directory) {
   if(++files>10000)throw new Error('Retained recovery has too many entries to inspect safely before undo.');
   const info=await fs.lstat(path.join(dot,name,entry.name));
   if(info.isFile()){bytes+=info.size;if(bytes>256*1024*1024)throw new Error('Retained recovery is too large to inspect safely before undo.');}
  }
 };
 return {charge,async pin(name){
  if(!pins.has(name)){await charge(name);pins.set(name,await recoveryJson(path.join(dot,name),'pinned.json'));}
  return pins.get(name);
 },async restore(name){
  if(!restores.has(name)){await charge(name);restores.set(name,await validatedCompletedProjectRestore(root,name));}
  return restores.get(name);
 }};
}
async function requireNoPending(root,dot,ownRecovery,binding) {
 for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','REBASE_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG','shallow','info/grafts','objects/info/alternates','refs/zero/pending-finish']) {
  try {await fs.lstat(path.join(dot,name));throw new Error('A Git operation or recovery needs inspection before undo.');} catch(e) {if(e.code!=='ENOENT')throw e;}
 }
 if(await git(root,['for-each-ref','--format=%(refname)','refs/replace/'])||await git(root,['for-each-ref','--format=%(refname)','refs/zero/pending-finish']))throw new Error('A Git operation or recovery needs inspection before undo.');
 const entries=await fs.readdir(dot,{withFileTypes:true});
 const recovery=recoveryChecks(root,dot,entries);
 for(const entry of entries) {
  if(entry.name.startsWith('zero-commit-undo-')) {
   if(path.join(dot,entry.name)===ownRecovery)continue;
   if(!entry.isDirectory()||entry.isSymbolicLink())throw fail();
   const dir=path.join(dot,entry.name);
   try {
    for(const name of ['intent.json','prepared.json','complete.json']) {const stat=await fs.lstat(path.join(dir,name));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw fail();}
    const intent=JSON.parse(await fs.readFile(path.join(dir,'intent.json'),'utf8'));
    const prepared=JSON.parse(await fs.readFile(path.join(dir,'prepared.json'),'utf8'));
    const complete=JSON.parse(await fs.readFile(path.join(dir,'complete.json'),'utf8'));
    if(intent.schema!==1||prepared.schema!==1||complete.schema!==1||!oid(intent.head)||!oid(intent.parent)||
       !/^refs\/zero\/commit-undo\/[a-f0-9]{32}$/.test(intent.ref)||intent.root!==root||
       intent.mode!=='rewrite'||prepared.mode!=='rewrite'||complete.mode!=='rewrite'||
       [prepared,complete].some(x=>x.head!==intent.head||x.branch!==intent.branch||x.ref!==intent.ref||x.target!==intent.parent)||
       await git(root,['rev-parse','--verify',intent.ref])!==intent.head)throw fail();
   } catch {throw new Error('An interrupted undo needs recovery inspection before another undo.');}
  } else if(entry.name.startsWith('zero-project-restore-recovery-') && entry.isDirectory() && !entry.isSymbolicLink() && await recovery.restore(entry.name)) {
   continue;
  } else if(entry.name.startsWith('zero-discard-recovery-') && entry.isDirectory() && !entry.isSymbolicLink() && (await recovery.charge(entry.name),await validatedCompletedDiscard(root,entry.name))) {
   continue;
  } else if(entry.name.startsWith('zero-file-restore-recovery-') && entry.isDirectory() && !entry.isSymbolicLink() && (await recovery.charge(entry.name),await validatedCompletedFileRestore(root,entry.name))) {
   continue;
  } else if(entry.name.startsWith('zero-inverse-recovery-') && await completedInverse(root,dot,entry.name,entries,recovery)) {
   continue;
  } else if(/^zero-.*recovery/i.test(entry.name)||(/^zero-.*\.lock$/i.test(entry.name)&&entry.name!=='zero-commit-provenance.lock')) {
   if(entry.name==='zero-pending-sync.lock'&&binding){const file=path.join(dot,entry.name),info=await fs.lstat(file);binding.assertCurrentNow();if(binding.ownsLock(file,info)===true)continue;}
   const error=new Error('A retained Zero recovery or operation needs inspection before undo.');
   error.recoveryPath=path.join(dot,entry.name);throw error;
  }
 }
}
async function undoLatestCommit({root,expectedHead,withAuthority,withLedger,beforeRef=async()=>{},beforeRefNow=()=>{},_testBeforeRef,_testAfterRef}) {
 if(typeof root!=='string'||await fs.realpath(root)!==root||!oid(expectedHead)||typeof withAuthority!=='function'||(withLedger!==undefined&&typeof withLedger!=='function')||typeof beforeRef!=='function'||typeof beforeRefNow!=='function'||beforeRefNow.constructor.name==='AsyncFunction')throw fail();
 if(process.platform==='win32')throw new Error('Undo is not supported on Windows yet.');
 const dot=path.join(root,'.git'),dotInfo=await fs.lstat(dot);if(!dotInfo.isDirectory()||dotInfo.isSymbolicLink())throw fail();
 if(await fs.realpath(await git(root,['rev-parse','--show-toplevel']))!==root||
    await fs.realpath(path.resolve(root,await git(root,['rev-parse','--absolute-git-dir'])))!==dot||
    await fs.realpath(path.resolve(root,await git(root,['rev-parse','--git-common-dir'])))!==dot)throw fail();
 let headLock,indexLock,headIdentity,indexIdentity,recoveryPath,primaryError,completed=false;
 try {
  indexLock=await fs.open(path.join(dot,'index.lock'),'wx',0o600);indexIdentity=await indexLock.stat();
  headLock=await fs.open(path.join(dot,'HEAD.lock'),'wx',0o600);headIdentity=await headLock.stat();
  await requireNoPending(root,dot);
  const branch=await git(root,['symbolic-ref','--quiet','--no-recurse','HEAD']);if(!branch.startsWith('refs/heads/'))throw fail();await direct(root,branch);
  const head=await git(root,['rev-parse','--verify','HEAD^{commit}']);if(head!==expectedHead)throw fail();
  const lineage=(await git(root,['rev-list','--parents','-n','1',head])).split(' ');if(lineage.length!==2||lineage[0]!==head||!oid(lineage[1]))throw new Error('Undo supports a latest commit with one parent.');
  const parent=lineage[1];
  let consumed=false;
  const result=await withAuthority({root,branch,head,parent},async (mode,authorityBeforeRef,authorityBeforeRefNow,authorityBinding)=>{
   if(consumed)throw fail();consumed=true;
   if(mode!=='rewrite')throw new Error('Sharing status is uncertain. Review this commit.');
   let ledgerUsed=false,executionDone=false,execution,executedResult,acceptExecution=true;
   const execute=binding=>{
   if(!acceptExecution||ledgerUsed)throw fail();ledgerUsed=true;
   execution=(async()=>{
   if((withLedger&&!binding)||(binding&&(binding.root!==root||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')))throw fail();
   if(withLedger){const file=path.join(dot,'zero-pending-sync.lock'),info=fsSync.lstatSync(file),checked=binding.assertCurrentNow();if(checked&&typeof checked.then==='function'){void Promise.resolve(checked).catch(()=>{});throw fail();}if(binding.ownsLock(file,info)!==true)throw fail();}
   recoveryPath=await fs.mkdtemp(path.join(dot,'zero-commit-undo-'));await fs.chmod(recoveryPath,0o700);await syncDir(dot);
   const ref=`refs/zero/commit-undo/${crypto.randomBytes(16).toString('hex')}`;
   await write(path.join(recoveryPath,'intent.json'),JSON.stringify({schema:1,root,branch,head,parent,mode,ref})+'\n');await syncDir(recoveryPath);
   await git(root,['update-ref','--no-deref',ref,head,'0'.repeat(head.length)]);
   const target=parent;
   const alt=path.join(recoveryPath,'ref-gitdir');await fs.mkdir(alt,{mode:0o700});const altInfo=await fs.lstat(alt);
   await write(path.join(alt,'HEAD'),head+'\n');await write(path.join(alt,'commondir'),dot+'\n');await syncDir(alt);
   await write(path.join(recoveryPath,'prepared.json'),JSON.stringify({schema:1,branch,head,parent,mode,ref,target})+'\n');await syncDir(recoveryPath);
   if(_testBeforeRef)await _testBeforeRef({root,branch,head,parent,ref,target});
   // The caller rechecks workspace trust, open editors and exact reminders
   // after preparation. Git identity and lock checks below run again after it.
   await beforeRef({root,branch,head,parent,ref,target});
   const revalidate=async()=>{
   const nowDot=await fs.lstat(dot),nowAlt=await fs.lstat(alt),nowHeadLock=await fs.lstat(path.join(dot,'HEAD.lock')),nowIndexLock=await fs.lstat(path.join(dot,'index.lock'));
   if(nowDot.dev!==dotInfo.dev||nowDot.ino!==dotInfo.ino||!nowDot.isDirectory()||nowDot.isSymbolicLink()||nowAlt.dev!==altInfo.dev||nowAlt.ino!==altInfo.ino||!nowAlt.isDirectory()||nowAlt.isSymbolicLink()||await fs.realpath(alt)!==alt||nowHeadLock.dev!==headIdentity.dev||nowHeadLock.ino!==headIdentity.ino||nowIndexLock.dev!==indexIdentity.dev||nowIndexLock.ino!==indexIdentity.ino||await fs.readFile(path.join(alt,'HEAD'),'utf8')!==head+'\n'||await fs.readFile(path.join(alt,'commondir'),'utf8')!==dot+'\n')throw fail();
   await requireNoPending(root,dot,recoveryPath,binding);
   if(await fs.realpath(path.resolve(root,await git(root,['rev-parse','--absolute-git-dir'])))!==dot||await fs.realpath(path.resolve(root,await git(root,['rev-parse','--git-common-dir'])))!==dot)throw fail();
   if(await git(root,['symbolic-ref','--quiet','--no-recurse','HEAD'])!==branch||await git(root,['rev-parse','--verify','HEAD^{commit}'])!==head)throw fail();await direct(root,branch);
   };
   await revalidate();
   if(authorityBeforeRef)await authorityBeforeRef();
   await revalidate();
   const checked=beforeRefNow({root,branch,head,parent,ref,target});
   if(checked&&typeof checked.then==='function'){void Promise.resolve(checked).catch(()=>{});throw fail();}
   if(authorityBeforeRefNow){const authorityChecked=authorityBeforeRefNow();if(authorityChecked&&typeof authorityChecked.then==='function'){void Promise.resolve(authorityChecked).catch(()=>{});throw fail();}}
   if(binding){const checkedBinding=binding.assertCurrentNow();if(checkedBinding&&typeof checkedBinding.then==='function'){void Promise.resolve(checkedBinding).catch(()=>{});throw fail();}}
   for(const [file,identity] of [[dot,dotInfo],[alt,altInfo],[path.join(dot,'HEAD.lock'),headIdentity],[path.join(dot,'index.lock'),indexIdentity]]) {const current=fsSync.lstatSync(file);if(current.dev!==identity.dev||current.ino!==identity.ino)throw fail();}
   await git(root,[`--git-dir=${alt}`,'update-ref','--no-deref','-m','Zero: undo latest commit',branch,target,head]);
   completed=true;
   if(_testAfterRef)await _testAfterRef({root,branch,head,parent,ref,target});
   await write(path.join(recoveryPath,'complete.json'),JSON.stringify({schema:1,branch,head,target,ref,mode})+'\n');await syncDir(recoveryPath);
   return executedResult={branch,oldHead:head,head:target,parent,recoveryRef:ref,recoveryPath,mode};
   })().finally(()=>{executionDone=true;});void execution.catch(()=>{});return execution;
   };
   if(withLedger&&!authorityBinding)throw fail();
   let result,ledgerError;
   try {result=withLedger?await withLedger(authorityBinding,execute):await execute();}catch(error){ledgerError=error;}finally{acceptExecution=false;}
   if(execution){const returnedEarly=!executionDone;try{await execution;}catch(error){ledgerError=ledgerError||error;}if(returnedEarly)ledgerError=ledgerError||fail();}
   if(ledgerError)throw ledgerError;if(!ledgerUsed||result!==executedResult)throw fail();return result;
  });
  completed=true;return result;
 } catch(error) {if(recoveryPath){if(error.recoveryPath&&error.recoveryPath!==recoveryPath&&!error.additionalRecoveryPath)error.additionalRecoveryPath=error.recoveryPath;error.recoveryPath=recoveryPath;}if(completed)error.undoCompleted=true;primaryError=error;throw error;}
 finally {
  const cleanupFailures=[];
  for(const [handle,identity,file] of [[headLock,headIdentity,'HEAD.lock'],[indexLock,indexIdentity,'index.lock']]) {
   const lockPath=path.join(dot,file);
   try {if(handle)await handle.close();if(identity){const now=await fs.lstat(lockPath);if(now.dev!==identity.dev||now.ino!==identity.ino)throw new Error('Lock ownership changed.');await fs.unlink(lockPath);}}
   catch(error){cleanupFailures.push({path:lockPath,error});}
  }
  if(cleanupFailures.length){const error=primaryError||new Error(completed?'Undo completed, but Git locks need inspection.':'Undo lock cleanup needs inspection.');if(recoveryPath&&!error.recoveryPath)error.recoveryPath=recoveryPath;error.lockCleanupFailures=[...(error.lockCleanupFailures||[]),...cleanupFailures];for(const failure of cleanupFailures){if(!error.lockRecoveryPath)error.lockRecoveryPath=failure.path;else if(!error.additionalLockRecoveryPath)error.additionalLockRecoveryPath=failure.path;else error.message+=` Additional lock requiring inspection: ${failure.path}.`;}if(completed)error.undoCompleted=true;throw error;}
 }
}
module.exports={undoLatestCommit};
