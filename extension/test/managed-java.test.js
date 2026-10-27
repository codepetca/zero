'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {managedJavaHome,managedJavaEnvironment,verifyManagedJava} = require('../src/managed-java');

test('Zero child Java ignores inherited older/newer Java and injected JVM flags without editing its parent', async () => {
  for (const major of [17,21,25]) {
    const original = {ZERO_JAVA_HOME:'/Zero private/JDK21',JAVA_HOME:'/system/jdk'+major,PATH:'/system/jdk'+major+'/bin:/usr/bin',JAVA_TOOL_OPTIONS:'-Djava.home=/old',JDK_JAVA_OPTIONS:'--class-path /old',_JAVA_OPTIONS:'-javaagent:/old',MAVEN_OPTS:'-Djava.home=/old',MAVEN_ARGS:'-Djava.home=/old',COLOR:'blue'};
    const before = {...original}, calls = [];
    const selected = await verifyManagedJava({environment:original,platform:'darwin',execute:async (file,args,options) => {
      calls.push(file); assert.deepEqual(args,['-version']);assert.equal(options.env.JAVA_HOME,original.ZERO_JAVA_HOME);
      assert.equal(options.env.JAVA_TOOL_OPTIONS,undefined);assert.equal(options.env.MAVEN_OPTS,undefined);assert.equal(options.shell,undefined);
      return file.endsWith('javac') ? {stdout:'javac 21.0.12.1'} : {stderr:'openjdk version "21.0.12.1"'};
    }});
    assert.deepEqual(calls,['/Zero private/JDK21/bin/java','/Zero private/JDK21/bin/javac']);
    assert.equal(selected.PATH.split(':')[0],'/Zero private/JDK21/bin');assert.equal(selected.COLOR,'blue');assert.equal(selected.MAVEN_SKIP_RC,'1');
    assert.deepEqual(original,before);
  }
});

test('managed Java is required exactly; missing/old/newer/mismatched tools never fall back to system Java', async () => {
  for (const [java,javac] of [[17,17],[25,25],[21,17],[17,21],[21,25]]) {
    const calls=[];
    await assert.rejects(verifyManagedJava({environment:{ZERO_JAVA_HOME:'/Zero/jdk',JAVA_HOME:'/working/system/jdk21',PATH:'/working/system/jdk21/bin'},execute:async file=>{
      calls.push(file);return file.endsWith('javac') ? {stdout:`javac ${javac}.0.1`} : {stderr:`openjdk version "${java}.0.1"`};
    }}),/bundled Java 21.*repair/);
    assert.ok(calls.every(file=>file.startsWith('/Zero/jdk/bin/')));
  }
  await assert.rejects(verifyManagedJava({environment:{ZERO_JAVA_HOME:'/missing'},execute:async()=>{throw new Error('ENOENT');}}),/bundled Java 21.*repair.*ENOENT/);
  for (const home of ['', 'relative/jdk','/Zero/jdk\nother']) assert.throws(()=>managedJavaHome({ZERO_JAVA_HOME:home}),/location is invalid/);
});

test('Windows Java environment keys are normalized only in Zero children', async () => {
  const original={Zero_Java_Home:'C:\\Zero private\\jdk',Java_Home:'C:\\system\\jdk25',Path:'C:\\system\\bin',java_tool_options:'-Djava.home=old'};
  const selected=managedJavaEnvironment(original,'win32');
  assert.equal(selected.JAVA_HOME,'C:\\Zero private\\jdk');assert.equal(selected.PATH,'C:\\Zero private\\jdk\\bin;C:\\system\\bin');
  assert.equal(selected.Java_Home,undefined);assert.equal(selected.Path,undefined);assert.equal(selected.java_tool_options,undefined);
  assert.equal(original.Java_Home,'C:\\system\\jdk25');
  const calls=[];await verifyManagedJava({environment:original,platform:'win32',execute:async file=>{calls.push(file);return {stdout:file.endsWith('javac.exe')?'javac 21.0.12.1':'openjdk version "21.0.12.1"'};}});
  assert.deepEqual(calls,['C:\\Zero private\\jdk\\bin\\java.exe','C:\\Zero private\\jdk\\bin\\javac.exe']);
});

test('ordinary extension and developer installations keep their selected Java environment', async () => {
  const env={JAVA_HOME:'/my/jdk25',PATH:'/my/bin',JAVA_TOOL_OPTIONS:'my flags'};
  assert.equal(managedJavaHome(env),undefined);assert.deepEqual(managedJavaEnvironment(env),env);
  assert.equal(await verifyManagedJava({environment:env,execute:()=>assert.fail('No Zero runtime was selected')}),undefined);
});
