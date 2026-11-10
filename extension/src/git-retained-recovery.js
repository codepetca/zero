'use strict';
// Read retained conflict copies only. Never interpret manifest paths as paths to open.
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseIndexFlags}=require('./index-entry-flags');
const {validateUnbornRemoval}=require('./unborn-retained-recovery');
const unbornDiscardRecovery=require('./unborn-discard-recovery');
const {assertNoUnresolvedSwitch}=require('./reftable-switch-capture');
const limit = 16 * 1024 * 1024;
const same = (a,b) => a.dev === b.dev && a.ino === b.ino;
async function directory(name) {
  const s = await fs.lstat(name);
  if (!s.isDirectory() || s.isSymbolicLink() || await fs.realpath(name) !== name) throw new Error('Recovery folder is unsafe or changed.');
  return s;
}
async function read(name, max) {
  const before = await fs.lstat(name);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > max) throw new Error('Recovery file is unsafe or too large.');
  const h = await fs.open(name, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = await h.stat();
    if (!same(before,stat) || !stat.isFile() || stat.nlink !== 1 || stat.size > max) throw new Error('Recovery file changed.');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await h.read(buffer,length,buffer.length-length,length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const bytes = buffer.subarray(0,length);
    const after = await h.stat(), named = await fs.lstat(name);
    if (!same(stat,after) || !same(stat,named) || named.isSymbolicLink() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || bytes.length !== stat.size) throw new Error('Recovery file changed.');
    return bytes;
  } finally {await h.close();}
}
// Large retained copies are inspectable without allocating their full size.
async function hashLargeCopy(name, max) {
  const before=await fs.lstat(name);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>max)throw new Error('Recovery file is unsafe or too large.');
  const h=await fs.open(name,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
  try {
    const stat=await h.stat(),equal=(a,b)=>same(a,b)&&a.size===b.size&&a.mode===b.mode&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.nlink===1;
    if(!stat.isFile()||!equal(before,stat))throw new Error('Recovery file changed.');
    const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(256*1024);let offset=0;
    while(offset<stat.size){const part=await h.read(buffer,0,Math.min(buffer.length,stat.size-offset),offset);if(!part.bytesRead)throw new Error('Recovery file changed.');hash.update(buffer.subarray(0,part.bytesRead));offset+=part.bytesRead;}
    const after=await h.stat(),named=await fs.lstat(name);
    if(!equal(stat,after)||!equal(stat,named)||named.isSymbolicLink())throw new Error('Recovery file changed.');
    return {size:offset,sha256:hash.digest('hex')};
  } finally {await h.close();}
}
async function anchors(root, folder) {
  if (!path.isAbsolute(root) || await fs.realpath(root) !== root) throw new Error('Open the original standalone project to inspect recovery copies.');
  const git = path.join(root,'.git');
  const gitStat = await directory(git);
  let folderStat;
  if (folder) folderStat = await directory(path.join(git,folder));
  return {git,gitStat,folderStat};
}
async function list(root) {
  const base = await anchors(root);
  const entries = await fs.readdir(base.git,{withFileTypes:true});
  const names = entries.filter(e => e.isDirectory() && /^zero-text-recovery-[A-Za-z0-9]+$/.test(e.name)).map(e => e.name).sort();
  if (names.length > 500) throw new Error('Too many recovery folders to list safely. Inspect the Git folder yourself.');
  if (!same(base.gitStat,await directory(base.git))) throw new Error('Recovery folder changed.');
  return names;
}
async function inspect(root, name) {
  if (typeof name !== 'string' || !/^zero-text-recovery-[A-Za-z0-9]+$/.test(name)) throw new Error('Invalid recovery folder name.');
  const a = await anchors(root,name), folder = path.join(a.git,name);
  const unchanged = async () => {
    if (!same(a.gitStat,await directory(a.git)) || !same(a.folderStat,await directory(folder))) throw new Error('Recovery folder changed.');
  };
  let manifest;
  try {manifest = JSON.parse((await read(path.join(folder,'manifest.json'),16384)).toString('utf8'));} catch {await unchanged();return {folder,status:'Incomplete or unsafe manifest; preserve this folder for manual inspection.'};}
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {await unchanged();return {folder,status:'Invalid manifest; preserve this folder for manual inspection.'};}
  const validPath = typeof manifest.path === 'string' && manifest.path.length <= 4096 && !/[\x00-\x1f\x7f\\]/.test(manifest.path) && !path.posix.isAbsolute(manifest.path) && manifest.path.split('/').every(part => part && part !== '.' && part !== '..');
  if (manifest.version !== 1 || !validPath || ![null,'original'].includes(manifest.original) || !(manifest.expectedHash === null || /^[a-f0-9]{64}$/.test(manifest.expectedHash))) {
    await unchanged();return {folder,status:'Invalid manifest; preserve this folder for manual inspection.'};
  }
  if (manifest.original === null) {await unchanged();return {folder,originalPath:manifest.path,status:'No original file recorded; this operation may have stopped before a copy was made.'};}
  let bytes;
  const copyPath = path.join(folder,'original');
  try {bytes = await read(copyPath,limit);} catch {await unchanged();return {folder,copyPath,originalPath:manifest.path,status:'Original copy is missing, unsafe or too large to inspect here; preserve this folder.'};}
  let observed;
  try {observed = JSON.parse((await read(path.join(folder,'observed.json'),16384)).toString('utf8'));} catch {}
  await unchanged();
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const verified = observed && observed.hash === hash && observed.size === bytes.length;
  let content;
  try {if (bytes.includes(0)) throw Error();content = new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch {}
  return {folder,copyPath,originalPath:manifest.path,content,status: `${verified ? 'Copy matches its recorded observation.' : 'Incomplete or changed copy; observation is missing or does not match.'}${hash !== manifest.expectedHash ? ' Copy differs from the expected file; it may contain later edits.' : ''}${content === undefined ? ' This copy is not UTF-8 text; inspect it manually.' : ''}`};
}
const restoreName = name => typeof name === 'string' && /^zero-project-restore-recovery-[A-Za-z0-9]+$/.test(name);
const oid = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const safeProjectPath = value => typeof value === 'string' && value.length <= 4096 && value.length > 0 && !/[\x00-\x1f\x7f\\]/.test(value) && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
const inverseName=name=>typeof name==='string'&&/^zero-inverse-recovery-[A-Za-z0-9]+$/.test(name);
async function listInverseRecoveries(root) {
  const a=await anchors(root),entries=await fs.readdir(a.git,{withFileTypes:true});
  const matches=entries.filter(e=>e.name.startsWith('zero-inverse-recovery-'));
  const unsafe=matches.find(e=>!inverseName(e.name)||!e.isDirectory()||e.isSymbolicLink());
  if(unsafe)throw new Error(`Unsafe inverse recovery entry needs manual inspection: ${path.join(a.git,unsafe.name)}`);
  const names=matches.map(e=>e.name).sort();
  if(names.length>500)throw new Error('Too many inverse recovery folders to list safely.');
  if(!same(a.gitStat,await directory(a.git)))throw new Error('Recovery folder changed.');return names;
}
async function inspectInverseRecovery(root,name) {
  if(!inverseName(name))throw new Error('Invalid inverse recovery folder name.');
  const a=await anchors(root,name),folder=path.join(a.git,name);
  const unchanged=async()=>{if(!same(a.gitStat,await directory(a.git))||!same(a.folderStat,await directory(folder)))throw new Error('Recovery folder changed.');};
  let intent;
  try{intent=JSON.parse((await read(path.join(folder,'intent.json'),16384)).toString('utf8'));}catch{await unchanged();return {folder,status:'Import preparation is incomplete; preserve this folder for manual inspection.'};}
  if(!intent||intent.schema!==1||intent.status!=='import-intended'||![intent.head,intent.change,intent.tree,intent.commit].every(oid)||!/^refs\/heads\/[^\x00-\x20\x7f]+$/.test(intent.branch)||!/^refs\/zero\/inverse\/[a-f0-9]{32}$/.test(intent.ref)||!Number.isInteger(intent.packSize)||intent.packSize<32||intent.packSize>72*1024*1024||!/^[a-f0-9]{64}$/.test(intent.packSha256)) {await unchanged();return {folder,status:'Invalid import intent; preserve this folder for manual inspection.'};}
  let packMatches=false;try{const pack=await read(path.join(folder,'inverse.pack'),72*1024*1024);packMatches=pack.length===intent.packSize&&crypto.createHash('sha256').update(pack).digest('hex')===intent.packSha256;}catch{}
  const receipts={};for(const [file,status] of [['imported.json','imported'],['pinned.json','pinned']])try{const record=JSON.parse((await read(path.join(folder,file),16384)).toString('utf8'));if(record.status===status&&Object.keys(intent).every(key=>key==='status'||record[key]===intent[key])&&oid(record.packObject))receipts[status]=true;}catch{}
  const refs=await undoRefObservations(root,a.git,intent.ref,intent.branch).catch(()=>null);await unchanged();
  const observed=refs?.recoveryRef?.object===intent.commit&&!refs.recoveryRef.symbolic;
  return {folder,head:intent.head,branch:intent.branch,change:intent.change,commit:intent.commit,ref:intent.ref,packMatches,observedRef:refs?.recoveryRef||null,status:!packMatches?'Inverse pack is missing or changed; preserve this folder.':receipts.pinned&&observed?'Inverse target is pinned; inspect the project and associated restore recovery before continuing.':receipts.imported?'Import started but its pin is not confirmed; inspect the ref and preserve this folder.':'Import may not have started or may have stopped; inspect the ref and preserve this folder.'};
}
async function listProjectRestores(root) {
  const base = await anchors(root);
  const entries = await fs.readdir(base.git,{withFileTypes:true});
  const names = entries.filter(entry => entry.isDirectory() && restoreName(entry.name)).map(entry => entry.name).sort();
  if (names.length > 500) throw new Error('Too many recovery folders to list safely. Inspect the Git folder yourself.');
  if (!same(base.gitStat,await directory(base.git))) throw new Error('Recovery folder changed.');
  return names;
}
async function restoreContext(root,name) {
  if (!restoreName(name)) throw new Error('Invalid recovery folder name.');
  const a = await anchors(root,name), folder = path.join(a.git,name);
  const unchanged = async () => {
    if (!same(a.gitStat,await directory(a.git)) || !same(a.folderStat,await directory(folder))) throw new Error('Recovery folder changed.');
  };
  return {folder,unchanged};
}
// Manifest names are labels only. Every readable filename is constructed from
// a validated numeric index, never from a path supplied in recovery metadata.
async function inspectProjectRestore(root,name) {
  const {folder,unchanged} = await restoreContext(root,name);
  let manifest;
  try {manifest=JSON.parse((await read(path.join(folder,'manifest.json'),1024*1024)).toString('utf8'));} catch {await unchanged();return {folder,status:'Incomplete or unsafe manifest; preserve this folder for manual inspection.',files:[]};}
  const valid = manifest && !Array.isArray(manifest) && manifest.schema===1 && oid(manifest.head) && oid(manifest.selected) && typeof manifest.branch==='string' && /^refs\/heads\/[^\x00-\x20\x7f]+$/.test(manifest.branch) && manifest.index?.copy==='index' && /^[a-f0-9]{64}$/.test(manifest.index?.sha256 || '') && Array.isArray(manifest.files) && manifest.files.length<=2000 && manifest.files.every((file,i)=>file && safeProjectPath(file.name) && ['added','deleted','modified'].includes(file.kind) && (file.missing===true ? file.copy===undefined : file.copy===`file-${i}` && /^[a-f0-9]{64}$/.test(file.sha256 || '') && Number.isInteger(file.mode)));
  if(!valid) {await unchanged();return {folder,status:'Invalid manifest; preserve this folder for manual inspection.',files:[]};}
  let journal, journalStatus, events=[];
  try {
    const raw=(await read(path.join(folder,'apply-journal.jsonl'),2*1024*1024)).toString('utf8');
    if(!raw.endsWith('\n')) throw Error();
    journal=raw.trimEnd().split('\n').map(line=>JSON.parse(line));
    const start=journal[0];
    if(!start || ![1,2].includes(start.schema) || start.event!=='start' || start.head!==manifest.head || start.branch!==manifest.branch || !oid(start.commit) || !Array.isArray(start.files) || start.files.length!==manifest.files.length || start.files.some((file,i)=>file?.name!==manifest.files[i].name || file?.kind!==manifest.files[i].kind)) throw Error();
    const expected=[];
    if(start.schema===2) {
      const seen=new Set();let previousDepth=0;
      if(!Array.isArray(start.directories)||!start.directories.length||start.directories.length>2000)throw Error();
      for(const [index,name] of start.directories.entries()) {
        if(!safeProjectPath(name)||seen.has(name.normalize('NFC').toLowerCase())||!manifest.files.some(file=>file.kind!=='deleted'&&file.name.startsWith(name+'/')))throw Error();
        const depth=name.split('/').length;if(depth<previousDepth)throw Error();previousDepth=depth;seen.add(name.normalize('NFC').toLowerCase());
        expected.push({event:'mkdir-intent',index,name},{event:'mkdir-complete',index,name});
      }
    } else if(start.directories!==undefined)throw Error();
    manifest.files.forEach((file,index)=>{
      if(!file.missing)expected.push({event:'move-intent',index},{event:'moved',index});
      if(file.kind!=='deleted')expected.push({event:'install-intent',index},{event:'installed',index});
    });
    expected.push({event:'index-intent'},{event:'index-installed'},{event:'ref-intent'},{event:'complete'});
    if(journal.length-1>expected.length || journal.slice(1).some((entry,i)=>!entry || typeof entry!=='object' || Array.isArray(entry) || entry.event!==expected[i].event || entry.index!==expected[i].index || (expected[i].name!==undefined ? entry.name!==expected[i].name : entry.name!==undefined && entry.name!==manifest.files[entry.index]?.name) || (start.schema===2 && entry.event==='installed' && (typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)))))throw Error();
    events=journal.map(entry=>entry.event);
    journalStatus=journal.at(-1)?.event==='complete' ? 'Journal records completion; inspect the project before making further changes.' : 'Application started but completion is not recorded; inspect the project and retained copies.';
  } catch(error) {
    journalStatus=error.code==='ENOENT' ? 'No application journal found; preparation may have stopped before application.' : 'Application journal is incomplete or unsafe; preserve this folder for manual inspection.';
  }
  await unchanged();
  return {folder,status:journalStatus,head:manifest.head,selected:manifest.selected,branch:manifest.branch,indexHash:manifest.index.sha256,files:manifest.files.map((file,index)=>({index,name:file.name,kind:file.kind,hasBackup:!file.missing,backupHash:file.missing?undefined:file.sha256})),events};
}
async function readProjectRestoreCopy(root,name,index,kind) {
  if(!Number.isInteger(index)||index<0||index>=2000||!['file','moved','target'].includes(kind))throw new Error('Invalid recovery copy selection.');
  const info=await inspectProjectRestore(root,name);
  if(!info.files.some(file=>file.index===index))throw new Error('Recovery copy is not in the manifest.');
  const {folder,unchanged}=await restoreContext(root,name);
  const filename=path.join(folder,`${kind}-${index}`);
  const bytes=await read(filename,limit);await unchanged();
  let content;
  try {if(bytes.includes(0))throw Error();content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch {}
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {filename,size:bytes.length,sha256,content,matchesBackup:kind==='file' ? sha256===info.files[index].backupHash : undefined};
}
async function inspectProjectRestoreIndex(root,name,kind) {
  if(!['index','target-index'].includes(kind))throw new Error('Invalid recovery index selection.');
  const info=await inspectProjectRestore(root,name);
  if(!info.indexHash)throw new Error('Recovery manifest is incomplete or unsafe.');
  const {folder,unchanged}=await restoreContext(root,name),filename=path.join(folder,kind);
  const bytes=await read(filename,4*1024*1024);await unchanged();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {filename,size:bytes.length,sha256,matchesBackup:kind==='index'?sha256===info.indexHash:undefined};
}
const cancelName = name => typeof name==='string' && /^zero-cancel-recovery-[A-Za-z0-9]+$/.test(name);
async function listCancelRecoveries(root) {
  const base=await anchors(root),entries=await fs.readdir(base.git,{withFileTypes:true});
  const names=entries.filter(entry=>entry.isDirectory()&&cancelName(entry.name)).map(entry=>entry.name).sort();
  if(names.length>500)throw new Error('Too many recovery folders to list safely. Inspect the Git folder yourself.');
  if(!same(base.gitStat,await directory(base.git)))throw new Error('Recovery folder changed.');
  return names;
}
async function cancelContext(root,name) {
  if(!cancelName(name))throw new Error('Invalid recovery folder name.');
  const a=await anchors(root,name),folder=path.join(a.git,name);
  const unchanged=async()=>{if(!same(a.gitStat,await directory(a.git))||!same(a.folderStat,await directory(folder)))throw new Error('Recovery folder changed.');};
  return {folder,unchanged};
}
const validCopy = (entry,copy,max) => entry && entry.copy===copy && /^[a-f0-9]{64}$/.test(entry.sha256||'') && Number.isSafeInteger(entry.size) && entry.size>=0 && entry.size<=max && Number.isInteger(entry.mode);
function validCancelJournal(journal,manifest,manifestHash) {
  const start=journal[0];
  if(!start || start.event!=='start' || start.head!==manifest.head || start.remoteHead!==manifest.remoteHead || start.capture!==manifestHash || !/^[a-f0-9]{64}$/.test(start.mergeIndexHash||'') || journal.length>manifest.files.length*4+24)return false;
  let phase='files',pending,previous=-1,subphase=0;const metadata=new Set(),installed=new Set();
  for(const entry of journal.slice(1)) {
    if(!entry || typeof entry!=='object'||Array.isArray(entry))return false;
    if(pending) {
      if(entry.event!==pending.event || (pending.index!==undefined && entry.index!==pending.index) || (pending.name!==undefined && entry.name!==pending.name))return false;
      if(entry.event==='installed')installed.add(entry.index);
      pending=undefined;continue;
    }
    if(phase==='files' && (entry.event==='move-intent'||entry.event==='install-intent')) {
      if(!Number.isInteger(entry.index)||entry.index<previous||entry.index>=manifest.files.length||entry.name!==manifest.files[entry.index].name)return false;
      if(entry.index!==previous)subphase=0;
      if(entry.event==='move-intent') {if(subphase!==0)return false;subphase=1;pending={event:'moved',index:entry.index};}
      else {if(subphase===2 || manifest.files[entry.index].missing)return false;subphase=2;pending={event:'installed',index:entry.index};}
      previous=entry.index;continue;
    }
    if(phase==='files' && entry.event==='index-intent'){
      if(manifest.files.some((file,index)=>!file.missing&&!installed.has(index)))return false;
      phase='index';pending={event:'index-installed'};continue;
    }
    if(phase==='index')phase='metadata';
    if(phase==='metadata' && entry.event==='metadata-intent') {
      if(!['MERGE_HEAD','MERGE_MSG','MERGE_MODE','AUTO_MERGE','ORIG_HEAD'].includes(entry.name)||metadata.has(entry.name))return false;
      metadata.add(entry.name);pending={event:'metadata-moved',name:entry.name};continue;
    }
    if(phase==='metadata' && entry.event==='metadata-restore-intent' && entry.name==='ORIG_HEAD' && manifest.originalOrigHead && !metadata.has('restored-ORIG_HEAD')) {metadata.add('restored-ORIG_HEAD');pending={event:'metadata-restored',name:entry.name};continue;}
    if(phase==='metadata' && entry.event==='record-intent'){
      if(!metadata.has('MERGE_HEAD') || (manifest.originalOrigHead&&!metadata.has('restored-ORIG_HEAD')))return false;
      phase='record';continue;
    }
    if(phase==='record' && entry.event==='complete'){phase='complete';continue;}
    return false;
  }
  return true;
}
async function inspectCancelRecovery(root,name) {
  const {folder,unchanged}=await cancelContext(root,name);let raw,manifest;
  try {raw=await read(path.join(folder,'manifest.json'),1024*1024);manifest=JSON.parse(raw.toString('utf8'));} catch {await unchanged();return {folder,status:'Capture manifest is incomplete or unsafe; preserve this folder for manual inspection.',files:[]};}
  const seen=new Set();
  const valid=manifest && !Array.isArray(manifest) && manifest.version===1 && manifest.kind==='pre-merge-cancel' && manifest.root===root && oid(manifest.head) && oid(manifest.remoteHead) && typeof manifest.branch==='string' && manifest.branch.length>0 && manifest.branch.length<=1024 && !/[\x00-\x20\x7f]/.test(manifest.branch) && /^[a-f0-9]{64}$/.test(manifest.fingerprint||'') && validCopy(manifest.index,'index',limit) && typeof manifest.indexEntries==='string' && manifest.baseline && typeof manifest.baseline==='object' && !Array.isArray(manifest.baseline) && typeof manifest.ignored==='string' && Array.isArray(manifest.markers) && manifest.markers.length===4 && manifest.markers.every(value=>value===null||typeof value==='string') && (manifest.originalOrigHead===null || validCopy(manifest.originalOrigHead,'orig-head',1024*1024)) && Array.isArray(manifest.files) && manifest.files.length<=10000 && manifest.files.every((file,i)=>{if(!file||!safeProjectPath(file.name)||seen.has(file.name.toLowerCase()))return false;seen.add(file.name.toLowerCase());return file.missing===true ? file.copy===undefined : validCopy(file,`file-${i}`,limit);});
  if(!valid){await unchanged();return {folder,status:'Invalid capture manifest; preserve this folder for manual inspection.',files:[]};}
  let journal,status,events=[];
  try {
    const bytes=await read(path.join(folder,'cancel-journal.jsonl'),4*1024*1024),text=bytes.toString('utf8');
    if(!text.endsWith('\n'))throw Error();
    journal=text.trimEnd().split('\n').map(line=>JSON.parse(line));
    if(!validCancelJournal(journal,manifest,crypto.createHash('sha256').update(raw).digest('hex')))throw Error();
    events=journal.map(entry=>entry.event);
    status=events.at(-1)==='complete'?'Journal records cancellation completion; inspect the project before making further changes.':'Cancellation started but completion is not recorded; inspect the project and retained copies.';
  } catch(error) {status=error.code==='ENOENT'?'No cancellation journal found; the capture alone does not show that cancellation started.':'Cancellation journal is incomplete or unsafe; preserve this folder for manual inspection.';}
  await unchanged();
  return {folder,status,head:manifest.head,remoteHead:manifest.remoteHead,branch:manifest.branch,indexHash:manifest.index.sha256,files:manifest.files.map((file,index)=>({index,name:file.name,hasBackup:!file.missing,backupHash:file.missing?undefined:file.sha256})),events};
}
async function readCancelRecoveryCopy(root,name,index,kind) {
  if(!Number.isInteger(index)||index<0||index>=10000||!['file','moved'].includes(kind))throw new Error('Invalid recovery copy selection.');
  const info=await inspectCancelRecovery(root,name),entry=info.files.find(file=>file.index===index);
  if(!entry)throw new Error('Recovery copy is not in the manifest.');
  const {folder,unchanged}=await cancelContext(root,name),filename=path.join(folder,`${kind}-${index}`);
  const bytes=await read(filename,limit);await unchanged();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');let content;
  try {if(bytes.includes(0))throw Error();content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
  return {filename,size:bytes.length,sha256,content,matchesBackup:kind==='file'?sha256===entry.backupHash:undefined};
}
async function inspectCancelRecoveryMetadata(root,name,kind) {
  const allowed=['index','merge-index','staged-index','orig-head','metadata-MERGE_HEAD','metadata-MERGE_MSG','metadata-MERGE_MODE','metadata-AUTO_MERGE','metadata-ORIG_HEAD','metadata-record'];
  if(!allowed.includes(kind))throw new Error('Invalid recovery metadata selection.');
  const info=await inspectCancelRecovery(root,name);if(!info.indexHash)throw new Error('Recovery manifest is incomplete or unsafe.');
  const {folder,unchanged}=await cancelContext(root,name),filename=path.join(folder,kind),bytes=await read(filename,limit);await unchanged();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {filename,size:bytes.length,sha256,matchesBackup:kind==='index'?sha256===info.indexHash:undefined};
}
// Discard recovery is inspection only. Names from manifests are labels, never
// used to construct a filesystem path. Partial captures remain discoverable.
const discardName = name => typeof name === 'string' && /^zero-discard-recovery-[A-Za-z0-9]+$/.test(name);
const fileRestoreName = name => typeof name === 'string' && /^zero-file-restore-recovery-[A-Za-z0-9]+$/.test(name);
async function listDiscardRecoveries(root) {
  const base=await anchors(root),entries=await fs.readdir(base.git,{withFileTypes:true});
  const names=entries.filter(entry=>entry.isDirectory()&&discardName(entry.name)).map(entry=>entry.name).sort();
  if(names.length>500)throw new Error('Too many recovery folders to list safely. Inspect the Git folder yourself.');
  if(!same(base.gitStat,await directory(base.git)))throw new Error('Recovery folder changed.');
  return names;
}
async function discardContext(root,name) {
  if(!discardName(name)&&!fileRestoreName(name))throw new Error('Invalid recovery folder name.');
  const a=await anchors(root,name),folder=path.join(a.git,name);
  return {folder,unchanged:async()=>{if(!same(a.gitStat,await directory(a.git))||!same(a.folderStat,await directory(folder)))throw new Error('Recovery folder changed.');}};
}
function validUnbornRemovalManifest(value) {
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),ref=value?.ref;
  const safeRef=typeof ref==='string'&&ref.startsWith('refs/heads/')&&safeProjectPath(ref)&&!/[\s~^:?*\[\\]/.test(ref)&&!ref.includes('..')&&!ref.includes('@{')&&!ref.endsWith('.')&&!ref.split('/').some(part=>part.startsWith('.')||part.endsWith('.lock'));
  const index=value?.index,selection=value?.selection,staged=value?.staged,format=value?.format,length=format==='sha1'?40:format==='sha256'?64:0;
  return value?.schema===6&&value.kind==='unborn-added-file-removal'&&safeRef&&length>0&&hash(value.headHash)&&(value.packedHash===null||hash(value.packedHash))&&
    index&&typeof index.present==='boolean'&&(index.present?hash(index.hash):index.hash===undefined)&&safeProjectPath(value.name)&&
    selection&&((selection.source==='untracked'&&selection.status==='??'&&staged===null)||(selection.source==='index'&&['A ','AM'].includes(selection.status)&&index.present&&staged&&staged.copy==='staged-0'&&['100644','100755'].includes(staged.mode)&&typeof staged.object==='string'&&new RegExp(`^[a-f0-9]{${length}}$`).test(staged.object)&&hash(staged.hash)))&&
    value.file?.copy==='file-0'&&hash(value.file.hash)&&Number.isInteger(value.file.mode);
}
async function inspectUnbornRemovalMetadata(root,name,manifest) {
  const context=await discardContext(root,name),folder=context.folder;
  if(!validUnbornRemovalManifest(manifest)){await context.unchanged();return {folder,status:'Invalid unborn removal manifest; preserve this folder for manual inspection.',invalidManifest:true,operation:'added-removal',files:[],staged:[],moved:[]};}
  let moved=[],status;
  try {const entries=JSON.parse((await read(path.join(folder,'removed-files.json'),1024*1024)).toString('utf8'));if(!Array.isArray(entries)||entries.length!==1||entries[0]?.name!==manifest.name||entries[0]?.copy!=='removed-0')throw Error();moved=[{index:0,name:manifest.name}];status='A move list exists; it does not establish which steps completed.';}
  catch(error){status=error.code==='ENOENT'?'No move list found; application may not have started.':'Move list is incomplete or unsafe; preserve this folder for manual inspection.';}
  await context.unchanged();return {folder,status,operation:'added-removal',indexHash:manifest.index.present?manifest.index.hash:undefined,indexAbsent:!manifest.index.present,
    files:[{index:0,name:manifest.name,kind:'added',hasBackup:true,backupHash:manifest.file.hash}],staged:manifest.staged?[{index:0,name:manifest.name,backupHash:manifest.staged.hash,object:manifest.staged.object}]:[],moved};
}
// Keep metadata inspection separate: completion validation uses these bounded
// labels and must never recurse through the public completion-aware inspector.
async function inspectDiscardRecoveryMetadata(root,name) {
  const {folder,unchanged}=await discardContext(root,name);let manifest;
  try {manifest=JSON.parse((await read(path.join(folder,'manifest.json'),1024*1024)).toString('utf8'));}
  catch {await unchanged();return {folder,status:'Incomplete or unsafe manifest; preserve this folder for manual inspection.',files:[],staged:[],moved:[]};}
  if(manifest?.schema===6)return inspectUnbornRemovalMetadata(root,name,manifest);
  if(manifest?.schema===7){
    if(!unbornDiscardRecovery.validManifest(manifest,safeProjectPath,validUnbornRemovalManifest)){await unchanged();return {folder,status:'Invalid unborn discard manifest; preserve this folder for manual inspection.',invalidManifest:true,operation:'unborn-discard',files:[],staged:[],moved:[]};}
    let moved=[];try{const rows=JSON.parse((await read(path.join(folder,'removed-files.json'),1024*1024)).toString('utf8')),expected=manifest.files.flatMap((file,i)=>file.missing?[]:[{name:file.name,copy:`removed-${i}`}]);if(JSON.stringify(rows)!==JSON.stringify(expected))throw Error();moved=rows.map((entry,index)=>({index,name:entry.name,copyNumber:Number(entry.copy.slice(8))}));}catch{}
    await unchanged();return {folder,status:'Inspect the project and retained copies.',operation:'unborn-discard',indexHash:manifest.index.present?manifest.index.hash:undefined,indexAbsent:!manifest.index.present,files:manifest.files.map((file,index)=>({index,name:file.name,kind:'added',hasBackup:!file.missing,backupHash:file.hash,copyNumber:index})),staged:manifest.staged.map((file,index)=>({index,name:file.name,backupHash:file.hash,object:file.object,copyNumber:Number(file.copy.slice(7))})),moved};
  }
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const names=new Set();let copies=0;
  const valid=manifest && !Array.isArray(manifest) && manifest.schema===1 && oid(manifest.revision) && hash(manifest.head) && hash(manifest.index) && Array.isArray(manifest.files) && manifest.files.length<=1000 && manifest.files.every(file=>{
    if(!file||!safeProjectPath(file.name)||names.has(file.name)||!['added','deleted','modified'].includes(file.kind))return false;
    names.add(file.name);
    return file.missing===true ? file.copy===undefined : file.copy===`file-${copies++}`&&hash(file.hash)&&Number.isInteger(file.mode);
  }) && Array.isArray(manifest.staged) && manifest.staged.length<=1000 && manifest.staged.every((entry,i)=>entry && names.has(entry.name) && entry.copy===`staged-${i}` && ['100644','100755'].includes(entry.mode) && oid(entry.object) && hash(entry.hash));
  if(!valid){await unchanged();return {folder,status:'Invalid manifest; preserve this folder for manual inspection.',files:[],staged:[],moved:[]};}
  let moved=[],moveStatus;
  try {
    const entries=JSON.parse((await read(path.join(folder,'removed-files.json'),1024*1024)).toString('utf8'));
    const seen=new Set();
    if(!Array.isArray(entries)||entries.length>manifest.files.length||entries.some((entry,i)=>!entry||!names.has(entry.name)||seen.has(entry.name)||entry.copy!==`removed-${i}`||(seen.add(entry.name),false)))throw Error();
    moved=entries.map((entry,index)=>({index,name:entry.name}));
    moveStatus='A move list exists; it does not establish which steps completed.';
  } catch(error) {moveStatus=error.code==='ENOENT'?'No move list found; application may not have started.':'Move list is incomplete or unsafe; preserve this folder for manual inspection.';}
  await unchanged();
  const stashBackup=manifest.kind==='stash-discard-backup';
  const status=stashBackup?'Exact working copies saved before discard. Check the local Git stash for staged versions.':moveStatus;
  return {folder,status,...(stashBackup?{operation:'stash-discard'}:{}),revision:manifest.revision,indexHash:manifest.index,
    files:manifest.files.map((file,index)=>({index,name:file.name,kind:file.kind,hasBackup:!file.missing,backupHash:file.hash})),
    staged:manifest.staged.map((entry,index)=>({index,name:entry.name,backupHash:entry.hash,object:entry.object})),moved};
}
// A completion receipt is self-recorded evidence, not authentication against
// a writer who can forge every Git object and recovery file. Old folders have
// no receipt and remain ambiguous. No retained path from JSON is opened.
async function validatedCompletedDiscard(root,name) {
  if(!discardName(name))return false;
  const MAX_FILES=1000,MAX_BYTES=64*1024*1024,digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  try {
    const {folder,unchanged}=await discardContext(root,name);
    const inspection=await inspectDiscardRecoveryMetadata(root,name);if(!inspection.indexHash)return false;
    const readCopy=(name,max)=>read(path.join(folder,name),max);
    const snapshotCopy=async(name,budget)=>{
      // Reject the aggregate before allocating the next retained copy.
      const bytes=await readCopy(name,MAX_BYTES-budget.bytes);budget.bytes+=bytes.length;
      return {hash:digest(bytes)};
    };
    const markerBytes=await readCopy('complete.json',1024*1024),seal=(await readCopy('complete.sha256',128)).toString('utf8'),complete=JSON.parse(markerBytes.toString('utf8'));
    if(seal!==digest(markerBytes)+'\n')return false;
    const manifestBytes=await readCopy('manifest.json',1024*1024),manifest=JSON.parse(manifestBytes.toString('utf8'));
    const movesBytes=await readCopy('removed-files.json',1024*1024),moves=JSON.parse(movesBytes.toString('utf8'));
    if(!complete||complete.schema!==1||complete.kind!=='discard-complete'||!oid(complete.revision)||!hash(complete.head)||!hash(complete.manifestHash)||!hash(complete.movesHash)||!hash(complete.originalIndexHash)||!hash(complete.resultIndexHash)||!Array.isArray(complete.files)||complete.files.length>MAX_FILES||
       complete.revision!==manifest.revision||complete.head!==manifest.head||complete.originalIndexHash!==manifest.index||complete.manifestHash!==digest(manifestBytes)||complete.movesHash!==digest(movesBytes)||inspection.indexHash!==manifest.index||!Array.isArray(moves)||moves.length!==inspection.moved.length)return false;
    if(digest(await readCopy('index',4*1024*1024))!==manifest.index||digest(await readCopy('moved-index',4*1024*1024))!==manifest.index||digest(await readCopy('completed-index',4*1024*1024))!==complete.resultIndexHash)return false;
    let budget={bytes:0};
    for(const entry of manifest.files)if(!entry.missing){if(!/^file-\d+$/.test(entry.copy||''))return false;const info=await snapshotCopy(entry.copy,budget);if(!info||info.hash!==entry.hash)return false;}
    budget={bytes:0};for(const entry of manifest.staged){if(!/^staged-\d+$/.test(entry.copy||''))return false;const info=await snapshotCopy(entry.copy,budget);if(!info||info.hash!==entry.hash)return false;}
    budget={bytes:0};for(const move of moves){if(!/^removed-\d+$/.test(move.copy||''))return false;const expected=manifest.files.find(file=>file.name===move.name);const info=await snapshotCopy(move.copy,budget);if(!expected||expected.missing||!info||info.hash!==expected.hash)return false;}
    const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:require('node:os').devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
    const exec=require('node:util').promisify(require('node:child_process').execFile);
    const rows=(await exec('git',['ls-tree','-r','-z',complete.revision],{cwd:root,env,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024})).stdout.split('\0').filter(Boolean);
    const headNames=new Set(rows.map(row=>{const match=/^(?:100644|100755) blob [a-f0-9]{40,64}\t([^\0]+)$/.exec(row);return match?.[1];}).filter(Boolean));
    const expected=manifest.files.filter(file=>headNames.has(file.name)).map(file=>file.name).sort();
    const actual=complete.files.map(file=>file?.name).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected)||complete.files.some(file=>!file||!hash(file.hash)||!Number.isSafeInteger(file.size)||file.size<0)||complete.files.reduce((n,file)=>n+file.size,0)>MAX_BYTES)return false;
    await unchanged();return true;
  } catch {return false;}
}
// A file restore is a different operation from discarding the complete
// project. Its receipt can never authorize the full-discard classification.
async function validatedCompletedFileRestore(root,name) {
  if(!fileRestoreName(name))return false;
  const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  try {
    const {folder,unchanged}=await discardContext(root,name);
    const firstManifest=await read(path.join(folder,'manifest.json'),1024*1024),first=JSON.parse(firstManifest.toString('utf8'));
    if(first?.schema===6){const valid=await validateUnbornRemoval(root,folder,firstManifest,first,validUnbornRemovalManifest);await unchanged();return valid;}
    if(first?.schema===7){const valid=await unbornDiscardRecovery.validate(root,folder,firstManifest,first,safeProjectPath,validUnbornRemovalManifest);await unchanged();return valid;}
    const inspection=await inspectDiscardRecoveryMetadata(root,name);
    if(!inspection.indexHash)return false;
    const copy=(name,max)=>read(path.join(folder,name),max);
    const marker=await copy('complete.json',1024*1024),complete=JSON.parse(marker.toString('utf8'));
    if((await copy('complete.sha256',128)).toString('utf8')!==digest(marker)+'\n')return false;
    const manifestBytes=await copy('manifest.json',1024*1024),manifest=JSON.parse(manifestBytes.toString('utf8'));
    const movesBytes=await copy('removed-files.json',1024*1024),moves=JSON.parse(movesBytes.toString('utf8'));
    const selection=complete?.selection;
    const added=complete?.schema===5,committed=complete?.schema===4,modified=complete?.schema===3||committed||added;
    if(![1,2,3,4,5].includes(complete?.schema)||complete.kind!==(added?'added-file-removal-complete':committed?'committed-file-restore-complete':modified?'modified-file-restore-complete':'file-restore-complete')||!selection||!safeProjectPath(selection.name)||!(added?['untracked','index']:['head','index']).includes(selection.source)||
       complete.revision!==manifest.revision||complete.head!==manifest.head||complete.manifestHash!==digest(manifestBytes)||complete.movesHash!==digest(movesBytes)||
       complete.originalIndexHash!==manifest.index||!hash(complete.resultIndexHash)||!Array.isArray(moves)||(modified?(moves.length!==1||moves[0]?.name!==selection.name||moves[0]?.copy!=='removed-0'):(moves.length!==0))||
       !Array.isArray(complete.files)||(added?complete.files.length!==0:complete.files.length!==1||complete.files[0]?.name!==selection.name||!hash(complete.files[0].hash)||!Number.isSafeInteger(complete.files[0].size)||complete.files[0].size<0||complete.files[0].size>64*1024*1024||(modified&&!Number.isInteger(complete.files[0].mode)))||
       manifest.files.filter(file=>file.name===selection.name&&(modified?((added?file.kind==='added':['modified','added'].includes(file.kind))&&file.missing!==true&&typeof file.copy==='string'):(file.kind==='deleted'&&file.missing===true))).length!==1||
       (added?(selection.type!=='added'||(selection.source==='untracked'?selection.status!=='??':!['A ','AM'].includes(selection.status))):modified&&(selection.source!==(committed?'head':'index')||selection.type!==(committed?'modified-committed':'modified')))||(!modified&&selection.type!==undefined))return false;
    if(complete.schema===1) {if(complete.journalHash!==undefined)return false;}
    else {
      if(!hash(complete.journalHash))return false;
      const bytes=await copy('file-restore-journal.jsonl',1024*1024);if(digest(bytes)!==complete.journalHash)return false;
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!text.endsWith('\n'))return false;
      const events=text.trimEnd().split('\n').map(line=>JSON.parse(line)),start=events[0],directories=start?.directories;
      if(start?.schema!==(added?5:committed?4:modified?3:2)||start.event!=='start'||JSON.stringify(start.selection)!==JSON.stringify(selection)||
         start.revision!==complete.revision||start.index!==manifest.index||start.manifestHash!==complete.manifestHash||!Array.isArray(directories)||(modified?directories.length!==0:!directories.length)||directories.length>127)return false;
      for(let i=0;i<directories.length;i++) {
        const dir=directories[i];if(!safeProjectPath(dir)||!selection.name.startsWith(dir+'/')||(i&&path.posix.dirname(dir)!==directories[i-1]))return false;
      }
      const expected=[];for(let i=0;i<directories.length;i++)expected.push({event:'mkdir-intent',index:i,name:directories[i]},{event:'mkdir-complete',index:i,name:directories[i]});
      if(modified)expected.push({event:'move-intent',name:selection.name},{event:'moved',name:selection.name});
      if(!added)expected.push({event:'install-intent',name:selection.name},{event:'installed',name:selection.name});
      if(selection.source==='head'||(added&&selection.source==='index'))expected.push({event:'index-intent'},{event:'index-installed'});
      expected.push({event:'complete'});
      if(JSON.stringify(events.slice(1))!==JSON.stringify(expected))return false;
    }
    const oldIndex=await copy('index',4*1024*1024),newIndex=await copy('completed-index',4*1024*1024);
    if(digest(oldIndex)!==manifest.index||digest(newIndex)!==complete.resultIndexHash)return false;
    if(selection.source==='untracked'||selection.source==='index'&&!added) {if(digest(oldIndex)!==digest(newIndex))return false;}
    else if(digest(await copy('moved-index',4*1024*1024))!==manifest.index)return false;
    for(const entries of [manifest.files.filter(file=>!file.missing),manifest.staged]) {
      let budget=0;
      for(const entry of entries) {
        if(!/^(?:file|staged)-\d+$/.test(entry.copy||''))return false;
        const bytes=await copy(entry.copy,64*1024*1024-budget);budget+=bytes.length;
        if(digest(bytes)!==entry.hash)return false;
      }
    }
    if(modified){const entry=manifest.files.find(file=>file.name===selection.name),moved=await copy('removed-0',64*1024*1024),info=await fs.lstat(path.join(folder,'removed-0'));if(digest(moved)!==entry.hash||info.mode!==entry.mode||!info.isFile()||info.isSymbolicLink()||info.nlink!==1)return false;}
    const exec=require('node:util').promisify(require('node:child_process').execFile);
    const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:require('node:os').devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
    const rows=async filename=>{
      const bytes=(await exec('git',['-c','core.fsmonitor=false','ls-files','--stage','-z'],{cwd:root,env:{...env,GIT_INDEX_FILE:path.join(folder,filename)},encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout;
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text&&!text.endsWith('\0'))throw Error();
      const result=new Map();for(const row of text.split('\0').filter(Boolean)){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||result.has(match[3]))throw Error();result.set(match[3],`${match[1]} ${match[2]}`);}return result;
    };
    const before=await rows('index'),after=await rows('completed-index');
    if(added) {
      const staged=manifest.staged.filter(entry=>entry.name===selection.name);
      if(after.has(selection.name))return false;
      if(selection.source==='untracked'){if(before.has(selection.name)||staged.length!==0)return false;}
      else {
        if(!before.has(selection.name)||staged.length!==1||before.get(selection.name)!==`${staged[0].mode} ${staged[0].object}`)return false;
        const flags=async filename=>parseIndexFlags((await exec('git',['-c','core.fsmonitor=false','ls-files','--debug','-z'],{cwd:root,env:{...env,GIT_INDEX_FILE:path.join(folder,filename)},encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout);
        const originalFlags=await flags('index'),resultFlags=await flags('completed-index');
        if(originalFlags.size!==before.size||resultFlags.size!==after.size||originalFlags.get(selection.name)!=='0'||resultFlags.has(selection.name))return false;
        for(const [name,value]of originalFlags)if(name!==selection.name&&resultFlags.get(name)!==value)return false;
        before.delete(selection.name);
      }
      if(JSON.stringify([...before])!==JSON.stringify([...after]))return false;
      const tree=(await exec('git',['ls-tree','-r','--name-only','-z',complete.revision],{cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout;
      if(new TextDecoder('utf-8',{fatal:true}).decode(tree).split('\0').includes(selection.name))return false;
    } else if(selection.source==='index') {if(!before.has(selection.name))return false;if(modified){const staged=manifest.staged.filter(entry=>entry.name===selection.name);if(staged.length!==1||before.get(selection.name)!==`${staged[0].mode} ${staged[0].object}`)return false;}}
    else {
      if((committed?!before.has(selection.name):before.has(selection.name))||!after.has(selection.name))return false;
      const tree=(await exec('git',['ls-tree','-r','-z',complete.revision],{cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout;
      const entries=new TextDecoder('utf-8',{fatal:true}).decode(tree).split('\0').filter(Boolean);
      const found=entries.map(row=>/^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)$/.exec(row)).filter(match=>match&&match[3]===selection.name);
      if(found.length!==1||after.get(selection.name)!==`${found[0][1]} ${found[0][2]}`)return false;
      if(committed) {
        const staged=manifest.staged.filter(entry=>entry.name===selection.name);
        if(staged.length!==1||before.get(selection.name)!==`${staged[0].mode} ${staged[0].object}`||before.get(selection.name)===after.get(selection.name))return false;
        const flags=async filename=>parseIndexFlags((await exec('git',['-c','core.fsmonitor=false','ls-files','--debug','-z'],{cwd:root,env:{...env,GIT_INDEX_FILE:path.join(folder,filename)},encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout);
        const originalFlags=await flags('index'),resultFlags=await flags('completed-index');
        if(originalFlags.size!==before.size||resultFlags.size!==after.size||originalFlags.get(selection.name)!=='0'||resultFlags.get(selection.name)!=='0')return false;
        for(const [name,value]of originalFlags)if(name!==selection.name&&resultFlags.get(name)!==value)return false;
        before.delete(selection.name);
      }
      after.delete(selection.name);
      if(JSON.stringify([...before])!==JSON.stringify([...after]))return false;
    }
    await unchanged();return true;
  } catch {return false;}
}
// Guard later mutations against an interrupted file restoration. The sole
// exception is the caller's own verified, still-active recovery directory.
async function assertNoUnresolvedFileRestoreOnly(root,{own}={}) {
  const base=await anchors(root),entries=await fs.readdir(base.git,{withFileTypes:true});
  const matches=entries.filter(entry=>entry.name.startsWith('zero-file-restore-recovery-'));
  if(matches.length>500)throw new Error('Too many file restoration recovery folders to inspect safely.');
  let bytes=0,files=0,ownSeen=false;
  for(const entry of matches) {
    const folder=path.join(base.git,entry.name);
    const fail=()=>{const error=new Error(`A file restoration or initial project discard needs inspection before continuing. Use Inspect recovery copies → File restoration and initial project discard to inspect ${folder}, then inspect the project and Source Control. After resolving any incomplete changes, move the entire recovery folder to a safe location outside this project before retrying. Keep the folder and its contents; moving it does not repair the project or prove the operation completed.`);error.recoveryPath=folder;return error;};
    if(!fileRestoreName(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())throw fail();
    try {
      const identity=await directory(folder);
      if(own&&own.name===entry.name) {
        if(identity.dev!==own.dev||identity.ino!==own.ino)throw fail();
        ownSeen=true;continue;
      }
      const stream=await fs.opendir(folder);
      for await(const child of stream) {
        if(++files>10000)throw fail();
        const info=await fs.lstat(path.join(folder,child.name));
        if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))throw fail();
        if(info.isFile()){bytes+=info.size;if(bytes>256*1024*1024)throw fail();}
      }
      if(!await validatedCompletedFileRestore(root,entry.name)&&!await require('./added-removal-completion').validatedCompletedUntrackedRemoval(root,entry.name)&&!await require('./added-removal-staged-completion').validatedCompletedStagedRemoval(root,entry.name))throw fail();
      if(!same(identity,await directory(folder)))throw fail();
    } catch(error) {if(error.recoveryPath)throw error;throw fail();}
  }
  if(own&&!ownSeen){const error=new Error('The active file restoration recovery folder changed. Inspect the project and recovery copy.');error.recoveryPath=path.join(base.git,own.name);throw error;}
  if(!same(base.gitStat,await directory(base.git)))throw new Error('Recovery folder changed. Review the project again.');
}
async function assertNoUnresolvedFileRestore(root,options={}) {
  // A file-restore exemption is never authority to bypass switch evidence.
  await assertNoUnresolvedSwitch(root);
  return assertNoUnresolvedFileRestoreOnly(root,options);
}
async function listFileRestoreRecoveries(root) {
  const base=await anchors(root),entries=await fs.readdir(base.git,{withFileTypes:true});
  const unsafe=entries.find(entry=>entry.name.startsWith('zero-file-restore-recovery-')&&(!entry.isDirectory()||entry.isSymbolicLink()||!fileRestoreName(entry.name)));
  if(unsafe)throw new Error(`Unsafe file restoration recovery entry needs inspection: ${path.join(base.git,unsafe.name)}`);
  const names=entries.filter(entry=>entry.isDirectory()&&fileRestoreName(entry.name)).map(entry=>entry.name).sort();
  if(names.length>500)throw new Error('Too many file restoration recovery folders to inspect safely.');
  if(!same(base.gitStat,await directory(base.git)))throw new Error('Recovery folder changed.');
  return names;
}
async function inspectFileRestoreRecovery(root,name) {
  if(!fileRestoreName(name))throw new Error('Invalid file restoration recovery folder.');
  const info=await inspectDiscardRecoveryMetadata(root,name),context=await discardContext(root,name);
  const marker=async filename=>{try {await fs.lstat(path.join(context.folder,filename));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
  const hasSeal=await marker('complete.sha256'),complete=await validatedCompletedFileRestore(root,name);
  const removed=info.operation==='added-removal'||complete&&['added-file-removal-complete','unborn-added-file-removal-complete'].includes(JSON.parse((await read(path.join(context.folder,'complete.json'),1024*1024)).toString('utf8')).kind);
  await context.unchanged();
  return {...info,completion:complete?'complete':hasSeal||info.invalidManifest?'invalid':'incomplete',status:info.operation==='unborn-discard'?(complete?'Retained evidence records completed unborn project discard; current project files may have changed.':'Unborn project discard completion is not verified; inspect the project and retained copies.'):(complete?(removed?'Retained evidence records completed added-file removal; current project files may have changed.':'Retained evidence records completed file restoration; current project files may have changed.'):(removed?'Added-file removal completion is not verified; inspect the project and retained copies.':'File restoration completion is not verified; inspect the project and retained copies.'))};
}
async function inspectDiscardRecovery(root,name) {
  const info=await inspectDiscardRecoveryMetadata(root,name);
  if(info.operation==='stash-discard')return info;
  const context=await discardContext(root,name);
  const marker=async file=>{try {await fs.lstat(path.join(context.folder,file));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
  const hasMarker=await marker('complete.json'),hasSeal=await marker('complete.sha256');
  if(!info.indexHash) {
    await context.unchanged();
    return {...info,completion:hasSeal||!info.status.startsWith('Incomplete')?'invalid':'incomplete'};
  }
  let completion,status;
  if(await validatedCompletedDiscard(root,name)) {
    completion='complete';status='Retained evidence records completed discard; current project files may have changed. Inspect the project before making further changes.';
  } else if(hasSeal) {
    completion='invalid';status='Completion evidence is incomplete, changed or unsafe; preserve this folder and inspect the project and retained copies.';
  } else {
    completion='incomplete';status=`${hasMarker?'The completion receipt is unsealed. ':''}Discard completion is not verified; the operation may have stopped. Inspect the project and retained copies.`;
  }
  await context.unchanged();
  return {...info,completion,status:completion==='complete'?status:`${info.status} ${status}`};
}
async function readDiscardRecoveryCopy(root,name,kind,index) {
  if(!['file','moved','staged'].includes(kind)||!Number.isInteger(index)||index<0||index>=1000)throw new Error('Invalid recovery copy selection.');
  const context=await discardContext(root,name),info=await inspectDiscardRecoveryMetadata(root,name),entries=kind==='file'?info.files:kind==='staged'?info.staged:info.moved,entry=entries[index];
  await context.unchanged();
  if(!entry || (kind==='file'&&!entry.hasBackup))throw new Error('Recovery copy is not in the manifest.');
  // file copies omit missing entries; moved copies use their move-list ordinal.
  const number=info.operation==='unborn-discard'?entry.copyNumber:kind==='file'?info.files.slice(0,index).filter(file=>file.hasBackup).length:index;
  const filename=path.join(context.folder,`${kind==='moved'?'removed':kind}-${number}`);
  if(info.operation==='unborn-discard'||info.operation==='stash-discard') {
    const stat=await fs.lstat(filename);
    if(stat.size>limit) {
      const result=await hashLargeCopy(filename,64*1024*1024);await context.unchanged();
      return {filename,...result,content:undefined,matchesBackup:kind==='moved'?undefined:result.sha256===entry.backupHash};
    }
  }
  const bytes=await read(filename,limit);await context.unchanged();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');let content;
  try {if(bytes.includes(0))throw Error();content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
  return {filename,size:bytes.length,sha256,content,matchesBackup:kind==='moved'?undefined:sha256===entry.backupHash};
}
async function inspectDiscardRecoveryIndex(root,name,kind) {
  if(!['index','moved-index','prepared-index'].includes(kind))throw new Error('Invalid recovery index selection.');
  const context=await discardContext(root,name),info=await inspectDiscardRecoveryMetadata(root,name);if(!info.indexHash)throw new Error('Recovery manifest is incomplete or unsafe.');
  await context.unchanged();const filename=path.join(context.folder,kind),bytes=await read(filename,4*1024*1024);await context.unchanged();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {filename,size:bytes.length,sha256,matchesBackup:kind==='prepared-index'?undefined:sha256===info.indexHash};
}
// Undo records are metadata only. A missing completion receipt cannot tell us
// whether the branch update occurred, including when the process stopped after it.
const undoName = name => typeof name==='string' && /^zero-commit-undo-[A-Za-z0-9]+$/.test(name);
const undoBranch = value => typeof value==='string' && value.length<=1024 && /^refs\/heads\/.+/.test(value) &&
  !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) && !value.includes('..') && !value.includes('@{') &&
  !value.endsWith('.') && value.split('/').every(part=>part && !part.startsWith('.') && !part.endsWith('.lock'));
async function listCommitUndos(root) {
  const base=await anchors(root),entries=await fs.readdir(base.git,{withFileTypes:true});
  const names=entries.filter(entry=>entry.isDirectory()&&undoName(entry.name)).map(entry=>entry.name).sort();
  if(names.length>500)throw new Error('Too many recovery folders to list safely. Inspect the Git folder yourself.');
  if(!same(base.gitStat,await directory(base.git)))throw new Error('Recovery folder changed.');
  return names;
}
async function undoRefObservations(root,gitDir,ref,branch) {
  const {execFile}=require('node:child_process'),{promisify}=require('node:util');
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:require('node:os').devNull,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'};
  const run=async args=>(await promisify(execFile)('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd:root,env,timeout:10000,maxBuffer:1024*1024,encoding:'utf8'})).stdout.trim();
  try {
    const top=await run(['rev-parse','--show-toplevel']),dir=await run(['rev-parse','--git-dir']),common=await run(['rev-parse','--git-common-dir']);
    if(await fs.realpath(top)!==root || await fs.realpath(path.resolve(root,dir))!==gitDir || await fs.realpath(path.resolve(root,common))!==gitDir)throw Error();
    const rows=(await run(['for-each-ref','--format=%(refname)%00%(objectname)%00%(symref)',ref,branch])).split('\n').filter(Boolean);
    const found={};for(const row of rows) {
      const fields=row.split('\0');if(fields.length!==3||!oid(fields[1]))throw Error();
      if(fields[0]===ref||fields[0]===branch)found[fields[0]]={object:fields[1],symbolic:!!fields[2]};
    }
    return {recoveryRef:found[ref]||null,branchRef:found[branch]||null};
  } catch {return null;}
}
async function inspectCommitUndo(root,name) {
  if(!undoName(name))throw new Error('Invalid recovery folder name.');
  const a=await anchors(root,name),folder=path.join(a.git,name);
  const unchanged=async()=>{if(!same(a.gitStat,await directory(a.git))||!same(a.folderStat,await directory(folder)))throw new Error('Recovery folder changed.');};
  const invalid=async status=>{await unchanged();return {folder,status};};
  let intent;
  try {intent=JSON.parse((await read(path.join(folder,'intent.json'),16384)).toString('utf8'));}
  catch {return invalid('Undo intent is missing or unsafe; preserve this folder for manual inspection.');}
  if(!intent||Array.isArray(intent)||intent.schema!==1||intent.root!==root||intent.mode!=='rewrite'||!undoBranch(intent.branch)||!oid(intent.head)||!oid(intent.parent)||intent.head.length!==intent.parent.length||!/^refs\/zero\/commit-undo\/[a-f0-9]{32}$/.test(intent.ref))
    return invalid('Undo intent is invalid; preserve this folder for manual inspection.');
  const get=async file=>{try{return {value:JSON.parse((await read(path.join(folder,file),16384)).toString('utf8'))};}catch(error){return error.code==='ENOENT'?{missing:true}:{invalid:true};}};
  const prepared=await get('prepared.json'),complete=await get('complete.json');
  const validRecord=value=>value&&!Array.isArray(value)&&value.schema===1&&value.mode==='rewrite'&&value.branch===intent.branch&&value.head===intent.head&&value.ref===intent.ref&&value.target===intent.parent;
  if(prepared.invalid||complete.invalid||(!prepared.missing&&(!validRecord(prepared.value)||prepared.value.parent!==intent.parent))||(!complete.missing&&!validRecord(complete.value))||(prepared.missing&&!complete.missing))
    return invalid('Undo records are inconsistent or unsafe; preserve this folder for manual inspection.');
  const observations=await undoRefObservations(root,a.git,intent.ref,intent.branch);await unchanged();
  const stage=complete.missing?(prepared.missing?'intent':'prepared'):'complete';
  const status=stage==='complete'?'A completion receipt was recorded; current repository state may have changed. Inspect it before proceeding.':'Undo completion is not recorded; the branch may or may not have moved. Inspect the repository and retained ref.';
  return {folder,status,stage,branch:intent.branch,head:intent.head,parent:intent.parent,ref:intent.ref,observations};
}
module.exports = {validatedCompletedDiscard,validatedCompletedFileRestore,assertNoUnresolvedFileRestore,assertNoUnresolvedFileRestoreOnly,listFileRestoreRecoveries,inspectFileRestoreRecovery,listInverseRecoveries,inspectInverseRecovery,listCommitUndos,inspectCommitUndo,listDiscardRecoveries,inspectDiscardRecovery,readDiscardRecoveryCopy,inspectDiscardRecoveryIndex,list,inspect,listProjectRestores,inspectProjectRestore,readProjectRestoreCopy,inspectProjectRestoreIndex,listCancelRecoveries,inspectCancelRecovery,readCancelRecoveryCopy,inspectCancelRecoveryMetadata};
