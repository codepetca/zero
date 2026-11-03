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
test('owned pins activate through an exact marker and survive update and revert',async t=>{
 const f=await fixture(t),pom=path.join(f.root,'pom.xml'),before=await fs.readFile(pom,'utf8');
 const add=await consumer.planChange(f.root,f.context,f.releases[0],{owned:true});
 assert.equal(add.owned,true);await consumer.validatePlan(add,f.context);
 assert.match(add.afterText,/<zero.sharing.lib-r12345-health-bar.owned>true<\/zero.sharing.lib-r12345-health-bar.owned>/);
 assert.equal(consumer.inspectManagedLibraryPins(add.afterText)[0].storage,'owned');
 assert.deepEqual(consumer.inspectManagedLibraryPins(before),[]);
 await fs.writeFile(pom,add.afterText);
 await assert.rejects(consumer.planChange(f.root,f.context,f.releases[1],{operation:'update'}),/storage mode/);
 const update=await consumer.planChange(f.root,f.context,f.releases[1],{operation:'update',owned:true});await consumer.validatePlan(update,f.context);
 assert.equal(consumer.inspectManagedLibraryPins(update.afterText)[0].storage,'owned');await fs.writeFile(pom,update.afterText);
 const revert=await consumer.planChange(f.root,f.context,f.releases[0],{operation:'revert',owned:true});await consumer.validatePlan(revert,f.context);
 assert.equal(consumer.inspectManagedLibraryPins(revert.afterText)[0].version,'0.1.0');assert.equal(consumer.inspectManagedLibraryPins(revert.afterText)[0].storage,'owned');
});
test('legacy pins retain their output and cannot silently switch storage',async t=>{
 const f=await fixture(t),pom=path.join(f.root,'pom.xml');
 const legacy=await consumer.planChange(f.root,f.context,f.releases[0]);assert.equal(Object.hasOwn(legacy,'owned'),false);assert.equal(Object.hasOwn(consumer.inspectManagedLibraryPins(legacy.afterText)[0],'storage'),false);
 await fs.writeFile(pom,legacy.afterText);await assert.rejects(consumer.planChange(f.root,f.context,f.releases[1],{operation:'update',owned:true}),/storage mode/);
 const update=await consumer.planChange(f.root,f.context,f.releases[1],{operation:'update'});await consumer.validatePlan(update,f.context);assert.equal(Object.hasOwn(consumer.inspectManagedLibraryPins(update.afterText)[0],'storage'),false);
});
test('partial, duplicate, stray and altered ownership markers fail closed',async t=>{
 const f=await fixture(t),pom=path.join(f.root,'pom.xml'),plan=await consumer.planChange(f.root,f.context,f.releases[0],{owned:true}),text=plan.afterText;
 const block=/<!-- zero-sharing lib-r12345-health-bar owned start -->[\s\S]*?<!-- zero-sharing lib-r12345-health-bar owned end -->/;
 const own=text.match(block)[0],variants=[
  text.replace('owned start','owned begins'),text.replace('owned end','owned ends'),
  text.replace('>true</zero.sharing.lib-r12345-health-bar.owned>','>false</zero.sharing.lib-r12345-health-bar.owned>'),
  text.replace(own,own+own),text.replace(own,own.replace(/<!--[^]*?-->/g,'')),
  text.replace(own,own.replace('<zero.sharing.lib-r12345-health-bar.owned>true','<zero.sharing.lib-r12345-health-bar.owned><!-- altered -->true')),
  text.replace(own,'').replace('</dependencies>',own+'</dependencies>'),
  text.replace(/<!-- zero-sharing lib-r12345-health-bar dependency start -->[\s\S]*?<!-- zero-sharing lib-r12345-health-bar dependency end -->/,''),
  text+'<!-- zero-sharing lib-r12345-health-bar owned start -->'
 ];
 for(const changed of variants){assert.throws(()=>consumer.inspectManagedLibraryPins(changed));await fs.writeFile(pom,changed);await assert.rejects(consumer.planChange(f.root,f.context,f.releases[1],{operation:'update',owned:true}));}
});
