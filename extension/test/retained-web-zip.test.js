'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {deflateRawSync}=require('node:zlib');
const {crc32,zipFiles}=require('../src/web-export/zip');
const {inspectRetainedZip}=require('../src/retained-web-zip');
const {relative,validateRetainedExport}=require('../src/retained-web-export');
const sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
function archive(files,{level=0,method=8}={}){
 const local=[],central=[];let offset=0;
 for(const file of files){
  const name=Buffer.from(file.path),data=method===0?file.bytes:deflateRawSync(file.bytes,{level}),size=file.declaredSize??file.bytes.length,crc=file.declaredCrc??crc32(file.bytes);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(method,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(size,22);h.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(size,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  local.push(h,name,data);central.push(c,name);offset+=h.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
const files=[{path:'index.html',bytes:Buffer.from('<h1>Old game</h1>'.repeat(100))},{path:'player sprite é.png',bytes:Buffer.from('pixels')}];
const options={safePath:relative};
test('retained ZIP accepts equivalent entries with historical compression and stored data',()=>{
 const original=zipFiles(files),alternate=archive(files);assert.notDeepEqual(original,alternate);
 for(const zip of [original,alternate,archive(files,{level:9}),archive(files,{method:0})])assert.deepEqual(inspectRetainedZip(zip,files,options),{files:2,totalBytes:files.reduce((n,f)=>n+f.bytes.length,0)});
});
test('retained site validation and ZIP saving preserve alternate compressed bytes exactly',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-retained-zip-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const output=path.join(root,'.zero/web-export'),site=path.join(output,'site');await fs.mkdir(site,{recursive:true});
 const contents=[...files,{path:'zero_web.nocache.js',bytes:Buffer.from('loader')},{path:'ABC.cache.js',bytes:Buffer.from('runtime')}];for(const file of contents)await fs.writeFile(path.join(site,file.path),file.bytes);
 const zip=archive(contents),manifest={schemaVersion:1,buildId:'historical',compatibility:{status:'passed'},sourceHash:'a'.repeat(64),profileHash:'b'.repeat(64),sitePath:'/old/.zero/web-export/site',zipPath:'/old/.zero/web-export/web-export.zip',files:contents.map(file=>({path:file.path,bytes:file.bytes.length,sha256:sha(file.bytes)})),totalBytes:contents.reduce((n,f)=>n+f.bytes.length,0)};
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(output,'web-export.zip'),zip);const validated=await validateRetainedExport({projectRoot:root});assert.deepEqual(validated.zipBytes,zip);assert.notDeepEqual(zip,zipFiles(contents));
});
test('retained ZIP rejects corrupt CRC, payloads, truncation, trailing data and mismatched headers',()=>{
 const corruptCrc=archive(files.map((file,index)=>index?file:{...file,declaredCrc:crc32(file.bytes)^1}));assert.throws(()=>inspectRetainedZip(corruptCrc,files,options),/invalid ZIP/);
 const corruptPayload=archive(files);corruptPayload[30+Buffer.byteLength(files[0].path)+5]^=0xff;assert.throws(()=>inspectRetainedZip(corruptPayload,files,options),/invalid ZIP/);
 const mismatched=archive(files);mismatched.writeUInt32LE(7,22);assert.throws(()=>inspectRetainedZip(mismatched,files,options),/invalid ZIP/);
 for(const value of [archive(files).subarray(0,-1),Buffer.concat([archive(files),Buffer.from('trailing')])])assert.throws(()=>inspectRetainedZip(value,files,options),/invalid ZIP/);
});
test('retained ZIP rejects traversal, duplicate/case-colliding entries, symlinks and overlapping entries',()=>{
 for(const name of ['../escape','/escape','C:/escape','a\\b','a/../b']){const unsafe=[{path:name,bytes:Buffer.from('x')}];assert.throws(()=>inspectRetainedZip(archive(unsafe),unsafe,options),/invalid ZIP/);}
 assert.throws(()=>inspectRetainedZip(archive([files[0],files[0]]),files,options),/invalid ZIP/);
 const caseFiles=[files[0],{path:'INDEX.html',bytes:Buffer.from('x')}];assert.throws(()=>inspectRetainedZip(archive(caseFiles),caseFiles,options),/invalid ZIP/);
 const symlink=archive(files),central=symlink.readUInt32LE(symlink.length-6);symlink.writeUInt32LE((0o120777<<16)>>>0,central+38);assert.throws(()=>inspectRetainedZip(symlink,files,options),/invalid ZIP/);
 const overlap=archive(files),first=overlap.readUInt32LE(overlap.length-6),second=first+46+Buffer.byteLength(files[0].path);overlap.writeUInt32LE(0,second+42);assert.throws(()=>inspectRetainedZip(overlap,files,options),/invalid ZIP/);
});
test('retained ZIP bounds file counts, declared output and actual inflation before accepting data',()=>{
 assert.throws(()=>inspectRetainedZip(archive(files),files,{...options,maxFiles:1}),/invalid ZIP/);
 assert.throws(()=>inspectRetainedZip(archive(files),files,{...options,maxBytes:32}),/invalid ZIP/);
 const expected=[{path:'bomb.txt',bytes:Buffer.from('x')}],bomb=archive([{path:'bomb.txt',bytes:Buffer.alloc(1024*1024,65),declaredSize:1}],{level:9});assert.throws(()=>inspectRetainedZip(bomb,expected,options),/invalid ZIP/);
});
