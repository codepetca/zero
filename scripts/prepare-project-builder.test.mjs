import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {projectBuilderFiles, prepareProjectBuilder} from './prepare-project-builder.mjs';
const require = createRequire(import.meta.url);
const format = require('../extension/src/project-builder-format');
async function temporary(t) {const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-saved-builder-test-'))); t.after(() => fs.rm(root, {recursive: true, force: true})); return root;}
function cli(root, request) {const run = spawnSync(process.execPath, [path.join(root, '.zero-build/run.cjs')], {input: typeof request === 'string' ? request : JSON.stringify(request), encoding: 'utf8', cwd: os.tmpdir(), env: {PATH: process.env.PATH, HOME: os.homedir()}, timeout: 10000}); return {status: run.status, response: JSON.parse(run.stdout)};}
test('producer saves complete standalone closure with runtime pins and exact config', async t => {
  const project = await temporary(t), destination = path.join(project, '.zero-build');
  const files = await projectBuilderFiles();
  assert.ok(files.some(file => file.path === 'src/web-export/compatibility/CheckCompatibility.java'));
  assert.ok(files.some(file => file.path === 'src/web-export/adapters/runtime/zero/web/BrowserLauncher.java'));
  assert.ok(files.some(file => file.path === 'src/sharing/configuration.js'));
  assert.ok(files.some(file => file.path === 'media/sharing-config.json'));
  assert.equal((await prepareProjectBuilder({destination})).changed, true);
  assert.equal((await prepareProjectBuilder({destination})).changed, false);
  const result = cli(project, {protocol: 1, operation: 'inspect'});
  assert.equal(result.status, 0); assert.equal(result.response.ok, true);
  assert.equal(result.response.result.files, files.length - 1);
  const core = require(path.join(destination, 'src/web-export'));
  assert.equal(typeof core.exportForWeb, 'function');
  const runtime = result.response.result.runtime;
  assert.ok(runtime.pins.every(pin => /^[a-f0-9]{64}$/.test(pin.sha256)));
});
test('producer checks all existing bytes before writing', async t => {
  const destination = path.join(await temporary(t), '.zero-build');
  await fs.mkdir(destination); await fs.writeFile(path.join(destination, 'personal.txt'), 'keep');
  await assert.rejects(prepareProjectBuilder({destination}), /differs/);
  assert.deepEqual(await fs.readdir(destination), ['personal.txt']);
});
test('standalone CLI rejects changed, undeclared, missing and linked files', async t => {
  const project = await temporary(t), destination = path.join(project, '.zero-build');
  await prepareProjectBuilder({destination});
  const filename = path.join(destination, 'README.md'), bytes = await fs.readFile(filename);
  await fs.writeFile(filename, 'changed'); assert.equal(cli(project, {protocol: 1, operation: 'inspect'}).response.ok, false);
  await fs.writeFile(filename, bytes); await fs.writeFile(path.join(destination, 'extra'), 'x'); assert.equal(cli(project, {protocol: 1, operation: 'inspect'}).response.ok, false);
  await fs.rm(path.join(destination, 'extra')); await fs.rm(filename); assert.equal(cli(project, {protocol: 1, operation: 'inspect'}).response.ok, false);
  await fs.symlink(path.join(destination, 'run.cjs'), filename); assert.equal(cli(project, {protocol: 1, operation: 'inspect'}).response.ok, false);
});
test('request schema is bounded and rejects commands, credentials and unsupported protocol', async t => {
  const project = await temporary(t); await prepareProjectBuilder({destination: path.join(project, '.zero-build')});
  for (const request of [{protocol: 2, operation: 'inspect'}, {protocol: 1, operation: 'inspect', env: {}}, {protocol: 1, operation: 'shell'}, {protocol: 1, operation: 'inspect', projectRoot: '../escape'}, ' '.repeat(65537)]) assert.equal(cli(project, request).response.ok, false);
});
test('pure manifest contract rejects traversal, duplicate case, unknown fields and aggregate drift', async () => {
  const files = await projectBuilderFiles(), manifest = JSON.parse(files.find(file => file.path === 'builder.json').bytes);
  assert.equal(format.validateBuilderManifest(manifest), manifest);
  for (const edit of [copy => copy.files[0].path = '../escape', copy => copy.files[1].path = copy.files[0].path.toUpperCase(), copy => copy.extra = true, copy => copy.closureSha256 = '0'.repeat(64), copy => copy.entrypoint = 'other.cjs']) {
    const copy = structuredClone(manifest); edit(copy); assert.throws(() => format.validateBuilderManifest(copy));
  }
});
test('every saved CommonJS dependency resolves inside the closure or is a Node built-in', async () => {
  const files = await projectBuilderFiles(), names = new Set(files.map(file => file.path));
  for (const file of files.filter(file => /\.(?:js|cjs)$/.test(file.path))) {
    for (const match of file.bytes.toString('utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (match[1].startsWith('node:')) continue;
      assert.ok(match[1].startsWith('.'), file.path + ': external npm/editor dependency ' + match[1]);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), match[1]));
      assert.ok(!resolved.startsWith('../') && [resolved, resolved + '.js', resolved + '.json', resolved + '/index.js'].some(name => names.has(name)), file.path + ': missing local dependency ' + match[1]);
    }
  }
});
test('cross-case directories and file/directory overlaps are rejected by pure inventory', async () => {
  const item = name => ({path: name, sha256: '0'.repeat(64), bytes: 0});
  for (const files of [[item('Foo/a'), item('foo/b')], [item('a'), item('a/b')]]) assert.throws(() => format.closureHash(files));
});
test('synchronous assembler API returns exactly the canonical producer bytes', async () => {
  const {projectBuilderFilesSync}=await import('./prepare-project-builder.mjs');
  assert.deepEqual(projectBuilderFilesSync(),await projectBuilderFiles());
});
test('capture metadata is usable for host Git checks without sending source bytes', async t => {
  const project = await temporary(t); await prepareProjectBuilder({destination: path.join(project, '.zero-build')});
  await fs.mkdir(path.join(project, 'src/main/java'),{recursive:true}); await fs.mkdir(path.join(project,'.mvn'),{recursive:true});
  await fs.writeFile(path.join(project,'pom.xml'),'<project/>'); await fs.writeFile(path.join(project,'src/main/java/Main.java'),'class Main {}\r\n');
  const capture=cli(project,{protocol:1,operation:'capture'});
  assert.equal(capture.status,0); assert.equal(capture.response.ok,true);
  const source=capture.response.result.inputs.find(input=>input.path==='src/main/java/Main.java');
  assert.match(source.gitBlobSha1,/^[a-f0-9]{40}$/); assert.notEqual(source.gitBlobSha1,source.normalizedGitBlobSha1);
  const builder=capture.response.result.inputs.find(input=>input.path==='.zero-build/run.cjs');
  assert.equal(builder.normalizedGitBlobSha1,undefined); assert.equal(typeof builder.bytes,'number');
  assert.ok(capture.response.result.inputs.some(input=>input.path==='.zero-build/builder.json'));
  // Matching immutable copies remain runnable from outside the source tree.
  const frozen=path.join(await temporary(t),'frozen');await fs.cp(path.join(project,'.zero-build'),frozen,{recursive:true});
  const run=spawnSync(process.execPath,[path.join(frozen,'run.cjs')],{input:JSON.stringify({protocol:1,operation:'capture',projectRoot:project}),encoding:'utf8',cwd:os.tmpdir(),env:{PATH:process.env.PATH,HOME:os.homedir()},timeout:10000});
  assert.equal(run.status,0); assert.equal(JSON.parse(run.stdout).result.sourceHash,capture.response.result.sourceHash);
});
