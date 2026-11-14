import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { windowsPortablePilotHref } from '../lib/windows-portable-pilot.mjs';

const pilot = JSON.parse(await readFile(new URL('../../release/windows-portable-pilot.json', import.meta.url)));
const local = { kitVersion:pilot.kitVersion, sourceRevision:pilot.sourceRevision, localAsset:pilot.localAsset };

test('the unsigned pilot offers only a release URL that matches its own immutable ZIP', () => {
  assert.equal(windowsPortablePilotHref(local), null);
  const tag = `windows-portable-pilot-v${pilot.kitVersion}`;
  const filename = `Zero-${pilot.kitVersion}-windows-portable-pilot-staging-x64.zip`;
  const url = `https://github.com/codepetca/zero/releases/download/${tag}/${filename}`;
  const candidate = { ...local, asset: { filename, size:6_000_000, sha256:"a".repeat(64), url }, publication: { status:'published', tag } };
  assert.equal(windowsPortablePilotHref(candidate), url);
  assert.throws(() => windowsPortablePilotHref({ ...candidate, publication: undefined }), /local/);
  assert.throws(() => windowsPortablePilotHref({ ...candidate, asset: { ...candidate.asset, url: url + '?other=1' } }), /release URL/);
  assert.throws(() => windowsPortablePilotHref({ ...candidate, asset: { ...candidate.asset, sha256: '' } }), /metadata/);
});
