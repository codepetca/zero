'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createGitHubAppProvider}=require('../src/github-app/provider');
const {githubAppConfiguration}=require('../src/github-app/config');
const {SECRET_KEY}=require('../src/github-app/credential-store');
const {createAuthentication,ownedProviderApi}=require('../src/authentication');
const configuration=githubAppConfiguration();
const pair={access_token:'ghu_browseraccessabcdefgh',refresh_token:'ghr_browserrefreshabcdefgh',expires_in:28800,refresh_token_expires_in:15897600,token_type:'bearer',scope:''};
class Emitter{constructor(){this.listeners=new Set();this.event=fn=>{this.listeners.add(fn);return{dispose:()=>this.listeners.delete(fn)}};}fire(value){for(const fn of this.listeners)fn(value);}dispose(){this.listeners.clear();}}
async function fixture(t,{enabled=true,hooks={}}={}){
 const server=await import('../../website/lib/desktop-github-auth.mjs');
 const env={NODE_ENV:'test',ZERO_DESKTOP_GITHUB_ENABLED:enabled?'1':'0',ZERO_HUB_GITHUB_CLIENT_ID:configuration.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'test_server_secret_not_shipped_in_kit',ZERO_HUB_GITHUB_SESSION_SECRET:'a'.repeat(64)};
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'zero-browser-provider-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const events=new Emitter(),data=new Map(),calls=[],messages=[],opens=[],progress=[],user={id:42,login:'learner',type:'User'};let time=1000000,exchanges=0,refreshes=0,failRefresh=false,cancelListener;
 const context={globalStorageUri:{scheme:'file',fsPath:directory},secrets:{onDidChange:events.event,get:async key=>data.get(key),store:async(key,value)=>{data.set(key,value);events.fire({key});},delete:async key=>{data.delete(key);events.fire({key});}}};
 const metadata={id:configuration.appId,client_id:configuration.clientId,slug:configuration.slug,owner:{login:configuration.owner},permissions:configuration.permissions};
 const githubFetch=async(url,options)=>{
  const fields=new URLSearchParams(options.body);assert.equal(url,'https://github.com/login/oauth/access_token');assert.equal(fields.get('client_secret'),env.ZERO_HUB_GITHUB_CLIENT_SECRET);
  if(fields.get('grant_type')==='refresh_token'){refreshes++;if(failRefresh)throw Error('ghr_do_not_leak');return Response.json({...pair,access_token:'ghu_rotatedabcdefgh',refresh_token:'ghr_rotatedabcdefgh'});}
  exchanges++;assert.ok(fields.get('code_verifier'));assert.equal(fields.get('redirect_uri'),'https://zero.codepet.ca/api/desktop/github/callback');return Response.json(pair);
 };
 const fetchImpl=async(url,options={})=>{
  calls.push(url);assert.ok(!options.body?.includes('client_secret'));assert.ok(!options.body?.includes(env.ZERO_HUB_GITHUB_CLIENT_SECRET));
  if(url.startsWith(configuration.websiteOrigin+'/api/desktop/github/')){
   const operation=url.split('/').at(-1),handler={start:server.startResponse,exchange:server.exchangeResponse,refresh:server.refreshResponse}[operation];
   assert.ok(handler);return handler(new Request(url,options),env,githubFetch,time);
  }
  if(url.includes('/apps/'))return Response.json(metadata);
  if(url.endsWith('/user')){await hooks.beforeUser?.();return Response.json(user);}
  assert.fail('Unexpected network destination '+url);
 };
 const vscode={EventEmitter:Emitter,ProgressLocation:{Notification:15},Uri:{parse:value=>value},env:{clipboard:{writeText:async()=>assert.fail('Browser sign-in must not copy a code')},openExternal:async url=>{
  opens.push(url);
  const login=server.loginResponse(new Request(url),env,githubFetch,time);assert.equal(login.status,303);
  const authorize=new URL(login.headers.get('location'));assert.equal(authorize.origin,'https://github.com');assert.equal(authorize.pathname,'/login/oauth/authorize');assert.equal(authorize.searchParams.get('prompt'),'select_account');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const callback=server.callbackResponse(new Request('https://zero.codepet.ca/api/desktop/github/callback?code=oauth_code_123456&state='+encodeURIComponent(authorize.searchParams.get('state')),{headers:{Cookie:cookie}}),env,githubFetch,time);
  assert.equal(callback.status,303);assert.doesNotMatch(callback.headers.get('location'),/ghu_|ghr_/);
  assert.equal((await fetch(callback.headers.get('location'))).status,200);return true;
 }},window:{showInformationMessage:async message=>{messages.push(message);assert.fail('Browser sign-in must not offer a code fallback');},withProgress:async(_options,run)=>run({report:value=>progress.push(value)},{isCancellationRequested:false,onCancellationRequested:listener=>{cancelListener=listener;return{dispose(){}};}})}};
 const create=()=>{const provider=createGitHubAppProvider({vscode,context,configuration,fetchImpl,now:()=>time});t.after(()=>provider.dispose());return provider;};
 const provider=create();
 return{provider,create,vscode,context,user,data,calls,messages,opens,progress,cancel:()=>cancelListener?.(),advance:()=>{time+=28800000;},failRefresh:()=>{failRefresh=true;},get exchanges(){return exchanges;},get refreshes(){return refreshes;}};
}
test('real browser client/server modules complete PKCE, store a separate browser family and renew through the server',async t=>{
 const f=await fixture(t);const session=await f.provider.createSession([]);
 assert.equal(session.account.id,'42');assert.equal(f.messages.length,0);assert.equal(f.exchanges,1);assert.equal(f.opens.length,1);
 let saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.flow,'browser');assert.equal(saved.state,'active');
 f.advance();const [renewed]=await f.provider.getSessions([]);assert.equal(renewed.accessToken,'ghu_rotatedabcdefgh');assert.equal(f.refreshes,1);
 saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.flow,'browser');assert.equal(saved.refreshToken,'ghr_rotatedabcdefgh');
 assert.equal(f.calls.some(url=>url==='https://github.com/login/oauth/access_token'),false);
});
test('an unavailable server fails without a device request, fallback dialog or stored credentials',async t=>{
 const f=await fixture(t,{enabled:false});
 await assert.rejects(f.provider.createSession([]),error=>error.code==='browser-unavailable'&&/connection.*default browser/.test(error.message)&&/Local running still works/.test(error.message)&&!/using a code/.test(error.message));
 assert.equal(f.data.has(SECRET_KEY),false);assert.deepEqual(f.opens,[]);assert.deepEqual(f.messages,[]);
 assert.equal(f.calls.some(url=>url.includes('/device/')||url==='https://github.com/login/oauth/access_token'),false);
});
test('explicit device and unknown sign-in methods reject before making any requests',async t=>{
 const f=await fixture(t);
 for(const method of ['device','unknown'])await assert.rejects(f.provider.createSession([],{method}),error=>error.code==='unsupported-method'&&/browser/.test(error.message));
 assert.deepEqual(f.calls,[]);assert.equal(f.data.has(SECRET_KEY),false);
 const session=await f.provider.createSession([],{method:'browser'});assert.equal(session.account.id,'42');assert.equal(JSON.parse(f.data.get(SECRET_KEY)).flow,'browser');
});
test('uncertain browser rotation cannot become device refresh',async t=>{
 const f=await fixture(t);await f.provider.createSession([]);f.advance();f.failRefresh();
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='reconnect-required'&&!error.message.includes('do_not_leak'));
 assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'reconnect');assert.deepEqual(await f.provider.getSessions([]),[]);
 assert.equal(f.refreshes,1);assert.equal(f.calls.some(url=>url==='https://github.com/login/oauth/access_token'),false);
});

