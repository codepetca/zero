'use strict';
const zlib=require('node:zlib');
const MAX_JAR_FILES=256,MAX_JAR_BYTES=2*1024*1024;
const resourceExtension=/\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico|wav|mp3|ogg|txt|json|csv|properties|xml|fxml|css|ttf|otf|md)$/i;
const fail=message=>{throw new Error('Browser library: '+message);};
function crc32(bytes) {
 let crc=-1;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^(crc&1?0xedb88320:0);}return (crc^-1)>>>0;
}
function safeEntry(name) {
 if(!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))||/^[A-Za-z]:/.test(name))fail('unsafe source JAR entry');
 return name;
}
// Read central and local headers, bounds, CRC and modes before admitting any
// source bytes. Never extract a contributor JAR to a filesystem directory.
function inspectJar(input) {
 const bytes=Buffer.from(input);
 if(bytes.length<22||bytes.length>16*1024*1024)fail('source JAR exceeds its size limit');
 let end=-1;
 for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)
  if(bytes.readUInt32LE(at)===0x06054b50&&at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))fail('invalid source JAR directory');
 const count=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16),length=bytes.readUInt32LE(end+12);
 if(count>MAX_JAR_FILES||count!==bytes.readUInt16LE(end+8)||start+length!==end)fail('invalid source JAR count');
 let cursor=start,total=0;const entries=[],seen=new Set(),ranges=[];
 for(let i=0;i<count;i++) {
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)fail('invalid source JAR header');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameSize=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42),mode=bytes.readUInt32LE(cursor+38)>>>16;
  if(cursor+46+nameSize+extra+comment>end||flags&~0x808||![0,8].includes(method)||size>MAX_JAR_BYTES||offset+30>start)fail('unsupported source JAR entry');
  const raw=bytes.subarray(cursor+46,cursor+46+nameSize),name=raw.toString('utf8');
  if(!Buffer.from(name,'utf8').equals(raw))fail('invalid source JAR name');
  const directory=name.endsWith('/'),relative=directory?name.slice(0,-1):name;
  safeEntry(relative);
  if(seen.has(relative.toLowerCase()))fail('duplicate source JAR path');seen.add(relative.toLowerCase());
  if(mode&&(mode&0o170000)!==(directory?0o040000:0o100000))fail('source JAR contains a link or special file');
  const localName=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),dataStart=offset+30+localName+localExtra;
  if(bytes.readUInt32LE(offset)!==0x04034b50||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method||!bytes.subarray(offset+30,offset+30+localName).equals(raw)||dataStart+compressed>start)fail('source JAR local header differs');
  if(!(flags&8)&&(bytes.readUInt32LE(offset+14)!==bytes.readUInt32LE(cursor+16)||bytes.readUInt32LE(offset+18)!==compressed||bytes.readUInt32LE(offset+22)!==size))fail('source JAR size or CRC differs');
  ranges.push([offset,dataStart+compressed]);
  if(!directory) {
   total+=size;if(total>MAX_JAR_BYTES)fail('source JAR expanded size exceeds limit');
   const packed=bytes.subarray(dataStart,dataStart+compressed);
   const data=method===0?Buffer.from(packed):zlib.inflateRawSync(packed,{maxOutputLength:Math.max(1,size)});
   if(data.length!==size||crc32(data)!==bytes.readUInt32LE(cursor+16))fail('source JAR content differs');
   entries.push({path:relative,bytes:data});
  }
  cursor+=46+nameSize+extra+comment;
 }
 if(cursor!==end||ranges.sort((a,b)=>a[0]-b[0]).some((range,i)=>range[0]<(i?ranges[i-1][1]:0)))fail('source JAR entries overlap');
 return entries;
}
// Core-dependent libraries have no runtime class discovery, processors or extra
// core copy. Metadata is inert and limited to the ordinary fixed Maven archive.
function inspectLibraryJar(input,{namespace,coordinate,kind}={}) {
 if(!['binary','sources'].includes(kind)||typeof namespace!=='string'||!/^zero\.contrib\.r[1-9][0-9]*\.[a-z][a-z0-9_]*$/.test(namespace))fail('invalid library JAR identity');
 const prefix=namespace.replaceAll('.','/')+'/',entries=inspectJar(input);
 const metadata=new Set(['META-INF/LICENSE','META-INF/LICENSE.txt','META-INF/NOTICE','META-INF/NOTICE.txt']);
 if(coordinate) {
  if(!/^[A-Za-z0-9_.-]+$/.test(coordinate.groupId)||!/^[a-z][a-z0-9-]*$/.test(coordinate.artifactId))fail('invalid Maven JAR identity');
  const maven=`META-INF/maven/${coordinate.groupId}/${coordinate.artifactId}/`;
  metadata.add(maven+'pom.xml');metadata.add(maven+'pom.properties');
 }
 let classes=0;
 for(const file of entries) {
  if(file.path==='META-INF/MANIFEST.MF') {
   const manifest=file.bytes.toString('utf8').replace(/\r\n/g,'\n');
   if(!/^Manifest-Version: 1\.0\n/.test(manifest)||manifest.split('\n').filter(Boolean).some(line=>!/^(?:Manifest-Version|Created-By|Build-Jdk-Spec|Archiver-Version): [^\x00-\x1f]*$/.test(line)))fail('unsupported library JAR manifest');
   continue;
  }
  if(metadata.has(file.path))continue;
  if(!file.path.startsWith(prefix))fail(`library JAR entry outside ${namespace}: ${file.path}`);
  if(kind==='binary'&&file.path.endsWith('.class')||kind==='sources'&&file.path.endsWith('.java')) {classes++;continue;}
  if(!resourceExtension.test(file.path))fail(`unsupported ${kind} JAR entry: ${file.path}`);
 }
 if(!classes)fail(`library ${kind} JAR has no ${kind==='binary'?'classes':'Java sources'}`);
 return entries;
}
module.exports={inspectJar,inspectLibraryJar};
