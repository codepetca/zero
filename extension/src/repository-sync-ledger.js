'use strict';
// Updated hosts share the repository file lock. Memento is an additive
// compatibility mirror, never a fallback after file storage fails.
// Older hosts do not take this lock, and another workspace's stale Memento cache
// cannot be enumerated here. This adapter cannot establish a mixed-version
// cutover barrier. Stronger destructive operations still need such a barrier.
// A caller holding provenance must acquire it BEFORE this ledger transaction.
const path=require('node:path'),fsSync=require('node:fs');
const {createFileLedger}=require('./pending-sync-file-ledger');
const PENDING='zero.pendingSync.v1:',RESOLVED='zero.resolvedSync.v1:';
const MAX_KEYS=20000,MAX_ENTRIES=5000,MAX_SNAPSHOT_BYTES=4*1024*1024;
const copy=value=>structuredClone(value);
const optionalFields=new Set(['type','page','accountId','operation','kind','committed','pushStarted','recoveryPath','sourceHead','reviewedRemoteHead','reviewedMainHead','sessionId','intentId']);
function canonical(value) {
 if(value===undefined)return {undefinedSyncField:true};
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'){const result=Object.create(null);for(const key of Object.keys(value).sort())if(value[key]!==undefined||!optionalFields.has(key))result[key]=canonical(value[key]);return result;}
 return value;
}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function createRepositorySyncLedger({state,fileLedger=createFileLedger()}={}) {
 if(typeof state?.keys!=='function'||typeof state?.get!=='function'||typeof state?.update!=='function')throw Error('Enumerable persistent Memento storage is required.');
 function sources(root) {
  const keys=state.keys();if(!Array.isArray(keys)||keys.length>MAX_KEYS||keys.some(key=>typeof key!=='string')||new Set(keys).size!==keys.length)throw Error('Sync reminder storage cannot be inspected safely.');
  const entries=[];let bytes=0;
  for(const key of keys) {
   const modern=key.startsWith(PENDING)||key.startsWith(RESOLVED),legacy=key.startsWith(`zero.gitUploadRecovery:${root}:`)||key.startsWith(`zero.localCommitPending:${root}:`);
   if(!modern&&!legacy)continue;
   const value=copy(state.get(key));
   if(modern){const owner=key.startsWith(PENDING)?value?.root:value?.record?.root;if(typeof owner!=='string')throw Error('A sync reminder has no readable repository identity.');if(owner!==root)continue;}
   bytes+=Buffer.byteLength(JSON.stringify({key,value})||'');if(bytes>MAX_SNAPSHOT_BYTES||entries.length>=MAX_ENTRIES)throw Error('Too many sync reminders to import safely.');
   entries.push({key,value});
  }
  return entries;
 }
 const signature=entries=>JSON.stringify(entries.map(entry=>{
  // Legacy IDs include source property order; a reordered old value is a new
  // attempt even if its canonical field values happen to match.
  let order;
  if(!entry.key.startsWith(PENDING)&&!entry.key.startsWith(RESOLVED))order=JSON.stringify(entry.value);
  else {const record=entry.key.startsWith(PENDING)?entry.value:entry.value?.record;if(record?.id?.startsWith('legacy-')){const {id,...fields}=record;order=JSON.stringify(fields);}}
  return [entry.key,canonical(entry.value),order];
 }).sort((a,b)=>a[0].localeCompare(b[0])));
 async function transaction(root,callback,assertOuterNow=()=>{}) {
  if(typeof callback!=='function')throw Error('A sync transaction callback is required.');
  let publicationView,scopeActive=true;
  const beforePublishNow=()=>{assertOuterNow();if(!scopeActive)throw Error('The repository sync transaction has expired.');if(signature(sources(root))!==publicationView)throw Error('The visible sync reminders changed before publication. Refresh them before continuing.');};
  try{return await fileLedger.withTransaction(root,async file=>{
   let active=true,pending,expected;
   const assertActive=()=>{if(!active)throw Error('The repository sync transaction has expired.');assertOuterNow();};
   const assertCurrentNow=()=>{assertActive();if(pending)throw Error('A repository sync operation is still running.');file.assertCurrentNow();if(signature(sources(root))!==expected)throw Error('The visible sync reminders changed. Refresh them before continuing.');};
   async function mirror(snapshot) {
    const entries=snapshot.records.map(record=>({key:PENDING+record.id,value:record}));
    for(const row of snapshot.resolutions)entries.push({key:RESOLVED+row.id,value:{id:row.recordId,reason:row.reason,record:row.record,at:row.at}});
    for(const {key,value} of entries) {
     assertActive();const prior=state.get(key);
     if(prior!==undefined&&!equal(prior,value))throw Error('A mirrored sync identifier conflicts. Preserve both stores for inspection.');
     if(prior!==undefined)continue;
     try{await state.update(key,copy(value));if(!equal(state.get(key),value))throw Error('The saved mirror could not be read back.');}
     catch(cause){const error=Error('The shared sync record is retained, but its workspace reminder mirror could not be saved. Retry the reminder review before continuing.',{cause});error.code='ZERO_SYNC_MIRROR_FAILED';error.mirrorKey=key;error.recordId=value.id;if(key.startsWith(RESOLVED))error.resolutionId=key.slice(RESOLVED.length);throw error;}
    }
    return entries;
   }
   async function refresh() {
    // A visible older writer can change Memento while an import/mirror awaits.
    // Re-import boundedly; never silently accept that change as a fresh view.
    for(let attempt=0;attempt<3;attempt++) {
     assertActive();const before=sources(root);publicationView=signature(before);await file.importMemento(before);const snapshot=await file.snapshot(),mirrored=await mirror(snapshot);
     const intended=new Map(before.map(row=>[row.key,row]));for(const row of mirrored)intended.set(row.key,row);
     assertActive();const after=sources(root);
     if(signature(after)===signature([...intended.values()])){expected=signature(after);publicationView=expected;return snapshot;}
    }
    throw Error('The visible sync reminders keep changing. Wait for the other operation and review them again.');
   }
   const tx={root,assertCurrentNow,ownsLock(filePath,info){assertCurrentNow();return file.ownsLock(filePath,info);}};
   const run=operation=>(...args)=>{
    assertActive();if(pending)throw Error('Concurrent repository sync operations are not supported.');
    const task=(async()=>{await refresh();const result=operation?await operation(...args):undefined;const latest=await refresh();return operation?result:latest.active;})();pending=task;
    return task.finally(()=>{if(pending===task)pending=undefined;});
   };
   tx.list=run(null);
   tx.begin=run((record,options)=>file.begin(record,options));
   tx.add=run(record=>file.add(record));
   tx.resolve=run((id,reason)=>file.resolve(id,reason));
   await refresh();let result,error;
   try{result=await callback(Object.freeze(tx));}catch(cause){error=cause;}
   finally{active=false;scopeActive=false;if(pending){try{await pending;}catch(cause){error=error||cause;}error=error||Error('Await every repository sync operation before returning.');}}
   if(error)throw error;return result;
  },{beforePublishNow});}catch(error){scopeActive=false;if(!error.recoveryPath)error.recoveryPath=path.join(root,'.git','zero-pending-sync');throw error;}
 }
 const withTransaction=(root,callback)=>transaction(root,callback);
 // The caller first acquires its action's live provenance binding. Commit undo
 // must supply the authority-owned binding: withLocalMutation consumes its undo
 // receipt and cannot be acquired merely to enter this helper. Validate the
 // capability before starting the ledger transaction, enforcing this entry
 // point's provenance -> ledger order. The resulting composite is scoped to both
 // live owners; it grants no exemption to unrelated or replacement locks.
 async function withProvenance(root,binding,callback) {
  if(typeof root!=='string'||!path.isAbsolute(root)||typeof callback!=='function'||binding?.root!==root||binding.gitDir!==path.join(root,'.git')||binding.commonDir!==path.join(root,'.git')||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')throw Error('A live standalone provenance mutation binding is required before the sync transaction.');
  const lock=path.join(root,'.git','zero-commit-provenance.lock');let provenanceIdentity;
  const synchronous=value=>{if(value&&typeof value.then==='function'){void Promise.resolve(value).catch(()=>{});throw Error('A synchronous provenance binding is required.');}return value;};
  const ownsProvenanceLock=(file,info)=>synchronous(binding.ownsLock(file,info))===true;
  const assertProvenanceNow=()=>{
   synchronous(binding.assertCurrentNow());
   const info=fsSync.lstatSync(lock);
   if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||!ownsProvenanceLock(lock,info))throw Error('The provenance mutation lock is not owned by this binding.');
   if(provenanceIdentity&&['dev','ino','mode','nlink','size','mtimeMs','ctimeMs','birthtimeMs'].some(key=>provenanceIdentity[key]!==info[key]))throw Error('The provenance mutation lock changed during the sync transaction.');
   provenanceIdentity=provenanceIdentity||info;
  };
  assertProvenanceNow();
  return transaction(root,tx=>{
   const composite=Object.freeze({root,gitDir:binding.gitDir,commonDir:binding.commonDir,
    assertCurrentNow(){tx.assertCurrentNow();},
    ownsLock(file,info){tx.assertCurrentNow();return ownsProvenanceLock(file,info)||tx.ownsLock(file,info);}});
   return callback(tx,composite);
  },assertProvenanceNow);
 }
 const api={withTransaction,withProvenance};
 for(const name of ['list','begin','add','resolve'])api[name]=(root,...args)=>withTransaction(root,tx=>tx[name](...args));
 return api;
}
module.exports={createRepositorySyncLedger};
