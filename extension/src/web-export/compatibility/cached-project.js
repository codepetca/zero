'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const snapshot=require('../snapshot');
const compatibility=require('./index');
const {resolveLibrarySources,assertApplicationNamespaces}=require('../libraries');
const {createCacheOnlyFetcher}=require('./cache');
const core=require('../../core-contract');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=files=>hash(Buffer.from(JSON.stringify(files.map(file=>({path:file.path,sha256:hash(file.bytes)})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))));
const cancel=signal=>{if(signal?.aborted)throw Object.assign(Error('Browser checks cancelled.'),{name:'AbortError'});};
async function jdkIdentity(environment,projectRoot){
 if(!environment.JAVA_HOME||!path.isAbsolute(environment.JAVA_HOME))throw Error('A verified standalone JDK is unavailable.');
 const files=[];
 for(const name of ['bin/java'+(process.platform==='win32'?'.exe':''),'bin/javac'+(process.platform==='win32'?'.exe':''),'release']){
  const file=await fs.realpath(path.join(environment.JAVA_HOME,name));
  if(file===projectRoot||file.startsWith(projectRoot+path.sep))throw Error('Browser checks require a JDK outside the project.');
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>32*1024*1024)throw Error('Invalid standalone JDK input.');
  files.push({path:name,bytes:await fs.readFile(file)});
 }
 return digest(files);
}
async function cachedCompatibilityIdentity({projectRoot,cacheRoot,env=process.env,signal}={}){
 cancel(signal);
 const captured=await snapshot.captureBuildInputs(projectRoot),selected=await snapshot.assertSelectedBuilder(projectRoot),profile=await compatibility.compatibilityProfile();
 const published=captured.libraries.some(library=>library.mode==='published');
 const cached=published?await createCacheOnlyFetcher(cacheRoot):null;
 const resolved=await resolveLibrarySources(projectRoot,captured,{signal,...(cached?{fetcher:cached.fetcher}:{})});
 const identity={sourceHash:captured.sourceHash,coreHash:digest(captured.files.filter(file=>file.path==='zero-core.json'||core.coreSourcePaths.includes(file.path))),librariesHash:hash(Buffer.from(JSON.stringify({libraries:captured.libraries,published:resolved.publishedLibraries,cacheFingerprint:cached?.fingerprint||null}))),profileHash:selected?.profileHash||await snapshot.buildProfileHash(),checkerHash:profile.checkerHash,contractHash:profile.contractHash,jdkHash:await jdkIdentity(env,projectRoot)};
 cancel(signal);return {identity,captured,resolved};
}
async function checkCachedProject(options={}){
 let before,workRoot;
 try{
  before=await cachedCompatibilityIdentity(options);cancel(options.signal);
  const {captured,resolved}=before;
  const javaFiles=[...captured.files.filter(file=>file.path.startsWith('src/main/java/')&&file.path.endsWith('.java')).map(file=>({...file,originalPath:file.path,path:file.path.slice('src/main/java/'.length)})),...resolved.sources];
  assertApplicationNamespaces(javaFiles.filter(file=>file.originalPath.startsWith('src/main/java/')),captured.libraries);
  const names=new Set();for(const file of javaFiles){const key=file.path.toLowerCase();if(names.has(key))throw Error('Application/library source paths collide.');names.add(key);}
  workRoot=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'zero-cached-compatibility-'));
  let result,error;
  try{result=await compatibility.checkCompatibility({...options,cacheOnly:true,workRoot,sources:Object.fromEntries(javaFiles.map(file=>[file.path,file.bytes.toString('utf8')])),sourceOrigins:Object.fromEntries(javaFiles.map(file=>[file.path,file.originalPath])),libraries:captured.libraries,pom:captured.files.find(file=>file.path==='pom.xml').bytes.toString('utf8')});}
  catch(failure){error=failure;}
  cancel(options.signal);
  const after=await cachedCompatibilityIdentity(options);
  if(JSON.stringify(after.identity)!==JSON.stringify(before.identity))return {status:'stale',identity:after.identity,diagnostics:[{code:'INPUTS_CHANGED',message:'Saved inputs or verified tools changed during browser checking.'}]};
  if(error){if(error.name==='AbortError')throw error;return {status:error.code==='ZERO_BROWSER_UNSUPPORTED'?'unsupported':'unavailable',identity:after.identity,diagnostics:[{code:error.code||'CHECKER_UNAVAILABLE',message:String(error.message).slice(0,8192)}]};}
  return {status:'compatible',identity:after.identity,diagnostics:[],compatibility:result};
 }catch(error){if(error.name==='AbortError')throw error;return {status:'unavailable',identity:before?.identity||null,diagnostics:[{code:error.code||'CACHED_INPUTS_UNAVAILABLE',message:String(error.message).slice(0,8192)}]};}
 finally{if(workRoot)await fs.rm(workRoot,{recursive:true,force:true});}
}
module.exports={checkCachedProject,cachedCompatibilityIdentity,_test:{jdkIdentity}};
