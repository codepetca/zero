import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync, readdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareUiPrototypes, parseUiPrototypeArgs, selectUiPrototypes} from './prepare-ui-prototypes.mjs';
import {verifyUiPrototypes} from './verify-ui-prototypes.mjs';
const repository = fileURLToPath(new URL('../', import.meta.url));
const scaffold = ['pom.xml', 'mvnw', 'mvnw.cmd', 'zero.json', '.gitignore',
  '.mvn/wrapper/maven-wrapper.properties', '.mvn/wrapper/LICENSE-APACHE-2.0.txt', '.mvn/wrapper/NOTICE',
  '.vscode/settings.json', '.vscode/tasks.json', '.vscode/extensions.json'];
function put(root, name, content) {
  const filename = path.join(root, name); mkdirSync(path.dirname(filename), {recursive:true}); writeFileSync(filename, content);
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'zero simulation selection ')));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  for (const name of scaffold) put(root, 'student-template/' + name, 'fixture ' + name);
  put(root, 'LICENSE', 'fixture license');
  for (let i=0; i<16; i++) put(root, `framework/src/main/java/zero/Helper${i}.java`, `package zero; class Helper${i} {}`);
  put(root, 'framework/prototypes/simulation/Main.java', readFileSync(path.join(repository, 'framework/prototypes/simulation/Main.java')));
  put(root, 'framework/prototypes/checks/simulation/PrototypeCheck.java', '// test harness');
  return root;
}

test('selection is explicit and rejects bad IDs before any output mutation', t => {
  const root = fixture(t);
  assert.deepEqual(selectUiPrototypes(), ['counter','coin-game','beginner-coin-game','actor-stress','simulation']);
  assert.deepEqual(parseUiPrototypeArgs(['--only=simulation']), ['simulation']);
  for (const args of [['--only='],['--only=simulation,'],['--only=unknown'],['--only=simulation,simulation'],['--only=simulation','extra'],['--only','simulation']]) {
    assert.throws(() => parseUiPrototypeArgs(args));
  }
  for (const only of [[],['unknown'],['simulation','simulation'],['simulation','']]) {
    assert.throws(() => prepareUiPrototypes(root, {only}));
    assert.throws(() => verifyUiPrototypes(root, {only, run:() => assert.fail('Maven must not run')}));
    assert.equal(existsSync(path.join(root, '.verification')), false);
  }
});

test('simulation-only assembly needs no other sources and preserves every other scratch project', t => {
  const root = fixture(t);
  for (const id of ['counter','coin-game','beginner-coin-game','actor-stress']) put(root, `.verification/ui-prototypes/${id}/sentinel`, `keep ${id}`);
  const projects = prepareUiPrototypes(root, {only:['simulation']});
  assert.deepEqual(projects.map(project => project.id), ['simulation']);
  assert.deepEqual(projects[0].studentSources, ['Main.java']);
  assert.equal(existsSync(path.join(projects[0].directory, 'src/main/java/ScoreDisplay.java')), false);
  assert.equal(readFileSync(path.join(projects[0].directory, 'src/main/java/Main.java'), 'utf8'), readFileSync(path.join(root, 'framework/prototypes/simulation/Main.java'), 'utf8'));
  for (const id of ['counter','coin-game','beginner-coin-game','actor-stress']) assert.equal(readFileSync(path.join(root, `.verification/ui-prototypes/${id}/sentinel`), 'utf8'), `keep ${id}`);
  assert.doesNotThrow(() => prepareUiPrototypes(root, {only:['simulation']}));
});

test('owned edits and unowned output survive failed preparation', t => {
  const root = fixture(t);
  const [project] = prepareUiPrototypes(root, {only:['simulation']});
  const main = path.join(project.directory, 'src/main/java/Main.java');
  writeFileSync(main, 'student edit');
  assert.throws(() => prepareUiPrototypes(root, {only:['simulation']}), /Preserved edited prototype file/);
  assert.equal(readFileSync(main, 'utf8'), 'student edit');
  const unowned = fixture(t);
  put(unowned, '.verification/ui-prototypes/simulation/precious.txt', 'keep unowned');
  assert.throws(() => prepareUiPrototypes(unowned, {only:['simulation']}), /Preserved unowned prototype output/);
  assert.equal(readFileSync(path.join(unowned, '.verification/ui-prototypes/simulation/precious.txt'), 'utf8'), 'keep unowned');
  assert.equal(existsSync(path.join(unowned, '.verification/ui-prototypes/simulation/src')), false);
});

test('all selected destinations validate before any generated project is written', t => {
  const root = fixture(t);
  assert.throws(() => prepareUiPrototypes(root, {only:['simulation','counter']}));
  assert.equal(existsSync(path.join(root, '.verification')), false);
});

test('selected native verification runs only simulation and retains full-suite receipt', t => {
  const root = fixture(t);
  put(root, '.verification/ui-prototypes/native-results.json', 'previous full-suite receipt');
  let runs = 0;
  const results = verifyUiPrototypes(root, {only:['simulation'], run:(directory, args) => {
    runs++;
    assert.equal(path.basename(directory), 'simulation');
    assert.ok(args.includes('-o'));
    assert.ok(existsSync(path.join(directory, 'src/main/java/PrototypeCheck.java')));
    return {stdout:'ZERO_SIMULATION_PROTOTYPE_OK test driver result', stderr:''};
  }});
  assert.equal(runs, 1);
  assert.deepEqual(results.map(result => result.id), ['simulation']);
  const output = path.join(root, '.verification/ui-prototypes');
  assert.equal(readFileSync(path.join(output, 'native-results.json'), 'utf8'), 'previous full-suite receipt');
  const receipt = JSON.parse(readFileSync(path.join(output, 'native-results-simulation.json')));
  assert.deepEqual(receipt.selection, ['simulation']);
  assert.deepEqual(receipt.results.map(result => result.id), ['simulation']);
  assert.equal(existsSync(path.join(output, 'simulation/src/main/java/PrototypeCheck.java')), false);
});


test('counter and game receive identical student-owned score contracts without touching other prototypes', t => {
  const root = fixture(t);
  const shared = ['ScoreView.java','ScoreDisplay.java','BarScoreDisplay.java'];
  for (const name of shared) put(root, 'framework/prototypes/shared/' + name, readFileSync(path.join(repository, 'framework/prototypes/shared', name)));
  for (const id of ['counter','coin-game']) {
    for (const name of readdirSync(path.join(repository, 'framework/prototypes', id)).filter(name => name.endsWith('.java'))) {
      put(root, `framework/prototypes/${id}/${name}`, readFileSync(path.join(repository, 'framework/prototypes', id, name)));
    }
  }
  put(root, '.verification/ui-prototypes/actor-stress/sentinel', 'keep stress');
  const projects = prepareUiPrototypes(root, {only:['counter','coin-game']});
  assert.deepEqual(projects.map(project => project.id), ['counter','coin-game']);
  for (const name of shared) {
    const expected = readFileSync(path.join(root, 'framework/prototypes/shared', name));
    for (const project of projects) {
      assert.ok(project.studentSources.includes(name));
      assert.deepEqual(readFileSync(path.join(project.directory, 'src/main/java', name)), expected);
    }
  }
  assert.equal(readFileSync(path.join(root, '.verification/ui-prototypes/actor-stress/sentinel'), 'utf8'), 'keep stress');
  assert.equal(existsSync(path.join(root, '.verification/ui-prototypes/beginner-coin-game')), false);
  assert.deepEqual(prepareUiPrototypes(root, {only:['simulation']})[0].studentSources, ['Main.java']);
});
