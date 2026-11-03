'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const contracts=require('./contracts');
const fail=message=>{throw new Error('Project-owned native cache: '+message);};
const inside=(parent,child)=>child===parent||child.startsWith(parent+path.sep);

async function directory(dir,create=false) {
 if(create)try{await fs.mkdir(dir);}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await fs.lstat(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink())fail(`unsafe directory: ${dir}`);
}
async function inspectRoot(root) {
 // cacheRoot is a trusted VS Code storage location, but its path must not
 // traverse links. Inspect existing components before creating any directory.
 const parsed=path.parse(root);let current=parsed.root,missing=false;
 const parts=root.slice(parsed.root.length).split(path.sep).filter(Boolean);
 for(const part of parts) {
  current=path.join(current,part);
  if(missing)continue;
  try{await directory(current);}catch(error){if(error.code!=='ENOENT')throw error;missing=true;}
 }
 return {root:parsed.root,parts};
}
async function ensurePath(root,parts) {
 let dir=root;
 for(const part of parts){dir=path.join(dir,part);await directory(dir,true);}
 return dir;
}
async function checkFile(filename,bytes) {
 const stat=await fs.lstat(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==bytes.length)fail(`conflicting cache file: ${filename}`);
 const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try {
  const opened=await handle.stat();
  if(!opened.isFile()||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==bytes.length||!(await handle.readFile()).equals(bytes))fail(`conflicting cache file: ${filename}`);
 } finally {await handle.close();}
}
async function seed(filename,bytes) {
 try{await checkFile(filename,bytes);return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const tmp=path.join(path.dirname(filename),`.zero-${crypto.randomBytes(16).toString('hex')}.tmp`);
 let created=false;
 try {
  await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600});created=true;
  try{await fs.link(tmp,filename);}catch(error){if(error.code!=='EEXIST')throw error;await checkFile(filename,bytes);}
 } finally {if(created)await fs.unlink(tmp);}
}
/**
 * Seed verified owned artifacts into a private per-project Maven repository.
 * Other Maven dependencies start cold and may need network access. This cache
 * does not authenticate project-owned manifests or defend against malicious
 * concurrent changes by another process with access to the same storage.
 */
async function prepareOwnedNative({root,pomText,cacheRoot,readOwned=require('./owned-library').readOwned,inspectPins=require('./consumer').inspectManagedLibraryPins}) {
 // Native Maven projects without owned dependencies keep Maven's full XML
 // support. Only recognizable ownership markers opt into the stricter managed
 // POM parser, including incomplete or orphaned markers that must fail closed.
 if(!/zero-sharing[^<]*\bowned\b|zero\.sharing\.[^<>\s]*\.owned\b/.test(pomText))return null;
 const pins=inspectPins(pomText).filter(pin=>pin.storage==='owned');
 if(!pins.length)return null;
 if(typeof root!=='string'||!path.isAbsolute(root)||typeof cacheRoot!=='string'||!path.isAbsolute(cacheRoot))fail('project and cache roots must be absolute paths.');
 const project=await fs.realpath(root),cache=path.resolve(cacheRoot);
 if(inside(project,cache))fail('cache must be outside the project.');
 const staged=[];
 for(const pin of pins) {
  const id=pin.identity,version=pin.version;
  const derived=contracts.identity(id.kind,id.repositoryId,id.slug);
  if(id.id!==derived.id)fail('invalid library identity.');
  // Derive paths from the checked identity rather than release-provided paths.
  const jarPath=contracts.artifactPath(id,version,'jar'),pomPath=contracts.artifactPath(id,version,'pom');
  const item=await readOwned(project,id.id,version);
  if(!item||item.release?.id!==id.id||item.release?.version!==version||item.release?.coordinate?.groupId!==derived.coordinate.groupId||item.release?.coordinate?.artifactId!==derived.coordinate.artifactId||item.release?.coordinate?.version!==version||!Buffer.isBuffer(item.jar)||!Buffer.isBuffer(item.pom))fail('saved library does not match its pin.');
  if(item.release.schema===2) {
   const core=require('../core-contract');
   const record=await core.readProjectCore(project,{required:true});
   if(!core.versionSatisfies(record.coordinate.version,item.release.coreRequirement))fail(`library ${id.id} requires a compatible Zero core; choose a compatible library or deliberately upgrade a copy.`);
  }
  staged.push([jarPath.slice('maven/'.length),item.jar],[pomPath.slice('maven/'.length),item.pom]);
 }
 const inspected=await inspectRoot(cache),base=cache;
 if(inside(project,base))fail('cache must be outside the project.');
 const homeMaven=path.join(require('node:os').homedir(),'.m2');
 if(inside(homeMaven,base))fail('cache must be outside the shared Maven repository.');
 await ensurePath(inspected.root,inspected.parts);
 const repository=await ensurePath(base,[crypto.createHash('sha256').update(project).digest('hex'),'repository']);
 for(const [relative,bytes] of staged) {
  const parts=relative.split('/'),name=parts.pop();
  const dir=await ensurePath(repository,parts);
  await seed(path.join(dir,name),bytes);
 }
 return {repository,pins};
}
module.exports={prepareOwnedNative};
