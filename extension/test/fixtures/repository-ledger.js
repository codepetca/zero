'use strict';
// Lightweight Memento-backed adapter for UI fixtures. Real lock and durability
// behavior is tested separately with the actual repository ledger.
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path');
const {createPendingSyncLedger}=require('../../src/pending-sync-ledger');
function repositoryLedgerFactory({state}) {
 const tracked=new Map(),hasKeys=typeof state.keys==='function';
 const memory={keys:()=>hasKeys?state.keys():[...tracked.keys()],get:key=>hasKeys?state.get(key):tracked.get(key),
  async update(key,value){await state.update(key,value);tracked.set(key,value);}};
 const ledger=createPendingSyncLedger(memory);
 function all(root){
  const keys=memory.keys(),branches=new Set();
  for(const key of keys){const value=memory.get(key);if(key.startsWith('zero.pendingSync.v1:')&&value?.root===root)branches.add(value.branch);
   for(const prefix of ['zero.gitUploadRecovery:','zero.localCommitPending:'])if(key.startsWith(prefix+root+':'))branches.add(key.slice((prefix+root+':').length));}
  const entries=[];for(const branch of branches){const push=memory.get(`zero.gitUploadRecovery:${root}:${branch}`),local=memory.get(`zero.localCommitPending:${root}:${branch}`);
   const legacyLocal=local?{...local,remote:'',type:'local'}:undefined;
   const seen=new Set();for(const item of [...ledger.list(root,branch,push),...ledger.list(root,branch,legacyLocal)])if(!seen.has(item.id)){entries.push(item);seen.add(item.id);}}
  return entries;
 }
 const fingerprint=root=>JSON.stringify(memory.keys().filter(k=>k.startsWith('zero.pendingSync.v1:')||k.startsWith('zero.resolvedSync.v1:')||k.startsWith(`zero.gitUploadRecovery:${root}:`)||k.startsWith(`zero.localCommitPending:${root}:`)).sort().map(k=>[k,memory.get(k)]));
 async function transaction(root,callback,outer=()=>{},owns=()=>false){let active=true,expected=fingerprint(root),pending=false;
  const check=()=>{if(!active||pending)throw Error('Sync transaction expired or busy.');outer();if(fingerprint(root)!==expected)throw Error('Sync reminders changed. Review them again.');};
  const perform=async action=>{check();pending=true;try{return await action();}finally{expected=fingerprint(root);pending=false;}};
  const tx=Object.freeze({root,assertCurrentNow:check,ownsLock(file,info){check();return owns(file,info);},list:()=>perform(()=>all(root)),add:record=>perform(()=>ledger.add(record)),resolve:(id,reason)=>perform(async()=>{const record=all(root).find(item=>item.id===id);if(!record)throw Error('Sync reminder changed.');return ledger.resolve(record,reason);})});
  try{return await callback(tx);}finally{active=false;}
 }
 async function withProvenance(root,binding,callback){
  const lock=path.join(root,'.git','zero-pending-sync.lock');binding.assertCurrentNow();await fs.mkdir(lock);const info=await fs.lstat(lock);let active=true;
  const check=()=>{if(!active)throw Error('Sync transaction expired.');binding.assertCurrentNow();const now=fsSync.lstatSync(lock);if(now.dev!==info.dev||now.ino!==info.ino)throw Error('Sync lock changed.');};
  const owns=(file,stat)=>file===lock&&stat.dev===info.dev&&stat.ino===info.ino;
  try{return await transaction(root,tx=>{const composite={root,gitDir:binding.gitDir,commonDir:binding.commonDir,assertCurrentNow(){tx.assertCurrentNow();},ownsLock(file,stat){tx.assertCurrentNow();return binding.ownsLock(file,stat)||owns(file,stat);}};return callback(tx,composite);},check,owns);}finally{active=false;await fs.rmdir(lock);}
 }
 const withTransaction=(root,callback)=>transaction(root,callback);
 return {withTransaction,withProvenance,list:root=>withTransaction(root,tx=>tx.list()),add:(root,r)=>withTransaction(root,tx=>tx.add(r)),resolve:(root,id,reason)=>withTransaction(root,tx=>tx.resolve(id,reason))};
}
module.exports={repositoryLedgerFactory};
