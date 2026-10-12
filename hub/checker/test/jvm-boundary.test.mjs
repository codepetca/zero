import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, copyFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {reflectionForgery,methodHandleForgery,unsafeDeputyForgery} from './forgeries.mjs';

// Trusted, finite reproductions only. These tests never run a submitted bundle.
// Stub JavaFX removes native/UI dependencies while exercising the real JDK17,
// JPMS launcher, premain, class transformer, reflection, lambdas and exit guard.
const root=resolve(import.meta.dirname,'../../..');
const scratch=join(root,'.verification/hub-checker');
function command(exe,args,cwd) {
 const run=spawnSync(exe,args,{cwd,timeout:5000,maxBuffer:128*1024,encoding:'utf8',env:{PATH:process.env.PATH,HOME:cwd}});
 if(run.error)throw run.error;
 return run;
}
async function put(dir,path,text){await mkdir(join(dir,path,'..'),{recursive:true});await writeFile(join(dir,path),text);}
async function setup() {
 await mkdir(scratch,{recursive:true});const dir=await mkdtemp(join(scratch,'jpms-'));
 try {
 const version=command('java',['-version'],dir);assert.match(version.stderr,/version "17\./,'The regression must use real JDK17');
 await put(dir,'fxsrc/javafx.controls/module-info.java','module javafx.controls { requires jdk.unsupported; requires java.desktop; exports javafx.application; exports javafx.scene; }');
 await put(dir,'fxsrc/javafx.controls/javafx/application/Application.java',`package javafx.application; public abstract class Application { public abstract void start(); public static void launch(Class<? extends Application> c,String[] args) throws Exception { c.getDeclaredConstructor().newInstance().start(); } }`);
 await put(dir,'fxsrc/javafx.controls/javafx/application/Platform.java','package javafx.application; public final class Platform { public static void exit() {} }');
 await put(dir,'fxsrc/javafx.controls/javafx/scene/Node.java','package javafx.scene; public class Node {}');
 await put(dir,'fxsrc/javafx.swing/module-info.java','module javafx.swing {}');
 let run=command('javac',['-proc:none','--release','17','--module-source-path',join(dir,'fxsrc'),'-d',join(dir,'modules'),...['javafx.controls/module-info.java','javafx.controls/javafx/application/Application.java','javafx.controls/javafx/application/Platform.java','javafx.controls/javafx/scene/Node.java','javafx.swing/module-info.java'].map(p=>join(dir,'fxsrc',p))],dir);assert.equal(run.status,0,run.stderr);
 await mkdir(join(dir,'policy-src'));
 const files=['module-info.java','JarTracker.java','TrustedRun.java'];
 for(const name of files)await copyFile(join(root,'hub/checker/image',name),join(dir,'policy-src',name));
 run=command('javac',['-proc:none','--release','17','--module-path',join(dir,'modules'),'-d',join(dir,'policy-classes'),...files.map(n=>join(dir,'policy-src',n))],dir);assert.equal(run.status,0,run.stderr);
 await put(dir,'agent.mf','Premain-Class: hub.policy.JarTracker\n\n');
 run=command('jar',['cfm',join(dir,'checker.jar'),join(dir,'agent.mf'),'-C',join(dir,'policy-classes'),'.'],dir);assert.equal(run.status,0,run.stderr);
 await put(dir,'library-src/zero/ui1/Display.java','package zero.ui1; public final class Display { public static void touch() {} }');
 run=command('javac',['-proc:none','--release','17','-d',join(dir,'library-classes'),join(dir,'library-src/zero/ui1/Display.java')],dir);assert.equal(run.status,0,run.stderr);
 run=command('jar',['cf',join(dir,'library.jar'),'-C',join(dir,'library-classes'),'.'],dir);assert.equal(run.status,0,run.stderr);
 return dir;
 } catch(failure) {await rm(dir,{recursive:true,force:true});throw failure;}
}
async function launch(dir,name,source,agent=true) {
 const consumer=await mkdtemp(join(dir,'consumer-'));await put(consumer,name+'.java',source);
 const compile=command('javac',['-proc:none','--release','17','--module-path',join(dir,'modules'),'--add-modules','javafx.controls','-cp',join(dir,'library.jar'),'-d',consumer,join(consumer,name+'.java')],dir);assert.equal(compile.status,0,compile.stderr);
 const args=['--module-path',join(dir,'modules')+':'+join(dir,'checker.jar'),'--add-modules','javafx.controls,javafx.swing','-cp',consumer+':'+join(dir,'library.jar')];
 if(agent)args.push('-javaagent:'+join(dir,'checker.jar')+'=zero.ui1|'+join(dir,'library.jar'));
 args.push('--module','zero.hub.checker/hub.policy.TrustedRun',name==='Main'?'first':'behavior',name,'zero.ui1');
 return command('java',args,dir);
}
test('real JDK17 closed-module observer resists both attacks in checks/examples, preserves lambdas and rejects exit/halt',async()=>{
 const dir=await setup();
 try {
  for(const name of ['BehaviorCheck','Main']) {
   for(const attack of [reflectionForgery,methodHandleForgery,unsafeDeputyForgery]) {
    const r=await launch(dir,name,attack(name));assert.notEqual(r.status,0,r.stdout+r.stderr);assert.match(r.stderr,/Consumer never loaded a component/);
   }
   const ordinary=await launch(dir,name,`public class ${name} extends javafx.application.Application { public void start() { Class<?> guard; try {guard=Class.forName("hub.policy.JarTracker");} catch(Exception e){throw new AssertionError(e);} if(guard.getModule().isOpen("hub.policy", getClass().getModule()) || guard.getModule().isExported("hub.policy",getClass().getModule())) throw new AssertionError("Observer exposed to candidate"); Runnable r=() -> zero.ui1.Display.touch(); r.run(); } }`);
   assert.equal(ordinary.status,0,ordinary.stdout+ordinary.stderr);
   for(const exit of ['System.exit(0);','Runtime.getRuntime().halt(0);']) {
    const r=await launch(dir,name,`public class ${name} { public static void main(String[] args) {zero.ui1.Display.touch(); ${exit}} }`);assert.notEqual(r.status,0,r.stdout+r.stderr);assert.match(r.stderr,/cannot terminate/);
   }
   // A candidate never gets a pass by loading the guard without the trusted premain.
   const noAgent=await launch(dir,name,`public class ${name} {public static void main(String[] args){zero.ui1.Display.touch();}}`,false);assert.notEqual(noAgent.status,0,noAgent.stderr);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
