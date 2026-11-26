'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {zipFiles} = require('./zip');
const contracts = require('../sharing/contracts');
const {constants} = require('node:fs');
const builderFormat = require('../project-builder-format');
const {discoverBrowserLibraries,resolveLibrarySources}=require('./libraries');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function isFinderMetadataResource(name) {
  return /^(?:libraries\/[^/]+\/)?src\/main\/resources\//.test(name) &&
    name.split('/').at(-1) === '.DS_Store';
}
const abort = signal => {if(signal?.aborted){const error=new Error('Browser build cancelled.');error.name='AbortError';throw error;}};
async function safePath(file,signal) {
  let current=path.parse(path.resolve(file)).root;
  for(const part of path.resolve(file).slice(current.length).split(path.sep).filter(Boolean)) {
    abort(signal);
    current=path.join(current,part);
    try {if((await fs.lstat(current)).isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+current);}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
const INPUT_LIMITS=Object.freeze({fileBytes:64*1024*1024,totalBytes:256*1024*1024,files:4096,entries:16384,depth:64});
const INPUT_CHUNK_BYTES=64*1024;
function inputBudget(overrides={}) {
  const limits={...INPUT_LIMITS,...overrides};
  for(const [name,limit] of Object.entries(limits))if(!Object.hasOwn(INPUT_LIMITS,name)||!Number.isSafeInteger(limit)||limit<1)throw new Error('Invalid browser input limit: '+name);
  return {limits,totalBytes:0,files:0,entries:0};
}
function reserveInput(budget,name,size) {
  if(!Number.isSafeInteger(size)||size<0||size>budget.limits.fileBytes)throw new Error(`Browser input ${name} exceeds the ${budget.limits.fileBytes}-byte file limit. Reduce or move the file before browser checking.`);
  if(++budget.files>budget.limits.files)throw new Error(`Browser inputs exceed the ${budget.limits.files}-file limit. Reduce the project inputs before browser checking.`);
  if((budget.totalBytes+=size)>budget.limits.totalBytes)throw new Error(`Browser inputs exceed the ${budget.limits.totalBytes}-byte total limit. Reduce the project inputs before browser checking.`);
}
const sameInput=(a,b)=>a.isFile()&&b.isFile()&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
async function readInput(descriptor,{signal,keepBytes=true,hash}={}) {
  abort(signal);
  const {filename,stat,path:name}=descriptor;
  const changed=()=>new Error('Browser input changed while reading: '+name+'. Check the saved file and try again.');
  const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    if(!sameInput(stat,await handle.stat()))throw changed();
    const bytes=keepBytes?Buffer.alloc(stat.size):Buffer.alloc(Math.min(INPUT_CHUNK_BYTES,Math.max(1,stat.size)));
    const fileHash=keepBytes?null:crypto.createHash('sha256');let offset=0;
    while(offset<stat.size) {
      abort(signal);
      const start=keepBytes?offset:0,length=Math.min(INPUT_CHUNK_BYTES,stat.size-offset);
      const {bytesRead}=await handle.read(bytes,start,length,offset);
      abort(signal);if(!bytesRead)throw changed();
      const chunk=bytes.subarray(start,start+bytesRead);fileHash?.update(chunk);hash?.update(chunk);offset+=bytesRead;
    }
    if(!sameInput(stat,await handle.stat())||!sameInput(stat,await fs.lstat(filename)))throw changed();
    abort(signal);
    return keepBytes?{path:name,bytes}:{path:name,byteLength:stat.size,sha256:fileHash.digest('hex')};
  } finally {await handle.close();}
}
async function inventoryInput(root,name,{optional=false,signal,budget,files,depth=0,kind}={}) {
  abort(signal);if(depth===0)await safePath(path.join(root,name),signal);
  const filename=path.join(root,name),stat=await fs.lstat(filename).catch(error=>{if(optional&&error.code==='ENOENT')return null;throw error;});
  if(!stat)return;
  if(stat.isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+filename);
  if(stat.isFile()) {
    if(kind==='directory')throw new Error('Expected a browser build folder: '+name);
    if(isFinderMetadataResource(name)) {
      if(stat.nlink!==1)throw new Error('Browser builds refuse linked Finder metadata: '+name);
      return;
    }
    reserveInput(budget,name,stat.size);files.push({path:name,filename,stat});return;
  }
  if(kind==='file')throw new Error('Expected a regular build file: '+name);
  if(!stat.isDirectory())throw new Error('Unsupported browser input: '+name);
  if(depth>budget.limits.depth)throw new Error(`Browser input folders exceed the ${budget.limits.depth}-level depth limit: ${name}`);
  const entries=[],directory=await fs.opendir(filename);
  for await(const entry of directory) {
    abort(signal);
    if(++budget.entries>budget.limits.entries)throw new Error(`Browser input folders exceed the ${budget.limits.entries}-entry limit. Reduce the project inputs before browser checking.`);
    entries.push(entry.name);
  }
  for(const child of entries.sort((a,b)=>a.localeCompare(b))) {
    if(name==='src/main/resources'&&child==='.gitkeep')continue;
    await inventoryInput(root,name+'/'+child,{signal,budget,files,depth:depth+1});
  }
}
async function tree(root,optional=false,{signal}={}) {
  await safePath(root,signal);abort(signal);
  let stat;
  try {stat=await fs.lstat(root);}catch(error){if(optional&&error.code==='ENOENT')return [];throw error;}
  if(!stat.isDirectory())throw new Error('Expected a browser build folder: '+root);
  const files=[];
  async function walk(dir,prefix='') {
    for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      abort(signal);
      const relative=prefix+item.name, file=path.join(dir,item.name);
      if(item.isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+file);
      if(item.isDirectory())await walk(file,relative+'/');
      else if(item.isFile())files.push({path:relative,bytes:await fs.readFile(file,{signal})});
      else throw new Error('Unsupported browser build file: '+file);
    }
  }
  await walk(root);return files;
}
function digest(files) {
  const hash=crypto.createHash('sha256');
  for(const file of [...files].sort((a,b)=>a.path.localeCompare(b.path)))hash.update(file.path).update('\0').update(file.bytes).update('\0');
  return hash.digest('hex');
}
function boundSourceHash(localSourceHash,publishedLibraries) {
  return publishedLibraries.length?sha(Buffer.from(localSourceHash+'\0'+JSON.stringify(publishedLibraries))):localSourceHash;
}
// Validate data only. Never import the saved project's modules from the host.
async function readSavedBuilder(builderRoot,{optional=false,signal}={}) {
  await safePath(builderRoot,signal);abort(signal);
  const rootStat=await fs.lstat(builderRoot).catch(error=>{if(optional&&error.code==='ENOENT')return null;throw error;});
  if(!rootStat)return null;
  if(!rootStat.isDirectory())throw new Error('Project browser tooling unavailable: expected .zero-build directory.');
  const files=[];let total=0,entries=0;
  async function walk(dir,prefix='',depth=0) {
    if(depth>INPUT_LIMITS.depth)throw new Error('Project browser tooling unavailable: saved folders exceed the depth limit.');
    for await(const item of await fs.opendir(dir)) {
      abort(signal);
      if(++entries>INPUT_LIMITS.entries)throw new Error('Project browser tooling unavailable: saved folders exceed the entry limit.');
      const name=prefix+item.name,file=path.join(dir,item.name);
      if(!builderFormat.relativePath(name))throw new Error('Project browser tooling unavailable: unsafe saved path.');
      const stat=await fs.lstat(file);
      if(stat.isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+file);
      if(stat.isDirectory())await walk(file,name+'/',depth+1);
      else if(stat.isFile()) {
        if(stat.nlink!==1||stat.size>builderFormat.LIMITS.fileBytes||name==='builder.json'&&stat.size>builderFormat.LIMITS.manifestBytes)throw new Error('Project browser tooling unavailable: linked or oversized file.');
        if(files.length>=builderFormat.LIMITS.files+1||(total+=stat.size)>builderFormat.LIMITS.totalBytes)throw new Error('Project browser tooling unavailable: saved closure exceeds limits.');
        const {bytes}=await readInput({path:name,filename:file,stat},{signal});
        files.push({path:name,bytes});
      }else throw new Error('Project browser tooling unavailable: special saved file.');
    }
  }
  await walk(builderRoot);
  const metadata=files.find(file=>file.path==='builder.json');
  if(!metadata)throw new Error('Project browser tooling unavailable: builder.json is missing.');
  const manifest=builderFormat.validateBuilderFiles(JSON.parse(metadata.bytes.toString('utf8')),files.filter(file=>file.path!=='builder.json'));
  builderFormat.validateRuntimeLock(JSON.parse(files.find(file=>file.path==='runtime-lock.json').bytes.toString('utf8')));
  return {manifest,files};
}
async function savedEngineRoot(engineRoot) {
  const candidate=path.resolve(engineRoot,'../..');
  if(path.resolve(engineRoot)!==path.join(candidate,'src/web-export'))return null;
  if(path.basename(candidate)==='.zero-build')return candidate;
  const metadata=await fs.lstat(path.join(candidate,'builder.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  return metadata?candidate:null;
}
async function assertSelectedBuilder(projectRoot,engineRoot=__dirname,{signal}={}) {
  const saved=await readSavedBuilder(path.join(projectRoot,'.zero-build'),{optional:true,signal});
  const ownRoot=await savedEngineRoot(engineRoot);
  if(!saved&&!ownRoot)return null; // Maintainer fixtures without saved tooling.
  if(!saved||!ownRoot)throw new Error('Project browser tooling unavailable: explicitly select this project’s saved .zero-build builder; the installed exporter cannot replace it.');
  const own=await readSavedBuilder(ownRoot,{signal});
  const profileHash=digest(own.files);
  if(profileHash!==digest(saved.files))throw new Error('Project browser tooling unavailable: selected saved builder differs from the project’s complete closure.');
  return {builderRoot:ownRoot,profileHash,manifest:own.manifest};
}
// Capture exactly the active bundle bytes; later validation consumes these same
// bytes, rather than reopening a project file after the snapshot was taken.
async function captureOwnedFiles(projectRoot,libraries,{signal,budget,collect}={}) {
  const files=[];
  for(const library of libraries.filter(item=>item.storage==='owned')) {
    abort(signal);
    const identity=library.identity,version=library.version;
    contracts.artifactPath(identity,version,'jar');
    const prefix=`zero-dependencies/${identity.id}/${version}`,dir=path.join(projectRoot,...prefix.split('/'));
    await safePath(dir,signal);
    const stat=await fs.lstat(dir);
    if(!stat.isDirectory())throw new Error('Expected a project-owned library folder: '+dir);
    const names=['library.jar','sources.jar','library.pom','LICENSE','manifest.json','.gitattributes'];
    const actual=[];
    for await(const entry of await fs.opendir(dir)) {
      abort(signal);actual.push(entry.name);
      if(actual.length>names.length||!names.includes(entry.name))throw new Error('Project-owned library has missing or unowned files: '+dir);
    }
    if(actual.length!==names.length)throw new Error('Project-owned library has missing or unowned files: '+dir);
    for(const name of names) {
      abort(signal);
      const filename=path.join(dir,name),max=name==='manifest.json'?contracts.LIMITS.metadataBytes+4096:name==='LICENSE'?65536:contracts.LIMITS.artifactBytes;
      const before=await fs.lstat(filename);
      if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>max)throw new Error('Invalid project-owned library file: '+filename);
      if(budget)reserveInput(budget,prefix+'/'+name,before.size);
      const descriptor={path:prefix+'/'+name,filename,stat:before};
      if(collect)collect.push(descriptor);else files.push(await readInput(descriptor,{signal}));
    }
  }
  return files;
}
async function captureBuildInputs(projectRoot,{signal,metadataOnlyResources=false,limits}={}) {
  projectRoot=path.resolve(projectRoot);
  await safePath(projectRoot,signal);abort(signal);
  const budget=inputBudget(limits),descriptors=[],cached=new Map(),savedFiles=[];
  const saved=await readSavedBuilder(path.join(projectRoot,'.zero-build'),{optional:true,signal});
  if(saved)for(const file of saved.files) {
    const name='.zero-build/'+file.path;reserveInput(budget,name,file.bytes.length);savedFiles.push({path:name,bytes:file.bytes});
  }
  for(const [name,optional] of [['src/main/java',false],['src/main/resources',true],['.mvn',false]]) {
    await inventoryInput(projectRoot,name,{optional,signal,budget,files:descriptors,kind:'directory'});
  }
  for(const name of ['pom.xml','mvnw','mvnw.cmd','zero-core.json','zero-libraries.json']) {
    await inventoryInput(projectRoot,name,{optional:name!=='pom.xml',signal,budget,files:descriptors,kind:'file'});
  }
  const stateDescriptor=descriptors.find(file=>file.path==='zero-libraries.json');
  if(stateDescriptor) {
    if(stateDescriptor.stat.size>contracts.LIMITS.metadataBytes)throw new Error('Browser library modes exceed the metadata size limit.');
    const stateFile=await readInput(stateDescriptor,{signal});cached.set(stateDescriptor.path,stateFile);
    const state=JSON.parse(stateFile.bytes.toString('utf8'));
    if(!Array.isArray(state.libraries)||state.libraries.length>budget.limits.files)throw new Error('Invalid or excessive Zero library modes.');
    const before=descriptors.length;
    await inventoryInput(projectRoot,'zero.json',{signal,budget,files:descriptors,kind:'file'});
    descriptors[before].excluded=true; // Marker is read by discovery, not a browser build input.
    const seen=new Set();
    for(const library of state.libraries) {
      contracts.identity('library',library.repositoryId,library.slug);
      if(seen.has(library.slug))throw new Error('Invalid or duplicate Zero library mode.');seen.add(library.slug);
      const folder=`libraries/${library.slug}`,descriptor=`${folder}/zero-library.json`;
      const descriptorStart=descriptors.length;
      await inventoryInput(projectRoot,descriptor,{signal,budget,files:descriptors,kind:'file'});
      if(descriptors[descriptorStart].stat.size>contracts.LIMITS.metadataBytes)throw new Error('Browser library descriptor exceeds the metadata size limit: '+descriptor);
      for(const name of ['src/main/java','src/main/resources'])
        if(name==='src/main/java'||library.mode==='local') {
          const start=descriptors.length;
          await inventoryInput(projectRoot,folder+'/'+name,{optional:true,signal,budget,files:descriptors,kind:'directory'});
          if(library.mode!=='local')for(const file of descriptors.slice(start))file.excluded=true;
        }
    }
  }
  const frozenRead=async(filename)=>{
    abort(signal);const name=path.relative(projectRoot,filename).split(path.sep).join('/');
    const descriptor=descriptors.find(file=>file.path===name);
    if(!descriptor)throw Object.assign(new Error('Browser discovery requested an uncaptured input: '+name),{code:'ENOENT'});
    if(!cached.has(name))cached.set(name,await readInput(descriptor,{signal}));
    return cached.get(name).bytes.toString('utf8');
  };
  const libraries=await discoverBrowserLibraries(projectRoot,await frozenRead(path.join(projectRoot,'pom.xml')),{hasState:!!stateDescriptor,discovery:{signal,readFile:frozenRead,sourceFiles:descriptors.map(file=>file.path)}});
  abort(signal);await captureOwnedFiles(projectRoot,libraries,{signal,budget,collect:descriptors});
  const entries=[...savedFiles.map(file=>({path:file.path,record:file})),...descriptors.filter(file=>!file.excluded)];
  const hash=crypto.createHash('sha256'),results=new Map();
  for(const entry of [...entries].sort((a,b)=>a.path.localeCompare(b.path))) {
    abort(signal);hash.update(entry.path).update('\0');
    let record=entry.record||cached.get(entry.path);
    if(record)hash.update(record.bytes);
    else record=await readInput(entry,{signal,hash,keepBytes:!metadataOnlyResources||!/(?:^|\/)src\/main\/resources\//.test(entry.path)});
    hash.update('\0');results.set(entry.path,record);
  }
  for(const entry of descriptors) {
    abort(signal);
    if(!sameInput(entry.stat,await fs.lstat(entry.filename)))throw new Error('Browser input changed during capture: '+entry.path+'. Check the saved file and try again.');
  }
  return {files:entries.map(entry=>results.get(entry.path)),sourceHash:hash.digest('hex'),libraries};
}
const browserExternalFiles=Object.freeze(['project-builder-format.js','core-contract.js','project-pom.js','sharing/contracts.js','sharing/authoring.js','sharing/consumer.js','sharing/jar.js','sharing/owned-library.js','sharing/configuration.js','sharing/tutorial-practice.js']);
async function buildProfileHash(engineRoot=__dirname,{externalRoot=path.resolve(__dirname,'..'),coreContractPath=path.join(externalRoot,'core-contract.js'),signal}={}) {
  const savedRoot=await savedEngineRoot(engineRoot);
  if(savedRoot)return digest((await readSavedBuilder(savedRoot,{signal})).files);
  const files=await tree(engineRoot,false,{signal});
  for(const name of browserExternalFiles) {
    const file=name==='core-contract.js'?coreContractPath:path.join(externalRoot,...name.split('/'));
    await safePath(file,signal);
    let bytes;try {const stat=await fs.lstat(file);if(!stat.isFile())throw new Error('not a file');bytes=await fs.readFile(file,{signal});}
    catch(error) {if(error.name==='AbortError')throw error;throw new Error('Browser compiler ' + (name==='core-contract.js'?'core contract':'external dependency') + ' is missing or unreadable: ' + file);}
    files.push({path:'@extension-src/'+name,bytes});
  }
  return digest(files);
}

function validRelative(value) {return typeof value==='string'&&value!==''&&!value.includes('\\')&&!value.includes('\0')&&!path.posix.isAbsolute(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..');}
function inventoryMatches(files,expected) {
  if(!Array.isArray(expected)||files.length!==expected.length)return false;
  const map=new Map(expected.map(f=>[f.path,f]));
  return map.size===expected.length&&files.every(f=>{const e=map.get(f.path);return e&&validRelative(e.path)&&e.bytes===f.bytes.length&&e.sha256===sha(f.bytes);});
}
async function validateExport({projectRoot,result,signal,engineRoot=__dirname,sharingSettings,fetcher}={}) {
  abort(signal);
  if(!projectRoot)throw new Error('Choose a project before validating its browser build.');
  await safePath(projectRoot);
  const root=await fs.realpath(projectRoot),output=path.join(root,'.zero','web-export');
  await safePath(output);
  const manifestPath=path.join(output,'manifest.json');
  if(result?.manifestPath&&path.resolve(result.manifestPath)!==manifestPath)throw new Error('The browser build belongs to a different project.');
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  if(manifest.schemaVersion!==1||typeof manifest.buildId!=='string'||!manifest.buildId||!manifest.compatibility||manifest.compatibility.status!=='passed')throw new Error('Choose Export for web or Publish app again to validate this browser build with the current compatibility rules.');
  if(result?.buildId&&result.buildId!==manifest.buildId)throw new Error('The browser build was replaced. Choose Export for web or Publish app again.');
  if(manifest.sitePath!==path.join(output,'site')||manifest.zipPath!==path.join(output,'web-export.zip'))throw new Error('Invalid browser build paths. Choose Export for web or Publish app again.');
  const before=await captureBuildInputs(root,{signal});
  if(!inventoryMatches(before.files,manifest.inputs))throw new Error('The project changed since its browser build. Choose Export for web or Publish app again.');
  const published=await resolveLibrarySources(root,before,{sharingSettings,fetcher,signal});
  if(JSON.stringify(published.publishedLibraries)!==JSON.stringify(manifest.publishedLibraries||[]))throw new Error('The accepted library evidence changed since this browser build. Choose Export for web or Publish app again.');
  if(boundSourceHash(before.sourceHash,published.publishedLibraries)!==manifest.sourceHash||manifest.localSourceHash&&manifest.localSourceHash!==before.sourceHash)throw new Error('The project or accepted library changed since its browser build. Choose Export for web or Publish app again.');
  const profileHash=await buildProfileHash(engineRoot,{signal});
  if(manifest.profileHash!==profileHash)throw new Error('Zero’s browser compiler or compatibility rules changed. Choose Export for web or Publish app again.');
  const siteFiles=await tree(manifest.sitePath,false,{signal});
  if(!inventoryMatches(siteFiles,manifest.files)||manifest.totalBytes!==siteFiles.reduce((sum,f)=>sum+f.bytes.length,0))throw new Error('The browser build files changed or are incomplete. Choose Export for web or Publish app again.');
  if(!siteFiles.some(f=>f.path==='index.html'&&f.bytes.length)||!siteFiles.some(f=>f.path==='zero_web.nocache.js'&&f.bytes.length)||!siteFiles.some(f=>/\.cache\.js$/.test(f.path)&&f.bytes.length))throw new Error('The browser build is incomplete. Choose Export for web or Publish app again.');
  await safePath(manifest.zipPath);
  const zipBytes=await fs.readFile(manifest.zipPath,{signal});
  const byPath=new Map(siteFiles.map(file=>[file.path,file]));
  if(!zipBytes.equals(zipFiles(manifest.files.map(file=>byPath.get(file.path)))))throw new Error('The browser ZIP differs from the validated app. Choose Export for web or Publish app again.');
  const outputFiles=await tree(output,false,{signal});
  const allowed=new Set(['manifest.json','web-export.zip',...siteFiles.map(f=>'site/'+f.path)]);
  if(outputFiles.some(f=>!allowed.has(f.path)))throw new Error('The browser build folder contains unvalidated files. Choose Export for web or Publish app again.');
  abort(signal);
  if((await captureBuildInputs(root,{signal,metadataOnlyResources:true})).sourceHash!==before.sourceHash||(await buildProfileHash(engineRoot,{signal}))!==profileHash)throw new Error('The project or browser compiler changed during validation. Choose Export for web or Publish app again.');
  return {...result,sitePath:manifest.sitePath,zipPath:manifest.zipPath,manifestPath,buildId:manifest.buildId,sourceHash:manifest.sourceHash,profileHash,totalBytes:manifest.totalBytes,files:manifest.files,logPath:manifest.buildLog,manifest,siteFiles,zipBytes};
}
async function ensureValidatedExport(options={}) {
  abort(options.signal);
  if(!options.forceBuild) {
    try {const result=await validateExport(options);options.onProgress?.('Validated browser build ready');return result;}
    catch(error){abort(options.signal);if(error.code&&!['ENOENT','ENOTDIR'].includes(error.code))throw error;options.onProgress?.('Checking and building the current browser app');}
  }
  const {exportForWeb}=require('./index');
  const result=await (options.engine?.exportForWeb||exportForWeb)(options);
  return validateExport({...options,result});
}
const gitBlobHash=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalizableCommitInput=name=>/(?:^|\/)src\/main\/java\/.+\.java$/.test(name)||['pom.xml','mvnw','mvnw.cmd','zero-core.json','zero-libraries.json'].includes(name)||/^libraries\/[^/]+\/zero-library\.json$/.test(name)||/^\.mvn\/.+\.(?:properties|xml|config)$/.test(name);
function commitInputMetadata(files) {
  return files.map(file=>({path:file.path,bytes:file.bytes.length,sha256:sha(file.bytes),gitBlobSha1:gitBlobHash(file.bytes),...(normalizableCommitInput(file.path)?{normalizedGitBlobSha1:gitBlobHash(Buffer.from(file.bytes.toString('utf8').replace(/\r\n/g,'\n')))}:{})})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
// Compare bytes to the reviewed commit without executing Git clean filters or
// reading an index that may omit ignored application files used by the compiler.
async function assertBuildInputsAtCommit({projectRoot,result,sourceSha,git}={}) {
  if(typeof git!=='function')throw new Error('Commit verification requires the host Git operation.');
  if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw new Error('Invalid uploaded source commit.');
  const inputs=await captureBuildInputs(projectRoot);
  if(inputs.sourceHash!==(result?.manifest?.localSourceHash||result?.sourceHash))throw new Error('The project changed since its browser build. Choose Export for web or Publish app again.');
  const raw=await git(projectRoot,['ls-tree','-r','-z',sourceSha,'--','src/main/java','src/main/resources','pom.xml','mvnw','mvnw.cmd','.mvn','zero-core.json','zero-libraries.json','libraries','zero-dependencies','.zero-build']);
  const committed=new Map();
  for(const entry of String(raw).split('\0').filter(Boolean)) {
    const match=/^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    if(!match)throw new Error('Uploaded browser inputs must be ordinary tracked files.');
    if(match[3]==='src/main/resources/.gitkeep'||isFinderMetadataResource(match[3])||(match[3].startsWith('libraries/')||match[3].startsWith('zero-dependencies/'))&&!inputs.files.some(file=>file.path===match[3]))continue;
    committed.set(match[3],match[2]);
  }
  const gitBlob=gitBlobHash;
  const normalized=[];
  if(committed.size!==inputs.files.length)throw new Error('The browser build uses files missing from the uploaded commit, or uploaded files are missing locally. Upload all Java, resources and Maven setup before publishing.');
  for(const file of inputs.files) {
    const expected=committed.get(file.path);
    if(expected===gitBlob(file.bytes))continue;
    // Ordinary Windows checkouts can use CRLF for Java/Maven source. These
    // language/config inputs treat line endings equivalently. Never transform
    // resources: their exact tested bytes must be present in the commit.
    const textSource=normalizableCommitInput(file.path);
    if(expected&&textSource&&expected===gitBlob(Buffer.from(file.bytes.toString('utf8').replace(/\r\n/g,'\n')))){normalized.push(file.path);continue;}
    throw new Error('The browser input '+file.path+' differs from the uploaded commit or is ignored/untracked. Upload the exact source and resources before publishing.');
  }
  if((await captureBuildInputs(projectRoot)).sourceHash!==inputs.sourceHash)throw new Error('The project changed while checking its uploaded source. Choose Export for web or Publish app again.');
  return {sourceSha,sourceHash:result.sourceHash,inputCount:inputs.files.length,normalizedSourceLineEndings:normalized};
}
module.exports={commitInputMetadata,assertSelectedBuilder,readSavedBuilder,browserExternalFiles,captureOwnedFiles,captureBuildInputs,buildProfileHash,boundSourceHash,isFinderMetadataResource,validateExport,ensureValidatedExport,assertBuildInputsAtCommit,_test:{digest,inventoryMatches,tree}};
