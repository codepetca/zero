import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jamPagesInstallLink} from '../lib/jam-pages-install-link.mjs';

test('constructs a fixed GitHub installation URL for a valid app slug', () => {
  assert.equal(jamPagesInstallLink('zero-pages-read-2'), 'https://github.com/apps/zero-pages-read-2/installations/new');
});

test('fails closed for missing, malformed, and potentially malicious slugs', () => {
  for (const slug of [undefined, null, '', 'UPPER', '-app', 'app-', 'app--name', ' app', 'app/name', '../other', 'app?x=1', 'app#x', 'app%2fother', 'https://evil.example', 'github.com@evil.example', 'a'.repeat(101), 42]) {
    assert.equal(jamPagesInstallLink(slug), null, String(slug));
  }
});

test('participant page links the pinned Zero App', async () => {
  const page = await readFile(new URL('../app/hub/jams/[id]/participate/page.tsx', import.meta.url), 'utf8');
  const client = await readFile(new URL('../components/JamClient.tsx', import.meta.url), 'utf8');
  const config = JSON.parse(await readFile(new URL('../../extension/src/github-app/config.json',import.meta.url),'utf8'));
  assert.equal(config.appId,5367740);
  assert.equal(config.slug,'codepet-zero');
  assert.match(page, /jamPagesInstallLink\('codepet-zero'\)/);
  assert.match(client, /pagesInstallLink\?<p><a[^>]+href=\{pagesInstallLink\}/);
  assert.match(client, /access setup is unavailable in this preview/);
  assert.match(client, /Returning from GitHub does not confirm installation or verification/);
});
