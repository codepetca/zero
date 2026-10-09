import {mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {zipSync, unzipSync} from 'fflate';
import assert from 'node:assert/strict';
import {coreSources, prepareStarter} from './prepare-starter.mjs';
import {starterMembers} from './kit.mjs';
import {root, releaseDefinition, writeReleaseMetadata, verifiedExistingAssets} from './release.mjs';

prepareStarter();
const release = releaseDefinition(), dist = path.join(root, 'dist');
mkdirSync(dist, {recursive:true});
const retained = verifiedExistingAssets().filter(key => key === 'components');
const exampleAssets = path.join(root, 'extension/media/component-example');
mkdirSync(path.join(exampleAssets, 'zero'), {recursive:true});
// Trusted Try source comes directly from the canonical framework.
copyFileSync(path.join(root, 'framework/src/main/java/zero/SimpleApp.java'), path.join(exampleAssets, 'zero/SimpleApp.java'));
for (const name of ['mvnw', 'mvnw.cmd']) copyFileSync(path.join(root, 'student-template', name), path.join(exampleAssets, name));
mkdirSync(path.join(exampleAssets, '.mvn/wrapper'), {recursive:true});
for (const name of readdirSync(path.join(root, 'student-template/.mvn/wrapper'))) copyFileSync(path.join(root, 'student-template/.mvn/wrapper', name), path.join(exampleAssets, '.mvn/wrapper', name));
const vsix = release.assets.extension.filename;
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@vscode/vsce/vsce'),
  'package', '--no-dependencies', '--allow-missing-repository', '--out', path.join(dist, vsix)
], {cwd:path.join(root, 'extension'), stdio:'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);

function archive(members, filename) {
  const bytes = zipSync(members, {level:6}), extracted = unzipSync(bytes);
  for (const [key, value] of Object.entries(members)) assert.deepEqual(extracted[key], Array.isArray(value) ? value[0] : value);
  assert.ok(!Object.keys(extracted).some(key => /\/(?:target|\.git|node_modules|__pycache__)\//.test(key)));
  writeFileSync(path.join(dist, filename), bytes);
  return extracted;
}
const starter = archive(starterMembers(root), release.assets.starter.filename);
assert.ok(starter['zero-starter/.vscode/tasks.json']);
assert.ok(starter['zero-starter/.mvn/wrapper/maven-wrapper.properties']);
assert.ok(starter['zero-starter/EXERCISES.md']);
assert.deepEqual(starter['zero-starter/src/main/java/ScoreDisplay.java'], starter['zero-starter/examples/shared/ScoreDisplay.java']);
for (const name of coreSources) assert.deepEqual(starter[`zero-starter/src/main/java/zero/${name}`], new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero', name))));
assert.ok(!starter['zero-starter/src/main/java/zero/SmokeLauncher.java']);
const kit = starterMembers(root, 'zero-kit/starter');
for (const [source, destination] of [
  ['release/START-HERE.md', 'START-HERE.md'], [`dist/${vsix}`, vsix],
  ['profile/Zero.code-profile', 'optional/Zero.code-profile'],
  ['profile/optional-keybindings.json', 'optional/optional-keybindings.json']
]) kit[`zero-kit/${destination}`] = [new Uint8Array(readFileSync(path.join(root, source))), {os:3, attrs:(0o100644 << 16) >>> 0}];
const combined = archive(kit, release.assets.kit.filename);
assert.ok(combined['zero-kit/START-HERE.md']);
assert.ok(combined['zero-kit/starter/src/main/java/Main.java']);
assert.ok(combined[`zero-kit/${vsix}`]);
assert.ok(!Object.keys(combined).some(key => key.endsWith('.zip')));
for (const name of ['Zero.code-profile', 'optional-keybindings.json']) copyFileSync(path.join(root, 'profile', name), path.join(dist, name));
writeReleaseMetadata(['kit', 'starter', 'extension', ...retained]);
console.log(`Packaged flat zero-kit/ and standalone starter, ${vsix}, and measured dist/release.json locally.`);
