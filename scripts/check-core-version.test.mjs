import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkCoreVersion} from './check-core-version.mjs';

const source = 'framework/src/main/java/zero/App.java';
const pom = version => `<project><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>zero-core</artifactId><version>${version}</version></project>`;
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'zero-core-version-')));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', stdio:['ignore', 'pipe', 'pipe']}).trim();
  const write = (name, bytes) => {mkdirSync(path.dirname(path.join(root, name)), {recursive:true}); writeFileSync(path.join(root, name), bytes);};
  const commit = () => {git('add', '.'); git('-c', 'user.name=Zero Test', '-c', 'user.email=zero-test@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'fixture'); return git('rev-parse', 'HEAD');};
  git('init', '-q'); write(source, 'package zero;\npublic class App {}\n'); write('framework/pom.xml', pom('0.3.0'));
  const base = commit();
  return {root, write, git, commit, base, check:() => checkCoreVersion({root, base})};
}
test('unchanged sources and unrelated work need no core bump', t => {
  const f = fixture(t); f.write('README.md', 'student documentation');
  assert.deepEqual(f.check().changedPaths, []);
  f.write(source, readFileSync(path.join(f.root, source), 'utf8').replaceAll('\n', '\r\n'));
  assert.equal(f.check().beforeSourceSha256, f.check().afterSourceSha256);
});
test('changed source requires a newer core version', t => {
  const f = fixture(t); f.write(source, 'package zero; public class App { public void update() {} }\n');
  assert.throws(f.check, /source or inventory changed.*0\.3\.0 → 0\.3\.0/);
  f.write('framework/pom.xml', pom('0.3.1'));
  assert.deepEqual(f.check().changedPaths, [source]);
  f.write('framework/pom.xml', pom('0.2.9'));
  assert.throws(f.check, /Increase the zero-core version/);
});
test('added and removed source paths count even when old sources stay unchanged', t => {
  const f = fixture(t); f.write('framework/src/main/java/zero/Actor.java', 'package zero; class Actor {}\n');
  assert.throws(f.check, /Actor\.java/);
  f.write('framework/pom.xml', pom('0.3.1')); f.commit();
  const base = f.git('rev-parse', 'HEAD'); unlinkSync(path.join(f.root, source));
  assert.throws(() => checkCoreVersion({root:f.root, base}), /App\.java/);
});
test('renamed source paths require a bump despite identical file bytes', t => {
  const f = fixture(t); renameSync(path.join(f.root, source), path.join(f.root, 'framework/src/main/java/zero/Renamed.java'));
  assert.throws(f.check, /source or inventory changed/);
});
test('missing or noncommit explicit bases fail without guessing', t => {
  const f = fixture(t);
  for (const base of [undefined, '', '--help', 'missing-base', f.git('hash-object', source)]) assert.throws(() => checkCoreVersion({root:f.root, base}), /explicit local base|unavailable locally/);
});
test('shallow checkout fails when caller-selected base is absent', t => {
  const f = fixture(t); f.write('README.md', 'second revision'); f.commit();
  const clone = path.join(f.root, 'shallow'); f.git('clone', '-q', '--depth', '1', 'file://' + f.root, clone);
  assert.throws(() => checkCoreVersion({root:clone, base:f.base}), /shallow checkouts must include that base/);
});
test('POM versions must be exact and cannot go backwards', t => {
  const f = fixture(t);
  for (const version of ['0.3.0-SNAPSHOT', '${core.version}', '00.3.0']) {f.write('framework/pom.xml', pom(version)); assert.throws(f.check, /exact three-part version/);}
  f.write('framework/pom.xml', pom('0.2.9')); assert.throws(f.check, /version decreased/);
  f.write('framework/pom.xml', pom('0.4.0')); assert.deepEqual(f.check().changedPaths, []);
});
test('CLI requires an explicit base', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-core-version.mjs', import.meta.url))], {encoding:'utf8'});
  assert.equal(result.status, 1); assert.match(result.stderr, /Usage:.*--base/);
});
