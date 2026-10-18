import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifiedLocalInstaller, verifyInstallerSource} from '../lib/local-installer.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function git(root, args) {
  const result = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {cwd:root, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zero-mac-source-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  git(root, ['init', '-q']);
  await writeFile(join(root, '.gitignore'), 'dist/\n');
  const inputs = {
    'release/sharing.json': '{"schema":1,"catalogUrl":"https://zero.codepet.ca/api/sharing/catalog","artifactOrigin":"https://fixture.public.blob.vercel-storage.com","policyRevision":"' + 'a'.repeat(40) + '"}\n',
    'scripts/mac-artifact.mjs': '// artifact identity fixture\n',
    'scripts/mac-icon.mjs': '// icon generator fixture\n',
    'scripts/brand-icon.mjs': '// canonical geometry reader fixture\n',
    'design/brand/zero-purple.svg': '<svg>canonical mark</svg>\n',
    'design/brand/zero-purple-on-white.svg': '<svg>canonical tile</svg>\n',
    'scripts/mac-volume.mjs': '// volume verifier fixture\n',
    'extension/media/zero.svg': '<svg>original brand</svg>\n',
    'design/tokens.json': '{"accent":"#683bef"}\n',
    'scripts/release-review.mjs': 'export const packageInput = "original";\n',
    'sharing/harness/ZeroLibraryHarness.java': '// Original packaged harness fixture\n',
  };
  for (const [name, bytes] of Object.entries(inputs)) {
    await mkdir(dirname(join(root, name)), {recursive:true});
    await writeFile(join(root, name), bytes);
  }
  git(root, ['add', '.']); git(root, ['commit', '-qm', 'installer build inputs']);
  const sourceRevision = git(root, ['rev-parse', 'HEAD']);
  const kit = {schema:1, kitVersion:'0.5.8', coreVersion:'0.1.1',
    publication:{status:'local', repository:'codepetca/zero', tag:'v0.5.8'},
    assets:{kit:{filename:'zero-bootstrap.zip'}}};
  const bytes = Buffer.from('inert signed DMG fixture'), kitBytes = Buffer.from('inert embedded kit fixture');
  const manifest = {schema:1, kitVersion:kit.kitVersion,
    publication:{status:'local', repository:'codepetca/zero', tag:'setup-v0.5.8'}, sourceRevision,
    kit:{filename:'zero-bootstrap.zip', size:kitBytes.length, sha256:hash(kitBytes)},
    asset:{filename:'Zero-Setup-0.5.8-macos.dmg', platform:'macos', architectures:['arm64','x86_64'], minimumOS:'12.0', size:bytes.length, sha256:hash(bytes)},
    signing:{identitySha1:'A'.repeat(40), teamIdentifier:'A'.repeat(10)},
    notarizationSubmissionId:'00000000-0000-0000-0000-000000000000'};
  const receipt = {schema:1, kitVersion:kit.kitVersion, sourceRevision, sourceDirty:false, kit:manifest.kit,
    artifacts:[{...manifest.asset, developerIdSigned:true, notarized:true, signing:manifest.signing,
      notarization:{submissionId:manifest.notarizationSubmissionId, status:'Accepted', stapled:true, gatekeeper:{dmg:'accepted', app:'accepted'}}}]};
  await mkdir(join(root, 'dist/installers'), {recursive:true});
  await writeFile(join(root, 'dist/installers', manifest.asset.filename), bytes);
  await writeFile(join(root, 'dist', manifest.kit.filename), kitBytes);
  await writeFile(join(root, 'dist/release.json'), JSON.stringify({...kit, assets:{kit:manifest.kit}}));
  await writeFile(join(root, 'dist/installers/build-macos-signed.json'), JSON.stringify(receipt));
  return {root, inputs, manifest, kit, bytes, sourceRevision};
}

test('signed Mac preparation and serving reject changed package and app brand inputs', async t => {
  for (const name of ['release/sharing.json', 'scripts/release-review.mjs', 'sharing/harness/ZeroLibraryHarness.java', 'scripts/mac-artifact.mjs', 'scripts/mac-icon.mjs', 'scripts/brand-icon.mjs', 'design/brand/zero-purple.svg', 'design/brand/zero-purple-on-white.svg', 'scripts/mac-volume.mjs', 'extension/media/zero.svg', 'design/tokens.json']) {
    await t.test(name, async t => {
      const f = await fixture(t);
      const read = () => verifiedLocalInstaller(f.root, f.manifest, f.kit);
      assert.equal(verifyInstallerSource(f.root, f.sourceRevision, {clean:true}).sourceEquivalent, true);
      assert.deepEqual((await read()).bytes, f.bytes);

      // Committed website delivery remains equivalent to the original native build.
      await writeFile(join(f.root, 'notes.md'), 'Website delivery notes\n');
      git(f.root, ['add', 'notes.md']); git(f.root, ['commit', '-qm', 'delivery notes']);
      assert.equal(verifyInstallerSource(f.root, f.sourceRevision, {clean:true}).sourceEquivalent, true);
      assert.deepEqual((await read()).bytes, f.bytes);

      await writeFile(join(f.root, name), f.inputs[name] + '\nChanged package input\n');
      await assert.rejects(read(), /Native\/runtime\/packaged source differs/);
      // Clean source alone is insufficient: a later input commit invalidates the old payload.
      git(f.root, ['add', name]); git(f.root, ['commit', '-qm', 'changed package input']);
      assert.throws(() => verifyInstallerSource(f.root, f.sourceRevision, {clean:true}), /Native\/runtime\/packaged source differs/);
      await assert.rejects(read(), /Native\/runtime\/packaged source differs/);

      await writeFile(join(f.root, name), f.inputs[name]);
      git(f.root, ['add', name]); git(f.root, ['commit', '-qm', 'restore original input']);
      assert.equal(verifyInstallerSource(f.root, f.sourceRevision, {clean:true}).sourceEquivalent, true);
      assert.deepEqual((await read()).bytes, f.bytes);
    });
  }
});
