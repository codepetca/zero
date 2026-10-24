'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const authoring=require('../src/sharing/authoring'),contracts=require('../src/sharing/contracts');
const consumer=require('../src/sharing/consumer');
const {captureBuildInputs,boundSourceHash,assertBuildInputsAtCommit}=require('../src/web-export/snapshot');
const {resolveLibrarySources,inspectJar,assertApplicationNamespaces}=require('../src/web-export/libraries');
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
test('independent Browse/Add, Update and Revert feed exact accepted browser source without authored state',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-web-independent-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const template=path.resolve(__dirname,'../../student-template');
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.mkdir(path.join(root,'src/main/resources'));
 await fs.cp(path.join(template,'.mvn'),path.join(root,'.mvn'),{recursive:true});
 for(const name of ['pom.xml','mvnw','mvnw.cmd'])await fs.copyFile(path.join(template,name),path.join(root,name));
 await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main {}\n');
 const id=contracts.identity('library',repository.id,descriptor.slug),sourcePath=id.namespace.replaceAll('.','/')+'/Health.java';
 const settings={catalogUrl:'https://zero.example/catalog',artifactOrigin:'https://files.example'},artifactBytes=new Map(),releases=[];
 for(const [version,answer]of [['0.1.0',10],['0.1.1',11]]) {
  const values={jar:zipFiles([{path:sourcePath.replace('.java','.class'),bytes:Buffer.from('class')}]),sources:zipFiles([{path:sourcePath,bytes:Buffer.from(`package ${id.namespace}; public class Health { public int value() { return ${answer}; } }`)}]),pom:Buffer.from(`<project><modelVersion>4.0.0</modelVersion><groupId>${id.coordinate.groupId}</groupId><artifactId>${id.coordinate.artifactId}</artifactId><version>${version}</version></project>`)};
  const artifacts={};for(const [kind,bytes]of Object.entries(values)) {const artifactPath=contracts.artifactPath(id,version,kind),url='https://files.example/'+artifactPath;artifactBytes.set(url,bytes);artifacts[kind]={path:artifactPath,url,size:bytes.length,sha256:hash(bytes)};}
  releases.push({schema:1,kind:'library',id:id.id,slug:descriptor.slug,version,title:descriptor.title,description:descriptor.description,license:'MIT',repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/health-bar',sha256:'b'.repeat(64)},policyRevision:'c'.repeat(40),status:'available',artifacts,namespace:id.namespace,coordinate:{...id.coordinate,version},libraryKind:'helper'});
 }
 const catalog={schema:1,revision:'d'.repeat(40),releases};
 const fetcher=async url=>new Response(url===settings.catalogUrl?JSON.stringify(catalog):artifactBytes.get(url));
 const context=await consumer.loadCatalog(settings,{fetcher}),pomPath=path.join(root,'pom.xml');
 await fs.writeFile(pomPath,consumer.addArtifactRepository(await fs.readFile(pomPath,'utf8'),settings.artifactOrigin));
 assert.equal((await captureBuildInputs(root)).libraries.length,0);
 const apply=async(release,operation)=>{
  const plan=await consumer.planChange(root,context,release,{operation});await fs.writeFile(pomPath,plan.afterText);
  await assert.rejects(fs.access(path.join(root,'zero-libraries.json')),{code:'ENOENT'});
  const captured=await captureBuildInputs(root);
  assert.equal(captured.libraries.length,1);assert.equal(captured.libraries[0].source,'consumer');
  assert.ok(validateDependencies(plan.afterText,{libraries:captured.libraries}));
  const resolved=await resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher});
  assert.equal(resolved.publishedLibraries[0].version,release.version);
  return {plan,captured,resolved};
 };
 const added=await apply(releases[0],'add');assert.match(added.resolved.sources[0].bytes.toString(),/return 10/);
 const updated=await apply(releases[1],'update');assert.match(updated.resolved.sources[0].bytes.toString(),/return 11/);assert.notEqual(updated.captured.sourceHash,added.captured.sourceHash);
 const reverted=await apply(releases[0],'revert');assert.match(reverted.resolved.sources[0].bytes.toString(),/return 10/);assert.match(reverted.plan.afterText,/<zero\.sharing\.lib-r12345-health-bar\.previous>0\.1\.1/);
 const goodPom=reverted.plan.afterText;
 await fs.writeFile(pomPath,goodPom.replace(/<!-- zero-sharing lib-r12345-health-bar history (?:start|end) -->\s*/g,''));
 await assert.rejects(captureBuildInputs(root),/managed dependency or version history|managed library marker/);
 await fs.writeFile(pomPath,goodPom.replace(/<!-- zero-sharing repository (?:start|end) -->\s*/g,''));
 await assert.rejects(captureBuildInputs(root),/managed artifact repository/);
 await fs.writeFile(pomPath,goodPom.replace(/<!-- zero-sharing lib-r12345-health-bar (?:dependency|history) (?:start|end) -->\s*/g,''));
 const manual=await captureBuildInputs(root);assert.throws(()=>validateDependencies((manual.files.find(file=>file.path==='pom.xml')).bytes.toString(),{libraries:manual.libraries}),/Unsupported browser dependency/);
 await fs.writeFile(pomPath,goodPom.replaceAll('https://files.example/maven','https://other.example/maven'));
 await assert.rejects(resolveLibrarySources(root,await captureBuildInputs(root),{sharingSettings:settings,fetcher}),/repository origin changed/);
 await fs.writeFile(pomPath,goodPom);
 catalog.releases[0].status='withdrawn';await assert.rejects(resolveLibrarySources(root,await captureBuildInputs(root),{sharingSettings:settings,fetcher}),/not an available accepted release/);
 catalog.releases[0].status='available';artifactBytes.set(releases[0].artifacts.sources.url,Buffer.from('changed'));
 await assert.rejects(resolveLibrarySources(root,await captureBuildInputs(root),{sharingSettings:settings,fetcher}),/hash|size/);
});

