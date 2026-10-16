import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, constants, sign} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateWindowsInstallerManifest, windowsInstallerHref, loadWindowsInstaller, validateWindowsUpdateFeed, loadWindowsUpdateFeed, publishedWindowsFeedResponse} from '../lib/windows-installer.mjs';

const kit = {kitVersion:'0.5.20'};
function manifest() {
  const version = '0.5.19', base = `https://github.com/codepetca/zero/releases/download/windows-v${version}/`;
  return {schema:1,kitVersion:version,sourceRevision:'a'.repeat(40),
    publication:{status:'published',repository:'codepetca/zero',tag:`windows-v${version}`},
    asset:{filename:`Zero-Setup-${version}-windows.exe`,platform:'windows',architectures:['x64'],minimumOS:'10.0.19041',size:1234,sha256:'b'.repeat(64),url:`${base}Zero-Setup-${version}-windows.exe`},
    signing:{thumbprint:'C'.repeat(40)},nativeWindowsTested:true,
    updatePackage:{filename:`Zero-${version}-full.nupkg`,size:4567,sha256:'d'.repeat(64),url:`${base}Zero-${version}-full.nupkg`}};
}
const {publicKey,privateKey} = generateKeyPairSync('rsa',{modulusLength:3072});
const jwk = publicKey.export({format:'jwk'});
const config = {schema:1,enabled:true,packageId:'Zero',channel:'win',feedUrl:'https://zero.codepet.ca/updates/windows/stable.json',velopackVersion:'1.2.161',
  publicKeyXml:`<RSAKeyValue><Modulus>${Buffer.from(jwk.n,'base64url').toString('base64')}</Modulus><Exponent>${Buffer.from(jwk.e,'base64url').toString('base64')}</Exponent></RSAKeyValue>`};
function payload(installer = manifest()) {
  const asset = installer.updatePackage;
  return {schema:1,packageId:'Zero',channel:'win',version:installer.kitVersion,fileName:asset.filename,url:asset.url,size:asset.size,sha256:asset.sha256};
}
function envelope(value = payload()) {
  const bytes = Buffer.from(JSON.stringify(value));
  return JSON.stringify({payload:bytes.toString('base64'),signature:sign('sha256',bytes,{key:privateKey,padding:constants.RSA_PKCS1_PADDING}).toString('base64')},null,2)+'\n';
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'zero-windows-web-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'release'));
  const save = (name,value) => writeFile(join(root,'release',name),typeof value === 'string' ? value : JSON.stringify(value));
  return {root,save};
}

test('Windows manifests require exact published, signed and physically accepted release metadata', () => {
  const valid = manifest();
  assert.equal(validateWindowsInstallerManifest(valid,kit),valid);
  assert.equal(windowsInstallerHref(valid),valid.asset.url);
  assert.equal(validateWindowsInstallerManifest(null,kit),null);
  assert.equal(windowsInstallerHref(null),null);
  assert.equal(windowsInstallerHref({...valid,publication:{...valid.publication,status:'local'}}),null);
  for (const mutate of [
    m=>m.schema=2,m=>m.kitVersion='0.5.21',m=>m.kitVersion='0.5.19-beta',m=>m.sourceRevision='bad',
    m=>m.publication.status='local',m=>m.publication.repository='other/zero',m=>m.publication.tag='v0.5.19',
    m=>m.nativeWindowsTested=false,m=>m.signing.thumbprint='bad',m=>m.asset.platform='macos',
    m=>m.asset.architectures=['arm64'],m=>m.asset.minimumOS='10.0',m=>m.asset.filename='Zero.exe',
    m=>m.asset.size=256*1024*1024+1,m=>m.asset.size=0,m=>m.asset.sha256='bad',
    m=>m.asset.url+='?download=1',m=>m.asset.url='https://evil.invalid/Zero.exe',
    m=>m.updatePackage.filename='Zero-latest-full.nupkg',m=>m.updatePackage.sha256='bad',
    m=>m.updatePackage.size=2*1024*1024*1024+1,m=>m.updatePackage.url+='?other',
    m=>m.extra=true,m=>m.publication.extra=true,m=>m.asset.extra=true,m=>m.signing.extra=true,m=>m.updatePackage.extra=true,
    m=>delete m.sourceRevision,m=>delete m.asset.sha256,m=>delete m.signing.thumbprint,m=>delete m.updatePackage
  ]) {
    const invalid = structuredClone(valid); mutate(invalid);
    assert.throws(()=>validateWindowsInstallerManifest(invalid,kit));
  }
  assert.throws(()=>validateWindowsInstallerManifest(valid,{kitVersion:'bad'}));
});

