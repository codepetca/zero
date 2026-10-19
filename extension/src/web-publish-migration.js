'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const ownerPath='.zero-web/owner.json';
const kitPaths=['.zero-web/run.cjs','.zero-web/web-publish-bundle.js','.zero-web/README.md','.github/workflows/zero-web.yml',ownerPath];
// Canonical publishingFiles at 44e50e4 (before f719d18's README-only identity
// wording change). This allowlist is independent of the project's owner marker.
const legacyHash='56217bc19e0f9009202e3096274d035810b3ecb46c33d862d52a63ae76d3fd92';
const limit=256*1024;
function conflict(name) {return Error(`Publishing file ${name} has different content. Preserve it and resolve the conflict before publishing; Zero will not replace an edited or unknown kit.`);}
function identity(stat) {return [stat.dev,stat.ino,stat.mode,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');}
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
      if(identity(io.fstatSync(handle))!==paths.get(current))throw Error('Publishing files changed. Review publishing again.');
      // Read no more than the bounded size observed above, including a growth check.
      const data=Buffer.alloc(limit+1),length=io.readSync(handle,data,0,data.length,0);
      if(length>limit||identity(io.fstatSync(handle))!==paths.get(current))throw Error('Publishing files changed. Review publishing again.');
      entries.set(name,data.subarray(0,length));
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
    const marker=Buffer.from(JSON.stringify({format:1,toolHash:legacyHash})+'\n');
    if(digest.digest('hex')===legacyHash&&original.entries.get(ownerPath).equals(marker))return {missing,original,upgrade:true,changed:different};
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
// A short synchronous transaction avoids yielding between the final filesystem
// check and bounded writes. Existing files stay open without following symlinks;
// originals are verified in HEAD before entry. The ownership marker is last.
function apply(root,files,original,io=fs) {
  assertSnapshot(root,files,original,io);
  const changed=[...files].filter(([name,data])=>!data.equals(original.entries.get(name))).sort(([a],[b])=>a===ownerPath?1:b===ownerPath?-1:a.localeCompare(b));
  const opened=[];
  try {
    for(const [name,data] of changed) {
      const target=path.join(root,name),fd=io.openSync(target,fs.constants.O_RDWR|fs.constants.O_NOFOLLOW);
      const item={name,data,fd,before:original.entries.get(name),expected:Buffer.from(original.entries.get(name))};opened.push(item);
      if(identity(io.fstatSync(fd))!==original.paths.get(target))throw Error('Publishing files changed. Review publishing again.');
    }
    assertSnapshot(root,files,original,io);
    function assertTransaction() {
      const now=snapshot(root,files,io),written=new Map(opened.filter(item=>item.started).map(item=>[path.join(root,item.name),item]));
      for(const [target,before]of original.paths) {
        const actual=now.paths.get(target);
        if(!actual || (written.has(target)?actual.split(':').slice(0,3).join(':')!==before.split(':').slice(0,3).join(':'):actual!==before))throw Error('Publishing files or paths changed during the update. Review publishing again.');
      }
      for(const [name,before]of original.entries) {
        const item=written.get(path.join(root,name));
        if(!now.entries.get(name)?.equals(item?item.expected:before))throw Error('Publishing files changed during the update. Review publishing again.');
      }
    }
    for(const item of opened) {
      assertTransaction();
      item.started=true;let offset=0;
      while(offset<item.data.length) {
        const count=io.writeSync(item.fd,item.data,offset,item.data.length-offset,offset);
        if(count<=0)throw Error('Could not finish writing the publishing files.');
        const length=Math.max(item.expected.length,offset+count),next=Buffer.alloc(length);item.expected.copy(next);item.data.copy(next,offset,offset,offset+count);item.expected=next;offset+=count;
      }
      io.ftruncateSync(item.fd,item.data.length);item.expected=Buffer.from(item.data);
    }
    assertTransaction();
  } catch(error) {
    let restored=true;
    for(const item of opened.filter(item=>item.started).reverse()) {
      try {
        // Never roll back over a concurrent edit or a replaced path.
        const target=path.join(root,item.name),stat=io.lstatSync(target),held=io.fstatSync(item.fd);
        for(let directory=path.dirname(target);directory!==root;directory=path.dirname(directory)) {
          const parent=io.lstatSync(directory);
          if(parent.isSymbolicLink()||identity(parent)!==original.paths.get(directory))throw Error('Publishing path changed during recovery.');
        }
        if(stat.isSymbolicLink()||stat.dev!==held.dev||stat.ino!==held.ino||!io.readFileSync(item.fd).equals(item.expected))throw Error('Publishing file changed during recovery.');
        let offset=0;while(offset<item.before.length){const count=io.writeSync(item.fd,item.before,offset,item.before.length-offset,offset);if(count<=0)throw Error('Recovery write failed.');offset+=count;}
        io.ftruncateSync(item.fd,item.before.length);
      }catch{restored=false;}
    }
    error.message+=restored?' Previous publishing files were restored; review and retry.':' Some publishing files could not be restored. Preserve current edits and restore the previous kit from Git history before retrying.';
    throw error;
  } finally {for(const item of opened)io.closeSync(item.fd);}
}
module.exports={inspect,assertRecoverable,apply};
