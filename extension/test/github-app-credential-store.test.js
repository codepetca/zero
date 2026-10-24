'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {SECRET_KEY,binding,createCredentialStore,createCredentialLock}=require('../src/github-app/credential-store');
const configuration={appId:1,clientId:'Iv1234567890',owner:'codepetca',slug:'codepet'};
const record=()=>({schema:1,app:binding(configuration),sessionId:'12345678-1234-1234-1234-123456789012',account:{id:'42',label:'learner'},state:'active',accessToken:'ghu_accessabcdefgh',refreshToken:'ghr_refreshabcdefgh',expiresAt:1000,refreshExpiresAt:10000});
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zero-auth-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('one versioned secret atomically retains pair and App/account binding across restart', async()=>{
 const data=new Map();const secrets={get:async k=>data.get(k),store:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)};
 const first=createCredentialStore({secrets,configuration});await first.write(record());assert.equal(data.size,1);assert(data.has(SECRET_KEY));
 assert.deepEqual(await createCredentialStore({secrets,configuration}).read(),record());
 await assert.rejects(createCredentialStore({secrets,configuration:{...configuration,appId:2}}).read(),/invalid/);
 for(const mutation of [{schema:2},{flow:'unknown'},{flow:null},{state:'unknown'},{account:{id:'attacker',label:'learner'}},{accessToken:'native_github_token'}]){data.set(SECRET_KEY,JSON.stringify({...record(),...mutation}));await assert.rejects(first.read(),/invalid/);}
 for (const flow of ['browser','device']) {await first.write({...record(),flow});assert.equal((await first.read()).flow,flow);}
 await first.clear();assert.equal(data.size,0);
});
test('cross-window lock serializes work and writes only non-secret ownership metadata',async t=>{
 const dir=await directory(t);const uri={scheme:'file',fsPath:dir};const lock1=createCredentialLock({globalStorageUri:uri}),lock2=createCredentialLock({globalStorageUri:uri});
 let active=0,max=0;const execute=()=>new Promise(resolve=>setTimeout(()=>{active--;resolve();},30));
 await Promise.all([lock1(async()=>{active++;max=Math.max(max,active);const text=await fs.readFile(path.join(dir,'github-app-refresh.lock'),'utf8');assert(!text.includes('ghu_'));assert(!text.includes('ghr_'));await execute();}),lock2(async()=>{active++;max=Math.max(max,active);await execute();})]);assert.equal(max,1);assert.deepEqual(await fs.readdir(dir),[]);
});
test('active/unknown lock is bounded, dead old local owner may recover, non-local storage rejected',async t=>{
 const dir=await directory(t),file=path.join(dir,'github-app-refresh.lock');let time=200000;
 const lock=createCredentialLock({globalStorageUri:{scheme:'file',fsPath:dir},now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:200});
 await fs.writeFile(file,JSON.stringify({pid:process.pid,host:os.hostname(),nonce:'live',startedAt:1}));
 await assert.rejects(lock(async()=>assert.fail('live lock stolen')),error=>error.code==='connection-busy');
 await fs.writeFile(file,JSON.stringify({pid:2147483647,host:os.hostname(),nonce:'dead',startedAt:1}));
 assert.equal(await lock(async()=>42),42);
 await fs.writeFile(file,'malformed');await assert.rejects(lock(async()=>assert.fail()),error=>error.code==='connection-lock-repair-required');
 assert.throws(()=>createCredentialLock({globalStorageUri:{scheme:'vscode-remote',fsPath:dir}}),/local extension storage/);
});
test('abandoned recovery guard is diagnosed without deletion and closed-editor rename repair preserves credential state',async t=>{
 for(const state of ['active','refreshing','reconnect']) {
  const dir=await directory(t),main=path.join(dir,'github-app-refresh.lock'),guard=path.join(dir,'github-app-refresh.recovery.lock');let time=200000;
  const lock=createCredentialLock({globalStorageUri:{scheme:'file',fsPath:dir},now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:200});
  const stale=JSON.stringify({pid:2147483647,host:os.hostname(),nonce:'dead-owner',startedAt:1});await fs.writeFile(main,stale);await fs.writeFile(guard,'');
  await assert.rejects(lock(async()=>assert.fail('unknown recovery guard stolen')),error=>error.code==='connection-lock-repair-required'&&error.recoveryDirectory===dir&&error.recoveryGuide==='https://github.com/codepetca/zero/blob/main/docs/ZERO-AUTH-RECOVERY.md'&&error.message.includes(error.recoveryGuide)&&!/ghu_|ghr_/.test(error.message));
  assert.equal(await fs.readFile(main,'utf8'),stale);assert.equal(await fs.readFile(guard,'utf8'),'');
  const data=new Map([[SECRET_KEY,JSON.stringify({...record(),state})],['other.extension','preserve']]);
  const secrets={get:async key=>data.get(key),store:async(key,value)=>data.set(key,value),delete:async key=>data.delete(key)};
  const store=createCredentialStore({secrets,configuration});const original=await store.raw();
  // This simulates the documented manual step only after all editor processes
  // have stopped. Production never performs this rename or removes the guard.
  await fs.rename(main,main+'.closed-editor-backup');await fs.rename(guard,guard+'.closed-editor-backup');
  assert.equal(await lock(async()=>(await store.read()).state),state);
  assert.equal(await store.raw(),original,'Repair cannot reset a refreshing/reconnect marker or credentials');assert.equal(data.get('other.extension'),'preserve');
  assert.equal(await fs.readFile(main+'.closed-editor-backup','utf8'),stale);assert.equal(await fs.readFile(guard+'.closed-editor-backup','utf8'),'');
 }
});
test('a live recovery guard and unknown main lock are never removed automatically',async t=>{
 const dir=await directory(t);let time=200000;const main=path.join(dir,'github-app-refresh.lock'),guard=path.join(dir,'github-app-refresh.recovery.lock');
 const live=JSON.stringify({pid:process.pid,host:os.hostname(),nonce:'live-recovery',startedAt:1});await fs.writeFile(main,'unknown');await fs.writeFile(guard,live);
 const lock=createCredentialLock({globalStorageUri:{scheme:'file',fsPath:dir},now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:100});
 await assert.rejects(lock(async()=>assert.fail()),error=>error.code==='connection-lock-repair-required');assert.equal(await fs.readFile(main,'utf8'),'unknown');assert.equal(await fs.readFile(guard,'utf8'),live);
});

test('desktop vscode-userdata storage shares the filesystem lock; remote and relative locations fail closed',async t=>{
 const dir=await directory(t),file=path.join(dir,'github-app-refresh.lock');
 const local=createCredentialLock({globalStorageUri:{scheme:'vscode-userdata',authority:'',fsPath:dir}});
 const fileLock=createCredentialLock({globalStorageUri:{scheme:'file',fsPath:dir},timeoutMs:1});
 await local(async()=>{
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).pid,process.pid);
  await assert.rejects(fileLock(async()=>assert.fail('shared local lock bypassed')),error=>error.code==='connection-busy');
 });
 assert.deepEqual(await fs.readdir(dir),[]);
 for(const uri of [{scheme:'vscode-userdata',authority:'remote-host',fsPath:dir},{scheme:'vscode-userdata',authority:'',fsPath:'relative'},{scheme:'vscode-remote',fsPath:dir}])
  assert.throws(()=>createCredentialLock({globalStorageUri:uri}),/local extension storage/);
});