test('feed signature and package metadata bind exact signed payload bytes to installer release', () => {
  const text = envelope();
  assert.equal(validateWindowsUpdateFeed(text,config,manifest(),kit),text);
  for (const mutate of [p=>p.schema=2,p=>p.packageId='Other',p=>p.channel='osx',p=>p.version='0.5.18',
    p=>p.fileName='other.nupkg',p=>p.url+='?feed=evil',p=>p.size++,p=>p.sha256='0'.repeat(64),p=>p.extra=true,p=>delete p.url]) {
    const invalid=payload();mutate(invalid);
    assert.throws(()=>validateWindowsUpdateFeed(envelope(invalid),config,manifest(),kit));
  }
  const changed = JSON.parse(text); changed.payload=Buffer.from(JSON.stringify({...payload(),size:999})).toString('base64');
  assert.throws(()=>validateWindowsUpdateFeed(JSON.stringify(changed),config,manifest(),kit),/signature/);
  for (const mutate of [e=>e.extra=true,e=>delete e.signature,e=>e.signature='AA==',e=>e.payload+='\n',e=>e.payload='']) {
    const invalid=JSON.parse(text);mutate(invalid);
    assert.throws(()=>validateWindowsUpdateFeed(JSON.stringify(invalid),config,manifest(),kit));
  }
  assert.throws(()=>validateWindowsUpdateFeed(text,{...config,enabled:false,publicKeyXml:'',feedUrl:''},manifest(),kit));
  const weak = generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'jwk'});
  const weakXml = `<RSAKeyValue><Modulus>${Buffer.from(weak.n,'base64url').toString('base64')}</Modulus><Exponent>${Buffer.from(weak.e,'base64url').toString('base64')}</Exponent></RSAKeyValue>`;
  assert.throws(()=>validateWindowsUpdateFeed(text,{...config,publicKeyXml:weakXml},manifest(),kit),/3072/);
  assert.throws(()=>validateWindowsUpdateFeed(text,config,null,kit));
  assert.throws(()=>validateWindowsUpdateFeed(text,config,{...manifest(),nativeWindowsTested:false},kit));
  assert.throws(()=>validateWindowsUpdateFeed(' '.repeat(65537),config,manifest(),kit));
});

test('absent optional files remain unavailable; configured malformed or unpublished feeds fail preparation', async t => {
  const f = await fixture(t);
  assert.equal(await loadWindowsInstaller(f.root,kit),null);
  assert.equal(await loadWindowsUpdateFeed(f.root,kit,null),null);
  await f.save('windows-installer.json',manifest());
  const installer = await loadWindowsInstaller(f.root,kit);
  await f.save('windows-updater.json',config);
  await f.save('windows-update-feed.json',envelope());
  assert.equal(await loadWindowsUpdateFeed(f.root,kit,installer),envelope());
  await assert.rejects(loadWindowsUpdateFeed(f.root,kit,null));
  await f.save('windows-updater.json',{...config,enabled:false,publicKeyXml:'',feedUrl:''});
  await assert.rejects(loadWindowsUpdateFeed(f.root,kit,installer));
  await f.save('windows-installer.json',{...manifest(),publication:{...manifest().publication,status:'local'}});
  await assert.rejects(loadWindowsInstaller(f.root,kit));
  await f.save('windows-installer.json','{');
  await assert.rejects(loadWindowsInstaller(f.root,kit));
});

test('Windows route serves exact verified envelope bytes or explicit temporary unavailability', async () => {
  const unavailable = publishedWindowsFeedResponse(null);
  assert.equal(unavailable.status,503);
  assert.equal(unavailable.headers.get('Retry-After'),'3600');
  assert.equal(unavailable.headers.get('Cache-Control'),'no-store');
  const text = envelope(), response = publishedWindowsFeedResponse(text);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Content-Type'),'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'),'public, max-age=300');
  assert.equal(await response.text(),text);
});

test('website wiring keeps existing Mac and manual Windows ZIP fallback while Windows is unpublished', async () => {
  const root = new URL('../../',import.meta.url);
  assert.equal(await loadWindowsInstaller(root.pathname,kit),null);
  const downloads = await readFile(new URL('../components/Downloads.jsx',import.meta.url),'utf8');
  assert.match(downloads,/!windows && kit/);
  assert.match(downloads,/Download for Windows \(ZIP\)/);
  assert.match(downloads,/Download for Mac Silicon/);
  const route = await readFile(new URL('../app/updates/windows/stable.json/route.ts',import.meta.url),'utf8');
  assert.match(route,/dynamic = 'force-static'/);
  assert.match(route,/publishedWindowsFeedResponse\(snapshot.windowsUpdateFeed\)/);
});
