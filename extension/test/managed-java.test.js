'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {managedJavaHome,managedJavaEnvironment,verifyManagedJava} = require('../src/managed-java');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('an old native editor reload resolves the current verified kit without a new process environment', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-java-handoff-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const platform=process.platform==='win32'?'win32':'darwin',kit=path.join(root,'kit'),home=path.join(root,'home');
  await fs.mkdir(path.join(kit,'setup'),{recursive:true});
  const environment={ZERO_KIT_DIR:kit,JAVA_HOME:path.join(root,'old-system-jdk17'),HOME:home,LOCALAPPDATA:home,PATH:''};
  const sourceDirectory=path.join(home,...(platform==='darwin'?['Library','Application Support','Zero']:['ZeroData']),'editor','extensions','zero.zero-0.5.54','src');
  const metadata=path.join(kit,'setup',platform==='darwin'?'mac-downloads.json':'windows-downloads.json');
  const install=async hash=>{
    const asset={sha256:hash.repeat(64),version:'jdk-21.0.12.1+1'};
    await fs.writeFile(metadata,JSON.stringify({schemaVersion:1,architectures:{arm64:{jdk:asset},x64:{jdk:asset}}}));
    const folder=path.join(home,...(platform==='darwin'?['Library','Application Support','Zero','runtime']:['ZeroData','runtime']),'jdk-'+asset.sha256);
    await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,platform==='darwin'?'.zero-asset.json':'.zero-asset.sha256'),asset.sha256);
    return platform==='darwin'?path.join(folder,asset.version,'Contents','Home'):folder;
  };
  const first=await install('a');assert.equal(managedJavaHome(environment,platform,sourceDirectory),first);
  const inherited=await verifyManagedJava({environment,platform,sourceDirectory,execute:async command=>({stdout:command.endsWith('javac.exe')||command.endsWith('javac')?'javac 21.0.12.1':'openjdk version "21.0.12.1"'})});
  assert.equal(inherited.JAVA_HOME,first);
  // Reload Window keeps the old marker (or lacks it entirely on old releases).
  environment.ZERO_JAVA_HOME=first;
  const current=await install('b');assert.equal(managedJavaHome(environment,platform),current);
  const env=await verifyManagedJava({environment,platform,execute:async command=>{
    assert.ok(command.startsWith(current+path.sep));return {stdout:command.endsWith('javac.exe')||command.endsWith('javac')?'javac 21.0.12.1':'openjdk version "21.0.12.1"'};
  }});
  assert.equal(env.JAVA_HOME,current);assert.equal(env.ZERO_JAVA_HOME,current);assert.equal(environment.ZERO_JAVA_HOME,first);
  await fs.writeFile(metadata,'{}');assert.throws(()=>managedJavaHome(environment,platform),/selection is unavailable.*system Java will not be substituted/);
});

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
  // Both shipped manual launchers export a kit path, without private runtimes.
  for(const platform of ['darwin','win32']) {
    const manual={...env,ZERO_KIT_DIR:platform==='win32'?'C:\\Manual Zero':'/manual/zero'};
    assert.equal(managedJavaHome(manual,platform),undefined);assert.deepEqual(managedJavaEnvironment(manual,platform),manual);
    assert.equal(await verifyManagedJava({environment:manual,platform,execute:()=>assert.fail('Manual setup must retain its system JDK')}),undefined);
  }
});

test('nonordinary native metadata cannot block the editor host before file validation', {skip:process.platform==='win32'}, async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-java-fifo-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const kit=path.join(root,'kit');await fs.mkdir(path.join(kit,'setup'),{recursive:true});
  const cp=require('node:child_process');cp.execFileSync('mkfifo',[path.join(kit,'setup','mac-downloads.json')]);
  const script=`try {require(${JSON.stringify(require.resolve('../src/managed-java'))}).managedJavaHome(${JSON.stringify({ZERO_KIT_DIR:kit,ZERO_JAVA_HOME:'/native/jdk',HOME:root})},'darwin');process.exitCode=1;}catch(e){console.log(e.message);}`;
  const result=cp.spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:2000});
  assert.ifError(result.error);assert.equal(result.status,0);assert.match(result.stdout,/bounded ordinary file/);
});
