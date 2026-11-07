import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { availableKitRelease, releaseAssetHref, validateManifest, validatePublishedKit } from '../lib/contracts.mjs';
import { installerHref, landingDownloadHref, localDownloadsAllowed } from '../lib/installer.mjs';
import { availableInstaller } from '../lib/published-installer.mjs';
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
async function render(release, publishedKit, currentInstaller, local, windows = null, publishedInstaller = null, unsigned = false, requirements = false, manual = null) {
  const installer = availableInstaller(currentInstaller, publishedInstaller, local);
  const kit = availableKitRelease(release, publishedKit, local);
  const values = {release, installer, kit, mac:installerHref(installer, local), windows, unsigned, manual};
  const fixture = source.replace(/^import .*;\n/gm, '')
    .replace('export function Downloads()', `const {release, installer:availableNative, kit:available, mac:macHref, windows:windowsHref, unsigned, manual} = ${JSON.stringify(values)};
const DownloadIcon = () => null;
const downloadableKit = () => available;
const downloadableInstaller = () => availableNative;
const macDownloadHref = () => macHref;
const windowsDownloadHref = () => windowsHref;
const windowsDownloadIsUnsigned = () => unsigned;
const windowsManualDownloadHref = () => manual;
const downloadableWindowsInstaller = () => windowsHref ? {kitVersion:'0.5.21'} : null;
const downloadHref = (key = 'kit') => available?.publication.status === 'published' ? available.assets[key].url : '/download/' + key;
export function Downloads()`);
  const js = ts.transpileModule(fixture, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX, module:ts.ModuleKind.ESNext}}).outputText
    .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
  const {Downloads, DownloadRequirements} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return renderToStaticMarkup(createElement(requirements ? DownloadRequirements : Downloads));
}
test('fallback preserves exact published versions, filenames, digests and explicit URLs', () => {
  validateManifest(current);
  assert.equal(validatePublishedKit(fallback, current), fallback);
  assert.equal(fallback.kitVersion, '0.5.64');
  for (const [key, size, sha256, filename] of [
    ['kit',4704383,'642a4000962b0d1ae9172adcc9590db8d86ce31382c530cfbaa1adcc1f9bac59','zero-bootstrap.zip'],
    ['starter',2774435,'8429159c00106a7c78b424fbca9ca5adabe22390a757bb9159685261231bce04','zero-starter.zip'],
    ['extension',1914767,'6887e6029e6caed677b12e94a36f8dba8e91bd394aaea25089c1739ba460d86f','zero-0.5.64.vsix']]) {
    assert.equal(fallback.assets[key].filename,filename);
    assert.equal(fallback.assets[key].size,size);
    assert.equal(fallback.assets[key].sha256,sha256);
    assert.equal(releaseAssetHref(fallback,key),`https://github.com/codepetca/zero/releases/download/v0.5.64/${filename}`);
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
test('downloads offer the Microsoft Store listing and Mac download', async () => {
  const publishedNative={...native,publication:{...native.publication,status:'published'},asset:{...native.asset,url:`https://github.com/codepetca/zero/releases/download/${native.publication.tag}/${native.asset.filename}`}};
  const html=await render(current,fallback,publishedNative,false);
  assert.ok(html.includes(`href="${publishedNative.asset.url}"`));
  assert.match(html,/Get Zero for Mac Silicon<\/a>/);
  assert.match(html,/href="https:\/\/apps\.microsoft\.com\/detail\/9mxkd6dqlfgx"/);
  assert.match(html,/Get Zero for Windows<\/a>/);
  assert.doesNotMatch(html,/Manual setup \(ZIP\)/);
  assert.equal((html.match(/<a class="button /g)||[]).length,2);
  assert.doesNotMatch(html,/Download for Windows \(unsigned\)|href="\/(privacy|terms)"|download-legal/);
  assert.equal(landingDownloadHref(fallback.assets.kit.url,publishedNative),'/downloads');
});
test('Store link is available independently of local or published kit', async () => {
  const local=await render(current,fallback,native,true);
  assert.match(local,/Get Zero for Mac Silicon \(local preview\)/);
  assert.doesNotMatch(local,/Manual setup \(ZIP\)/);
  const withoutKit=await render(current,null,null,false);
  assert.match(withoutKit,/Get Zero for Windows<\/a>/);
  assert.doesNotMatch(withoutKit,/Manual setup \(ZIP\)|Download for Mac/);
  const route=await readFile(new URL('../app/download/[asset]/route.ts',import.meta.url),'utf8');
  assert.match(route,/verifiedLocalAsset\([^\n]+asset, release\)/);
  assert.doesNotMatch(route,/publishedKit|downloadableKit/);
});

test('hosted starter and setup share download-aware guidance rather than packaged version assumptions', async () => {
  const prepare=await readFile(new URL('../scripts/prepare.mjs',import.meta.url),'utf8');
  assert.match(prepare,/setup: "docs\/GETTING-STARTED\.md"/);
  assert.match(prepare,/starter: "docs\/GETTING-STARTED\.md"/);
  const guide=await readFile(new URL('../../docs/GETTING-STARTED.md',import.meta.url),'utf8');
  assert.match(guide,/\[downloads page\]\(https:\/\/zero\.codepet\.ca\/downloads\)/);
  assert.match(guide,/\*\*Zero Docs\*\*/);
  assert.match(guide,/\*\*Project → New\*\*/);
  assert.match(guide,/\*\*Project → Open\*\*/);
  assert.match(guide,/\*\*Project → Clone\*\*/);
  assert.match(guide,/\[Lesson 0: Back to Zero\]\(https:\/\/zero\.codepet\.ca\/tutorials\/15\)/);
  assert.match(guide,/\*\*Troubleshooting → Test installation\*\*/);
  assert.doesNotMatch(guide,/\b\d+\.\d+\.\d+\b/);
});

test('Windows requirements describe Store installation without the unsigned preview warning', async () => {
  const help=await render(current,fallback,null,false,null,null,false,true);
  assert.match(help,/Windows: x64, Windows 10 \(build 19041\) or later/);
  assert.match(help,/Install Zero from Microsoft Store/);
  assert.doesNotMatch(help,/Unsigned preview|automatic updates are off/);
});
test('a staged Mac candidate preserves both published platform choices without preview labels', async () => {
  const publishedNative = JSON.parse(await readFile(new URL('../../release/published-installer.json', import.meta.url)));
  for (const env of [{}, {ZERO_LOCAL_DOWNLOADS:'1', VERCEL:'1'}]) {
    const html = await render(current, fallback, native, localDownloadsAllowed(env), null, publishedNative);
    assert.ok(html.includes(`href="${publishedNative.asset.url}"`));
    assert.doesNotMatch(html,/Manual setup \(ZIP\)/);
    assert.match(html, /Get Zero for Mac Silicon<\/a>/);
    assert.match(html, /Get Zero for Windows<\/a>/);
    assert.equal((html.match(/<a class="button /g)||[]).length, 2);
    assert.doesNotMatch(html, /href="\/(privacy|terms)"/);
    assert.doesNotMatch(html, /local preview|href="\/download\//);
  }
  const local = await render(current, fallback, native, true, null, publishedNative);
  assert.match(local, /href="\/download\/installer"/);
  assert.match(local, /Get Zero for Mac Silicon \(local preview\)/);
  assert.ok(!local.includes(publishedNative.asset.url));
});
