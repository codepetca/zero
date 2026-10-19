import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateWindowsPreview, loadWindowsPreview, availableWindowsDownload, windowsManualHref} from '../lib/windows-preview.mjs';
import {validateWindowsInstallerManifest, publishedWindowsFeedResponse} from '../lib/windows-installer.mjs';

const kit = {kitVersion:'0.5.22'};
function preview() {
  const version='0.5.21', filename=`Zero-Setup-${version}-windows-development.exe`;
  return {schema:1,kind:'unsigned-preview',kitVersion:version,sourceRevision:'a'.repeat(40),
    publication:{status:'published',repository:'codepetca/zero',tag:`windows-preview-v${version}`},
    asset:{filename,platform:'windows',architectures:['x64'],minimumOS:'10.0.19041',size:1234,sha256:'b'.repeat(64),
      url:`https://github.com/codepetca/zero/releases/download/windows-preview-v${version}/${filename}`},
    authenticodeSigned:false,updaterEnabled:false,nativeWindowsTested:false};
}

test('unsigned preview requires explicit limitations and an immutable measured asset', () => {
  const valid=preview();
  assert.equal(validateWindowsPreview(valid,kit),valid);
  assert.equal(validateWindowsPreview(null,kit),null);
  for (const mutate of [
    m=>m.schema=2,m=>m.kind='signed',m=>m.kitVersion='0.6.0',m=>m.kitVersion='bad',
    m=>m.sourceRevision='bad',m=>m.publication.status='local',m=>m.publication.repository='other/zero',
    m=>m.publication.tag='windows-v0.5.21',m=>m.authenticodeSigned=true,m=>m.updaterEnabled=true,m=>m.nativeWindowsTested=true,
    m=>m.asset.platform='macos',m=>m.asset.architectures=['arm64'],m=>m.asset.minimumOS='10.0',
    m=>m.asset.filename='Zero.exe',m=>m.asset.size=0,m=>m.asset.size=256*1024*1024+1,m=>m.asset.sha256='bad',
    m=>m.asset.url+='?download=1',m=>m.asset.url='https://other.invalid/setup.exe',
    m=>m.signing={thumbprint:'a'.repeat(40)},m=>m.publication.extra=true,m=>m.asset.extra=true,m=>delete m.updaterEnabled
  ]) {
    const invalid=structuredClone(valid); mutate(invalid);
    assert.throws(()=>validateWindowsPreview(invalid,kit));
  }
  assert.throws(()=>validateWindowsPreview(valid,{kitVersion:'bad'}));
});

test('a future signed release takes precedence; unsigned metadata cannot become a signed installer or feed', () => {
  const unsigned=preview(), signed={asset:{url:'signed'}};
  assert.equal(availableWindowsDownload(signed,unsigned),signed);
  assert.equal(availableWindowsDownload(null,unsigned),unsigned);
  assert.equal(availableWindowsDownload(null,null),null);
  assert.throws(()=>validateWindowsInstallerManifest(unsigned,kit));
  assert.equal(publishedWindowsFeedResponse(null).status,503);
});

test('manual ZIP is measured, immutable and version-matched, and cannot follow a different signed installer', () => {
  const valid=preview();
  valid.manualSetup={filename:'zero-bootstrap.zip',size:321,sha256:'c'.repeat(64),
    url:'https://github.com/codepetca/zero/releases/download/windows-manual-v0.5.21/zero-bootstrap.zip'};
  assert.equal(validateWindowsPreview(valid,kit),valid);
  assert.equal(windowsManualHref(null,valid),valid.manualSetup.url);
  assert.equal(windowsManualHref({kitVersion:'0.5.22'},valid),null);
  assert.equal(windowsManualHref(null,preview()),null);
  assert.equal(windowsManualHref(null,null),null);
  for (const mutate of [
    m=>m.manualSetup=null,m=>m.manualSetup={},m=>m.manualSetup.filename='starter.zip',
    m=>m.manualSetup.size=0,m=>m.manualSetup.size=256*1024*1024+1,m=>m.manualSetup.sha256='bad',
    m=>m.manualSetup.url=m.manualSetup.url.replace('0.5.21','0.5.17'),
    m=>m.manualSetup.url+='?other',m=>m.manualSetup.url='https://other.invalid/kit.zip',
    m=>m.manualSetup.extra=true,m=>delete m.manualSetup.sha256
  ]) {
    const invalid=structuredClone(valid);mutate(invalid);
    assert.throws(()=>validateWindowsPreview(invalid,kit));
  }
});

test('missing preview falls back while malformed authored metadata fails the build', async t => {
  const root=await mkdtemp(join(tmpdir(),'zero-windows-preview-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'release'));
  assert.equal(await loadWindowsPreview(root,kit),null);
  const file=join(root,'release/windows-preview.json');
  await writeFile(file,JSON.stringify(preview()));
  assert.deepEqual(await loadWindowsPreview(root,kit),preview());
  await writeFile(file,'{');
  await assert.rejects(loadWindowsPreview(root,kit));
});
