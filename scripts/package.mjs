import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(root, 'extension/package.json')));
// Canonical trusted example tooling is generated into the VSIX, never copied
// from a student's editable Maven configuration when trying a component.
const exampleAssets = path.join(root,'extension/media/component-example');
mkdirSync(path.join(exampleAssets,'zero'),{recursive:true});
copyFileSync(path.join(root,'student-template/src/main/java/zero/SimpleApp.java'),path.join(exampleAssets,'zero/SimpleApp.java'));
for (const name of ['mvnw','mvnw.cmd']) copyFileSync(path.join(root,'student-template',name),path.join(exampleAssets,name));
mkdirSync(path.join(exampleAssets,'.mvn/wrapper'),{recursive:true});
for (const name of readdirSync(path.join(root,'student-template/.mvn/wrapper'))) copyFileSync(path.join(root,'student-template/.mvn/wrapper',name),path.join(exampleAssets,'.mvn/wrapper',name));
const vsix = `zero-${manifest.version}.vsix`;
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/@vscode/vsce/vsce'), 'package', '--no-dependencies',
  '--allow-missing-repository', '--out', path.join(dist, vsix)
], { cwd: path.join(root, 'extension'), stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const members = {};
function collect(directory, prefix) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['target', '.git', '.DS_Store'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    const key = prefix + '/' + entry.name;
    if (entry.isDirectory()) collect(filename, key);
    else members[key] = [new Uint8Array(readFileSync(filename)), {
      os: 3,
      attrs: ((entry.name === 'mvnw' ? 0o100755 : 0o100644) << 16) >>> 0
    }];
  }
}
collect(path.join(root, 'student-template'), 'zero-starter');
const starter = zipSync(members, { level: 6 });
const extracted = unzipSync(starter);
for (const [key, [bytes]] of Object.entries(members)) assert.deepEqual(extracted[key], bytes);
assert.ok(extracted['zero-starter/.vscode/tasks.json']);
assert.ok(extracted['zero-starter/.mvn/wrapper/maven-wrapper.properties']);
assert.ok(extracted['zero-starter/src/main/java/zero/SketchApp.java']);
assert.ok(extracted['zero-starter/EXERCISES.md']);
assert.deepEqual(extracted['zero-starter/src/main/java/ScoreDisplay.java'],
  extracted['zero-starter/examples/shared/ScoreDisplay.java'], 'Shared component copies must agree');
assert.ok(!Object.keys(extracted).some(key => /\/(?:target|\.git)\//.test(key)));
writeFileSync(path.join(dist, 'zero-starter.zip'), starter);
copyFileSync(path.join(root, 'profile/Zero.code-profile'), path.join(dist, 'Zero.code-profile'));
copyFileSync(path.join(root, 'profile/optional-keybindings.json'), path.join(dist, 'optional-keybindings.json'));
const guides = ['GETTING-STARTED.md', 'VERIFICATION.md', 'CLASSROOM-PILOT.md'];
for (const name of guides) copyFileSync(path.join(root, 'docs', name), path.join(dist, name));
const kit = {};
for (const name of [vsix, 'zero-starter.zip', 'Zero.code-profile', 'optional-keybindings.json', ...guides]) {
  kit['zero-bootstrap/' + name] = new Uint8Array(readFileSync(path.join(dist, name)));
}
const combined = zipSync(kit, { level: 6 });
const combinedContents = unzipSync(combined);
for (const [key, bytes] of Object.entries(kit)) assert.deepEqual(combinedContents[key], bytes);
writeFileSync(path.join(dist, 'zero-bootstrap.zip'), combined);
console.log(`Packaged ${vsix}, zero-starter.zip, Zero.code-profile and zero-bootstrap.zip locally. No publishing or push.`);
