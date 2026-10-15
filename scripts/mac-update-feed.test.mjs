import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createAppcast,hash,verifyFeedSignature,validateMacUpdateFeed,verifyUpdateArchive,publishedFeedResponse,verifyUpdateBuildOrder} from './mac-update-feed.mjs';
import {sparklePin,updaterFeedURL} from './mac-updater.mjs';

function fixture() {
  const keys=generateKeyPairSync('ed25519'), bytes=Buffer.from('signed fixture DMG');
  const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  const config={schema:1,buildNumber:2,feedURL:updaterFeedURL,publicKey,sparkle:{...sparklePin}};
  const asset={filename:'Zero-0.5.15-macos.dmg',url:'https://github.com/codepetca/zero/releases/download/setup-v0.5.15/Zero-0.5.15-macos.dmg',size:bytes.length,sha256:hash(bytes),edSignature:sign(null,bytes,keys.privateKey).toString('base64')};
  const installer={kitVersion:'0.5.15',sourceRevision:'a'.repeat(40),publication:{status:'published'},asset};
  const manifest={schema:1,publication:{status:'published'},kitVersion:installer.kitVersion,buildNumber:2,feedURL:updaterFeedURL,publicKeySha256:hash(Buffer.from(publicKey,'base64')),sourceRevision:installer.sourceRevision,createdAt:'2026-10-15T01:00:00.000Z',asset};
  const payload=Buffer.from(createAppcast(manifest));
  const feed=Buffer.concat([payload,Buffer.from(`<!-- sparkle-signatures:\nedSignature: ${sign(null,payload,keys.privateKey).toString('base64')}\nlength: ${payload.length}\n-->\n`)]);
  manifest.feed={filename:'appcast.xml',size:feed.length,sha256:hash(feed)};
  return {keys,bytes,config,installer,manifest,feed};
}
test('signed feed and enclosure bind exact public installer, key, version, build and bytes',()=>{
  const f=fixture();
  assert.equal(validateMacUpdateFeed(f.manifest,f.config,f.installer,f.feed),f.manifest);
  verifyUpdateArchive(f.bytes,f.manifest,f.config);
  for(const mutate of [m=>m.buildNumber=3,m=>m.sourceRevision='b'.repeat(40),m=>m.kitVersion='0.5.16',m=>m.feedURL='https://evil.test/feed',m=>m.publicKeySha256='0'.repeat(64),m=>m.extra=true,m=>m.asset.url='https://evil.test/file',m=>m.asset.size++,m=>m.asset.sha256='0'.repeat(64),m=>m.feed.sha256='0'.repeat(64),m=>m.feed.size++]) {
    const bad=structuredClone(f.manifest);mutate(bad);assert.throws(()=>validateMacUpdateFeed(bad,f.config,f.installer,f.feed));
  }
  assert.throws(()=>verifyUpdateArchive(Buffer.from('modified fixture'),f.manifest,f.config));
  const other=fixture();assert.throws(()=>verifyFeedSignature(f.feed,other.config.publicKey),/signature/);
});
test('feed tampering, unsigned suffixes, unsigned feeds and signed contradictory claims are rejected',()=>{
  const f=fixture();
  for(const bytes of [Buffer.from(createAppcast(f.manifest)),Buffer.from(f.feed.toString().replace('Zero updates','Fake updates')),Buffer.concat([f.feed,Buffer.from('extra')]),Buffer.from(f.feed.toString().replace(/length: \d+/,'length: 1'))]) assert.throws(()=>verifyFeedSignature(bytes,f.config.publicKey));
  const bad=structuredClone(f.manifest);bad.asset.edSignature=Buffer.alloc(64,1).toString('base64');
  // The metadata is modified while the feed retains a valid signature.
  assert.throws(()=>validateMacUpdateFeed(bad,f.config,f.installer,f.feed),/claims|differ/);
});
test('local metadata is never public; public response preserves exact signed bytes and cache policy',async()=>{
  const f=fixture(),local=structuredClone(f.manifest);local.publication.status='local';
  const installer=structuredClone(f.installer);installer.publication.status='local';delete installer.asset.url;
  assert.throws(()=>validateMacUpdateFeed(local,f.config,installer,f.feed),/Unpublished/);
  validateMacUpdateFeed(local,f.config,installer,f.feed,{allowLocal:true});
  assert.equal(publishedFeedResponse(null).status,404);
  const response=publishedFeedResponse(f.feed.toString());
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),String(f.feed.length));
  assert.match(response.headers.get('Cache-Control'),/must-revalidate/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.feed);
});
test('native releases advance immutable kit identity and build order together; a later local build keeps the previous public feed valid',()=>{
  const f=fixture();verifyUpdateBuildOrder(f.config,'0.5.15',undefined);
  verifyUpdateBuildOrder(f.config,'0.5.15',f.manifest);
  const next={...f.config,buildNumber:3};verifyUpdateBuildOrder(next,'0.5.16',f.manifest);
  validateMacUpdateFeed(f.manifest,next,f.installer,f.feed);
  assert.throws(()=>verifyUpdateBuildOrder(f.config,'0.5.16',f.manifest),/increase/);
  assert.throws(()=>verifyUpdateBuildOrder(next,'0.5.15',f.manifest),/immutable/);
  assert.throws(()=>verifyUpdateBuildOrder(next,'0.5.14',f.manifest),/advance/);
});
test('official pinned Sparkle signer produces a feed accepted by independent public-key verifier',{skip:process.platform!=='darwin' || !existsSync(new URL('../.verification/sparkle-2.10.0/bin/sign_update',import.meta.url))},()=>{
  const f=fixture(),root=mkdtempSync(join(tmpdir(),'zero-feed-test-'));
  try {
    const key=join(root,'fixture.key'),file=join(root,'appcast.xml');
    writeFileSync(key,f.keys.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64'),{mode:0o600});
    writeFileSync(file,createAppcast(f.manifest));
    const result=spawnSync(new URL('../.verification/sparkle-2.10.0/bin/sign_update',import.meta.url).pathname,['--ed-key-file',key,file],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr);
    const bytes=readFileSync(file);f.manifest.feed={filename:'appcast.xml',size:bytes.length,sha256:hash(bytes)};
    validateMacUpdateFeed(f.manifest,f.config,f.installer,bytes);
  } finally {rmSync(root,{recursive:true,force:true});}
});
