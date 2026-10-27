import assert from 'node:assert/strict';
import {readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {root, releaseDefinition} from './release.mjs';
import {starterMembers, setupMembers} from './kit.mjs';
import {coreSources} from './prepare-starter.mjs';
import {extractProject, maven} from './verification-project.mjs';
import {sharingConfigurationBytes} from './release-review.mjs';
import {checkPackagedTutorialTemplates} from './check-tutorial-templates.mjs';

const release = releaseDefinition(), receipt = JSON.parse(readFileSync(path.join(root, 'dist/release.json'), 'utf8'));
const license = new Uint8Array(readFileSync(path.join(root, 'LICENSE')));
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
for (const [name, [bytes]] of Object.entries(setupMembers(root, release))) assert.deepEqual(kit[name], bytes, name);
assert.deepEqual(kit['zero-kit/LICENSE'], license);
assert.deepEqual(kit['zero-kit/starter/LICENSE'], license);
assert.deepEqual(kit[`zero-kit/${release.assets.extension.filename}`], new Uint8Array(readFileSync(path.join(root, 'dist', release.assets.extension.filename))));
assert.ok(!Object.keys(kit).some(name => /\/website\/|SmokeLauncher|\.zip$|\/scripts\/|\/target\//.test(name)));
for (const name of coreSources) assert.deepEqual(kit[`zero-kit/starter/src/main/java/zero/${name}`], new Uint8Array(readFileSync(path.join(root, 'framework/src/main/java/zero', name))));
const vsix = unzipSync(readFileSync(path.join(root, 'dist', release.assets.extension.filename)));
// Check the actual installed payload, not just the source used by unit fixtures.
checkPackagedTutorialTemplates(JSON.parse(new TextDecoder().decode(vsix['extension/media/lesson-projects.json'])));
function verifyExtensionSource(directory, relative='') {
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    assert.ok(!entry.isSymbolicLink(),'Extension source must not contain symlinks');
    const name=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isDirectory())verifyExtensionSource(path.join(directory,entry.name),name);
    else assert.deepEqual(vsix[`extension/src/${name}`],new Uint8Array(readFileSync(path.join(directory,entry.name))),`Packaged extension source: ${name}`);
  }
}
verifyExtensionSource(path.join(root,'extension/src'));
// vsce normalizes the extension's LICENSE filename to LICENSE.txt in the VSIX.
assert.deepEqual(vsix['extension/LICENSE.txt'], license);
assert.equal(JSON.parse(new TextDecoder().decode(vsix['extension/package.json'])).license, 'MIT');
assert.deepEqual(vsix['extension/media/sharing-harness/ZeroLibraryHarness.java'],new Uint8Array(readFileSync(path.join(root,'sharing/harness/ZeroLibraryHarness.java'))));
assert.deepEqual(vsix['extension/media/sharing-config.json'],sharingConfigurationBytes(root), 'VSIX sharing configuration drift.');
const starter = unzipSync(readFileSync(path.join(root, 'dist', release.assets.starter.filename)));
const expectedStarter = starterMembers(root);
assert.deepEqual(Object.keys(starter).sort(), Object.keys(expectedStarter).sort());
for (const [name, [bytes]] of Object.entries(expectedStarter)) assert.deepEqual(starter[name], bytes, name);
assert.deepEqual(starter['zero-starter/LICENSE'], license);
const permissions = spawnSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); names=["zero-kit/starter/mvnw","zero-kit/setup/Setup.command","zero-kit/setup/setup.sh"]; assert all((z.getinfo(n).external_attr>>16)&0o111 for n in names); assert all(not n.endswith(".zip") for n in z.namelist()); print("ZIP wrapper/setup executables and flat layout verified")', kitPath], {encoding:'utf8'});
assert.equal(permissions.status, 0, permissions.stderr);
const project = extractProject(kitBytes, 'zero-kit/starter', tmpdir());
try {maven(project, ['-q', 'clean', 'compile']);} finally {rmSync(project, {recursive:true, force:true});}
console.log('Measured release assets, exact MIT licenses in kit/starter/VSIX, SPDX manifest, flat ZIP bytes, canonical source parity, executable wrapper and extracted Maven build passed.');
