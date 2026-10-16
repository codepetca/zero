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
 await fs.writeFile(path.join(root,'src/main/java/Counter.java'),widget ? 'public class Counter { private int value; private final javafx.scene.control.Label label=new javafx.scene.control.Label(\"Count: 0\"); private final javafx.scene.control.Button button=new javafx.scene.control.Button(\"Add\"); private final javafx.scene.layout.VBox view=new javafx.scene.layout.VBox(label,button); public Counter() { if(!javafx.application.Platform.isFxApplicationThread()) throw new IllegalStateException(\"Widget must be created on FX thread\"); button.setOnAction(event -> { value++; label.setText(\"Count: \"+value); }); } public javafx.scene.Node view() { return view; } public javafx.scene.control.Label label() { return label; } public javafx.scene.control.Button button() { return button; } public int value() { return value; } }\n' : 'public class Counter { private final Value value = new Value(); public void add(int amount) { value.add(amount); } public int value() { return value.total; } }\n');
 if (!widget) await fs.writeFile(path.join(root,'src/main/java/Value.java'),'final class Value { int total; void add(int amount) { total += amount; } }\n');
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),'import zero.contrib.r12345.counter.Counter; public class Main { public static void main(String[] args) { Counter counter = new Counter(); } }\n');
 await applyPlan(await previewExtraction(root,{repository,descriptor:{...descriptor,libraryKind:widget?'widget':'helper'},sources:widget?['src/main/java/Counter.java']:['src/main/java/Counter.java','src/main/java/Value.java']}));
 const folder=path.join(root,'libraries/counter');
 await fs.mkdir(path.join(folder,'src/main/resources/zero/contrib/r12345/counter'),{recursive:true});
 await fs.writeFile(path.join(folder,'src/main/resources/zero/contrib/r12345/counter/sample.txt'),'resource proof');
 const check=widget ? 'assert javafx.application.Platform.isFxApplicationThread(); Counter counter = new Counter(); assert counter.label().getText().equals(\"Count: 0\"); counter.button().fire(); assert counter.value()==1; assert counter.label().getText().equals(\"Count: 1\"); assert counter.view() instanceof javafx.scene.layout.VBox;' : 'Counter counter = new Counter(); counter.add(4); counter.add(-1); assert counter.value() == 3 : "Counter arithmetic"; assert Counter.class.getResource("sample.txt") != null : "library resource";';
 await fs.writeFile(path.join(folder,'src/test/java/LibraryCheck.java'),`import zero.contrib.r12345.counter.Counter; public class LibraryCheck { public static void main(String[] args) { ${check} } }\n`);
 if (!examples) await fs.rm(path.join(folder,'examples'),{recursive:true});
 if (examples) for (const [dir,name] of [['first','FirstExample'],['second','SecondExample']]) {
  await fs.mkdir(path.join(folder,'examples',dir),{recursive:true});
  const behavior=widget?(dir==='first'?'assert javafx.application.Platform.isFxApplicationThread(); Counter counter=new Counter(); counter.button().fire(); counter.button().fire(); assert counter.value()==2; assert counter.label().getText().equals(\"Count: 2\");':'assert javafx.application.Platform.isFxApplicationThread(); Counter first=new Counter(); Counter second=new Counter(); first.button().fire(); assert first.value()==1; assert second.value()==0; assert first.view()!=second.view();'):dir==='first'?'Counter counter=new Counter(); assert counter.value()==0;':'Counter counter=new Counter(); counter.add(2); assert counter.value()==2;';
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
// This transaction runs several independently bounded Maven/JDK processes.
// Keep its cumulative budget longer than a single build on a busy local Mac.
test('real trusted sample produces actual JAR, checks its origin and compiles root in local mode', {timeout:900000},async t => {
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
test('real Label/Button widget checks behavior and two examples on FX thread against its JAR', {timeout:180000},async t => {
 const root=await fixture(t,{widget:true}),result=await runLocalCheck(await prepareLocalCheck(root,'counter',{harnessPath:path.resolve(__dirname,'../../sharing/harness/ZeroLibraryHarness.java')}),{timeoutMs:150000}); assert.equal(result.passed,true); assert.equal(result.temporaryFilesRetained,false); assert.match(result.outputs.at(-1).output,/Actual JAR origins and 3 behavior checks\/examples passed/);
});

test('widget startup/timeout failures propagate and remove temporary Check state',async t => {
 for(const message of ['JavaFX toolkit startup failed. Verify desktop/display support.','JavaFX local Check timed out.']) {
  const root=await fixture(t,{widget:true}),plan=await prepareLocalCheck(root,'counter');let steps=0;
  const runner=async spec=>{steps++;if(steps===1){await fs.mkdir(path.dirname(plan.jar),{recursive:true});await fs.writeFile(plan.jar,'trusted mocked jar');await fs.writeFile(plan.classpathFile,'trusted-classpath');return {code:0,output:''};}if(steps===2)return {code:0,output:''};assert.ok(spec.args.includes('-Dzero.check.fxTimeoutMillis=250'));throw new Error(message);};
  await assert.rejects(runLocalCheck(plan,{runner,timeoutMs:250}),error=>error.message===message);assert.equal(steps,3);await assert.rejects(fs.access(plan.temp));
 }
});

const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
function mockedProcess(pid) {
 const child=new EventEmitter();child.pid=pid;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kills=[];child.kill=signal=>{child.kills.push(signal);return true;};child.unref=()=>{child.unreferenced=true;};return child;
}
test('Windows stop terminates one tracked tree before settling despite retained pipes and repeated causes',async()=>{
 const child=mockedProcess(123),killer=mockedProcess(456),calls=[],controller=new AbortController();
 const spawnProcess=(...args)=>{calls.push(args);return calls.length===1?child:killer;};
 const pending=processRun({command:'C:\\Windows\\System32\\cmd.exe',args:['/c','mvnw.cmd'],cwd:os.tmpdir()},{platform:'win32',spawnProcess,systemRoot:'C:\\Windows',signal:controller.signal,timeoutMs:1000,terminationMs:200});
 controller.abort();child.stdout.write('x'.repeat(1024*1024+1));
 assert.equal(calls.length,2);assert.equal(calls[1][0],'C:\\Windows\\System32\\taskkill.exe');assert.deepEqual(calls[1][1],['/PID','123','/T','/F']);assert.deepEqual(child.kills,[]);
 let settled=false;pending.catch(()=>{settled=true;});killer.emit('exit',0);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(settled,false);
 child.emit('exit',1);child.emit('close',1);await assert.rejects(pending,error=>/cancelled/.test(error.message)&&!error.terminationUnconfirmed);assert.equal(calls.length,2);
});
test('Windows root exit forbids delayed PID reuse; taskkill failure and retained pipes settle as unconfirmed',async()=>{
 for(const scenario of ['parent-exited','taskkill-failed','retained-pipes']) {
  const child=mockedProcess(123),killer=mockedProcess(456),calls=[],controller=new AbortController();
  const pending=processRun({command:'cmd.exe',args:[],cwd:os.tmpdir()},{platform:'win32',spawnProcess:(...args)=>{calls.push(args);return calls.length===1?child:killer;},signal:controller.signal,timeoutMs:1000,terminationMs:35});
  if(scenario==='parent-exited')child.emit('exit',0);controller.abort();if(scenario==='taskkill-failed')killer.emit('exit',5);if(scenario==='retained-pipes')killer.emit('exit',0);
  await assert.rejects(pending,error=>error.terminationUnconfirmed===true&&/may still be running/.test(error.message));
  assert.equal(calls.length,scenario==='parent-exited'?1:2);assert.deepEqual(child.kills,[]);assert.equal(child.stdout.destroyed,true);assert.equal(child.stderr.destroyed,true);
 }
});
test('uncertain tree termination retains local Check files and reports their recovery path',async t=>{
 const root=await fixture(t),plan=await prepareLocalCheck(root,'counter');t.after(()=>fs.rm(plan.temp,{recursive:true,force:true}));
 const error=new Error('Process-tree termination was not confirmed.');error.terminationUnconfirmed=true;
 await assert.rejects(runLocalCheck(plan,{runner:async()=>{throw error;}}),failure=>failure.temporaryFilesRetained===true&&failure.temporaryDirectory===plan.temp&&failure.message.includes(plan.temp));await fs.access(plan.temp);
});
test('actual owned POSIX process group force-stops a SIGTERM-resistant parent and child', {skip:process.platform==='win32',timeout:5000},async()=>{
 const {spawn}=require('node:child_process'),children=[],controller=new AbortController();let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
 const code=`const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('descendant-ready');setInterval(()=>{},1000)"],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000);`;
 const spawnProcess=(...args)=>{const child=spawn(...args);children.push(child);child.stdout.on('data',data=>{if(data.toString().includes('descendant-ready'))readyResolve();});return child;};
 const started=Date.now(),pending=processRun({command:process.execPath,args:['-e',code],cwd:os.tmpdir()},{spawnProcess,signal:controller.signal,timeoutMs:2000,graceMs:50,terminationMs:1500});
 await ready;controller.abort();await assert.rejects(pending,error=>/cancelled/.test(error.message)&&!error.terminationUnconfirmed);assert.ok(Date.now()-started<2500);assert.equal(children.length,1);assert.throws(()=>process.kill(-children[0].pid,0),error=>error.code==='ESRCH');
});

test('invalid process-group PID never dispatches a global signal',async()=>{
 const child=mockedProcess(1),controller=new AbortController();let signals=0;
 const pending=processRun({command:'owned-test',args:[]},{platform:'darwin',spawnProcess:()=>child,killProcess:()=>{signals++;},signal:controller.signal,timeoutMs:1000,terminationMs:50});controller.abort();await assert.rejects(pending,error=>error.terminationUnconfirmed===true);assert.equal(signals,0);
});
