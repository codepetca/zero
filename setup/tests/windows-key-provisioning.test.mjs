import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,statSync,chmodSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {provisionWindowsUpdater,WINDOWS_FEED_URL} from '../../scripts/provision-windows-updater.mjs';
import {readWindowsUpdaterConfig} from '../../scripts/windows-updater.mjs';

function fixture() {
  const outer=realpathSync(mkdtempSync(path.join(tmpdir(),'zero-updater-key-'))),root=path.join(outer,'repo'),privateDirectory=path.join(outer,'private');
  mkdirSync(path.join(root,'release'),{recursive:true});
  const initial={schema:1,enabled:false,packageId:'Zero',channel:'win',feedUrl:'',publicKeyXml:'',velopackVersion:'1.2.161'};
  writeFileSync(path.join(root,'release/windows-updater.json'),JSON.stringify(initial));
  return {outer,root,keyFile:path.join(privateDirectory,'update.pem'),cleanup(){rmSync(outer,{recursive:true,force:true});}};
}
const posix={skip:process.platform==='win32' ? 'Private POSIX key provisioning runs on maintainer Mac/Linux; signing consumes an existing protected key on Windows.' : false};
test('explicit feed-key provisioning keeps private key outside Git and safely reuses exact trust',posix,()=>{
  const f=fixture();try {
    const first=provisionWindowsUpdater(f),key=readFileSync(f.keyFile),config=readWindowsUpdaterConfig(f.root,{production:true});
    assert.equal(first.created,true);assert.equal(config.feedUrl,WINDOWS_FEED_URL);assert.match(first.publicKeySha256,/^[a-f0-9]{64}$/);
    assert.equal(statSync(f.keyFile).mode & 0o777,0o600);assert.equal(statSync(path.dirname(f.keyFile)).mode & 0o777,0o700);
    assert.ok(!config.publicKeyXml.includes('PRIVATE'));assert.ok(!JSON.stringify(first).includes('PRIVATE'));
    assert.equal(provisionWindowsUpdater(f).created,false);assert.deepEqual(readFileSync(f.keyFile),key);
    rmSync(f.keyFile);assert.throws(()=>provisionWindowsUpdater(f),/restore that key/);
  } finally {f.cleanup();}
});
test('feed-key provisioning refuses repository paths and publicly readable keys',posix,()=>{
  const f=fixture();try {
    assert.throws(()=>provisionWindowsUpdater({...f,keyFile:path.join(f.root,'key.pem')}),/outside the repository/);
    provisionWindowsUpdater(f);chmodSync(f.keyFile,0o644);assert.throws(()=>provisionWindowsUpdater(f),/private, single-link/);
  } finally {f.cleanup();}
});
test('feed-key provisioning refuses symlink destinations and implicit key rotation',posix,()=>{
  const f=fixture(),other=fixture();try {
    provisionWindowsUpdater(f);provisionWindowsUpdater(other);
    writeFileSync(f.keyFile,readFileSync(other.keyFile));assert.throws(()=>provisionWindowsUpdater(f),/differs from the trusted key/);
    rmSync(f.keyFile);symlinkSync(other.keyFile,f.keyFile);assert.throws(()=>provisionWindowsUpdater(f));
  } finally {f.cleanup();other.cleanup();}
});
