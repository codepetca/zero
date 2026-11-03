'use strict';
// Explicit, data-only replacement of a project's complete saved browser builder.
// The caller owns workspace trust, user review, editor-buffer and build locks.
const fs=require('node:fs/promises');
const path=require('node:path');
const lessonProjects=require('./lesson-projects');
const {readSavedBuilder,_test:{digest}}=require('./project-builder');
const {ordinary}=require('./retained-web-export');
const format=require('./project-builder-format');

async function rootPath(root) {
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Choose an absolute project folder.');
 await ordinary(root,{directory:true});
 const actual=await fs.realpath(root);
 if(actual!==path.resolve(root))throw Error('Choose an ordinary project folder without symbolic links.');
 return actual;
}
async function bundled(extensionPath) {
 const projects=await lessonProjects.loadBundle(extensionPath);
 const groups=projects.map(project=>project.files.filter(file=>file.path.startsWith('.zero-build/')).map(file=>({path:file.path.slice('.zero-build/'.length),bytes:Buffer.from(file.content)})));
 if(!groups.length||groups.some(files=>!files.length))throw Error('The installed extension has no complete browser builder.');
 const identity=digest(groups[0]);
 if(groups.some(files=>digest(files)!==identity))throw Error('Installed browser builders disagree. Reinstall Zero.');
 // loadBundle validates the complete manifest and runtime in each group.
 return {files:groups[0],profileHash:identity,closureSha256:JSON.parse(groups[0].find(file=>file.path==='builder.json').bytes).closureSha256};
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
async function planUpgrade({projectRoot,extensionPath}) {
 const root=await rootPath(projectRoot),next=await bundled(extensionPath);
 const exists=await fs.lstat(path.join(root,'.zero-build')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 const old=exists?await readSavedBuilder(root):null;
 return {projectRoot:root,extensionPath:path.resolve(extensionPath),oldProfileHash:old?.profileHash||null,oldClosureSha256:old?.manifest.closureSha256||null,newProfileHash:next.profileHash,newClosureSha256:next.closureSha256,changed:!old||old.profileHash!==next.profileHash};
}
async function applyUpgrade(plan,{assertCurrent=async()=>{}}={}) {
 if(!plan||(plan.oldProfileHash!==null&&typeof plan.oldProfileHash!=='string')||typeof plan.newProfileHash!=='string'||!plan.changed)throw Error('Review a changed browser builder before upgrading.');
 await assertCurrent();
 const fresh=await planUpgrade(plan);
 if(fresh.projectRoot!==plan.projectRoot||fresh.oldProfileHash!==plan.oldProfileHash||fresh.newProfileHash!==plan.newProfileHash||fresh.oldClosureSha256!==plan.oldClosureSha256||fresh.newClosureSha256!==plan.newClosureSha256)throw Error('The project or installed browser builder changed. Review the upgrade again.');
 const next=await bundled(plan.extensionPath);
 if(next.profileHash!==plan.newProfileHash)throw Error('The installed browser builder changed. Review the upgrade again.');
 const root=fresh.projectRoot,stage=await fs.mkdtemp(path.join(root,'.zero-build-stage-'));
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
   backup=await fs.mkdtemp(path.join(root,'.zero-build-backup-'));
   await fs.writeFile(path.join(backup,'.gitignore'),'*\n',{flag:'wx'});
   const before=await readSavedBuilder(root);
   if(before.profileHash!==plan.oldProfileHash)throw Error('The project browser builder changed. Review the upgrade again.');
   await assertCurrent();
   await fs.rename(path.join(root,'.zero-build'),path.join(backup,'.zero-build'));oldMoved=true;
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
    const target=path.join(root,'.zero-build');await fs.mkdir(target);
    const saved=await readSavedBuilder(backup);
    for(const file of saved.files){const dest=path.join(target,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(backup,'.zero-build',...file.path.split('/')),dest,require('node:fs').constants.COPYFILE_EXCL);}
    if((await readSavedBuilder(root)).profileHash!==plan.oldProfileHash)throw Error('Restored builder differs from the original.');
    oldMoved=false;
   }catch(recovery){error.message+=' Automatic recovery failed: '+recovery.message;}}
  }
  if(oldMoved)error.message+=' The original builder remains at '+path.join(backup,'.zero-build')+'.';
  else if(newMoved&&plan.oldProfileHash===null)error.message+=' The incomplete .zero-build folder was retained; inspect and move it aside before trying again.';
  throw error;
 }
}
module.exports={planUpgrade,applyUpgrade};
