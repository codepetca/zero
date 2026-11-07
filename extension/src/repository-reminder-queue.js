'use strict';
// One extension host can request status from several views while an action owns
// the repository ledger. Serialize its top-level calls so they do not contend
// with that host's own persistent lock. Other hosts still fail closed on locks.
// Inside a scoped callback, use the supplied tx rather than this queued facade.
function serializeRepositoryReminders(adapter) {
 const tails=new Map(),result={...adapter};
 for(const method of ['list','add','resolve','withTransaction','withProvenance'])if(typeof adapter[method]==='function')result[method]=(root,...args)=>{
  const previous=tails.get(root)||Promise.resolve(),operation=previous.then(()=>adapter[method](root,...args));
  // A failed operation releases this host's queue; it does not turn the failure
  // into success or change backend, and persistent abandoned locks remain held.
  const settled=operation.then(()=>{},()=>{});tails.set(root,settled);
  void settled.then(()=>{if(tails.get(root)===settled)tails.delete(root);});
  return operation;
 };
 if(typeof adapter.supportsFileLedger==='function')result.supportsFileLedger=(...args)=>adapter.supportsFileLedger(...args);
 return Object.freeze(result);
}
module.exports={serializeRepositoryReminders};
