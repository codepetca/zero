'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const authoring=require('../src/sharing/authoring'),contracts=require('../src/sharing/contracts');
const {captureBuildInputs,boundSourceHash,assertBuildInputsAtCommit}=require('../src/web-export/snapshot');
const {resolveLibrarySources,inspectJar}=require('../src/web-export/libraries');
const {validateDependencies}=require('../src/web-export/compatibility');
const {zipFiles}=require('../src/web-export/zip');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
const descriptor={schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health bar',description:'Browser helper',license:'MIT',libraryKind:'helper'};
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-web-library-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.mkdir(path.join(root,'src/main/resources'));
 await fs.cp(path.resolve(__dirname,'../../student-template/.mvn'),path.join(root,'.mvn'),{recursive:true});
 for(const name of ['pom.xml','mvnw','mvnw.cmd'])await fs.copyFile(path.resolve(__dirname,'../../student-template',name),path.join(root,name));
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main { public static void main(String[] args) {} }\n');
 await fs.writeFile(path.join(root,'src/main/java/Health.java'),'public class Health { public int value() { return 7; } }\n');
 await authoring.applyPlan(await authoring.previewExtraction(root,{repository,descriptor,sources:['src/main/java/Health.java']}));
 return root;
}
test('local library source and resources are in the browser snapshot and use the generated POM only',async t=>{
 const root=await fixture(t),source='libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar/Health.java';
 const resource='libraries/health-bar/src/main/resources/zero/contrib/r12345/health_bar/data.txt';
 await fs.mkdir(path.dirname(path.join(root,resource)),{recursive:true});await fs.writeFile(path.join(root,resource),'data');
 const input=await captureBuildInputs(root),files=input.files.map(f=>f.path);
 for(const name of ['zero-libraries.json','libraries/health-bar/zero-library.json',source,resource])assert.ok(files.includes(name),name);
 const resolved=await resolveLibrarySources(root,input);
 assert.deepEqual(resolved.sources.map(f=>f.originalPath),[source]);assert.deepEqual(resolved.resources.map(f=>f.path),['zero/contrib/r12345/health_bar/data.txt']);
 const pom=await fs.readFile(path.join(root,'pom.xml'),'utf8');assert.ok(validateDependencies(pom,{libraries:await authoring.discoverLibraries(root)}));
 await fs.appendFile(path.join(root,source),'// changed\n');assert.notEqual((await captureBuildInputs(root)).sourceHash,input.sourceHash);
 await fs.writeFile(path.join(root,'pom.xml'),pom.replace('build-helper-maven-plugin','exec-maven-plugin'));
 await assert.rejects(captureBuildInputs(root),/generated POM disagree|Library modes|Custom Maven source/);
});
test('published mode uses exact accepted source JAR and ignores editable local copy',async t=>{
 const root=await fixture(t),id=contracts.identity('library',repository.id,descriptor.slug),namespace=id.namespace,sourcePath=namespace.replaceAll('.','/')+'/Health.java';
 await authoring.applyPlan(await authoring.previewMode(root,{slug:descriptor.slug,mode:'published',version:'0.1.0'}));
 const binary=zipFiles([{path:sourcePath.replace('.java','.class'),bytes:Buffer.from('class')},{path:namespace.replaceAll('.','/')+'/data.txt',bytes:Buffer.from('accepted')}]);
 const sources=zipFiles([{path:sourcePath,bytes:Buffer.from(`package ${namespace}; public class Health { public int value() { return 9; } }`)}]);
 const pom=Buffer.from(`<project><modelVersion>4.0.0</modelVersion><groupId>${id.coordinate.groupId}</groupId><artifactId>${id.coordinate.artifactId}</artifactId><version>0.1.0</version></project>`);
 const artifacts={};const values={jar:binary,sources,pom};
 for(const [kind,bytes]of Object.entries(values)){const artifactPath=contracts.artifactPath(id,'0.1.0',kind);artifacts[kind]={path:artifactPath,url:'https://files.example/'+artifactPath,size:bytes.length,sha256:hash(bytes)};}
 const release={schema:1,kind:'library',id:id.id,slug:descriptor.slug,version:'0.1.0',title:descriptor.title,description:descriptor.description,license:'MIT',repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/health-bar',sha256:'b'.repeat(64)},policyRevision:'c'.repeat(40),status:'available',artifacts,namespace,coordinate:{...id.coordinate,version:'0.1.0'},libraryKind:'helper'};
 const settings={catalogUrl:'https://zero.example/catalog',artifactOrigin:'https://files.example'};
 const catalog={schema:1,revision:'d'.repeat(40),releases:[release]};
 const fetcher=async url=>new Response(url===settings.catalogUrl?JSON.stringify(catalog):values[Object.keys(artifacts).find(kind=>artifacts[kind].url===url)]);
 const captured=await captureBuildInputs(root),original=await resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher});
 assert.equal(original.sources.length,1);assert.match(original.sources[0].bytes.toString(),/return 9/);assert.equal(original.resources[0].bytes.toString(),'accepted');
 assert.equal(original.publishedLibraries[0].artifacts.sources.sha256,hash(sources));
 assert.notEqual(boundSourceHash(captured.sourceHash,original.publishedLibraries),captured.sourceHash);
 assert.notEqual(boundSourceHash(captured.sourceHash,original.publishedLibraries),boundSourceHash(captured.sourceHash,[{...original.publishedLibraries[0],artifacts:{...original.publishedLibraries[0].artifacts,sources:{...original.publishedLibraries[0].artifacts.sources,sha256:'0'.repeat(64)}}}]));
 await fs.appendFile(path.join(root,'libraries/health-bar/src/main/java',sourcePath),'// local changed\n');
 assert.equal((await captureBuildInputs(root)).sourceHash,captured.sourceHash);
 values.jar=zipFiles([{path:'other/Extra.class',bytes:Buffer.from('class')}]);artifacts.jar.size=values.jar.length;artifacts.jar.sha256=hash(values.jar);
 await assert.rejects(resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher}),/binary entry outside/);
 catalog.releases[0].status='withdrawn';await assert.rejects(resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher}),/not an available accepted release/);
});
test('source JAR rejects traversal, duplicate classes and modified content',()=>{
 const good=zipFiles([{path:'zero/contrib/r12345/health_bar/Health.java',bytes:Buffer.from('class Health {}')}]);
 assert.equal(inspectJar(good).length,1);
 const tampered=Buffer.from(good);tampered[40]^=1;assert.throws(()=>inspectJar(tampered),/differs|invalid/);
 assert.throws(()=>inspectJar(zipFiles([{path:'../Health.java',bytes:Buffer.from('x')}])),/unsafe/);
 assert.throws(()=>inspectJar(zipFiles([{path:'A.java',bytes:Buffer.from('x')},{path:'a.java',bytes:Buffer.from('x')}])),/duplicate/);
});
test('uploaded local library Java and descriptor may use checkout CRLF, while resources stay byte exact',async t=>{
 const root=await fixture(t),source='libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar/Health.java',descriptorPath='libraries/health-bar/zero-library.json';
 for(const name of [source,descriptorPath])await fs.writeFile(path.join(root,name),(await fs.readFile(path.join(root,name),'utf8')).replace(/\n/g,'\r\n'));
 const inputs=await captureBuildInputs(root),gitBlob=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 const entries=inputs.files.map(file=>`100644 blob ${gitBlob([source,descriptorPath].includes(file.path)?Buffer.from(file.bytes.toString('utf8').replace(/\r\n/g,'\n')):file.bytes)}\t${file.path}\0`).join('');
 const result={sourceHash:inputs.sourceHash,manifest:{localSourceHash:inputs.sourceHash}};
 const checked=await assertBuildInputsAtCommit({projectRoot:root,result,sourceSha:'a'.repeat(40),git:async()=>entries});
 assert.deepEqual(checked.normalizedSourceLineEndings.sort(),[source,descriptorPath].sort());
});
