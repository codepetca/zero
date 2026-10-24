'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {nativeBuildIdentity, createRecordDecoder, createNativeRuntimeExecution} = require('../src/native-runtime-task');
const {NATIVE_PREFIX} = require('../src/runtime-events');
const event = (seq = 1, change = {}) => ({version:1,runId:'r',buildId:'b',seq,type:'startup',stage:'startup',code:'STARTING',...change});
const framed = value => NATIVE_PREFIX + JSON.stringify(value) + '\n';
class Emitter {constructor(){this.inner=new EventEmitter();this.event=listener=>{this.inner.on('event',listener);return {dispose:()=>this.inner.off('event',listener)};};}fire(value){this.inner.emit('event',value);}dispose(){this.inner.removeAllListeners();}}
const vscode = {EventEmitter:Emitter,CustomExecution:class {constructor(callback){this.callback=callback;}}};
function fakeChild(pid=42) {const child=new EventEmitter();Object.assign(child,{pid,stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:{writable:true,write:data=>{child.input=data;}},kill(signal){child.emit('close',0,signal);}});return child;}
test('native decoder preserves human output and accepts split ordered local records only', () => {
 const writes=[],events=[];const d=createRecordDecoder({runId:'r',buildId:'b',write:x=>writes.push(x),onEvent:e=>events.push(e)});
 d.push('prompt without newline: ');assert.equal(writes.join(''),'prompt without newline: ');d.push('answer\n');
 const text='student output\n'+framed(event())+framed(event(2,{type:'ui-ready',code:'UI_READY'}));
 for(let i=0;i<text.length;i+=7)d.push(text.slice(i,i+7));
 d.push(framed(event(3,{runId:'old',type:'fatal',code:'STARTUP_FAILED'})));
 d.push(framed(event(3,{type:'fatal',code:'UI_CALLBACK_FAILED',stage:'ui-callback',diagnostic:'useful cause'})));
 d.push(framed(event(4,{type:'first-frame',stage:'frame-draw',code:'FIRST_FRAME'})));d.end();
 assert.deepEqual(events.map(e=>e.type),['startup','ui-ready','fatal']);
 assert.match(writes.join(''),/student output/);assert.match(writes.join(''),/useful cause/);
});
test('native decoder bounds long lines, rejects replay/invalid combinations, flood and pre-start readiness', () => {
 const writes=[],events=[];let now=0;const d=createRecordDecoder({runId:'r',buildId:'b',write:x=>writes.push(x),onEvent:e=>events.push(e),now:()=>now});
 d.push(framed(event(1,{type:'ui-ready',code:'UI_READY'})));assert.equal(events.length,0);
 d.push(framed(event()));d.push(framed(event()));d.push(framed(event(2,{type:'fatal'})));
 const long='z'.repeat(100000)+'\n';d.push(long);assert.ok(writes.join('').includes(long));
 for(let seq=2;seq<40;seq++)d.push(framed(event(seq)));
 d.push(framed(event(40,{type:'ui-ready',code:'UI_READY'})));assert.equal(events.length,1);
 now=1001;d.push(framed(event(41,{type:'ui-ready',code:'UI_READY'})));assert.equal(events.length,2);
});
test('CustomExecution runs exact native Maven argv, opts into local identity, mirrors UTF8/stderr and stdin', async () => {
 const child=fakeChild(),calls=[],events=[],exits=[],writes=[];
 const transport=createNativeRuntimeExecution({vscode,spec:{command:'/project/mvnw',args:['clean','compile','javafx:run'],cwd:'/project'},buildId:'b',env:{KEEP:'yes'},platform:'darwin',spawn:(...args)=>{calls.push(args);return child;},killProcess:()=>{},onEvent:e=>events.push(e),onExit:code=>exits.push(code)});
 const pty=await transport.execution.callback();pty.onDidWrite(x=>writes.push(x));pty.open();
 assert.equal(calls[0][0],'/project/mvnw');assert.deepEqual(calls[0][1],['clean','compile','javafx:run']);assert.equal(calls[0][2].detached,true);assert.equal(calls[0][2].env.KEEP,'yes');
 const runId=calls[0][2].env.ZERO_RUNTIME_RUN_ID;assert.match(runId,/^[a-f0-9-]+$/);assert.equal(calls[0][2].env.ZERO_RUNTIME_BUILD_ID,'b');
 const utf=Buffer.from('hello ☃\n');child.stdout.emit('data',utf.subarray(0,8));child.stdout.emit('data',utf.subarray(8));child.stderr.emit('data',Buffer.from('compiler stderr\n'));
 child.stdout.emit('data',Buffer.from(framed({...event(),runId})));assert.equal(events.length,1);
 pty.handleInput('typed\r');assert.equal(child.input,'typed\r');child.emit('close',3);
 assert.match(writes.join(''),/hello ☃/);assert.match(writes.join(''),/compiler stderr/);assert.deepEqual(exits,[3]);
});
test('pre-open cancellation and stale generation never spawn a process', async () => {
 for(const stale of [false,true]){let spawned=0;const exits=[];const transport=createNativeRuntimeExecution({vscode,spec:{command:'x',args:[],cwd:'.'},buildId:'b',isCurrent:()=>!stale,spawn:()=>{spawned++;return fakeChild();},onExit:code=>exits.push(code)});const pty=await transport.execution.callback();if(!stale)pty.close();pty.open();assert.equal(spawned,0);assert.deepEqual(exits,[0]);}
});
test('Stop owns the POSIX process group and closes only once despite exit/error races', async () => {
 const child=fakeChild(),signals=[],exits=[],closes=[];
 const transport=createNativeRuntimeExecution({vscode,spec:{command:'mvnw',args:[],cwd:'.'},buildId:'b',platform:'linux',spawn:()=>child,killProcess:(pid,signal)=>{signals.push([pid,signal]);if(signal==='SIGTERM')child.emit('close',null);},onExit:code=>exits.push(code)});
 const pty=await transport.execution.callback();pty.onDidClose(code=>closes.push(code));pty.open();pty.close();pty.close();child.emit('error',new Error('late'));child.emit('close',1);
 assert.deepEqual(signals,[[-42,'SIGTERM'],[-42,'SIGKILL']]);assert.deepEqual(exits,[0]);assert.deepEqual(closes,[0]);
});
test('Windows wrapper path remains child environment data and taskkill owns the whole tree', async () => {
 const child=fakeChild(123),calls=[],killer=fakeChild(124);
 const transport=createNativeRuntimeExecution({vscode,spec:{command:'C:\\class & %user%\\mvnw.cmd',args:['clean','compile','javafx:run'],cwd:'C:\\class',shell:true},buildId:'b',platform:'win32',env:{SystemRoot:'C:\\Windows'},spawn:(...args)=>{calls.push(args);return calls.length===1?child:killer;}});
 const pty=await transport.execution.callback();pty.open();pty.close();
 assert.equal(calls[0][0],'C:\\Windows\\System32\\cmd.exe');assert.equal(calls[0][2].env.ZERO_NATIVE_MAVEN_WRAPPER,'C:\\class & %user%\\mvnw.cmd');assert.equal(calls[0][1].at(-1),'""%ZERO_NATIVE_MAVEN_WRAPPER%" clean compile javafx:run"');assert.equal(calls[0][2].windowsVerbatimArguments,true);
 assert.equal(calls[1][0],'C:\\Windows\\System32\\taskkill.exe');assert.deepEqual(calls[1][1],['/PID','123','/T','/F']);child.emit('close',0);
});
test('spawn failures close truthfully and malformed Windows arguments cannot become shell code', async () => {
 for(const args of [[],['compile&bad']]){const exits=[],writes=[];let spawned=0;const transport=createNativeRuntimeExecution({vscode,spec:{command:'mvnw.cmd',args,cwd:'.',shell:true},buildId:'b',platform:'win32',spawn:()=>{spawned++;throw new Error('missing wrapper');},onExit:code=>exits.push(code)});const pty=await transport.execution.callback();pty.onDidWrite(x=>writes.push(x));pty.open();assert.deepEqual(exits,[1]);assert.match(writes.join(''),/Cannot start native Java/);assert.equal(spawned,args.length?0:1);}
});
test('source identity binds Java and POM bytes with deterministic ordering and rejects links', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-identity-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'pom.xml'),'<project/>');await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}');
 const first=await nativeBuildIdentity(root);assert.equal(await nativeBuildIdentity(root),first);await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main { int changed; }');assert.notEqual(await nativeBuildIdentity(root),first);
 await fs.symlink(path.join(root,'pom.xml'),path.join(root,'src/main/java/Linked.java'));await assert.rejects(nativeBuildIdentity(root),/linked|regular/);
});
test('actual harmless POSIX process mirrors output and Stop terminates its owned group', {skip:process.platform==='win32',timeout:6000}, async () => {
 const transport=createNativeRuntimeExecution({vscode,spec:{command:process.execPath,args:['-e',"process.stdout.write('native-live\\n');setInterval(()=>{},1000)"],cwd:process.cwd()},buildId:'test-build',graceMs:100});
 const pty=await transport.execution.callback();let signalReady;const ready=new Promise(resolve=>{signalReady=resolve;});let output='';pty.onDidWrite(text=>{output+=text;if(output.includes('native-live'))signalReady();});const closed=new Promise(resolve=>pty.onDidClose(resolve));
 try {pty.open();await ready;pty.close();assert.equal(await closed,0);assert.match(output,/native-live/);}finally{transport.dispose();}
});
