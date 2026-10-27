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
  assert.match(ready,/GitHub setup/);
  assert.doesNotMatch(ready,/<header class="sidebar-brand"|<h1>Zero<\/h1>/,'Keep the current panel height; branding stays in the activity bar');
  const hub=ready.match(/<button[^>]*data-command="zero.browseZeroHub"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.ok(hub.endsWith('>ZeroHub</button>'));assert.doesNotMatch(hub,/<svg/);
  assert.match(ready,/id="files-menu-button"[^>]*>New[\s\S]*?<\/button>/);
  assert.doesNotMatch(ready,/data-command="zero.recovery"/);
  assert.match(ready,/<div id="file-actions" class="file-actions">[\s\S]*id="files-menu-button"/);
  assert.doesNotMatch(ready,/data-command="zero.copyImportedAssetPaths"/);
  const empty = sidebarSource('empty');
  assert.doesNotMatch(empty,/id="files-menu-button"|data-command="zero.recovery"/);
  assert.doesNotMatch(ready,/class="run"[^>]*disabled/);
  assert.doesNotMatch(ready,/Show Problems/);
  const error = sidebarSource('error');
  assert.match(error,/Main.java, line 8: add a semicolon/);
  assert.match(error,/zero.showProblems/);
  const practice = sidebarSource('practice');
  assert.match(practice,/zero.browseZeroHub/);
  assert.match(practice,/id="files-menu-button"/);
  assert.doesNotMatch(practice,/data-command="zero.recovery"/);
  assert.match(practice,/>GitHub setup<\/button>/);
  assert.doesNotMatch(practice,/data-command="zero.chooseRepository"/);
  assert.doesNotMatch(practice,/data-command="zero\.(?:uploadToGitHub)"/);
});

