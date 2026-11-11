'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');
const {registerJavaRun} = require('../src/java-run');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-java-run-'));
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  const root = await fs.realpath(directory);
  const pomPath = path.resolve(__dirname, '../../student-template/pom.xml');
  await fs.copyFile(pomPath, path.join(root, 'pom.xml'));
  await fs.writeFile(path.join(root, 'zero.json'), '{}');

  const folder = {uri:{scheme:'file', fsPath:root}};
  const calls = [];
  const saved = [];
  const reporter = {isCancelled:() => false, done:() => calls.push('finished Java progress')};
  let resolve;
  const vscode = {
    workspace:{
      workspaceFolders:[folder], isTrusted:true,
      getConfiguration:(key, resource) => {
        assert.equal(key, 'launch');
        assert.equal(resource, folder.uri);
        return {get:() => saved};
      },
    },
    extensions:{getExtension:id => {
      assert.equal(id, 'vscjava.vscode-java-debug');
      return {exports:{progressProvider:{getProgressReporter:key => key === 'progress' ? reporter : undefined}}};
    }},
    debug:{registerDebugConfigurationProvider:(type, provider) => {
      assert.equal(type, 'java');
      resolve = provider.resolveDebugConfiguration;
    }},
    commands:{executeCommand:async (...args) => calls.push(args)},
  };
  registerJavaRun(vscode);
  const config = {type:'java', request:'launch', noDebug:true, name:'Main',
    mainClass:'Main', projectName:'my-app', __origin:'internal', __progressId:'progress'};
  return {root, folder, config, resolve, calls, saved, reporter, vscode};
}

test('the standard Run Java launch runs the current Zero app once', async t => {
  const {root, folder, config, resolve, calls} = await fixture(t);
  assert.equal(await resolve(folder, config), undefined);
  assert.deepEqual(calls, ['finished Java progress', ['zero.runApp', root]]);
});

test('the Maven entry point determines which main class runs through Zero', async t => {
  const {root, folder, config, resolve, calls} = await fixture(t);
  const pom = path.join(root, 'pom.xml');
  const text = await fs.readFile(pom, 'utf8');
  await fs.writeFile(pom, text.replace('<app.mainClass>Main</app.mainClass>', '<app.mainClass>game.Start</app.mainClass>'));
  assert.equal(await resolve(folder, config), config);
  assert.equal(await resolve(folder, {...config, name:'Start', mainClass:'game.Start'}), undefined);
  assert.deepEqual(calls, ['finished Java progress', ['zero.runApp', root]]);
});

test('debugging, custom launch options, saved configs and other Java projects keep their launch', async t => {
  const {folder, config, resolve, calls, saved} = await fixture(t);
  for (const changes of [{noDebug:false}, {request:'attach'}, {mainClass:'Example'},
    {projectName:'other'}, {vmArgs:'-ea'}, {preLaunchTask:'build'}]) {
    const candidate = {...config, ...changes};
    assert.equal(await resolve(folder, candidate), candidate);
  }
  saved.push({type:'java', request:'launch', name:'Main', mainClass:'Main'});
  assert.equal(await resolve(folder, config), config);
  assert.deepEqual(calls, []);
});

test('untrusted, non-Zero, and cancelled launches never start Zero', async t => {
  const {root, folder, config, resolve, calls, reporter, vscode} = await fixture(t);
  vscode.workspace.isTrusted = false;
  assert.equal(await resolve(folder, config), config);
  vscode.workspace.isTrusted = true;
  const other = {uri:{scheme:'file', fsPath:path.join(root, 'other')}};
  await fs.mkdir(other.uri.fsPath);
  vscode.workspace.workspaceFolders.push(other);
  assert.equal(await resolve(other, config), config);
  await fs.writeFile(path.join(other.uri.fsPath, 'zero.json'), '{}');
  assert.equal(await resolve(folder, config), config);
  vscode.workspace.workspaceFolders.pop();
  assert.equal(await resolve(folder, config, {isCancellationRequested:true}), undefined);
  assert.deepEqual(calls.splice(0), ['finished Java progress']);
  reporter.isCancelled = () => true;
  assert.equal(await resolve(folder, config), undefined);
  assert.equal(await resolve(folder, {...config, __progressId:'finished'}), undefined);
  assert.deepEqual(calls, []);
});
