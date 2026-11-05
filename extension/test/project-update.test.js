'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const update=require('../src/project-update'),core=require('../src/core-contract'),format=require('../src/project-builder-format');
const {loadBundle}=require('../src/lesson-projects'),{readSavedBuilder}=require('../src/project-builder');
const extensionPath=path.resolve(__dirname,'..');
async function fixture(t,{older=false,builderOlder=false}={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero unified update ')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const project=path.join(root,'project');await fs.mkdir(project);
 for(const file of (await loadBundle(extensionPath))[0].files){const dest=path.join(project,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.content);}
 if(older){
  const filename=path.join(project,'zero-core.json'),record=JSON.parse(await fs.readFile(filename));
  record.coordinate.version='0.2.9';const first=record.sources[0];await fs.appendFile(path.join(project,first.path),'\n// Earlier recorded framework.\n');
  first.sha256=format.sha256(Buffer.from(core.normalizeSource(await fs.readFile(path.join(project,first.path)))));record.sourceSha256=format.sha256(Buffer.from(JSON.stringify(record.sources)));
  await fs.writeFile(filename,JSON.stringify(record,null,2)+'\n');
 }
 if(builderOlder){
  const builder=path.join(project,'.zero-build');await fs.appendFile(path.join(builder,'README.md'),'\nPrevious builder.\n');
  const manifest=JSON.parse(await fs.readFile(path.join(builder,'builder.json'))),files=await Promise.all(manifest.files.map(async file=>({path:file.path,bytes:await fs.readFile(path.join(builder,file.path))})));
  await fs.writeFile(path.join(builder,'builder.json'),JSON.stringify(format.createBuilderManifest(files),null,2)+'\n');
 }
 return {project,root};
}
async function files(root){
 const result={};async function walk(folder,prefix=''){for(const entry of await fs.readdir(folder,{withFileTypes:true})){if(entry.name.startsWith('.zero-update-'))continue;const name=prefix+entry.name;if(entry.isDirectory())await walk(path.join(folder,entry.name),name+'/');else result[name]=await fs.readFile(path.join(folder,entry.name));}}await walk(root);return result;
}
test('current version is a no-op and creates no recovery folder',async t=>{
 const {project}=await fixture(t),before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath});
 assert.equal(plan.changed,false);assert.equal(plan.coreChanged,false);assert.equal(plan.builderChanged,false);
 assert.equal((await update.applyUpdate(plan)).recoveryPath,null);assert.deepEqual(await files(project),before);assert.deepEqual(await update.listRecoveries({projectRoot:project}),[]);
});
test('updates both recorded components and explicitly recovers exact old bytes without changing student work',async t=>{
 const {project}=await fixture(t,{older:true,builderOlder:true});
 await fs.writeFile(path.join(project,'src/main/java/Main.java'),'// student work\r\n');await fs.appendFile(path.join(project,'pom.xml'),'\n<!-- preserve custom POM -->');await fs.mkdir(path.join(project,'libraries'));await fs.writeFile(path.join(project,'libraries/notes.txt'),'own library');
 const before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath});assert.equal(plan.coreChanged,true);assert.equal(plan.builderChanged,true);
 const result=await update.applyUpdate(plan);assert.ok(result.backupPath);assert.equal((await update.planUpdate({projectRoot:project,extensionPath})).changed,false);
 for(const name of ['src/main/java/Main.java','pom.xml','libraries/notes.txt'])assert.deepEqual(await fs.readFile(path.join(project,name)),before[name]);
 assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'complete');
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});assert.deepEqual(await files(project),before);
 assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'recovered');
});
test('modified, missing, extra framework and bad records fail preflight without writes',async t=>{
 for(const kind of ['modified','missing','extra','record']){
  const {project}=await fixture(t,{older:true});const name=path.join(project,'src/main/java/zero/App.java');
  if(kind==='modified')await fs.appendFile(name,'student change');
  if(kind==='missing')await fs.unlink(name);
  if(kind==='extra')await fs.writeFile(path.join(project,'src/main/java/zero/Student.java'),'class Student {}');
  if(kind==='record')await fs.writeFile(path.join(project,'zero-core.json'),'{}');
  const before=await files(project);await assert.rejects(update.planUpdate({projectRoot:project,extensionPath}));assert.deepEqual(await files(project),before);assert.deepEqual(await update.listRecoveries({projectRoot:project}),[]);
 }
});
test('new framework target collisions are rejected before writes',async t=>{
 const {project}=await fixture(t,{older:true}),name='src/main/java/zero/App.java';
 const filename=path.join(project,'zero-core.json'),record=JSON.parse(await fs.readFile(filename));record.sources=record.sources.filter(entry=>entry.path!==name);record.sourceSha256=format.sha256(Buffer.from(JSON.stringify(record.sources)));await fs.writeFile(filename,JSON.stringify(record));
 const before=await files(project);await assert.rejects(update.planUpdate({projectRoot:project,extensionPath}),/missing or extra/);assert.deepEqual(await files(project),before);
});
test('review drift and linked or hard-linked framework paths cannot be replaced',async t=>{
 const {project,root}=await fixture(t,{older:true}),plan=await update.planUpdate({projectRoot:project,extensionPath}),filename=path.join(project,'src/main/java/zero/App.java');
 await fs.appendFile(filename,'student edit');await assert.rejects(update.applyUpdate(plan),/baseline|changed/);assert.match(await fs.readFile(filename,'utf8'),/student edit/);
 const other=await fixture(t,{older:true});await fs.link(path.join(other.project,'src/main/java/zero/App.java'),path.join(root,'linked.java'));await assert.rejects(update.planUpdate({projectRoot:other.project,extensionPath}),/ordinary/);
 if(process.platform!=='win32'){const third=await fixture(t,{older:true}),source=path.join(third.project,'src/main/java/zero/App.java');await fs.rename(source,source+'.real');await fs.symlink(source+'.real',source);await assert.rejects(update.planUpdate({projectRoot:third.project,extensionPath}),/symbolic|ordinary/);}
});
test('partial cross-component failure is discoverable, blocks another update, and recovers originals',async t=>{
 const {project}=await fixture(t,{older:true,builderOlder:true}),before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath});
 const original=fs.writeFile;let failed=false,error;
 try{fs.writeFile=async(where,...args)=>{if(where===path.join(project,'src/main/java/zero/Actor.java')&&!failed){failed=true;throw Error('injected partial update');}return original(where,...args);};await update.applyUpdate(plan);}catch(caught){error=caught;}finally{fs.writeFile=original;}
 assert.match(error.message,/injected partial update/);assert.ok(error.recoveryPath);assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'incomplete');
 await assert.rejects(update.planUpdate({projectRoot:project,extensionPath}),/incomplete update needs recovery/);
 await update.recoverUpdate({projectRoot:project,recoveryPath:error.recoveryPath});assert.deepEqual(await files(project),before);assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'recovered');
});
test('recovery refuses later student edits before restoring any other path',async t=>{
 const {project}=await fixture(t,{older:true,builderOlder:true}),result=await update.applyUpdate(await update.planUpdate({projectRoot:project,extensionPath}));
 await fs.appendFile(path.join(project,'src/main/java/zero/Actor.java'),'\nstudent later edit');const before=await files(project);
 await assert.rejects(update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath}),/overwrite changed work/);assert.deepEqual(await files(project),before);
});
test('explicit install and recovery of a missing builder leaves it absent again',async t=>{
 const {project}=await fixture(t);await fs.rm(path.join(project,'.zero-build'),{recursive:true});
 const before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath});assert.equal(plan.coreChanged,false);assert.equal(plan.builderChanged,true);
 const result=await update.applyUpdate(plan);assert.equal((await readSavedBuilder(project)).profileHash,plan.newProfileHash);
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});assert.deepEqual(await files(project),before);await assert.rejects(fs.lstat(path.join(project,'.zero-build')),{code:'ENOENT'});
});
test('mid-file write failures retain unknown partial bytes until explicitly moved aside',async t=>{
 const {project,root}=await fixture(t,{older:true}),before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath});
 const filename=path.join(project,'src/main/java/zero/Actor.java'),original=fs.writeFile;let error;
 try{fs.writeFile=async(where,bytes,...args)=>{if(where===filename){await original(where,Buffer.from(bytes).subarray(0,20),...args);throw Error('injected partial file write');}return original(where,bytes,...args);};await update.applyUpdate(plan);}catch(caught){error=caught;}finally{fs.writeFile=original;}
 assert.match(error.message,/injected partial file write/);const partial=await fs.readFile(filename),failed=await files(project);
 await assert.rejects(update.recoverUpdate({projectRoot:project,recoveryPath:error.recoveryPath}),/overwrite changed work/);assert.deepEqual(await files(project),failed);
 await fs.rename(filename,path.join(root,'student-preserved-partial.java'));
 await update.recoverUpdate({projectRoot:project,recoveryPath:error.recoveryPath});assert.deepEqual(await files(project),before);assert.deepEqual(await fs.readFile(path.join(root,'student-preserved-partial.java')),partial);
});
test('a concurrent recovery-destination file is never overwritten',async t=>{
 const {project}=await fixture(t,{older:true}),before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath}),copy=fs.copyFile;let error,collision;
 try{fs.copyFile=async(source,destination,...args)=>{if(destination.includes(path.sep+'moved'+path.sep)&&!collision){collision=destination;await fs.writeFile(destination,'keep concurrent destination');}return copy(source,destination,...args);};await update.applyUpdate(plan);}catch(caught){error=caught;}finally{fs.copyFile=copy;}
 assert.equal(error.code,'EEXIST');assert.deepEqual(await files(project),before);assert.equal(await fs.readFile(collision,'utf8'),'keep concurrent destination');
 await update.recoverUpdate({projectRoot:project,recoveryPath:error.recoveryPath});assert.deepEqual(await files(project),before);assert.equal(await fs.readFile(collision,'utf8'),'keep concurrent destination');
});
test('retired framework files are removed only from the recorded baseline and can be restored',async t=>{
 const {project}=await fixture(t,{older:true}),filename=path.join(project,'zero-core.json'),record=JSON.parse(await fs.readFile(filename));
 const name='src/main/java/zero/legacy/Old.java',bytes=Buffer.from('package zero.legacy; class Old {}\n');await fs.mkdir(path.dirname(path.join(project,name)));await fs.writeFile(path.join(project,name),bytes);
 record.sources.push({path:name,sha256:format.sha256(bytes)});record.sources.sort((a,b)=>a.path<b.path?-1:1);record.sourceSha256=format.sha256(Buffer.from(JSON.stringify(record.sources)));await fs.writeFile(filename,JSON.stringify(record));
 const before=await files(project),result=await update.applyUpdate(await update.planUpdate({projectRoot:project,extensionPath}));await assert.rejects(fs.lstat(path.join(project,name)),{code:'ENOENT'});assert.equal((await update.planUpdate({projectRoot:project,extensionPath})).changed,false);
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});assert.deepEqual(await files(project),before);
});
test('unchanged framework CRLF bytes and modes survive updating and recovering other files',async t=>{
 const {project}=await fixture(t,{older:true,builderOlder:true});
 const name='src/main/java/zero/ui/Button.java',filename=path.join(project,name),original=await fs.readFile(filename,'utf8');
 await fs.writeFile(filename,original.replace(/\r?\n/g,'\r\n'));await fs.chmod(filename,0o600);
 const before=await fs.readFile(filename),mode=(await fs.stat(filename)).mode&0o777,stat=await fs.stat(filename);
 const unchangedBuilder='.zero-build/src/project-builder-format.js',builderBefore=await fs.readFile(path.join(project,unchangedBuilder)),builderStat=await fs.stat(path.join(project,unchangedBuilder));
 const result=await update.applyUpdate(await update.planUpdate({projectRoot:project,extensionPath}));
 assert.deepEqual(await fs.readFile(filename),before);assert.equal((await fs.stat(filename)).mode&0o777,mode);assert.equal((await fs.stat(filename)).ino,stat.ino);
 assert.deepEqual(await fs.readFile(path.join(project,unchangedBuilder)),builderBefore);assert.equal((await fs.stat(path.join(project,unchangedBuilder))).ino,builderStat.ino);
 const journal=JSON.parse(await fs.readFile(path.join(result.recoveryPath,'journal.json')));assert.equal(journal.entries.some(entry=>entry.path===name||entry.path===unchangedBuilder),false);
 assert.equal((await update.planUpdate({projectRoot:project,extensionPath})).changed,false);
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});
 assert.deepEqual(await fs.readFile(filename),before);assert.equal((await fs.stat(filename)).mode&0o777,mode);assert.equal((await fs.stat(filename)).ino,stat.ino);
});
test('recovery interrupted after preserving live bytes retries from durable progress',async t=>{
 const {project}=await fixture(t,{older:true,builderOlder:true}),before=await files(project),result=await update.applyUpdate(await update.planUpdate({projectRoot:project,extensionPath}));
 const target=path.join(project,'.zero-build/README.md'),write=fs.writeFile;let failed=false;
 try{fs.writeFile=async(where,...args)=>{if(where===target&&!failed){failed=true;throw Error('interrupted old-file restoration');}return write(where,...args);};await assert.rejects(update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath}),/interrupted old-file restoration/);}finally{fs.writeFile=write;}
 assert.equal(failed,true);await assert.rejects(fs.lstat(target),{code:'ENOENT'});
 const held=(await fs.readdir(result.recoveryPath)).filter(name=>name.startsWith('recovered-'));assert.ok(held.length);
 const progress=await Promise.all(held.map(async name=>JSON.parse(await fs.readFile(path.join(result.recoveryPath,name,'progress.json')))));
 assert.ok(progress.some(entry=>entry.path==='.zero-build/README.md'));
 assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'incomplete');
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});assert.deepEqual(await files(project),before);
 assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'recovered');
});
test('recovery progress never permits replacing work created while recovery was interrupted',async t=>{
 const {project}=await fixture(t,{older:true,builderOlder:true}),result=await update.applyUpdate(await update.planUpdate({projectRoot:project,extensionPath}));
 const target=path.join(project,'.zero-build/README.md'),write=fs.writeFile;let failed=false;
 try{fs.writeFile=async(where,...args)=>{if(where===target&&!failed){failed=true;throw Error('interrupted restore');}return write(where,...args);};await assert.rejects(update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath}),/interrupted restore/);}finally{fs.writeFile=write;}
 await fs.writeFile(target,'student work after interruption');const before=await files(project);
 await assert.rejects(update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath}),/overwrite changed work/);assert.deepEqual(await files(project),before);
});
test('empty or truncated update completion markers stay discoverable and can be recovered',async t=>{
 for(const partial of ['', 'comp']){
  const {project}=await fixture(t,{older:true}),before=await files(project),plan=await update.planUpdate({projectRoot:project,extensionPath}),write=fs.writeFile;let error;
  try{fs.writeFile=async(where,bytes,...args)=>{if(path.basename(where)==='complete'){await write(where,partial,...args);throw Error('interrupted completion marker');}return write(where,bytes,...args);};await update.applyUpdate(plan);}catch(caught){error=caught;}finally{fs.writeFile=write;}
  assert.match(error.message,/interrupted completion marker/);const recoveries=await update.listRecoveries({projectRoot:project});assert.equal(recoveries.length,1);assert.equal(recoveries[0].status,'incomplete');
  await assert.rejects(update.planUpdate({projectRoot:project,extensionPath}),/Recover Project Update/);
  await update.recoverUpdate({projectRoot:project,recoveryPath:error.recoveryPath});assert.deepEqual(await files(project),before);assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'recovered');
 }
});
test('an interrupted recovery completion marker can itself be retried',async t=>{
 const {project}=await fixture(t,{older:true}),before=await files(project),result=await update.applyUpdate(await update.planUpdate({projectRoot:project,extensionPath})),write=fs.writeFile;
 try{fs.writeFile=async(where,bytes,...args)=>{if(where===path.join(result.recoveryPath,'complete')){await write(where,'rec',...args);throw Error('interrupted recovered marker');}return write(where,bytes,...args);};await assert.rejects(update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath}),/interrupted recovered marker/);}finally{fs.writeFile=write;}
 assert.deepEqual(await files(project),before);assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'incomplete');
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});assert.deepEqual(await files(project),before);assert.equal((await update.listRecoveries({projectRoot:project}))[0].status,'recovered');
});