test('actual sidebar renderer has one Run/Stop control across idle, build, running and stopping states',()=>{
  for(const [state,label] of [['ready','Run'],['building','Stop'],['running','Stop'],['stopping','Stopping…'],['error','Run']]){
    const html=sidebarSource(state);
    assert.equal((html.match(/data-command="zero.toggleApp"/g)||[]).length,1);
    assert.doesNotMatch(html,/data-command="zero.runApp"|data-command="zero.stopApp"/);
    const button=html.match(/<button[^>]*data-command="zero.toggleApp"[^>]*>[\s\S]*?<\/button>/)[0];
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

test('Start Page fixture renders the production panel and its actual phase snapshots', async () => {
  const {startPageSource, startPageView, componentStates} = await import('./start-page-source.mjs');
  for (const state of componentStates) {
    const {html, snapshot} = await startPageSource(state);
    assert.match(html, /Start with Zero/);
    assert.match(html, /aria-controls="tutorial-menu"/);
    assert.match(html, /aria-controls="project-menu"/);
    assert.match(html, /script-src 'nonce-/);
    assert.match(html, /connect-src 'none'/);
    assert.equal(snapshot.state.phase, state === 'busy' || state.startsWith('publish') ? 'ready' : state);
    assert.equal(snapshot.state.busy, state === 'busy' || Boolean(snapshot.state.publishProgress)||state==='published-busy');
    assert.equal(snapshot.state.accountId, state === 'signed-out' ? undefined : '123456');
    assert.equal(snapshot.state.recent.length, state === 'signed-out' ? 0 : 2);
    const fixture = await startPageView('hc', state);
    assert.match(fixture, /class="vscode-high-contrast"/);
    assert.match(fixture, /style-src 'self' 'nonce-/);
    assert.match(fixture, /script-src 'nonce-/);
    assert.doesNotMatch(fixture, /script-src[^;]*unsafe-inline/);
    assert.match(fixture, /Fixture only:/);
    assert.match(fixture, /Nothing ran, signed in or changed/);
    assert.doesNotMatch(fixture, /fetch\(|executeCommand\(|https:\/\//);
  }
});

test('component gallery routes expose theme/state controls and sandbox actual editor screens', async () => {
  const server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const galleryResponse = await fetch(`${origin}/components?theme=hc&state=busy`);
    const galleryPolicy = galleryResponse.headers.get('content-security-policy');
    assert.match(galleryPolicy, /form-action 'self'$/);
    assert.match(galleryPolicy, /connect-src 'none'; frame-src 'self'; base-uri 'none'/);
    const gallery = await galleryResponse.text();
    assert.match(gallery, /<form method="get" action="\/components"/);
    for (const route of ['/', '/web', '/sidebar', '/start-page', '/components.css']) {
      const screenResponse = await fetch(origin + route);
      const screenPolicy = screenResponse.headers.get('content-security-policy');
      assert.equal(screenPolicy, galleryPolicy.replace("form-action 'self'", "form-action 'none'"), route);
    }
    assert.match(gallery, /name="theme"/);
    assert.match(gallery, /name="state"/);
    assert.match(gallery, /value="busy" selected/);
    assert.match(gallery, /value="hc" selected/);
    assert.equal((gallery.match(/sandbox="allow-scripts"/g) || []).length, 2);
    assert.match(gallery, /src="\/start-page\?theme=hc&state=busy"/);
    assert.match(gallery, /src="\/sidebar\?theme=hc&state=busy&connected=1"/);
    for (const state of ['ready','signed-out','install','checking','unavailable','busy']) {
      const response = await fetch(`${origin}/start-page?theme=dark&state=${state}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), new RegExp(`Local fixture · dark · ${state}`));
      assert.equal((await fetch(`${origin}/sidebar?theme=dark&state=${state}&connected=1`)).status, 200);
    }
    const host = await (await fetch(`${origin}/host-fixture.css?theme=hc`)).text();
    for (const variable of ['editor-background','button-separator','menu-selectionBackground','menu-selectionForeground','menu-selectionBorder','contrastBorder']) assert.ok(host.includes(`--vscode-${variable}:`));
    assert.match(host, /--vscode-editor-background:#000000/);
    assert.equal((await fetch(`${origin}/components.css`)).status, 200);
    assert.equal((await fetch(`${origin}/start-page`, {method: 'POST'})).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});


test('sidebar gallery phases retain access gating and busy disables existing controls', () => {
  const ready = sidebarSource('ready', {connected:true});
  assert.match(ready, /id="run-menu-button"/);
  for (const phase of ['signed-out','install','checking','unavailable']) {
    const html = sidebarSource(phase, {connected:true});
    assert.match(html, />GitHub setup<\/button>/);
    assert.doesNotMatch(html, /id="run-menu-button"|data-command="zero.uploadToGitHub"/);
    assert.doesNotMatch(html.match(/<button[^>]*data-command="zero.toggleApp"[^>]*>/)[0], /disabled/);
  }
  const busy = sidebarSource('busy', {connected:true});
  assert.match(busy, /id="run-menu-button"[^>]*disabled/);
  assert.match(busy, /id="files-menu-button"[^>]*disabled/);
  assert.match(busy, /data-command="zero.toggleApp"[^>]*disabled/);
});

test('publishing fixtures exercise real coordinator stages and root-scoped renderer with reduced-motion and contrast rules',async()=>{
  const {publishingSnapshots}=await import('./publishing-source.mjs');
  for(const stage of ['building','uploading','deploying','verifying','opening']){
    const snapshot=publishingSnapshots['publish-'+stage],html=sidebarSource('publish-'+stage,{connected:true});
    assert.equal(snapshot.publishProgress.stages[snapshot.publishProgress.index],stage);
    assert.match(html,/role="progressbar"/);assert.match(html,/aria-valuetext="Stage \d of \d:/);
    assert.match(html,/prefers-reduced-motion:reduce/);assert.match(html,/forced-colors:active/);
    assert.equal((html.match(/class="publish-segment active"/g)||[]).length,1);
  }
  for(const state of ['publish-error','publish-stopped'])assert.doesNotMatch(sidebarSource(state),/role="progressbar"/);
  assert.doesNotMatch(sidebarSource('publish-building',{connected:true,projectRoot:'/other/project'}),/role="progressbar"/);
});

test('published link sits below Run, follows cloud/busy visibility and its fixture opens historical output read-only',async()=>{
  const {publishedLinkProof}=await import('./publishing-source.mjs');
  const html=sidebarSource('published',{connected:true});
  assert.match(html,/class="link published-app-link" data-command="zero.openPublishedWeb"/);
  assert.ok(html.indexOf('class="run-split"')<html.indexOf('class="link published-app-link"'));
  assert.ok(html.indexOf('class="link published-app-link"')<html.indexOf('class="repository"'));
  assert.match(sidebarSource('published-busy',{connected:true}),/data-command="zero.openPublishedWeb" disabled/);
  assert.doesNotMatch(sidebarSource('published',{connected:false}),/data-command="zero.openPublishedWeb"/);
  assert.doesNotMatch(sidebarSource('published',{connected:true,projectRoot:'/other'}),/data-command="zero.openPublishedWeb"/);
  assert.notEqual(publishedLinkProof.localSha,publishedLinkProof.openedSha);
  assert.deepEqual([publishedLinkProof.builds,publishedLinkProof.uploads,publishedLinkProof.deploys],[0,0,0]);
});
