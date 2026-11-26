'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {zipFiles}=require('../src/web-export/zip');
const {captureBuildInputs,buildProfileHash,validateExport,ensureValidatedExport}=require('../src/web-export/snapshot');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-snapshot-'))),root=path.join(base,'project'),engineRoot=path.join(base,'engine');
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 for(const dir of ['src/main/java','src/main/resources','.mvn/wrapper'])await fs.mkdir(path.join(root,dir),{recursive:true});
 await fs.mkdir(engineRoot);await fs.writeFile(path.join(engineRoot,'rules.json'),'reviewed rules');
 for(const [name,body]of [['pom.xml','<project/>'],['mvnw','wrapper'],['mvnw.cmd','windows wrapper'],['.mvn/wrapper/maven-wrapper.properties','pinned'],['src/main/java/Main.java','class Main {}'],['src/main/resources/tone.wav','sound']])await fs.writeFile(path.join(root,name),body);
 const output=path.join(root,'.zero/web-export'),sitePath=path.join(output,'site'),zipPath=path.join(output,'web-export.zip'),manifestPath=path.join(output,'manifest.json');
 const options={projectRoot:root,engineRoot};let builds=0;
 async function build() {
  builds++;const inputs=await captureBuildInputs(root);
  const files=[{path:'zero_web.nocache.js',bytes:Buffer.from('bootstrap')},{path:'index.html',bytes:Buffer.from('app')},{path:'A.cache.js',bytes:Buffer.from('compiled')}];
  await fs.rm(output,{recursive:true,force:true});await fs.mkdir(sitePath,{recursive:true});
  for(const file of files)await fs.writeFile(path.join(sitePath,file.path),file.bytes);
  const manifest={schemaVersion:1,buildId:'build-'+builds,sourceHash:inputs.sourceHash,profileHash:await buildProfileHash(engineRoot),compatibility:{status:'passed'},sitePath,zipPath,inputs:inputs.files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:sha(f.bytes)})),files:files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:sha(f.bytes)})),totalBytes:files.reduce((n,f)=>n+f.bytes.length,0)};
  await fs.writeFile(zipPath,zipFiles(files));await fs.writeFile(manifestPath,JSON.stringify(manifest));return {buildId:manifest.buildId,manifestPath};
 }
 await build();return {root,engineRoot,sitePath,zipPath,manifestPath,options,build,get builds(){return builds;}};
}
test('snapshot reuses exact validated bytes and preserves ZIP member order',async t=>{
 const f=await fixture(t),result=await ensureValidatedExport({...f.options,engine:{exportForWeb:f.build}});
 assert.equal(f.builds,1);assert.equal(result.buildId,'build-1');assert.ok(result.zipBytes.equals(await fs.readFile(f.zipPath)));assert.equal(result.siteFiles.length,3);
});
test('Finder metadata in resource folders does not invalidate the browser snapshot',async t=>{
 const f=await fixture(t),before=await captureBuildInputs(f.root);
 const resourceRoot=path.join(f.root,'src/main/resources');
 await fs.mkdir(path.join(resourceRoot,'images'));
 await fs.writeFile(path.join(resourceRoot,'.DS_Store'),'folder view');
 await fs.writeFile(path.join(resourceRoot,'images/.DS_Store'),'other folder view');
 const captured=await captureBuildInputs(f.root);
 assert.equal(captured.sourceHash,before.sourceHash);
 assert.deepEqual(captured.files,before.files);
 assert.equal((await validateExport(f.options)).buildId,'build-1');
 await fs.unlink(path.join(resourceRoot,'.DS_Store'));
 await fs.link(path.join(resourceRoot,'tone.wav'),path.join(resourceRoot,'.DS_Store'));
 await assert.rejects(captureBuildInputs(f.root),/linked Finder metadata/);
});
for(const name of ['src/main/java/Main.java','src/main/resources/tone.wav','pom.xml','mvnw','.mvn/wrapper/maven-wrapper.properties'])test('input drift invalidates snapshot: '+name,async t=>{
 const f=await fixture(t);await fs.appendFile(path.join(f.root,name),' changed');await assert.rejects(validateExport(f.options),/project changed.*Choose Export for web or Publish app again/);
 const result=await ensureValidatedExport({...f.options,engine:{exportForWeb:f.build}});assert.equal(result.buildId,'build-2');
});
test('new input file and current compiler contract invalidate reuse',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'src/main/java/Other.java'),'class Other{}');await assert.rejects(validateExport(f.options),/project changed/);await f.build();
 await fs.writeFile(path.join(f.engineRoot,'rules.json'),'new rules');await assert.rejects(validateExport(f.options),/compatibility rules changed/);
});
test('changed site, ZIP, extra output and removed entrypoint cannot be previewed',async t=>{
 const f=await fixture(t);
 await fs.writeFile(path.join(f.sitePath,'index.html'),'tampered');await assert.rejects(validateExport(f.options),/files changed/);await f.build();
 await fs.appendFile(f.zipPath,'extra');await assert.rejects(validateExport(f.options),/ZIP differs/);await f.build();
 await fs.writeFile(path.join(f.root,'.zero/web-export/private.txt'),'secret');await assert.rejects(validateExport(f.options),/unvalidated files/);await f.build();
 await fs.rm(path.join(f.sitePath,'zero_web.nocache.js'));await assert.rejects(validateExport(f.options),/files changed/);
});
test('previous result cannot silently select a replacement build',async t=>{
 const f=await fixture(t),first=await validateExport(f.options);await f.build();await assert.rejects(validateExport({...f.options,result:first}),/replaced/);
});
test('legacy export without strict receipt cannot be reused',async t=>{
 const f=await fixture(t),m=JSON.parse(await fs.readFile(f.manifestPath));delete m.compatibility;await fs.writeFile(f.manifestPath,JSON.stringify(m));await assert.rejects(validateExport(f.options),/current compatibility/);
});
test('symlinked inputs and outputs are rejected',async t=>{
 const f=await fixture(t);await fs.symlink(path.join(f.root,'pom.xml'),path.join(f.sitePath,'extra'));await assert.rejects(validateExport(f.options),/symbolic links/);await fs.unlink(path.join(f.sitePath,'extra'));
 await fs.rename(path.join(f.root,'mvnw'),path.join(f.root,'original-wrapper'));await fs.symlink(path.join(f.root,'original-wrapper'),path.join(f.root,'mvnw'));await assert.rejects(validateExport(f.options),/symbolic links/);
});
test('cancelled build cannot be returned or rebuild after cancellation',async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();await assert.rejects(ensureValidatedExport({...f.options,signal:controller.signal,engine:{exportForWeb:f.build}}),{name:'AbortError'});assert.equal(f.builds,1);
});

