import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {validateReceipts, privateJavaPath, trialEnvironment} from './test-windows-javafx.mjs';
import {processSpecification} from './process-specification.mjs';

function receipts() {
  const asset = {platform:'windows', kind:'installer', filename:'Zero-Setup-0.5.18-windows-development.exe', velopackVersion:'1.2.161', updaterEnabled:false, authenticodeSigned:false, sha256:'a'.repeat(64), size:123};
  const build = {schema:1, kitVersion:'0.5.18', sourceRevision:'b'.repeat(40), artifacts:[asset]};
  const installation = {schema:1, status:'passed', stage:'passed-development-installation-smoke', version:build.kitVersion, sourceRevision:build.sourceRevision,
    setupSha256:asset.sha256, finishedUtc:'2026-10-16T18:00:00Z', events:['private-java-and-installed-support', 'reopen-from-start-shortcut', 'passed-development-installation-smoke'].map(name => ({name}))};
  return {installation, build, asset};
}
test('only the passing installation of the exact unsigned disabled-update candidate is accepted', () => {
  const f = receipts(); assert.equal(validateReceipts(f.installation, f.build), f.asset);
  for (const change of [{status:'failed'}, {stage:'first-launch-real-bootstrap'}, {version:'0.5.17'}, {sourceRevision:'c'.repeat(40)}, {setupSha256:'d'.repeat(64)}, {events:[]}, {finishedUtc:'invalid'}]) {
    assert.throws(() => validateReceipts({...f.installation, ...change}, f.build), /passing installation/);
  }
  for (const change of [{updaterEnabled:true}, {authenticodeSigned:true}, {filename:'../Setup.exe'}, {size:0}, {velopackVersion:'other'}]) {
    assert.throws(() => validateReceipts(f.installation, {...f.build, artifacts:[{...f.asset, ...change}]}), /unsigned development/);
  }
  assert.throws(() => validateReceipts(f.installation, {...f.build, artifacts:[f.asset, f.asset]}), /Invalid measured/);
});
test('private Java requires the complete exact asset root, rejecting prefix lookalikes and duplicate defaults', () => {
  const data = 'C:\\Users\\Trial\\AppData\\Local\\ZeroData', hash = 'a'.repeat(64);
  const expected = path.win32.join(data, 'runtime', `jdk-${hash}`);
  const settings = runtime => ({'java.configuration.runtimes':[{name:'JavaSE-21', default:true, path:runtime}]});
  assert.equal(privateJavaPath(settings(expected.toUpperCase()), data, hash, path.win32), expected);
  for (const invalid of [expected + '-other', expected + '\\..\\outside', 'C:\\Global Java', expected + '\\bin']) {
    assert.throws(() => privateJavaPath(settings(invalid), data, hash, path.win32), /exact pinned/);
  }
  assert.throws(() => privateJavaPath({'java.configuration.runtimes':[...settings(expected)['java.configuration.runtimes'], ...settings(expected)['java.configuration.runtimes']]}, data, hash, path.win32), /exact pinned/);
});
test('both Maven phases share private caches and strip ambient execution overrides without changing the parent', () => {
  const ambient = {Path:'C:\\Windows\\System32', JAVA_HOME:'C:\\Wrong', MAVEN_OPTS:'-javaagent:bad', Maven_Args:'--settings global.xml', JAVA_TOOL_OPTIONS:'-javaagent:bad', _JAVA_OPTIONS:'bad', JDK_JAVA_OPTIONS:'bad', MVNW_REPOURL:'https://bad', MVNW_PASSWORD:'private', __MVNW_CMD__:'bad', CLASSPATH:'bad', SystemRoot:'C:\\Windows', TEMP:'C:\\GlobalTemp'};
  const output = 'C:\\Trial Results', java = 'C:\\Private Java';
  const online = trialEnvironment(ambient, java, output, 'online', 'nonce', path.win32);
  const offline = trialEnvironment(ambient, java, output, 'offline', 'nonce', path.win32);
  assert.equal(online.JAVA_HOME, java); assert.equal(online.PATH, `${java}\\bin;${ambient.Path}`);
  assert.equal(online.MAVEN_USER_HOME, offline.MAVEN_USER_HOME); assert.equal(online.MAVEN_OPTS, '-Duser.home="C:\\Trial Results\\java user home"');
  assert.equal(online.JAVA_TOOL_OPTIONS, '-Duser.home="C:\\Trial Results\\java user home" -Djava.io.tmpdir="C:\\Trial Results\\temp"');
  assert.equal(online.TEMP, 'C:\\Trial Results\\temp'); assert.equal(online.SystemRoot, ambient.SystemRoot);
  for (const key of ['Path', 'Maven_Args', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'MVNW_REPOURL', 'MVNW_PASSWORD', '__MVNW_CMD__', 'CLASSPATH']) assert.equal(online[key], undefined, key);
  assert.notEqual(online.ZERO_WINDOWS_JAVAFX_MARKER, offline.ZERO_WINDOWS_JAVAFX_MARKER);
  assert.equal(ambient.JAVA_HOME, 'C:\\Wrong');
  const spec = processSpecification('C:\\Trial Results\\installed starter with spaces\\mvnw.cmd', ['-Dmaven.repo.local=C:\\Trial Results\\maven repository', 'clean', 'compile', 'javafx:run'], 'win32');
  assert.equal(spec.windowsVerbatimArguments, true);
  assert.match(spec.args.at(-1), /"-Dmaven.repo.local=C:\\Trial Results\\maven repository"/);
});
