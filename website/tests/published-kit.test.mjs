import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { availableKitRelease, releaseAssetHref, validateManifest, validatePublishedKit } from '../lib/contracts.mjs';
import { installerHref, landingDownloadHref, localDownloadsAllowed } from '../lib/installer.mjs';
const authored = JSON.parse(await readFile(new URL('../../release/kit.json', import.meta.url)));
validateManifest(authored);
// Exercise local and published states independently of the live release phase.
const current = structuredClone(authored);
current.publication.status = 'local';
for (const asset of Object.values(current.assets)) delete asset.url;
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
  assert.equal(fallback.kitVersion, '0.5.9');
  for (const [key, size, sha256, filename] of [
    ['kit',352744,'919ad3916d4263c0cf2d33f90d06c683294797c5cd02e66619df20de2c2a1a6f','zero-bootstrap.zip'],
    ['starter',185360,'4e83f2989eb65c8b9403f2faf60093c868201d40a251224fc928170cde7a0507','zero-starter.zip'],
    ['extension',145839,'f117d7f57efc7d4c61c0ca06436a728145bdd0a3eea4dbbfc7f114e0f2da0f79','zero-0.5.9.vsix']]) {
    assert.equal(fallback.assets[key].filename,filename);
    assert.equal(fallback.assets[key].size,size);
    assert.equal(fallback.assets[key].sha256,sha256);
    assert.equal(releaseAssetHref(fallback,key),`https://github.com/codepetca/zero/releases/download/v0.5.9/${filename}`);
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
  assert.equal(landingDownloadHref(releaseAssetHref(fallback,'kit'),native),'/downloads');
});
test('downloads show only supported platform buttons with exact published URLs', async () => {
  const publishedNative={...native,publication:{...native.publication,status:'published'},asset:{...native.asset,url:`https://github.com/codepetca/zero/releases/download/${native.publication.tag}/${native.asset.filename}`}};
  const html=await render(current,fallback,publishedNative,false);
  assert.ok(html.includes(`href="${fallback.assets.kit.url}"`));
  assert.ok(html.includes(`href="${publishedNative.asset.url}"`));
  assert.match(html,/Download for Mac Silicon<\/a>/);
  assert.match(html,/Download for Windows \(ZIP\)<\/a>/);
  assert.equal((html.match(/<a /g)||[]).length,2);
  assert.doesNotMatch(html,/<p[ >]|<h[1-6][ >]|<details[ >]|<summary[ >]/);
  assert.doesNotMatch(html,/Zero Setup|Other downloads|local preview|href="\/download\/|\.exe/);
  assert.equal(landingDownloadHref(fallback.assets.kit.url,publishedNative),'/downloads');
});
test('local, published, fallback and missing states offer only available verified platform buttons', async () => {
  const local=await render(current,fallback,native,true);
  assert.match(local,/Download for Mac Silicon \(local preview\)/);
  assert.match(local,/Download for Windows \(ZIP\) \(local preview\)/);
  assert.match(local,/href="\/download\/kit"/);
  const fallbackHtml=await render(current,fallback,native,false);
  assert.match(fallbackHtml,/Download for Windows \(ZIP\)/);
  assert.doesNotMatch(fallbackHtml,/Download for Mac Silicon|local preview/);
  const published=structuredClone(current);
  published.publication.status='published';
  for (const key of ['kit','starter','extension']) published.assets[key].url=`https://github.com/codepetca/zero/releases/download/v${published.kitVersion}/${published.assets[key].filename}`;
  const publishedHtml=await render(published,fallback,null,false);
  assert.ok(publishedHtml.includes('Download for Windows (ZIP)'));
  assert.ok(publishedHtml.includes(`href="${published.assets.kit.url}"`));
  assert.doesNotMatch(publishedHtml,/0\.5\.3|local preview/);
  assert.equal(await render(current,null,null,false),'');
  const macOnly={...native,publication:{...native.publication,status:'published'},asset:{...native.asset,url:`https://github.com/codepetca/zero/releases/download/${native.publication.tag}/${native.asset.filename}`}};
  const macOnlyHtml=await render(current,null,macOnly,false);
  assert.match(macOnlyHtml,/Download for Mac Silicon/);
  assert.doesNotMatch(macOnlyHtml,/Download for Windows/);
  const route=await readFile(new URL('../app/download/[asset]/route.ts',import.meta.url),'utf8');
  assert.match(route,/verifiedLocalAsset\([^\n]+asset, release\)/);
  assert.doesNotMatch(route,/publishedKit|downloadableKit/);
  const home=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.equal((home.match(/className="button(?: [^"]+)?"/g)||[]).length,2);
});

test('hosted starter and setup share download-aware guidance rather than packaged version assumptions', async () => {
  const prepare=await readFile(new URL('../scripts/prepare.mjs',import.meta.url),'utf8');
  assert.match(prepare,/setup: "docs\/GETTING-STARTED\.md"/);
  assert.match(prepare,/starter: "docs\/GETTING-STARTED\.md"/);
  const guide=await readFile(new URL('../../docs/GETTING-STARTED.md',import.meta.url),'utf8');
  assert.match(guide,/Zero \.vsix included with your downloaded kit/);
  assert.match(guide,/If your extracted complete kit includes a `setup\/` folder/);
  assert.match(guide,/Use the versioned Zero VSIX included with your/);
});