test('ordinary input limits reject oversized files, totals, counts, entries and depth before content reads',async t=>{
 const f=await fixture(t),open=fs.open;let opens=0;
 t.mock.method(fs,'open',async(...args)=>{opens++;return open(...args);});
 await fs.writeFile(path.join(f.root,'src/main/resources/large.bin'),Buffer.alloc(129));
 for(const [limits,message]of [[{fileBytes:128},/file limit/],[{totalBytes:32},/total limit/],[{files:2},/file limit/],[{entries:1},/entry limit/]]) {
  opens=0;await assert.rejects(captureBuildInputs(f.root,{limits}),message);assert.equal(opens,0,'preflight rejects before opening content');
 }
 await fs.mkdir(path.join(f.root,'src/main/resources/a/b/c'),{recursive:true});
 opens=0;await assert.rejects(captureBuildInputs(f.root,{limits:{depth:1}}),/depth limit/);assert.equal(opens,0);
});

test('resource metadata snapshots preserve exact digest/order without retaining asset buffers or rereading assets',async t=>{
 const f=await fixture(t),resource=path.join(f.root,'src/main/resources/tone.wav');
 const content=Buffer.alloc(3*65536+7);for(let i=0;i<content.length;i++)content[i]=i%251;
 await fs.writeFile(resource,content);
 const open=fs.open;let reads=0,readBytes=0,maxRead=0;
 t.mock.method(fs,'open',async(filename,...args)=>{
  const handle=await open(filename,...args);if(filename!==resource)return handle;
  return {stat:handle.stat.bind(handle),close:handle.close.bind(handle),read:async(...args)=>{const result=await handle.read(...args);reads++;readBytes+=result.bytesRead;maxRead=Math.max(maxRead,args[2]);return result;}};
 });
 const full=await captureBuildInputs(f.root),metadata=await captureBuildInputs(f.root,{metadataOnlyResources:true});
 assert.equal(full.sourceHash,require('../src/web-export/snapshot')._test.digest(full.files));
 assert.equal(metadata.sourceHash,full.sourceHash);assert.deepEqual(metadata.files.map(file=>file.path),full.files.map(file=>file.path));
 const asset=metadata.files.find(file=>file.path==='src/main/resources/tone.wav');
 assert.equal(Object.hasOwn(asset,'bytes'),false);assert.equal(asset.byteLength,content.length);assert.equal(asset.sha256,sha(content));
 assert.equal(readBytes,content.length*2,'each capture reads each asset exactly once');assert.equal(reads,8);assert.equal(maxRead,65536);
 await fs.writeFile(resource,Buffer.from(content).fill(42));
 assert.notEqual((await captureBuildInputs(f.root,{metadataOnlyResources:true})).sourceHash,metadata.sourceHash);
});

