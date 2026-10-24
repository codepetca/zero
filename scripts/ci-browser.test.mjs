import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureBrowser,normalizeCiJdkTrustStore} from './ci-browser.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,lstatSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
test('warm runner Chrome avoids installation',async()=>{
  let installs=0;
  assert.equal(await ensureBrowser({probe:async()=>{},install:async()=>{installs++;},log:()=>{}}),'reused');assert.equal(installs,0);
});
test('cold or incompatible Chrome installs once then verifies actual launch',async()=>{
  let probes=0,installs=0;
  assert.equal(await ensureBrowser({probe:async()=>{if(++probes===1)throw Error('missing');},install:async()=>{installs++;},log:()=>{}}),'installed');assert.equal(probes,2);assert.equal(installs,1);
});
test('failed install and incompatible fallback both fail the job',async()=>{
  await assert.rejects(ensureBrowser({probe:async()=>{throw Error('missing');},install:async()=>{throw Error('download');},log:()=>{}}),/download/);
  await assert.rejects(ensureBrowser({probe:async()=>{throw Error('incompatible');},install:async()=>{},log:()=>{}}),/incompatible/);
});

function jdkFixture(t) {
  const root=mkdtempSync(path.join(tmpdir(),'zero-ci-jdk-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const jdk=path.join(root,'jdk'),security=path.join(jdk,'lib/security');mkdirSync(security,{recursive:true});
  return {root,jdk,security,file:path.join(security,'cacerts')};
}
test('CI snapshots only the selected linked trust store with byte-identical contents',t=>{
  if(process.platform==='win32')return t.skip('Hosted normalization runs on Linux; local symlink privileges vary.');
  const f=jdkFixture(t),target=path.join(f.root,'shared-cacerts'),bytes=Buffer.from([0,255,1,42,0,128]);
  writeFileSync(target,bytes,{mode:0o640});const before=lstatSync(target);symlinkSync(target,f.file);
  assert.equal(normalizeCiJdkTrustStore(f.jdk),true);assert.equal(lstatSync(f.file).isSymbolicLink(),false);
  assert.ok(readFileSync(f.file).equals(bytes));assert.ok(readFileSync(target).equals(bytes));assert.equal(lstatSync(target).ino,before.ino);assert.equal(lstatSync(f.file).mode&0o777,before.mode&0o777);
  assert.equal(normalizeCiJdkTrustStore(f.jdk),false);assert.deepEqual(readdirSync(f.security),['cacerts']);
});
test('ordinary trust-store files remain untouched and missing files fail closed',t=>{
  const f=jdkFixture(t);assert.throws(()=>normalizeCiJdkTrustStore(f.jdk),/ENOENT/);
  writeFileSync(f.file,'unchanged');const before=lstatSync(f.file);assert.equal(normalizeCiJdkTrustStore(f.jdk),false);
  assert.equal(lstatSync(f.file).ino,before.ino);assert.equal(readFileSync(f.file,'utf8'),'unchanged');
  assert.throws(()=>normalizeCiJdkTrustStore('relative'),/absolute/);
});
test('linked parents are rejected and unrelated JDK links remain unmodified',t=>{
  if(process.platform==='win32')return t.skip('Hosted normalization runs on Linux; local symlink privileges vary.');
  const f=jdkFixture(t);writeFileSync(f.file,'certs');const other=path.join(f.root,'other');writeFileSync(other,'other');symlinkSync(other,path.join(f.security,'unexpected'));
  assert.equal(normalizeCiJdkTrustStore(f.jdk),false);assert.equal(lstatSync(path.join(f.security,'unexpected')).isSymbolicLink(),true);
  rmSync(f.security,{recursive:true});symlinkSync(f.root,f.security,'dir');
  assert.throws(()=>normalizeCiJdkTrustStore(f.jdk),/ordinary directory/);
  assert.equal(readFileSync(other,'utf8'),'other');
});

test('JDK-mutating CLI mode refuses use outside a disposable hosted Linux job',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./ci-browser.mjs',import.meta.url)),'prepare-jdk'],{
    env:{...process.env,GITHUB_ACTIONS:'false',RUNNER_ENVIRONMENT:'self-hosted'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/limited to disposable GitHub-hosted Linux runners/);
});
