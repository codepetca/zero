'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {javaMajor,gitVersion,inspectSetup,checklist,taskEnvironmentOverrides} = require('../src/setup');

const defaults = {
  env:{},platform:'darwin',project:async () => '/student',checkProject:async () => {},
  getExtension:() => ({}),
  execute:async command => ({stderr:command.endsWith('javac') ? 'javac 17.0.12' : command === 'git' ? '' : 'openjdk version "17.0.12"',stdout:command === 'git' ? 'git version 2.31.0' : ''})
};
test('managed setup probes Zero Java rather than inherited Java and ignores terminal overrides for Run', async () => {
  for (const inherited of [17,25]) {
    const env={ZERO_JAVA_HOME:'/Zero/jdk21',JAVA_HOME:'/old/jdk'+inherited,PATH:'/old/bin',JAVA_TOOL_OPTIONS:'-Djava.home=/old'};
    const report=await inspectSetup({...defaults,env,getTaskEnvironment:()=>({JAVA_HOME:'/workspace/old-jdk',PATH:'/old/bin'}),execute:async (file,args,options)=>{
      if(file==='git')return defaults.execute(file);
      assert.ok(file.startsWith('/Zero/jdk21/bin/'));assert.equal(options.env.JAVA_HOME,'/Zero/jdk21');assert.equal(options.env.JAVA_TOOL_OPTIONS,undefined);
      return {stdout:file.endsWith('javac')?'javac 21.0.12.1':'openjdk version "21.0.12.1"'};
    }});
    assert.equal(report.runReady,true);assert.equal(report.source,'Zero bundled Java');assert.equal(report.taskEnvironment.verified,true);assert.equal(env.JAVA_HOME,'/old/jdk'+inherited);
    const broken=await inspectSetup({...defaults,env,execute:async file=>file==='git'?defaults.execute(file):{stdout:file.endsWith('javac')?'javac 25.0.1':'openjdk version "25.0.1"'}});
    assert.equal(broken.runReady,false);assert.match(broken.jdkDetail,/bundled JDK 21 needs repair/);
  }
});
test('parses Java vendor output, legacy Java and Git platform suffixes conservatively', () => {
  for (const text of ['openjdk version "17.0.12"','java version "17.0.12"','openjdk 21.0.4 2024-07-16','java 25 2025-09-16']) assert.ok(javaMajor(text) >= 17);
  assert.equal(javaMajor('java version "1.8.0_392"'),8);
  assert.equal(javaMajor('javac 21.0.4',true),21);
  assert.equal(javaMajor('unrecognized 17.0.12'),undefined);
  assert.deepEqual(gitVersion('git version 2.31.1.windows.1'),[2,31,1]);
  assert.deepEqual(gitVersion('git version 2.39.3 (Apple Git-146)'),[2,39,3]);
});
test('Run readiness requires full JDK and project; Git and editor/debugger are separate', async () => {
  const report = await inspectSetup({...defaults,getExtension:() => undefined,execute:async command => command === 'git' ? {stdout:'git version 2.30.9'} : defaults.execute(command)});
  assert.equal(report.runReady,true); assert.equal(report.editorReady,false); assert.equal(report.gitReady,false);
  assert.ok(checklist(report).some(item => item.action === 'run'));
  assert.match(checklist(report).find(item => item.action === 'git').description,/Sharing incomplete/);
  assert.match(checklist(report).find(item => item.action === 'vscjava.vscode-java-debug').description,/does not block Run App/);
});
test('rejects old Java, missing compiler, unrecognized output and mismatched Java majors', async t => {
  for (const [name,execute] of [
    ['old Java',async command => command === 'git' ? defaults.execute(command) : {stdout:command === 'javac' ? 'javac 11.0.2' : 'java version "11.0.2"'}],
    ['missing compiler',async command => {if(command === 'javac') throw Object.assign(new Error('not found'),{code:'ENOENT'}); return defaults.execute(command);}],
    ['unknown Java',async command => command === 'java' ? {stdout:'Something 17'} : defaults.execute(command)],
    ['mismatched majors',async command => command === 'javac' ? {stdout:'javac 21.0.4'} : defaults.execute(command)]
  ]) await t.test(name,async () => {
    const report = await inspectSetup({...defaults,execute});
    assert.equal(report.runReady,false); assert.equal(report.jdkReady,false);
    assert.ok(!checklist(report).some(item => item.action === 'run'));
  });
});
test('JAVA_HOME takes precedence and invalid JAVA_HOME never falls back to PATH', async () => {
  const commands = [];
  const report = await inspectSetup({...defaults,env:{JAVA_HOME:'/old JDK; no shell'},execute:async (command,args,options) => {
    commands.push({command,args,options});
    if(command !== 'git') throw Object.assign(new Error('not found'),{code:'ENOENT'});
    return defaults.execute(command);
  }});
  assert.equal(report.runReady,false); assert.equal(report.source,'JAVA_HOME');
  assert.deepEqual(commands.map(call => call.command),['/old JDK; no shell/bin/java','/old JDK; no shell/bin/javac','git']);
  assert.match(report.jdkDetail,/repair JAVA_HOME/);
  for (const call of commands) {
    assert.equal(call.options.timeout,10000);assert.equal(call.options.maxBuffer,64*1024);assert.equal(call.options.windowsHide,true);assert.equal(call.options.shell,undefined);
    assert.deepEqual(call.args,call.command === 'git' ? ['--version'] : ['-version']);
  }
});
test('Windows home is case insensitive and executable paths preserve spaces', async () => {
  const commands = [];
  const report = await inspectSetup({...defaults,platform:'win32',env:{Java_Home:'C:\\Program Files\\Java\\jdk-17'},execute:async command => {
    commands.push(command);
    return command === 'git' ? defaults.execute(command) : {stdout:command.endsWith('javac.exe') ? 'javac 17.0.12' : 'java version "17.0.12"'};
  }});
  assert.equal(report.runReady,true);
  assert.deepEqual(commands,['C:\\Program Files\\Java\\jdk-17\\bin\\java.exe','C:\\Program Files\\Java\\jdk-17\\bin\\javac.exe','git']);
});
test('bounded timeout and project detection errors cannot claim ready', async () => {
  const report = await inspectSetup({...defaults,project:async () => {throw new Error('Multiple Zero projects are open.');},execute:async command => {
    if(command === 'java') throw Object.assign(new Error('timed out'),{killed:true}); return defaults.execute(command);
  }});
  assert.equal(report.runReady,false); assert.equal(report.java.text,'Check timed out.');
  assert.match(report.project.text,/Multiple Zero projects/);
  const malformed = await inspectSetup({...defaults,checkProject:async () => {throw new Error('Missing pom.xml');}});
  assert.equal(malformed.jdkReady,true);assert.equal(malformed.runReady,false);assert.match(malformed.project.text,/Missing pom/);
});
test('checks actual project wrapper without executing builds', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'zero-setup-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),'{}');
  const options = {...defaults,project:async () => root}; delete options.checkProject;
  let report = await inspectSetup(options);
  assert.equal(report.runReady,false);assert.match(report.project.text,/needs pom.xml/);
  await fs.writeFile(path.join(root,'pom.xml'),'<project/>');await fs.writeFile(path.join(root,'mvnw'),'');
  report = await inspectSetup(options);assert.equal(report.runReady,false);assert.match(report.project.text,/needs \.mvn\/wrapper\/maven-wrapper.properties.*hidden folders.*starter folder/);
  await fs.mkdir(path.join(root,'.mvn','wrapper'),{recursive:true});
  await fs.writeFile(path.join(root,'.mvn','wrapper','maven-wrapper.properties'),'distributionUrl=example');
  await fs.chmod(path.join(root,'mvnw'),0o644);
  report = await inspectSetup(options);assert.equal(report.runReady,false);assert.match(report.project.text,/not executable.*Re-extract.*permissions/);
  await fs.chmod(path.join(root,'mvnw'),0o755);
  report = await inspectSetup(options); assert.equal(report.runReady,true);
  report = await inspectSetup({...options,platform:'win32'}); assert.equal(report.runReady,false);assert.match(report.project.text,/needs mvnw.cmd/);
  await fs.writeFile(path.join(root,'mvnw.cmd'),'');
  await fs.chmod(path.join(root,'mvnw'),0o644);
  report = await inspectSetup({...options,platform:'win32'});assert.equal(report.runReady,true,'Windows needs wrapper existence, not POSIX execute permission');
});
test('relevant terminal overrides leave host results accurate but Run environment unverified',async t => {
  for (const environment of [{JAVA_HOME:'/invalid'},{PATH:null},{JAVA_HOME:'${env:JAVA_HOME}'},{MAVEN_OPTS:'-invalid'},{JAVA_TOOL_OPTIONS:null},{JDK_JAVA_OPTIONS:'${config:jvm}'},{_JAVA_OPTIONS:''},{MVNW_REPOURL:'https://example.invalid'}]) {
    await t.test(Object.keys(environment)[0]+': '+String(Object.values(environment)[0]),async () => {
      const report = await inspectSetup({...defaults,getTaskEnvironment:async (root,platform) => {assert.equal(root,'/student');assert.equal(platform,'darwin');return environment;}});
      assert.equal(report.jdkReady,true);assert.equal(report.runReady,false);assert.equal(report.taskEnvironment.verified,false);
      assert.deepEqual(report.taskEnvironment.keys,Object.keys(environment));
      assert.match(report.taskEnvironment.text,/host-process checks.*Run task.*ordinary Run App remains available/);
      assert.ok(!checklist(report).some(item => item.action === 'run'));
    });
  }
});
test('good terminal override cannot rescue bad host Java; values are never applied or exposed',async () => {
  const report = await inspectSetup({...defaults,execute:async command => command === 'java' ? {stdout:'java version "11.0.2"'} : defaults.execute(command),getTaskEnvironment:() => ({JAVA_HOME:'/good-secret-jdk'})});
  assert.equal(report.jdkReady,false);assert.equal(report.runReady,false);assert.equal(report.taskEnvironment.verified,false);
  assert.doesNotMatch(report.taskEnvironment.text,/good-secret-jdk/);
});
test('Windows terminal variable names are case insensitive; irrelevant settings preserve normal checks',async () => {
  assert.deepEqual(taskEnvironmentOverrides({Java_Home:null,Path:'${env:PATH}',maven_opts:'-x'},'win32'),['Java_Home','Path','maven_opts']);
  assert.deepEqual(taskEnvironmentOverrides({Java_Home:null,Path:'x',COLOR:'blue'},'darwin'),[]);
  for (const environment of [undefined,null,{}, {COLOR:'blue'}]) {
    const report = await inspectSetup({...defaults,getTaskEnvironment:() => environment});
    assert.equal(report.runReady,true);assert.equal(report.taskEnvironment.verified,true);
  }
  const report = await inspectSetup({...defaults,getTaskEnvironment:() => {throw new Error('Configuration unavailable');}});
  assert.equal(report.runReady,false);assert.match(report.taskEnvironment.text,/could not be read/);
});


