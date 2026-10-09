import assert from 'node:assert/strict';
import {readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {root, releaseDefinition} from './release.mjs';
import {starterMembers} from './kit.mjs';
import {coreSources} from './prepare-starter.mjs';
import {extractProject, maven} from './verification-project.mjs';

const release = releaseDefinition(), receipt = JSON.parse(readFileSync(path.join(root, 'dist/release.json'), 'utf8'));
assert.equal(receipt.kitVersion, release.kitVersion);
assert.equal(receipt.coreVersion, release.coreVersion);
assert.deepEqual(receipt.publication, release.publication);
for (const [key, asset] of Object.entries(receipt.assets)) {
  assert.equal(asset.filename, release.assets[key].filename);
  const bytes = readFileSync(path.join(root, 'dist', asset.filename));
  assert.equal(bytes.length, asset.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
}
const kitPath = path.join(root, 'dist', release.assets.kit.filename);
const kitBytes = readFileSync(kitPath), kit = unzipSync(kitBytes);
for (const [name, [bytes]] of Object.entries(starterMembers(root, 'zero-kit/starter'))) assert.deepEqual(kit[name], bytes, name);
assert.ok(kit['zero-kit/START-HERE.md']);
assert.deepEqual(kit[`zero-kit/${release.assets.extension.filename}`], new Uint8Array(readFileSync(path.join(root, 'dist', release.assets.extension.filename))));
assert.ok(!Object.keys(kit).some(name => /\/website\/|SmokeLauncher|\.zip$|\/scripts\/|\/target\//.test(name)));
for (const name of coreSources) assert.deepEqual(kit[`zero-kit/starter/src/main/java/zero/${name}`], new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero', name))));
const vsix = unzipSync(readFileSync(path.join(root, 'dist', release.assets.extension.filename)));
assert.deepEqual(vsix['extension/media/component-example/zero/SimpleApp.java'], new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero/SimpleApp.java'))));
const permissions = spawnSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); i=z.getinfo("zero-kit/starter/mvnw"); assert (i.external_attr>>16)&0o111; assert all(not n.endswith(".zip") for n in z.namelist()); print("ZIP wrapper executable and flat layout verified")', kitPath], {encoding:'utf8'});
assert.equal(permissions.status, 0, permissions.stderr);
const project = extractProject(kitBytes, 'zero-kit/starter', tmpdir());
try {maven(project, ['-q', 'clean', 'compile']);} finally {rmSync(project, {recursive:true, force:true});}
console.log('Measured release assets, flat ZIP bytes, canonical source parity, trusted VSIX source, executable wrapper and extracted Maven build passed.');
