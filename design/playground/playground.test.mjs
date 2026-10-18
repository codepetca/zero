import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { handle } from './server.mjs';
import { sidebarSource } from './sidebar-source.mjs';
import { webView } from './views.mjs';
import { installerHref } from '../../website/lib/installer.mjs';
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
    const installer = JSON.parse(readFileSync(new URL('../../release/installer.json', import.meta.url), 'utf8'));
    if (installer.publication.status === 'published') {
      assert.match(downloadHtml, /Download for Mac Silicon/);
      assert.ok(downloadHtml.includes(`data-source-url="${installer.asset.url}"`));
    } else {
      assert.doesNotMatch(downloadHtml, /Download for Mac Silicon|data-fixture="Mac setup download"/);
    }
    assert.match(downloadHtml, /Download for Windows \(ZIP\)/);
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

test('download review shows a published Mac fixture and omits a local Mac candidate', () => {
  const authored = JSON.parse(readFileSync(new URL('../../release/installer.json', import.meta.url), 'utf8'));
  const published = structuredClone(authored);
  published.publication.status = 'published';
  published.asset.url = `https://github.com/codepetca/zero/releases/download/${published.publication.tag}/${published.asset.filename}`;
  const local = structuredClone(authored);
  local.publication.status = 'local';
  delete local.asset.url;
  for (const theme of ['light', 'dark']) {
    const publishedHtml = webView(theme, { mac: installerHref(published, false), windows: null }, 'downloads');
    assert.match(publishedHtml, /Download for Mac Silicon/);
    assert.ok(publishedHtml.includes(`data-source-url="${published.asset.url}"`));
    assert.doesNotMatch(publishedHtml, /href="https:/);
    const localHtml = webView(theme, { mac: installerHref(local, false), windows: null }, 'downloads');
    assert.doesNotMatch(localHtml, /Download for Mac Silicon|data-fixture="Mac setup download"|\/download\/installer/);
  }
});

test('actual sidebar renderer retains local Run while signed out and useful Error recovery', async () => {
  const ready = sidebarSource();
  assert.match(ready,/zero.toggleApp/); assert.doesNotMatch(ready,/Ready to run/);
  assert.match(ready,/Sign in to GitHub/);
  assert.doesNotMatch(ready,/<header class="sidebar-brand"|<h1>Zero<\/h1>/,'Keep the current panel height; branding stays in the activity bar');
  const hub=ready.match(/<button[^>]*data-command="zero.browseZeroHub"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.ok(hub.endsWith('>ZeroHub</button>'));assert.doesNotMatch(hub,/<svg/);
  assert.match(ready,/data-command="zero.importAssets"[^>]*>Add assets…<\/button>/);
  assert.doesNotMatch(ready,/data-command="zero.recovery"/);
  assert.match(ready,/<div class="files-header">[\s\S]*data-command="zero.importAssets"/);
  assert.doesNotMatch(ready,/data-command="zero.copyImportedAssetPaths"/);
  const empty = sidebarSource('empty');
  assert.doesNotMatch(empty,/data-command="zero.importAssets"|data-command="zero.recovery"/);
  assert.doesNotMatch(ready,/class="run"[^>]*disabled/);
  assert.doesNotMatch(ready,/Show Problems/);
  const error = sidebarSource('error');
  assert.match(error,/Main.java, line 8: add a semicolon/);
  assert.match(error,/zero.showProblems/);
  const practice = sidebarSource('practice');
  assert.match(practice,/zero.browseZeroHub/);
  assert.match(practice,/data-command="zero.importAssets"/);
  assert.doesNotMatch(practice,/data-command="zero.recovery"/);
  assert.match(practice,/>Sign in<\/button>/);
  assert.doesNotMatch(practice,/data-command="zero.chooseRepository"/);
  assert.doesNotMatch(practice,/data-command="zero\.(?:uploadToGitHub)"/);
});

test('actual sidebar renderer has one Run/Stop control across idle, build, running and stopping states',()=>{
  for(const [state,label] of [['ready','Run'],['building','Stop'],['running','Stop'],['stopping','Stopping…'],['error','Run']]){
    const html=sidebarSource(state);
    assert.equal((html.match(/data-command="zero.toggleApp"/g)||[]).length,1);
    assert.doesNotMatch(html,/data-command="zero.runApp"|data-command="zero.stopApp"/);
    const button=html.match(/<button class="run"[^>]*>[\s\S]*?<\/button>/)[0];
    assert.ok(button.endsWith(label+'</button>'));
    const browser=html.match(/<button[^>]*data-command="zero.openRunningAppInBrowser"[^>]*>[\s\S]*?<\/button>/);
    if(state==='running'){
      assert.ok(browser);assert.match(browser[0],/title="Open in browser" aria-label="Open in browser"/);
      assert.match(browser[0],/<svg/);assert.equal(browser[0].replace(/<[^>]*>/g,''),'');
      assert.match(html,/<div class="run-controls">[\s\S]*zero.toggleApp[\s\S]*zero.openRunningAppInBrowser[\s\S]*?<\/div>/);
    }else assert.equal(browser,null);

    if(state==='stopping')assert.match(button,/aria-disabled="true"/);else assert.doesNotMatch(button,/ disabled>|aria-disabled="true"/);
  }
});
