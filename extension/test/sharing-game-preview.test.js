'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {deflateSync}=require('node:zlib');
const {validateGamePreview,MAX_BYTES}=require('../src/sharing/game-preview');
function crc(bytes){let value=-1;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value>>>1^(value&1?0xedb88320:0);}return (value^-1)>>>0;}
function chunk(type,data){const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);bytes.write(type,4);data.copy(bytes,8);bytes.writeUInt32BE(crc(bytes.subarray(4,-4)),bytes.length-4);return bytes;}
function png({width=2,height=width,depth=8,color=6,interlace=0,raw=Buffer.alloc((width*4+1)*height),compressed=deflateSync(raw),palette}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=depth;header[9]=color;header[12]=interlace;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(palette?[chunk('PLTE',palette)]:[]),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))]);
}
test('square PNG validates actual bounded scanlines for normal screenshot formats',()=>{
 const external=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 assert.deepEqual(validateGamePreview(external),{width:1,height:1});
 for(const [color,depth,channels]of [[0,1,1],[0,16,1],[2,8,3],[2,16,3],[3,2,1],[4,8,2],[6,8,4],[6,16,4]]){
  const width=3,stride=Math.ceil(width*channels*depth/8),raw=Buffer.alloc((stride+1)*3);
  assert.equal(validateGamePreview(png({width,color,depth,raw,palette:color===3?Buffer.alloc(3):undefined})).width,3);
 }
 for(let filter=0;filter<=4;filter++){const raw=Buffer.alloc(18);raw[0]=raw[9]=filter;assert.equal(validateGamePreview(png({raw})).width,2);}
 // A 2x2 Adam7 image has one RGBA pixel in passes 1 and 6,
 // then two RGBA pixels in pass 7.
 assert.equal(validateGamePreview(png({interlace:1,raw:Buffer.alloc(5+5+9)})).width,2);
});
test('non-square, oversized, corrupt, truncated and falsely advertised PNGs fail',()=>{
 const brokenCrc=png();brokenCrc[29]^=1;
 for(const bytes of [Buffer.from('not an image'),Buffer.from([137,80,78,71,13,10,26,10]),brokenCrc,png().subarray(0,-1),png({height:3}),png({width:2049,compressed:deflateSync(Buffer.from([0]))}),png({depth:4}),png({raw:Buffer.alloc(19)}),png({raw:Buffer.from([5,...Array(17).fill(0)])}),png({compressed:Buffer.from('invalid zlib')}),png({compressed:Buffer.concat([deflateSync(Buffer.alloc(18)),Buffer.from('trailing')])}),png({raw:Buffer.alloc(1000)}),Buffer.concat([png(),Buffer.from([0])]),Buffer.alloc(MAX_BYTES+1)])assert.throws(()=>validateGamePreview(bytes),/valid square PNG/);
});
test('indexed PNG scanlines must reference entries in their palette',()=>{
 assert.throws(()=>validateGamePreview(png({width:1,color:3,depth:8,raw:Buffer.from([0,1]),palette:Buffer.alloc(3)})),/valid square PNG/);
 assert.throws(()=>validateGamePreview(png({width:1,color:3,depth:8,raw:Buffer.from([0,0])})),/valid square PNG/);
});
test('PNG chunk names cannot disguise invalid high-bit bytes as ASCII letters',()=>{
 const highBit=png();highBit[12]|=128;highBit.writeUInt32BE(crc(highBit.subarray(12,29)),29);
 assert.throws(()=>validateGamePreview(highBit),/valid square PNG/);
});
