'use strict';
const {inflateSync}=require('node:zlib');
const MAX_BYTES=4*1024*1024, MAX_SIDE=2048;
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value>>>1^(value&1?0xedb88320:0);return value>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crc>>>8^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}
const invalid=()=>{throw new Error('Use a valid square PNG screenshot, at most 2048 × 2048 pixels and 4 MiB.');};
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};

// Decode bounded PNG scanlines (including Adam7) instead of trusting dimensions
// in an otherwise corrupt header. Pixels are inspected, never executed/rendered.
function validateGamePreview(input) {
 const bytes=Buffer.from(input);
 if(bytes.length>MAX_BYTES||bytes.length<45||!bytes.subarray(0,8).equals(signature))invalid();
 let offset=8,header,palette=0,ended=false,idatEnded=false;const data=[];
 while(offset<bytes.length){
  if(offset+12>bytes.length)invalid();const size=bytes.readUInt32BE(offset),end=offset+12+size;
  if(end>bytes.length)invalid();const type=bytes.toString('latin1',offset+4,offset+8),chunk=bytes.subarray(offset+8,end-4);
  if(!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))invalid();
  if(!header&&type!=='IHDR')invalid();
  if(type==='IHDR'){
   if(header||size!==13)invalid();const width=chunk.readUInt32BE(0),height=chunk.readUInt32BE(4),depth=chunk[8],color=chunk[9];
   const legal={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!width||width!==height||width>MAX_SIDE||!legal[color]?.includes(depth)||chunk[10]!==0||chunk[11]!==0||chunk[12]>1)invalid();
   header={width,height,depth,color,interlace:chunk[12]};
  }else if(type==='PLTE'){
   if(palette||data.length||!size||size%3||size>768||[0,4].includes(header.color))invalid();palette=size/3;
   if(header.color===3&&palette>2**header.depth)invalid();
  }else if(type==='IDAT'){
   if(idatEnded||header.color===3&&!palette)invalid();data.push(chunk);
  }else if(type==='IEND'){
   if(size||!data.length||end!==bytes.length)invalid();ended=true;offset=end;break;
  }else{
   if(type[0]===type[0].toUpperCase())invalid(); // Unknown critical chunk.
   if(data.length)idatEnded=true;
  }
  offset=end;
 }
 if(!ended)invalid();
 const {width,height,depth,color,interlace}=header,channels={0:1,2:3,3:1,4:2,6:4}[color],bits=channels*depth,bpp=Math.max(1,Math.ceil(bits/8));
 const passes=(interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]])
  .map(([x,y,dx,dy])=>({w:Math.max(0,Math.ceil((width-x)/dx)),h:Math.max(0,Math.ceil((height-y)/dy))})).filter(p=>p.w&&p.h);
 const expected=passes.reduce((sum,p)=>sum+(Math.ceil(p.w*bits/8)+1)*p.h,0);
 let raw;try{const result=inflateSync(Buffer.concat(data),{maxOutputLength:expected,info:true});raw=result.buffer;if(result.engine.bytesWritten!==data.reduce((sum,value)=>sum+value.length,0))invalid();}catch{invalid();}
 if(raw.length!==expected)invalid();let cursor=0;
 for(const {w,h} of passes){
  const stride=Math.ceil(w*bits/8);let previous=Buffer.alloc(stride);
  for(let y=0;y<h;y++){
   const filter=raw[cursor++];if(filter>4)invalid();const row=Buffer.from(raw.subarray(cursor,cursor+stride));cursor+=stride;
   for(let x=0;x<stride;x++){
    const a=x>=bpp?row[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0;
    const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
    row[x]=(row[x]+prediction)&255;
   }
   if(color===3)for(let x=0;x<w;x++){const index=row[Math.floor(x*depth/8)]>>>(8-depth-x*depth%8)&(1<<depth)-1;if(index>=palette)invalid();}
   previous=row;
  }
 }
 return {width,height};
}
module.exports={validateGamePreview,MAX_BYTES,MAX_SIDE};
