import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {zipSync} from 'fflate';
import {reviewPlan, assertUnpublished, verifyReviewAssets} from './release-review.mjs';

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

test('sealing rejects byte drift, stale packaged source and an extra component asset', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'zero-release-review-'));
  try {
    mkdirSync(path.join(fixture, 'extension/src'), {recursive: true});
    const license = new TextEncoder().encode('MIT License\nfixture notice\n');
    const source = new TextEncoder().encode('module.exports = 42;\n');
    writeFileSync(path.join(fixture, 'LICENSE'), license);
    writeFileSync(path.join(fixture, 'extension/src/extension.js'), source);
    writeFileSync(path.join(fixture, 'extension/package.json'), JSON.stringify({version: '1.2.3', license: 'MIT'}));
    const release = definition(), receipt = {...release, assets: {}};
    const vsix = zipSync({'extension/LICENSE.txt': license, 'extension/src/extension.js': source,
      'extension/package.json': new TextEncoder().encode(JSON.stringify({version: '1.2.3', license: 'MIT'}))});
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
    receipt.assets.components = {filename: 'zero-components.zip'};
    save();
    assert.throws(() => verifyReviewAssets(fixture, release, fixture), /three public assets/);
  } finally {rmSync(fixture, {recursive: true, force: true});}
});