test('project update delivers Zero license without replacing the project license',async t=>{
 const {project}=await fixture(t,{older:true});
 const builder=path.join(project,'.zero-build'), notice='src/web-export/notices/ZERO-LICENSE.txt';
 await fs.unlink(path.join(builder,notice));
 const manifest=JSON.parse(await fs.readFile(path.join(builder,'builder.json')));
 const oldFiles=await Promise.all(manifest.files.filter(file=>file.path!==notice).map(async file=>({path:file.path,bytes:await fs.readFile(path.join(builder,file.path))})));
 await fs.writeFile(path.join(builder,'builder.json'),JSON.stringify(format.createBuilderManifest(oldFiles),null,2)+'\n');
 const original=Buffer.from('Student-owned project license\n');
 await fs.writeFile(path.join(project,'LICENSE'),original);
 const plan=await update.planUpdate({projectRoot:project,extensionPath});
 assert.equal(plan.changed,true);
 const result=await update.applyUpdate(plan);
 assert.deepEqual(await fs.readFile(path.join(project,'LICENSE')),original);
 assert.deepEqual(await fs.readFile(path.join(project,'.zero-build',notice)),await fs.readFile(path.join(extensionPath,'..','LICENSE')));
 await update.recoverUpdate({projectRoot:project,recoveryPath:result.recoveryPath});
 assert.deepEqual(await fs.readFile(path.join(project,'LICENSE')),original);
 await assert.rejects(fs.lstat(path.join(project,'.zero-build',notice)),{code:'ENOENT'});
});
