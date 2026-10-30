'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const migration=require('../src/web-publish-migration');
const baseline=require('./web-publish-legacy-fixture');
async function fixture(t,kit='legacy') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zero-kit-migration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'.git'));
  const baselines=await baseline(),current=baselines.current,legacy=baselines[kit];
  for(const [name,data]of legacy){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),data);}
  return {root,current,legacy};
}
function unchanged(h){for(const [name,data]of h.legacy)assert.deepEqual(fs.readFileSync(path.join(h.root,name)),data);}
test('only complete pinned historical baselines upgrade; edited, forged, unknown and incomplete kits fail closed',async t=>{
  for(const kit of ['legacy','previous'])for(const kind of ['edited','forged','mixed-marker','self-signed','unknown','incomplete','large','directory','symlink','parent-symlink'])await t.test(kit+' '+kind,async t=>{
    const h=await fixture(t,kit),readme=path.join(h.root,'.zero-web/README.md');
    assert.equal(migration.inspect(h.root,h.current).upgrade,true);
    if(kind==='edited')fs.appendFileSync(readme,'Student edit\n');
    if(kind==='forged')fs.writeFileSync(path.join(h.root,'.zero-web/owner.json'),'{}');
    if(kind==='mixed-marker')fs.writeFileSync(path.join(h.root,'.zero-web/owner.json'),(await baseline())[kit==='legacy'?'previous':'legacy'].get('.zero-web/owner.json'));
    if(kind==='self-signed'){
      fs.appendFileSync(readme,'Student edit\n');
      const digest=require('node:crypto').createHash('sha256');
      for(const name of [...h.legacy.keys()].filter(name=>name!=='.zero-web/owner.json').sort((a,b)=>a.localeCompare(b)))digest.update(name).update('\0').update(fs.readFileSync(path.join(h.root,name)));
      fs.writeFileSync(path.join(h.root,'.zero-web/owner.json'),JSON.stringify({format:1,toolHash:digest.digest('hex')})+'\n');
    }
    if(kind==='unknown')fs.writeFileSync(readme,'Unknown kit');
    if(kind==='incomplete')fs.unlinkSync(path.join(h.root,'.zero-web/run.cjs'));
    if(kind==='large')fs.writeFileSync(readme,Buffer.alloc(256*1024+1));
    if(kind==='directory'){fs.unlinkSync(readme);fs.mkdirSync(readme);}
    if(kind==='symlink'){fs.unlinkSync(readme);fs.symlinkSync(path.join(h.root,'.zero-web/run.cjs'),readme);}
    if(kind==='parent-symlink'){fs.renameSync(path.join(h.root,'.zero-web'),path.join(h.root,'outside'));fs.symlinkSync(path.join(h.root,'outside'),path.join(h.root,'.zero-web'));}
    assert.throws(()=>migration.inspect(h.root,h.current),/different content|symbolic link|regular file/);
  });
});
test('the previous current kit upgrades only the guide and marker and retains its exact recovery bytes',async t=>{
  const h=await fixture(t,'previous'),review=migration.inspect(h.root,h.current);
  assert.equal(review.upgrade,true);
  assert.deepEqual(review.changed,['.zero-web/README.md','.zero-web/owner.json']);
  migration.apply(h.root,h.current,review.original);
  for(const [name,data]of h.current)assert.deepEqual(fs.readFileSync(path.join(h.root,name)),data);
  assert.equal(migration.inspect(h.root,h.current).upgrade,false);
  const saved=copies(h)[0];
  for(const name of review.changed)assert.deepEqual(fs.readFileSync(path.join(saved,'original-'+path.basename(name))),h.legacy.get(name));
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
function copies(h) {
  const parent=path.join(h.root,'.git/zero-publishing-upgrades');
  return fs.readdirSync(parent).map(name=>path.join(parent,name));
}
test('failed staging leaves source untouched; short-write retry installs the owner marker last',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current);let calls=0;
  const fail={...fs,writeSync(...args){if(++calls===2)throw Error('disk write failed');return fs.writeSync(...args);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,fail),/not replaced/);unchanged(h);
  const installed=[];
  const io={...fs,writeSync(fd,data,offset,length,position){return fs.writeSync(fd,data,offset,Math.min(length,11),position);},linkSync(source,target){installed.push(path.relative(h.root,target).split(path.sep).join('/'));return fs.linkSync(source,target);},ftruncateSync(){assert.fail('No inode is truncated');}};
  migration.apply(h.root,h.current,migration.inspect(h.root,h.current).original,io);
  assert.deepEqual(installed,['.zero-web/README.md','.zero-web/owner.json']);
  for(const [name,data]of h.current)assert.deepEqual(fs.readFileSync(path.join(h.root,name)),data);
  assert.equal(migration.inspect(h.root,h.current).upgrade,false);
  const saved=copies(h).find(directory=>fs.existsSync(path.join(directory,'original-README.md')));
  assert.deepEqual(fs.readFileSync(path.join(saved,'original-README.md')),h.legacy.get('.zero-web/README.md'));
});
test('appends after partial or full staging writes are preserved and no truncate is invoked',async t=>{
  for(const partial of [false,true])await t.test(String(partial),async t=>{
    const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md');let appended=false;
    const io={...fs,writeSync(fd,data,offset,length,position){const count=fs.writeSync(fd,data,offset,partial?Math.min(length,11):length,position);if(!appended){appended=true;fs.appendFileSync(readme,'Concurrent append');}return count;},ftruncateSync(){assert.fail('No original truncate boundary exists');}};
    assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/changed[\s\S]*not replaced/);
    assert.ok(fs.readFileSync(readme,'utf8').endsWith('Concurrent append'));
  });
});
test('writes through an old open descriptor survive replacement in a retained inode backup',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md'),old=fs.openSync(readme,'a');t.after(()=>fs.closeSync(old));let appended=false;
  const io={...fs,linkSync(source,target){fs.linkSync(source,target);if(target===readme&&!appended){appended=true;fs.writeSync(old,Buffer.from('Old descriptor append'));}}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/could not be restored[\s\S]*Recovery copies/);
  const saved=copies(h)[0];assert.ok(fs.readFileSync(path.join(saved,'original-README.md'),'utf8').endsWith('Old descriptor append'));
  assert.deepEqual(fs.readFileSync(readme),h.current.get('.zero-web/README.md'));
});
test('oversized concurrent growth before a failed owner install is preserved without unbounded recovery reads',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md'),old=fs.openSync(readme,'a');t.after(()=>fs.closeSync(old));let failed=false,maxRead=0;
  const io={...fs,readFileSync(){assert.fail('Unbounded recovery read');},readSync(fd,buffer,offset,length,position){maxRead=Math.max(maxRead,length);assert.ok(length<=256*1024);return fs.readSync(fd,buffer,offset,length,position);},linkSync(source,target){if(path.basename(target)==='owner.json'&&!failed){failed=true;fs.writeSync(old,Buffer.alloc(1024*1024,120));throw Error('Owner install failed');}return fs.linkSync(source,target);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/could not be restored[\s\S]*Recovery copies/);
  assert.ok(maxRead<=256*1024);
  assert.equal(fs.statSync(path.join(copies(h)[0],'original-README.md')).size,h.legacy.get('.zero-web/README.md').length+1024*1024);
  assert.deepEqual(fs.readFileSync(readme),h.current.get('.zero-web/README.md'));
});
test('recreating a source path while absent is preserved by exclusive installation',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md');let recreated=false;
  const io={...fs,renameSync(source,target){fs.renameSync(source,target);if(source===readme&&!recreated){recreated=true;fs.writeFileSync(readme,'Concurrent replacement');}}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/could not be restored/);
  assert.equal(fs.readFileSync(readme,'utf8'),'Concurrent replacement');
  assert.deepEqual(fs.readFileSync(path.join(copies(h)[0],'original-README.md')),h.legacy.get('.zero-web/README.md'));
});
test('a replacement immediately before the original move is preserved in recovery',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md');let replaced=false;
  const io={...fs,renameSync(source,target){if(source===readme&&!replaced){replaced=true;fs.renameSync(readme,readme+'.moved');fs.writeFileSync(readme,'Concurrent replacement');}fs.renameSync(source,target);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/could not be restored/);
  assert.equal(fs.readFileSync(path.join(copies(h)[0],'original-README.md'),'utf8'),'Concurrent replacement');
  assert.deepEqual(fs.readFileSync(readme+'.moved'),h.legacy.get('.zero-web/README.md'));
});
test('new source edits survive failed owner installation and rollback',async t=>{
  const h=await fixture(t),review=migration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md');let failed=false;
  const io={...fs,linkSync(source,target){if(path.basename(target)==='owner.json'&&!failed){failed=true;fs.writeFileSync(readme,'New source edit');throw Error('Owner install failed');}return fs.linkSync(source,target);}};
  assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/could not be restored/);
  assert.equal(fs.readFileSync(readme,'utf8'),'New source edit');
});
test('hardlinks, Git-file worktrees and substituted parent directories fail closed',async t=>{
  for(const kind of ['hardlink','worktree','parent'])await t.test(kind,async t=>{
    const h=await fixture(t),readme=path.join(h.root,'.zero-web/README.md');
    if(kind==='hardlink'){fs.linkSync(readme,path.join(h.root,'alias'));assert.throws(()=>migration.inspect(h.root,h.current),/hard links/);return;}
    const review=migration.inspect(h.root,h.current);
    if(kind==='worktree'){fs.rmdirSync(path.join(h.root,'.git'));fs.writeFileSync(path.join(h.root,'.git'),'gitdir: elsewhere');assert.throws(()=>migration.apply(h.root,h.current,review.original),/ordinary Git clone/);unchanged(h);return;}
    let changed=false;const io={...fs,writeSync(...args){const count=fs.writeSync(...args);if(!changed){changed=true;fs.renameSync(path.join(h.root,'.zero-web'),path.join(h.root,'moved'));fs.symlinkSync(path.join(h.root,'moved'),path.join(h.root,'.zero-web'));}return count;}};
    assert.throws(()=>migration.apply(h.root,h.current,review.original,io),/paths changed/);
    assert.deepEqual(fs.readFileSync(path.join(h.root,'moved/README.md')),h.legacy.get('.zero-web/README.md'));
  });
});

