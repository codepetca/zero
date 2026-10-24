'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {readSavedBuilder}=require('./project-builder');
const {ordinary}=require('./retained-web-export');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const cachePartition=(saved,base)=>path.join(path.resolve(base||path.join(os.tmpdir(),'zero-web-cache')),saved.manifest.closureSha256+'-'+sha(saved.files.find(file=>file.path==='runtime-lock.json').bytes),saved.manifest.closureSha256);

// All inspection uses installed host code and ordinary data reads. In particular,
// it never imports run.cjs or probes a runtime before a deliberate approval.
async function inspectSourceScope({projectRoot,cacheRoot,environment=process.env,platform=process.platform,signal}={}){
 const root=await fs.realpath(projectRoot),saved=await readSavedBuilder(root),hash=crypto.createHash('sha256');let count=0,total=0;
 const add=(name,bytes)=>{hash.update(name).update('\0').update(bytes).update('\0');};
 async function visit(filename,name,{optional=true,links=false}={}){
  if(signal?.aborted)throw Object.assign(Error('Browser check inspection cancelled.'),{name:'AbortError'});
  let stat;try{stat=await fs.lstat(filename);}catch(error){if(optional&&['ENOENT','ENOTDIR'].includes(error.code)){add(name,Buffer.from('absent'));return;}throw error;}
  if(++count>10000)throw Error('Saved browser checks exceed their file limit.');
  if(links){const actual=await fs.realpath(filename);if(actual===root||actual.startsWith(root+path.sep))throw Error('Runtime must be outside the student project.');if(actual!==filename)return visit(actual,name,{optional:false,links:true});}
  // External runtime candidates are read only for identity. macOS system launchers
  // are ordinary hard-linked files; project/cache inputs retain strict ownership.
  if(links){if(!stat.isFile()||stat.size>32*1024*1024)throw Error('Saved browser checks require bounded ordinary runtime files.');}
  else try{await ordinary(filename,{directory:stat.isDirectory(),maxBytes:32*1024*1024});}catch{throw Error('Saved browser checks cannot inspect linked, special or oversized project/cache paths.');}
  if(stat.isDirectory()){
   add(name+'/',Buffer.alloc(0));for(const child of (await fs.readdir(filename)).sort())await visit(path.join(filename,child),name+'/'+child,{optional:false});return;
  }
  if(!stat.isFile()||(!links&&stat.nlink!==1)||stat.size>32*1024*1024||(total+=stat.size)>256*1024*1024)throw Error('Saved browser checks cannot inspect a linked, special or oversized input.');
  const bytes=await fs.readFile(filename),after=await fs.lstat(filename);if(!after.isFile()||after.dev!==stat.dev||after.ino!==stat.ino||after.size!==stat.size||after.size!==bytes.length||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||(!links&&after.nlink!==1))throw Error('Saved browser inputs changed during inspection.');add(name,bytes);
 }
 add('builder',Buffer.from(saved.profileHash));
 for(const name of ['src/main/java','src/main/resources','.mvn','pom.xml','mvnw','mvnw.cmd','zero-core.json','zero-libraries.json'])await visit(path.join(root,name),name);
 const libraries=path.join(root,'libraries');let libraryNames=[];try{await ordinary(libraries,{directory:true});libraryNames=await fs.readdir(libraries);}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const name of libraryNames.sort())for(const child of ['zero-library.json','src/main/java','src/main/resources'])await visit(path.join(libraries,name,child),'libraries/'+name+'/'+child);
 const partition=cachePartition(saved,cacheRoot);
 for(const name of ['compatibility-artifacts','library-responses'])await visit(path.join(partition,name),'cache/'+name);
 const get=name=>Object.entries(environment).find(([key])=>key.toUpperCase()===name)?.[1],paths=platform==='win32'?path.win32:path,suffix=platform==='win32'?'.exe':'',delimiter=platform==='win32'?';':path.delimiter;
 const candidates=new Set(),java=get('JAVA_HOME');if(java&&paths.isAbsolute(java)){for(const tool of ['java','javac'])candidates.add(paths.join(java,'bin',tool+suffix));candidates.add(paths.join(java,'release'));}
 for(const directory of (get('PATH')||'').split(delimiter).filter(value=>paths.isAbsolute(value)).slice(0,128)){for(const tool of ['java','javac'])candidates.add(paths.join(directory,tool+suffix));candidates.add(paths.join(paths.dirname(directory),'release'));}
 const privateRoot=platform==='darwin'?path.join(get('HOME')||os.homedir(),'Library/Application Support/Zero/runtime'):platform==='win32'&&get('LOCALAPPDATA')?paths.join(get('LOCALAPPDATA'),'ZeroData/runtime'):null;
 if(privateRoot){let entries=[];try{entries=(await fs.readdir(privateRoot)).filter(name=>/^jdk-[a-f0-9]{64}$/.test(name)).sort().slice(0,32);}catch{}for(const entry of entries){const folder=paths.join(privateRoot,entry);if(platform==='win32'){for(const tool of ['bin/java.exe','bin/javac.exe','release'])candidates.add(paths.join(folder,tool));}else{let children=[];try{children=(await fs.readdir(folder)).sort().slice(0,16);}catch{}for(const child of children)for(const tool of ['Contents/Home/bin/java','Contents/Home/bin/javac','Contents/Home/release'])candidates.add(paths.join(folder,child,tool));}}}
 for(const filename of [...candidates].sort())await visit(filename,'runtime/'+filename,{links:true});
 return {builderHash:saved.profileHash,scopeHash:hash.digest('hex')};
}

function createSavedSourceHost({projectRoot,cacheRoot,builder,environment=process.env,platform=process.platform}={}){
 const inspect=(options={})=>inspectSourceScope({projectRoot,cacheRoot,environment,platform,signal:options.signal});
 return {inspect,async check({signal,approval,expectedIdentity}){
  const before=await inspect({signal});if(JSON.stringify(before)!==JSON.stringify(expectedIdentity)||before.builderHash!==approval.builderHash)return {status:'stale',scopeIdentity:before,identity:null,diagnostics:[]};
  const result=await builder.checkSavedSources({projectRoot,cacheRoot,signal,approvedBuilderHash:approval.builderHash});
  return {...result,scopeIdentity:before};
 }};
}
module.exports={inspectSourceScope,createSavedSourceHost,cachePartition};
