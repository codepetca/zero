'use strict';
const path=require('node:path');
const zlib=require('node:zlib');
const {discoverLibraries,declaration}=require('../sharing/authoring');
const {loadCatalog,verifyLibrary}=require('../sharing/consumer');
const {readKitConfiguration}=require('../sharing/configuration');

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
function add(target,name,bytes,kind,originalPath=name) {
 const folded=name.toLowerCase();
 if(target.some(entry=>entry.path.toLowerCase()===folded))fail(`${kind} collision: ${name}`);
 target.push({path:name,bytes,originalPath});
}
async function resolveLibrarySources(projectRoot,captured,options={}) {
 const state=captured.files.find(file=>file.path==='zero-libraries.json');
 if(!state)return {sources:[],resources:[],publishedLibraries:[]};
 const libraries=await discoverLibraries(projectRoot),sources=[],resources=[],publishedLibraries=[];
 const published=libraries.filter(library=>library.mode==='published');
 const settings=options.sharingSettings||readKitConfiguration(path.resolve(__dirname,'../..'));
 const context=published.length?await loadCatalog(settings,{fetcher:options.fetcher,signal:options.signal}):null;
 for(const library of libraries) {
  const namespace=library.identity.namespace,prefix=namespace.replaceAll('.','/')+'/';
  if(library.mode==='local') {
   const sourcePrefix=`${library.folder}/src/main/java/`,resourcePrefix=`${library.folder}/src/main/resources/`;
   const own=captured.files.filter(file=>file.path.startsWith(sourcePrefix));
   if(!own.length)fail(`${library.slug} has no local Java source`);
   for(const file of own) {
    if(!file.path.endsWith('.java'))fail(`non-Java file in ${sourcePrefix}`);
    const name=file.path.slice(sourcePrefix.length),decl=declaration(file.bytes.toString('utf8'),file.path);
    if((decl.packageName!==namespace&&!decl.packageName.startsWith(namespace+'.'))||name!==decl.packageName.replaceAll('.','/')+'/'+decl.simple+'.java')fail(`source outside ${namespace}: ${file.path}`);
    add(sources,name,file.bytes,'Java class',file.path);
   }
   for(const file of captured.files.filter(file=>file.path.startsWith(resourcePrefix))) {
    const name=file.path.slice(resourcePrefix.length);
    if(!name.startsWith(prefix)||!resourceExtension.test(name))fail(`unsupported or unscoped library resource: ${file.path}`);
    add(resources,name,file.bytes,'resource',file.path);
   }
   continue;
  }
  const release=context.catalog.releases.find(item=>item.kind==='library'&&item.id===library.identity.id&&item.version===library.version&&item.status==='available');
  if(!release)fail(`published ${library.slug} ${library.version} is not an available accepted release`);
  const verified=await verifyLibrary(context,release,{signal:options.signal});
  const sourceEntries=inspectJar(verified.sources),binaryEntries=inspectJar(verified.jar);
  let count=0;
  for(const file of sourceEntries) {
   if(file.path.startsWith('META-INF/'))continue;
   if(!file.path.startsWith(prefix))fail(`published source outside ${namespace}: ${file.path}`);
   if(!file.path.endsWith('.java')) {
    if(!resourceExtension.test(file.path))fail(`unsupported published source entry: ${file.path}`);
    continue;
   }
   const decl=declaration(file.bytes.toString('utf8'),file.path);
   if(file.path!==decl.packageName.replaceAll('.','/')+'/'+decl.simple+'.java')fail(`published source path differs from package: ${file.path}`);
   add(sources,file.path,file.bytes,'Java class',`published/${release.id}/${release.version}/${file.path}`);count++;
  }
  if(!count)fail(`published ${library.slug} has no Java source`);
  for(const file of binaryEntries) {
   if(file.path.startsWith('META-INF/'))continue;
   if(!file.path.startsWith(prefix))fail(`published binary entry outside ${namespace}: ${file.path}`);
   if(file.path.endsWith('.class'))continue;
   if(!resourceExtension.test(file.path))fail(`unsupported published resource: ${file.path}`);
   add(resources,file.path,file.bytes,'resource',`published/${release.id}/${release.version}/${file.path}`);
  }
  publishedLibraries.push({id:release.id,version:release.version,namespace,sourceCommit:release.source.commit,sourceDigest:release.source.sha256,catalogFingerprint:context.fingerprint,artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>[kind,{sha256:release.artifacts[kind].sha256,size:release.artifacts[kind].size}]))});
 }
 return {sources,resources,publishedLibraries};
}
module.exports={resolveLibrarySources,inspectJar};
