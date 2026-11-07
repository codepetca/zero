'use strict';
// Unexposed process-local scope. Tokens expire when the provenance lock is released.
const {withOwnedAddedRemovalMutation}=require('./commit-provenance');
const owners=new WeakMap();
async function withAddedRemovalLockOwner(root,operation){
 if(typeof operation!=='function')throw new Error('An added-file operation is required.');
 return withOwnedAddedRemovalMutation(root,async binding=>{const token=Object.freeze({}),state={binding,retention:null,outstanding:null,unresolved:null};owners.set(token,state);let result,primary;try{result=await operation(token);}catch(error){primary=error;}finally{owners.delete(token);}
  if(state.outstanding){try{await state.outstanding.close();}catch{}const error=primary||new Error('The added-file index lock was not released. Preserve and inspect it.');error.lockRecoveryPath=state.outstanding.path;error.retentionPath=state.retention;error.message+=' The index lock needs inspection.';throw error;}
  if(state.unresolved){const error=primary||state.unresolved;for(const key of ['lockRecoveryPath','retainedLockPath','retentionPath','journalPath','outcomeUnknown','reportedState'])if(state.unresolved[key]!==undefined)error[key]=state.unresolved[key];error.message+=' The index lock outcome needs inspection.';throw error;}
  if(primary)throw primary;return result;});
}
async function createAddedRemovalRetention(token){const state=owners.get(token);if(!state||state.retention)throw new Error('The added-file operation no longer owns the project lock.');const folder=await state.binding.createRetention();state.retention=folder;return folder;}
function assertAddedRemovalLockOwner(token,gitDir,retentionDir){const state=owners.get(token);if(!state||state.unresolved||state.binding.gitDir!==gitDir||!state.retention||state.retention!==retentionDir)throw new Error('The added-file operation no longer owns the project lock.');state.binding.assertCurrentNow();}
function trackAddedRemovalLock(token,lockPath,close){const state=owners.get(token);if(!state||state.unresolved||state.outstanding)throw new Error('The added-file operation cannot own another index lock.');state.binding.assertCurrentNow();const entry={path:lockPath,close};state.outstanding=entry;return ()=>{if(state.outstanding===entry)state.outstanding=null;};}
function markAddedRemovalLockUnresolved(token,error){const state=owners.get(token);if(state&&!state.unresolved)state.unresolved=error;}
async function invalidateAddedRemovalReceipt(token){const state=owners.get(token);if(!state||state.unresolved)throw new Error('The added-file operation no longer owns the project lock.');await state.binding.invalidateReceipt();}
module.exports={withAddedRemovalLockOwner,createAddedRemovalRetention,assertAddedRemovalLockOwner,trackAddedRemovalLock,markAddedRemovalLockUnresolved,invalidateAddedRemovalReceipt};
