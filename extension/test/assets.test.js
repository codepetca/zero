'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {captureRoot,inspectSources,hasCollisions,importFiles,javaResourcePath,createAssetCommands}=require('../src/assets');
async function fixture(t) {
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-assets-')));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'project'),source=path.join(base,'source');await fs.mkdir(root);await fs.mkdir(source);
 const folder=path.join(root,'src/main/resources');const snapshot=await captureRoot(root);let current=root;
 const assertCurrent=async()=>{if(current!==root)throw Error('project changed');};
 async function files(names=['coin.wav']) {const selected=[];for(const name of names){const filename=path.join(source,name);await fs.writeFile(filename,'original '+name);selected.push(filename);}return inspectSources(selected);}
 return {base,root,source,folder,snapshot,assertCurrent,files,set current(value){current=value;},run:options=>importFiles({snapshot,assertCurrent,...options})};
}
test('imports selected audio/images into missing resources with usable Java paths; preserves originals',async t=>{
 const f=await fixture(t),sources=await f.files(['jump.wav','coin space.png']);
 const result=await f.run({sources});assert.equal(result.imported.length,2);
 for(const item of result.imported){assert.equal(await fs.readFile(item.path,'utf8'),'original '+item.name);assert.equal(await fs.readFile(path.join(f.source,item.name),'utf8'),'original '+item.name);assert.equal(item.javaPath,JSON.stringify('/'+item.name));}
});
test('keep both preserves existing bytes including case-insensitive collisions',async t=>{
 const f=await fixture(t),sources=await f.files();await fs.mkdir(f.folder,{recursive:true});await fs.writeFile(path.join(f.folder,'COIN.wav'),'keep');
 assert.equal(await hasCollisions(f.snapshot,sources,f.assertCurrent),true);
 const result=await f.run({sources});assert.equal(result.imported[0].name,'coin (2).wav');assert.equal(await fs.readFile(path.join(f.folder,'COIN.wav'),'utf8'),'keep');
});
test('skip collision leaves files untouched and counts actual skipped files',async t=>{
 const f=await fixture(t),sources=await f.files();await fs.mkdir(f.folder,{recursive:true});await fs.writeFile(path.join(f.folder,'coin.wav'),'keep');
 const result=await f.run({sources,policy:'skip'});assert.equal(result.imported.length,0);assert.deepEqual(result.skipped,['coin.wav']);assert.equal(await fs.readFile(path.join(f.folder,'coin.wav'),'utf8'),'keep');
});
test('multiple selected files sharing names get distinct portable paths',async t=>{
 const f=await fixture(t);await f.files();const other=path.join(f.base,'other');await fs.mkdir(other);await fs.writeFile(path.join(other,'coin.wav'),'other');
 const sources=await inspectSources([path.join(f.source,'coin.wav'),path.join(other,'coin.wav')]);
 assert.equal(await hasCollisions(f.snapshot,sources,f.assertCurrent),false,'missing resources avoids unnecessary collision question; keep both remains safe');
 const result=await f.run({sources});assert.deepEqual(result.imported.map(item=>item.name),['coin.wav','coin (2).wav']);
});
test('pre-import cancellation creates no resources; mid-import cancellation preserves actual completed files',async t=>{
 const f=await fixture(t),sources=await f.files(['a.wav','b.wav']);
 let result=await f.run({sources,cancelled:()=>true});assert.equal(result.cancelled,true);await assert.rejects(fs.stat(f.folder),/ENOENT/);
 let stop=false;result=await f.run({sources,cancelled:()=>stop,onImported:()=>{stop=true;}});assert.equal(result.imported.length,1);assert.equal(result.cancelled,true);assert.deepEqual(await fs.readdir(f.folder),['a.wav']);
});
test('project drift before import prevents mutation and drift between files reports partial outcome',async t=>{
 const f=await fixture(t),sources=await f.files(['a.wav','b.wav']);f.current='different';
 await assert.rejects(f.run({sources}),/project changed/);await assert.rejects(fs.stat(f.folder),/ENOENT/);
 f.current=f.root;await assert.rejects(f.run({sources,onImported:()=>{f.current='different';}}),error=>{assert.equal(error.assetResult.imported.length,1);return /project changed/.test(error.message);});assert.deepEqual(await fs.readdir(f.folder),['a.wav']);
});
test('root replacement is rejected even if its path stays the same',async t=>{
 const f=await fixture(t),sources=await f.files();await fs.rename(f.root,f.root+'-old');await fs.mkdir(f.root);
 await assert.rejects(f.run({sources}),/project folder changed/);await assert.rejects(fs.stat(f.folder),/ENOENT/);
});
test('source and destination symlinks and linked ancestors cannot redirect import',async t=>{
 const f=await fixture(t);await f.files();const link=path.join(f.source,'link.wav');await fs.symlink(path.join(f.source,'coin.wav'),link);
 await assert.rejects(inspectSources([link]),/without symbolic links/);
 const linked=path.join(f.base,'linked');await fs.symlink(f.source,linked);await assert.rejects(inspectSources([path.join(linked,'coin.wav')]),/without symbolic links/);
 await fs.mkdir(path.join(f.root,'src'));await fs.symlink(f.source,path.join(f.root,'src/main'));
 await assert.rejects(f.run({sources:await inspectSources([path.join(f.source,'coin.wav')])}),/without symbolic links/);await assert.rejects(fs.stat(path.join(f.source,'resources')),/ENOENT/);
});
test('existing destination symlink is never followed or replaced',async t=>{
 const f=await fixture(t),sources=await f.files();await fs.mkdir(f.folder,{recursive:true});await fs.symlink(sources[0].filename,path.join(f.folder,'coin.wav'));
 const result=await f.run({sources});assert.equal(result.imported[0].name,'coin (2).wav');assert.equal((await fs.lstat(path.join(f.folder,'coin.wav'))).isSymbolicLink(),true);
});
test('source drift after selection fails without writing',async t=>{
 const f=await fixture(t),sources=await f.files();await fs.writeFile(sources[0].filename,'changed');await assert.rejects(f.run({sources}),/selected asset changed/);await assert.rejects(fs.stat(f.folder),/ENOENT/);
});
test('bounded regular media file selection rejects unsupported names, folders, count and bytes',async t=>{
 const f=await fixture(t);const sources=await f.files();
 await assert.rejects(inspectSources([sources[0].filename],{files:0,fileBytes:100,totalBytes:100}),/at most 0/);
 await assert.rejects(inspectSources([sources[0].filename],{files:2,fileBytes:1,totalBytes:100}),/too large/);
 await assert.rejects(inspectSources([sources[0].filename],{files:2,fileBytes:100,totalBytes:1}),/too large/);
 await fs.mkdir(path.join(f.source,'folder.wav'));await assert.rejects(inspectSources([path.join(f.source,'folder.wav')]),/ordinary image or audio/);
 await fs.writeFile(path.join(f.source,'secret.env'),'no');await assert.rejects(inspectSources([path.join(f.source,'secret.env')]),/image or audio/);
 await fs.writeFile(path.join(f.source,'CON.wav'),'no');await assert.rejects(inspectSources([path.join(f.source,'CON.wav')]),/portable filenames/);
});
test('Java resource literals escape paths instead of inserting raw source syntax',()=>{
 assert.equal(javaResourcePath('a"b\\c.wav'),'"/a\\"b\\\\c.wav"');assert.equal(javaResourcePath('a\u2028b.wav'),'"/a\\u2028b.wav"');
});
async function uiFixture(t) {
 const f=await fixture(t),sources=await f.files();const states=[],logs=[],dialogs=[];let busy=false,selection=sources.map(s=>({fsPath:s.filename,scheme:'file'})),choice,token={};
 const vscode={workspace:{isTrusted:true},ProgressLocation:{Notification:15},env:{clipboard:{writeText:async text=>{f.copied=text;}}},window:{showOpenDialog:async options=>{dialogs.push(options);return selection;},showQuickPick:async()=>choice,withProgress:async(options,work)=>work(undefined,token)}};
 const commands=createAssetCommands(vscode,{project:async()=>f.currentRoot || f.root,isBusy:()=>busy,setBusy:value=>{busy=value;},setState:text=>states.push(text),output:{appendLine:text=>logs.push(text)}});
 return Object.assign(f,{vscode,commands,states,logs,dialogs,setSelection:value=>{selection=value;},setChoice:value=>{choice=value;},setToken:value=>{token=value;},busy:()=>busy});
}
test('native UI cancellation and collision cancellation do not mutate files or leave busy state',async t=>{
 const f=await uiFixture(t);f.setSelection(undefined);await f.commands.commands['zero.importAssets']();assert.equal(f.busy(),false);await assert.rejects(fs.stat(f.folder),/ENOENT/);
 f.setSelection([{fsPath:path.join(f.source,'coin.wav')}]);await fs.mkdir(f.folder,{recursive:true});await fs.writeFile(path.join(f.folder,'coin.wav'),'keep');await f.commands.commands['zero.importAssets']();assert.equal(await fs.readFile(path.join(f.folder,'coin.wav'),'utf8'),'keep');assert.deepEqual(await fs.readdir(f.folder),['coin.wav']);assert.equal(f.busy(),false);
});
test('trust guard, root drift after picker, and disposal prevent writes',async t=>{
 const f=await uiFixture(t);f.vscode.workspace.isTrusted=false;await assert.rejects(f.commands.commands['zero.importAssets'](),/Trust your own/);assert.equal(f.dialogs.length,0);
 f.vscode.workspace.isTrusted=true;f.vscode.window.showOpenDialog=async()=>{f.currentRoot='elsewhere';return [{fsPath:path.join(f.source,'coin.wav')}];};await assert.rejects(f.commands.commands['zero.importAssets'](),/project changed/);await assert.rejects(fs.stat(f.folder),/ENOENT/);
 f.commands.dispose();await f.commands.commands['zero.importAssets']();assert.equal(f.busy(),false);
});
test('success reports Java paths in output and supports explicitly copying them, without popup',async t=>{
 const f=await uiFixture(t);await f.commands.commands['zero.importAssets']();assert.equal(f.commands.canCopyPaths(),true);assert.ok(f.logs.includes('"/coin.wav"'));assert.match(f.states.at(-1),/Added 1 asset/);await f.commands.commands['zero.copyImportedAssetPaths']();assert.equal(f.copied,'"/coin.wav"');
 f.currentRoot='elsewhere';await assert.rejects(f.commands.commands['zero.copyImportedAssetPaths'](),/current trusted project/);f.commands.dispose();assert.equal(f.commands.canCopyPaths(),false);
});
test('normalization-equivalent Unicode names are detected and kept or skipped without overwriting',async t=>{
 for(const policy of ['keep','skip']) {
  const f=await fixture(t),sources=await f.files(['caf\u00e9.png']);await fs.mkdir(f.folder,{recursive:true});
  const existing=path.join(f.folder,'cafe\u0301.png');await fs.writeFile(existing,'existing decomposed asset');
  assert.equal(await hasCollisions(f.snapshot,sources,f.assertCurrent),true);
  const result=await f.run({sources,policy});assert.equal(await fs.readFile(existing,'utf8'),'existing decomposed asset');
  if(policy==='keep'){assert.equal(result.imported.length,1);assert.equal(result.imported[0].name,'caf\u00e9 (2).png');assert.equal(await fs.readFile(result.imported[0].path,'utf8'),'original caf\u00e9.png');}else{assert.equal(result.imported.length,0);assert.deepEqual(result.skipped,['caf\u00e9.png']);}
 }
});
test('exclusive-create collisions absent from enumeration advance names, and Skip exits immediately',async t=>{
 const {constants}=require('node:fs');
 for(const policy of ['keep','skip']) {
  const f=await fixture(t),sources=await f.files(),originalOpen=fs.open,candidates=[];
  const mock=t.mock.method(fs,'open',async(filename,flags,...args)=>{
   if(flags&constants.O_EXCL){candidates.push(path.basename(filename));if(candidates.length<=2)throw Object.assign(Error('filesystem alias or race'),{code:'EEXIST'});}
   return originalOpen(filename,flags,...args);
  });
  try {
   const result=await f.run({sources,policy});
   if(policy==='keep'){assert.deepEqual(candidates,['coin.wav','coin (2).wav','coin (3).wav']);assert.equal(result.imported[0].name,'coin (3).wav');}else{assert.deepEqual(candidates,['coin.wav']);assert.deepEqual(result.skipped,['coin.wav']);assert.equal(result.imported.length,0);}
  }finally{mock.mock.restore();}
 }
});
test('continual exclusive-create races stop after a bounded number of distinct candidates',async t=>{
 const {constants}=require('node:fs'),{MAX_NAME_ATTEMPTS}=require('../src/assets');
 const f=await fixture(t),sources=await f.files(),originalOpen=fs.open,candidates=[];
 await fs.mkdir(f.folder,{recursive:true});await fs.writeFile(path.join(f.folder,'keep.wav'),'untouched');
 const mock=t.mock.method(fs,'open',async(filename,flags,...args)=>{
  if(flags&constants.O_EXCL){candidates.push(filename);throw Object.assign(Error('racing file creation'),{code:'EEXIST'});}
  return originalOpen(filename,flags,...args);
 });
 try {
  await assert.rejects(f.run({sources}),error=>{assert.match(error.message,/Too many matching asset names.*Rename/);assert.equal(error.assetResult.imported.length,0);return true;});
  assert.equal(candidates.length,MAX_NAME_ATTEMPTS);assert.equal(new Set(candidates).size,MAX_NAME_ATTEMPTS);assert.equal(await fs.readFile(path.join(f.folder,'keep.wav'),'utf8'),'untouched');assert.equal(await fs.readFile(sources[0].filename,'utf8'),'original coin.wav');
 }finally{mock.mock.restore();}
});
