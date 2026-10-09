import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync, unzipSync} from 'fflate';
import {prepareStarter, coreSources} from './prepare-starter.mjs';
import {starterMembers} from './kit.mjs';
import {root, releaseDefinition} from './release.mjs';
import {extractProject, maven} from './verification-project.mjs';

test('starter preparation refreshes generated source and preserves edited copies as a pair', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-source-drift-'));
  try {
    mkdirSync(path.join(fixture, 'framework/src/main/java/zero'), {recursive:true});
    for (const name of coreSources) writeFileSync(path.join(fixture, 'framework/src/main/java/zero', name), `original ${name}`);
    prepareStarter(fixture);
    const generated = name => path.join(fixture, 'student-template/src/main/java/zero', name);
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/SimpleApp.java'), 'canonical update');
    prepareStarter(fixture);
    assert.equal(readFileSync(generated('SimpleApp.java'), 'utf8'), 'canonical update');
    writeFileSync(generated('SketchApp.java'), 'valuable student edit');
    writeFileSync(path.join(fixture, 'framework/src/main/java/zero/SimpleApp.java'), 'next update');
    assert.throws(() => prepareStarter(fixture), /Preserved edited starter source/);
    assert.equal(readFileSync(generated('SketchApp.java'), 'utf8'), 'valuable student edit');
    assert.equal(readFileSync(generated('SimpleApp.java'), 'utf8'), 'canonical update');
  } finally {rmSync(fixture, {recursive:true, force:true});}
});

test('assembled ZIP is a standalone editable Java project with canonical source and no contributor tools', () => {
  releaseDefinition();
  const archive = zipSync(starterMembers(root)), entries = unzipSync(archive);
  for (const name of coreSources) assert.deepEqual(entries[`zero-starter/src/main/java/zero/${name}`],
    new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero', name))));
  assert.ok(!Object.keys(entries).some(name => /SmokeLauncher|node_modules|package\.json|\/target\//.test(name)));
  const project = extractProject(archive, 'zero-starter', tmpdir());
  try {
    const main = path.join(project, 'src/main/java/Main.java');
    writeFileSync(main, readFileSync(main, 'utf8').replace('public class Main', '/* independently edited */\npublic class Main'));
    // Compiles only the extracted project, without any repository framework path.
    maven(project, ['-q', 'clean', 'compile']);
    assert.ok(existsSync(path.join(project, 'target/classes/Main.class')));
    assert.ok(existsSync(path.join(project, 'target/classes/zero/SketchApp.class')));
  } finally {rmSync(project, {recursive:true, force:true});}
});
