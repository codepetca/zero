'use strict';
// Host boundary: project metadata is data until an explicit trusted action.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn:spawnChild,execFile:execFileCallback}=require('node:child_process');
const {promisify}=require('node:util');
const format=require('./project-builder-format');
const {ordinary,readTree,inventoryMatches,relative,validateRetainedExport}=require('./retained-web-export');
const execFile=promisify(execFileCallback);
const unavailable=message=>Object.assign(Error('Project browser tooling unavailable: '+message+' See .zero-build/README.md, or restore the complete saved tooling from your project’s Git history. Older projects need a deliberate, reversible tooling upgrade; opening a project never upgrades it.'),{code:'ZERO_BUILDER_UNAVAILABLE'});
const aborted=()=>Object.assign(Error('Browser build cancelled.'),{name:'AbortError'});
function digest(files){const hash=require('node:crypto').createHash('sha256');for(const file of [...files].sort((a,b)=>a.path.localeCompare(b.path)))hash.update(file.path).update('\0').update(file.bytes).update('\0');return hash.digest('hex');}
async function readSavedBuilder(projectRoot,{metadataOnly=false}={}){
 const builderRoot=path.join(path.resolve(projectRoot),'.zero-build');
 try {
  await ordinary(builderRoot,{directory:true});
  if(metadataOnly){
   const metadataPath=path.join(builderRoot,'builder.json');
   await ordinary(metadataPath,{maxBytes:format.LIMITS.manifestBytes});
   const manifest=format.validateBuilderManifest(JSON.parse(await fs.readFile(metadataPath,'utf8')));
   const runtimePath=path.join(builderRoot,'runtime-lock.json');
   await ordinary(runtimePath,{maxBytes:64*1024});
   const bytes=await fs.readFile(runtimePath),entry=manifest.files.find(file=>file.path==='runtime-lock.json');
   if(bytes.length!==entry.bytes||format.sha256(bytes)!==entry.sha256)throw unavailable('runtime metadata differs from the saved inventory.');
   const runtime=format.validateRuntimeLock(JSON.parse(bytes.toString('utf8')));
   return {builderRoot,manifest,runtime,metadataOnly:true};
  }
  const files=[];let total=0,entries=0;
  async function walk(folder,prefix=''){
   for(const item of await fs.readdir(folder,{withFileTypes:true})){
    const name=prefix+item.name,file=path.join(folder,item.name);
    if(++entries>format.LIMITS.files*4)throw unavailable('saved closure has too many paths.');
    if(!format.relativePath(name))throw unavailable('unsafe saved tooling path.');
    if(item.isDirectory()){await ordinary(file,{directory:true});await walk(file,name+'/');}
    else {await ordinary(file,{maxBytes:name==='builder.json'?format.LIMITS.manifestBytes:format.LIMITS.fileBytes});const bytes=await fs.readFile(file);total+=bytes.length;if(files.length>=format.LIMITS.files+1||total>format.LIMITS.totalBytes)throw unavailable('saved closure exceeds limits.');files.push({path:name,bytes});}
   }
  }
  await walk(builderRoot);const metadata=files.find(file=>file.path==='builder.json');if(!metadata)throw unavailable('builder.json is missing.');
  const manifest=format.validateBuilderFiles(JSON.parse(metadata.bytes.toString('utf8')),files.filter(file=>file.path!=='builder.json'));
  const runtime=format.validateRuntimeLock(JSON.parse(files.find(file=>file.path==='runtime-lock.json').bytes.toString('utf8')));
  return {builderRoot,manifest,runtime,files,profileHash:digest(files)};
 }catch(error){if(error.code==='ZERO_BUILDER_UNAVAILABLE')throw error;throw unavailable(error.code==='ENOENT'?'the project has no complete saved .zero-build builder.':error.message);}
}
function sanitizeEnvironment(environment=process.env,platform=process.platform){
 const allowed=new Set(['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','TMPDIR','LANG','LC_ALL']);const clean={};
 for(const [key,value]of Object.entries(environment))if(allowed.has(key.toUpperCase())&&typeof value==='string')clean[key.toUpperCase()==='PATH'?'PATH':key]=value;
 // Relative PATH entries can select executables from a project working folder.
 const paths=platform==='win32'?path.win32:path,delimiter=platform==='win32'?';':path.delimiter;
 clean.PATH=(clean.PATH||'').split(delimiter).filter(part=>paths.isAbsolute(part)).join(delimiter);
 return clean;
}
async function locateRuntimes({runtime,projectRoot,environment=process.env,platform=process.platform,arch=process.arch,execute=execFile,needsJava=true,signal}={}){
 if(signal?.aborted)throw aborted();
 const paths=platform==='win32'?path.win32:path,env=sanitizeEnvironment(environment,platform),suffix=platform==='win32'?'.exe':'',delimiter=platform==='win32'?';':path.delimiter;
 const get=name=>Object.entries(environment).find(([key])=>key.toUpperCase()===name)?.[1];
 const dirs=[...new Set((env.PATH||'').split(delimiter).filter(dir=>dir&&dir!==projectRoot&&!dir.startsWith(projectRoot+paths.sep)))].slice(0,128),nodeCandidates=dirs.map(dir=>paths.join(dir,'node'+suffix));
 env.PATH=dirs.join(delimiter);
 const home=get('JAVA_HOME'),javaHomes=home?[home]:[];
 if(platform==='darwin'&&!home){const base=path.join(get('HOME')||os.homedir(),'Library/Application Support/Zero/runtime');for(const name of (await fs.readdir(base).catch(()=>[])).slice(0,32))if(name.startsWith('jdk-')){javaHomes.push(path.join(base,name));for(const child of (await fs.readdir(path.join(base,name)).catch(()=>[])).slice(0,16))javaHomes.push(path.join(base,name,child,'Contents/Home'));}
 try{const selected=await execute('/usr/libexec/java_home',['-v',String(runtime.requirements.javaMajor)],{env,cwd:os.tmpdir(),timeout:5000,maxBuffer:32768,windowsHide:true,signal});const selectedHome=String(selected.stdout).trim();if(path.isAbsolute(selectedHome))javaHomes.push(selectedHome);}catch{} }
 if(!home)for(const dir of dirs)javaHomes.push(paths.dirname(dir));
 const safe=async candidate=>{if(!paths.isAbsolute(candidate))throw Error('absolute runtime path required');const actual=await fs.realpath(candidate);if(actual===projectRoot||actual.startsWith(projectRoot+path.sep))throw Error('runtime is inside project');if(!(await fs.stat(actual)).isFile())throw Error('ordinary runtime required');return actual;};
 let node,nodeVersion;
 for(const candidate of nodeCandidates){if(signal?.aborted)throw aborted();try{const actual=await safe(candidate),result=await execute(actual,['-p','JSON.stringify({node:process.versions.node,electron:process.versions.electron||null,platform:process.platform,arch:process.arch})'],{env,cwd:os.tmpdir(),timeout:5000,maxBuffer:32768,windowsHide:true,signal});const version=JSON.parse(String(result.stdout).trim());if(version.electron||Number(version.node?.split('.')[0])!==runtime.requirements.nodeMajor)continue;node=actual;nodeVersion=version.node;break;}catch{}}
 if(signal?.aborted)throw aborted();
 if(!node)throw unavailable('standalone Node '+runtime.requirements.nodeMajor+' is missing from the host PATH (the editor Electron runtime cannot build projects).');
 let javaHome,javaVersion;
 if(needsJava){for(const candidate of javaHomes){if(signal?.aborted)throw aborted();try{const java=await safe(paths.join(candidate,'bin','java'+suffix)),javac=await safe(paths.join(candidate,'bin','javac'+suffix));const [run,compile]=await Promise.all([execute(java,['-version'],{env,cwd:os.tmpdir(),timeout:5000,maxBuffer:32768,windowsHide:true,signal}),execute(javac,['-version'],{env,cwd:os.tmpdir(),timeout:5000,maxBuffer:32768,windowsHide:true,signal})]);const text=String(run.stderr||'')+String(run.stdout||''),version=/version "([0-9][^"]*)"/.exec(text)?.[1],compiler=/javac (\d+)/.exec(String(compile.stdout||'')+String(compile.stderr||''));if(Number(version?.split('.')[0])!==runtime.requirements.javaMajor||Number(compiler?.[1])!==runtime.requirements.javaMajor)continue;javaHome=paths.dirname(paths.dirname(java));javaVersion=version;break;}catch{}}
 if(signal?.aborted)throw aborted();
 if(!javaHome)throw unavailable('standalone JDK '+runtime.requirements.javaMajor+' with matching java and javac is missing'+(home?' from JAVA_HOME':'')+'.');env.JAVA_HOME=javaHome;env.PATH=paths.join(javaHome,'bin')+delimiter+env.PATH;}
 const pins=runtime.pins.filter(pin=>pin.platform===platform+'-'+arch);
 return {node,javaHome,env,evidence:{nodeVersion,javaVersion,platform:platform+'-'+arch,testedPins:pins.map(({tool,version})=>({tool,version})),matchesTestedVersions:pins.length>0&&pins.every(pin=>pin.version.replace(/^v/,'').split('+')[0]===(pin.tool==='node'?nodeVersion:javaVersion||'unavailable'))}};
}
function runProtocol({node,entrypoint,request,env,signal,onProgress=()=>{},deadlineMs=15*60*1000,spawn=spawnChild,platform=process.platform,killProcess=process.kill.bind(process)}){
 if(signal?.aborted)return Promise.reject(aborted());const input=Buffer.from(JSON.stringify(request));if(input.length>format.LIMITS.requestBytes)return Promise.reject(unavailable('request exceeds its protocol limit.'));
 return new Promise((resolve,reject)=>{
  const child=spawn(node,[entrypoint],{cwd:path.dirname(entrypoint),env,stdio:['pipe','pipe','pipe'],windowsHide:true,detached:platform!=='win32'});let chunks=[],size=0,stderrSize=0,line='',failure,closed=false,killTimer;
  const kill=(force=true)=>{if(!child.pid)return;if(platform==='win32'){const system=Object.entries(env).find(([key])=>key.toUpperCase()==='SYSTEMROOT')?.[1];if(system)spawn(path.win32.join(system,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{env,stdio:'ignore',windowsHide:true}).on('error',()=>child.kill());else child.kill();}else {try{killProcess(-child.pid,force?'SIGKILL':'SIGTERM');}catch{child.kill(force?'SIGKILL':'SIGTERM');}}};
  const fail=error=>{if(failure)return;failure=error;kill(false);killTimer=setTimeout(()=>kill(true),5500);killTimer.unref?.();};
  const cancel=()=>fail(aborted()),timer=setTimeout(()=>fail(unavailable('the builder exceeded its deadline.')),deadlineMs);timer.unref?.();signal?.addEventListener('abort',cancel,{once:true});
  const finish=(error,result)=>{if(closed)return;closed=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',cancel);kill();error?reject(error):resolve(result);};
  child.on('error',error=>finish(unavailable('could not start standalone Node: '+error.message)));
  child.stdout.on('data',bytes=>{size+=bytes.length;if(size>2*1024*1024){fail(unavailable('builder response exceeded 2 MiB.'));return;}chunks.push(bytes);});
  child.stderr.on('data',bytes=>{stderrSize+=bytes.length;if(stderrSize>1024*1024){fail(unavailable('builder progress exceeded its limit.'));return;}line+=bytes.toString('utf8');const parts=line.split(/\r?\n/);line=parts.pop();if(line.length>8192||parts.some(part=>part.length>8192)){fail(unavailable('builder progress line exceeded its limit.'));return;}for(const part of parts){try{onProgress(part.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').slice(0,4096));}catch(error){fail(error);break;}}});
  child.on('close',code=>{if(failure)return finish(failure);let response;try{response=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return finish(unavailable('builder returned invalid JSON.'));}if(response.protocol!==1||typeof response.ok!=='boolean')return finish(unavailable('builder operation failed: unsupported response protocol.'));if(!response.ok){const message=String(response.error?.message||'Browser build failed. Check the Zero output.').slice(0,4096);return finish(response.error?.code==='cancelled'?aborted():Object.assign(Error(message),{code:'ZERO_BUILDER_OPERATION_FAILED'}));}if(code!==0)return finish(unavailable('builder exited unsuccessfully.'));finish(null,response.result);});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
async function currentInputs(projectRoot,manifest){
 if(!Array.isArray(manifest.inputs)||manifest.inputs.length>10000)throw unavailable('invalid source inventory.');
 const files=[];let total=0;for(const entry of manifest.inputs){if(!relative(entry.path))throw unavailable('unsafe source inventory path.');const filename=path.join(projectRoot,...entry.path.split('/'));const stat=await ordinary(filename);total+=stat.size;if(total>256*1024*1024)throw unavailable('source inventory exceeds its byte limit.');files.push({path:entry.path,bytes:await fs.readFile(filename)});}
 if(!inventoryMatches(files,manifest.inputs))throw unavailable('project inputs changed since the browser build. Export again.');
 const expected=new Set(files.map(file=>file.path));const roots=new Set(['src/main/java','src/main/resources','.mvn','.zero-build']);
 for(const name of expected){const match=/^(libraries\/[^/]+)\/(src\/main\/(?:java|resources))\//.exec(name);if(match)roots.add(match[1]+'/'+match[2]);}
 for(const folder of roots){let actual;try{actual=await readTree(path.join(projectRoot,folder));}catch(error){if(error.code==='ENOENT')continue;throw error;}for(const file of actual){const name=folder+'/'+file.path;if(name==='src/main/resources/.gitkeep')continue;if(!expected.has(name))throw unavailable('new build input is absent from the browser receipt: '+name);}}
 for(const name of ['pom.xml','mvnw','mvnw.cmd','zero-core.json','zero-libraries.json']){const stat=await fs.lstat(path.join(projectRoot,name)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(stat&&!expected.has(name))throw unavailable('new build input is absent from the browser receipt: '+name);}
 if(digest(files)!==(manifest.localSourceHash||manifest.sourceHash))throw unavailable('the source digest differs from its exact input receipt.');return files;
}
function createProjectBuilder({isTrusted=()=>false,environment=process.env,platform=process.platform,arch=process.arch,spawn=spawnChild,execute=execFile,deadlineMs}={}){
 const authorize=options=>{if(options.explicitAction!==true||isTrusted()!==true)throw unavailable('choose Browser Run, Export or Publish explicitly in a trusted workspace.');if(options.signal?.aborted)throw aborted();};
 async function operation(options,operation){
  authorize(options);const projectRoot=path.resolve(options.projectRoot),before=await readSavedBuilder(projectRoot),runtime=await locateRuntimes({runtime:before.runtime,projectRoot,environment,platform,arch,execute,needsJava:operation!=='validate',signal:options.signal});
  const temporaryBase=await fs.realpath(os.tmpdir()),frozen=await fs.realpath(await fs.mkdtemp(path.join(temporaryBase,'zero-project-builder-')));
  try {
   for(const file of before.files){const target=path.join(frozen,...file.path.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.bytes,{flag:'wx',mode:0o600});}
   if((await readSavedBuilder(projectRoot)).profileHash!==before.profileHash)throw unavailable('saved tooling changed before execution.');authorize(options);
   const cacheBase=path.resolve(options.cacheRoot||path.join(temporaryBase,'zero-web-cache')),identity=before.manifest.closureSha256+'-'+format.sha256(before.files.find(file=>file.path==='runtime-lock.json').bytes),cacheRoot=path.join(cacheBase,identity);
   if(cacheRoot===projectRoot||cacheRoot.startsWith(projectRoot+path.sep))throw unavailable('the browser cache must be outside the project.');
   const result=await runProtocol({node:runtime.node,entrypoint:path.join(frozen,'run.cjs'),request:{protocol:1,operation,projectRoot,cacheRoot},env:runtime.env,signal:options.signal,onProgress:options.onProgress,deadlineMs,spawn,platform});
   authorize(options);if((await readSavedBuilder(projectRoot)).profileHash!==before.profileHash)throw unavailable('saved tooling changed during execution.');
   if(options.result?.buildId&&result?.buildId!==options.result.buildId)throw unavailable('the browser build was replaced.');
   const validated=await validateRetainedExport({projectRoot,result,signal:options.signal});if(validated.profileHash!==before.profileHash)throw unavailable('the browser result belongs to another builder.');await currentInputs(projectRoot,validated.manifest);
   return {...validated,runtimeEvidence:runtime.evidence};
  }finally{await fs.rm(frozen,{recursive:true,force:true});}
 }
 const ensureValidatedExport=options=>operation(options,'export'),validateExport=options=>operation(options,'validate');
 async function assertBuildInputsAtCommit({projectRoot,result,sourceSha,git}={}){
  if(typeof git!=='function'||! /^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Commit verification requires the host Git operation and exact uploaded commit.');
  const saved=await readSavedBuilder(projectRoot),validated=await validateRetainedExport({projectRoot,result});if(saved.profileHash!==validated.profileHash)throw unavailable('the selected builder differs from the exported builder.');const files=await currentInputs(projectRoot,validated.manifest);
  const raw=await git(projectRoot,['ls-tree','-r','-z',sourceSha,'--','src/main/java','src/main/resources','pom.xml','mvnw','mvnw.cmd','.mvn','zero-core.json','zero-libraries.json','libraries','.zero-build']),committed=new Map(),normalizable=name=>/(?:^|\/)src\/main\/java\/.+\.java$/.test(name)||['pom.xml','mvnw','mvnw.cmd','zero-core.json','zero-libraries.json'].includes(name)||/^libraries\/[^/]+\/zero-library\.json$/.test(name)||/^\.mvn\/.+\.(?:properties|xml|config)$/.test(name),blob=bytes=>require('node:crypto').createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  for(const entry of String(raw).split('\0').filter(Boolean)){const match=/^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);if(!match)throw Error('Uploaded browser inputs must be ordinary tracked files.');if(match[3]==='src/main/resources/.gitkeep'||match[3].startsWith('libraries/')&&!files.some(file=>file.path===match[3]))continue;committed.set(match[3],match[2]);}
  if(committed.size!==files.length)throw Error('Upload all exact Java, resources, Maven setup and saved .zero-build files before publishing.');const normalized=[];
  for(const file of files){const expected=committed.get(file.path);if(expected===blob(file.bytes))continue;if(normalizable(file.path)&&expected===blob(Buffer.from(file.bytes.toString('utf8').replace(/\r\n/g,'\n')))){normalized.push(file.path);continue;}throw Error('The browser input '+file.path+' differs from the uploaded commit.');}
  await currentInputs(projectRoot,validated.manifest);if((await readSavedBuilder(projectRoot)).profileHash!==saved.profileHash)throw unavailable('saved tooling changed during commit verification.');return {sourceSha,sourceHash:validated.sourceHash,inputCount:files.length,normalizedSourceLineEndings:normalized};
 }
 return {readSavedBuilder,ensureValidatedExport,validateExport,validateRetainedExport,assertBuildInputsAtCommit};
}
module.exports={createProjectBuilder,readSavedBuilder,sanitizeEnvironment,locateRuntimes,runProtocol,_test:{digest,currentInputs}};
