'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {previewExtraction,previewMode,applyPlan,rollback,recover,discoverLibraries} = require('../src/sharing/authoring');
const repository={id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'};
const descriptor={schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'An ordinary helper.',license:'MIT',libraryKind:'helper'};
const main='public class Main { public static void main(String[] args) { Health h = new Health(7); if(h.value()!=7) throw new AssertionError(); } }\n';
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-authoring-'))); t.after(() => fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
 await fs.writeFile(path.join(root,'LICENSE'),'MIT sample license\n');
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),main);
 await fs.writeFile(path.join(root,'src/main/java/Health.java'),'public class Health { private final Range range; public Health(int value) { range = new Range(value); } public int value() { return range.value; } }\n');
 await fs.writeFile(path.join(root,'src/main/java/Range.java'),'final class Range { final int value; Range(int value) { this.value=value; } }\n');
 return root;
}
function options() { return {repository,descriptor,sources:['src/main/java/Health.java','src/main/java/Range.java'],edits:[{path:'src/main/java/Main.java',before:main,after:'import zero.contrib.r12345.health_bar.Health;\n'+main}]}; }
module.exports={fixture,options,descriptor};
test('preview is inert; extraction moves related helper and source roots; metadata reused',async t => {
 const root=await fixture(t), plan=await previewExtraction(root,options());
 assert.equal(await fs.readFile(path.join(root,'src/main/java/Main.java'),'utf8'),main);
 assert.equal(plan.classes[1].to,'zero.contrib.r12345.health_bar.Range');
 const receipt=await applyPlan(plan);
 await assert.rejects(fs.access(path.join(root,'src/main/java/Health.java')));
 assert.match(await fs.readFile(path.join(root,'libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar/Range.java'),'utf8'),/^package zero.contrib.r12345.health_bar;/);
 const [library]=await discoverLibraries(root); assert.equal(library.descriptor.title,'Health bar'); assert.equal(library.mode,'local');
 const pom=await fs.readFile(path.join(root,'pom.xml'),'utf8'); assert.match(pom,/<version>3.6.1<\/version>/); assert.match(pom,/libraries\/health-bar\/src\/main\/java/); assert.doesNotMatch(pom,/<artifactId>health-bar<\/artifactId>/);
 await rollback(receipt); assert.equal(await fs.readFile(path.join(root,'src/main/java/Main.java'),'utf8'),main); await previewExtraction(root,options());
});
test('mode preview excludes binary/local duplication and exact pin; source edits preserved on switch',async t => {
 const root=await fixture(t); await applyPlan(await previewExtraction(root,options()));
 const binary=await previewMode(root,{slug:'health-bar',mode:'published',version:'1.2.3'}); await applyPlan(binary);
 let pom=await fs.readFile(path.join(root,'pom.xml'),'utf8'); assert.doesNotMatch(pom,/build-helper-maven-plugin/); assert.match(pom,/<artifactId>health-bar<\/artifactId><version>1.2.3<\/version>/);
 await fs.appendFile(path.join(root,'libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar/Health.java'),'// keep edits\n');
 await applyPlan(await previewMode(root,{slug:'health-bar',mode:'local'})); pom=await fs.readFile(path.join(root,'pom.xml'),'utf8'); assert.match(pom,/build-helper-maven-plugin/); assert.doesNotMatch(pom,/<artifactId>health-bar<\/artifactId>/);
 assert.match(await fs.readFile(path.join(root,'libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar/Health.java'),'utf8'),/keep edits/);
 await assert.rejects(previewMode(root,{slug:'health-bar',mode:'published',version:'latest'}));
});
test('drift in reviewed source, root POM or newly added source prevents application',async t => {
 for (const name of ['src/main/java/Health.java','pom.xml','src/main/java/New.java']) {
  const root=await fixture(t), plan=await previewExtraction(root,options()); await fs.appendFile(path.join(root,name),'// newer student edit\n');
  await assert.rejects(applyPlan(plan),/changed after preview/); assert.ok(await fs.readFile(path.join(root,'src/main/java/Health.java'),'utf8'));
 }
});
test('partial failures roll back; durable receipt recovers; newer edits block destructive undo',async t => {
 const root=await fixture(t), plan=await previewExtraction(root,options());
 await assert.rejects(applyPlan(plan,{onStep:filename => { if (filename.endsWith('/Range.java')) throw new Error('test disk failure'); }}),/disk failure/);
 assert.equal(await fs.readFile(path.join(root,'src/main/java/Main.java'),'utf8'),main); await fs.access(path.join(root,'src/main/java/Range.java'));
 assert.equal(await fs.readFile(path.join(root,'.zero-sharing-recovery/.gitignore'),'utf8'),'*\n');
 const receipt=await applyPlan(await previewExtraction(root,options())); await recover(root,receipt.recovery); assert.equal(await fs.readFile(path.join(root,'.zero-sharing-recovery/.gitignore'),'utf8'),'*\n'); await fs.access(path.join(root,'src/main/java/Health.java'));
 const again=await applyPlan(await previewExtraction(root,options())); await fs.appendFile(path.join(root,'src/main/java/Main.java'),'// newer\n');
 await assert.rejects(rollback(again),/Keep your newer edits/); assert.match(await fs.readFile(path.join(root,'src/main/java/Main.java'),'utf8'),/newer/);
});
test('no overwriting, unsafe paths, source shadowing, source overrides or symlink traversal',async t => {
 const root=await fixture(t); await assert.rejects(previewExtraction(root,{...options(),sources:['../Health.java']}));
 await assert.rejects(previewExtraction(root,{...options(),sources:['src/main/java/Main.java']}),/root game entry point/);
 await fs.mkdir(path.join(root,'libraries/health-bar'),{recursive:true}); await fs.writeFile(path.join(root,'libraries/health-bar/keep.txt'),'private');
 await assert.rejects(previewExtraction(root,options()),/already exists/); assert.equal(await fs.readFile(path.join(root,'libraries/health-bar/keep.txt'),'utf8'),'private');
 await fs.rm(path.join(root,'libraries'),{recursive:true});
 await fs.writeFile(path.join(root,'src/main/java/Copy.java'),'package zero.contrib.r12345.health_bar; class Copy {}');
 await assert.rejects(previewExtraction(root,options()),/shadows library namespace/); await fs.unlink(path.join(root,'src/main/java/Copy.java'));
 await fs.symlink(path.join(root,'src/main/java/Health.java'),path.join(root,'src/main/java/Link.java')); await assert.rejects(previewExtraction(root,options()),/Symbolic links/); await fs.unlink(path.join(root,'src/main/java/Link.java'));
 const pom=await fs.readFile(path.join(root,'pom.xml'),'utf8'); await fs.writeFile(path.join(root,'pom.xml'),pom.replace('<build>','<build><sourceDirectory>elsewhere</sourceDirectory>')); await assert.rejects(previewExtraction(root,options()),/ordinary Zero source layout/);
});
test('extraction refuses hidden identifier characters before scanning or rewriting source',async t => {
 for (const source of [
  'package zero.con\u200Dtrib.r12345.health_bar; public class Health {}',
  '// Hidden character: \u200D\npublic class Health {}',
  '/* Hidden character: \u200D */\npublic class Health {}',
  'public class Health { String label = "hidden\u200Dtext"; }',
  'public class Health { char letter = \'\u200D\'; }',
  'public class Health { String label = """\n hidden\u200Dtext\n """; }'
 ]) {
  const root=await fixture(t),filename=path.join(root,'src/main/java/Health.java'),pom=await fs.readFile(path.join(root,'pom.xml'),'utf8');
  await fs.writeFile(filename,source);
  await assert.rejects(previewExtraction(root,options()),/Hidden Java identifier-ignorable characters.*manual source preparation/);
  assert.equal(await fs.readFile(filename,'utf8'),source); assert.equal(await fs.readFile(path.join(root,'pom.xml'),'utf8'),pom);
  await assert.rejects(fs.access(path.join(root,'libraries/health-bar')));
 }
});
test('hidden namespace source blocks both local and published mode changes without edits',async t => {
 for (const mode of ['published','local']) for (const hidden of ['\u200D','\u0001','\u0085','\u{E0001}']) {
  const root=await fixture(t); await applyPlan(await previewExtraction(root,options()));
  if (mode==='local') await applyPlan(await previewMode(root,{slug:'health-bar',mode:'published',version:'1.0.0'}));
  const source=`package zero.con${hidden}trib.r12345.health_bar; public class Copy {}`,filename=path.join(root,'src/main/java/Copy.java');
  await fs.writeFile(filename,source);
  const pom=await fs.readFile(path.join(root,'pom.xml'),'utf8'),state=await fs.readFile(path.join(root,'zero-libraries.json'),'utf8');
  await assert.rejects(previewMode(root,{slug:'health-bar',mode,version:'1.0.0'}),/Hidden Java identifier-ignorable characters.*manual source preparation/);
  assert.equal(await fs.readFile(filename,'utf8'),source); assert.equal(await fs.readFile(path.join(root,'pom.xml'),'utf8'),pom); assert.equal(await fs.readFile(path.join(root,'zero-libraries.json'),'utf8'),state);
 }
});
test('ordinary Unicode comments and literals preserve package-edit offsets and Java whitespace',async t => {
 const root=await fixture(t),source='// Caf\u00E9 \u{1F680}\r\n/* package ignored; */\r\npackage\told\f.\tname;\r\npublic class Health { String label = "\u5065\u5EB7"; char letter = \'\u00E9\'; }\r\n';
 await fs.writeFile(path.join(root,'src/main/java/Health.java'),source);
 const plan=await previewExtraction(root,options()),change=plan.changes.find(c=>c.path.endsWith('/health_bar/Health.java'));
 assert.equal(plan.classes[0].from,'old.name.Health');
 assert.equal(change.after,source.replace('package\told\f.\tname;','package zero.contrib.r12345.health_bar;'));
 assert.equal(await fs.readFile(path.join(root,'src/main/java/Health.java'),'utf8'),source);
});
