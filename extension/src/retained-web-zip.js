'use strict';
// Inspect retained output without recreating compression with the current runtime.
const {inflateRawSync}=require('node:zlib');
const {crc32}=require('./web-export/zip');
const invalid=()=>{throw Error('The retained browser ZIP differs from its site or has an invalid ZIP structure.');};
function inspectRetainedZip(bytes,siteFiles,{safePath,maxFiles=10000,maxBytes=256*1024*1024}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>maxBytes||siteFiles.length>maxFiles)invalid();
 const expected=new Map(siteFiles.map(file=>[file.path,file.bytes]));
 if(expected.size!==siteFiles.length)invalid();
 let end=-1;
 for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-22-65535);offset--){
  if(bytes.readUInt32LE(offset)===0x06054b50&&offset+22+bytes.readUInt16LE(offset+20)===bytes.length){end=offset;break;}
 }
 if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)invalid();
 const count=bytes.readUInt16LE(end+10),centralSize=bytes.readUInt32LE(end+12),centralOffset=bytes.readUInt32LE(end+16);
 if(!count||count!==siteFiles.length||count>maxFiles||count!==bytes.readUInt16LE(end+8)||centralOffset+centralSize!==end)invalid();
 const names=new Set(),records=[];let offset=centralOffset,total=0;
 for(let index=0;index<count;index++){
  if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)invalid();
  const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),crc=bytes.readUInt32LE(offset+16),compressed=bytes.readUInt32LE(offset+20),size=bytes.readUInt32LE(offset+24);
  const nameLength=bytes.readUInt16LE(offset+28),extraLength=bytes.readUInt16LE(offset+30),commentLength=bytes.readUInt16LE(offset+32),localOffset=bytes.readUInt32LE(offset+42),attributes=bytes.readUInt32LE(offset+38);
  const next=offset+46+nameLength+extraLength+commentLength;
  if(next>end||!nameLength||extraLength!==0||bytes.readUInt16LE(offset+6)>20||bytes.readUInt16LE(offset+34)!==0||flags&~0x800||![0,8].includes(method)||attributes&0x10||((attributes>>>16)&0o170000)&&((attributes>>>16)&0o170000)!==0o100000)invalid();
  const nameBytes=bytes.subarray(offset+46,offset+46+nameLength);let name;
  try{name=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(nameBytes);}catch{invalid();}
  if(!(flags&0x800)&&nameBytes.some(byte=>byte>0x7f)||!safePath(name)||names.has(name.toLowerCase())||!expected.has(name)||size!==expected.get(name).length)invalid();
  names.add(name.toLowerCase());total+=size;if(total>maxBytes)invalid();
  records.push({name,nameBytes,flags,method,crc,compressed,size,localOffset});offset=next;
 }
 if(offset!==end)invalid();
 // Every local entry is accounted for exactly once; no hidden prefix, overlap,
 // extra local entries or trailing bytes may sit outside the central inventory.
 records.sort((a,b)=>a.localOffset-b.localOffset);offset=0;
 for(const record of records){
  const {name,nameBytes,flags,method,crc,compressed,size,localOffset}=record;
  if(localOffset!==offset||offset+30>centralOffset||bytes.readUInt32LE(offset)!==0x04034b50||bytes.readUInt16LE(offset+4)>20||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method||bytes.readUInt32LE(offset+14)!==crc||bytes.readUInt32LE(offset+18)!==compressed||bytes.readUInt32LE(offset+22)!==size)invalid();
  const nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28),dataOffset=offset+30+nameLength+extraLength,dataEnd=dataOffset+compressed;
  if(extraLength!==0||nameLength!==nameBytes.length||dataEnd>centralOffset||!bytes.subarray(offset+30,offset+30+nameLength).equals(nameBytes))invalid();
  const payload=bytes.subarray(dataOffset,dataEnd);let contents;
  if(method===0){if(compressed!==size)invalid();contents=payload;}
  else {try{const inflated=inflateRawSync(payload,{maxOutputLength:Math.max(1,size),info:true});if(inflated.engine.bytesWritten!==compressed)invalid();contents=inflated.buffer;}catch{invalid();}}
  if(contents.length!==size||crc32(contents)!==crc||!contents.equals(expected.get(name)))invalid();
  offset=dataEnd;
 }
 if(offset!==centralOffset)invalid();
 return {files:count,totalBytes:total};
}
module.exports={inspectRetainedZip};
