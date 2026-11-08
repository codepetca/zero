'use strict';
// Immutable repository reminder records. A persistent repository lock
// serializes cooperating Zero windows; an existing lock is never broken here.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const fsSync=require('node:fs'),{constants}=fsSync;
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile),os=require('node:os');
const {parseRepositoryUrl,validBranchName}=require('./core');
const {validUndoIntent}=require('./sync-correction-intent');
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuidPattern=new RegExp(`^${UUID}$`);
const idPattern=new RegExp(`^(?:${UUID}|legacy-[a-f0-9]{64})$`);
const entryPattern=new RegExp(`^(record|resolution)-(${UUID}|legacy-[a-f0-9]{64})\\.json$`);
const MAX_ENTRIES=5000,MAX_BYTES=16384,MAX_IMPORT_BYTES=4*1024*1024;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
function normalize(record,root) {
 const fields=new Set(['id','root','branch','head','type','remote','page','accountId','operation','kind','committed','pushStarted','recoveryPath','sourceHead','reviewedRemoteHead','reviewedMainHead','sessionId','intentId']);
 if(!record||Object.getPrototypeOf(record)!==Object.prototype||Object.keys(record).some(key=>!fields.has(key))||record.root!==root||!text(record.branch,1024)||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.head||'')||(record.id!==undefined&&!idPattern.test(record.id)))throw Error('Invalid pending sync record.');
 // Production Memento push records predate an explicit type. Preserve that
 // absence rather than silently changing the imported record's fields.
 const type=record.type===undefined&&record.remote?'push':record.type;
 if(!['push','local'].includes(type))throw Error('Invalid pending sync record.');
 if(type==='push') {
  let destination;try {destination=parseRepositoryUrl(record.remote);}catch {throw Error('Invalid pending sync destination.');}
  if(destination.remote!==record.remote||(record.page!==undefined&&record.page!==destination.page))throw Error('Invalid pending sync destination.');
 } else if(record.remote!==''||record.page!==undefined)throw Error('Invalid local sync record.');
 if(record.accountId!==undefined&&!text(record.accountId,256))throw Error('Invalid sync account.');
 if(record.operation!==undefined&&!['branch','merge','restore','undo','reftable-update','reftable-ref-only'].includes(record.operation))throw Error('Invalid sync operation.');
 if(!validUndoIntent(record,root))throw Error('Invalid undo correction sync record.');
 if(record.operation==='restore'&&type!=='local')throw Error('Invalid restore sync record.');
 if(record.recoveryPath!==undefined&&(!text(record.recoveryPath,4096)||!path.isAbsolute(record.recoveryPath)||!['restore','undo','reftable-update'].includes(record.operation)))throw Error('Invalid sync recovery path.');
 if(record.operation==='reftable-update'){
  const folder=record.recoveryPath,prefix='zero-reftable-update-recovery-';
  if(type!=='push'||!text(record.accountId,256)||!text(record.sessionId,256)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(record.sourceHead||'')||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(record.reviewedRemoteHead||'')||record.sourceHead.length!==record.head.length||record.reviewedRemoteHead.length!==record.head.length||record.reviewedMainHead!==undefined||record.intentId!==undefined||typeof folder!=='string'||path.dirname(folder)!==path.join(root,'.git')||!new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(path.basename(folder))||record.kind!=='ready'||record.pushStarted!==false||record.committed!==false)throw Error('Invalid reftable update intent.');
 }else if(record.operation==='reftable-ref-only'){
  if(type!=='push'||!validBranchName(record.branch)||record.page!==parseRepositoryUrl(record.remote).page||!text(record.accountId,256)||!text(record.sessionId,256)||![record.sourceHead,record.reviewedRemoteHead,record.reviewedMainHead].every(v=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${record.head.length}}$`).test(v))||record.sourceHead===record.head||(record.branch==='main'&&record.reviewedMainHead!==record.sourceHead)||record.reviewedRemoteHead!==record.head||record.committed!==false||record.pushStarted!==false||!['ref-pending','ref-acknowledged'].includes(record.kind)||record.recoveryPath!==undefined||(record.kind==='ref-pending'?record.intentId!==undefined:!idPattern.test(record.intentId||'')))throw Error('Invalid ref-only sync intent.');
 }else if(record.sourceHead!==undefined||record.reviewedRemoteHead!==undefined||record.reviewedMainHead!==undefined||record.sessionId!==undefined||record.intentId!==undefined)throw Error('Invalid sync intent fields.');
 if(record.kind!==undefined&&!text(record.kind,128))throw Error('Invalid sync status.');
 if(record.committed!==undefined&&typeof record.committed!=='boolean'||record.pushStarted!==undefined&&typeof record.pushStarted!=='boolean')throw Error('Invalid sync status.');
 const result={};for(const key of Object.keys(record))if(key!=='id'&&record[key]!==undefined)result[key]=record[key];
 if(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES)throw Error('Sync record is too large.');
 return result;
}
async function directory(name) {
 const info=await fs.lstat(name);
 if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(name)!==name)throw Error('The sync record folder is unsafe or changed.');
 return info;
}
async function readFile(file) {
 const before=await fs.lstat(file);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>MAX_BYTES)throw Error('A sync record is unsafe or incomplete.');
 const h=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try {const stat=await h.stat();if(!same(before,stat)||!stat.isFile()||stat.nlink!==1||stat.size>MAX_BYTES)throw Object.assign(Error('A sync record changed.'),{code:'ZERO_FILE_SNAPSHOT_CHANGED'});
  const bytes=Buffer.alloc(stat.size+1);let length=0;while(length<bytes.length){const result=await h.read(bytes,length,bytes.length-length,length);if(!result.bytesRead)break;length+=result.bytesRead;}
  const after=await h.stat(),named=await fs.lstat(file);if(!same(stat,after)||!same(stat,named)||stat.size!==after.size||stat.mtimeMs!==after.mtimeMs||length!==stat.size)throw Object.assign(Error('A sync record changed.'),{code:'ZERO_FILE_SNAPSHOT_CHANGED'});
  return bytes.subarray(0,length);
 }finally{await h.close();}
}
async function rootContextOnce(root,pinned) {
 if(typeof root!=='string'||!path.isAbsolute(root)||await fs.realpath(root)!==root)throw Error('Open the original ordinary project folder.');
 const project=await directory(root),git=path.join(root,'.git'),gitStat=await directory(git);
 if(pinned.project&&(!same(pinned.project,project)||!same(pinned.gitStat,gitStat)))throw Error('The project or Git folder changed.');
 pinned.project=project;pinned.gitStat=gitStat;
 const readConfig=async()=>{try{return await readFile(path.join(git,'config'));}catch(error){if(error.code==='ZERO_FILE_SNAPSHOT_CHANGED')throw Object.assign(Error('The Git configuration changed.'),{code:'ZERO_CONFIG_SNAPSHOT_CHANGED',kind:'changed'});throw error;}};
 const configBytes=await readConfig();
 const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'};
 const query=async args=>(await exec('git',['-c','core.fsmonitor=false','rev-parse',...args],{cwd:root,env,timeout:10000,maxBuffer:8192,encoding:'utf8'})).stdout;
 let top,gitDir,common,config;
 try {top=await query(['--show-toplevel']);gitDir=await query(['--absolute-git-dir']);common=await query(['--path-format=absolute','--git-common-dir']);config=(await exec('git',['config','--local','--no-includes','--name-only','--null','--list'],{cwd:root,env,timeout:10000,maxBuffer:8192,encoding:'utf8'})).stdout.split('\0').filter(Boolean);}catch{throw Error('Open a standalone Git project with ordinary metadata.');}
 if(config.some(key=>/^(?:core\.worktree|include\.|includeif\.)/i.test(key))||top!==root+'\n'||gitDir!==git+'\n'||common!==git+'\n'||!same(project,await directory(root))||!same(gitStat,await directory(git)))throw Error('Open a standalone Git project with ordinary metadata.');
 if(!(await readConfig()).equals(configBytes))throw Object.assign(Error('The Git configuration changed.'),{code:'ZERO_CONFIG_SNAPSHOT_CHANGED',kind:'changed'});
 if(!same(project,await directory(root))||!same(gitStat,await directory(git)))throw Error('The project or Git folder changed.');
 return {root,git,project,gitStat,configBytes};
}
async function rootContext(root,pinned={}) {
 // VS Code may add branch metadata immediately after checkout. Retry only the
 // read-only snapshot, from the beginning; never retry a locked transaction.
 for(let attempt=0;attempt<3;attempt++) {
  try{return await rootContextOnce(root,pinned);}catch(error){if(error.code!=='ZERO_CONFIG_SNAPSHOT_CHANGED'||attempt===2)throw error;}
 }
}
async function unchanged(ctx,ledgerStat,checkConfig=true) {
 if(!same(ctx.project,await directory(ctx.root))||!same(ctx.gitStat,await directory(ctx.git))||(checkConfig&&!(await readFile(path.join(ctx.git,'config'))).equals(ctx.configBytes))||(ledgerStat&&!same(ledgerStat,await directory(path.join(ctx.git,'zero-pending-sync')))))throw Error('The sync record folder changed.');
}
function retainLockPath(error,lock) {
 const paths=[...(Array.isArray(error.lockRecoveryPaths)?error.lockRecoveryPaths:[]),error.lockRecoveryPath,error.additionalLockRecoveryPath,lock].filter(value=>typeof value==='string');
 if(!error.lockRecoveryPath)error.lockRecoveryPath=lock;
 else if(error.lockRecoveryPath!==lock&&!error.additionalLockRecoveryPath)error.additionalLockRecoveryPath=lock;
 else if(error.lockRecoveryPath!==lock&&error.additionalLockRecoveryPath!==lock)error.message+=` Additional sync lock requiring inspection: ${lock}.`;
 error.lockRecoveryPaths=[...new Set(paths)];
}
async function withLock(root,fn) {
 let ctx=await rootContext(root);const lock=path.join(ctx.git,'zero-pending-sync.lock');
 try{await fs.mkdir(lock,{mode:0o700});}catch(error){if(error.code==='EEXIST'){const failure=Error('Sync record storage is locked. An interrupted operation may need manual inspection.');retainLockPath(failure,lock);failure.recoveryPath=lock;throw failure;}throw error;}
 let owned,ownerBytes,failure;
 try {
  owned=await directory(lock);await unchanged(ctx,undefined,false);
  ownerBytes=Buffer.from(JSON.stringify({version:1,pid:process.pid,createdAt:new Date().toISOString(),nonce:crypto.randomUUID()})+'\n');
  const owner=await fs.open(path.join(lock,'owner.json'),'wx',0o600);try{await owner.writeFile(ownerBytes);await owner.sync();}finally{await owner.close();}
  await syncDirectory(lock);await syncDirectory(ctx.git);
  // Revalidate with an owned lock if VS Code updated metadata between the
  // first snapshot and mkdir. Pin both repository identities across retries.
  let changed;
  try{changed=!(await readFile(path.join(ctx.git,'config'))).equals(ctx.configBytes);}
  catch(error){if(error.code!=='ZERO_FILE_SNAPSHOT_CHANGED')throw error;changed=true;}
  if(changed)ctx=await rootContext(root,{project:ctx.project,gitStat:ctx.gitStat});
  await unchanged(ctx);
  if(!same(owned,await directory(lock)))throw Error('The sync record lock changed.');
  const ledger=path.join(ctx.git,'zero-pending-sync');
  try{await fs.mkdir(ledger,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const ledgerStat=await directory(ledger);await unchanged(ctx,ledgerStat);await syncDirectory(ctx.git);
  const assertCurrentNow=()=>{
   const dir=(name,expected)=>{const stat=fsSync.lstatSync(name);if(!stat.isDirectory()||stat.isSymbolicLink()||!same(expected,stat)||fsSync.realpathSync(name)!==name)throw Error('The sync record folder changed.');};
   const bytes=(name)=>{const stat=fsSync.lstatSync(name);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>MAX_BYTES)throw Error('The sync record lock or configuration changed.');const fd=fsSync.openSync(name,constants.O_RDONLY|(constants.O_NOFOLLOW||0));try{const before=fsSync.fstatSync(fd),data=fsSync.readFileSync(fd),after=fsSync.fstatSync(fd);if(!same(stat,before)||!same(before,after)||!same(after,fsSync.lstatSync(name))||before.size!==after.size||before.mtimeMs!==after.mtimeMs||data.length!==before.size)throw Error('The sync record lock or configuration changed.');return data;}finally{fsSync.closeSync(fd);}};
   dir(ctx.root,ctx.project);dir(ctx.git,ctx.gitStat);dir(ledger,ledgerStat);dir(lock,owned);
   if(!bytes(path.join(lock,'owner.json')).equals(ownerBytes)||!bytes(path.join(ctx.git,'config')).equals(ctx.configBytes))throw Error('The sync record lock or configuration changed.');
  };
  return await fn({...ctx,ledger,ledgerStat,assertCurrentNow,ownsLock(file,info){assertCurrentNow();return file===lock&&Boolean(info?.isDirectory?.())&&!info.isSymbolicLink()&&same(owned,info);}});
 } catch(error){failure=error instanceof Error?error:Error(String(error),{cause:error});throw failure;} finally {
  // Never remove a lock that changed ownership or moved during the operation.
  if(!owned||!ownerBytes){if(failure){retainLockPath(failure,lock);failure.message+=' Sync record lock setup did not complete; preserve it for inspection.';}}
  try{if(owned&&ownerBytes){await unchanged(ctx,undefined,false);if(!same(owned,await directory(lock))||!(await readFile(path.join(lock,'owner.json'))).equals(ownerBytes))throw Error('Sync record lock changed; preserve it for inspection.');await fs.unlink(path.join(lock,'owner.json'));await fs.rmdir(lock);await syncDirectory(ctx.git);}}
  catch(cleanupError){
   if(failure){if(!failure.cleanupError)failure.cleanupError=cleanupError;failure.lockCleanupFailures=[...(Array.isArray(failure.lockCleanupFailures)?failure.lockCleanupFailures:[]),{path:lock,error:cleanupError}];retainLockPath(failure,lock);failure.message+=' Sync record lock cleanup also failed; preserve the lock for inspection.';throw failure;}
   retainLockPath(cleanupError,lock);if(!cleanupError.recoveryPath)cleanupError.recoveryPath=lock;throw cleanupError;
  }
 }
}
function canonicalLegacy(value) {
 let count=0;
 const visit=(item,depth)=>{
  if(++count>500||depth>8)throw Error('Invalid legacy sync record.');
  if(item===null||typeof item==='boolean'||typeof item==='string')return item;
  if(typeof item==='number'&&Number.isFinite(item))return item;
  if(Array.isArray(item))return item.map(entry=>visit(entry,depth+1));
  if(typeof item==='object'&&Object.getPrototypeOf(item)===Object.prototype){const result={};for(const key of Object.keys(item).sort()){if(key==='__proto__'||key==='constructor'||key==='prototype')throw Error('Invalid legacy sync record.');result[key]=visit(item[key],depth+1);}return result;}
  throw Error('Invalid legacy sync record.');
 };
 const serialized=JSON.stringify(visit(value,0));if(Buffer.byteLength(serialized)>MAX_BYTES)throw Error('Invalid legacy sync record.');return serialized;
}
async function readState(ctx,legacy=[]) {
 if(!Array.isArray(legacy)||legacy.length>MAX_ENTRIES)throw Error('Invalid legacy sync records.');
 const entries=await fs.readdir(ctx.ledger,{withFileTypes:true});if(entries.length>MAX_ENTRIES)throw Error('Too many sync records to inspect safely.');
 const records=new Map(),resolutions=new Map(),resolved=new Set();
 for(const entry of entries) {
  const match=entryPattern.exec(entry.name);if(!match||!entry.isFile())throw Error('Sync record storage contains an incomplete or unsafe entry; inspect it before continuing.');
  let value;try{value=JSON.parse((await readFile(path.join(ctx.ledger,entry.name))).toString('utf8'));}catch{throw Error('A sync record is incomplete or corrupt; inspect it before continuing.');}
  if(!value||value.version!==1||value.id!==match[2]||value.kind!==match[1]||(value.sourceKey!==undefined&&!text(value.sourceKey,8192)))throw Error('A sync record is invalid; inspect it before continuing.');
  if(value.kind==='record')records.set(value.id,{id:value.id,...normalize(value.record,ctx.root)});
  else {
   if(!uuidPattern.test(value.id)||!idPattern.test(value.recordId||'')||!['reviewed','confirmed','superseded'].includes(value.reason)||(value.at!==undefined&&(!Number.isSafeInteger(value.at)||value.at<0)))throw Error('A sync resolution is invalid; inspect it before continuing.');
   if(!value.record||value.record.id!==value.recordId)throw Error('A sync resolution has no bound record; inspect it before continuing.');
   normalize(value.record,ctx.root);
   resolutions.set(value.id,value);resolved.add(value.recordId);
  }
 }
 const persisted=new Set(records.keys());
 // Preserve the original experimental overlay's IDs. Memento imports below
 // deliberately use the production Memento ID algorithm instead.
 for(const value of legacy){const record=normalize(value,ctx.root),id='legacy-'+sha(canonicalLegacy(value));
  if(records.has(id)&&canonicalLegacy(normalize(records.get(id),ctx.root))!==canonicalLegacy(record))throw Error('Conflicting sync records need inspection.');
  records.set(id,{id,...record});
 }
 for(const value of resolutions.values())if(!records.has(value.recordId)||canonicalLegacy(normalize(value.record,ctx.root))!==canonicalLegacy(normalize(records.get(value.recordId),ctx.root)))throw Error('A sync resolution has an unknown or conflicting record; inspect it before continuing.');
 await unchanged(ctx,ctx.ledgerStat);
 return {records,resolutions,persisted,active:[...records.values()].filter(record=>!resolved.has(record.id)),count:entries.length};
}
async function readEntries(ctx,legacy=[]) {return (await readState(ctx,legacy)).active;}
async function syncDirectory(dir) {
 // Windows does not reliably permit opening/syncing directories. File fsync and
 // exclusive publication still apply there, but crash durability of directory
 // entries is not promised. Other platforms fail closed if directory sync fails.
 if(process.platform==='win32')return;
 const h=await fs.open(dir,constants.O_RDONLY);try{await h.sync();}finally{await h.close();}
}
function encodedEntry(kind,id,payload) {
 if(!idPattern.test(id)||(kind==='resolution'&&!uuidPattern.test(id)))throw Error('Invalid sync identifier.');
 const data=Buffer.from(JSON.stringify({version:1,kind,id,...payload})+'\n');
 if(data.length>MAX_BYTES)throw Error('Sync record is too large.');
 return data;
}
async function publish(ctx,kind,payload,hook,afterPublish,id=crypto.randomUUID()) {
 const data=encodedEntry(kind,id,payload);
 if((await fs.readdir(ctx.ledger)).length>=MAX_ENTRIES)throw Error('Too many sync records to inspect safely.');
 const target=path.join(ctx.ledger,`${kind}-${id}.json`),temp=path.join(ctx.ledger,`.pending-${crypto.randomUUID()}`);
 let h,published=false;
 try {
  h=await fs.open(temp,'wx',0o600);await h.writeFile(data);await h.sync();await h.close();h=undefined;
  if(hook)await hook();await unchanged(ctx,ctx.ledgerStat);ctx.assertActive?.();ctx.assertCurrentNow?.();ctx.beforePublishNow?.();
  await fs.link(temp,target);published=true;await fs.unlink(temp);if(afterPublish)await afterPublish();await syncDirectory(ctx.ledger);
  return id;
 } catch(error) {
  await h?.close().catch(()=>{});
  if(!published)await fs.unlink(temp).catch(()=>{});
  // If publication occurred but flush failed, leave the immutable result in
  // place; callers must inspect before retrying rather than assume absence.
  if(published){const uncertain=Error('Sync record publication could not be confirmed. Inspect the retained record before retrying.',{cause:error});uncertain.recordId=id;throw uncertain;}
  throw error;
 }
}
// Import only an explicitly supplied snapshot of this workspace's Memento
// entries. This neither enumerates other windows nor establishes a cutover.
// Source entries remain untouched. UUIDs, legacy IDs, resolution-event UUIDs
// and production fields survive; conflicting reuse of an ID fails closed.
function mementoBatch(root,entries) {
 if(!Array.isArray(entries)||entries.length>MAX_ENTRIES)throw Error('Invalid Memento import snapshot.');
 const records=new Map(),resolutions=new Map();let bytes=0;
 const addRecord=(id,value,sourceKey)=>{
  if(!idPattern.test(id))throw Error('Invalid imported sync identifier.');
  const record=normalize(value,root),prior=records.get(id);
  if(prior&&canonicalLegacy(prior.record)!==canonicalLegacy(record))throw Error('Conflicting imported sync records need inspection.');
  if(!prior)records.set(id,{record,sourceKey});
 };
 const optionalFields=new Set(['type','page','accountId','operation','kind','committed','pushStarted','recoveryPath','sourceHead','reviewedRemoteHead','reviewedMainHead','sessionId','intentId']);
 const jsonRecord=value=>value&&Object.getPrototypeOf(value)===Object.prototype
  ? Object.fromEntries(Object.entries(value).filter(([key,item])=>item!==undefined||!optionalFields.has(key))) : value;
 for(const source of entries) {
  if(!source||Object.getPrototypeOf(source)!==Object.prototype)throw Error('Invalid Memento import entry.');
  // Same-session Memento caches can retain undefined optional fields until
  // serialization. Apply JSON's omission only to recognized optional fields;
  // required/unknown undefined fields still fail strict validation below.
  const resolved=typeof source.key==='string'&&source.key.startsWith('zero.resolvedSync.v1:');
  const value=resolved&&source.value&&Object.getPrototypeOf(source.value)===Object.prototype
   ? {...source.value,record:jsonRecord(source.value.record)} : jsonRecord(source.value);
  const entry={...source,value};
  bytes+=Buffer.byteLength(canonicalLegacy(entry));if(bytes>MAX_IMPORT_BYTES)throw Error('Memento import snapshot is too large.');
  if(!entry||Object.keys(entry).some(key=>!['key','value'].includes(key))||!text(entry.key,8192))throw Error('Invalid Memento import entry.');
  const {key}=entry;
  if(key.startsWith('zero.pendingSync.v1:')) {
   const id=key.slice('zero.pendingSync.v1:'.length);
   if(!idPattern.test(id)||value?.id!==id)throw Error('Invalid imported sync identifier.');
   const {id:recordId,...legacy}=value;
   if(recordId.startsWith('legacy-')&&recordId!=='legacy-'+sha(JSON.stringify(legacy)))throw Error('Invalid imported legacy identifier.');
   addRecord(id,value,key);
  } else if(key.startsWith('zero.resolvedSync.v1:')) {
   const id=key.slice('zero.resolvedSync.v1:'.length);
   if(!uuidPattern.test(id)||!value||Object.keys(value).some(name=>!['id','reason','record','at'].includes(name))||!idPattern.test(value.id||'')||value.record?.id!==value.id||!['reviewed','confirmed','superseded'].includes(value.reason)||!Number.isSafeInteger(value.at)||value.at<0)throw Error('Invalid imported sync resolution.');
   const {id:recordId,...legacy}=value.record;
   if(recordId.startsWith('legacy-')&&recordId!=='legacy-'+sha(JSON.stringify(legacy)))throw Error('Invalid imported legacy identifier.');
   addRecord(recordId,value.record,key);
   const resolution={recordId,reason:value.reason,record:{...value.record},at:value.at,sourceKey:key},prior=resolutions.get(id);
   if(prior&&canonicalLegacy(prior)!==canonicalLegacy(resolution))throw Error('Conflicting imported sync resolutions need inspection.');
   resolutions.set(id,resolution);
  } else if(key.startsWith('zero.gitUploadRecovery:')||key.startsWith('zero.localCommitPending:')) {
   const local=key.startsWith('zero.localCommitPending:'),prefix=local?'zero.localCommitPending:':'zero.gitUploadRecovery:';
   if(!value||value.id!==undefined||key!==`${prefix}${root}:${value.branch}`)throw Error('Invalid imported legacy sync record.');
   const record=local?{...value,remote:'',type:'local'}:value;
   // Match pending-sync-ledger.js exactly, including source property order.
   addRecord('legacy-'+sha(JSON.stringify(record)),record,key);
  } else throw Error('Unsupported Memento import key.');
 }
 return {records,resolutions};
}
function createFileLedger({beforePublish,afterPublish}={}) {
 const operations=ctx=>({
  async importMemento(entries) {
   const root=ctx.root,batch=mementoBatch(root,entries),state=await readState(ctx),newRecords=[],newResolutions=[];
   // Validate the entire snapshot before publishing records, then resolutions.
   for(const [id,value] of batch.records) {
    const prior=state.records.get(id);
    if(prior&&canonicalLegacy(normalize(prior,root))!==canonicalLegacy(value.record))throw Error('Conflicting sync identifiers need inspection before import.');
    if(!prior)newRecords.push([id,value]);
   }
   for(const [id,value] of batch.resolutions) {
    const prior=state.resolutions.get(id);
    // sourceKey is import metadata, not part of the resolution's identity.
    const identity=row=>({recordId:row.recordId,reason:row.reason,record:row.record,at:row.at});
    if(prior&&canonicalLegacy(identity(prior))!==canonicalLegacy(identity(value)))throw Error('Conflicting sync resolution identifiers need inspection before import.');
    if(!prior)newResolutions.push([id,value]);
   }
   if(state.count+newRecords.length+newResolutions.length>MAX_ENTRIES)throw Error('Too many sync records to import safely.');
   for(const [id,value] of newRecords)encodedEntry('record',id,value);
   for(const [id,value] of newResolutions)encodedEntry('resolution',id,value);
   for(const [id,value] of newRecords)await publish(ctx,'record',value,beforePublish,afterPublish,id);
   for(const [id,value] of newResolutions)await publish(ctx,'resolution',value,beforePublish,afterPublish,id);
   return {importedRecords:newRecords.map(([id])=>id),importedResolutions:newResolutions.map(([id])=>id),records:await readEntries(ctx)};
  },
  async snapshot() {
   const state=await readState(ctx);
   return {records:[...state.records.values()],resolutions:[...state.resolutions.values()].map(row=>({id:row.id,recordId:row.recordId,reason:row.reason,record:row.record,at:row.at})),active:state.active};
  },
  async list({legacy=[]}={}) {return readEntries(ctx,legacy);},
  async begin(record,{legacy=[]}={}) {
   const normalized=normalize({...record,kind:'in-progress'},ctx.root),existing=await readEntries(ctx,legacy);
   if(existing.some(item=>item.branch===normalized.branch))throw Error('An earlier sync needs review before starting this operation.');
   const id=await publish(ctx,'record',{record:normalized},beforePublish,afterPublish);return {id,...normalized};
  },
  async add(record) {
   const normalized=normalize(record,ctx.root);await readEntries(ctx);
   const id=await publish(ctx,'record',{record:normalized},beforePublish,afterPublish);return {id,...normalized};
  },
  async resolve(recordId,reason,{legacy=[]}={}) {
   if(!idPattern.test(recordId||'')||!['reviewed','confirmed','superseded'].includes(reason))throw Error('Invalid sync resolution.');
   const state=await readState(ctx,legacy),record=state.active.find(record=>record.id===recordId);
   if(!record)throw Error('The sync reminder changed. Review it again.');
   if(state.count+(state.persisted.has(recordId)?1:2)>MAX_ENTRIES)throw Error('Too many sync records to resolve safely.');
   if(!state.persisted.has(recordId))await publish(ctx,'record',{record:normalize(record,ctx.root)},beforePublish,afterPublish,recordId);
   return publish(ctx,'resolution',{recordId,reason,record,at:Date.now()},beforePublish,afterPublish);
  }
 });
 async function withTransaction(root,callback,{beforePublishNow}={}) {
  if(typeof callback!=='function'||(beforePublishNow!==undefined&&typeof beforePublishNow!=='function'))throw Error('A sync transaction callback and valid publication guard are required.');
  return withLock(root,async base=>{
   let active=true,pending;
   const assertActive=()=>{if(!active)throw Error('The sync transaction has expired.');};
   const ctx={...base,assertActive,beforePublishNow},ops=operations(ctx),tx={root,assertCurrentNow(){assertActive();if(pending)throw Error('A sync transaction operation is still running.');base.assertCurrentNow();},ownsLock(file,info){assertActive();if(pending)throw Error('A sync transaction operation is still running.');return base.ownsLock(file,info);}};
   for(const [name,operation] of Object.entries(ops))tx[name]=(...args)=>{
    assertActive();if(pending)throw Error('Concurrent sync transaction operations are not supported.');base.assertCurrentNow();
    const result=operation(...args);pending=result;
    return result.finally(()=>{if(pending===result)pending=undefined;});
   };
   let result,error;
   try{result=await callback(Object.freeze(tx));}catch(cause){error=cause;}
   finally{active=false;if(pending){try{await pending;}catch(cause){error=error||cause;}error=error||Error('Await every sync transaction operation before returning.');}}
   if(error)throw error;return result;
  });
 }
 const api={withTransaction};
 for(const name of ['snapshot','list','begin','add','resolve'])api[name]=(root,...args)=>withTransaction(root,tx=>tx[name](...args));
 // Reject an invalid explicit import before creating any repository storage.
 api.importMemento=async(root,entries)=>{mementoBatch(root,entries);return withTransaction(root,tx=>tx.importMemento(entries));};
 return api;
}
module.exports={createFileLedger};
