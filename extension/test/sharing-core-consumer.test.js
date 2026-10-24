'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const core=require('../src/core-contract'),contracts=require('../src/sharing/contracts');
const consumer=require('../src/sharing/consumer'),{hash}=require('../src/sharing/authoring');
const authoring=require('../src/sharing/authoring');
const {captureBuildInputs,boundSourceHash,assertBuildInputsAtCommit}=require('../src/web-export/snapshot');
const {resolveLibrarySources}=require('../src/web-export/libraries');
const {createHash}=require('node:crypto');
const {zipFiles}=require('../src/web-export/zip');
const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
const identity=contracts.identity('library',repository.id,'score-views');
const requirement={minVersion:'0.3.0',maxExclusive:'0.4.0'};
const version='1.0.0',prefix=identity.namespace.replaceAll('.','/')+'/';
const entry=(path,text)=>({path,bytes:Buffer.from(text)});
function pom(release) {
 const properties={
  'zero.core.minVersion':release.coreRequirement.minVersion,
  'zero.core.maxExclusive':release.coreRequirement.maxExclusive,
  ...Object.fromEntries(Object.entries(release.coreBuild).map(([key,value])=>['zero.core.'+key,value]))
 };
 return `<project><modelVersion>4.0.0</modelVersion><groupId>${identity.coordinate.groupId}</groupId><artifactId>${identity.slug}</artifactId><version>${version}</version><properties>${Object.entries(properties).map(([name,value])=>`<${name}>${value}</${name}>`).join('')}</properties><dependencies><dependency><groupId>school.zero</groupId><artifactId>zero-core</artifactId><version>${release.coreBuild.version}</version><scope>provided</scope></dependency></dependencies></project>`;
}
async function fixture(t,{withCore=true,requirementOverride,artifactChanges}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-core-consumer-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});
 await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
 await fs.cp(path.resolve(__dirname,'../../student-template/.mvn'),path.join(root,'.mvn'),{recursive:true});
 for(const name of ['mvnw','mvnw.cmd'])await fs.copyFile(path.resolve(__dirname,'../../student-template',name),path.join(root,name));
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main {}');
 if(withCore) {
  const sources={};
  for(const name of core.coreSourcePaths) {
   sources[name]=await fs.readFile(path.resolve(__dirname,'../../framework',name));
   await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),sources[name]);
  }
  await fs.writeFile(path.join(root,'zero-core.json'),JSON.stringify(core.makeCoreRecord(sources)));
 }
 const release={schema:2,kind:'library',id:identity.id,slug:identity.slug,version,title:'Score views',description:'Structural unit fixture, not compiled acceptance.',license:'MIT',libraryKind:'widget',repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/score-views',sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',namespace:identity.namespace,coordinate:{...identity.coordinate,version},coreRequirement:requirementOverride||requirement,
  coreBuild:{version:requirementOverride?.minVersion||'0.3.0',sourceSha256:'f'.repeat(64),jarSha256:'e'.repeat(64),buildRecipeSha256:'d'.repeat(64),javaRelease:'17',javafxVersion:'21.0.12'},artifacts:{}};
 const binary=[entry(prefix+'ScoreView.class','structural-class-fixture')],sources=[entry(prefix+'ScoreView.java',`package ${identity.namespace}; public interface ScoreView { zero.ui.Element view(); void setScore(int points); }`)];
 const bytes=new Map();
 for(const [kind,initial]of [['jar',zipFiles(binary)],['sources',zipFiles(sources)],['pom',Buffer.from(pom(release))]]) {
  const data=artifactChanges?.[kind]?artifactChanges[kind](initial,{release,binary,sources}):initial;
  const name=contracts.artifactPath(identity,version,kind);bytes.set(name,data);release.artifacts[kind]={path:name,url:'https://files.example/'+name,size:data.length,sha256:hash(data)};
 }
 const catalog={schema:1,revision:'9'.repeat(40),releases:[release]},calls=[];
 const settings={catalogUrl:'https://zero.example/catalog',artifactOrigin:'https://files.example'};
 const fetcher=async url=>{calls.push(url);return new Response(url===settings.catalogUrl?JSON.stringify(catalog):bytes.get(new URL(url).pathname.slice(1)));};
 const context=await consumer.loadCatalog(settings,{fetcher});
 return {root,release,bytes,calls,context,settings,fetcher};
}
test('core-dependent Add uses the consumer requirement rather than the author source hash',async t=>{
 const f=await fixture(t),plan=await consumer.planChange(f.root,f.context,f.release);
 assert.notEqual(plan.coreInputs.record.sourceSha256,f.release.coreBuild.sourceSha256);
 assert.equal(plan.coreInputs.record.coordinate.version,'0.3.0');
 assert.equal(plan.coreInputs.files.length,17);assert.match(plan.afterText,/<artifactId>score-views<\/artifactId><version>1.0.0/);
 await consumer.validatePlan(plan,f.context);
});
test('missing or incompatible core blocks Add before artifact downloads or POM mutation',async t=>{
 for(const options of [{withCore:false},{requirementOverride:{minVersion:'0.4.0',maxExclusive:'0.5.0'}}]) {
  const f=await fixture(t,options),before=await fs.readFile(path.join(f.root,'pom.xml'));
  await assert.rejects(consumer.planChange(f.root,f.context,f.release),/zero-core\.json|requires Zero core/);
  assert.equal(f.calls.length,1);assert.deepEqual(await fs.readFile(path.join(f.root,'pom.xml')),before);
 }
});
test('a prepared Add is invalid after raw core bytes change, even equivalent CRLF',async t=>{
 const f=await fixture(t),plan=await consumer.planChange(f.root,f.context,f.release);
 const filename=path.join(f.root,'src/main/java/zero/App.java');
 await fs.writeFile(filename,(await fs.readFile(filename,'utf8')).replace(/\n/g,'\r\n'));
 await assert.rejects(consumer.validatePlan(plan,f.context),/core changed after review/);
 assert.equal((await core.readProjectCore(f.root,{required:true})).coordinate.version,'0.3.0');
});
test('sanitized POM must bind all core build fields and one exact provided dependency',async t=>{
 const mutations=[
  text=>text.replace('<scope>provided</scope>','<scope>compile</scope>'),
  text=>text.replace('<zero.core.jarSha256>'+'e'.repeat(64),'<zero.core.jarSha256>'+'a'.repeat(64)),
  text=>text.replace('<zero.core.javaRelease>17</zero.core.javaRelease>',''),
  text=>text.replace('<zero.core.javaRelease>17</zero.core.javaRelease>','<zero.core.version>0.3.0</zero.core.version>'),
  text=>text.replace('<scope>provided</scope>','<scope>provided</scope><systemPath>/tmp/core.jar</systemPath>')
 ];
 for(const mutate of mutations) {
  const f=await fixture(t,{artifactChanges:{pom:bytes=>Buffer.from(mutate(bytes.toString()))}});
  await assert.rejects(consumer.verifyLibrary(f.context,f.release),/core metadata|provided|unsupported dependency/);
 }
});
test('core-dependent artifacts refuse bundled core, processors and class-path manifests',async t=>{
 const changes=[
  {jar:(bytes,{binary})=>zipFiles([...binary,entry('zero/App.class','duplicate-core')])},
  {sources:(bytes,{sources})=>zipFiles([...sources,entry('zero/App.java','package zero; class App {}')])},
  {jar:(bytes,{binary})=>zipFiles([...binary,entry('META-INF/services/javax.annotation.processing.Processor','processor')])},
  {jar:(bytes,{binary})=>zipFiles([...binary,entry('META-INF/MANIFEST.MF','Manifest-Version: 1.0\r\nClass-Path: other.jar\r\n\r\n')])}
 ];
 for(const artifactChanges of changes) {
  const f=await fixture(t,{artifactChanges});
  await assert.rejects(consumer.verifyLibrary(f.context,f.release),/outside|manifest/);
 }
});
test('published browser resolution binds core metadata and only uses captured project core',async t=>{
 const f=await fixture(t),plan=await consumer.planChange(f.root,f.context,f.release);
 await fs.writeFile(path.join(f.root,'pom.xml'),plan.afterText);
 const captured=await captureBuildInputs(f.root);
 assert.ok(captured.files.some(file=>file.path==='zero-core.json'));
 const options={sharingSettings:f.settings,fetcher:f.fetcher};
 const resolved=await resolveLibrarySources(f.root,captured,options);
 assert.deepEqual(resolved.publishedLibraries[0].coreRequirement,requirement);
 assert.deepEqual(resolved.publishedLibraries[0].coreBuild,f.release.coreBuild);
 assert.notEqual(boundSourceHash(captured.sourceHash,resolved.publishedLibraries),captured.sourceHash);
 const record=path.join(f.root,'zero-core.json'),original=await fs.readFile(record);
 await fs.writeFile(record,'invalid live JSON');
 // A build consumes its frozen inputs; validation later detects live drift.
 assert.equal((await resolveLibrarySources(f.root,captured,options)).sources.length,1);
 assert.notEqual((await captureBuildInputs(f.root)).sourceHash,captured.sourceHash);
 const missing={...captured,files:captured.files.filter(file=>file.path!=='zero-core.json')};
 await assert.rejects(resolveLibrarySources(f.root,missing,options),/project-owned zero-core/);
 const tampered={...captured,files:captured.files.map(file=>file.path==='src/main/java/zero/App.java'?{...file,bytes:Buffer.concat([file.bytes,Buffer.from('// changed')])}:file)};
 await assert.rejects(resolveLibrarySources(f.root,tampered,options),/reviewed current core/);
 await fs.writeFile(record,original);
});
test('local browser components require their exact author core input',async t=>{
 const f=await fixture(t),record=await core.readProjectCore(f.root,{required:true});
 const descriptor={schema:2,kind:'library',slug:identity.slug,version,title:'Score views',description:'Local widget unit fixture',license:'MIT',libraryKind:'widget',coreRequirement:requirement,coreInput:{version:record.coordinate.version,sourceSha256:record.sourceSha256}};
 await fs.writeFile(path.join(f.root,'src/main/java/Reusable.java'),'public class Reusable { public zero.ui.Element view() { return new zero.ui.Label("Score"); } }');
 await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository,descriptor,sources:['src/main/java/Reusable.java']}));
 const captured=await captureBuildInputs(f.root);
 assert.equal((await resolveLibrarySources(f.root,captured)).sources.length,1);
 const wrong={...captured,libraries:captured.libraries.map(library=>({...library,descriptor:{...library.descriptor,coreInput:{...library.descriptor.coreInput,sourceSha256:'f'.repeat(64)}}}))};
 await assert.rejects(resolveLibrarySources(f.root,wrong),/coreInput differs/);
});
test('uploaded browser inputs include the project core record and permit ordinary CRLF checkout',async t=>{
 const f=await fixture(t),filename=path.join(f.root,'zero-core.json');
 const record=JSON.parse(await fs.readFile(filename));await fs.writeFile(filename,JSON.stringify(record,null,2).replace(/\n/g,'\r\n'));
 const captured=await captureBuildInputs(f.root),blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 const entries=captured.files.map(file=>`100644 blob ${blob(file.path==='zero-core.json'?Buffer.from(file.bytes.toString().replace(/\r\n/g,'\n')):file.bytes)}\t${file.path}\0`).join('');
 let args;
 const result=await assertBuildInputsAtCommit({projectRoot:f.root,result:{sourceHash:captured.sourceHash},sourceSha:'a'.repeat(40),git:async(root,command)=>{args=command;return entries;}});
 assert.ok(args.includes('zero-core.json'));assert.deepEqual(result.normalizedSourceLineEndings,['zero-core.json']);
 const withoutRecord=entries.split('\0').filter(entry=>entry&&!entry.endsWith('\tzero-core.json')).join('\0')+'\0';
 await assert.rejects(assertBuildInputsAtCommit({projectRoot:f.root,result:{sourceHash:captured.sourceHash},sourceSha:'a'.repeat(40),git:async()=>withoutRecord}),/missing from the uploaded commit/);
});
