'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {zipFiles} = require('./zip');
const builderFormat = require('../project-builder-format');
const {discoverBrowserLibraries,resolveLibrarySources}=require('./libraries');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const abort = signal => {if(signal?.aborted){const error=new Error('Browser build cancelled.');error.name='AbortError';throw error;}};
async function safePath(file) {
  let current=path.parse(path.resolve(file)).root;
  for(const part of path.resolve(file).slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try {if((await fs.lstat(current)).isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+current);}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
async function tree(root,optional=false) {
  await safePath(root);
  let stat;
  try {stat=await fs.lstat(root);}catch(error){if(optional&&error.code==='ENOENT')return [];throw error;}
  if(!stat.isDirectory())throw new Error('Expected a browser build folder: '+root);
  const files=[];
  async function walk(dir,prefix='') {
    for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const relative=prefix+item.name, file=path.join(dir,item.name);
      if(item.isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+file);
      if(item.isDirectory())await walk(file,relative+'/');
      else if(item.isFile())files.push({path:relative,bytes:await fs.readFile(file)});
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
async function readSavedBuilder(builderRoot,{optional=false}={}) {
  await safePath(builderRoot);
  const rootStat=await fs.lstat(builderRoot).catch(error=>{if(optional&&error.code==='ENOENT')return null;throw error;});
  if(!rootStat)return null;
  if(!rootStat.isDirectory())throw new Error('Project browser tooling unavailable: expected .zero-build directory.');
  const files=[];let total=0;
  async function walk(dir,prefix='') {
    for(const item of await fs.readdir(dir,{withFileTypes:true})) {
      const name=prefix+item.name,file=path.join(dir,item.name);
      if(!builderFormat.relativePath(name))throw new Error('Project browser tooling unavailable: unsafe saved path.');
      const stat=await fs.lstat(file);
      if(stat.isSymbolicLink())throw new Error('Browser builds refuse symbolic links: '+file);
      if(stat.isDirectory())await walk(file,name+'/');
      else if(stat.isFile()) {
        if(stat.nlink!==1||stat.size>builderFormat.LIMITS.fileBytes||name==='builder.json'&&stat.size>builderFormat.LIMITS.manifestBytes)throw new Error('Project browser tooling unavailable: linked or oversized file.');
        const bytes=await fs.readFile(file);total+=bytes.length;
        if(files.length>=builderFormat.LIMITS.files+1||total>builderFormat.LIMITS.totalBytes)throw new Error('Project browser tooling unavailable: saved closure exceeds limits.');
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
async function assertSelectedBuilder(projectRoot,engineRoot=__dirname) {
  const saved=await readSavedBuilder(path.join(projectRoot,'.zero-build'),{optional:true});
  const ownRoot=await savedEngineRoot(engineRoot);
  if(!saved&&!ownRoot)return null; // Maintainer fixtures without saved tooling.
  if(!saved||!ownRoot)throw new Error('Project browser tooling unavailable: explicitly select this project’s saved .zero-build builder; the installed exporter cannot replace it.');
  const own=await readSavedBuilder(ownRoot);
  const profileHash=digest(own.files);
  if(profileHash!==digest(saved.files))throw new Error('Project browser tooling unavailable: selected saved builder differs from the project’s complete closure.');
  return {builderRoot:ownRoot,profileHash,manifest:own.manifest};
}
async function captureBuildInputs(projectRoot) {
  await safePath(projectRoot);
  const files=[];
  const saved=await readSavedBuilder(path.join(projectRoot,'.zero-build'),{optional:true});
  if(saved)for(const file of saved.files)files.push({path:'.zero-build/'+file.path,bytes:file.bytes});
  for(const [name,optional] of [['src/main/java',false],['src/main/resources',true],['.mvn',false]]) {
    for(const file of await tree(path.join(projectRoot,name),optional)) {
      if(name==='src/main/resources'&&file.path==='.gitkeep')continue;
      files.push({path:name+'/'+file.path,bytes:file.bytes});
    }
  }
  for(const name of ['pom.xml','mvnw','mvnw.cmd','zero-core.json']) {
    const file=path.join(projectRoot,name);await safePath(file);
    try {if(!(await fs.lstat(file)).isFile())throw new Error('Expected a regular build file: '+file);files.push({path:name,bytes:await fs.readFile(file)});}
    catch(error){if(error.code!=='ENOENT'||name==='pom.xml')throw error;}
  }
  await safePath(path.join(projectRoot,'zero-libraries.json'));
  const state=await fs.readFile(path.join(projectRoot,'zero-libraries.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const libraries=await discoverBrowserLibraries(projectRoot,files.find(file=>file.path==='pom.xml').bytes.toString('utf8'));
  if(state!==null) {
    files.push({path:'zero-libraries.json',bytes:state});
    for(const library of libraries.filter(library=>library.source==='authored')) {
      const folder=library.folder,descriptor=`${folder}/zero-library.json`;
      await safePath(path.join(projectRoot,descriptor));
      files.push({path:descriptor,bytes:await fs.readFile(path.join(projectRoot,descriptor))});
      if(library.mode!=='local')continue;
      for(const name of ['src/main/java','src/main/resources'])
        for(const file of await tree(path.join(projectRoot,folder,name),name==='src/main/resources'))
          files.push({path:`${folder}/${name}/${file.path}`,bytes:file.bytes});
    }
  }
  return {files,sourceHash:digest(files),libraries};
}
const browserExternalFiles=Object.freeze(['project-builder-format.js','core-contract.js','project-pom.js','sharing/contracts.js','sharing/authoring.js','sharing/consumer.js','sharing/jar.js','sharing/configuration.js','sharing/tutorial-practice.js']);
async function buildProfileHash(engineRoot=__dirname,{externalRoot=path.resolve(__dirname,'..'),coreContractPath=path.join(externalRoot,'core-contract.js')}={}) {
  const savedRoot=await savedEngineRoot(engineRoot);
  if(savedRoot)return digest((await readSavedBuilder(savedRoot)).files);
  const files=await tree(engineRoot);
  for(const name of browserExternalFiles) {
    const file=name==='core-contract.js'?coreContractPath:path.join(externalRoot,...name.split('/'));
    await safePath(file);
    let bytes;try {const stat=await fs.lstat(file);if(!stat.isFile())throw new Error('not a file');bytes=await fs.readFile(file);}
    catch {throw new Error('Browser compiler ' + (name==='core-contract.js'?'core contract':'external dependency') + ' is missing or unreadable: ' + file);}
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
  const before=await captureBuildInputs(root);
  if(!inventoryMatches(before.files,manifest.inputs))throw new Error('The project changed since its browser build. Choose Export for web or Publish app again.');
  const published=await resolveLibrarySources(root,before,{sharingSettings,fetcher,signal});
  if(JSON.stringify(published.publishedLibraries)!==JSON.stringify(manifest.publishedLibraries||[]))throw new Error('The accepted library evidence changed since this browser build. Choose Export for web or Publish app again.');
  if(boundSourceHash(before.sourceHash,published.publishedLibraries)!==manifest.sourceHash||manifest.localSourceHash&&manifest.localSourceHash!==before.sourceHash)throw new Error('The project or accepted library changed since its browser build. Choose Export for web or Publish app again.');
  const profileHash=await buildProfileHash(engineRoot);
  if(manifest.profileHash!==profileHash)throw new Error('Zero’s browser compiler or compatibility rules changed. Choose Export for web or Publish app again.');
  const siteFiles=await tree(manifest.sitePath);
  if(!inventoryMatches(siteFiles,manifest.files)||manifest.totalBytes!==siteFiles.reduce((sum,f)=>sum+f.bytes.length,0))throw new Error('The browser build files changed or are incomplete. Choose Export for web or Publish app again.');
  if(!siteFiles.some(f=>f.path==='index.html'&&f.bytes.length)||!siteFiles.some(f=>f.path==='zero_web.nocache.js'&&f.bytes.length)||!siteFiles.some(f=>/\.cache\.js$/.test(f.path)&&f.bytes.length))throw new Error('The browser build is incomplete. Choose Export for web or Publish app again.');
  await safePath(manifest.zipPath);
  const zipBytes=await fs.readFile(manifest.zipPath);
  const byPath=new Map(siteFiles.map(file=>[file.path,file]));
  if(!zipBytes.equals(zipFiles(manifest.files.map(file=>byPath.get(file.path)))))throw new Error('The browser ZIP differs from the validated app. Choose Export for web or Publish app again.');
  const outputFiles=await tree(output);
  const allowed=new Set(['manifest.json','web-export.zip',...siteFiles.map(f=>'site/'+f.path)]);
  if(outputFiles.some(f=>!allowed.has(f.path)))throw new Error('The browser build folder contains unvalidated files. Choose Export for web or Publish app again.');
  abort(signal);
  if((await captureBuildInputs(root)).sourceHash!==before.sourceHash||(await buildProfileHash(engineRoot))!==profileHash)throw new Error('The project or browser compiler changed during validation. Choose Export for web or Publish app again.');
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
  const raw=await git(projectRoot,['ls-tree','-r','-z',sourceSha,'--','src/main/java','src/main/resources','pom.xml','mvnw','mvnw.cmd','.mvn','zero-core.json','zero-libraries.json','libraries','.zero-build']);
  const committed=new Map();
  for(const entry of String(raw).split('\0').filter(Boolean)) {
    const match=/^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    if(!match)throw new Error('Uploaded browser inputs must be ordinary tracked files.');
    if(match[3]==='src/main/resources/.gitkeep'||match[3].startsWith('libraries/')&&!inputs.files.some(file=>file.path===match[3]))continue;
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
module.exports={commitInputMetadata,assertSelectedBuilder,readSavedBuilder,browserExternalFiles,captureBuildInputs,buildProfileHash,boundSourceHash,validateExport,ensureValidatedExport,assertBuildInputsAtCommit,_test:{digest,inventoryMatches,tree}};