test('removing the local session and signing in again keeps browser account selection available',async t=>{
 const f=await fixture(t);const first=await f.provider.createSession([]);
 await f.provider.removeSession(first.id);assert.equal(f.data.has(SECRET_KEY),false);
 const second=await f.provider.createSession([]);assert.notEqual(second.id,first.id);
 assert.equal(f.exchanges,2);assert.equal(f.opens.length,2);assert.equal(JSON.parse(f.data.get(SECRET_KEY)).flow,'browser');
});

test('native progress cancellation never exchanges a token or saves a session',async t=>{
 const f=await fixture(t);let opened=0;
 f.vscode.env.openExternal=async()=>{opened++;f.cancel();return true;};
 await assert.rejects(f.provider.createSession([]),error=>error.code==='cancelled');
 assert.equal(opened,1);assert.equal(f.exchanges,0);assert.equal(f.data.has(SECRET_KEY),false);assert.equal(f.provider.busy,false);
 assert.deepEqual(f.messages,[]);assert.match(f.progress.at(-1).message,/browser/);
});

test('failed browser opening does not exchange credentials or offer code sign-in',async t=>{
 const f=await fixture(t);f.vscode.env.openExternal=async()=>false;
 await assert.rejects(f.provider.createSession([]),error=>error.code==='browser-unavailable'&&/default browser/.test(error.message)&&!/using a code/.test(error.message));
 assert.equal(f.exchanges,0);assert.equal(f.data.has(SECRET_KEY),false);assert.deepEqual(f.messages,[]);
});

