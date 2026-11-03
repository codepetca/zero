'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const contracts=require('../src/sharing/contracts'),authoring=require('../src/sharing/authoring');
const {installOwned}=require('../src/sharing/owned-library');
const {zipFiles}=require('../src/web-export/zip');
const {resolveLibrarySources}=require('../src/web-export/libraries');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-web-owned-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},identity=contracts.identity('library',repository.id,'health-bar'),version='0.1.0';
 const descriptor={schema:1,kind:'library',slug:identity.slug,version,title:'Health',description:'Fixture',license:'MIT',libraryKind:'helper'};
 const prefix=identity.namespace.replaceAll('.','/')+'/',license={path:'META-INF/LICENSE',bytes:Buffer.from('MIT fixture')};
 const bytes={jar:zipFiles([license,{path:prefix+'Health.class',bytes:Buffer.from('class')},{path:prefix+'data.txt',bytes:Buffer.from('data')}]),sources:zipFiles([license,{path:prefix+'Health.java',bytes:Buffer.from(`package ${identity.namespace}; public class Health {}`)}]),pom:Buffer.from(authoring.libraryPom(identity,descriptor).replace(/<build>[\s\S]*?<\/build>/,''))};
 const artifacts={};for(const [kind,value] of Object.entries(bytes)){const p=contracts.artifactPath(identity,version,kind);artifacts[kind]={path:p,url:'https://files.example/'+p,size:value.length,sha256:hash(value)};}
 const release={...descriptor,id:identity.id,repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/health-bar',sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',namespace:identity.namespace,coordinate:{...identity.coordinate,version},artifacts};
 await installOwned(root,{artifactOrigin:'https://files.example',catalog:{schema:1,revision:'d'.repeat(40),releases:[release]}},release,bytes);
 const dir=`zero-dependencies/${identity.id}/${version}`,files=[{path:'pom.xml',bytes:Buffer.from('<project/>')}];
 for(const name of ['manifest.json','library.jar','sources.jar','library.pom','LICENSE','.gitattributes'])files.push({path:dir+'/'+name,bytes:await fs.readFile(path.join(root,dir,name))});
 const captured={files,libraries:[{identity,slug:identity.slug,mode:'published',version,source:'consumer',repositoryOrigin:'https://files.example',storage:'owned'}]};
 return {root,captured,dir,release};
}
test('owned browser sources resolve entirely from the captured bundle offline',async t=>{
 const f=await fixture(t);await fs.rm(path.join(f.root,f.dir),{recursive:true});
 const resolved=await resolveLibrarySources(f.root,f.captured,{fetcher:()=>{throw new Error('network used');}});
 assert.match(resolved.sources[0].bytes.toString(),/class Health/);assert.equal(resolved.resources[0].bytes.toString(),'data');
 assert.equal(resolved.publishedLibraries[0].storage,'owned');assert.equal(resolved.publishedLibraries[0].artifacts.sources.sha256,f.release.artifacts.sources.sha256);
});
test('owned browser resolution rejects incomplete or tampered snapshots without falling back',async t=>{
 const f=await fixture(t),options={fetcher:()=>{throw new Error('network used');}};
 const missing={...f.captured,files:f.captured.files.filter(file=>!file.path.endsWith('sources.jar'))};
 await assert.rejects(resolveLibrarySources(f.root,missing,options),/missing|bundle|files/i);
 const changed={...f.captured,files:f.captured.files.map(file=>file.path.endsWith('sources.jar')?{...file,bytes:Buffer.from('tampered')}:file)};
 await assert.rejects(resolveLibrarySources(f.root,changed,options),/differs|hash|size/i);
});
