'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const migration=require('../src/web-publish-migration');
const baseline=require('./web-publish-legacy-fixture');
async function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zero-kit-migration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const {current,legacy}=await baseline();
  for(const [name,data]of legacy){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),data);}
  return {root,current,legacy};
}
function unchanged(h){for(const [name,data]of h.legacy)assert.deepEqual(fs.readFileSync(path.join(h.root,name)),data);}
test('only the complete pinned legacy baseline is an upgrade; edited, forged, unknown and incomplete kits fail closed',async t=>{
  for(const kind of ['edited','forged','unknown','incomplete','large','directory','symlink','parent-symlink'])await t.test(kind,async t=>{
    const h=await fixture(t),readme=path.join(h.root,'.zero-web/README.md');
    assert.equal(migration.inspect(h.root,h.current).upgrade,true);
    if(kind==='edited')fs.appendFileSync(readme,'Student edit\n');
    if(kind==='forged')fs.writeFileSync(path.join(h.root,'.zero-web/owner.json'),'{}');
    if(kind==='unknown')fs.writeFileSync(readme,'Unknown kit');
    if(kind==='incomplete')fs.unlinkSync(path.join(h.root,'.zero-web/run.cjs'));
    if(kind==='large')fs.writeFileSync(readme,Buffer.alloc(256*1024+1));
    if(kind==='directory'){fs.unlinkSync(readme);fs.mkdirSync(readme);}
    if(kind==='symlink'){fs.unlinkSync(readme);fs.symlinkSync(path.join(h.root,'.zero-web/run.cjs'),readme);}
    if(kind==='parent-symlink'){fs.renameSync(path.join(h.root,'.zero-web'),path.join(h.root,'outside'));fs.symlinkSync(path.join(h.root,'outside'),path.join(h.root,'.zero-web'));}
    assert.throws(()=>migration.inspect(h.root,h.current),/different content|symbolic link|regular file/);
  });
});
test('same-content path replacement and post-review byte drift are refused without writing',async t=>{
  for(const kind of ['bytes','file','directory'])await t.test(kind,async t=>{
    const h=await fixture(t),review=migration.inspect(h.root,h.current),target=path.join(h.root,'.zero-web/README.md');
    if(kind==='bytes')fs.appendFileSync(target,'edited');
    if(kind==='file'){fs.renameSync(target,target+'.old');fs.copyFileSync(target+'.old',target);}
    if(kind==='directory'){fs.renameSync(path.join(h.root,'.zero-web'),path.join(h.root,'moved'));fs.mkdirSync(path.join(h.root,'.zero-web'));for(const [name,data]of h.legacy)if(name.startsWith('.zero-web/'))fs.writeFileSync(path.join(h.root,name),data);}
    assert.throws(()=>migration.apply(h.root,h.current,review.original),/changed/);
    assert.deepEqual(fs.readFileSync(path.join(h.root,'.zero-web/owner.json')),h.legacy.get('.zero-web/owner.json'));
  });
});
test('failed write rolls back all changed bytes, keeps marker last, and a clean retry succeeds',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current);let calls=0;const names=new Map(),writes=[];
  const io={...fs,openSync(target,...args){const fd=fs.openSync(target,...args);names.set(fd,path.relative(h.root,target));return fd;},writeSync(...args){writes.push(names.get(args[0]));if(++calls===2)throw Error('disk write failed');return fs.writeSync(...args);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/Previous publishing files were restored/);
  unchanged(h);assert.deepEqual(writes.slice(0,2),['.zero-web/README.md','.zero-web/owner.json']);
  migration.apply(h.root,h.current,migration.inspect(h.root,h.current).original);
  for(const [name,data]of h.current)assert.deepEqual(fs.readFileSync(path.join(h.root,name)),data);
});
test('short writes are completed; a partial failure rolls back the exact written prefix',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current);let calls=0;
  const io={...fs,writeSync(fd,data,offset,length,position){if(++calls===2)throw Error('disk failed after prefix');return fs.writeSync(fd,data,offset,Math.min(length,11),position);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/Previous publishing files were restored/);unchanged(h);
});
test('rollback preserves a concurrent edit and explains recovery from Git history',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current);let calls=0;const readme=path.join(h.root,'.zero-web/README.md');
  const io={...fs,writeSync(...args){if(++calls===2){fs.writeFileSync(readme,'Concurrent student edit');throw Error('disk failed');}return fs.writeSync(...args);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/could not be restored[\s\S]*Git history/);
  assert.equal(fs.readFileSync(readme,'utf8'),'Concurrent student edit');assert.deepEqual(fs.readFileSync(path.join(h.root,'.zero-web/owner.json')),h.legacy.get('.zero-web/owner.json'));
});

test('hardlinked regular files are preserved without changing their other names',async t=>{
  const h=await fixture(t),readme=path.join(h.root,'.zero-web/README.md'),alias=path.join(h.root,'valuable.md');fs.linkSync(readme,alias);
  assert.throws(()=>migration.inspect(h.root,h.current),/hard links/);assert.deepEqual(fs.readFileSync(alias),h.legacy.get('.zero-web/README.md'));
});
test('path replacement during writes is detected and never reported as an updated kit',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md');let replaced=false;
  const io={...fs,writeSync(...args){const count=fs.writeSync(...args);if(!replaced){replaced=true;fs.renameSync(readme,readme+'.moved');fs.writeFileSync(readme,'Concurrent replacement');}return count;}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/changed during the update[\s\S]*could not be restored/);
  assert.equal(fs.readFileSync(readme,'utf8'),'Concurrent replacement');assert.deepEqual(fs.readFileSync(path.join(h.root,'.zero-web/owner.json')),h.legacy.get('.zero-web/owner.json'));
});

test('rollback refuses a substituted symlink parent even when it reaches the held file',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),directory=path.join(h.root,'.zero-web'),moved=path.join(h.root,'moved');let swapped=false;
  const io={...fs,writeSync(...args){const count=fs.writeSync(...args);if(!swapped){swapped=true;fs.renameSync(directory,moved);fs.symlinkSync(moved,directory);}return count;}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/symbolic link[\s\S]*could not be restored/);
  assert.deepEqual(fs.readFileSync(path.join(moved,'README.md')),h.current.get('.zero-web/README.md'),'Recovery does not write through the substituted parent');
});