test('application namespace checks recognize exact core bodies without relaxing student/library source checks',async()=>{
 const core=require('../src/core-contract'),base=path.resolve(__dirname,'../../framework/src/main/java');
 const files=await Promise.all(Object.keys(core.helperHashes).map(async name=>({path:name,originalPath:'src/main/java/'+name,bytes:await fs.readFile(path.join(base,name))})));
 assert.ok(files.find(file=>file.path==='zero/App.java').bytes.includes(Buffer.from('\\u001e')));
 const library={identity:contracts.identity('library','12345','health-bar')};
 assert.doesNotThrow(()=>assertApplicationNamespaces(files,[library]));
 const crlf=files.map(file=>({...file,bytes:Buffer.from(file.bytes.toString('utf8').replace(/\n/g,'\r\n'))}));
 assert.doesNotThrow(()=>assertApplicationNamespaces(crlf,[library]));
 const changed=files.map(file=>({...file,bytes:Buffer.concat([file.bytes,Buffer.from('// changed')])}));
 assert.throws(()=>assertApplicationNamespaces(changed,[library]),/helper differs/);
 const student=source=>[{path:'Student.java',originalPath:'src/main/java/Student.java',bytes:Buffer.from(source)}];
 const namespace=library.identity.namespace;
 for(const pkg of [namespace,namespace+'.nested'])assert.throws(()=>assertApplicationNamespaces(student('package '+pkg+'; class Student {}'),[library]),/shadows library namespace/);
 assert.doesNotThrow(()=>assertApplicationNamespaces(student('package student; class Student {}'),[library]));
 assert.throws(()=>assertApplicationNamespaces(student('package '+namespace.replace('zero','z'+'\\u0065'+'ro')+'; class Student {}'),[library]),/Unicode-escaped Java/);
 assert.throws(()=>assertApplicationNamespaces(student('package '+namespace.replace('zero','ze\u200bro')+'; class Student {}'),[library]),/Hidden Java/);
 assert.doesNotThrow(()=>assertApplicationNamespaces(student('class Student { String label="\\u263a"; }'),[]));
});