test('snapshot cancellation stops traversal and chunk reads and closes an active resource handle',async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(captureBuildInputs(f.root,{signal:controller.signal}),{name:'AbortError'});
 const resource=path.join(f.root,'src/main/resources/tone.wav');await fs.writeFile(resource,Buffer.alloc(3*65536));
 const duringRead=new AbortController(),open=fs.open;let reads=0,closed=false;
 t.mock.method(fs,'open',async(filename,...args)=>{const handle=await open(filename,...args);if(filename!==resource)return handle;return {stat:handle.stat.bind(handle),close:async()=>{closed=true;await handle.close();},read:async(...args)=>{const result=await handle.read(...args);reads++;duringRead.abort();return result;}};});
 await assert.rejects(captureBuildInputs(f.root,{signal:duringRead.signal,metadataOnlyResources:true}),{name:'AbortError'});
 assert.equal(reads,1);assert.equal(closed,true);
});

test('cancellation during inventory stops before opening any input content',async t=>{
 const f=await fixture(t),controller=new AbortController(),lstat=fs.lstat,open=fs.open;let opens=0;
 t.mock.method(fs,'lstat',async(filename,...args)=>{const result=await lstat(filename,...args);if(filename===path.join(f.root,'src/main/resources/tone.wav'))controller.abort();return result;});
 t.mock.method(fs,'open',async(...args)=>{opens++;return open(...args);});
 await assert.rejects(captureBuildInputs(f.root,{signal:controller.signal}),{name:'AbortError'});assert.equal(opens,0);
});

test('a replacement between inventory and opening is rejected before its bytes are accepted',async t=>{
 const f=await fixture(t),resource=path.join(f.root,'src/main/resources/tone.wav'),open=fs.open;let replaced=false;
 t.mock.method(fs,'open',async(filename,...args)=>{if(filename===resource&&!replaced){replaced=true;await fs.rename(resource,resource+'.old');await fs.writeFile(resource,'sound');}return open(filename,...args);});
 await assert.rejects(captureBuildInputs(f.root,{metadataOnlyResources:true}),/changed while reading/);assert.equal(replaced,true);
});

