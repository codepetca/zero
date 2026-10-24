'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const core=require('../src/core-contract');
const root=path.resolve(__dirname,'../..');
async function sources(){return Object.fromEntries(await Promise.all(core.coreSourcePaths.map(async name=>[name,await fs.readFile(path.join(root,'framework',name))])));}
test('current core matches exact helper inventory, POM and local release metadata',async()=>{
 const data=await sources(),record=core.makeCoreRecord(data);
 assert.equal(record.coordinate.version,'0.3.0');assert.equal(record.sources.length,16);
 assert.deepEqual(Object.keys(require('../src/web-export/adapters').helperHashes).sort(),Object.keys(core.helperHashes).sort());
 assert.deepEqual(core.validateCoreRecord(record,data),record);
 assert.equal(record.sourceSha256,crypto.createHash('sha256').update(JSON.stringify(record.sources)).digest('hex'));
 const pom=await fs.readFile(path.join(root,'framework/pom.xml'),'utf8');
 assert.ok(pom.includes('<artifactId>zero-core</artifactId>\n  <version>0.3.0</version>'));
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'release/kit.json'),'utf8')).coreVersion,record.coordinate.version);
 const windows=Object.fromEntries(Object.entries(data).map(([name,bytes])=>[name,bytes.toString('utf8').replace(/\n/g,'\r\n')]));
 assert.deepEqual(core.makeCoreRecord(windows),record);
 for(const changed of [{...record,sourceSha256:'a'.repeat(64)},{...record,extra:true},{...record,sources:[...record.sources].reverse()},{...record,coordinate:{...record.coordinate,version:'0.2.1'}}])assert.throws(()=>core.validateCoreRecord(changed,data));
 const first=core.coreSourcePaths[0];assert.throws(()=>core.makeCoreRecord({...data,[first]:Buffer.from('changed')}),/differs/);
 const missing={...data};delete missing[first];assert.throws(()=>core.makeCoreRecord(missing),/exactly/);
 assert.throws(()=>core.makeCoreRecord({...data,'../Core.java':'spoof'}),/exactly/);
 assert.throws(()=>core.validateCoreRecord(record),/exactly/);
});
test('source normalization rejects malformed UTF-8, BOM, lone CR and oversized bytes',()=>{
 assert.equal(core.normalizeSource(Buffer.from('hello\r\nworld\n')),'hello\nworld\n');
 for(const bad of [Buffer.from([0xc3,0x28]),'\ufefftext','line\rnext','\ud800',Buffer.alloc(1024*1024+1)])assert.throws(()=>core.normalizeSource(bad));
});
test('project core reader recomputes source identity and refuses links, drift and oversized records',async t=>{
 const project=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero core record ')));t.after(()=>fs.rm(project,{recursive:true,force:true}));
 assert.equal(await core.readProjectCore(project),null);await assert.rejects(core.readProjectCore(project,{required:true}));
 const data=await sources(),record=core.makeCoreRecord(data);
 for(const [name,bytes]of Object.entries(data)){await fs.mkdir(path.dirname(path.join(project,name)),{recursive:true});await fs.writeFile(path.join(project,name),bytes);}
 const manifest=path.join(project,'zero-core.json');await fs.writeFile(manifest,JSON.stringify(record));
 assert.deepEqual(await core.readProjectCore(project),record);
 const first=core.coreSourcePaths[0],file=path.join(project,first);await fs.writeFile(file,'drift');await assert.rejects(core.readProjectCore(project),/differs/);await fs.writeFile(file,data[first]);
 if(process.platform!=='win32'){await fs.rename(manifest,manifest+'.real');await fs.symlink(manifest+'.real',manifest);await assert.rejects(core.readProjectCore(project),/ordinary/);await fs.unlink(manifest);await fs.rename(manifest+'.real',manifest);}
 await fs.writeFile(manifest,' '.repeat(65537));await assert.rejects(core.readProjectCore(project),/size bound/);
});