test('tutorial preflight requires upload-capable Git before offering Run while ordinary local apps stay Git-free',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-tutorial-setup-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),JSON.stringify({tutorialProjectId:'greeting',repositoryRequired:true,lessonId:'0'}));
  for(const missing of [false,true]) {
    const report=await inspectSetup({...defaults,project:async()=>root,execute:async command=>{
      if(command==='git'){if(missing)throw Object.assign(new Error('Git not installed'),{code:'ENOENT'});return {stdout:'git version 2.30.9'};}
      return defaults.execute(command);
    }});
    assert.equal(report.project.requiresGit,true);assert.equal(report.runReady,false);
    assert.ok(!checklist(report).some(item=>item.action==='run'));
    assert.match(checklist(report).find(item=>item.action==='git').description,/Tutorial setup incomplete/);
    assert.match(checklist(report).find(item=>item.action==='git').label,/warning/);
  }
  const ready=await inspectSetup({...defaults,project:async()=>root});
  assert.equal(ready.runReady,true);assert.ok(checklist(ready).some(item=>item.action==='run'));
  await fs.writeFile(path.join(root,'zero.json'),'{}');
  const ordinary=await inspectSetup({...defaults,project:async()=>root,execute:async command=>{if(command==='git')throw new Error('Missing Git');return defaults.execute(command);}});
  assert.equal(ordinary.project.requiresGit,false);assert.equal(ordinary.runReady,true);
});