for(const metadataOnlyResources of [false,true])test('snapshot rejects same-length mutations and path replacement during '+(metadataOnlyResources?'streaming':'buffered')+' reads',async t=>{
 const f=await fixture(t),resource=path.join(f.root,'src/main/resources/tone.wav'),originalStat=await fs.stat(resource),open=fs.open;let mutation='rewrite',mutated=false;
 t.mock.method(fs,'open',async(filename,...args)=>{const handle=await open(filename,...args);if(filename!==resource)return handle;return {stat:handle.stat.bind(handle),close:handle.close.bind(handle),read:async(...args)=>{const result=await handle.read(...args);if(!mutated){mutated=true;if(mutation==='replace'){await fs.rename(resource,resource+'.old');await fs.writeFile(resource,'sound');}else{await fs.writeFile(resource,'other');await fs.utimes(resource,originalStat.atime,originalStat.mtime);}}return result;}};});
 await assert.rejects(captureBuildInputs(f.root,{metadataOnlyResources}),/changed while reading/);
 mutation='replace';mutated=false;
 await assert.rejects(captureBuildInputs(f.root,{metadataOnlyResources}),/changed while reading/);
});

test('captured local library discovery retains validation and streams its resources with the same identity',async t=>{
 const f=await fixture(t),authoring=require('../src/sharing/authoring');
 await fs.writeFile(path.join(f.root,'zero.json'),'{}');await fs.writeFile(path.join(f.root,'src/main/java/Health.java'),'public class Health { public int value(){ return 1; } }');
 await fs.writeFile(path.join(f.root,'pom.xml'),await fs.readFile(path.resolve(__dirname,'../../student-template/pom.xml')));
 await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository:{id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},descriptor:{schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health bar',description:'Captured library resource test',license:'MIT',libraryKind:'helper'},sources:['src/main/java/Health.java']}));
 const name='libraries/health-bar/src/main/resources/zero/contrib/r12345/health_bar/icon.txt';await fs.mkdir(path.dirname(path.join(f.root,name)),{recursive:true});await fs.writeFile(path.join(f.root,name),'exact local resource');
 await fs.writeFile(path.join(path.dirname(path.join(f.root,name)),'.DS_Store'),'Finder view');
 const open=fs.open,sourceReads=new Map();
 t.mock.method(fs,'open',async(filename,...args)=>{if(filename.endsWith('.java'))sourceReads.set(filename,(sourceReads.get(filename)||0)+1);return open(filename,...args);});
 const full=await captureBuildInputs(f.root),metadata=await captureBuildInputs(f.root,{metadataOnlyResources:true});
 assert.equal(metadata.sourceHash,full.sourceHash);assert.equal(Object.hasOwn(metadata.files.find(file=>file.path===name),'bytes'),false);
 const resolved=await require('../src/web-export/libraries').resolveLibrarySources(f.root,metadata);
 assert.equal(resolved.sources.length,1);assert.deepEqual(resolved.resources.map(file=>file.path),['zero/contrib/r12345/health_bar/icon.txt']);
 assert.equal(full.files.some(file=>file.path==='zero.json'),false,'marker remains outside the original browser digest');
 assert.ok(sourceReads.size>=2);assert.ok([...sourceReads.values()].every(count=>count===2),'discovery reuses each captured source, with one content read per snapshot');
});

test('publish binds every build input to committed Git blobs, including ignored resources',async t=>{
 const f=await fixture(t),{execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
 const git=async(root,args)=>(await exec('git',args,{cwd:root})).stdout;
 await fs.writeFile(path.join(f.root,'src/main/resources/.DS_Store'),'tracked Finder metadata');
 await git(f.root,['init','-b','main']);await git(f.root,['add','src','pom.xml','mvnw','mvnw.cmd','.mvn']);
 await git(f.root,['add','-f','src/main/resources/.DS_Store']);
 await git(f.root,['-c','user.name=Zero test','-c','user.email=test@example.invalid','commit','-m','test']);
 const sourceSha=(await git(f.root,['rev-parse','HEAD'])).trim();
 const {assertBuildInputsAtCommit}=require('../src/web-export/snapshot');
 let result=await validateExport(f.options);
 assert.equal((await assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha,git})).inputCount,6);
 await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'class Main {}\r\n');
 await assert.rejects(assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha,git}),/project changed/);
 await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'class Main {}');
 await fs.writeFile(path.join(f.root,'.gitignore'),'src/main/resources/ignored.wav\n');await fs.writeFile(path.join(f.root,'src/main/resources/ignored.wav'),'never uploaded');await f.build();result=await validateExport(f.options);
 await assert.rejects(assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha,git}),/missing from the uploaded commit/);
 await fs.rm(path.join(f.root,'src/main/resources/ignored.wav'));await fs.writeFile(path.join(f.root,'src/main/resources/tone.wav'),'different local resource');await f.build();result=await validateExport(f.options);
 await assert.rejects(assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha,git}),/differs from the uploaded commit/);
});
test('standard CRLF source normalization does not allow changed resources or Git filters',async t=>{
 const f=await fixture(t),{assertBuildInputsAtCommit}=require('../src/web-export/snapshot');
 await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'class Main {}\r\n');await f.build();const result=await validateExport(f.options);
 const inputs=await captureBuildInputs(f.root),blob=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 const git=async()=>inputs.files.map(file=>'100644 blob '+blob(file.path.endsWith('.java')?Buffer.from(file.bytes.toString().replace(/\r\n/g,'\n')):file.bytes)+'\t'+file.path+'\0').join('');
 const receipt=await assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha:'a'.repeat(40),git});assert.deepEqual(receipt.normalizedSourceLineEndings,['src/main/java/Main.java']);
});

