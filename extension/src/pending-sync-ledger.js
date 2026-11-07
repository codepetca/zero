'use strict';
// Every attempt and resolution has its own key. No shared index or deletion is
// used. Memento visibility and durability across extension hosts are not proven.
const crypto=require('node:crypto');
const {validUndoIntent}=require('./sync-correction-intent');
const PREFIX='zero.pendingSync.v1:',RESOLVED='zero.resolvedSync.v1:';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
function matchesConfirmed(record,{root,branch,remote,head,accountId,operation='branch'}) {
 return (record.type===undefined||record.type==='push') && Boolean(remote) && Boolean(accountId) && record.root===root && record.branch===branch && record.remote===remote && record.head===head && record.accountId===accountId && (operation==='branch'?(record.operation===undefined||record.operation==='branch'):operation==='merge'&&record.operation==='merge');
}
function createPendingSyncLedger(state,{onFallback=()=>{}}={}) {
 const memory=new Map(),enumerable=typeof state?.keys==='function'&&typeof state?.update==='function';
 if(!enumerable)onFallback();
 const get=key=>enumerable?state.get(key):memory.get(key);
 const keys=()=>enumerable?state.keys():[...memory.keys()];
 async function write(key,value) {
  if(enumerable){try{await state.update(key,value);if(JSON.stringify(state.get(key))!==JSON.stringify(value))throw Error();}catch{throw new Error('The sync reminder could not be saved. Your local commits are kept; review project history and GitHub before continuing.');}}
  else memory.set(key,value);
 }
 const valid=(r,root,branch)=>r&&typeof r==='object'&&validUndoIntent(r,root)&&r.root===root&&r.branch===branch&&typeof r.remote==='string'&&typeof r.head==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(r.head);
 const legacyId=r=>'legacy-'+hash(JSON.stringify(r));
 async function add(record) {
  if(!valid(record,record?.root,record?.branch))throw new Error('The sync reminder is invalid.');
  const id=crypto.randomUUID(),entry={...record,id};await write(PREFIX+id,entry);return entry;
 }
 function list(root,branch,legacy) {
  const all=keys();if(!Array.isArray(all))throw new Error('Sync reminder storage is unavailable. Review it before committing.');
  const resolved=new Map(),entries=[];
  for(const key of all)if(key.startsWith(RESOLVED)){
   const entry=get(key);
   if(!entry||typeof entry.id!=='string'||!['reviewed','confirmed','superseded'].includes(entry.reason)||entry.record?.id!==entry.id)throw new Error('A sync review record is unreadable. Review it before committing.');
   const previous=resolved.get(entry.id),pending=get(PREFIX+entry.id);
   if(previous&&canonical(previous)!==canonical(entry.record)||pending&&canonical(pending)!==canonical(entry.record))throw new Error('A sync review record does not match its reminder. Review it before committing.');
   resolved.set(entry.id,entry.record);
  }
  for(const key of all)if(key.startsWith(PREFIX)){
   const entry=get(key),id=key.slice(PREFIX.length);
   if(!entry||entry.id!==id||typeof entry.root!=='string'||typeof entry.branch!=='string'||!valid(entry,entry.root,entry.branch))throw new Error('A sync reminder is unreadable. Review it before committing.');
   if(valid(entry,root,branch)&&!resolved.has(id))entries.push(entry);
  }
  if(legacy!==undefined&&legacy!==null){
   if(!valid(legacy,root,branch))throw new Error('An earlier sync reminder is unreadable. Review it before committing.');
   const id=legacyId(legacy),record={...legacy,id};if(resolved.has(id)&&canonical(resolved.get(id))!==canonical(record))throw new Error('A sync review record does not match its reminder. Review it before committing.');if(!resolved.has(id))entries.push(record);
  }
  return entries;
 }
 function listAll(root,knownLegacy=[]) {
  if(!enumerable)throw new Error('Sync reminders cannot be fully enumerated in this window. Inspect Source Control before syncing.');
  const all=keys();if(!Array.isArray(all))throw new Error('Sync reminder storage is unavailable. Review it before committing.');
  list(root,''); // Validate every marker even when no branch has reminders.
  const branches=new Set();
  for(const key of all) {
   if(key.startsWith(PREFIX)) {
    const entry=get(key),id=key.slice(PREFIX.length);
    if(!entry||entry.id!==id||typeof entry.root!=='string'||typeof entry.branch!=='string'||!valid(entry,entry.root,entry.branch))throw new Error('A sync reminder is unreadable. Review it before committing.');
    if(entry.root===root)branches.add(entry.branch);
   }
   for(const prefix of ['zero.gitUploadRecovery:','zero.localCommitPending:'])if(key.startsWith(prefix+root+':'))branches.add(key.slice((prefix+root+':').length));
  }
  for(const item of knownLegacy)if(item?.root===root&&typeof item.branch==='string')branches.add(item.branch);
  const result=new Map();
  const append=entry=>{const previous=result.get(entry.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(entry))throw new Error('Conflicting sync reminders require inspection.');result.set(entry.id,entry);};
  for(const branch of branches) {
   for(const entry of list(root,branch))append(entry);
   const push=get(`zero.gitUploadRecovery:${root}:${branch}`),local=get(`zero.localCommitPending:${root}:${branch}`);
   const legacy=[push,local&&{...local,remote:'',type:'local'},...knownLegacy.filter(item=>item?.branch===branch)];
   for(const item of legacy)if(item!==undefined&&item!==null)for(const entry of list(root,branch,item))append(entry);
  }
  return [...result.values()].sort((a,b)=>a.id.localeCompare(b.id));
 }
 async function resolve(record,reason) {
  if(!record?.id||!['reviewed','confirmed','superseded'].includes(reason))throw new Error('The sync reminder is invalid.');
  const id=crypto.randomUUID();await write(RESOLVED+id,{id:record.id,reason,record,at:Date.now()});
 }
 return {add,list,listAll,resolve,enumerable};
}
module.exports={createPendingSyncLedger,matchesConfirmed};
