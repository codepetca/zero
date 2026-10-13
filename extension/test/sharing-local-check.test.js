'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {previewExtraction,applyPlan,previewMode} = require('../src/sharing/authoring');
const {prepareLocalCheck,runLocalCheck,processRun} = require('../src/sharing/local-check');
const repository={id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'};
const descriptor={schema:1,kind:'library',slug:'counter',version:'1.0.0',title:'Counter',description:'Finite trusted arithmetic sample.',license:'MIT',libraryKind:'helper'};
async function fixture(t,{examples=true,widget=false}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-local-check-test-'))); t.after(() => fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true}); await fs.writeFile(path.join(root,'zero.json'),'{}');
 await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
 await fs.copyFile(path.resolve(__dirname,'../../student-template/mvnw'),path.join(root,'mvnw')); await fs.chmod(path.join(root,'mvnw'),0o755);
 await fs.cp(path.resolve(__dirname,'../../student-template/.mvn'),path.join(root,'.mvn'),{recursive:true});
 await fs.writeFile(path.join(root,'src/main/java/Counter.java'),widget ? 'public class Counter { public javafx.scene.Node view() { return new javafx.scene.shape.Rectangle(2,3); } }\n' : 'public class Counter { private final Value value = new Value(); public void add(int amount) { value.add(amount); } public int value() { return value.total; } }\n');
 if (!widget) await fs.writeFile(path.join(root,'src/main/java/Value.java'),'final class Value { int total; void add(int amount) { total += amount; } }\n');
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),'import zero.contrib.r12345.counter.Counter; public class Main { public static void main(String[] args) { Counter counter = new Counter(); } }\n');
 await applyPlan(await previewExtraction(root,{repository,descriptor:{...descriptor,libraryKind:widget?'widget':'helper'},sources:widget?['src/main/java/Counter.java']:['src/main/java/Counter.java','src/main/java/Value.java']}));
 const folder=path.join(root,'libraries/counter');
 await fs.mkdir(path.join(folder,'src/main/resources/zero/contrib/r12345/counter'),{recursive:true});
 await fs.writeFile(path.join(folder,'src/main/resources/zero/contrib/r12345/counter/sample.txt'),'resource proof');
 const check=widget ? 'Counter counter = new Counter(); assert counter.view().getBoundsInLocal().getWidth() == 2;' : 'Counter counter = new Counter(); counter.add(4); counter.add(-1); assert counter.value() == 3 : "Counter arithmetic"; assert Counter.class.getResource("sample.txt") != null : "library resource";';
 await fs.writeFile(path.join(folder,'src/test/java/LibraryCheck.java'),`import zero.contrib.r12345.counter.Counter; public class LibraryCheck { public static void main(String[] args) { ${check} } }\n`);
 if (!examples) await fs.rm(path.join(folder,'examples'),{recursive:true});
 if (examples) for (const [dir,name] of [['first','FirstExample'],['second','SecondExample']]) {
  await fs.mkdir(path.join(folder,'examples',dir),{recursive:true});
  const behavior=widget?'assert new Counter().view() instanceof javafx.scene.Node;':dir==='first'?'Counter counter=new Counter(); assert counter.value()==0;':'Counter counter=new Counter(); counter.add(2); assert counter.value()==2;';
  await fs.writeFile(path.join(folder,'examples',dir,`${name}.java`),`import zero.contrib.r12345.counter.Counter; public class ${name} { public static void main(String[] args) { ${behavior} } }\n`);
 }
 return root;
}
test('Check rejects missing examples and source namespace shadows before execution',async t => {
 const root=await fixture(t,{examples:false}); await assert.rejects(prepareLocalCheck(root,'counter'),/first example/);
 const full=await fixture(t); await fs.writeFile(path.join(full,'libraries/counter/examples/first/FirstExample.java'),'package zero.contrib.r12345.counter; public class FirstExample { public static void main(String[] args) {} }');
 await assert.rejects(prepareLocalCheck(full,'counter'),/shadows the library namespace/);
});
test('source, added-file drift and cancellation prevent even the Maven invocation and dispose temp files',async t => {
 for (const scenario of ['source','inventory','cancel']) {
  const root=await fixture(t), plan=await prepareLocalCheck(root,'counter'); let calls=0;
  if(scenario==='source') await fs.appendFile(path.join(root,'libraries/counter/src/main/java/zero/contrib/r12345/counter/Counter.java'),'// newer\n');
  if(scenario==='inventory') await fs.writeFile(path.join(root,'libraries/counter/examples/first/Extra.java'),'class Extra {}');
  const controller=new AbortController(); if(scenario==='cancel') controller.abort();
  await assert.rejects(runLocalCheck(plan,{signal:controller.signal,runner:async()=> { calls++; }}),/changed|cancelled/); assert.equal(calls,0); await assert.rejects(fs.access(plan.temp));
 }
});
test('ordinary process cancellation and finite timeouts terminate local checks',async () => {
 const controller=new AbortController();
 const pending=processRun({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:os.tmpdir()},{signal:controller.signal}); controller.abort(); await assert.rejects(pending,/cancelled/);
 await assert.rejects(processRun({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:os.tmpdir()},{timeoutMs:30}),/timed out/);
});
test('real trusted sample produces actual JAR, checks its origin and compiles root in local mode', {timeout:240000},async t => {
 const root=await fixture(t), plan=await prepareLocalCheck(root,'counter');
 const result=await runLocalCheck(plan,{keepFiles:true,timeoutMs:180000}); t.after(() => fs.rm(plan.temp,{recursive:true,force:true}));
 assert.equal(result.passed,true); assert.equal(result.classes[0],'zero.contrib.r12345.counter.Counter'); assert.match(result.outputs.at(-1).output,/Actual JAR origins and 3 behavior checks\/examples passed/);
 const build=await processRun({command:path.join(root,'mvnw'),args:['-B','-ntp','clean','compile'],cwd:root},{timeoutMs:180000}); assert.match(build.output,/BUILD SUCCESS/);
 await fs.access(path.join(root,'target/classes/zero/contrib/r12345/counter/sample.txt'));
 assert.equal((await processRun({command:'java',args:['-cp',path.join(root,'target/classes'),'Main'],cwd:root})).code,0);
 // Install only into the disposable sample Maven cache; never publish or mutate a remote.
 const localRepo=path.join(plan.temp,'repository');
 await processRun({command:path.join(root,'mvnw'),args:['-B','-ntp',`-Dmaven.repo.local=${localRepo}`,'org.apache.maven.plugins:maven-install-plugin:3.1.4:install-file',`-Dfile=${plan.jar}`,`-DpomFile=${plan.pom}`],cwd:root},{timeoutMs:180000});
 await applyPlan(await previewMode(root,{slug:'counter',mode:'published',version:'1.0.0'}));
 const published=await processRun({command:path.join(root,'mvnw'),args:['-B','-ntp',`-Dmaven.repo.local=${localRepo}`,'clean','compile'],cwd:root},{timeoutMs:180000}); assert.match(published.output,/BUILD SUCCESS/);
 await assert.rejects(fs.access(path.join(root,'target/classes/zero/contrib/r12345/counter/Counter.class')));
 const consumer=await processRun({command:'java',args:['-cp',[path.join(root,'target/classes'),plan.jar].join(path.delimiter),'Main'],cwd:root}); assert.equal(consumer.code,0);
 // A failing student-authored assertion is a failure, including after a prior success.
 await fs.writeFile(path.join(root,'libraries/counter/src/test/java/LibraryCheck.java'),'public class LibraryCheck { public static void main(String[] args) { throw new AssertionError("intentional trusted failure"); } }');
 await assert.rejects(runLocalCheck(await prepareLocalCheck(root,'counter'),{timeoutMs:180000}),/intentional trusted failure/);
});
test('real trusted widget checks Node view and examples against its JAR', {timeout:180000},async t => {
 const root=await fixture(t,{widget:true}),result=await runLocalCheck(await prepareLocalCheck(root,'counter'),{timeoutMs:150000}); assert.equal(result.passed,true); assert.equal(result.temporaryFilesRetained,false);
});
