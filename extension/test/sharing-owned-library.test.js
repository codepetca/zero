'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const c=require('../src/sharing/contracts'),authoring=require('../src/sharing/authoring'),owned=require('../src/sharing/owned-library');
const execFile=require('node:util').promisify(require('node:child_process').execFile);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function crc32(b){let c=-1;for(const v of b){c^=v;for(let i=0;i<8;i++)c=c>>>1^(c&1?0xedb88320:0);}return(c^-1)>>>0;}
function zip(files){const local=[],central=[];let offset=0;for(const [name,value] of Object.entries(files)){const n=Buffer.from(name),b=Buffer.from(value),crc=crc32(b),l=Buffer.alloc(30),h=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(crc,14);l.writeUInt32LE(b.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt32LE(crc,16);h.writeUInt32LE(b.length,20);h.writeUInt32LE(b.length,24);h.writeUInt16LE(n.length,28);h.writeUInt32LE(offset,42);local.push(l,n,b);central.push(h,n);offset+=l.length+n.length+b.length;}const d=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(d.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,d,end]);}
async function fixture(t,options={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-owned-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},id=c.identity('library',repository.id,'health-bar'),version='0.1.0';
 const descriptor={schema:1,kind:'library',slug:id.slug,version,title:'Health',description:'Fixture',license:'MIT',libraryKind:'helper'};
 const binary={'zero/contrib/r12345/health_bar/Health.class':'class'},source={'zero/contrib/r12345/health_bar/Health.java':'class Health {}'};
 if(options.binaryLicense!==null)binary['META-INF/LICENSE']=options.binaryLicense||'MIT fixture';if(options.sourceLicense!==null)source['META-INF/LICENSE']=options.sourceLicense||'MIT fixture';
 const verified={jar:zip(binary),sources:zip(source),pom:Buffer.from(authoring.libraryPom(id,descriptor).replace(/<build>[\s\S]*?<\/build>/,''))};
 const artifacts={};for(const kind of Object.keys(verified)){const p=c.artifactPath(id,version,kind),b=verified[kind];artifacts[kind]={path:p,url:'https://files.example/'+p,size:b.length,sha256:hash(b)};}
 const release={...descriptor,id:id.id,repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:`libraries/${id.slug}`,sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',namespace:id.namespace,coordinate:{...id.coordinate,version},artifacts};
 const context={artifactOrigin:'https://files.example',catalog:{schema:1,revision:'d'.repeat(40),releases:[release]}};
 return {root,id:id.id,version,release,verified,context,dir:path.join(root,'zero-dependencies',id.id,version)};
}
test('install, offline read and exact reuse validate stored bytes',async t=>{const f=await fixture(t);assert.equal((await owned.installOwned(f.root,f.context,f.release,f.verified)).reused,false);const read=await owned.readOwned(f.root,f.id,f.version);assert.deepEqual(read.jar,f.verified.jar);assert.equal(read.license.toString(),'MIT fixture');assert.equal((await owned.installOwned(f.root,f.context,f.release,f.verified)).reused,true);});
test('reject forged bytes and releases before creating a bundle',async t=>{const f=await fixture(t),bad={...f.verified,jar:Buffer.from(f.verified.jar)};bad.jar[20]^=1;await assert.rejects(owned.installOwned(f.root,f.context,f.release,bad),/hash/);const forged=structuredClone(f.release);forged.title='Forged';await assert.rejects(owned.installOwned(f.root,f.context,forged,f.verified),/catalog/);await assert.rejects(fs.access(f.dir));});
test('reject missing or inconsistent embedded licenses',async t=>{for(const options of [{binaryLicense:null},{sourceLicense:'Different'}]){const f=await fixture(t,options);await assert.rejects(owned.installOwned(f.root,f.context,f.release,f.verified),/licenses/);}});
test('same-length tampering and unexpected files block offline reads',async t=>{const f=await fixture(t);await owned.installOwned(f.root,f.context,f.release,f.verified);const p=path.join(f.dir,'library.jar'),b=await fs.readFile(p);b[20]^=1;await fs.writeFile(p,b);await assert.rejects(owned.readOwned(f.root,f.id,f.version),/differs/);await fs.writeFile(p,f.verified.jar);await fs.writeFile(path.join(f.dir,'student.txt'),'keep');await assert.rejects(owned.readOwned(f.root,f.id,f.version),/unowned/);assert.equal(await fs.readFile(path.join(f.dir,'student.txt'),'utf8'),'keep');});
test('reject path escapes, links and collisions without overwriting student files',async t=>{const f=await fixture(t);await assert.rejects(owned.readOwned(f.root,'../escape',f.version),/identity/);await fs.mkdir(path.dirname(f.dir),{recursive:true});await fs.mkdir(f.dir);await fs.writeFile(path.join(f.dir,'student.txt'),'keep');await assert.rejects(owned.installOwned(f.root,f.context,f.release,f.verified));assert.equal(await fs.readFile(path.join(f.dir,'student.txt'),'utf8'),'keep');const g=await fixture(t);await fs.symlink(g.root,path.join(g.root,'zero-dependencies'));await assert.rejects(owned.installOwned(g.root,g.context,g.release,g.verified),/unsafe/);});
test('reject a symlinked bundle file',async t=>{const f=await fixture(t);await owned.installOwned(f.root,f.context,f.release,f.verified);const jar=path.join(f.dir,'library.jar');await fs.unlink(jar);await fs.symlink(path.join(f.dir,'sources.jar'),jar);await assert.rejects(owned.readOwned(f.root,f.id,f.version),/invalid|link/);});

test('reject unsupported POM even when catalog hashes match',async t=>{const f=await fixture(t);f.verified.pom=Buffer.from(f.verified.pom.toString().replace('</project>','<build><plugins/></build></project>'));f.release.artifacts.pom.size=f.verified.pom.length;f.release.artifacts.pom.sha256=hash(f.verified.pom);await assert.rejects(owned.installOwned(f.root,f.context,f.release,f.verified),/unsupported dependency configuration/);});

test('cleanup failure reports a validated installation and preserves original errors',async t=>{
 const f=await fixture(t),realRm=fs.rm;
 try {
  fs.rm=async (target,options)=>{if(String(target).includes('-stage-'))throw new Error('fixture cleanup failure');return realRm(target,options);};
  const result=await owned.installOwned(f.root,f.context,f.release,f.verified);
  assert.equal(result.reused,false);assert.match(result.cleanupWarning,/fixture cleanup failure/);
  assert.deepEqual((await owned.readOwned(f.root,f.id,f.version)).jar,f.verified.jar);
  const g=await fixture(t);await fs.mkdir(path.dirname(g.dir),{recursive:true});
  const realLink=fs.link;try {fs.link=async()=>{throw new Error('fixture publication failure');};await assert.rejects(owned.installOwned(g.root,g.context,g.release,g.verified),/fixture publication failure/);}finally{fs.link=realLink;}
 } finally {fs.rm=realRm;}
});
test('captured bundle validation is offline and rejects drift, duplicate, omission and wrong identity',async t=>{
 const f=await fixture(t);await owned.installOwned(f.root,f.context,f.release,f.verified);
 const prefix=`zero-dependencies/${f.id}/${f.version}/`;
 const files=await Promise.all(['library.jar','sources.jar','library.pom','LICENSE','manifest.json','.gitattributes'].map(async name=>({path:prefix+name,bytes:await fs.readFile(path.join(f.dir,name))})));
 await fs.rm(f.dir,{recursive:true});
 assert.deepEqual((await owned.validateOwnedFiles(f.id,f.version,files)).jar,f.verified.jar);
 const changed=files.map(item=>({...item,bytes:Buffer.from(item.bytes)}));changed[0].bytes[20]^=1;
 await assert.rejects(owned.validateOwnedFiles(f.id,f.version,changed),/differs/);
 await assert.rejects(owned.validateOwnedFiles(f.id,f.version,[...files.slice(0,5),files[0]]),/duplicate/);
 await assert.rejects(owned.validateOwnedFiles(f.id,f.version,files.slice(1)),/missing/);
 await assert.rejects(owned.validateOwnedFiles(f.id,'0.1.1',files),/invalid captured/);
 const oversize=files.map(item=>({...item}));oversize[4].bytes=Buffer.alloc(c.LIMITS.metadataBytes+4097);
 await assert.rejects(owned.validateOwnedFiles(f.id,f.version,oversize),/oversized/);
 const attributes=files.map(item=>item.path.endsWith('/.gitattributes')?{...item,bytes:Buffer.from('* text\n')}:item);
 await assert.rejects(owned.validateOwnedFiles(f.id,f.version,attributes),/Git attributes/);
});
test('each interrupted publication resumes with exact files and no overwrites',async t=>{
 for(let stop=1;stop<=6;stop++) {
  const f=await fixture(t),realLink=fs.link;let count=0;
  try {fs.link=async(...args)=>{if(++count===stop)throw new Error('interrupted publication');return realLink(...args);};await assert.rejects(owned.installOwned(f.root,f.context,f.release,f.verified),/interrupted publication/);}finally{fs.link=realLink;}
  const before=new Map(await Promise.all((await fs.readdir(f.dir)).map(async name=>[name,{bytes:await fs.readFile(path.join(f.dir,name)),ino:(await fs.lstat(path.join(f.dir,name))).ino}])));
  const result=await owned.installOwned(f.root,f.context,f.release,f.verified);assert.equal(result.reused,false);
  assert.deepEqual(result.jar,f.verified.jar);assert.equal((await fs.readdir(f.dir)).length,6);
  for(const [name,item] of before){assert.deepEqual(await fs.readFile(path.join(f.dir,name)),item.bytes);assert.equal((await fs.lstat(path.join(f.dir,name))).ino,item.ino);}
 }
});
test('retry preserves conflicting, extra and linked partial files without filling the bundle',async t=>{
 for(const kind of ['conflicting','extra','symlink']) {
  const f=await fixture(t);await fs.mkdir(f.dir,{recursive:true});
  if(kind==='conflicting')await fs.writeFile(path.join(f.dir,'library.jar'),'student bytes');
  else if(kind==='extra')await fs.writeFile(path.join(f.dir,'notes.txt'),'student notes');
  else {await fs.writeFile(path.join(f.root,'student.txt'),'student target');await fs.symlink(path.join(f.root,'student.txt'),path.join(f.dir,'library.jar'));}
  const before=await fs.readdir(f.dir);await assert.rejects(owned.installOwned(f.root,f.context,f.release,f.verified),/conflicts|unowned|invalid/);
  assert.deepEqual(await fs.readdir(f.dir),before);
  if(kind==='conflicting')assert.equal(await fs.readFile(path.join(f.dir,'library.jar'),'utf8'),'student bytes');
  if(kind==='extra')assert.equal(await fs.readFile(path.join(f.dir,'notes.txt'),'utf8'),'student notes');
  if(kind==='symlink')assert.equal(await fs.readFile(path.join(f.root,'student.txt'),'utf8'),'student target');
 }
});
test('retry releases only inode-matched staging aliases left by a crash',async t=>{
 const f=await fixture(t);await owned.installOwned(f.root,f.context,f.release,f.verified);
 const stage=await fs.mkdtemp(path.join(path.dirname(f.dir),'.'+f.version+'-stage-'));
 for(const name of ['library.jar','.gitattributes'])await fs.link(path.join(f.dir,name),path.join(stage,name));
 await fs.writeFile(path.join(stage,'sources.jar'),'unrelated copy');await fs.writeFile(path.join(stage,'student.txt'),'keep');
 const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'LICENSE'),'keep outside');
 await fs.symlink(outside,path.join(path.dirname(f.dir),'.'+f.version+'-stage-ABC123'));
 await fs.unlink(path.join(f.dir,'manifest.json'));
 assert.equal((await fs.lstat(path.join(f.dir,'library.jar'))).nlink,2);
 const result=await owned.installOwned(f.root,f.context,f.release,f.verified);assert.equal(result.reused,false);
 assert.equal((await fs.lstat(path.join(f.dir,'library.jar'))).nlink,1);assert.equal((await fs.lstat(path.join(f.dir,'.gitattributes'))).nlink,1);
 assert.deepEqual((await fs.readdir(stage)).sort(),['sources.jar','student.txt']);
 assert.equal(await fs.readFile(path.join(stage,'student.txt'),'utf8'),'keep');assert.equal(await fs.readFile(path.join(stage,'sources.jar'),'utf8'),'unrelated copy');assert.equal(await fs.readFile(path.join(outside,'LICENSE'),'utf8'),'keep outside');
});
test('a Git clone with core.autocrlf=true retains every exact bundle byte including CRLF license',async t=>{
 const license='MIT fixture\r\nCopyright student\r\n',f=await fixture(t,{binaryLicense:license,sourceLicense:license});
 await owned.installOwned(f.root,f.context,f.release,f.verified);
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0'};
 const git=(cwd,args)=>execFile('git',args,{cwd,env,encoding:'buffer',maxBuffer:8*1024*1024});
 await git(f.root,['init']);await git(f.root,['config','core.autocrlf','true']);await git(f.root,['config','core.safecrlf','false']);
 await git(f.root,['add','--','zero-dependencies']);await git(f.root,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Save exact library']);
 const cloned=path.join(f.root,'clone');await git(f.root,['-c','core.autocrlf=true','clone','--no-hardlinks','--',f.root,cloned]);
 const relative=`zero-dependencies/${f.id}/${f.version}/`;
 for(const name of await fs.readdir(f.dir)) {
  const original=await fs.readFile(path.join(f.dir,name)),committed=(await git(f.root,['show','HEAD:'+relative+name])).stdout;
  assert.deepEqual(committed,original,name+' committed bytes');assert.deepEqual(await fs.readFile(path.join(cloned,relative,name)),original,name+' clone bytes');
 }
 assert.equal((await owned.readOwned(cloned,f.id,f.version)).license.toString(),license);
});
