'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createGitHubAppProvider}=require('../src/github-app/provider');
const {githubAppConfiguration}=require('../src/github-app/config');
const {SECRET_KEY}=require('../src/github-app/credential-store');
const configuration=githubAppConfiguration();
const pair={access_token:'ghu_browseraccessabcdefgh',refresh_token:'ghr_browserrefreshabcdefgh',expires_in:28800,refresh_token_expires_in:15897600,token_type:'bearer',scope:''};
class Emitter{constructor(){this.listeners=new Set();this.event=fn=>{this.listeners.add(fn);return{dispose:()=>this.listeners.delete(fn)}};}fire(value){for(const fn of this.listeners)fn(value);}dispose(){this.listeners.clear();}}
async function fixture(t,{enabled=true,fallback=true}={}){
 const server=await import('../../website/lib/desktop-github-auth.mjs');
 const env={NODE_ENV:'test',ZERO_DESKTOP_GITHUB_ENABLED:enabled?'1':'0',ZERO_HUB_GITHUB_CLIENT_ID:configuration.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'test_server_secret_not_shipped_in_kit',ZERO_HUB_GITHUB_SESSION_SECRET:'a'.repeat(64)};
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'zero-browser-provider-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const events=new Emitter(),data=new Map(),calls=[],messages=[],opens=[];let time=1000000,exchanges=0,refreshes=0,failRefresh=false;
 const context={globalStorageUri:{scheme:'file',fsPath:directory},secrets:{onDidChange:events.event,get:async key=>data.get(key),store:async(key,value)=>{data.set(key,value);events.fire({key});},delete:async key=>{data.delete(key);events.fire({key});}}};
 const metadata={id:configuration.appId,client_id:configuration.clientId,slug:configuration.slug,owner:{login:configuration.owner},permissions:configuration.permissions};
 const githubFetch=async(url,options)=>{
  const fields=new URLSearchParams(options.body);assert.equal(url,'https://github.com/login/oauth/access_token');assert.equal(fields.get('client_secret'),env.ZERO_HUB_GITHUB_CLIENT_SECRET);
  if(fields.get('grant_type')==='refresh_token'){refreshes++;if(failRefresh)throw Error('ghr_do_not_leak');return Response.json({...pair,access_token:'ghu_rotatedabcdefgh',refresh_token:'ghr_rotatedabcdefgh'});}
  exchanges++;assert.ok(fields.get('code_verifier'));assert.equal(fields.get('redirect_uri'),'https://zero.codepet.ca/api/desktop/github/callback');return Response.json(pair);
 };
 const fetchImpl=async(url,options={})=>{
  calls.push(url);
  if(url.startsWith(configuration.websiteOrigin+'/api/desktop/github/')){
   const operation=url.split('/').at(-1),handler={start:server.startResponse,exchange:server.exchangeResponse,refresh:server.refreshResponse}[operation];
   assert.ok(handler);return handler(new Request(url,options),env,githubFetch,time);
  }
  if(url.includes('/apps/'))return Response.json(metadata);
  if(url.endsWith('/user'))return Response.json({id:42,login:'learner',type:'User'});
  if(url.endsWith('/device/code'))return Response.json({device_code:'device_code_abcdefgh',user_code:'ABCD-1234',verification_uri:'https://github.com/login/device',expires_in:900,interval:5});
  if(url.endsWith('/access_token')){assert.equal(new URLSearchParams(options.body).has('client_secret'),false);return Response.json(pair);}
  assert.fail('Unexpected network destination '+url);
 };
 const vscode={EventEmitter:Emitter,ProgressLocation:{Notification:15},Uri:{parse:value=>value},env:{clipboard:{writeText:async()=>{}},openExternal:async url=>{
  opens.push(url);if(url==='https://github.com/login/device')return true;
  const login=server.loginResponse(new Request(url),env,githubFetch,time);assert.equal(login.status,303);
  const authorize=new URL(login.headers.get('location'));assert.equal(authorize.origin,'https://github.com');assert.equal(authorize.pathname,'/login/oauth/authorize');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const callback=server.callbackResponse(new Request('https://zero.codepet.ca/api/desktop/github/callback?code=oauth_code_123456&state='+encodeURIComponent(authorize.searchParams.get('state')),{headers:{Cookie:cookie}}),env,githubFetch,time);
  assert.equal(callback.status,303);assert.doesNotMatch(callback.headers.get('location'),/ghu_|ghr_/);
  assert.equal((await fetch(callback.headers.get('location'))).status,200);return true;
 }},window:{showInformationMessage:async message=>{messages.push(message);return message==='Connect Zero to GitHub'?'Copy code and continue':fallback?'Sign in using a code':undefined;},withProgress:async(_options,run)=>run({report(){}},{isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})})}};
 const provider=createGitHubAppProvider({vscode,context,configuration,fetchImpl,now:()=>time});t.after(()=>provider.dispose());
 return{provider,data,calls,messages,opens,advance:()=>{time+=28800000;},failRefresh:()=>{failRefresh=true;},get exchanges(){return exchanges;},get refreshes(){return refreshes;}};
}
test('real browser client/server modules complete PKCE, store a separate browser family and renew through the server',async t=>{
 const f=await fixture(t);const session=await f.provider.createSession([]);
 assert.equal(session.account.id,'42');assert.equal(f.messages.length,0);assert.equal(f.exchanges,1);assert.equal(f.opens.length,1);
 let saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.flow,'browser');assert.equal(saved.state,'active');
 f.advance();const [renewed]=await f.provider.getSessions([]);assert.equal(renewed.accessToken,'ghu_rotatedabcdefgh');assert.equal(f.refreshes,1);
 saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.flow,'browser');assert.equal(saved.refreshToken,'ghr_rotatedabcdefgh');
 assert.equal(f.calls.some(url=>url==='https://github.com/login/oauth/access_token'),false);
});
test('an unavailable server offers explicit device fallback; choosing code bypasses the server entirely',async t=>{
 const f=await fixture(t,{enabled:false});await f.provider.createSession([]);
 assert.match(f.messages[0],/Browser sign-in is unavailable/);assert.equal(JSON.parse(f.data.get(SECRET_KEY)).flow,'device');assert.deepEqual(f.opens,['https://github.com/login/device']);
 const code=await fixture(t);await code.provider.createSession([],{method:'device'});
 assert.equal(code.calls.some(url=>url.includes('/api/desktop/')),false);assert.equal(JSON.parse(code.data.get(SECRET_KEY)).flow,'device');
});
test('declined fallback writes no credentials and uncertain browser rotation cannot become device refresh',async t=>{
 const declined=await fixture(t,{enabled:false,fallback:false});await assert.rejects(declined.provider.createSession([]),error=>error.code==='cancelled');assert.equal(declined.data.has(SECRET_KEY),false);
 const f=await fixture(t);await f.provider.createSession([]);f.advance();f.failRefresh();
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='reconnect-required'&&!error.message.includes('do_not_leak'));
 assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'reconnect');assert.deepEqual(await f.provider.getSessions([]),[]);
 assert.equal(f.refreshes,1);assert.equal(f.calls.some(url=>url==='https://github.com/login/oauth/access_token'),false);
});
