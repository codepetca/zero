import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, symlinkSync, lstatSync, readlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync, unzipSync} from 'fflate';
import {prepareStarter, coreSources} from './prepare-starter.mjs';
import {starterMembers, setupMembers, setupFiles, setupRequirements} from './kit.mjs';
import {root, releaseDefinition} from './release.mjs';
import {extractProject, maven} from './verification-project.mjs';

test('setup archive contains only launchers, guidance and version-bound metadata with executable shell files', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-setup-kit-'));
  try {
    mkdirSync(path.join(fixture, 'setup/tests'), {recursive:true});
    mkdirSync(path.join(fixture, 'extension'));
    writeFileSync(path.join(fixture, 'extension/package.json'), JSON.stringify({engines:{vscode:'^1.95.0'}}));
    for (const name of setupFiles) writeFileSync(path.join(fixture, 'setup', name), `fixture ${name}`);
    writeFileSync(path.join(fixture, 'setup/tests/private-log.txt'), 'excluded');
    const release = {kitVersion:'9.8.7'};
    const members = setupMembers(fixture, release);
    const extracted = unzipSync(zipSync(members));
    assert.deepEqual(Object.keys(extracted).sort(), [...setupFiles, 'kit.properties'].map(name=>`zero-kit/setup/${name}`).sort());
    assert.equal(new TextDecoder().decode(extracted['zero-kit/setup/kit.properties']), 'kitVersion=9.8.7\nextensionId=zero.zero\nvscodeMinimum=1.95.0\n');
    assert.equal((members['zero-kit/setup/Setup.command'][1].attrs >>> 16) & 0o777, 0o755);
    assert.equal((members['zero-kit/setup/setup.sh'][1].attrs >>> 16) & 0o777, 0o755);
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('setup compatibility follows the extension engine and refuses unsupported range semantics', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-setup-policy-'));
  try {
    mkdirSync(path.join(fixture, 'extension'));
    const manifest = path.join(fixture, 'extension/package.json');
    writeFileSync(manifest, JSON.stringify({engines:{vscode:'^1.110.2'}}));
    assert.deepEqual(setupRequirements(fixture), {vscodeMinimum:'1.110.2'});
    for (const range of ['>=1.95.0', '^1.95.0-insider', undefined]) {
      writeFileSync(manifest, JSON.stringify({engines:{vscode:range}}));
      assert.throws(() => setupRequirements(fixture), /update launcher compatibility policy/);
    }
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('starter preparation refreshes generated source and preserves edited copies as a pair', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-source-drift-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) writeFileSync(path.join(fixture, 'framework/src/main/java/zero', name), `original ${name}`);
    prepareStarter(fixture);
    assert.deepEqual(readFileSync(path.join(fixture, 'student-template/LICENSE')), readFileSync(path.join(root, 'LICENSE')));
    const generated = name => path.join(fixture, 'student-template/src/main/java/zero', name);
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), 'canonical update');
    prepareStarter(fixture);
    assert.equal(readFileSync(generated('App.java'), 'utf8'), 'canonical update');
    writeFileSync(generated('GameApp.java'), 'valuable student edit');
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), 'next update');
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    assert.equal(readFileSync(generated('GameApp.java'), 'utf8'), 'valuable student edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), 'canonical update');
    writeFileSync(generated('GameApp.java'), `original GameApp.java`);
    writeFileSync(path.join(fixture, 'student-template/LICENSE'), 'retained license edit');
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    assert.equal(readFileSync(path.join(fixture, 'student-template/LICENSE'), 'utf8'), 'retained license edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), 'canonical update');
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('starter preparation retires unchanged managed sources and preserves edited retired copies', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-source-retirement-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) writeFileSync(path.join(fixture, 'framework/src/main/java/zero', name), `original ${name}`);
    prepareStarter(fixture);
    const statePath = path.join(fixture, '.verification/starter-source.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const retiredNames = ['SketchApp.java', 'SimpleApp.java', 'RetiredApp.java'];
    for (const name of retiredNames) state[name] = state['App.java'];
    writeFileSync(statePath, JSON.stringify(state));
    const generated = name => path.join(fixture, 'student-template/src/main/java/zero', name);
    writeFileSync(generated('RetiredApp.java'), 'original App.java');
    writeFileSync(generated('SimpleApp.java'), 'valuable second retired edit');
    writeFileSync(generated('SketchApp.java'), 'valuable student edit');
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), 'next update');
    assert.throws(() => prepareStarter(fixture), /Preserved edited retired starter source/);
    assert.equal(readFileSync(generated('SketchApp.java'), 'utf8'), 'valuable student edit');
    assert.equal(readFileSync(generated('RetiredApp.java'), 'utf8'), 'original App.java');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), 'original App.java');
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    writeFileSync(generated('SketchApp.java'), 'original App.java');
    assert.throws(() => prepareStarter(fixture), /Preserved edited retired starter source/);
    assert.equal(readFileSync(generated('SimpleApp.java'), 'utf8'), 'valuable second retired edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), 'original App.java');
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    writeFileSync(generated('SimpleApp.java'), 'original App.java');
    // A current-source failure must also prevent retiring otherwise owned files.
    writeFileSync(generated('GameApp.java'), 'valuable current edit');
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    for (const name of retiredNames) assert.equal(existsSync(generated(name)), true);
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    writeFileSync(generated('GameApp.java'), 'original GameApp.java');
    prepareStarter(fixture);
    for (const name of retiredNames) assert.equal(existsSync(generated(name)), false);
    assert.equal(readFileSync(generated('App.java'), 'utf8'), 'next update');
    const updated = JSON.parse(readFileSync(statePath, 'utf8'));
    for (const name of retiredNames) assert.equal(Object.hasOwn(updated, name), false);
    assert.deepEqual(Object.keys(updated).sort(), [...coreSources, 'LICENSE'].sort());
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('starter preparation preserves unrecorded retired files and retired symlinks', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-source-unrecorded-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) writeFileSync(path.join(fixture, 'framework/src/main/java/zero', name), `original ${name}`);
    const generated = path.join(fixture, 'student-template/src/main/java/zero');
    mkdirSync(generated, {recursive:true});
    const unchanged = () => {
      for (const name of coreSources) assert.equal(existsSync(path.join(generated, name)), false);
      assert.equal(existsSync(path.join(fixture, 'student-template/LICENSE')), false);
      assert.equal(existsSync(path.join(fixture, '.verification/starter-source.json')), false);
    };
    for (const name of ['SketchApp.java', 'SimpleApp.java']) {
      const retired = path.join(generated, name);
      writeFileSync(retired, 'valuable unrecorded source');
      assert.throws(() => prepareStarter(fixture), /Preserved edited retired starter source/);
      assert.equal(readFileSync(retired, 'utf8'), 'valuable unrecorded source');
      unchanged();
      rmSync(retired);
      for (const target of ['../../../../../LICENSE', 'missing-source.java']) {
        symlinkSync(target, retired);
        assert.throws(() => prepareStarter(fixture), /Preserved edited retired starter source/);
        assert.equal(lstatSync(retired).isSymbolicLink(), true);
        assert.equal(readlinkSync(retired), target);
        unchanged();
        rmSync(retired);
      }
    }
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('assembled ZIP is a standalone editable Java project with canonical source and no contributor tools', () => {
  releaseDefinition();
  const archive = zipSync(starterMembers(root)), entries = unzipSync(archive);
  for (const name of coreSources) assert.deepEqual(entries[`zero-starter/src/main/java/zero/${name}`],
    new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero', name))));
  assert.equal(Object.keys(entries).some(name => /(?:^|\/)(?:SketchApp|SimpleApp)\.java$/.test(name)), false);
  assert.deepEqual(entries['zero-starter/LICENSE'], new Uint8Array(readFileSync(path.join(root, 'LICENSE'))));
  const lessonFiles = readdirSync(path.join(root, 'student-template/lessons')).filter(name => /^\d{2}-.*\.md$/.test(name)).sort();
  assert.deepEqual(lessonFiles.map(name => name.slice(0, 2)), Array.from({length:13}, (_, id) => String(id).padStart(2, '0')));
  for (const name of lessonFiles) assert.deepEqual(entries[`zero-starter/lessons/${name}`],
    new Uint8Array(readFileSync(path.join(root, 'student-template/lessons', name))));
  for (const folder of ['click-counter', 'reset-counter', 'object-counter', 'movement', 'coin-game', 'media-demo', 'scrolling-game', 'platform-game', 'level-game', 'full-game']) {
    for (const name of readdirSync(path.join(root, 'student-template/examples', folder)).filter(name => name.endsWith('.java') || name === 'README.md')) {
      assert.deepEqual(entries[`zero-starter/examples/${folder}/${name}`],
        new Uint8Array(readFileSync(path.join(root, 'student-template/examples', folder, name))));
    }
  }
  for (const name of ['player.png', 'chime.wav']) assert.deepEqual(
    entries[`zero-starter/examples/media-demo/resources/media-demo/${name}`],
    new Uint8Array(readFileSync(path.join(root, 'student-template/examples/media-demo/resources/media-demo', name))));
  assert.ok(!Object.keys(entries).some(name => /SmokeLauncher|node_modules|package\.json|\/target\//.test(name)));
  const project = extractProject(archive, 'zero-starter', tmpdir());
  try {
    assert.deepEqual(readFileSync(path.join(project, 'LICENSE')), readFileSync(path.join(root, 'LICENSE')));
    const main = path.join(project, 'src/main/java/Main.java');
    writeFileSync(main, readFileSync(main, 'utf8').replace('public class Main', '/* independently edited */\npublic class Main'));
    // Compiles only the extracted project, without any repository framework path.
    maven(project, ['-q', 'clean', 'compile']);
    assert.ok(existsSync(path.join(project, 'target/classes/Main.class')));
    assert.ok(existsSync(path.join(project, 'target/classes/zero/GameApp.class')));
    for (const retired of ['SketchApp', 'SimpleApp']) assert.equal(existsSync(path.join(project, `target/classes/zero/${retired}.class`)), false);
  } finally {rmSync(project, {recursive:true, force:true});}
});
