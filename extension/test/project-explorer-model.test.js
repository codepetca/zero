'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {readProjectModel,ordinaryEntries,isToolingPath,libraryDetails,LIMITS}=require('../src/project-explorer-model');
const authoring=require('../src/sharing/authoring');
const core=require('../src/core-contract');
const hash=text=>createHash('sha256').update(text).digest('hex');
const repository={id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'};
const descriptor={schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'An ordinary helper.',license:'MIT',libraryKind:'helper'};
async function put(root,name,text='') {await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-explorer-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'zero.json',JSON.stringify({name:'My Game',templateVersion:'0.1.0'}));
  await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
  await put(root,'src/main/java/Main.java','public class Main {}\n');
  return root;
}
async function extract(root) {
  await put(root,'src/main/java/Health.java','public class Health {}\n');
  await put(root,'LICENSE','MIT\n');
  await authoring.applyPlan(await authoring.previewExtraction(root,{repository,descriptor,sources:['src/main/java/Health.java']}));
}
function pin(pom) {
  return pom.replace('</properties>',`<!-- zero-sharing lib-r88-score-display history start -->\n<zero.sharing.lib-r88-score-display.previous>none</zero.sharing.lib-r88-score-display.previous>\n<!-- zero-sharing lib-r88-score-display history end -->\n</properties>`)
    .replace('</dependencies>',`<!-- zero-sharing lib-r88-score-display dependency start -->\n<dependency><groupId>ca.codepet.zero.contrib.r88</groupId><artifactId>score-display</artifactId><version>1.2.3</version></dependency>\n<!-- zero-sharing lib-r88-score-display dependency end -->\n</dependencies>`)
    .replace('</project>',`<repositories>\n<!-- zero-sharing repository start -->\n<repository><id>zero-sharing</id><url>https://artifacts.example/maven</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>\n<!-- zero-sharing repository end -->\n</repositories></project>`);
}
test('ordinary legacy project: Code, Assets and unknown authored files remain accessible',async t=>{
  const root=await fixture(t);
  await put(root,'src/main/resources/pictures/player.png','asset');
  await put(root,'notes/design.txt','student design');
  await put(root,'.my-settings','student preference');
  await put(root,'README.md','My game');
  await put(root,'target/classes/Main.class','generated');
  await put(root,'.zero/web-export/pom.xml','generated');
  const model=await readProjectModel(root);
  assert.equal(model.title,'My Game'); assert.equal(model.codeRoot,'src/main/java');assert.equal(model.assetsRoot,'src/main/resources');
  assert.deepEqual(model.libraries,[]);assert.deepEqual(model.corePaths,[]);
  assert.deepEqual(new Set(model.otherEntries),new Set(['.my-settings','README.md','notes']));
  assert.deepEqual((await ordinaryEntries(root,model.codeRoot)).map(entry=>entry.name),['Main.java']);
  assert.deepEqual((await ordinaryEntries(root,'notes')).map(entry=>entry.relative),['notes/design.txt']);
  assert.equal(isToolingPath('libraries/example/target/classes'),true);
  assert.equal(isToolingPath('src/main/java/zero/contrib/MyCode.java'),false);
  assert.equal(isToolingPath('custom-tooling/readme.txt'),false);
});
test('exact core hiding preserves zero.contrib and custom zero classes, including older project records',async t=>{
  const root=await fixture(t),sources={};
  for (const name of core.coreSourcePaths) {
    sources[name]=await fs.readFile(path.resolve(__dirname,'../../student-template',name),'utf8');
    await put(root,name,sources[name]);
  }
  await put(root,'zero-core.json',JSON.stringify(core.makeCoreRecord(sources)));
  await put(root,'src/main/java/zero/contrib/r5/student/Custom.java','package zero.contrib.r5.student; public class Custom {}');
  await put(root,'src/main/java/zero/MyOwn.java','package zero; public class MyOwn {}');
  let model=await readProjectModel(root);
  assert.deepEqual(model.corePaths,core.coreSourcePaths);
  assert.deepEqual((await ordinaryEntries(root,'src/main/java/zero',{hideCorePaths:model.corePaths})).map(entry=>entry.name),['contrib','MyOwn.java']);
  const record=JSON.parse(await fs.readFile(path.join(root,'zero-core.json'),'utf8'));
  record.coordinate.version='0.1.0';
  const name=record.sources[0].path;
  await put(root,name,'package zero; public class Actor {}\n');record.sources[0].sha256=hash('package zero; public class Actor {}\n');record.sourceSha256=hash(JSON.stringify(record.sources));
  await put(root,'zero-core.json',JSON.stringify(record));
  model=await readProjectModel(root);assert.deepEqual(model.corePaths,core.coreSourcePaths);
  await fs.appendFile(path.join(root,name),'// changed after record\n');
  await assert.rejects(readProjectModel(root),/Core source differs.*full Explorer/);
});
test('without a core record only exact reviewed helper bytes are hidden',async t=>{
  const root=await fixture(t),name='src/main/java/zero/Actor.java';
  await put(root,name,await fs.readFile(path.resolve(__dirname,'../../student-template',name)));
  let model=await readProjectModel(root);assert.deepEqual(model.corePaths,[name]);
  assert.deepEqual((await ordinaryEntries(root,'src/main/java',{hideCorePaths:model.corePaths})).map(entry=>entry.name),['Main.java']);
  await fs.appendFile(path.join(root,name),'// student change\n');
  model=await readProjectModel(root);assert.deepEqual(model.corePaths,[]);
  assert.ok((await ordinaryEntries(root,'src/main/java',{hideCorePaths:model.corePaths})).some(entry=>entry.name==='zero'));
});
test('canonical extraction exposes source, resources, checks, examples and local README; published mode retains inactive local copy',async t=>{
  const root=await fixture(t);await extract(root);
  await put(root,'libraries/health-bar/src/main/resources/zero/contrib/r12345/health_bar/theme.css','');
  const local=await readProjectModel(root),library=local.libraries[0];
  assert.equal(library.namespace,'zero.contrib.r12345.health_bar');assert.equal(library.id,'lib-r12345-health-bar');
  assert.equal(library.mode,'local');assert.equal(library.localSourceActive,true);
  assert.deepEqual(library.imports,['zero.contrib.r12345.health_bar.Health']);
  for (const field of ['sourceRoot','resourceRoot','checksRoot','examplesRoot','readme']) assert.ok(library[field],field);
  assert.match(libraryDetails(library),/import zero.contrib.r12345.health_bar.Health;/);
  await authoring.applyPlan(await authoring.previewMode(root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
  const published=(await readProjectModel(root)).libraries[0];
  assert.equal(published.version,'1.2.3');assert.equal(published.localVersion,'1.0.0');assert.equal(published.localSourceActive,false);
  assert.deepEqual(published.imports,[]);assert.deepEqual(published.localImports,library.imports);
  assert.match(libraryDetails(published),/not compiled in published mode/);
  assert.match(libraryDetails(published),/Exact published API\/import examples are not retained/);
  assert.match(libraryDetails(published),/Local examples:.*retained local copy/);
});
test('managed consumer POM pins reveal exact identity/version without invented source/API',async t=>{
  const root=await fixture(t);await put(root,'pom.xml',pin(await fs.readFile(path.join(root,'pom.xml'),'utf8')));
  const [library]=(await readProjectModel(root)).libraries;
  assert.equal(library.id,'lib-r88-score-display');assert.equal(library.namespace,'zero.contrib.r88.score_display');
  assert.equal(library.version,'1.2.3');assert.equal(library.mode,'published');assert.equal(library.folder,undefined);assert.equal(library.example,undefined);assert.deepEqual(library.imports,[]);
  assert.match(libraryDetails(library),/Open ZeroHub/);assert.doesNotMatch(libraryDetails(library),/import .*Score/);
  await put(root,'pom.xml',(await fs.readFile(path.join(root,'pom.xml'),'utf8')).replace('<version>1.2.3</version>','<version>latest</version>'));
  await assert.rejects(readProjectModel(root),/exact version/);
});
test('authored namespace mismatch and malformed or oversized metadata fail visibly',async t=>{
  const root=await fixture(t);await extract(root);
  const source='libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar/Health.java';
  await put(root,source,'package other; public class Health {}');
  await assert.rejects(readProjectModel(root),/Library source differs from its namespace/);
  await put(root,'zero-libraries.json','{');await assert.rejects(readProjectModel(root),SyntaxError);
  await put(root,'zero-libraries.json','x'.repeat(LIMITS.metadataBytes+1));await assert.rejects(readProjectModel(root),/bounded project metadata/);
  await put(root,'zero-libraries.json',JSON.stringify({schema:1,libraries:[{slug:'../elsewhere',repositoryId:'1',mode:'local',version:'1.0.0'}]}));
  await assert.rejects(readProjectModel(root),/lowercase library/);
});
test('path traversal, linked files/directories and linked metadata never enter the simple explorer',async t=>{
  const root=await fixture(t),outside=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-explorer-outside-')));
  t.after(()=>fs.rm(outside,{recursive:true,force:true}));await put(outside,'secret.txt','secret');
  for (const relative of ['../','../secret.txt','/tmp','src/../other','src\\main','C:/outside']) await assert.rejects(ordinaryEntries(root,relative),/relative project path/);
  await fs.symlink(outside,path.join(root,'linked'));
  await assert.rejects(ordinaryEntries(root),/Symbolic links/);await assert.rejects(ordinaryEntries(root,'linked'),/Symbolic links/);
  await fs.unlink(path.join(root,'linked'));await fs.symlink(path.join(outside,'secret.txt'),path.join(root,'src/main/java/Linked.java'));
  await assert.rejects(ordinaryEntries(root,'src/main/java'),/Symbolic links/);
  await fs.unlink(path.join(root,'src/main/java/Linked.java'));await fs.unlink(path.join(root,'zero.json'));await fs.symlink(path.join(outside,'secret.txt'),path.join(root,'zero.json'));
  await assert.rejects(readProjectModel(root),/Symbolic links/);
});
test('oversized directory refuses truncation and preserves access through full Explorer',async t=>{
  const root=await fixture(t);
  for (let i=0;i<=LIMITS.entries;i++) await put(root,`many/item-${i}.txt`,'');
  await assert.rejects(ordinaryEntries(root,'many'),/too many entries.*full Explorer/);
});