// Keep native filesystem paths while making relative() return Windows-style
// separators. The former directory classifier rejected every file in this case.
test('Windows-style relative paths distinguish file leaves from guarded parent directories',async t=>{
  const vm=require('node:vm'),loaded={exports:{}};
  const windowsRelative={...path,relative:(...args)=>path.relative(...args).split(path.sep).join('\\')};
  assert.ok(windowsRelative.relative('/root','/root/.zero-web/README.md').includes('\\'));
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/web-publish-migration'),'utf8'),{module:loaded,Buffer,require:specifier=>specifier==='node:path'?windowsRelative:require(specifier)},{filename:'web-publish-migration-windows-relative.js'});
  const windowsMigration=loaded.exports;
  for(const kind of ['clean','parent','leaf'])await t.test(kind,async t=>{
    const h=await fixture(t),review=windowsMigration.inspect(h.root,h.current),readme=path.join(h.root,'.zero-web/README.md');let changed=false;
    const io={...fs,writeSync(...args){const count=fs.writeSync(...args);if(!changed){changed=true;if(kind==='parent'){fs.renameSync(path.join(h.root,'.zero-web'),path.join(h.root,'moved'));fs.symlinkSync(path.join(h.root,'moved'),path.join(h.root,'.zero-web'));}if(kind==='leaf')fs.writeFileSync(readme,'Concurrent leaf edit');}return count;}};
    if(kind==='clean') {
      windowsMigration.apply(h.root,h.current,review.original,io);
      for(const [name,data]of h.current)assert.deepEqual(fs.readFileSync(path.join(h.root,name)),data);
    }else {
      assert.throws(()=>windowsMigration.apply(h.root,h.current,review.original,io),/changed/);
      if(kind==='leaf')assert.equal(fs.readFileSync(readme,'utf8'),'Concurrent leaf edit');
      else assert.deepEqual(fs.readFileSync(path.join(h.root,'moved/README.md')),h.legacy.get('.zero-web/README.md'));
    }
  });
});
