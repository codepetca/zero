'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {inspectSourceScope,createSavedSourceHost,cachePartition}=require('../src/saved-source-host');
const {readSavedBuilder}=require('../src/project-builder');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-saved-source-host-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const project=path.join(root,'project'),cache=path.join(root,'cache'),java=path.join(root,'jdk');const {prepareProjectBuilder}=await import('../../scripts/prepare-project-builder.mjs');await prepareProjectBuilder({destination:path.join(project,'.zero-build')});await fs.mkdir(path.join(project,'src/main/java'),{recursive:true});await fs.writeFile(path.join(project,'src/main/java/Main.java'),'class Main {}');await fs.mkdir(path.join(java,'bin'),{recursive:true});for(const tool of ['java','javac'])await fs.writeFile(path.join(java,'bin',tool),'fixture not executed');return {root,project,cache,java,options:{projectRoot:project,cacheRoot:cache,environment:{PATH:'',JAVA_HOME:java},platform:'linux'}};}
test('source scope inspection is data-only and binds source, creation, exact libraries, cached bytes and JDK',async t=>{
 const h=await fixture(t),inspect=()=>inspectSourceScope(h.options);let last=await inspect();assert.match(last.builderHash,/^[a-f0-9]{64}$/);
 const saved=await readSavedBuilder(h.project),cache=cachePartition(saved,h.cache);
 for(const [file,value]of [['src/main/java/Main.java','class Main { int changed; }'],['src/main/java/New.java','class New {}'],['zero-libraries.json','{"version":"1"}'],['libraries/demo/zero-library.json','{"version":"2"}']]){const filename=path.join(h.project,file);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,value);const next=await inspect();assert.notEqual(next.scopeHash,last.scopeHash,file);assert.equal(next.builderHash,last.builderHash);last=next;}
 await fs.mkdir(path.join(cache,'library-responses'),{recursive:true});await fs.writeFile(path.join(cache,'library-responses/index.json'),'{}');let next=await inspect();assert.notEqual(next.scopeHash,last.scopeHash);last=next;
 await fs.writeFile(path.join(h.java,'bin/java'),'changed runtime bytes');next=await inspect();assert.notEqual(next.scopeHash,last.scopeHash);last=next;
 await fs.rm(path.join(h.project,'src/main/java/New.java'));next=await inspect();assert.notEqual(next.scopeHash,last.scopeHash);
 await assert.rejects(fs.stat(path.join(h.project,'.zero')), {code:'ENOENT'});assert.equal(await fs.readFile(path.join(h.java,'bin/java'),'utf8'),'changed runtime bytes');
});
test('host requires the same approved scope before invoking the saved runner',async t=>{
 const h=await fixture(t);let calls=0;const host=createSavedSourceHost({...h.options,builder:{async checkSavedSources(options){calls++;assert.equal(options.explicitAction,undefined);assert.equal(options.approvedBuilderHash,expected.builderHash);return {status:'unavailable',identity:null};}}});const expected=await host.inspect();
 assert.equal((await host.check({approval:{builderHash:expected.builderHash},expectedIdentity:expected})).status,'unavailable');assert.equal(calls,1);
 await fs.writeFile(path.join(h.project,'src/main/java/Main.java'),'changed');assert.equal((await host.check({approval:{builderHash:expected.builderHash},expectedIdentity:expected})).status,'stale');assert.equal(calls,1);
 const current=await host.inspect();assert.equal((await host.check({approval:{builderHash:'0'.repeat(64)},expectedIdentity:current})).status,'stale');assert.equal(calls,1);
});
test('linked project input is unavailable rather than silently omitted',async t=>{
 const h=await fixture(t),outside=path.join(h.root,'outside.java');await fs.writeFile(outside,'private');await fs.symlink(outside,path.join(h.project,'src/main/java/Linked.java'));await assert.rejects(inspectSourceScope(h.options),/linked/);
});
