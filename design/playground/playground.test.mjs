import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { handle } from './server.mjs';
import { sidebarSource } from './sidebar-source.mjs';
import { lessons } from '../../website/lib/learning.mjs';

test('review endpoints use source data and published fallback without exposing downloads or commands', async () => {
  const server = http.createServer(handle);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const web = await fetch(`${origin}/web?theme=dark`);
    assert.equal(web.status,200);
    assert.match(web.headers.get('content-security-policy'), /connect-src 'none'/);
    const html = await web.text();
    for (const lesson of lessons) assert.ok(html.includes(lesson.title.replaceAll('&','&amp;')));
    assert.match(html, /Lessons 0–12/); assert.match(html, /data-lesson-content="0"/);
    assert.doesNotMatch(html, /Learn Java|Start lesson 0|Starting from zero/);
    assert.doesNotMatch(html, /Download for Mac Silicon|Download for Windows/);
    const downloadHtml = await (await fetch(`${origin}/web?theme=dark&screen=downloads`)).text();
    assert.match(downloadHtml, /Download Zero/);
    assert.doesNotMatch(downloadHtml, /Learn Java|id="lessons"/);
    assert.match(downloadHtml, /Download for Mac Silicon/); assert.match(downloadHtml, /Download for Windows \(ZIP\)/);
    assert.match(downloadHtml, /aria-label="Download for Windows \(ZIP\), manual setup"/);
    const authored = JSON.parse(readFileSync(new URL('../../release/kit.json', import.meta.url), 'utf8'));
    const published = JSON.parse(readFileSync(new URL('../../release/published-kit.json', import.meta.url), 'utf8'));
    const kit = authored.publication.status === 'published' ? authored : published;
    assert.ok(downloadHtml.includes(`data-source-url="${kit.assets.kit.url}"`));
    assert.doesNotMatch(downloadHtml, /Linux|Windows.*\.exe|href="https:/);
    assert.equal((await fetch(`${origin}/download/installer`)).status,404);
    assert.equal((await fetch(`${origin}/`,{method:'POST'})).status,405);
    for (const path of ['/preview.css','/sidebar-preview.css','/fixture.js','/review.js','/assets/zero.svg','/assets/download.svg','/tokens-web.css?theme=dark','/tokens-vscode.css','/host-fixture.css?theme=dark','/guide']) assert.equal((await fetch(origin+path)).status,200,path);
    const brand = await (await fetch(`${origin}/assets/zero.svg`)).text();
    assert.match(brand,/#683bef/);
    assert.doesNotMatch(brand,/currentColor/);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('actual sidebar renderer retains local Run while signed out and useful Error recovery', async () => {
  const ready = sidebarSource();
  assert.match(ready,/zero.runApp/); assert.match(ready,/Ready\./);
  assert.match(ready,/Sign in to GitHub/);
  assert.doesNotMatch(ready,/class="run"[^>]*disabled/);
  assert.doesNotMatch(ready,/Show Problems/);
  const error = sidebarSource('error');
  assert.match(error,/Main.java, line 8: add a semicolon/);
  assert.match(error,/zero.showProblems/);
});
