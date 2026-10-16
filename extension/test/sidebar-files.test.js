'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createSidebarFiles} = require('../src/sidebar-files');
async function fixture(t) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-files-')));
  t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  async function make(name) {
    const root=path.join(parent,name);
    await fs.mkdir(path.join(root,'src/main/java/zero'),{recursive:true});
    await fs.mkdir(path.join(root,'src/main/resources'),{recursive:true});
    await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}');
    await fs.writeFile(path.join(root,'README.md'),'# App');
    return root;
  }
  let root=await make('first');const opened=[];
  const files=createSidebarFiles({project:async()=>root,open:filename=>opened.push(filename)});
  return {files,opened,parent,make,get root(){return root;},set root(value){root=value;}};
}
test('opaque file handles preserve app layout and reject client paths and stale projects',async t=>{
  const f=await fixture(t), list=await f.files.list();
  assert.deepEqual(list.items.map(item=>item.label),['Main.java','Resources','Toolkit','README.md','Project files']);
  assert.ok(list.items.every(item=>/^[a-f0-9]{32}$/.test(item.id) && !Object.hasOwn(item,'filename') && !Object.hasOwn(item,'uri')));
  const main=list.items[0];
  assert.equal(await f.files.openFile('../private',list.generation),false);
  assert.equal(await f.files.openFile(main.id,list.generation),true);
  assert.equal(f.opened[0],path.join(f.root,'src/main/java/Main.java'));
  const previous=f.root;f.root=await f.make('second');
  assert.equal(await f.files.openFile(main.id,list.generation),false);
  assert.equal(await f.files.list(list.items.at(-1).id,list.generation),null);
  const next=await f.files.list();assert.notEqual(next.generation,list.generation);
  f.root=previous;assert.equal(await f.files.openFile(main.id,list.generation),false,'Returning to an old root cannot reactivate old handles');
});
test('generated folders and symlinks are hidden; replaced files and parents never open outside project',async t=>{
  const f=await fixture(t);
  await fs.mkdir(path.join(f.root,'src/main/java/target'));
  const outside=path.join(f.parent,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'Main.java'),'private');
  await fs.symlink(outside,path.join(f.root,'src/main/java/escape'));
  const first=await f.files.list();assert.doesNotMatch(JSON.stringify(first),/escape|target/);
  const main=first.items.find(item=>item.label==='Main.java');
  await fs.rm(path.join(f.root,'src/main/java/Main.java'));
  await fs.symlink(path.join(outside,'Main.java'),path.join(f.root,'src/main/java/Main.java'));
  await assert.rejects(f.files.openFile(main.id,first.generation),/Symbolic links/);
  await fs.rm(path.join(f.root,'src/main/java/Main.java'));await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'safe');
  await fs.rename(path.join(f.root,'src/main/java'),path.join(f.root,'original-java'));
  await fs.symlink(outside,path.join(f.root,'src/main/java'));
  await assert.rejects(f.files.openFile(main.id,first.generation),/Symbolic links/);
  assert.deepEqual(f.opened,[]);
});
test('directory results are bounded and malicious filenames stay plain data',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.root,'src/main/java/<img onerror=bad>.java'),'plain');
  await Promise.all(Array.from({length:260},(_,i)=>fs.writeFile(path.join(f.root,`src/main/resources/${i}.txt`),'x')));
  const first=await f.files.list();assert.ok(first.items.some(item=>item.label==='<img onerror=bad>.java'));
  const resource=first.items.find(item=>item.label==='Resources'), children=await f.files.list(resource.id,first.generation);
  assert.equal(children.items.length,250);assert.equal(children.truncated,true);
  const again=await f.files.list(resource.id,first.generation);assert.deepEqual(again.items,children.items,'Handles stay stable across refresh for expansion/scroll state');
  const project=first.items.find(item=>item.label==='Project files');
  const extras=await f.files.list(project.id,first.generation);assert.ok(extras.items.every(item=>!['src','README.md'].includes(item.label)));
});
test('a reset during asynchronous project resolution invalidates the entire request',async t=>{
  const f=await fixture(t);let release;
  const files=createSidebarFiles({project:()=>new Promise(resolve=>{release=resolve;}),open:()=>assert.fail('Must not open')});
  const pending=files.list();files.reset();release(f.root);
  await assert.rejects(pending,/Project changed/);
});
