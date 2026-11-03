'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {captureOwnedFiles}=require('../src/web-export/snapshot'),c=require('../src/sharing/contracts');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-owned-snapshot-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const id=c.identity('library','123','widget'),version='1.0.0',dir=path.join(root,'zero-dependencies',id.id,version),pins=[{identity:id,version,storage:'owned'}];await fs.mkdir(dir,{recursive:true});for(const name of ['library.jar','sources.jar','library.pom','LICENSE','manifest.json','.gitattributes'])await fs.writeFile(path.join(dir,name),name);return {root,dir,pins};}
test('captures exact owned bytes and excludes other versions',async t=>{const f=await fixture(t),files=await captureOwnedFiles(f.root,f.pins);assert.equal(files.length,6);assert.equal(files.find(file=>file.path.endsWith('sources.jar')).bytes.toString(),'sources.jar');await fs.writeFile(path.join(f.dir,'sources.jar'),'later');assert.equal(files.find(file=>file.path.endsWith('sources.jar')).bytes.toString(),'sources.jar');});
test('rejects added, missing, linked, or unsafe owned inputs',async t=>{const f=await fixture(t),extra=path.join(f.dir,'extra');await fs.writeFile(extra,'keep');await assert.rejects(captureOwnedFiles(f.root,f.pins),/unowned/);await fs.unlink(extra);const target=path.join(f.dir,'sources.jar');await fs.unlink(target);await assert.rejects(captureOwnedFiles(f.root,f.pins),/missing/);await fs.symlink(path.join(f.dir,'library.jar'),target);await assert.rejects(captureOwnedFiles(f.root,f.pins),/Invalid/);await assert.rejects(captureOwnedFiles(f.root,[{identity:{...f.pins[0].identity,id:'../escape'},version:'1.0.0',storage:'owned'}]));});
test('active owned bytes enter full snapshots and old builder receipts fail closed',async t=>{
 const f=await fixture(t),id=f.pins[0].identity,version='1.0.0';
 for(const name of ['src/main/java','.mvn'])await fs.mkdir(path.join(f.root,name),{recursive:true});
 await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'class Main {}');
 const block=(label,body)=>`<!-- zero-sharing ${label} start -->\n${body}\n<!-- zero-sharing ${label} end -->`;
 const pom=`<project><properties>${block(id.id+' history',`<zero.sharing.${id.id}.previous>none</zero.sharing.${id.id}.previous>`)}${block(id.id+' owned',`<zero.sharing.${id.id}.owned>true</zero.sharing.${id.id}.owned>`)}</properties><dependencies>${block(id.id+' dependency',`<dependency><groupId>${id.coordinate.groupId}</groupId><artifactId>${id.coordinate.artifactId}</artifactId><version>${version}</version></dependency>`)}</dependencies><repositories>${block('repository','<repository><id>zero-sharing</id><url>https://files.example/maven</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>')}</repositories></project>`;
 await fs.writeFile(path.join(f.root,'pom.xml'),pom);
 const {captureBuildInputs}=require('../src/web-export/snapshot'),captured=await captureBuildInputs(f.root);
 assert.equal(captured.files.filter(file=>file.path.startsWith('zero-dependencies/')).length,6);
 const previous=captured.files.filter(file=>!file.path.startsWith('zero-dependencies/'));
 const crypto=require('node:crypto'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const manifest={inputs:previous.map(file=>({path:file.path,bytes:file.bytes.length,sha256:hash(file.bytes)})),localSourceHash:require('../src/project-builder')._test.digest(previous)};
 await assert.rejects(require('../src/project-builder')._test.currentInputs(f.root,manifest),/does not capture/);
 await fs.writeFile(path.join(f.dir,'sources.jar'),'changed');assert.notEqual((await captureBuildInputs(f.root)).sourceHash,captured.sourceHash);
});
