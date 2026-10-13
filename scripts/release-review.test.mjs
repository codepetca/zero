import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {zipSync} from 'fflate';
import {reviewPlan, assertUnpublished, verifyReviewAssets, sharingConfigurationBytes} from './release-review.mjs';

const sharingSettings = {schema: 1, catalogUrl: 'https://zero.codepet.ca/api/sharing/catalog',
  artifactOrigin: 'https://fixture.public.blob.vercel-storage.com', policyRevision: 'a'.repeat(40)};
const sharingBytes = new TextEncoder().encode(JSON.stringify(sharingSettings, null, 2) + '\n');

test('release sharing settings preserve checked bytes and reject missing, closed or invalid source', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-release-sharing-'));
  try {
    mkdirSync(path.join(fixture, 'release'));
    assert.throws(() => sharingConfigurationBytes(fixture), /ENOENT/);
    writeFileSync(path.join(fixture, 'release/sharing.json'), sharingBytes);
    assert.deepEqual(sharingConfigurationBytes(fixture), sharingBytes);
    for (const value of [{...sharingSettings, artifactOrigin: '', policyRevision: ''},
      {...sharingSettings, operatorToken: 'not-allowed'}, {...sharingSettings, policyRevision: 'unreviewed'}]) {
      writeFileSync(path.join(fixture, 'release/sharing.json'), JSON.stringify(value));
      assert.throws(() => sharingConfigurationBytes(fixture), /sharing configuration|reviewed policy/);
    }
  } finally {rmSync(fixture, {recursive: true, force: true});}
});

function definition() {
  return {kitVersion: '1.2.3', coreVersion: '0.1.1', publication: {
    status: 'local', repository: 'codepetca/zero', tag: 'v1.2.3'}, assets: {
    kit: {filename: 'zero-bootstrap.zip'}, starter: {filename: 'zero-starter.zip'},
    extension: {filename: 'zero-1.2.3.vsix'}, components: {filename: 'zero-components.zip', publicationStatus: 'local'}}};
}

test('manual preparation rejects published versions, mismatched inputs and public optional components', () => {
  const local = definition();
  assert.equal(reviewPlan(local, {manual: true, expectedVersion: '1.2.3', repository: 'codepetca/zero'}).status, 'local');
  assert.throws(() => reviewPlan(local, {manual: true, expectedVersion: '1.2.4'}), /Requested version/);
  assert.throws(() => reviewPlan(local, {repository: 'someone/zero'}), /repository/);
  assert.throws(() => reviewPlan({...local, publication: {...local.publication, tag: 'v1.2.2'}}), /tag/);
  local.assets.kit.url = 'https://example.com/stale.zip';
  assert.throws(() => reviewPlan(local), /Clear public URLs/);
  delete local.assets.kit.url;
  local.assets.components.publicationStatus = 'published';
  assert.throws(() => reviewPlan(local), /Optional components/);
  local.assets.components.publicationStatus = 'local';
  local.publication.status = 'published';
  assert.equal(reviewPlan(local).status, 'published', 'PR checks retain published versions without rebuilding');
  assert.throws(() => reviewPlan(local, {manual: true, expectedVersion: '1.2.3'}), /immutable/);
});

test('absence checks fail closed on existing tags, drafts and API errors', async () => {
  const plan = reviewPlan(definition());
  for (const statuses of [[200], [404, 200], [403], [404, 500]]) {
    let index = 0;
    await assert.rejects(assertUnpublished(plan, 'read-token', async () => ({status: statuses[index++]})));
  }
  const requests = [];
  await assertUnpublished(plan, 'read-token', async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Authorization, 'Bearer read-token');
    return {status: 404};
  });
  assert.deepEqual(requests, [
    'https://api.github.com/repos/codepetca/zero/git/ref/tags/v1.2.3',
    'https://api.github.com/repos/codepetca/zero/releases/tags/v1.2.3']);
});