test('browser sign-in verifies personal numeric identity before saving credentials',async t=>{
 for(const user of [{id:0,login:'learner',type:'User'},{id:42,login:'learner',type:'Organization'},{id:42,login:'invalid name',type:'User'}]){
  const f=await fixture(t);Object.assign(f.user,user);
  await assert.rejects(f.provider.createSession([]),error=>error.code==='invalid-account');
  assert.equal(f.exchanges,1);assert.equal(f.data.has(SECRET_KEY),false);
 }
});

test('owned facade completes browser sign-in and retains capture and sign-out invalidation',async t=>{
 const f=await fixture(t),auth=createAuthentication(ownedProviderApi(f.provider));t.after(()=>auth.dispose());
 await auth.refresh();assert.equal(f.calls.length,0);assert.equal(auth.signedIn,false);
 await auth.signIn();assert.equal(auth.accountId,'42');const ticket=await auth.capture();
 assert.equal(JSON.parse(f.data.get(SECRET_KEY)).flow,'browser');assert.deepEqual(f.messages,[]);
 await f.provider.removeSession(auth.sessionId);assert.throws(()=>auth.assertCurrentNow(ticket),/account or sign-in changed/);
 await auth.refresh();assert.equal(auth.signedIn,false);assert.equal(f.data.has(SECRET_KEY),false);
});

test('owned facade cancellation leaves the browser connection signed out',async t=>{
 const f=await fixture(t),auth=createAuthentication(ownedProviderApi(f.provider));t.after(()=>auth.dispose());
 f.vscode.env.openExternal=async()=>{f.cancel();return true;};
 await assert.rejects(auth.signIn(),/cancelled or unavailable/);
 assert.equal(auth.signedIn,false);assert.equal(f.exchanges,0);assert.equal(f.data.has(SECRET_KEY),false);assert.deepEqual(f.messages,[]);
});

test('same-window browser requests share one authorization and emit a saved session',async t=>{
 const f=await fixture(t),events=[];f.provider.onDidChangeSessions(value=>events.push(value));
 const [first,second]=await Promise.all([f.provider.createSession([]),f.provider.createSession([])]);
 assert.deepEqual(first,second);assert.deepEqual(first.scopes,[]);assert.equal(f.exchanges,1);assert.equal(f.opens.length,1);
 assert.ok(events.some(value=>value.added.some(session=>session.id===first.id)));
 const saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.accessToken,pair.access_token);assert.equal(saved.refreshToken,pair.refresh_token);assert.equal(saved.state,'active');
 assert.ok(f.calls.every(url=>!url.includes('ghu_')&&!url.includes('ghr_')&&!url.includes('device_code')));
});

test('another window signing out during browser identity verification cannot resurrect the session',{timeout:5000},async t=>{
 const hooks={},f=await fixture(t,{hooks}),first=await f.provider.createSession([]),second=f.create();
 let started,release;const waiting=new Promise(resolve=>{started=resolve;});
 hooks.beforeUser=async()=>{started();await new Promise(resolve=>{release=resolve;});};
 const signingIn=f.provider.createSession([]);await waiting;
 await second.removeSession(first.id);assert.equal(f.data.has(SECRET_KEY),false);
 release();await assert.rejects(signingIn,error=>error.code==='connection-changed');assert.equal(f.data.has(SECRET_KEY),false);
});
