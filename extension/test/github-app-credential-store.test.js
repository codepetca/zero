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
 for(const mutation of [{schema:2},{state:'unknown'},{account:{id:'attacker',label:'learner'}},{accessToken:'native_github_token'}]){data.set(SECRET_KEY,JSON.stringify({...record(),...mutation}));await assert.rejects(first.read(),/invalid/);}
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
 await fs.writeFile(file,'malformed');await assert.rejects(lock(async()=>assert.fail()),error=>error.code==='connection-busy');
 assert.throws(()=>createCredentialLock({globalStorageUri:{scheme:'vscode-remote',fsPath:dir}}),/local extension storage/);
});