test('profile hashes bind the central core contract even for custom engine fixtures',async t=>{
 const f=await fixture(t),coreContractPath=path.join(path.dirname(f.engineRoot),'core-contract.js');
 await fs.writeFile(coreContractPath,'reviewed current core');
 const before=await buildProfileHash(f.engineRoot,{coreContractPath});
 await fs.writeFile(coreContractPath,'changed current core');
 assert.notEqual(await buildProfileHash(f.engineRoot,{coreContractPath}),before);
 await fs.unlink(coreContractPath);
 await assert.rejects(buildProfileHash(f.engineRoot,{coreContractPath}),/core contract is missing/);
});


test('profile binds each bounded external parser and library dependency, refusing absent inputs',async t=>{
 const f=await fixture(t),externalRoot=path.join(path.dirname(f.engineRoot),'external');
 const {browserExternalFiles}=require('../src/web-export/snapshot');
 for(const name of browserExternalFiles){const file=path.join(externalRoot,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'reviewed '+name);}
 for(const name of browserExternalFiles){const before=await buildProfileHash(f.engineRoot,{externalRoot});const file=path.join(externalRoot,name);await fs.appendFile(file,' changed');assert.notEqual(await buildProfileHash(f.engineRoot,{externalRoot}),before,name);}
 await fs.unlink(path.join(externalRoot,'sharing/jar.js'));
 await assert.rejects(buildProfileHash(f.engineRoot,{externalRoot}),/external dependency is missing/);
});

test('saved builder profile binds CLI, runtime, media and manifest without importing saved code',async t=>{
 const f=await fixture(t),{prepareProjectBuilder}=await import('../../scripts/prepare-project-builder.mjs');
 const builderRoot=path.join(f.root,'.zero-build');await prepareProjectBuilder({destination:builderRoot});
 const engineRoot=path.join(builderRoot,'src/web-export'),before=await buildProfileHash(engineRoot);
 const inputs=await captureBuildInputs(f.root);
 assert.ok(inputs.files.some(file=>file.path==='.zero-build/run.cjs'));
 assert.ok(inputs.files.some(file=>file.path==='.zero-build/builder.json'));
 const format=require('../src/project-builder-format'),{readSavedBuilder}=require('../src/web-export/snapshot');
 for(const name of ['run.cjs','runtime-lock.json','media/sharing-config.json']) {
  const filename=path.join(builderRoot,name),original=await fs.readFile(filename);
  // Keep metadata coherent to establish that profile binding covers changes even
  // when a deliberate producer creates a fresh valid inventory.
  const bytes=name.endsWith('.json')?Buffer.from(JSON.stringify(JSON.parse(original),null,4)+'\n'):Buffer.concat([original,Buffer.from('\nthrow new Error("MUST NOT EXECUTE");\n')]);
  await fs.writeFile(filename,bytes);
  await assert.rejects(readSavedBuilder(builderRoot),/changed/);
  const {readBuilderTree}=await import('../../scripts/prepare-project-builder.mjs');
  const files=(await readBuilderTree(builderRoot)).filter(file=>file.path!=='builder.json');
  await fs.writeFile(path.join(builderRoot,'builder.json'),JSON.stringify(format.createBuilderManifest(files),null,2)+'\n');
  assert.notEqual(await buildProfileHash(engineRoot),before,name);
  await fs.writeFile(filename,original);
  const restored=(await readBuilderTree(builderRoot)).filter(file=>file.path!=='builder.json');
  await fs.writeFile(path.join(builderRoot,'builder.json'),JSON.stringify(format.createBuilderManifest(restored),null,2)+'\n');
 }
 assert.equal(await buildProfileHash(engineRoot),before);
 await fs.rm(path.join(builderRoot,'builder.json'));
 await assert.rejects(captureBuildInputs(f.root),/builder.json is missing/);
});

