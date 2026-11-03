'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const c=require('../src/sharing/contracts');
const consumer=require('../src/sharing/consumer');
const authoring=require('../src/sharing/authoring');

async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-integrity-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main {}');
 const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
 const descriptor={schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health Bar',description:'Fixture library',license:'MIT',libraryKind:'helper'};
 const id=c.identity('library',repository.id,descriptor.slug),bytes=new Map(),artifacts={};
 for(const kind of ['jar','sources','pom']) {
  const data=kind==='pom'?Buffer.from(authoring.libraryPom(id,descriptor).replace(/<build>[\s\S]*?<\/build>/,'')):Buffer.from([0x50,0x4b,0x03,0x04,1,2,3,4]);
  const artifactPath=c.artifactPath(id,descriptor.version,kind);
  bytes.set(artifactPath,data);
  artifacts[kind]={path:artifactPath,url:`https://files.example/${artifactPath}`,size:data.length,sha256:authoring.hash(data)};
 }
 const release={...descriptor,id:id.id,repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/health-bar',sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',namespace:id.namespace,coordinate:{...id.coordinate,version:descriptor.version},artifacts};
 const catalog={schema:1,revision:'d'.repeat(40),releases:[release]};
 const settings={catalogUrl:'https://zero.example/catalog',artifactOrigin:'https://files.example'};
 const fetcher=async url=>new Response(url===settings.catalogUrl?JSON.stringify(catalog):bytes.get(new URL(url).pathname.slice(1)));
 const context=await consumer.loadCatalog(settings,{fetcher});
 return {root,release,bytes,context};
}
async function snapshot(root,relative='') {
 const result={};
 for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})) {
  const name=path.join(relative,entry.name);
  if(entry.isDirectory())Object.assign(result,await snapshot(root,name));
  else result[name]=await fs.readFile(path.join(root,name),'hex');
 }
 return result;
}

test('catalog hashes verify exact artifact bytes, including same-length changes',async t=>{
 const f=await fixture(t);
 for(const kind of ['jar','sources','pom']) {
  const artifact=f.release.artifacts[kind],original=f.bytes.get(artifact.path);
  assert.deepEqual(await consumer.downloadArtifact(f.context,f.release,kind),original);
  const changed=Buffer.from(original);changed[changed.length-1]^=1;
  assert.equal(changed.length,artifact.size);
  f.bytes.set(artifact.path,changed);
  await assert.rejects(consumer.downloadArtifact(f.context,f.release,kind),/differs from the catalog size or hash/);
  f.bytes.set(artifact.path,original);
 }
});

test('planning rejects each same-length modified artifact without changing project files',async t=>{
 const f=await fixture(t),before=await snapshot(f.root);
 for(const kind of ['jar','sources','pom']) {
  const artifact=f.release.artifacts[kind],original=f.bytes.get(artifact.path),changed=Buffer.from(original);
  changed[changed.length-1]^=1;
  assert.equal(changed.length,artifact.size);
  f.bytes.set(artifact.path,changed);
  await assert.rejects(consumer.planChange(f.root,f.context,f.release),/differs from the catalog size or hash/);
  assert.deepEqual(await snapshot(f.root),before);
  f.bytes.set(artifact.path,original);
 }
 const plan=await consumer.planChange(f.root,f.context,f.release);
 assert.match(plan.afterText,/<artifactId>health-bar<\/artifactId><version>0\.1\.0<\/version>/);
 assert.deepEqual(await snapshot(f.root),before);
});
