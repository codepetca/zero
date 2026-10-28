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
  assert.equal(fallback.kitVersion, '0.5.55');
  for (const [key, size, sha256, filename] of [
    ['kit',4722808,'ed74aafe3f562db175970779f2bf415e6ccc2e9c4ad89c21ab0620aa062f3f69','zero-bootstrap.zip'],
    ['starter',2818867,'a40a4b718afd6dc577de82cee1af102d53e9fe66c949cc15f3901c1e60c0a090','zero-starter.zip'],
    ['extension',1892099,'1653e98c6ce1059747ec9372551256968af57788611f2778c4a074753f875a96','zero-0.5.55.vsix']]) {
    assert.equal(fallback.assets[key].filename,filename);
    assert.equal(fallback.assets[key].size,size);
    assert.equal(fallback.assets[key].sha256,sha256);
    assert.equal(releaseAssetHref(fallback,key),`https://github.com/codepetca/zero/releases/download/v0.5.55/${filename}`);
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
  assert.equal((html.match(/<a class="button /g)||[]).length,2);
  assert.doesNotMatch(html,/href="\/(privacy|terms)"|download-legal/);
  assert.doesNotMatch(html,/<h[1-6][ >]|<details[ >]|<summary[ >]/);
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
  // Immutable download URLs contain versions; visible button labels stay plain.
  assert.doesNotMatch(publishedHtml.replace(/href="[^"]*"/g,''),/\b\d+\.\d+\.\d+\b|local preview/);
  assert.equal(await render(current,null,null,false),'');
  const macOnly={...native,publication:{...native.publication,status:'published'},asset:{...native.asset,url:`https://github.com/codepetca/zero/releases/download/${native.publication.tag}/${native.asset.filename}`}};
  const macOnlyHtml=await render(current,null,macOnly,false);
  assert.match(macOnlyHtml,/Download for Mac Silicon/);
  assert.doesNotMatch(macOnlyHtml,/Download for Windows/);
  const route=await readFile(new URL('../app/download/[asset]/route.ts',import.meta.url),'utf8');
  assert.match(route,/verifiedLocalAsset\([^\n]+asset, release\)/);
  assert.doesNotMatch(route,/publishedKit|downloadableKit/);
});

test('hosted starter and setup share download-aware guidance rather than packaged version assumptions', async () => {
  const prepare=await readFile(new URL('../scripts/prepare.mjs',import.meta.url),'utf8');
  assert.match(prepare,/setup: "docs\/GETTING-STARTED\.md"/);
  assert.match(prepare,/starter: "docs\/GETTING-STARTED\.md"/);
  const guide=await readFile(new URL('../../docs/GETTING-STARTED.md',import.meta.url),'utf8');
  assert.match(guide,/Zero \.vsix included with your downloaded kit/);
  assert.match(guide,/If your extracted complete kit includes a `setup\/` folder/);
  assert.match(guide,/Use the versioned Zero VSIX included with your/);
  assert.match(guide,/Start Page → Project → Clone/);
  assert.match(guide,/\*\*Clone location\*\*.*`~\/Zero Projects`/s);
  assert.match(guide,/choose \*\*Clone here\*\*/);
  assert.match(guide,/Start Page → Project → Open/);
  assert.match(guide,/VS Code 1\.95 fallback/);
  assert.match(guide,/⋯ → Troubleshooting → Test installation/);
  assert.doesNotMatch(guide,/Setup help|Project → (?:Resume created project|Create a repository|Connect to GitHub)/);
  assert.match(guide,/⋯ → Repository Actions → Connect to GitHub…/);
  assert.doesNotMatch(guide,/Clone repository|Connect a repository|Connect GitHub/);
});

test('verified Windows installer replaces manual ZIP as the primary Windows download', async () => {
  const url='https://github.com/codepetca/zero/releases/download/windows-v0.5.18/Zero-Setup-0.5.18-windows.exe';
  const html=await render(current,fallback,null,false,url);
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html,/Download for Windows<\/a>/);
  assert.doesNotMatch(html,/Windows \(ZIP\)|zero-bootstrap.zip/);
});

test('unsigned Windows download is explicit before clicking and setup help states its limits', async () => {
  const url='https://github.com/codepetca/zero/releases/download/windows-preview-v0.5.21/Zero-Setup-0.5.21-windows-development.exe';
  const html=await render(current,fallback,null,false,url,null,true);
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html,/Download for Windows \(unsigned\)<\/a>/);
  assert.doesNotMatch(html,/windows-unsigned-note|Windows may show a security warning/);
  assert.doesNotMatch(html,/Windows \(ZIP\)|zero-bootstrap.zip/);
  const help=await render(current,fallback,null,false,url,null,true,true);
  assert.match(help,/Windows 0\.5\.21: x64, Windows 10 \(build 19041\) or later/);
  assert.match(help,/automatic updates are off/);
  assert.match(help,/Interactive Windows testing is pending/);
  const signed=await render(current,fallback,null,false,url);
  assert.doesNotMatch(signed,/unsigned|security warning|windows-unsigned-note/);
});

test('matching manual ZIP is a secondary action grouped with the Windows installer', async () => {
  const installer='https://github.com/codepetca/zero/releases/download/windows-preview-v0.5.21/Zero-Setup-0.5.21-windows-development.exe';
  const manual='https://github.com/codepetca/zero/releases/download/windows-manual-v0.5.21/zero-bootstrap.zip';
  const html=await render(current,fallback,null,false,installer,null,true,false,manual);
  assert.match(html,/class="windows-download">.*Download for Windows \(unsigned\)<\/a><a class="manual-download"/);
  assert.ok(html.includes(`href="${manual}">Manual setup (ZIP)</a>`));
  assert.equal((html.match(/Manual setup \(ZIP\)/g)||[]).length,1);
  assert.doesNotMatch(html,/Windows \(ZIP\)/);
  const noInstaller=await render(current,fallback,null,false,null,null,false,false,manual);
  assert.doesNotMatch(noInstaller,/Manual setup \(ZIP\)/);
  assert.match(noInstaller,/Download for Windows \(ZIP\)/);
});


test('a staged Mac candidate preserves both published platform choices without preview labels', async () => {
  const publishedNative = JSON.parse(await readFile(new URL('../../release/published-installer.json', import.meta.url)));
  for (const env of [{}, {ZERO_LOCAL_DOWNLOADS:'1', VERCEL:'1'}]) {
    const html = await render(current, fallback, native, localDownloadsAllowed(env), null, publishedNative);
    assert.ok(html.includes(`href="${publishedNative.asset.url}"`));
    assert.ok(html.includes(`href="${fallback.assets.kit.url}"`));
    assert.match(html, /Download for Mac Silicon<\/a>/);
    assert.match(html, /Download for Windows \(ZIP\)<\/a>/);
    assert.equal((html.match(/<a class="button /g)||[]).length, 2);
    assert.doesNotMatch(html, /href="\/(privacy|terms)"/);
    assert.doesNotMatch(html, /local preview|href="\/download\//);
  }
  const local = await render(current, fallback, native, true, null, publishedNative);
  assert.match(local, /href="\/download\/installer"/);
  assert.match(local, /Download for Mac Silicon \(local preview\)/);
  assert.ok(!local.includes(publishedNative.asset.url));
});
