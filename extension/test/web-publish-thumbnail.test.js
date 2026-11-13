'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const thumbnails=require('../src/web-publish-thumbnail');
const {pack,decode}=require('../src/web-publish-bundle');

const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value>>>1^(value&1?0xedb88320:0);return value>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crc>>>8^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;};
function chunk(type,data) {
  const body=Buffer.concat([Buffer.from(type,'latin1'),data]),out=Buffer.alloc(body.length+8);
  out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc32(body),body.length+4);return out;
}
function png(width,height=width) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const rows=Buffer.alloc((width*3+1)*height);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
async function repository(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-thumbnail-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const run=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','user.name=t','-c','user.email=t@example.invalid',...args],{cwd:root,encoding:'utf8'}).trim();
  run('init','-q','-b','main');
  const git=async(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8'});
  const commit=async files=>{for(const [name,bytes] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}run('add','-A');run('commit','-q','--allow-empty','-m','x');return run('rev-parse','HEAD');};
  return {root,git,commit};
}

test('thumbnail rules accept square PNGs from 128 to 2048 pixels up to 1 MB',()=>{
  assert.equal(thumbnails.checkThumbnail(png(128)).valid,true);
  assert.equal(thumbnails.checkThumbnail(png(512)).size,512);
  for(const bytes of [png(127),png(256,255),Buffer.from('not a png'),Buffer.alloc(thumbnails.MAX_BYTES+1)])assert.equal(thumbnails.checkThumbnail(bytes).valid,false);
});

test('a committed valid zerohub/thumbnail.png is published; missing, invalid and uncommitted images are not',async t=>{
  const r=await repository(t);
  let sha=await r.commit({'README.md':'x'});
  assert.deepEqual(await thumbnails.committedThumbnail({projectRoot:r.root,sourceSha:sha,git:r.git}),{status:'missing'});
  sha=await r.commit({'zerohub/thumbnail.png':png(256)});
  const valid=await thumbnails.committedThumbnail({projectRoot:r.root,sourceSha:sha,git:r.git});
  assert.equal(valid.status,'valid');assert.deepEqual(valid.bytes,png(256));
  assert.equal(thumbnails.thumbnailNote(valid),'ZeroHub will show zerohub/thumbnail.png.');
  await fs.writeFile(path.join(r.root,'zerohub/thumbnail.png'),png(300));
  const changed=await thumbnails.committedThumbnail({projectRoot:r.root,sourceSha:sha,git:r.git});
  assert.equal(changed.status,'invalid');assert.match(changed.message,/differs from the uploaded commit/);
  sha=await r.commit({'zerohub/thumbnail.png':png(256,200)});
  const wrong=await thumbnails.committedThumbnail({projectRoot:r.root,sourceSha:sha,git:r.git});
  assert.equal(wrong.status,'invalid');assert.match(thumbnails.thumbnailNote(wrong),/must be a square PNG.*default pattern/);
});

test('a valid thumbnail travels in the publish bundle as zero-thumbnail.png and never replaces a game file',async()=>{
  const index=Buffer.from('<!doctype html>'),script=Buffer.from('1'),licenses=Buffer.from('[]');
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const site=[['index.html',index],['app.js',script],['licenses/source-artifacts.json',licenses]];
  const validated={sourceHash:'a'.repeat(64),profileHash:'b'.repeat(64),manifest:{files:site.map(([p,b])=>({path:p,bytes:b.length,sha256:sha(b)}))},siteFiles:site.map(([p,b])=>({path:p,bytes:b}))};
  const image=png(256),thumbnail={status:'valid',bytes:image};
  const bundle=await pack({projectRoot:'/x',sourceSha:'c'.repeat(40),validateExport:async()=>thumbnails.withThumbnail(validated,thumbnail)});
  const {files}=decode(bundle.bytes,{sourceSha:'c'.repeat(40),digest:bundle.digest});
  assert.deepEqual(files.find(file=>file.path==='zero-thumbnail.png').bytes,image);
  assert.equal(thumbnails.withThumbnail(validated,{status:'invalid'}),validated);
  const owned={...validated,manifest:{files:[...validated.manifest.files,{path:'zero-thumbnail.png',bytes:1,sha256:sha(Buffer.from('x'))}]},siteFiles:[...validated.siteFiles,{path:'zero-thumbnail.png',bytes:Buffer.from('x')}]};
  assert.equal(thumbnails.withThumbnail(owned,thumbnail),owned);
});