test('authored and managed practice pins resolve only from practice catalog alongside ordinary published libraries',async t=>{
 const {SLUG,practiceCatalogUrl}=require('../src/sharing/tutorial-practice');
 for(const authored of [true,false]) {
  const root=await fixture(t),settings={catalogUrl:'https://zero.example/api/sharing/catalog/web',artifactOrigin:'https://files.example'},practiceUrl=practiceCatalogUrl(settings.catalogUrl);
  const practiceDescriptor={...descriptor,slug:SLUG,title:'CreditsBadge'},ordinaryId=contracts.identity('library',repository.id,descriptor.slug),practiceId=contracts.identity('library',repository.id,SLUG);
  const artifactBytes=new Map();
  function release(id,version,className,answer) {
   const sourcePath=id.namespace.replaceAll('.','/')+'/'+className+'.java';
   const values={jar:zipFiles([{path:sourcePath.replace('.java','.class'),bytes:Buffer.from('class')}]),sources:zipFiles([{path:sourcePath,bytes:Buffer.from(`package ${id.namespace}; public class ${className} { public int value() { return ${answer}; } }`)}]),pom:Buffer.from(`<project><modelVersion>4.0.0</modelVersion><groupId>${id.coordinate.groupId}</groupId><artifactId>${id.coordinate.artifactId}</artifactId><version>${version}</version></project>`)};
   const artifacts={};for(const [kind,bytes]of Object.entries(values)){const artifactPath=contracts.artifactPath(id,version,kind),url=settings.artifactOrigin+'/'+artifactPath;artifacts[kind]={path:artifactPath,url,size:bytes.length,sha256:hash(bytes)};artifactBytes.set(url,bytes);}
   return {...descriptor,slug:id.slug,id:id.id,version,title:id.slug===SLUG?'CreditsBadge':'Health',repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/'+id.slug,sha256:'b'.repeat(64)},policyRevision:'c'.repeat(40),status:'available',artifacts,namespace:id.namespace,coordinate:{...id.coordinate,version}};
  }
  const ordinary=release(ordinaryId,'0.1.0','Health',7),practice=[release(practiceId,'0.1.0','CreditsBadge',10),release(practiceId,'0.1.1','CreditsBadge',11)];
  const normalCatalog={schema:1,revision:'d'.repeat(40),releases:[ordinary]},practiceCatalog={schema:1,revision:'e'.repeat(40),releases:practice};
  const urls=[];let missing=false;
  const fetcher=async url=>{urls.push(url);return new Response(url===settings.catalogUrl?JSON.stringify(normalCatalog):url===practiceUrl?JSON.stringify({...practiceCatalog,releases:missing?[]:practiceCatalog.releases}):artifactBytes.get(url));};
  await authoring.applyPlan(await authoring.previewMode(root,{slug:descriptor.slug,mode:'published',version:'0.1.0'}));
  if(authored) {
   await fs.writeFile(path.join(root,'src/main/java/CreditsBadge.java'),'public class CreditsBadge { public int value() { return 1; } }');
   await authoring.applyPlan(await authoring.previewExtraction(root,{repository,descriptor:practiceDescriptor,sources:['src/main/java/CreditsBadge.java']}));
   await authoring.applyPlan(await authoring.previewMode(root,{slug:SLUG,mode:'published',version:'0.1.0'}));
  }
  const context=await consumer.loadCatalog({...settings,catalogUrl:practiceUrl},{fetcher}),pomPath=path.join(root,'pom.xml');
  if(!authored) {
   const plan=await consumer.planChange(root,context,practice[0],{operation:'add'});await consumer.validatePlan(plan,context);await fs.writeFile(pomPath,plan.afterText);
  }
  async function resolve(version,answer) {
   const captured=await captureBuildInputs(root),result=await resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher});
   assert.equal(result.publishedLibraries.length,2);assert.equal(result.publishedLibraries.find(item=>item.id===practiceId.id).version,version);
   const fingerprints=new Map(result.publishedLibraries.map(item=>[item.id,item.catalogFingerprint]));
   assert.equal(fingerprints.get(ordinaryId.id),hash(Buffer.from(JSON.stringify(normalCatalog))));assert.equal(fingerprints.get(practiceId.id),hash(Buffer.from(JSON.stringify(practiceCatalog))));
   assert.match(result.sources.find(item=>item.path.endsWith('/CreditsBadge.java')).bytes.toString(),new RegExp('return '+answer));
   return captured;
  }
  let captured=await resolve('0.1.0',10);
  for(const [index,operation]of [[1,'update'],[0,'revert']]) {
   if(authored)await authoring.applyPlan(await authoring.previewMode(root,{slug:SLUG,mode:'published',version:practice[index].version}));
   else {const plan=await consumer.planChange(root,context,practice[index],{operation});await consumer.validatePlan(plan,context);await fs.writeFile(pomPath,plan.afterText);}
   captured=await resolve(practice[index].version,index?11:10);
  }
  assert.ok(urls.includes(settings.catalogUrl));assert.ok(urls.includes(practiceUrl));
  // The ordinary catalog cannot act as fallback, even if it accidentally contains practice.
  normalCatalog.releases.push(practice[0]);missing=true;
  await assert.rejects(resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher}),/not an available accepted release/);
  missing=false;normalCatalog.releases.pop();practice[0].status='withdrawn';
  await assert.rejects(resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher}),/not an available accepted release/);
  practice[0].status='available';artifactBytes.set(practice[0].artifacts.sources.url,Buffer.from('tampered'));
  await assert.rejects(resolveLibrarySources(root,captured,{sharingSettings:settings,fetcher}),/size or hash/);
 }
});
