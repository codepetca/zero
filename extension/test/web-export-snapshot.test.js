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

test('publish binds every build input to committed Git blobs, including ignored resources',async t=>{
 const f=await fixture(t),{execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
 const git=async(root,args)=>(await exec('git',args,{cwd:root})).stdout;
 await git(f.root,['init','-b','main']);await git(f.root,['add','src','pom.xml','mvnw','mvnw.cmd','.mvn']);
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
