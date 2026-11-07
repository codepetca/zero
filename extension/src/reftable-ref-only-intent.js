'use strict';
// Unexposed durable boundary. Pending and acknowledged records are immutable;
// neither record grants upload authority or clears an uncertain outcome.
const liveSync=new WeakMap();
async function executeRefOnlyIntent({root,binding,ledger,reviewed,detail},commit){
 if(!ledger||typeof ledger.withProvenance!=='function'||!Array.isArray(reviewed)||typeof commit!=='function'||!detail||detail.root!==root)throw new Error('Durable ref-only intent is unavailable. No update was started.');
 return ledger.withProvenance(root,binding,async(tx,composite)=>{
  const current=await tx.list();if(JSON.stringify(current)!==JSON.stringify(reviewed))throw new Error('Sync reminders changed. Review the update again.');if(current.some(row=>row.operation==='reftable-ref-only'))throw new Error('An earlier ref-only update needs inspection before continuing.');
  composite.assertCurrentNow();const pending=await tx.add({...detail,type:'push',operation:'reftable-ref-only',kind:'ref-pending',committed:false,pushStarted:false});composite.assertCurrentNow();
  const permit=Object.freeze({}),result=await commit(permit);composite.assertCurrentNow();require('./reftable-ref-only').consumeAcknowledgement(result,detail,permit);composite.assertCurrentNow();
  const acknowledged=await tx.add({...detail,type:'push',operation:'reftable-ref-only',kind:'ref-acknowledged',committed:false,pushStarted:false,intentId:pending.id});composite.assertCurrentNow();const outcome=Object.freeze({result,pending,acknowledged});liveSync.set(outcome,{detail:Object.freeze({...detail}),pending,acknowledged});return outcome;
 });
}
function assertLiveRefOnlySync(outcome,{root,branch,head,remote,accountId,sessionId,records}={}){const state=liveSync.get(outcome);if(!state||!Array.isArray(records)||['root','branch','head','remote','accountId','sessionId'].some(key=>state.detail[key]!==({root,branch,head,remote,accountId,sessionId})[key])||[state.pending,state.acknowledged].some(expected=>!records.some(row=>JSON.stringify(row)===JSON.stringify(expected))))throw new Error('The ref-only update needs inspection before syncing.');return true;}
function expireLiveRefOnlySync(outcome){liveSync.delete(outcome);}
module.exports={executeRefOnlyIntent,assertLiveRefOnlySync,expireLiveRefOnlySync};
