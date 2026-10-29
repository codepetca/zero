'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const ownerPath='.zero-web/owner.json';
const kitPaths=['.zero-web/run.cjs','.zero-web/web-publish-bundle.js','.zero-web/README.md','.github/workflows/zero-web.yml',ownerPath];
// Canonical publishingFiles at 44e50e44 (before f719d184's README-only identity
// wording change), and f719d184 through 84c56394 (before the README's device
// administrator wording). This allowlist is independent of the owner marker.
const legacyHashes=new Set([
  '56217bc19e0f9009202e3096274d035810b3ecb46c33d862d52a63ae76d3fd92',
  '292808492ceceb80fefcc6ac8f0e756275cc357aee6bd2d22f3d0f2195631805'
]);
const limit=256*1024;
function conflict(name) {return Error(`Publishing file ${name} has different content. Preserve it and resolve the conflict before publishing; Zero will not replace an edited or unknown kit.`);}
function identity(stat) {return [stat.dev,stat.ino,stat.mode,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');}
function readBounded(handle,expected,io) {
  const before=io.fstatSync(handle);
  if(!before.isFile()||before.nlink!==1||before.size>limit||identity(before)!==identity(expected))throw Error('Publishing file changed during the update or recovery.');
  const data=Buffer.alloc(before.size);let length=0;
  while(length<data.length) {
    const count=io.readSync(handle,data,length,data.length-length,length);
    if(count<=0)throw Error('Publishing file changed during the update or recovery.');
    length+=count;
  }
  if(identity(io.fstatSync(handle))!==identity(before))throw Error('Publishing file changed during the update or recovery.');
  return data;
}
function snapshot(root,files,io=fs) {
  const entries=new Map(),paths=new Map();
  for(const name of files.keys()) {
    let current=root,missing=false;
    for(const [index,part] of name.split('/').entries()) {
      current=path.join(current,part);
      let stat;try {stat=io.lstatSync(current);}catch(error){if(error.code==='ENOENT'){missing=true;break;}throw error;}
      if(stat.isSymbolicLink())throw Error('A web publishing path is a symbolic link. Move it and review again.');
      const leaf=index===name.split('/').length-1;
      if(leaf?!stat.isFile():!stat.isDirectory())throw Error('A web publishing path is not a regular file or directory. Preserve it and review again.');
      if(leaf&&stat.nlink!==1)throw Error('A web publishing file has multiple hard links. Preserve it and review again.');
      if(leaf&&stat.size>limit)throw conflict(name);
      paths.set(current,identity(stat));
    }
    if(missing){entries.set(name,null);continue;}
    const handle=io.openSync(current,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
      const held=io.fstatSync(handle);
      if(identity(held)!==paths.get(current))throw Error('Publishing files changed. Review publishing again.');
      // Bound the allocation and every read to the observed regular-file size.
      // Recheck metadata after reading so concurrent growth is never accepted.
      entries.set(name,readBounded(handle,held,io));
    } finally {io.closeSync(handle);}
  }
  return {entries,paths};
}
function inspect(root,files) {
  const original=snapshot(root,files),missing=[],different=[];
  for(const [name,expected] of files) {
    const data=original.entries.get(name);
    if(data===null)missing.push(name);else if(!data.equals(expected))different.push(name);
  }
  if(!different.length)return {missing,original,upgrade:false};
  if(!missing.length&&files.size===kitPaths.length&&kitPaths.every(name=>files.has(name))) {
    const digest=crypto.createHash('sha256');
    for(const [name,data] of [...original.entries].filter(([name])=>name!==ownerPath).sort(([a],[b])=>a.localeCompare(b)))digest.update(name).update('\0').update(data);
    const hash=digest.digest('hex'),marker=Buffer.from(JSON.stringify({format:1,toolHash:hash})+'\n');
    if(legacyHashes.has(hash)&&original.entries.get(ownerPath).equals(marker))return {missing,original,upgrade:true,changed:different};
  }
  throw conflict(different[0]);
}
async function assertRecoverable(root,head,original,git) {
  for(const [name,data] of original.entries) {
    const blob=crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    const tree=await git(root,['ls-tree',head,'--',name]);
    if(tree!==`100644 blob ${blob}\t${name}`)throw Error('The previous publishing files must be saved unchanged in Git history. Preserve this kit and review publishing again.');
  }
}
function assertSnapshot(root,files,original,io) {
  const now=snapshot(root,files,io);
  if(now.paths.size!==original.paths.size||[...original.paths].some(([name,value])=>now.paths.get(name)!==value)||[...original.entries].some(([name,data])=>!now.entries.get(name)?.equals(data)))throw Error('Publishing files or paths changed. Review publishing again.');
}
// Source files are never written or truncated in place. Keep their actual
// inodes in a private Git recovery directory, then install staged files with
// exclusive links. An intervening source replacement is preserved, not overwritten.
function apply(root,files,original,io=fs) {
  assertSnapshot(root,files,original,io);
  const changed=[...files].filter(([name,data])=>!data.equals(original.entries.get(name))).sort(([a],[b])=>a===ownerPath?1:b===ownerPath?-1:a.localeCompare(b));
  const gitRoot=path.join(root,'.git');
  const gitStat=io.lstatSync(gitRoot);
  if(gitStat.isSymbolicLink()||!gitStat.isDirectory())throw Error('Updating this kit needs an ordinary Git clone. Preserve these files and use a standalone clone instead of a linked worktree.');
  const recoveryRoot=path.join(gitRoot,'zero-publishing-upgrades');
  try{io.mkdirSync(recoveryRoot,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  if(io.lstatSync(recoveryRoot).isSymbolicLink()||!io.lstatSync(recoveryRoot).isDirectory())throw Error('The publishing recovery path changed. Preserve it and review again.');
  const recoveryRootStat=io.lstatSync(recoveryRoot);
  const recovery=path.join(recoveryRoot,crypto.randomBytes(16).toString('hex'));
  io.mkdirSync(recovery,{mode:0o700});
  const recoveryStat=io.lstatSync(recovery);
  const items=changed.map(([name,data],index)=>({name,data,before:original.entries.get(name),target:path.join(root,name),backup:path.join(recovery,'original-'+path.basename(name)),stage:path.join(recovery,'new-'+path.basename(name))}));
  const leafPaths=new Set([...original.entries.keys()].map(name=>path.join(root,name)));
  const sameNode=(a,b)=>a.split(':').slice(0,3).join(':')===b.split(':').slice(0,3).join(':');
  function readExact(target,expected,node) {
    const stat=io.lstatSync(target);
    if(!stat.isFile()||stat.nlink!==1||stat.size!==expected.length||stat.size>limit||(node&&!sameNode(identity(stat),node)))throw Error('Publishing files or paths changed during the update.');
    const fd=io.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{if(!readBounded(fd,stat,io).equals(expected))throw Error('Publishing files changed during the update.');}finally{io.closeSync(fd);}
    return identity(stat);
  }
  function assertParents() {
    for(const [target,before]of original.paths)if(!leafPaths.has(target)) {
      const stat=io.lstatSync(target);
      if(!stat.isDirectory()||stat.isSymbolicLink()||!sameNode(identity(stat),before))throw Error('Publishing paths changed during the update.');
    }
    if(!sameNode(identity(io.lstatSync(gitRoot)),identity(gitStat)))throw Error('The Git recovery path changed during the update.');
    const parent=io.lstatSync(recoveryRoot),directory=io.lstatSync(recovery);
    if(parent.isSymbolicLink()||!parent.isDirectory()||!sameNode(identity(parent),identity(recoveryRootStat))||directory.isSymbolicLink()||!directory.isDirectory()||!sameNode(identity(directory),identity(recoveryStat)))throw Error('The publishing recovery path changed during the update.');
  }
  function check() {
    assertParents();
    for(const [name,before]of original.entries) {
      const item=items.find(item=>item.name===name),target=path.join(root,name);
      if(item?.moved)readExact(item.backup,before,original.paths.get(target));
      if(item?.installed)readExact(target,item.data,item.installed);
      else if(!item?.moved)readExact(target,before,original.paths.get(target));
    }
  }
  function stage(target,data) {
    const fd=io.openSync(target,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o644);
    try {
      let offset=0;
      while(offset<data.length){const count=io.writeSync(fd,data,offset,data.length-offset,offset);if(count<=0)throw Error('Could not stage publishing files.');offset+=count;}
      const held=io.fstatSync(fd);
      if(held.size!==data.length||!readBounded(fd,held,io).equals(data))throw Error('Staged publishing files changed.');
      return identity(held);
    }finally{io.closeSync(fd);}
  }
  function install(staged,target,node) {
    // link is exclusive: if another writer creates target while it is absent,
    // EEXIST preserves that new file. Remove only our private staging alias.
    io.linkSync(staged,target);
    const actual=io.lstatSync(staged);
    if(!sameNode(identity(actual),node))throw Error('Staged publishing path changed.');
    io.unlinkSync(staged);
  }
  try {
    for(const item of items)item.staged=stage(item.stage,item.data);
    check();
    for(const item of items) {
      check();
      io.renameSync(item.target,item.backup);item.moved=true;
      // The rename preserves whichever inode was actually at the source path,
      // including a concurrent edit or replacement immediately before rename.
      check();
      readExact(item.stage,item.data,item.staged);
      install(item.stage,item.target,item.staged);item.installed=item.staged;
      check();
    }
  }catch(error) {
    let restored=true;
    for(const [index,item]of items.entries())if(item.moved) {
      try {
        assertParents();
        // Validate and stage recovery before moving any installed source. If
        // the old inode has new edits, preserve both it and the current source.
        readExact(item.backup,item.before,original.paths.get(item.target));
        const restore=path.join(recovery,'restore-'+index),node=stage(restore,item.before);
        if(item.installed) {
          readExact(item.target,item.data,item.installed);
          // Move rather than unlink: a replacement after readExact is retained.
          io.renameSync(item.target,path.join(recovery,'failed-new-'+index));
        }
        install(restore,item.target,node);
      }catch{restored=false;}
    }
    error.message+=items.some(item=>item.moved)?(restored?' Previous publishing files were restored; review and retry.':' Some publishing files could not be restored. Preserve current edits before retrying.'):' Publishing files were not replaced. Preserve current edits and review again.';
    error.message+=' Recovery copies are kept in '+recovery+'. Restore the previous kit from Git history only after preserving these copies.';
    throw error;
  }
}
module.exports={inspect,assertRecoverable,apply};
