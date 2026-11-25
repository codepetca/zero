'use strict';
// Explicit, data-only replacement of a project's complete saved browser builder.
// The caller owns workspace trust, user review, editor-buffer and build locks.
const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');
const {readSavedBuilder,_test:{digest}}=require('./project-builder');
const {ordinary}=require('./retained-web-export');
const format=require('./project-builder-format');
const BUNDLED_BUILDER_PATH='media/project-builder.json';
const MAX_BUNDLE_BYTES=Math.ceil(format.LIMITS.totalBytes*4/3)+(format.LIMITS.files+1)*1024;

async function rootPath(root) {
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Choose an absolute project folder.');
 await ordinary(root,{directory:true});
 const actual=await fs.realpath(root);
 if(actual!==path.resolve(root))throw Error('Choose an ordinary project folder without symbolic links.');
 return actual;
}
async function loadBundledBuilder(extensionPath) {
 try {
  const filename=path.join(await fs.realpath(extensionPath),BUNDLED_BUILDER_PATH);
  await ordinary(filename,{maxBytes:MAX_BUNDLE_BYTES});
  const raw=await fs.readFile(filename);
  if(raw.length>MAX_BUNDLE_BYTES)throw Error('The bundle exceeds its size limit.');
  const entries=JSON.parse(raw);
  if(!Array.isArray(entries)||entries.length>format.LIMITS.files+1)throw Error('The bundle has an invalid file inventory.');
  const names=new Set();let size=0;
  const files=entries.map(entry=>{
   if(!entry||Object.keys(entry).length!==2||!format.relativePath(entry.path)||typeof entry.content!=='string'||names.has(entry.path.toLowerCase()))throw Error('The bundle has an invalid file entry.');
   const bytes=Buffer.from(entry.content,'base64'),maximum=entry.path==='builder.json'?format.LIMITS.manifestBytes:format.LIMITS.fileBytes;
   size+=bytes.length;
   if(bytes.toString('base64')!==entry.content||bytes.length>maximum||size>format.LIMITS.totalBytes)throw Error('The bundle contains invalid or oversized file data.');
   names.add(entry.path.toLowerCase());
   return {path:entry.path,bytes};
  });
  const metadata=files.find(file=>file.path==='builder.json');
  if(!metadata)throw Error('The bundle has no builder manifest.');
  const manifest=format.validateBuilderFiles(JSON.parse(metadata.bytes),files.filter(file=>file!==metadata));
  format.validateRuntimeLock(JSON.parse(files.find(file=>file.path==='runtime-lock.json').bytes));
  return {files,profileHash:digest(files),closureSha256:manifest.closureSha256};
 } catch(error){throw Error('The installed Zero browser tools are missing or damaged. Reinstall Zero. '+error.message);}
}
// Remove only our unchanged staging files, and never recursively delete a tree.
// Unknown entries or cleanup errors leave the remainder for manual inspection.
async function cleanupStage(stage,files) {
 const expected=new Map([['.gitignore',Buffer.from('*\n')],...files.map(file=>['.zero-build/'+file.path,file.bytes])]);
 const dirs=new Set(['.zero-build']);
 for(const name of expected.keys()) {
  let parent=path.posix.dirname(name);
  while(parent!=='.'){dirs.add(parent);parent=path.posix.dirname(parent);}
 }
 async function verifyFile(name) {
  const file=path.join(stage,...name.split('/'));
  await ordinary(file,{maxBytes:expected.get(name).length});
  if(!(await fs.readFile(file)).equals(expected.get(name)))throw Error('staged file changed: '+name);
 }
 async function inspect(folder,prefix='') {
  await ordinary(folder,{directory:true});
  for(const item of await fs.readdir(folder,{withFileTypes:true})) {
   const name=prefix+item.name,location=path.join(folder,item.name);
   if(item.isDirectory()&&dirs.has(name))await inspect(location,name+'/');
   else if(item.isFile()&&expected.has(name))await verifyFile(name);
   else throw Error('unexpected staging entry: '+name);
  }
 }
 try {
  await inspect(stage);
  // Verify presence too: an absent file or directory is a change.
  for(const name of dirs)await ordinary(path.join(stage,...name.split('/')),{directory:true});
  for(const name of expected.keys())await verifyFile(name);
  for(const name of expected.keys())if(name!=='.gitignore'){await verifyFile(name);await fs.unlink(path.join(stage,...name.split('/')));}
  for(const name of [...dirs].sort((a,b)=>b.split('/').length-a.split('/').length))await fs.rmdir(path.join(stage,...name.split('/')));
  await verifyFile('.gitignore');await fs.unlink(path.join(stage,'.gitignore'));
  await fs.rmdir(stage);
  return null;
 } catch(error) {return 'The update succeeded, but its staging folder could not be fully removed: '+stage+' ('+error.message+').';}
}
// Only filenames and bytes from the installed, validated bundle may participate
// in a repair. Include directories in the receipt to detect empty-directory drift.
async function readPartialBuilder(root,next) {
 const builder=path.join(root,'.zero-build');
 const expected=new Map(next.files.map(file=>[file.path,file]));
 const parents=new Set();
 for(const name of expected.keys()) {
  for(let parent=path.posix.dirname(name);parent!=='.';parent=path.posix.dirname(parent))parents.add(parent);
 }
 const files=[],directories=[],seen=new Set();
 const invalid=()=>Error('The partial browser builder differs from the installed browser tools.');
 async function visit(folder,prefix) {
  await ordinary(folder,{directory:true});
  for await(const entry of await fs.opendir(folder)){
   const name=prefix+entry.name,location=path.join(folder,entry.name);
   if(seen.has(name)||seen.size>=parents.size+expected.size)throw invalid();
   seen.add(name);
   if(entry.isDirectory()&&parents.has(name)){
    directories.push(name);
    await visit(location,name+'/');
    continue;
   }
   const reference=expected.get(name);
   if(!entry.isFile()||!reference)throw invalid();
   const size=reference.bytes.length;
   const before=await ordinary(location,{maxBytes:size});
   if(before.size!==size)throw invalid();
   const handle=await fs.open(location,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
   try {
    const opened=await handle.stat();
    if(!opened.isFile()||opened.nlink!==1||opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==size)throw invalid();
    const bytes=Buffer.alloc(size+1);let length=0;
    while(length<bytes.length){
     const {bytesRead}=await handle.read(bytes,length,bytes.length-length,null);
     if(!bytesRead)break;
     length+=bytesRead;
    }
    const after=await ordinary(location,{maxBytes:size});
    if(length!==size||!reference.bytes.equals(bytes.subarray(0,length))||
       after.dev!==opened.dev||after.ino!==opened.ino||after.mtimeMs!==opened.mtimeMs)throw invalid();
   } finally {await handle.close();}
   files.push(reference);
  }
 }
 await visit(builder,'');
 if(files.length>=expected.size||!files.some(file=>file.path==='builder.json'))throw invalid();
 const names=files.map(file=>file.path).sort();
 const profileHash=format.sha256(Buffer.from(JSON.stringify([next.profileHash,names,directories.sort()])));
 return {files,directories,profileHash,repairing:true};
}
async function reviewedBuilder(root,plan,next) {
 const before=plan.repairing?await readPartialBuilder(root,next):await readSavedBuilder(root);
 if(before.profileHash!==plan.oldProfileHash)throw Error('The project browser builder changed. Review the upgrade again.');
 return before;
}
async function planUpgrade({projectRoot,extensionPath}) {
 const root=await rootPath(projectRoot),next=await loadBundledBuilder(extensionPath);
 const exists=await fs.lstat(path.join(root,'.zero-build')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 let old;
 if(exists){
  try {old=await readSavedBuilder(root);}
  catch(error){
   if(error.code!=='ZERO_BUILDER_UNAVAILABLE')throw error;
   try {old=await readPartialBuilder(root,next);} catch {throw error;}
  }
 }
 return {
  projectRoot:root,extensionPath:path.resolve(extensionPath),
  oldProfileHash:old?.profileHash||null,
  oldClosureSha256:old?.repairing?next.closureSha256:old?.manifest.closureSha256||null,
  newProfileHash:next.profileHash,newClosureSha256:next.closureSha256,
  changed:!old||old.profileHash!==next.profileHash,
  ...(old?.repairing?{repairing:true}:{})
 };
}
async function applyUpgrade(plan,{assertCurrent=async()=>{}}={}) {
 if(!plan||(plan.oldProfileHash!==null&&typeof plan.oldProfileHash!=='string')||typeof plan.newProfileHash!=='string'||!plan.changed)throw Error('Review a changed browser builder before upgrading.');
 await assertCurrent();
 const fresh=await planUpgrade(plan);
 if(fresh.repairing!==plan.repairing||fresh.projectRoot!==plan.projectRoot||fresh.oldProfileHash!==plan.oldProfileHash||fresh.newProfileHash!==plan.newProfileHash||fresh.oldClosureSha256!==plan.oldClosureSha256||fresh.newClosureSha256!==plan.newClosureSha256)throw Error('The project or installed browser builder changed. Review the upgrade again.');
 const next=await loadBundledBuilder(plan.extensionPath);
 if(next.profileHash!==plan.newProfileHash)throw Error('The installed browser builder changed. Review the upgrade again.');
 const root=fresh.projectRoot;
 if(plan.repairing){
  await assertCurrent();
  await reviewedBuilder(root,plan,next);
 }
 const stage=await fs.mkdtemp(path.join(root,'.zero-build-stage-'));
 let backup,oldMoved=false,newMoved=false;
 try {
  await fs.writeFile(path.join(stage,'.gitignore'),'*\n',{flag:'wx'});
  const staged=path.join(stage,'.zero-build');await fs.mkdir(staged);
  for(const file of next.files) {
   if(!format.relativePath(file.path))throw Error('Unsafe installed browser builder path.');
   const destination=path.join(staged,...file.path.split('/'));
   await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,file.bytes,{flag:'wx',mode:0o644});
  }
  const stagedBuilder=await readSavedBuilder(stage);
  if(stagedBuilder.profileHash!==plan.newProfileHash)throw Error('The staged browser builder differs from the reviewed builder.');
  await assertCurrent();
  // Reserve a unique recovery container and keep it out of normal Git adds.
  if(plan.oldProfileHash!==null){
   if(plan.repairing)await reviewedBuilder(root,plan,next);
   backup=await fs.mkdtemp(path.join(root,'.zero-build-backup-'));
   await fs.writeFile(path.join(backup,'.gitignore'),'*\n',{flag:'wx'});
   if(!plan.repairing)await reviewedBuilder(root,plan,next);
   await assertCurrent();
   if(plan.repairing)await reviewedBuilder(root,plan,next);
   await fs.rename(path.join(root,'.zero-build'),path.join(backup,'.zero-build'));oldMoved=true;
   if(plan.repairing)await reviewedBuilder(backup,plan,next);
  }
  // Reserve the destination exclusively; never rename over a newly created folder.
  await assertCurrent();
  const target=path.join(root,'.zero-build');await fs.mkdir(target);newMoved=true;
  for(const file of next.files){
   await assertCurrent();
   const destination=path.join(target,...file.path.split('/'));
   await fs.mkdir(path.dirname(destination),{recursive:true});
   await fs.copyFile(path.join(staged,...file.path.split('/')),destination,require('node:fs').constants.COPYFILE_EXCL);
  }
  const installed=await readSavedBuilder(root);
  if(installed.profileHash!==plan.newProfileHash)throw Error('The installed browser builder differs from the reviewed builder.');
  await assertCurrent();
  const cleanupWarning=await cleanupStage(stage,next.files);
  return {projectRoot:root,backupPath:backup?path.join(backup,'.zero-build'):null,oldProfileHash:plan.oldProfileHash,newProfileHash:plan.newProfileHash,...(cleanupWarning?{cleanupWarning}:{})};
 } catch(error) {
  if(oldMoved&&!newMoved){
   try {await fs.lstat(path.join(root,'.zero-build'));}
   catch(missing) {if(missing.code==='ENOENT')try {
    const saved=await reviewedBuilder(backup,plan,next);
    const target=path.join(root,'.zero-build');await fs.mkdir(target);
    for(const dir of saved.directories||[])await fs.mkdir(path.join(target,...dir.split('/')),{recursive:true});
    for(const file of saved.files){const dest=path.join(target,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(backup,'.zero-build',...file.path.split('/')),dest,require('node:fs').constants.COPYFILE_EXCL);}
    await reviewedBuilder(root,plan,next);
    oldMoved=false;
   }catch(recovery){error.message+=' Automatic recovery failed: '+recovery.message;}}
  }
  if(oldMoved)error.message+=' The original builder remains at '+path.join(backup,'.zero-build')+'.';
  else if(newMoved&&plan.oldProfileHash===null)error.message+=' The incomplete .zero-build folder was retained; inspect and move it aside before trying again.';
  throw error;
 }
}
module.exports={BUNDLED_BUILDER_PATH,loadBundledBuilder,planUpgrade,applyUpgrade};
