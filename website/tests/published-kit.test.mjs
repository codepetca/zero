import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { availableKitRelease, releaseAssetHref, validateManifest, validatePublishedKit } from '../lib/contracts.mjs';
import { installerHref, landingDownloadHref, localDownloadsAllowed } from '../lib/installer.mjs';
const current = JSON.parse(await readFile(new URL('../../release/kit.json', import.meta.url)));
const fallback = JSON.parse(await readFile(new URL('../../release/published-kit.json', import.meta.url)));
const native = JSON.parse(await readFile(new URL('../../release/installer.json', import.meta.url)));
native.publication.status = 'local';
delete native.asset.url;
const source = await readFile(new URL('../components/Downloads.jsx', import.meta.url), 'utf8');
async function render(release, publishedKit, installer, local) {
  const kit = availableKitRelease(release, publishedKit, local);
  const values = {release, installer, kit, mac:installerHref(installer, local)};
  const fixture = source.replace(/^import .*;\n/gm, '')
    .replace('export function Downloads()', `const {release, installer, kit:available, mac:macHref} = ${JSON.stringify(values)};
const DownloadIcon = () => null;
const downloadableKit = () => available;
const macDownloadHref = () => macHref;
const downloadHref = (key = 'kit') => available?.publication.status === 'published' ? available.assets[key].url : '/download/' + key;
export function Downloads()`);
  const js = ts.transpileModule(fixture, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX, module:ts.ModuleKind.ESNext}}).outputText
    .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
  const {Downloads} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return renderToStaticMarkup(createElement(Downloads));
}
test('fallback preserves exact published versions, filenames, digests and explicit URLs', () => {
  validateManifest(current);
  assert.equal(validatePublishedKit(fallback, current), fallback);
  assert.equal(fallback.kitVersion, '0.5.3');
  for (const [key, size, sha256] of [
    ['kit',177939,'304096a6b2f2dade288baadfdfaacc59bff9f753836697fa3fd66640d837dc6f'],
    ['starter',111219,'166b53ee2bd4a0a037477aceddca6c9e7720cdc1aa341ce2a1bdd27437923126'],
    ['extension',65267,'337d7c7b3aa14a4b2f436214c2b9034f004b11860a3bcee14142b2c72639662f']]) {
    assert.equal(fallback.assets[key].size,size);
    assert.equal(fallback.assets[key].sha256,sha256);
    assert.equal(releaseAssetHref(fallback,key),`https://github.com/codepetca/zero/releases/download/v0.5.3/${fallback.assets[key].filename}`);
  }
  assert.equal(validatePublishedKit(null,current),null);
  assert.throws(() => validatePublishedKit(current,current), /must be published/);
  assert.throws(() => validatePublishedKit(fallback,{...current,kitVersion:'0.5.2'}), /newer/);
  assert.throws(() => validatePublishedKit({...fallback,assets:{...fallback.assets,kit:{...fallback.assets.kit,sha256:undefined}}},current), /digest/);
});
test('current publication and explicit local preview take precedence, hosted flags use public fallback', () => {
  assert.equal(availableKitRelease(current,fallback),fallback);
  assert.equal(availableKitRelease(current,fallback,true),current);
  assert.equal(availableKitRelease(current,null),null);
  const published=structuredClone(current);
  published.publication.status='published';
  for (const key of ['kit','starter','extension']) {
    const asset=published.assets[key];
    Object.assign(asset,{size:1,sha256:'a'.repeat(64),url:`https://github.com/codepetca/zero/releases/download/v${published.kitVersion}/${asset.filename}`});
  }
  validateManifest(published);
  assert.equal(availableKitRelease(published,fallback),published);
  assert.equal(availableKitRelease(published,fallback,true),published);
  assert.equal(availableKitRelease(current,fallback,localDownloadsAllowed({ZERO_LOCAL_DOWNLOADS:'1',VERCEL:'1'})),fallback);
  assert.equal(landingDownloadHref(releaseAssetHref(fallback,'kit'),native),fallback.assets.kit.url);
});
test('downloads render their own kit versions alongside independently published Mac setup', async () => {
  const publishedNative={...native,publication:{...native.publication,status:'published'},asset:{...native.asset,url:`https://github.com/codepetca/zero/releases/download/${native.publication.tag}/${native.asset.filename}`}};
  const html=await render(current,fallback,publishedNative,false);
  assert.ok(html.includes(`Zero Setup ${native.kitVersion} for Mac`));
  assert.match(html,/Set up Zero.*~\/Zero.*automatically prepares Java.*your work is kept.*Open Zero and Run App.*GitHub sign-in can wait/);
  assert.doesNotMatch(html,/choose a fresh project folder|guides the Zero profile import/);
  assert.match(html,/Complete kit ZIP 0\.5\.3/);
  assert.match(html,/Starter project 0\.5\.3/);
  assert.match(html,/Zero extension 0\.5\.3/);
  for (const key of ['kit','starter','extension']) assert.ok(html.includes(`href="${fallback.assets[key].url}"`));
  assert.ok(html.includes(`href="${publishedNative.asset.url}"`));
  assert.doesNotMatch(html,/href="\/download\/|\.exe/);
  assert.equal(landingDownloadHref(fallback.assets.kit.url,publishedNative),'/learn#downloads');
});
test('local, published, fallback and missing states render accurate labels and availability', async () => {
  assert.ok((await render(current,fallback,native,true)).includes(`Complete kit ZIP ${current.kitVersion}`));
  assert.match(await render(current,fallback,native,false),/Download Zero 0\.5\.3/);
  const published=structuredClone(current);
  published.publication.status='published';
  for (const key of ['kit','starter','extension']) published.assets[key].url=`https://github.com/codepetca/zero/releases/download/v${published.kitVersion}/${published.assets[key].filename}`;
  const publishedHtml=await render(published,fallback,null,false);
  assert.ok(publishedHtml.includes(`Download Zero ${current.kitVersion}`));
  assert.ok(publishedHtml.includes(`href="${published.assets.kit.url}"`));
  assert.doesNotMatch(publishedHtml,/0\.5\.3/);
  const missing=await render(current,null,null,false);
  assert.match(missing,/public kit download is not available yet/);
  assert.doesNotMatch(missing,/href="\/download\//);
  const route=await readFile(new URL('../app/download/[asset]/route.ts',import.meta.url),'utf8');
  assert.match(route,/verifiedLocalAsset\([^\n]+asset, release\)/);
  assert.doesNotMatch(route,/publishedKit|downloadableKit/);
  const home=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.equal((home.match(/className="button /g)||[]).length,2);
});

test('hosted starter and setup share download-aware guidance rather than packaged version assumptions', async () => {
  const prepare=await readFile(new URL('../scripts/prepare.mjs',import.meta.url),'utf8');
  assert.match(prepare,/setup: "docs\/GETTING-STARTED\.md"/);
  assert.match(prepare,/starter: "docs\/GETTING-STARTED\.md"/);
  const guide=await readFile(new URL('../../docs/GETTING-STARTED.md',import.meta.url),'utf8');
  assert.match(guide,/Zero \.vsix included with your downloaded kit/);
  assert.match(guide,/If your extracted complete kit includes a `setup\/` folder/);
  assert.match(guide,/For the 0\.5\.3 ZIP this is `zero-0\.5\.3\.vsix`/);
});
