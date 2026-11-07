'use strict';
// Select compatibility before any file-ledger attempt. It preserves connected
// Git workflows for linked/custom metadata, but grants no shared-ledger or
// history-rewrite authority. Storage errors never change the selected backend.
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {createRepositorySyncLedger}=require('./repository-sync-ledger');
const {createPendingSyncLedger}=require('./pending-sync-ledger');
const exec=promisify(execFile);
const P='zero.pendingSync.v1:',R='zero.resolvedSync.v1:';
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
async function classify(root) {
 if(typeof root!=='string'||!path.isAbsolute(root)||await fs.realpath(root)!==root)throw Error('Open the original Git project folder.');
 const rootInfo=await fs.lstat(root),marker=path.join(root,'.git'),markerInfo=await fs.lstat(marker);
 if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||(!markerInfo.isFile()&&!markerInfo.isDirectory()&&!markerInfo.isSymbolicLink()))throw Error('The Git project metadata cannot be inspected.');
 const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'};
 const git=async args=>(await exec('git',['-c','core.fsmonitor=false',...args],{cwd:root,env,timeout:10000,maxBuffer:1024*1024,encoding:'utf8'})).stdout;
 const gitDir=await fs.realpath((await git(['rev-parse','--absolute-git-dir'])).trim()),commonDir=await fs.realpath(path.resolve(root,(await git(['rev-parse','--git-common-dir'])).trim()));
 const keys=(await git(['config','--local','--no-includes','--name-only','--null','--list'])).split('\0').filter(Boolean),config=path.join(commonDir,'config'),configInfo=await fs.lstat(config);
 let reason;
 if(!markerInfo.isDirectory()||markerInfo.isSymbolicLink()||gitDir!==marker||commonDir!==marker)reason='linked or separate Git metadata';
 else if(keys.some(key=>/^(?:core\.worktree|include\.|includeif\.)/i.test(key)))reason='custom worktree or included Git configuration';
 else if(!configInfo.isFile()||configInfo.isSymbolicLink()||configInfo.nlink!==1||configInfo.size>16384)reason='nonstandard Git configuration storage';
 if(!reason)return {mode:'file'};
 const storageDirs=[...new Set([gitDir,commonDir])];
 const requireNoFileStateNow=()=>{for(const dir of storageDirs)for(const name of [path.join(dir,'zero-pending-sync.lock'),path.join(dir,'zero-pending-sync')]){try{fsSync.lstatSync(name);}catch(error){if(error.code==='ENOENT')continue;throw error;}const error=Error('Retained shared reminder storage cannot be bypassed in compatibility mode. Use the ordinary project format or inspect the retained storage before continuing.');error.recoveryPath=name;if(name.endsWith('zero-pending-sync.lock'))error.lockRecoveryPath=name;throw error;}};
 requireNoFileStateNow();
 const markerBytes=markerInfo.isFile()?await fs.readFile(marker):markerInfo.isSymbolicLink()?Buffer.from(await fs.readlink(marker)):undefined;
 const gitInfo=await fs.lstat(gitDir),commonInfo=await fs.lstat(commonDir);
 const assertCurrentNow=()=>{
  if(!same(rootInfo,fsSync.lstatSync(root))||!same(markerInfo,fsSync.lstatSync(marker))||!same(gitInfo,fsSync.lstatSync(gitDir))||!same(commonInfo,fsSync.lstatSync(commonDir)))throw Error('The compatibility Git project changed. Review this step again.');
  if(markerBytes&&!(markerInfo.isSymbolicLink()?Buffer.from(fsSync.readlinkSync(marker)):fsSync.readFileSync(marker)).equals(markerBytes))throw Error('The compatibility Git project changed. Review this step again.');
  const now=fsSync.lstatSync(config);if(!same(configInfo,now)||configInfo.size!==now.size||configInfo.mtimeMs!==now.mtimeMs||configInfo.ctimeMs!==now.ctimeMs)throw Error('The compatibility Git configuration changed. Review this step again.');
  requireNoFileStateNow();
 };
 assertCurrentNow();return {mode:'compatibility',reason,assertCurrentNow};
}
function createRepositoryReminderStorage({state,onCompatibility=()=>{},fileAdapter=createRepositorySyncLedger({state})}={}) {
 const memento=createPendingSyncLedger(state),reported=new Set();
 if(!memento.enumerable)throw Error('Enumerable reminder storage is required.');
 const keys=()=>{const result=state.keys();if(!Array.isArray(result)||result.length>20000||result.some(key=>typeof key!=='string'))throw Error('Reminder storage cannot be inspected safely.');return result;};
 const validRecord=record=>record&&typeof record==='object'&&!Array.isArray(record)&&typeof record.root==='string'&&typeof record.branch==='string'&&record.branch.length>0&&typeof record.remote==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.head||'');
 function rows(root){
  const allKeys=keys();
  for(const key of allKeys){const value=state.get(key);
   if(key.startsWith(P)&&(!validRecord(value)||typeof value.id!=='string'||value.id!==key.slice(P.length)))throw Error('A sync reminder is unreadable. Inspect reminder storage before continuing.');
   if(key.startsWith(R)&&(!value||typeof value.id!=='string'||!['reviewed','confirmed','superseded'].includes(value.reason)||!validRecord(value.record)||value.record.id!==value.id))throw Error('A sync resolution is unreadable. Inspect reminder storage before continuing.');
   for(const prefix of ['zero.gitUploadRecovery:','zero.localCommitPending:'])if(key.startsWith(prefix+root+':')){const record=prefix.includes('localCommit')&&value?{...value,remote:'',type:'local'}:value;if(!validRecord(record)||record.root!==root||key!==prefix+root+':'+record.branch)throw Error('An earlier sync reminder is unreadable. Inspect reminder storage before continuing.');}
  }
  const canonical=value=>Array.isArray(value)?['array',...value.map(canonical)]:value&&typeof value==='object'?['object',...Object.keys(value).sort().map(key=>[key,canonical(value[key])])]:[typeof value,value];
  const identity=record=>JSON.stringify(canonical(JSON.parse(JSON.stringify(record))));
  const known=new Map(allKeys.filter(key=>key.startsWith(P)).map(key=>{const value=state.get(key);return [value.id,value];}));
  for(const key of allKeys)for(const prefix of ['zero.gitUploadRecovery:','zero.localCommitPending:'])if(key.startsWith(prefix+root+':')){const source=state.get(key),record=prefix.includes('localCommit')?{...source,remote:'',type:'local'}:source,id='legacy-'+crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');const bound={...record,id};if(known.has(id)&&identity(known.get(id))!==identity(bound))throw Error('Conflicting sync reminder identifiers need inspection.');known.set(id,bound);}
  // Memento's historical reader suppresses by ID. Validate the full immutable
  // snapshot first so a corrupt resolution cannot hide a different attempt.
  for(const key of allKeys)if(key.startsWith(R)){const value=state.get(key),record=known.get(value.id);if(record&&identity(record)!==identity(value.record))throw Error('A sync resolution conflicts with its exact record. Inspect reminder storage before continuing.');}
  const branches=new Set();for(const key of allKeys){const value=state.get(key);if(key.startsWith(P)&&value?.root===root)branches.add(value.branch);for(const prefix of ['zero.gitUploadRecovery:','zero.localCommitPending:'])if(key.startsWith(prefix+root+':'))branches.add(key.slice((prefix+root+':').length));}
  const records=new Map();for(const branch of branches){const push=state.get(`zero.gitUploadRecovery:${root}:${branch}`),value=state.get(`zero.localCommitPending:${root}:${branch}`),local=value&&{...value,remote:'',type:'local'};for(const record of [...memento.list(root,branch,push),...memento.list(root,branch,local)])records.set(record.id,record);}return [...records.values()];
 }
 const entries=root=>keys().filter(key=>key.startsWith(P)||key.startsWith(R)||key.startsWith(`zero.gitUploadRecovery:${root}:`)||key.startsWith(`zero.localCommitPending:${root}:`)).sort().map(key=>[key,JSON.stringify(state.get(key))]);
 const signature=entries=>JSON.stringify([...entries].sort((a,b)=>a[0].localeCompare(b[0])));
 const fingerprint=root=>signature(entries(root));
 async function backend(root){const format=await classify(root);if(format.mode==='compatibility'&&!reported.has(root)){reported.add(root);onCompatibility(`This project uses workspace reminder compatibility storage (${format.reason}). Shared file-ledger authority is unavailable for this project.`);}return format;}
 async function withTransaction(root,callback){
  const format=await backend(root);if(format.mode==='file')return fileAdapter.withTransaction(root,callback);
  let active=true,pending,poisoned=false,expected=fingerprint(root),intendedWrites;
  const writer=createPendingSyncLedger({get:key=>state.get(key),keys:()=>state.keys(),async update(key,value){intendedWrites.push([key,JSON.stringify(value)]);await state.update(key,value);}});
  const check=()=>{if(!active||pending||poisoned)throw Error('The compatibility reminder transaction expired, failed, or is busy.');format.assertCurrentNow();rows(root);if(fingerprint(root)!==expected)throw Error('The visible sync reminders changed. Review them again.');};
  const run=operation=>(...args)=>{check();const before=new Map(entries(root));intendedWrites=[];const task=Promise.resolve().then(async()=>{
   if(!active)throw Error('The compatibility reminder transaction expired.');
   try{const result=await operation(...args);for(const [key,value] of intendedWrites)before.set(key,value);const intended=signature(before);if(fingerprint(root)!==intended)throw Error('The visible sync reminders changed during the compatibility write. Review them again.');format.assertCurrentNow();expected=intended;return result;}
   catch(error){poisoned=true;throw error;}
  });pending=task;return task.finally(()=>{if(pending===task)pending=undefined;});};
  const tx=Object.freeze({root,assertCurrentNow:check,ownsLock(){check();return false;},list:run(()=>rows(root)),add:run(record=>writer.add(record)),resolve:run(async(id,reason)=>{const record=rows(root).find(row=>row.id===id);if(!record)throw Error('The sync reminder changed. Review it again.');await writer.resolve(record,reason);})});
  let result,error;try{result=await callback(tx);}catch(cause){error=cause;}finally{active=false;if(pending){try{await pending;}catch(cause){error=error||cause;}error=error||Error('Await every compatibility reminder operation before returning.');}}if(error)throw error;return result;
 }
 const api={withTransaction,async supportsFileLedger(root){return (await backend(root)).mode==='file';},async withProvenance(root,binding,callback){const format=await backend(root);if(format.mode!=='file')throw Error('This project uses compatibility reminder storage. Use Source Control to review this history change.');return fileAdapter.withProvenance(root,binding,callback);}};
 for(const name of ['list','add','resolve'])api[name]=(root,...args)=>withTransaction(root,tx=>tx[name](...args));
 return api;
}
module.exports={createRepositoryReminderStorage};
