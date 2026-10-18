'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createGitHubAppProvider}=require('../src/github-app/provider');
const {binding,SECRET_KEY}=require('../src/github-app/credential-store');
const permissions={metadata:'read',repository_creation:'write',contents:'write',workflows:'write',actions:'write',pages:'write',starring:'write'};
const configuration={appId:123,clientId:'Iv1234567890',owner:'codepetca',slug:'codepet-zero',permissions};
class Emitter{constructor(){this.listeners=new Set();this.event=listener=>{this.listeners.add(listener);return{dispose:()=>this.listeners.delete(listener)}};}fire(value){for(const listener of this.listeners)listener(value);}dispose(){this.listeners.clear();}}
const record=(time=1000000)=>({schema:1,app:binding(configuration),sessionId:'12345678-1234-1234-1234-123456789012',account:{id:'42',label:'learner'},state:'active',accessToken:'ghu_accessabcdefgh',refreshToken:'ghr_refreshabcdefgh',expiresAt:time+500000,refreshExpiresAt:time+15000000});
const pair={access_token:'ghu_newaccessabcdefgh',refresh_token:'ghr_newrefreshabcdefgh',expires_in:28800,refresh_token_expires_in:15897600,token_type:'bearer',scope:''};
const metadata={id:123,client_id:configuration.clientId,slug:configuration.slug,owner:{login:'codepetca'},permissions};
const response=value=>new Response(JSON.stringify(value),{status:200});
async function fixture(t,{saved=record(),overrides={},config=configuration}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'zero-provider-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const events=new Emitter(),data=new Map(saved?[[SECRET_KEY,JSON.stringify(saved)]]:[]),calls=[];
 const context={globalStorageUri:{scheme:'file',fsPath:directory},secrets:{onDidChange:events.event,get:async k=>data.get(k),store:async(k,v)=>{data.set(k,v);events.fire({key:k});},delete:async k=>{data.delete(k);events.fire({key:k});}}};
 let cancelListener;
 const vscode={EventEmitter:Emitter,ProgressLocation:{Notification:15},Uri:{parse:value=>value},env:{openExternal:async()=>true},window:{showInformationMessage:async()=> 'Continue to GitHub',withProgress:async(_options,callback)=>callback({}, {onCancellationRequested:listener=>{cancelListener=listener;return{dispose(){}};},isCancellationRequested:false})}};
 const fetchImpl=async(url,options)=>{calls.push([url,options]);if(overrides.fetch)return overrides.fetch(url,options);if(url.includes('/apps/'))return response(metadata);if(url.endsWith('/user'))return response({id:42,login:'learner',type:'User'});if(url.endsWith('/access_token'))return response(pair);return response({device_code:'device_code_abcdefgh',user_code:'ABCD-1234',verification_uri:'https://github.com/login/device',expires_in:900,interval:5});};
 const create=()=>createGitHubAppProvider({vscode,context,configuration:config,fetchImpl,now:()=>1000000});
 const provider=create();t.after(()=>provider.dispose());return{provider,create,vscode,context,data,calls,events,cancel:()=>cancelListener?.()};
}
test('unconfigured activation leaves local work available and never acquires other provider sessions',async t=>{
 const f=await fixture(t,{config:null});assert.deepEqual(await f.provider.getSessions([]),[]);await assert.rejects(f.provider.createSession([]),error=>error.code==='unconfigured');assert.equal(f.calls.length,0);
});
test('restart returns standard numeric identity session, no OAuth scopes, and signout only clears Zero',async t=>{
 const f=await fixture(t);f.data.set('other.extension','preserve');const [session]=await f.provider.getSessions([]);assert.equal(session.account.id,'42');assert.deepEqual(session.scopes,[]);assert.equal(session.accessToken,'ghu_accessabcdefgh');
 const second=f.create();t.after(()=>second.dispose());assert.deepEqual(await second.getSessions([]),[session]);await f.provider.removeSession('other-session');assert(f.data.has(SECRET_KEY));await f.provider.removeSession(session.id);assert.equal(f.data.get('other.extension'),'preserve');assert.equal(f.data.has(SECRET_KEY),false);assert.deepEqual(await second.getSessions([]),[]);await assert.rejects(f.provider.getSessions(['repo']),error=>error.code==='unsupported-scopes');
});
test('secret changes invalidate immediately; repeated empty reads do not cause event loops',async t=>{
 const f=await fixture(t);await f.provider.getSessions([]);const events=[];f.provider.onDidChangeSessions(value=>events.push(value));f.events.fire({key:SECRET_KEY});assert.equal(events.length,1);assert.equal(events[0].removed[0].account.id,'42');await f.context.secrets.delete(SECRET_KEY);const count=events.length;await f.provider.getSessions([]);await f.provider.getSessions([]);assert.equal(events.length,count);
});
test('App metadata id/client/owner/permission tampering prevents device sign-in',async t=>{
 for(const changed of [{id:456},{client_id:'Ivattacker'},{owner:{login:'evil'}},{permissions:{...permissions,administration:'write'}}]){
 const f=await fixture(t,{saved:null,overrides:{fetch:async url=>{assert(url.includes('/apps/'));return response({...metadata,...changed});}}});await assert.rejects(f.provider.createSession([]),error=>error.code==='app-mismatch');assert.equal(f.calls.length,1);assert.equal(f.data.has(SECRET_KEY),false);
 }
});
test('account drift removes credentials; mutable username updates preserve numeric account',async t=>{
 const f=await fixture(t,{overrides:{fetch:async url=>response(url.includes('/apps/')?metadata:{id:99,login:'learner',type:'User'})}});await assert.rejects(f.provider.getSessions([]),error=>error.code==='account-changed');assert.equal(f.data.has(SECRET_KEY),false);
 const renamed=await fixture(t,{overrides:{fetch:async url=>response(url.includes('/apps/')?metadata:{id:42,login:'new-name',type:'User'})}});assert.equal((await renamed.provider.getSessions([]))[0].account.label,'new-name');assert.equal(JSON.parse(renamed.data.get(SECRET_KEY)).account.id,'42');
});
test('two windows refresh once and reread the winning atomic pair',async t=>{
 const f=await fixture(t,{saved:{...record(),expiresAt:999999}});const second=f.create();t.after(()=>second.dispose());
 const [a,b]=await Promise.all([f.provider.getSessions([]),second.getSessions([])]);assert.equal(a[0].accessToken,pair.access_token);assert.equal(b[0].accessToken,pair.access_token);assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,1);const saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.refreshToken,pair.refresh_token);assert.equal(saved.state,'active');
});
test('unknown rotation outcome persists reconnect state and restart never retries old refresh',async t=>{
 let rotations=0;const f=await fixture(t,{saved:{...record(),expiresAt:999999},overrides:{fetch:async url=>{if(url.endsWith('/access_token')){rotations++;throw Error('ghr_do_not_leak');}return response(metadata);}}});
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='reconnect-required'&&!error.message.includes('do_not_leak'));assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'reconnect');assert.deepEqual(await f.provider.getSessions([]),[]);
 const second=f.create();t.after(()=>second.dispose());assert.deepEqual(await second.getSessions([]),[]);assert.equal(rotations,1);
});
test('crash marker, expired refresh and malformed secret require reconnection without network',async t=>{
 for(const saved of [{...record(),state:'refreshing'},{...record(),expiresAt:100,refreshExpiresAt:999999}]){const f=await fixture(t,{saved});assert.deepEqual(await f.provider.getSessions([]),[]);assert.equal(f.calls.length,0);}
 const f=await fixture(t);f.data.set(SECRET_KEY,'ghu_invalid secret');await assert.rejects(f.provider.getSessions([]),error=>error.code==='invalid-credentials'&&!error.message.includes('ghu_'));assert.equal(f.calls.length,0);
});
test('cancelled required code step and native cancellation do not poll or save credentials',async t=>{
 const f=await fixture(t,{saved:null});f.vscode.window.showInformationMessage=async()=>undefined;await assert.rejects(f.provider.createSession([]),error=>error.code==='cancelled');assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,0);assert.equal(f.data.has(SECRET_KEY),false);
 const g=await fixture(t,{saved:null});g.vscode.window.showInformationMessage=async()=>{g.cancel();return 'Continue to GitHub';};await assert.rejects(g.provider.createSession([]),error=>error.code==='cancelled');assert.equal(g.data.has(SECRET_KEY),false);
});
test('completed device sign-in stores one expiring pair and verifies personal numeric identity',async t=>{
 const f=await fixture(t,{saved:null});const events=[];f.provider.onDidChangeSessions(value=>events.push(value));
 const session=await f.provider.createSession([]);assert.equal(session.account.id,'42');assert.equal(session.accessToken,pair.access_token);assert.deepEqual(session.scopes,[]);
 const saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.accessToken,pair.access_token);assert.equal(saved.refreshToken,pair.refresh_token);assert.equal(saved.state,'active');assert(events.some(value=>value.added.some(value=>value.id===session.id)));
 assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,1);
 for(const [url,options]of f.calls){assert(!url.includes('ghu_'));assert(!url.includes('ghr_'));assert(!url.includes('device_code'));assert(!options.body?.includes('client_secret'));}
});
test('revoked connection clears only the Zero secret',async t=>{
 const f=await fixture(t,{overrides:{fetch:async url=>url.endsWith('/user')?new Response('token details must not leak',{status:401}):response(metadata)}});f.data.set('other.extension','keep');
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='unauthorized'&&!error.message.includes('token details'));assert.equal(f.data.has(SECRET_KEY),false);assert.equal(f.data.get('other.extension'),'keep');
});
test('rotation persisted despite uncertain storage acknowledgement is reread and retained',async t=>{
 const f=await fixture(t,{saved:{...record(),expiresAt:999999}});const store=f.context.secrets.store;
 f.context.secrets.store=async(key,value)=>{await store(key,value);const saved=JSON.parse(value);if(saved.state==='active'&&saved.refreshToken===pair.refresh_token)throw Error('storage acknowledgement lost');};
 assert.equal((await f.provider.getSessions([]))[0].accessToken,pair.access_token);assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,1);
});
test('a secret change while identity is in flight cannot resurrect the previous session',async t=>{
 let fixtureValue;const f=await fixture(t,{overrides:{fetch:async url=>{if(url.includes('/apps/'))return response(metadata);await fixtureValue.context.secrets.delete(SECRET_KEY);return response({id:42,login:'learner',type:'User'});}}});fixtureValue=f;
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='connection-changed');assert.equal(f.data.has(SECRET_KEY),false);
});
