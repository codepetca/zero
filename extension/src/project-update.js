'use strict';
// Explicit file update only. The caller owns trust, editor buffers and build locks.
// An older project's record is an ownership baseline, NOT historical authentication.
const fs=require('node:fs/promises'),path=require('node:path');
const {constants}=require('node:fs');
const core=require('./core-contract'),format=require('./project-builder-format');
const {ordinary,readTree}=require('./retained-web-export');
const {readSavedBuilder,browserToolingUpdateRequired,_test:{digest}}=require('./project-builder');
const builderUpgrade=require('./project-builder-upgrade');
const PREFIX='src/main/java/zero/';
const hash=format.sha256,MAX_FILES=512,MAX_BYTES=32*1024*1024;
const fail=message=>{throw Error('Project update unavailable: '+message);};
const location=(root,name)=>path.join(root,...name.split('/'));
const shape=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
async function rootPath(root){
 if(typeof root!=='string'||!path.isAbsolute(root))fail('choose an absolute project folder.');
 await ordinary(root,{directory:true});const actual=await fs.realpath(root);
 if(actual!==path.resolve(root))fail('symbolic project paths are not supported.');return actual;
}
async function readFile(root,name,maxBytes=1024*1024){
 const filename=location(root,name),stat=await ordinary(filename,{maxBytes});
 const bytes=await fs.readFile(filename);if(bytes.length>maxBytes)fail('file exceeds its size bound: '+name);
 return {path:name,bytes,mode:stat.mode&0o777};
}
function validateBaseline(record,files){
 if(!shape(record,['schema','coordinate','javaRelease','javafxVersion','sources','sourceSha256'])||record.schema!==1||
 !shape(record.coordinate,['groupId','artifactId','version'])||record.coordinate.groupId!=='school.zero'||record.coordinate.artifactId!=='zero-core'||
 typeof record.coordinate.version!=='string'||!/^\d+\.\d+\.\d+$/.test(record.coordinate.version)||typeof record.javaRelease!=='string'||!/^\d{1,2}$/.test(record.javaRelease)||typeof record.javafxVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(record.javafxVersion)||
 !Array.isArray(record.sources)||!record.sources.length||record.sources.length>128)fail('invalid zero-core.json baseline.');
 let previous='';const folded=new Set();
 for(const entry of record.sources){
  if(!shape(entry,['path','sha256'])||typeof entry.path!=='string'||!entry.path.startsWith(PREFIX)||!entry.path.endsWith('.java')||!format.relativePath(entry.path)||entry.path<=previous||! /^[a-f0-9]{64}$/.test(entry.sha256)||folded.has(entry.path.toLowerCase()))fail('unsafe or invalid framework inventory.');
  previous=entry.path;folded.add(entry.path.toLowerCase());
 }
 if(record.sourceSha256!==hash(Buffer.from(JSON.stringify(record.sources))))fail('framework inventory digest differs.');
 if(files.length!==record.sources.length)fail('framework has missing or extra files. Preserve customized files before updating.');
 const actual=new Map(files.map(file=>[file.path,file]));
 for(const entry of record.sources){const file=actual.get(entry.path);if(!file||hash(Buffer.from(core.normalizeSource(file.bytes)))!==entry.sha256)fail('framework differs from its recorded baseline: '+entry.path);}
 return record;
}
async function baseline(root){
 const recordFile=await readFile(root,'zero-core.json',65536);let record;
 try{record=JSON.parse(core.normalizeSource(recordFile.bytes));}catch{fail('invalid zero-core.json JSON/encoding.');}
 const tree=await readTree(location(root,PREFIX));
 if(tree.length>128||tree.reduce((n,file)=>n+file.bytes.length,0)>16*1024*1024)fail('framework exceeds resource bounds.');
 const files=await Promise.all(tree.map(file=>readFile(root,PREFIX+file.path)));
 validateBaseline(record,files);
 const directories=new Set([PREFIX.slice(0,-1)]);
 for(const entry of record.sources){let parent=path.posix.dirname(entry.path);while(parent.startsWith(PREFIX)){directories.add(parent);parent=path.posix.dirname(parent);}}
 async function inspectDirectories(folder,name){for(const entry of await fs.readdir(folder,{withFileTypes:true}))if(entry.isDirectory()){const child=name+'/'+entry.name;if(!directories.has(child))fail('framework has an extra directory: '+child);await inspectDirectories(path.join(folder,entry.name),child);}}
 await inspectDirectories(location(root,PREFIX),PREFIX.slice(0,-1));
 return {record,files:[...files,recordFile]};
}
async function target(extensionPath){
 const projects=await require('./lesson-projects').loadBundle(extensionPath);
 const groups=projects.map(project=>project.files.filter(file=>file.path==='zero-core.json'||file.path.startsWith(PREFIX)||file.path.startsWith('.zero-build/')).map(file=>({path:file.path,bytes:Buffer.from(file.content),mode:0o644})));
 if(!groups.length||groups.some(files=>digest(files)!==digest(groups[0])))fail('installed framework/browser bundles disagree.');
 const files=groups[0],record=JSON.parse(files.find(file=>file.path==='zero-core.json').bytes);
 core.validateCoreRecord(record,Object.fromEntries(files.filter(file=>file.path.startsWith(PREFIX)).map(file=>[file.path,file.bytes])));
 return {files,record};
}
async function snapshot({projectRoot,extensionPath}){
 const root=await rootPath(projectRoot);
 // An interrupted transaction must be explicitly recovered before another update.
 const pending=(await listRecoveries({projectRoot:root})).find(item=>item.status==='incomplete');
 if(pending)fail('an incomplete update needs inspection. Recovery copies are kept at '+pending.recoveryPath+'. Back up your work and create a new Zero project.');
 const old=await baseline(root).catch(async error=>{
  if(error.code!=='ENOENT'||error.path!==location(root,'zero-core.json'))throw error;
  const builder=await builderUpgrade.planUpgrade({projectRoot:root,extensionPath});
  if(builder.changed)throw browserToolingUpdateRequired();
  fail('zero-core.json is missing. Restore the project’s saved core record from Git history or a backup.');
 });
 const next=await target(extensionPath),builder=await builderUpgrade.planUpgrade({projectRoot:root,extensionPath});
 const saved=builder.oldProfileHash?await readSavedBuilder(root):null;
 const oldFiles=[...old.files,...(saved?await Promise.all(saved.files.map(file=>readFile(root,'.zero-build/'+file.path,4*1024*1024))):[])];
 const coreChanged=JSON.stringify(old.record)!==JSON.stringify(next.record),builderChanged=builder.changed;
 const plan={projectRoot:root,extensionPath:path.resolve(extensionPath),changed:coreChanged||builderChanged,coreChanged,builderChanged,
 oldCore:old.record,newCore:next.record,oldProfileHash:builder.oldProfileHash,newProfileHash:builder.newProfileHash,
 oldFilesHash:digest(oldFiles),newFilesHash:digest(next.files)};
 return {plan,oldFiles,nextFiles:next.files};
}
async function planUpdate(options){return (await snapshot(options)).plan;}
async function listRecoveries({projectRoot}){
 const root=await rootPath(projectRoot),names=await fs.readdir(root),result=[];
 if(names.length>10000)fail('too many project root entries.');
 for(const name of names.filter(name=>/^\.zero-update-[A-Za-z0-9]+$/.test(name)).sort()){
  if(result.length>=64)fail('too many saved update transactions.');
  const recoveryPath=path.join(root,name);
  try{await readFile(recoveryPath,'journal.json',256*1024);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  // A failed marker write is an incomplete transaction, still discoverable by
  // the recovery picker. Unknown/truncated bytes never certify completion.
  let status='incomplete';try{const marker=await readFile(recoveryPath,'complete',64);const text=marker.bytes.toString('utf8');if(text==='complete\n')status='complete';else if(text==='recovered\n')status='recovered';}catch(error){if(error.code!=='ENOENT')throw error;}
  result.push({recoveryPath,status,label:status==='incomplete'?'Incomplete project update':status==='complete'?'Completed project update':'Recovered project update'});
 }
 return result;
}
async function writeNew(root,file){const dest=location(root,file.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.bytes,{flag:'wx',mode:file.mode});}
// copyFile(EXCL) never replaces a concurrent destination. Preserve the copy and
// refuse source drift before removing the original. Caller locks exclude editor
// writes; Node has no portable atomic compare-and-unlink against other processes.
async function moveExclusive(source,destination,expectedHash,maxBytes,{beforeRemove=async()=>{}}={}){
 const before=await ordinary(source,{maxBytes});await fs.mkdir(path.dirname(destination),{recursive:true});
 await fs.copyFile(source,destination,constants.COPYFILE_EXCL);
 await fs.chmod(destination,before.mode&0o777);
 await ordinary(destination,{maxBytes});if(hash(await fs.readFile(destination))!==expectedHash)fail('file changed while preserving it: '+source);
 await beforeRemove();
 const after=await ordinary(source,{maxBytes});
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||hash(await fs.readFile(source))!==expectedHash)fail('file changed while preserving it: '+source);
 await fs.unlink(source);
}
async function syncProgress(held,entry){
 const handle=await fs.open(path.join(held,'progress.json'),'wx',0o644);
 try{await handle.writeFile(JSON.stringify({schema:1,path:entry.path,oldHash:entry.oldHash,newHash:entry.newHash})+'\n');await handle.sync();}finally{await handle.close();}
}
async function recoveryProofs(recoveryPath,entries){
 const names=await fs.readdir(recoveryPath),expected=new Map(entries.map(entry=>[entry.path,entry])),proofs=new Set();
 if(names.length>MAX_FILES*8)fail('too many recovery entries.');
 for(const name of names.filter(name=>/^recovered-[A-Za-z0-9]+$/.test(name))){
  const held=path.join(recoveryPath,name);let progress;
  try{const file=await readFile(held,'progress.json',1024);try{progress=JSON.parse(file.bytes);}catch{continue;}}
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!shape(progress,['schema','path','oldHash','newHash'])||progress.schema!==1)continue;
  const entry=expected.get(progress.path);
  if(!entry||!entry.newHash||progress.oldHash!==entry.oldHash||progress.newHash!==entry.newHash)continue;
  const file=await readFile(held,'file',entry.newBytes);if(hash(file.bytes)===entry.newHash)proofs.add(entry.path);
 }
 return proofs;
}
async function removeUnusedCoreDirectories(root,entries,keepKind,removeKind){
 const keep=new Set(),remove=new Set();
 for(const entry of entries.filter(entry=>entry.path.startsWith(PREFIX)))for(const [kind,set]of [[keepKind,keep],[removeKind,remove]])if(entry[kind+'Hash']){
  let parent=path.posix.dirname(entry.path);while(parent.startsWith(PREFIX)){set.add(parent);parent=path.posix.dirname(parent);}
 }
 for(const name of [...remove].filter(name=>!keep.has(name)).sort((a,b)=>b.split('/').length-a.split('/').length)){
  try{await ordinary(location(root,name),{directory:true});await fs.rmdir(location(root,name));}
  catch(error){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(error.code))throw error;}
 }
}
async function sameFile(root,entry,kind){
 try{const file=await readFile(root,entry.path,kind==='old'?entry.oldBytes:entry.newBytes);return hash(file.bytes)===entry[kind+'Hash'];}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
}
async function applyUpdate(plan,{assertCurrent=async()=>{}}={}){
 await assertCurrent();const fresh=await snapshot(plan);
 if(JSON.stringify(fresh.plan)!==JSON.stringify(plan))fail('project or installed update changed; review again.');
 if(!plan.changed)return {...plan,recoveryPath:null,backupPath:null};
 throw new Error('Project update and recovery are temporarily unavailable. Your project and recovery copies are kept.');
 const old=new Map(fresh.oldFiles.map(file=>[file.path,file])),next=new Map(fresh.nextFiles.map(file=>[file.path,file]));
 const names=[...new Set([...old.keys(),...next.keys()])].sort();
 // Unchanged framework files retain their exact original bytes (including CRLF).
 const entries=names.filter(name=>name.startsWith('.zero-build/')?plan.builderChanged:plan.coreChanged).filter(name=>{
  const before=old.get(name),after=next.get(name);
  if(!before||!after)return true;
  if(before.bytes.equals(after.bytes))return false;
  return !name.startsWith(PREFIX)||core.normalizeSource(before.bytes)!==core.normalizeSource(after.bytes);
 }).map(name=>{
  const before=old.get(name),after=next.get(name);return {path:name,oldHash:before?hash(before.bytes):null,newHash:after?hash(after.bytes):null,oldBytes:before?.bytes.length||0,newBytes:after?.bytes.length||0,oldMode:before?.mode||0o644,newMode:after?.mode||0o644};
 });
 if(entries.length>MAX_FILES||[...old.values(),...next.values()].reduce((sum,file)=>sum+file.bytes.length,0)>MAX_BYTES)fail('update exceeds resource bounds.');
 await assertCurrent();const checked=await snapshot(plan);if(JSON.stringify(checked.plan)!==JSON.stringify(plan))fail('project changed; review again.');
 const recoveryPath=await fs.mkdtemp(path.join(plan.projectRoot,'.zero-update-'));
 try{
  await fs.writeFile(path.join(recoveryPath,'.gitignore'),'*\n',{flag:'wx'});
  for(const entry of entries){if(old.has(entry.path))await writeNew(path.join(recoveryPath,'before'),old.get(entry.path));if(next.has(entry.path))await writeNew(path.join(recoveryPath,'after'),next.get(entry.path));}
  const journal={schema:1,projectRoot:plan.projectRoot,entries};
  await fs.writeFile(path.join(recoveryPath,'journal.json'),JSON.stringify(journal,null,2)+'\n',{flag:'wx'});
  // Every source conflict is checked before the first mutation.
  for(const entry of entries){await assertCurrent();if(entry.oldHash){if(!await sameFile(plan.projectRoot,entry,'old'))fail('project changed: '+entry.path);}else {try{await fs.lstat(location(plan.projectRoot,entry.path));fail('new target already exists: '+entry.path);}catch(error){if(error.code!=='ENOENT')throw error;}}}
  for(const entry of entries){
   await assertCurrent();
   if(entry.oldHash){
    if(!await sameFile(plan.projectRoot,entry,'old'))fail('project changed: '+entry.path);
    const moved=location(path.join(recoveryPath,'moved'),entry.path);await moveExclusive(location(plan.projectRoot,entry.path),moved,entry.oldHash,entry.oldBytes);
    if(!await sameFile(path.join(recoveryPath,'moved'),entry,'old'))fail('file changed while moving: '+entry.path);
   }
   if(entry.newHash){
    await assertCurrent();await writeNew(plan.projectRoot,{...next.get(entry.path),bytes:(await readFile(path.join(recoveryPath,'after'),entry.path)).bytes});
    await writeNew(path.join(recoveryPath,'installed'),{path:entry.path,bytes:Buffer.from(entry.newHash),mode:0o644});
   }
  }
  await removeUnusedCoreDirectories(plan.projectRoot,entries,'new','old');
  await assertCurrent();
  const installed=await baseline(plan.projectRoot);if(JSON.stringify(installed.record)!==JSON.stringify(plan.newCore)||(await readSavedBuilder(plan.projectRoot)).profileHash!==plan.newProfileHash)fail('installed update differs from the reviewed update.');
  await fs.writeFile(path.join(recoveryPath,'complete'),'complete\n',{flag:'wx'});
  return {...plan,recoveryPath,backupPath:path.join(recoveryPath,'before')};
 }catch(error){error.recoveryPath=recoveryPath;error.message+=' Original files and update journal remain at '+recoveryPath+'. Use explicit project update recovery; do not delete changed files.';throw error;}
}
async function recoverUpdate({projectRoot,recoveryPath},{assertCurrent=async()=>{}}={}){
 throw new Error('Project update and recovery are temporarily unavailable. Your project and recovery copies are kept.');
 const root=await rootPath(projectRoot);
 if(typeof recoveryPath!=='string'||path.dirname(recoveryPath)!==root||!/^\.zero-update-[A-Za-z0-9]+$/.test(path.basename(recoveryPath)))fail('choose this project’s exact recovery folder.');
 const file=await readFile(recoveryPath,'journal.json',256*1024);let journal;
 try{journal=JSON.parse(file.bytes);}catch{fail('invalid recovery journal.');}
 if(!shape(journal,['schema','projectRoot','entries'])||journal.schema!==1||journal.projectRoot!==root||!Array.isArray(journal.entries)||!journal.entries.length||journal.entries.length>MAX_FILES)fail('invalid recovery journal.');
 const names=new Set();let total=0;
 for(const entry of journal.entries){
  if(!shape(entry,['path','oldHash','newHash','oldBytes','newBytes','oldMode','newMode'])||!format.relativePath(entry.path)||!(entry.path==='zero-core.json'||entry.path.startsWith(PREFIX)||entry.path.startsWith('.zero-build/'))||names.has(entry.path.toLowerCase()))fail('invalid recovery path.');
  names.add(entry.path.toLowerCase());
  for(const kind of ['old','new'])if(entry[kind+'Hash']!==null){if(!/^[a-f0-9]{64}$/.test(entry[kind+'Hash'])||!Number.isSafeInteger(entry[kind+'Bytes'])||entry[kind+'Bytes']<0||entry[kind+'Bytes']>4*1024*1024||!Number.isInteger(entry[kind+'Mode'])||entry[kind+'Mode']<0||entry[kind+'Mode']>0o777)fail('invalid recovery inventory.');total+=entry[kind+'Bytes'];}
 }
 if(total>MAX_BYTES)fail('recovery exceeds resource bounds.');
 let completion;try{completion=await readFile(recoveryPath,'complete',64);}catch(error){if(error.code!=='ENOENT')throw error;}
 const complete=completion&&['complete\n','recovered\n'].includes(completion.bytes.toString('utf8'));
 const proofs=await recoveryProofs(recoveryPath,journal.entries);
 const states=[];
 // Preflight the entire recovery before restoring any file.
 for(const entry of journal.entries){
  await assertCurrent();if(entry.oldHash&&!await sameFile(path.join(recoveryPath,'before'),entry,'old'))fail('backup changed: '+entry.path);
  let current;try{current=await readFile(root,entry.path,4*1024*1024);}catch(error){if(error.code!=='ENOENT')throw error;}
  const identity=current?hash(current.bytes):null;
  if(identity===entry.oldHash){states.push({entry,restore:false});continue;}
  if(identity!==entry.newHash){
   let installed=false;try{await readFile(path.join(recoveryPath,'installed'),entry.path,64);installed=true;}catch(error){if(error.code!=='ENOENT')throw error;}
   if(identity!==null||(!proofs.has(entry.path)&&(complete||installed||!entry.oldHash||!await sameFile(path.join(recoveryPath,'moved'),entry,'old'))))fail('recovery would overwrite changed work: '+entry.path);
  }
  states.push({entry,restore:true,current});
 }
 // Preserve even an incomplete marker before removing it. From this point an
 // interrupted recovery remains discoverable as incomplete until the final wx.
 await assertCurrent();
 if(completion){const held=await fs.mkdtemp(path.join(recoveryPath,'marker-'));await moveExclusive(path.join(recoveryPath,'complete'),path.join(held,'file'),hash(completion.bytes),64);}
 for(const {entry,restore,current}of states){if(!restore)continue;await assertCurrent();
  if(current){
   if(!await sameFile(root,entry,'new'))fail('project changed during recovery: '+entry.path);
   const held=await fs.mkdtemp(path.join(recoveryPath,'recovered-'));
   await moveExclusive(location(root,entry.path),path.join(held,'file'),entry.newHash,entry.newBytes,{beforeRemove:()=>syncProgress(held,entry)});
   const moved=await readFile(held,'file',4*1024*1024);
   if(hash(moved.bytes)!==entry.newHash)fail('file changed during recovery; preserved at '+held);
  }
  if(entry.oldHash){const before=await readFile(path.join(recoveryPath,'before'),entry.path);await writeNew(root,{...before,mode:entry.oldMode});}
 }
 await removeUnusedCoreDirectories(root,journal.entries,'old','new');
 // Missing builders should be missing again, rather than an invalid empty folder.
 if(!journal.entries.some(entry=>entry.path.startsWith('.zero-build/')&&entry.oldHash)){
  const dirs=new Set();for(const entry of journal.entries.filter(entry=>entry.path.startsWith('.zero-build/'))){let parent=path.posix.dirname(entry.path);while(parent!=='.'){dirs.add(parent);parent=path.posix.dirname(parent);}}
  for(const name of [...dirs].sort((a,b)=>b.split('/').length-a.split('/').length))try{await fs.rmdir(location(root,name));}catch(error){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(error.code))throw error;}
 }
 await fs.writeFile(path.join(recoveryPath,'complete'),'recovered\n',{flag:'wx'});
 return {projectRoot:root,recoveryPath,recovered:true};
}
module.exports={planUpdate,applyUpdate,recoverUpdate,listRecoveries};
