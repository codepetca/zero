'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const c=require('../src/sharing/contracts'),{prepareOwnedNative}=require('../src/sharing/owned-native');
async function fixture(t) {
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-native-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=path.join(dir,'project'),cacheRoot=path.join(dir,'cache');await fs.mkdir(root);
 const identity=c.identity('library','12345','health-bar');
 const pin=version=>({identity,version,storage:'owned'});
 const readOwned=async(_root,id,version)=>({release:{id,version,coordinate:{...identity.coordinate,version}},jar:Buffer.from('jar '+version),pom:Buffer.from('pom '+version)});
 const run=(pins,more={})=>prepareOwnedNative({root,pomText:'<!-- zero-sharing fixture owned start -->',cacheRoot,inspectPins:()=>pins,readOwned,...more});
 return {root,cacheRoot,identity,pin,run};
}
function file(repo,id,version,kind){return path.join(repo,c.artifactPath(id,version,kind).slice(6));}
test('unmanaged and legacy native POMs retain Maven XML support without managed parsing',async()=>{
 const custom='<project><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>app</artifactId><version>1.0</version><properties><message><![CDATA[ordinary <XML>]]></message><letter>&#65;</letter></properties><build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><configuration combine.self="override"><release>17</release></configuration></plugin></plugins></build></project>';
 const legacy=custom.replace('</properties>','<!-- zero-sharing lib-r12345-health-bar history start --><zero.sharing.lib-r12345-health-bar.previous>none</zero.sharing.lib-r12345-health-bar.previous><!-- zero-sharing lib-r12345-health-bar history end --></properties>').replace('</project>','<dependencies><!-- zero-sharing lib-r12345-health-bar dependency start --><dependency><groupId>ca.codepet.zero.contrib.r12345</groupId><artifactId>health-bar</artifactId><version>0.1.0</version></dependency><!-- zero-sharing lib-r12345-health-bar dependency end --></dependencies></project>');
 for(const pomText of [custom,legacy])assert.equal(await prepareOwnedNative({pomText,inspectPins:()=>assert.fail('Unowned native projects must not invoke the managed POM parser.')}),null);
});
test('recognizable malformed and orphaned ownership markers still fail closed',async()=>{
 const id='lib-r12345-health-bar';
 for(const marker of [
  `<!-- zero-sharing ${id} owned begins -->`,
  `<!-- zero-sharing ${id} owned start -->`,
  `<zero.sharing.${id}.owned>true</zero.sharing.${id}.owned>`
 ])await assert.rejects(prepareOwnedNative({pomText:`<project><properties>${marker}</properties></project>`}),/marker|repository|block/);
});
test('seeds exact bytes and revalidates them on warm offline reuse',async t=>{
 const f=await fixture(t),p=f.pin('0.1.0');let reads=0;
 const result=await f.run([p],{readOwned:async(...args)=>{reads++;return {release:{id:args[1],version:args[2],coordinate:{...f.identity.coordinate,version:args[2]}},jar:Buffer.from('jar 0.1.0'),pom:Buffer.from('pom 0.1.0')};}});
 assert.equal(await fs.readFile(file(result.repository,f.identity,p.version,'jar'),'utf8'),'jar 0.1.0');
 assert.equal(await fs.readFile(file(result.repository,f.identity,p.version,'pom'),'utf8'),'pom 0.1.0');
 const warm=await f.run([p],{readOwned:async(...args)=>{reads++;return {release:{id:args[1],version:args[2],coordinate:{...f.identity.coordinate,version:args[2]}},jar:Buffer.from('jar 0.1.0'),pom:Buffer.from('pom 0.1.0')};}});
 assert.equal(warm.repository,result.repository);assert.equal(reads,2);
});
test('rejects poisoned cache and symlinks while preserving other files',async t=>{
 const f=await fixture(t),p=f.pin('0.1.0'),{repository}=await f.run([p]),jar=file(repository,f.identity,p.version,'jar'),other=path.join(repository,'unrelated.txt');
 await fs.writeFile(other,'keep');await fs.writeFile(jar,'bad bytes');
 await assert.rejects(f.run([p]),/conflicting cache file/);assert.equal(await fs.readFile(jar,'utf8'),'bad bytes');assert.equal(await fs.readFile(other,'utf8'),'keep');
 await fs.unlink(jar);await fs.symlink(other,jar);await assert.rejects(f.run([p]),/conflicting cache file/);
});
test('validates all saved copies before creating cache, including on warm runs',async t=>{
 const f=await fixture(t),pins=[f.pin('0.1.0'),f.pin('0.2.0')];
 await assert.rejects(f.run(pins,{readOwned:async()=>{throw new Error('missing or corrupt saved copy');}}),/missing or corrupt/);await assert.rejects(fs.access(f.cacheRoot));
 await f.run([pins[0]]);await assert.rejects(f.run([pins[0]],{readOwned:async()=>{throw new Error('corrupt');}}),/corrupt/);
});
test('empty or legacy pins leave no cache; versions and projects are isolated',async t=>{
 const f=await fixture(t);assert.equal(await f.run([]),null);assert.equal(await f.run([{storage:'legacy'}]),null);await assert.rejects(fs.access(f.cacheRoot));
 const one=await f.run([f.pin('0.1.0'),f.pin('0.2.0')]);assert.equal(await fs.readFile(file(one.repository,f.identity,'0.2.0','jar'),'utf8'),'jar 0.2.0');
 const otherRoot=path.join(path.dirname(f.root),'other');await fs.mkdir(otherRoot);const two=await f.run([f.pin('0.1.0')],{root:otherRoot});assert.notEqual(one.repository,two.repository);
});
test('rejects unsafe identity, cache location and cache directories',async t=>{
 const f=await fixture(t),p=f.pin('0.1.0');
 await assert.rejects(f.run([{...p,identity:{...f.identity,slug:'../outside'}}]));
 await assert.rejects(f.run([p],{cacheRoot:path.join(f.root,'cache')}),/outside the project/);
 await fs.mkdir(f.cacheRoot);const external=path.join(path.dirname(f.root),'external');await fs.mkdir(external);await fs.symlink(external,path.join(f.cacheRoot,'link'));
 await assert.rejects(f.run([p],{cacheRoot:path.join(f.cacheRoot,'link','nested')}),/unsafe directory/);
});
test('schema-2 owned libraries require the project core before native execution',async t=>{
 const f=await fixture(t),p=f.pin('0.1.0');
 await assert.rejects(f.run([p],{readOwned:async(_root,id,version)=>({release:{schema:2,id,version,coordinate:{...f.identity.coordinate,version},coreRequirement:{minVersion:'0.1.0',maxExclusive:'0.2.0'}},jar:Buffer.from('jar'),pom:Buffer.from('pom')})}),/requires a project-owned zero-core/);
 await assert.rejects(fs.access(f.cacheRoot));
});