test('sealing rejects byte drift, stale source, harness or sharing settings and an extra component asset', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-release-review-'));
  try {
    mkdirSync(path.join(fixture, 'extension/src'), {recursive: true});
    mkdirSync(path.join(fixture, 'sharing/harness'), {recursive: true});
    mkdirSync(path.join(fixture, 'release'));
    const license = new TextEncoder().encode('MIT License\nfixture notice\n');
    const source = new TextEncoder().encode('module.exports = 42;\n');
    const harness = new TextEncoder().encode('public class ZeroLibraryHarness {}\n');
    writeFileSync(path.join(fixture, 'LICENSE'), license);
    writeFileSync(path.join(fixture, 'extension/src/extension.js'), source);
    writeFileSync(path.join(fixture, 'sharing/harness/ZeroLibraryHarness.java'), harness);
    writeFileSync(path.join(fixture, 'release/sharing.json'), sharingBytes);
    writeFileSync(path.join(fixture, 'extension/package.json'), JSON.stringify({version: '1.2.3', license: 'MIT'}));
    const release = definition(), receipt = {...release, assets: {}};
    const members = {'extension/LICENSE.txt': license, 'extension/src/extension.js': source,
      'extension/media/sharing-harness/ZeroLibraryHarness.java': harness,
      'extension/media/sharing-config.json': sharingBytes,
      'extension/package.json': new TextEncoder().encode(JSON.stringify({version: '1.2.3', license: 'MIT'}))};
    const vsix = zipSync(members);
    for (const key of ['kit', 'starter', 'extension']) {
      const bytes = key === 'extension' ? vsix : new TextEncoder().encode(key);
      const filename = release.assets[key].filename;
      writeFileSync(path.join(fixture, filename), bytes);
      receipt.assets[key] = {filename, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
    }
    const save = () => writeFileSync(path.join(fixture, 'release.json'), JSON.stringify(receipt));
    save();
    assert.equal(verifyReviewAssets(fixture, release, fixture).trim().split('\n').length, 3);
    writeFileSync(path.join(fixture, 'zero-bootstrap.zip'), 'corrupt');
    assert.throws(() => verifyReviewAssets(fixture, release, fixture), /size drift/);
    writeFileSync(path.join(fixture, 'zero-bootstrap.zip'), 'bad');
    assert.throws(() => verifyReviewAssets(fixture, release, fixture), /SHA256 drift/);
    writeFileSync(path.join(fixture, 'zero-bootstrap.zip'), 'kit');
    writeFileSync(path.join(fixture, 'extension/src/extension.js'), 'new source');
    assert.throws(() => verifyReviewAssets(fixture, release, fixture), /VSIX source drift/);
    writeFileSync(path.join(fixture, 'extension/src/extension.js'), source);
    writeFileSync(path.join(fixture, 'sharing/harness/ZeroLibraryHarness.java'), 'public class ZeroLibraryHarness { int changed; }\n');
    assert.throws(() => verifyReviewAssets(fixture, release, fixture), /VSIX sharing harness drift/);
    writeFileSync(path.join(fixture, 'sharing/harness/ZeroLibraryHarness.java'), harness);
    for (const changedHarness of [new TextEncoder().encode('stale harness\n'), undefined]) {
      const changedMembers = {...members};
      if (changedHarness) changedMembers['extension/media/sharing-harness/ZeroLibraryHarness.java'] = changedHarness;
      else delete changedMembers['extension/media/sharing-harness/ZeroLibraryHarness.java'];
      const bytes = zipSync(changedMembers);
      writeFileSync(path.join(fixture, release.assets.extension.filename), bytes);
      receipt.assets.extension.size = bytes.length;
      receipt.assets.extension.sha256 = createHash('sha256').update(bytes).digest('hex');
      save();
      assert.throws(() => verifyReviewAssets(fixture, release, fixture), /VSIX sharing harness drift/,
        'A valid archive checksum cannot establish canonical harness parity');
    }
    for (const changedSharing of [
      new TextEncoder().encode(JSON.stringify({...sharingSettings, catalogUrl: 'https://wrong.example/catalog'})),
      new TextEncoder().encode(JSON.stringify({...sharingSettings, policyRevision: 'b'.repeat(40)})),
      new TextEncoder().encode(JSON.stringify(sharingSettings)), undefined]) {
      const changedMembers = {...members};
      if (changedSharing) changedMembers['extension/media/sharing-config.json'] = changedSharing;
      else delete changedMembers['extension/media/sharing-config.json'];
      const bytes = zipSync(changedMembers);
      writeFileSync(path.join(fixture, release.assets.extension.filename), bytes);
      receipt.assets.extension.size = bytes.length;
      receipt.assets.extension.sha256 = createHash('sha256').update(bytes).digest('hex');
      save();
      assert.throws(() => verifyReviewAssets(fixture, release, fixture), /VSIX sharing configuration drift/,
        'Matching ZIP hashes do not establish the exact checked sharing configuration');
    }
    receipt.assets.components = {filename: 'zero-components.zip'};
    save();
    assert.throws(() => verifyReviewAssets(fixture, release, fixture), /three public assets/);
  } finally {rmSync(fixture, {recursive: true, force: true});}
});
