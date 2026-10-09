import assert from 'node:assert/strict';
import {appendFileSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {root, releaseDefinition} from './release.mjs';

export const publicKeys = ['kit', 'starter', 'extension'];

export function reviewPlan(release, {manual = false, expectedVersion = '', repository} = {}) {
  assert.match(release.kitVersion, /^\d+\.\d+\.\d+$/, 'Use a new numeric kit version.');
  assert.ok(['local', 'published'].includes(release.publication.status), 'Unknown publication status.');
  assert.match(release.publication.repository, /^[\w.-]+\/[\w.-]+$/);
  if (repository) assert.equal(release.publication.repository, repository, 'Release repository must match this workflow repository.');
  assert.equal(release.publication.tag, `v${release.kitVersion}`, 'Release tag must match the kit version.');
  assert.equal(release.assets.kit.filename, 'zero-bootstrap.zip');
  assert.equal(release.assets.starter.filename, 'zero-starter.zip');
  assert.equal(release.assets.extension.filename, `zero-${release.kitVersion}.vsix`);
  for (const [key, asset] of Object.entries(release.assets)) {
    if (!publicKeys.includes(key)) assert.equal(asset.publicationStatus, 'local', 'Optional components must remain local.');
  }
  if (manual) {
    assert.equal(release.publication.status, 'local', 'Published versions are immutable; prepare a new local version.');
    assert.equal(expectedVersion, release.kitVersion, 'Requested version differs from the selected source ref.');
  }
  if (release.publication.status === 'local') {
    for (const key of publicKeys) assert.ok(!release.assets[key].url, 'Clear public URLs before preparing a local version.');
  }
  return {version: release.kitVersion, status: release.publication.status,
    repository: release.publication.repository, tag: release.publication.tag,
    filenames: publicKeys.map(key => release.assets[key].filename)};
}

export async function assertUnpublished(plan, token, request = fetch) {
  for (const resource of [`git/ref/tags/${encodeURIComponent(plan.tag)}`, `releases/tags/${encodeURIComponent(plan.tag)}`]) {
    const response = await request(`https://api.github.com/repos/${plan.repository}/${resource}`, {
      headers: {Accept: 'application/vnd.github+json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      signal: AbortSignal.timeout(30000)
    });
    if (response.status === 200) throw new Error(`${plan.tag} already has a tag or release; use a new version.`);
    assert.equal(response.status, 404, `Could not establish release absence (HTTP ${response.status}); refusing preparation.`);
  }
}

export function verifyReviewAssets(directory, release, sourceRoot = root) {
  const receipt = JSON.parse(readFileSync(path.join(directory, 'release.json'), 'utf8'));
  assert.equal(receipt.kitVersion, release.kitVersion);
  assert.equal(receipt.coreVersion, release.coreVersion);
  assert.deepEqual(receipt.publication, release.publication);
  assert.deepEqual(Object.keys(receipt.assets).sort(), [...publicKeys].sort(), 'Review only the three public assets.');
  const sums = [];
  for (const key of publicKeys) {
    const asset = receipt.assets[key];
    assert.equal(asset.filename, release.assets[key].filename);
    const bytes = readFileSync(path.join(directory, asset.filename));
    assert.equal(bytes.length, asset.size, 'Artifact size drift.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, asset.sha256, 'Artifact SHA256 drift.');
    sums.push(`${hash}  ${asset.filename}`);
  }
  const vsix = unzipSync(readFileSync(path.join(directory, release.assets.extension.filename)));
  const manifest = JSON.parse(new TextDecoder().decode(vsix['extension/package.json']));
  assert.equal(manifest.version, release.kitVersion);
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest, JSON.parse(readFileSync(path.join(sourceRoot, 'extension/package.json'), 'utf8')), 'VSIX manifest drift.');
  assert.deepEqual(vsix['extension/LICENSE.txt'], new Uint8Array(readFileSync(path.join(sourceRoot, 'LICENSE'))));
  const sourceNames = [];
  function verifySources(relative) {
    for (const entry of readdirSync(path.join(sourceRoot, relative), {withFileTypes: true})) {
      const name = `${relative}/${entry.name}`;
      assert.ok(!entry.isSymbolicLink(), 'Extension source must not be a symlink.');
      if (entry.isDirectory()) verifySources(name);
      else {
        sourceNames.push(name);
        assert.deepEqual(vsix[name], new Uint8Array(readFileSync(path.join(sourceRoot, name))), `VSIX source drift: ${name}`);
      }
    }
  }
  verifySources('extension/src');
  assert.deepEqual(Object.keys(vsix).filter(name => name.startsWith('extension/src/') && !name.endsWith('/')).sort(), sourceNames.sort(), 'Unexpected VSIX source.');
  return sums.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = releaseDefinition();
  const plan = reviewPlan(release, {manual: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch',
    expectedVersion: process.env.EXPECTED_VERSION || '', repository: process.env.GITHUB_REPOSITORY});
  if (process.argv[2] === 'plan') {
    if (plan.status === 'local') await assertUnpublished(plan, process.env.GH_TOKEN);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `status=${plan.status}\nversion=${plan.version}\nkit=${plan.filenames[0]}\nstarter=${plan.filenames[1]}\nextension=${plan.filenames[2]}\n`);
    console.log(`${plan.tag}: ${plan.status}; ${plan.status === 'local' ? 'new version available for review' : 'immutable published assets will not be rebuilt'}`);
  } else if (process.argv[2] === 'seal') {
    assert.equal(plan.status, 'local');
    writeFileSync(path.join(root, 'dist/SHA256SUMS'), verifyReviewAssets(path.join(root, 'dist'), release));
    assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
    writeFileSync(path.join(root, 'dist/SOURCE.txt'), `Repository: ${plan.repository}\nCommit: ${process.env.GITHUB_SHA}\nVersion: ${plan.version}\nRun: ${process.env.GITHUB_RUN_ID}\n`);
  } else throw new Error('Usage: node scripts/release-review.mjs plan|seal');
}
