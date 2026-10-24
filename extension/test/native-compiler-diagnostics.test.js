'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createNativeCompilerDiagnostics}=require('../src/native-compiler-diagnostics');
const root=path.resolve('student project');
const file=path.join(root,'src/main/java/Main.java');
const error=(name=file,line=22,column=50,message="';' expected")=>`[ERROR] ${name}:[${line},${column}] ${message}\n`;

test('pinned configured matcher is inert under its own owner, while programmatic fallback still parses Maven',()=>{
  const matchers=require('../package.json').contributes.problemMatchers;
  const pinned=matchers.find(item=>item.name==='zero-java');
  const fallback=matchers.find(item=>item.name==='zero-java-fallback');
  assert.notEqual(pinned.owner,'java');assert.notEqual(pinned.owner,'zero-native-compiler');
  const output=error().trimEnd();
  assert.equal(new RegExp(pinned.pattern.regexp).test(output),false);
  assert.equal(new RegExp(pinned.pattern.regexp).test(''),false);
  assert.deepEqual(new RegExp(fallback.pattern.regexp).exec(output).slice(1),[file,'22','50',"';' expected"]);
});

test('split streams, CRLF, duplicates and unterminated final errors retain exact source links',()=>{
  const changes=[];const compiler=createNativeCompilerDiagnostics({root,onChange:items=>changes.push(items)});
  compiler.push(error().slice(0,20),'stdout');compiler.push('[INFO] working\n','stderr');
  compiler.push(error().slice(20).replace('\n','\r\n'),'stdout');compiler.push(error(),'stderr');
  compiler.push(error(file,7,3,'cannot find symbol: café').trimEnd(),'stderr');compiler.end();
  assert.deepEqual(changes.at(-1),[
    {file,line:22,column:50,message:"';' expected"},
    {file,line:7,column:3,message:'cannot find symbol: café'}
  ]);
  assert.equal(changes.length,2);
  compiler.end();assert.equal(changes.length,2,'Repeated finalization cannot erase or duplicate errors');
});

test('compiler collection stops before game stdout and bounds malformed paths, positions and lines',()=>{
  const changes=[];const compiler=createNativeCompilerDiagnostics({root,onChange:items=>changes.push(items)});
  for(const line of [error(path.resolve('elsewhere/Main.java')),error('Main.java'),error(file,0),error(file,1,0),error(file,1,1000001),error(file,1,2,'x'.repeat(9000))])compiler.push(line);
  compiler.push('x'.repeat(9000));compiler.push(error()); // Oversized line must be discarded through its newline.
  assert.equal(changes.length,0);
  compiler.push(error());assert.equal(changes.length,1);
  compiler.push('[INFO] --- compiler:3.14.0:compile (default-compile) @ my-app ---\n');
  compiler.push('[INFO] --- javafx:0.0.8:run (default-cli) @ my-app ---\n');
  compiler.push(error(file,100));compiler.end();assert.equal(changes.length,1);
});

test('many distinct errors are capped and finalization retains the delivered failures',()=>{
  let latest=[];const compiler=createNativeCompilerDiagnostics({root,onChange:items=>{latest=items;}});
  for(let line=1;line<=250;line++)compiler.push(error(file,line,1));
  compiler.end();assert.equal(latest.length,200);assert.equal(latest[199].line,200);
});
