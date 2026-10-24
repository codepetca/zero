'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const c=require('../src/sharing/contracts'),consumer=require('../src/sharing/consumer'),authoring=require('../src/sharing/authoring');
const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-consumer-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main {}');
 const bytes=new Map(),releases=[];
 for(const slug of ['health-bar','score'])for(const version of ['0.1.0','0.1.1']) {
  const id=c.identity('library',repository.id,slug),descriptor={schema:1,kind:'library',slug,version,title:slug,description:'Finite fixture',license:'MIT',libraryKind:'helper'};
  const artifacts={};for(const kind of ['jar','sources','pom']) {
   const data=kind==='pom'?Buffer.from(authoring.libraryPom(id,descriptor).replace(/<build>[\s\S]*?<\/build>/,'')):Buffer.from([0x50,0x4b,0x03,0x04,1,2,3,4]);const artifactPath=c.artifactPath(id,version,kind);bytes.set(artifactPath,data);artifacts[kind]={path:artifactPath,url:'https://files.example/'+artifactPath,size:data.length,sha256:authoring.hash(data)};
  }
  releases.push({...descriptor,id:id.id,repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:`libraries/${slug}`,sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',namespace:id.namespace,coordinate:{...id.coordinate,version},artifacts});
 }
 const catalog={schema:1,revision:'d'.repeat(40),releases},settings={catalogUrl:'https://zero.example/api/sharing/catalog',artifactOrigin:'https://files.example'};
 const calls=[];const fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);return new Response(url===settings.catalogUrl?JSON.stringify(catalog):bytes.get(new URL(url).pathname.slice(1)));};
 const context=await consumer.loadCatalog(settings,{fetcher});return {root,catalog,bytes,releases,settings,fetcher,context,calls};
}
test('strict catalog origin, schema, bytes and cumulative deadlines have no fallback',async t=>{
 const f=await fixture(t);await assert.rejects(consumer.loadCatalog({...f.settings,artifactOrigin:''}),/not configured/);
 const forged=structuredClone(f.catalog);forged.releases[0].artifacts.jar.url='https://attacker.example/'+forged.releases[0].artifacts.jar.path;
 await assert.rejects(consumer.loadCatalog(f.settings,{fetcher:async()=>Response.json(forged)}),/origin|URL/);
 await assert.rejects(consumer.loadCatalog(f.settings,{fetcher:async()=>new Response('x'.repeat(c.LIMITS.catalogBytes+1))}),/size limit/);
 let calls=0;await assert.rejects(consumer.loadCatalog(f.settings,{fetcher:async()=>{calls++;return new Response('',{status:400});}}),/unavailable/);assert.equal(calls,1);
 await assert.rejects(consumer.readBytes('https://files.example/x',{maximum:4,timeoutMs:20,fetcher:async()=>new Response(new ReadableStream({start(){}}))}),/timed out/);
});
test('independent Add/Update/Revert pins preserve Java and other dependency history',async t=>{
 const f=await fixture(t),pom=path.join(f.root,'pom.xml');
 await fs.cp(path.resolve(__dirname,'../../framework/src/main/java/zero'),path.join(f.root,'src/main/java/zero'),{recursive:true});
 assert.match(await fs.readFile(path.join(f.root,'src/main/java/zero/App.java'),'utf8'),/\\u001e/);
 let plan=await consumer.planChange(f.root,f.context,f.releases[0]);await fs.writeFile(pom,plan.afterText);
 plan=await consumer.planChange(f.root,f.context,f.releases[2]);await fs.writeFile(pom,plan.afterText);
 plan=await consumer.planChange(f.root,f.context,f.releases[1],{operation:'update'});await fs.writeFile(pom,plan.afterText);
 assert.equal(plan.current,'0.1.0');assert.match(plan.afterText,/<artifactId>score<\/artifactId><version>0.1.0/);
 plan=await consumer.planChange(f.root,f.context,f.releases[0],{operation:'revert'});await consumer.validatePlan(plan,f.context);assert.equal(plan.previous,'0.1.0');assert.match(plan.afterText,/<artifactId>health-bar<\/artifactId><version>0.1.0/);
 assert.equal(await fs.readFile(path.join(f.root,'src/main/java/Main.java'),'utf8'),'public class Main {}');
 await fs.appendFile(path.join(f.root,'src/main/java/zero/App.java'),'// changed core');
 await assert.rejects(consumer.planChange(f.root,f.context,f.releases[1],{operation:'update'}),/helper differs/);
});
test('hash, availability, catalog/POM drift and manual pins block dependency edits',async t=>{
 const f=await fixture(t),plan=await consumer.planChange(f.root,f.context,f.releases[0]);
 await fs.appendFile(path.join(f.root,'pom.xml'),'<!-- newer -->');await assert.rejects(consumer.validatePlan(plan,f.context),/POM changed/);
 f.bytes.set(f.releases[0].artifacts.jar.path,Buffer.from('changed'));await assert.rejects(consumer.planChange(f.root,f.context,f.releases[0]),/hash/);
 const current=structuredClone(f.catalog);current.releases[0].status='withdrawn';await assert.rejects(consumer.validatePlan(plan,{...f.context,fetcher:async()=>Response.json(current)}),/catalog changed/);
 const g=await fixture(t),pom=path.join(g.root,'pom.xml');await fs.writeFile(pom,(await fs.readFile(pom,'utf8')).replace('</dependencies>','<dependency><groupId>ca.codepet.zero.contrib.r12345</groupId><artifactId>health-bar</artifactId><version>0.1.0</version></dependency></dependencies>'));await assert.rejects(consumer.planChange(g.root,g.context,g.releases[0]),/manual\/authored/);
});
test('root and local-library sources cannot shadow a binary; unsupported escapes fail closed',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'src/main/java/Copy.java'),'package zero.contrib.r12345.health_bar; class Copy {}');await assert.rejects(consumer.planChange(f.root,f.context,f.releases[0]),/shadows/);await fs.unlink(path.join(f.root,'src/main/java/Copy.java'));
 await fs.writeFile(path.join(f.root,'src/main/java/Health.java'),'class Health {}');const descriptor={schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health',description:'Test helper',license:'MIT',libraryKind:'helper'};
 await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository,descriptor,sources:['src/main/java/Health.java']}));await assert.rejects(consumer.planChange(f.root,f.context,f.releases[0]),/shadows/);
 const g=await fixture(t);await fs.writeFile(path.join(g.root,'src/main/java/Hud.java'),String.raw`package zero.\u0063ontrib.r12345.health_bar; class Hud {}`);await assert.rejects(consumer.planChange(g.root,g.context,g.releases[0]),/Unicode/);
});
test('Add rejects raw identifier-ignorable namespace spellings before artifact downloads or POM edits',async t=>{
 const f=await fixture(t),filename=path.join(f.root,'src/main/java/Health.java'),pom=await fs.readFile(path.join(f.root,'pom.xml'),'utf8');
 for(const codePoint of [0x200D,0x0000,0x0008,0x000E,0x001B,0x007F,0x009F,0x0085,0x00AD,0x2060,0xFEFF,0xE0001]) {
  const source=`package zero.con${String.fromCodePoint(codePoint)}trib.r12345.health_bar; public class Health {}`;
  await fs.writeFile(filename,source);
  await assert.rejects(consumer.planChange(f.root,f.context,f.releases[0],{operation:'add'}),/Hidden Java identifier-ignorable characters.*manual source preparation/,`U+${codePoint.toString(16).toUpperCase()}`);
  assert.equal(await fs.readFile(filename,'utf8'),source); assert.equal(await fs.readFile(path.join(f.root,'pom.xml'),'utf8'),pom);
 }
 assert.deepEqual(f.calls,[f.settings.catalogUrl]);
});
test('Add and reviewed-plan validation also refuse hidden namespace copies in active local libraries',async t=>{
 const f=await fixture(t);
 await fs.writeFile(path.join(f.root,'src/main/java/Score.java'),'public class Score {}');
 const descriptor={schema:1,kind:'library',slug:'score',version:'0.1.0',title:'Score',description:'Test helper',license:'MIT',libraryKind:'helper'};
 await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository,descriptor,sources:['src/main/java/Score.java']}));
 const plan=await consumer.planChange(f.root,f.context,f.releases[0]);
 const filename=path.join(f.root,'libraries/score/src/main/java/Health.java'),source='package zero.con\u200Dtrib.r12345.health_bar; public class Health {}';
 await fs.writeFile(filename,source);
 const pom=await fs.readFile(path.join(f.root,'pom.xml'),'utf8');
 await assert.rejects(consumer.planChange(f.root,f.context,f.releases[0],{operation:'add'}),/Hidden Java identifier-ignorable characters.*manual source preparation/);
 await assert.rejects(consumer.validatePlan(plan,f.context),/Hidden Java identifier-ignorable characters.*manual source preparation/);
 assert.equal(await fs.readFile(filename,'utf8'),source); assert.equal(await fs.readFile(path.join(f.root,'pom.xml'),'utf8'),pom);
});

test('published-mode repository uses standard Maven prefix and rejects altered repository or executable POM hooks',async t=>{
 const f=await fixture(t),text=await fs.readFile(path.join(f.root,'pom.xml'),'utf8');
 const edited=consumer.addArtifactRepository(text,f.context.artifactOrigin);assert.match(edited,/<url>https:\/\/files.example\/maven<\/url>/);assert.equal(consumer.addArtifactRepository(edited,f.context.artifactOrigin),edited);
 assert.throws(()=>consumer.addArtifactRepository(edited.replace('files.example/maven','other.example/maven'),f.context.artifactOrigin),/repository changed/);
 const release=structuredClone(f.releases[0]),old=f.bytes.get(release.artifacts.pom.path),unsafe=Buffer.from(old.toString().replace('</project>','<build><plugins/></build></project>'));release.artifacts.pom.size=unsafe.length;release.artifacts.pom.sha256=authoring.hash(unsafe);f.bytes.set(release.artifacts.pom.path,unsafe);f.context.catalog.releases[0]=release;await assert.rejects(consumer.verifyLibrary(f.context,release),/unsupported dependency configuration/);
});
