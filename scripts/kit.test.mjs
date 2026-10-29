import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, symlinkSync, lstatSync, readlinkSync, renameSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync, unzipSync} from 'fflate';
import {copyProjectBuilderFixture} from './project-builder-fixture.mjs';
import {projectBuilderFilesSync} from './prepare-project-builder.mjs';
import {createHash} from 'node:crypto';
import {prepareStarter, coreSources} from './prepare-starter.mjs';
import {starterMembers, setupMembers, setupFiles, setupRequirements} from './kit.mjs';
import {root, releaseDefinition} from './release.mjs';
import {extractProject, maven} from './verification-project.mjs';


function builderFixture(directory) {
  const fixture = realpathSync(mkdtempSync(directory));
  copyProjectBuilderFixture(fixture,root);
  return fixture;
}

const canonical = name => readFileSync(path.join(root,'framework/src/main/java/zero',name),'utf8');
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
  const fixture = builderFixture(path.join(tmpdir(), 'zero-source-drift-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) {
      const source = path.join(fixture, 'framework/src/main/java/zero', name);
      mkdirSync(path.dirname(source), {recursive:true});
      writeFileSync(source, canonical(name));
    }
    prepareStarter(fixture);
    assert.deepEqual(readFileSync(path.join(fixture, 'student-template/LICENSE')), readFileSync(path.join(root, 'LICENSE')));
    const generated = name => path.join(fixture, 'student-template/src/main/java/zero', name);
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), canonical('App.java').replace(/\n/g,'\r\n'));
    prepareStarter(fixture);
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java').replace(/\n/g,'\r\n'));
    writeFileSync(generated('GameApp.java'), 'valuable student edit');
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), canonical('App.java').replace(/\n/g,'\r\n'));
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    assert.equal(readFileSync(generated('GameApp.java'), 'utf8'), 'valuable student edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java').replace(/\n/g,'\r\n'));
    writeFileSync(generated('GameApp.java'), canonical('GameApp.java'));
    writeFileSync(path.join(fixture, 'student-template/LICENSE'), 'retained license edit');
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    assert.equal(readFileSync(path.join(fixture, 'student-template/LICENSE'), 'utf8'), 'retained license edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java').replace(/\n/g,'\r\n'));
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('starter preparation retires unchanged managed sources and preserves edited retired copies', () => {
  const fixture = builderFixture(path.join(tmpdir(), 'zero-source-retirement-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) {
      const source = path.join(fixture, 'framework/src/main/java/zero', name);
      mkdirSync(path.dirname(source), {recursive:true});
      writeFileSync(source, canonical(name));
    }
    prepareStarter(fixture);
    const statePath = path.join(fixture, '.verification/starter-source.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const retiredNames = ['SketchApp.java', 'SimpleApp.java', 'RetiredApp.java', 'ui/RetiredView.java'];
    for (const name of retiredNames) state[name] = state['App.java'];
    writeFileSync(statePath, JSON.stringify(state));
    const generated = name => path.join(fixture, 'student-template/src/main/java/zero', name);
    writeFileSync(generated('RetiredApp.java'), canonical('App.java'));
    writeFileSync(generated('ui/RetiredView.java'), canonical('App.java'));
    writeFileSync(generated('SimpleApp.java'), 'valuable second retired edit');
    writeFileSync(generated('SketchApp.java'), 'valuable student edit');
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), canonical('App.java').replace(/\n/g,'\r\n'));
    assert.throws(() => prepareStarter(fixture), /Preserved edited retired starter source/);
    assert.equal(readFileSync(generated('SketchApp.java'), 'utf8'), 'valuable student edit');
    assert.equal(readFileSync(generated('RetiredApp.java'), 'utf8'), canonical('App.java'));
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java'));
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    writeFileSync(generated('SketchApp.java'), canonical('App.java'));
    assert.throws(() => prepareStarter(fixture), /Preserved edited retired starter source/);
    assert.equal(readFileSync(generated('SimpleApp.java'), 'utf8'), 'valuable second retired edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java'));
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    writeFileSync(generated('SimpleApp.java'), canonical('App.java'));
    // A current-source failure must also prevent retiring otherwise owned files.
    writeFileSync(generated('GameApp.java'), 'valuable current edit');
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    for (const name of retiredNames) assert.equal(existsSync(generated(name)), true);
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    writeFileSync(generated('GameApp.java'), canonical('GameApp.java'));
    prepareStarter(fixture);
    for (const name of retiredNames) assert.equal(existsSync(generated(name)), false);
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java').replace(/\n/g,'\r\n'));
    const updated = JSON.parse(readFileSync(statePath, 'utf8'));
    for (const name of retiredNames) assert.equal(Object.hasOwn(updated, name), false);
    assert.deepEqual(Object.keys(updated).sort(), [...coreSources, 'LICENSE', 'zero-core.json',
      ...projectBuilderFilesSync({sourceRoot:fixture}).map(file=>'.zero-build/'+file.path)].sort());
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('starter preparation preserves unrecorded retired files and retired symlinks', () => {
  const fixture = builderFixture(path.join(tmpdir(), 'zero-source-unrecorded-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) {
      const source = path.join(fixture, 'framework/src/main/java/zero', name);
      mkdirSync(path.dirname(source), {recursive:true});
      writeFileSync(source, canonical(name));
    }
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

test('starter preparation rejects linked current files and output directories before retiring owned files', () => {
  for (const mode of ['current-link', 'dangling-current-link', 'directory-link']) {
    const fixture = builderFixture(path.join(tmpdir(), 'zero-source-linked-output-'));
    try {
      mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
      writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
      for (const name of coreSources) {
      const source = path.join(fixture, 'framework/src/main/java/zero', name);
      mkdirSync(path.dirname(source), {recursive:true});
      writeFileSync(source, canonical(name));
    }
      prepareStarter(fixture);
      const statePath = path.join(fixture, '.verification/starter-source.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      state['SimpleApp.java'] = state['App.java'];
      const stateBytes = JSON.stringify(state);
      writeFileSync(statePath, stateBytes);
      const generated = path.join(fixture, 'student-template/src/main/java/zero');
      writeFileSync(path.join(generated, 'SimpleApp.java'), canonical('App.java'));
      writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), canonical('App.java').replace(/\n/g,'\r\n'));
      const backup = path.join(fixture, 'valuable-backup');
      let linked, target, preservedDirectory = generated;
      if (mode === 'directory-link') {
        renameSync(generated, backup);
        linked = generated; target = backup; preservedDirectory = backup;
      } else {
        linked = path.join(generated, 'App.java');
        rmSync(linked);
        target = mode === 'current-link' ? backup : path.join(fixture, 'missing', 'App.java');
        if (mode === 'current-link') writeFileSync(backup, 'valuable external source');
      }
      symlinkSync(target, linked);
      assert.throws(() => prepareStarter(fixture), /Expected ordinary generated (?:source|directory)/, mode);
      assert.equal(lstatSync(linked).isSymbolicLink(), true);
      assert.equal(readlinkSync(linked), target);
      assert.equal(readFileSync(path.join(preservedDirectory, 'SimpleApp.java'), 'utf8'), canonical('App.java'));
      assert.equal(readFileSync(path.join(preservedDirectory, 'GameApp.java'), 'utf8'), canonical('GameApp.java'));
      assert.equal(readFileSync(statePath, 'utf8'), stateBytes);
      if (mode === 'current-link') assert.equal(readFileSync(backup, 'utf8'), 'valuable external source');
      if (mode === 'dangling-current-link') assert.equal(existsSync(path.dirname(target)), false);
    } finally {rmSync(fixture, {recursive:true, force:true});}
  }
});

test('starter preparation rejects linked ownership state paths before changing any output', () => {
  for (const mode of ['state-link', 'dangling-state-link', 'state-directory-link']) {
    const fixture = builderFixture(path.join(tmpdir(), 'zero-source-linked-state-'));
    try {
      mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
      writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
      for (const name of coreSources) {
      const source = path.join(fixture, 'framework/src/main/java/zero', name);
      mkdirSync(path.dirname(source), {recursive:true});
      writeFileSync(source, canonical(name));
    }
      prepareStarter(fixture);
      const statePath = path.join(fixture, '.verification/starter-source.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      state['SimpleApp.java'] = state['App.java'];
      const stateBytes = JSON.stringify(state);
      writeFileSync(statePath, stateBytes);
      const generated = path.join(fixture, 'student-template/src/main/java/zero');
      writeFileSync(path.join(generated, 'SimpleApp.java'), canonical('App.java'));
      writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), canonical('App.java').replace(/\n/g,'\r\n'));
      const backup = path.join(fixture, 'state-backup');
      let linked = statePath, target = backup, preservedState = backup;
      if (mode === 'state-directory-link') {
        linked = path.dirname(statePath);
        renameSync(linked, backup);
        preservedState = path.join(backup, 'starter-source.json');
      } else {
        renameSync(statePath, backup);
        if (mode === 'dangling-state-link') target = path.join(fixture, 'missing-state.json');
      }
      symlinkSync(target, linked);
      assert.throws(() => prepareStarter(fixture), /Expected ordinary (?:starter ownership state|generated directory)/, mode);
      assert.equal(lstatSync(linked).isSymbolicLink(), true);
      assert.equal(readlinkSync(linked), target);
      assert.equal(readFileSync(preservedState, 'utf8'), stateBytes);
      assert.equal(readFileSync(path.join(generated, 'SimpleApp.java'), 'utf8'), canonical('App.java'));
      for (const name of coreSources) assert.equal(readFileSync(path.join(generated, name), 'utf8'), canonical(name));
      if (mode === 'dangling-state-link') assert.equal(existsSync(target), false);
    } finally {rmSync(fixture, {recursive:true, force:true});}
  }
});

test('assembled ZIP is a standalone editable Java project with canonical source and no contributor tools', () => {
  releaseDefinition();
  const archive = zipSync(starterMembers(root)), entries = unzipSync(archive);
  for (const name of coreSources) assert.deepEqual(entries[`zero-starter/src/main/java/zero/${name}`],
    new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero', name))));
  assert.equal(Object.keys(entries).some(name => /(?:^|\/)(?:SketchApp|SimpleApp)\.java$/.test(name)), false);
  assert.deepEqual(entries['zero-starter/LICENSE'], new Uint8Array(readFileSync(path.join(root, 'LICENSE'))));
  const lessonFiles = readdirSync(path.join(root, 'student-template/lessons')).filter(name => /^\d{2}-.*\.md$/.test(name)).sort();
  assert.deepEqual(lessonFiles.map(name => name.slice(0, 2)), Array.from({length:16}, (_, id) => String(id).padStart(2, '0')));
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
    assert.ok(existsSync(path.join(project, 'target/classes/zero/Color.class')));
    assert.ok(existsSync(path.join(project, 'target/classes/zero/Key.class')));
    for (const name of ['Element', 'Label', 'Button', 'Column', 'Row', 'TextField']) assert.ok(existsSync(path.join(project, `target/classes/zero/ui/${name}.class`)));
    for (const retired of ['SketchApp', 'SimpleApp']) assert.equal(existsSync(path.join(project, `target/classes/zero/${retired}.class`)), false);
  } finally {rmSync(project, {recursive:true, force:true});}
});


test('nested starter sources preserve edits, ownership and linked package directories atomically', () => {
  const fixture = builderFixture(path.join(tmpdir(), 'zero-nested-source-'));
  try {
    writeFileSync(path.join(fixture, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
    for (const name of coreSources) {
      const source = path.join(fixture, 'framework/src/main/java/zero', name);
      mkdirSync(path.dirname(source), {recursive:true});
      writeFileSync(source, canonical(name));
    }
    prepareStarter(fixture);
    const generated = name => path.join(fixture, 'student-template/src/main/java/zero', name);
    const statePath = path.join(fixture, '.verification/starter-source.json');
    const state = readFileSync(statePath, 'utf8');
    assert.ok(Object.hasOwn(JSON.parse(state), 'ui/Label.java'));
    writeFileSync(generated('ui/Label.java'), 'valuable nested edit');
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/App.java'), canonical('App.java').replace(/\n/g,'\r\n'));
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    assert.equal(readFileSync(generated('ui/Label.java'), 'utf8'), 'valuable nested edit');
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java'));
    assert.equal(readFileSync(statePath, 'utf8'), state);
    writeFileSync(generated('ui/Label.java'), canonical('ui/Label.java'));
    const backup = path.join(fixture, 'valuable-ui');
    renameSync(generated('ui'), backup);
    symlinkSync(backup, generated('ui'));
    assert.throws(() => prepareStarter(fixture), /Expected ordinary generated directory/);
    assert.equal(readFileSync(path.join(backup, 'Label.java'), 'utf8'), canonical('ui/Label.java'));
    assert.equal(readFileSync(generated('App.java'), 'utf8'), canonical('App.java'));
    assert.equal(readFileSync(statePath, 'utf8'), state);
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('edited generated core record blocks starter refresh before source or ownership writes',()=>{
 const fixture=builderFixture(path.join(tmpdir(),'zero-core-record-drift-'));
 try {
  for(const name of coreSources){const file=path.join(fixture,'framework/src/main/java/zero',name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,canonical(name));}
  writeFileSync(path.join(fixture,'LICENSE'),'license');prepareStarter(fixture);
  const manifest=path.join(fixture,'student-template/zero-core.json'),state=path.join(fixture,'.verification/starter-source.json');
  const before=readFileSync(state);writeFileSync(manifest,'valuable user edit');
  writeFileSync(path.join(fixture,'framework/src/main/java/zero/App.java'),canonical('App.java').replace(/\n/g,'\r\n'));
  assert.throws(()=>prepareStarter(fixture),/Preserved edited starter source/);
  assert.equal(readFileSync(manifest,'utf8'),'valuable user edit');assert.deepEqual(readFileSync(state),before);
  assert.equal(readFileSync(path.join(fixture,'student-template/src/main/java/zero/App.java'),'utf8'),canonical('App.java'));
 } finally {rmSync(fixture,{recursive:true,force:true});}
});

test('saved builder starter ownership preflights the complete closure before writes or retirement',()=>{
 const fixture=builderFixture(path.join(tmpdir(),'zero-builder-starter-'));
 try {
  for(const name of coreSources){const file=path.join(fixture,'framework/src/main/java/zero',name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,canonical(name));}
  writeFileSync(path.join(fixture,'LICENSE'),'license');prepareStarter(fixture);
  for(const file of projectBuilderFilesSync({sourceRoot:fixture})) assert.deepEqual(readFileSync(path.join(fixture,'student-template/.zero-build',file.path)),file.bytes);
  const statePath=path.join(fixture,'.verification/starter-source.json'),state=JSON.parse(readFileSync(statePath));
  const retired='.zero-build/retired.cjs',owned=Buffer.from('old owned builder');
  writeFileSync(path.join(fixture,'student-template',retired),owned);state[retired]=createHash('sha256').update(owned).digest('hex');
  writeFileSync(statePath,JSON.stringify(state));prepareStarter(fixture);
  assert.equal(existsSync(path.join(fixture,'student-template',retired)),false);
  const before=readFileSync(statePath),generated=path.join(fixture,'student-template/src/main/java/zero/App.java');
  writeFileSync(path.join(fixture,'framework/src/main/java/zero/App.java'),canonical('App.java').replace(/\n/g,'\r\n'));
  const unknown=path.join(fixture,'student-template/.zero-build/private-note');writeFileSync(unknown,'valuable unknown bytes');
  assert.throws(()=>prepareStarter(fixture),/Preserved unknown or edited retired starter builder/);
  assert.equal(readFileSync(unknown,'utf8'),'valuable unknown bytes');assert.equal(readFileSync(generated,'utf8'),canonical('App.java'));assert.deepEqual(readFileSync(statePath),before);
  rmSync(unknown);const launcher=path.join(fixture,'student-template/.zero-build/run.cjs');writeFileSync(launcher,'valuable edited launcher');
  assert.throws(()=>prepareStarter(fixture),/Preserved edited starter source/);
  assert.equal(readFileSync(launcher,'utf8'),'valuable edited launcher');assert.deepEqual(readFileSync(statePath),before);assert.equal(readFileSync(generated,'utf8'),canonical('App.java'));
 } finally {rmSync(fixture,{recursive:true,force:true});}
});
