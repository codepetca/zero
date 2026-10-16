'use strict';
// A data-only archive. Extraction never invokes files from the app.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const MAX_BYTES=128*1024*1024, MAX_JSON=192*1024*1024, MAX_FILES=20000;
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const safePath=name=>typeof name==='string' && name.length<1024 && !name.startsWith('/') && !name.split('/').some(p=>!p || p==='.' || p==='..' || /[\\\x00-\x1f:]/.test(p));
function validBase64(value) {
  if(typeof value!=='string'||value.length%4!==0)return false;
  let end=value.length;
  if(end&&value.charCodeAt(end-1)===61)end--;
  if(end&&value.charCodeAt(end-1)===61)end--;
  for(let index=0;index<end;index++) {
    const code=value.charCodeAt(index);
    if(!((code>=65&&code<=90)||(code>=97&&code<=122)||(code>=48&&code<=57)||code===43||code===47))return false;
  }
  return value.length===0||end>=value.length-2&&end>0;
}
function decode(bytes,{sourceSha,digest,profileHash}={}) {
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX_BYTES||hash(bytes)!==digest)throw Error('The staged app bundle has a different digest or exceeds the transfer limit.');
  const bundle=JSON.parse(zlib.gunzipSync(bytes,{maxOutputLength:MAX_JSON}).toString('utf8'));
  if(Object.keys(bundle).sort().join(',')!=='files,format,profileHash,sourceHash,sourceSha,totalBytes' || bundle.format!==1 || bundle.sourceSha!==sourceSha || !/^[a-f0-9]{64}$/.test(bundle.profileHash||'') || (profileHash && bundle.profileHash!==profileHash) || !/^[a-f0-9]{64}$/.test(bundle.sourceHash||'') || !Array.isArray(bundle.files) || !bundle.files.length || bundle.files.length>MAX_FILES)throw Error('Invalid staged app manifest.');
  const names=new Set();let total=0;
  const files=bundle.files.map(file=>{
    if(!safePath(file.path)||file.path==='zero-source-sha.txt'||names.has(file.path)||Object.keys(file).sort().join(',')!=='bytes,data,path,sha256'||!Number.isSafeInteger(file.bytes)||file.bytes<0||!validBase64(file.data))throw Error('Invalid or duplicate staged app path.');
    names.add(file.path);total+=file.bytes;if(total>MAX_BYTES)throw Error('The app exceeds the transfer limit.');
    const data=Buffer.from(file.data,'base64');if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('The staged app file digest does not match.');return {path:file.path,bytes:data};
  });
  if(!names.has('index.html')||!names.has('licenses/source-artifacts.json')||!files.some(f=>f.path.endsWith('.js'))||total!==bundle.totalBytes)throw Error('The staged app is incomplete.');
  for(const name of names)for(let slash=name.indexOf('/');slash>=0;slash=name.indexOf('/',slash+1))if(names.has(name.slice(0,slash)))throw Error('The staged app contains conflicting file paths.');
  return {bundle,files};
}
async function pack({projectRoot,result,sourceSha,validateExport,signal}) {
  if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Invalid app source commit.');
  const validated=await validateExport({projectRoot,result,signal});
  if(!validated?.manifest || !Array.isArray(validated.siteFiles))throw Error('A validated local app snapshot is required.');
  const manifest=validated.manifest;
  if(!Array.isArray(manifest.files)||manifest.files.length>MAX_FILES||manifest.files.reduce((sum,file)=>sum+file.bytes,0)>MAX_BYTES)throw Error('The app exceeds the transfer limit.');
  const copied=new Map(validated.siteFiles.map(file=>[file.path,Buffer.from(file.bytes)]));
  const files=[];let total=0;
  for(const file of manifest.files) {
    if(signal?.aborted)throw Error('Web publishing cancelled.');
    if(!safePath(file.path)||file.path==='zero-source-sha.txt')throw Error('Invalid local app output path.');
    const bytes=copied.get(file.path);if(!bytes)throw Error('The local browser output is incomplete.');total+=bytes.length;
    if(bytes.length!==file.bytes||hash(bytes)!==file.sha256||total>MAX_BYTES)throw Error('The local browser output changed. Run App again before publishing.');
    files.push({...file,data:bytes.toString('base64')});
  }
  const raw=Buffer.from(JSON.stringify({format:1,sourceSha,sourceHash:validated.sourceHash,profileHash:validated.profileHash,totalBytes:total,files}));
  if(raw.length>MAX_JSON)throw Error('The app exceeds the transfer limit.');
  const bytes=zlib.gzipSync(raw);const digest=hash(bytes);decode(bytes,{sourceSha,digest});
  await validateExport({projectRoot,result,signal});
  return {bytes,digest,sourceHash:validated.sourceHash,profileHash:validated.profileHash};
}
async function extract(bytes,destination,expected) {
  const decoded=decode(bytes,expected);
  await fs.mkdir(destination,{recursive:false});
  for(const file of decoded.files){const target=path.join(destination,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.bytes,{flag:'wx'});}
  return decoded.bundle;
}
module.exports={pack,decode,extract,hash,MAX_BYTES};