test('saved builder closure is required in the actual uploaded commit',async t=>{
 const f=await fixture(t),{prepareProjectBuilder}=await import('../../scripts/prepare-project-builder.mjs');
 await prepareProjectBuilder({destination:path.join(f.root,'.zero-build')});await f.build();
 const inputs=await captureBuildInputs(f.root),result=await validateExport(f.options);
 const {assertBuildInputsAtCommit}=require('../src/web-export/snapshot');
 await assert.rejects(assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha:'a'.repeat(40)}),/host Git operation/);
 const blob=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 let requested;
 const git=async(root,args)=>{requested=args;return inputs.files.map(file=>'100644 blob '+blob(file.bytes)+'\t'+file.path+'\0').join('');};
 assert.equal((await assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha:'a'.repeat(40),git})).inputCount,inputs.files.length);
 assert.ok(requested.includes('.zero-build'));
 await assert.rejects(assertBuildInputsAtCommit({projectRoot:f.root,result,sourceSha:'a'.repeat(40),git:async()=>inputs.files.filter(file=>!file.path.startsWith('.zero-build/')).map(file=>'100644 blob '+blob(file.bytes)+'\t'+file.path+'\0').join('')}),/missing from the uploaded commit/);
});

test('installed exporter cannot replace saved tooling; exact frozen copies are selected by bytes',async t=>{
 const f=await fixture(t),{prepareProjectBuilder}=await import('../../scripts/prepare-project-builder.mjs');
 const builderRoot=path.join(f.root,'.zero-build');await prepareProjectBuilder({destination:builderRoot});
 const {exportForWeb}=require('../src/web-export');
 await assert.rejects(exportForWeb({projectRoot:f.root}),/installed exporter cannot replace it/);
 const frozenRoot=path.join(path.dirname(f.root),'frozen-builder');await fs.cp(builderRoot,frozenRoot,{recursive:true});
 const {assertSelectedBuilder,readSavedBuilder}=require('../src/web-export/snapshot');
 const selected=await assertSelectedBuilder(f.root,path.join(frozenRoot,'src/web-export'));
 assert.equal(selected.profileHash,await buildProfileHash(path.join(builderRoot,'src/web-export')));
 assert.equal(await buildProfileHash(path.join(frozenRoot,'src/web-export')),selected.profileHash);
 // A self-consistent different closure must still fail selection.
 await fs.appendFile(path.join(frozenRoot,'README.md'),'\nDifferent reviewed revision.\n');
 const {readBuilderTree}=await import('../../scripts/prepare-project-builder.mjs'),format=require('../src/project-builder-format');
 const changed=(await readBuilderTree(frozenRoot)).filter(file=>file.path!=='builder.json');
 await fs.writeFile(path.join(frozenRoot,'builder.json'),JSON.stringify(format.createBuilderManifest(changed)));
 await readSavedBuilder(frozenRoot);
 await assert.rejects(assertSelectedBuilder(f.root,path.join(frozenRoot,'src/web-export')),/differs from the project/);
 await assert.rejects(require(path.join(frozenRoot,'src/web-export')).exportForWeb({projectRoot:f.root}),/differs from the project/);
});
