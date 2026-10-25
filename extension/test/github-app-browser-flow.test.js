'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {browserFlow,refreshBrowserTokens,brokerOrigin}=require('../src/github-app/browser-flow');
const configuration={clientId:'Iv1234567890',websiteOrigin:'https://zero.codepet.ca'};
const pair={access_token:'ghu_browseraccessabcdefgh',refresh_token:'ghr_browserrefreshabcdefgh',expires_in:28800,refresh_token_expires_in:15897600,token_type:'bearer',scope:''};
const response=value=>new Response(JSON.stringify(value),{status:200});
const ticket='a'.repeat(64),code='oauth_code_123456';
function fixture(overrides={}){
 const calls=[],opens=[];let start;
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});const data=JSON.parse(options.body);
  assert.equal(options.headers['X-Zero-Desktop'],'1');assert.equal(options.redirect,'error');
  if(url.endsWith('/start')){start=data;return response({clientId:configuration.clientId,url:configuration.websiteOrigin+'/api/desktop/github/login?ticket='+ticket});}
  if(url.endsWith('/exchange')){assert.equal(createHash('sha256').update(data.codeVerifier).digest('base64url'),start.codeChallenge);assert.equal(data.code,code);assert.equal(data.ticket,ticket);return response(pair);}
  assert.ok(url.endsWith('/refresh'));return response(pair);
 };
 const vscode={Uri:{parse:value=>value},env:{openExternal:async url=>{
  opens.push(url);const destination=`http://127.0.0.1:${start.port}/github/${start.nonce}?code=${code}&ticket=${ticket}`;
  const result=await fetch(destination);assert.equal(result.status,200);assert.doesNotMatch(await result.text(),/ghu_|ghr_/);return true;
 }}};
 return {calls,opens,vscode,fetchImpl,get start(){return start;},options:{configuration,vscode,fetchImpl,timeoutMs:2000,...overrides}};
}
test('browser sign-in binds a real IPv4 loopback return to PKCE without codes or tokens in the opening URL',async()=>{
 const f=fixture();const result=await browserFlow(f.options);
 assert.equal(result.accessToken,pair.access_token);assert.equal(f.opens.length,1);assert.doesNotMatch(f.opens[0],/ghu_|ghr_|code=/);
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].options.headers['Content-Type'],'application/json');
 await assert.rejects(fetch(`http://127.0.0.1:${f.start.port}/github/${f.start.nonce}`));
});
test('wrong paths, methods, hosts, origins and duplicate callback values cannot consume the real return',async()=>{
 const f=fixture();f.vscode.env.openExternal=async()=>{
  const base=`http://127.0.0.1:${f.start.port}`,good=`/github/${f.start.nonce}?code=${code}&ticket=${ticket}`;
  for(const [url,options,status]of [['/wrong',{},404],[good,{method:'POST'},404],[good,{headers:{Origin:'https://evil.example'}},403],[good+'&code=other',{},400]])assert.equal((await fetch(base+url,options)).status,status);
  const wrongHost=await new Promise((resolve,reject)=>{const req=http.get(base+good,{headers:{Host:'evil.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});assert.equal(wrongHost,404);
  assert.equal((await fetch(base+good)).status,200);return true;
 };await browserFlow(f.options);assert.equal(f.calls.filter(item=>item.url.endsWith('/exchange')).length,1);
});
test('cancellation and timeout close owned listeners even while openExternal is unresolved',async()=>{
 for(const cancel of [true,false]){
  const controller=new AbortController(),f=fixture({signal:controller.signal,timeoutMs:30});
  f.vscode.env.openExternal=()=>{if(cancel)setTimeout(()=>controller.abort(),5);return new Promise(()=>{});};
  await assert.rejects(browserFlow(f.options),error=>error.code===(cancel?'cancelled':'browser-expired')&&!/using a code|use a code/.test(error.message));
  await assert.rejects(fetch(`http://127.0.0.1:${f.start.port}/github/${f.start.nonce}`));
  assert.equal(f.calls.length,1);
 }
});
test('unsafe broker replies and external-open failure do not exchange credentials or leak failures',async()=>{
 for(const url of ['https://evil.example/api/desktop/github/login?ticket='+ticket,configuration.websiteOrigin+'/wrong?ticket='+ticket,configuration.websiteOrigin+'/api/desktop/github/login?ticket='+ticket+'&extra=x']){
  const f=fixture();f.options.fetchImpl=async()=>response({clientId:configuration.clientId,url});
  await assert.rejects(browserFlow(f.options),error=>error.code==='browser-unavailable'&&!/using a code|use a code/.test(error.message)&&/Local running still works/.test(error.message));assert.equal(f.opens.length,0);
 }
 const f=fixture();f.vscode.env.openExternal=async()=>false;await assert.rejects(browserFlow(f.options),error=>error.code==='browser-unavailable'&&!/using a code|use a code/.test(error.message)&&/Local running still works/.test(error.message));assert.equal(f.calls.length,1);
 const untrusted=fixture();untrusted.options.fetchImpl=async()=>{throw Error('ghr_do_not_leak');};await assert.rejects(browserFlow(untrusted.options),error=>!error.message.includes('do_not_leak'));
 assert.throws(()=>brokerOrigin({websiteOrigin:'https://evil.example'}),error=>error.code==='browser-unavailable'&&!/using a code|use a code/.test(error.message)&&/Local running still works/.test(error.message));
});
test('browser refresh uses the pinned server endpoint, while denial never exchanges a code',async()=>{
 const f=fixture();assert.equal((await refreshBrowserTokens({configuration,refreshToken:pair.refresh_token,fetchImpl:f.fetchImpl})).accessToken,pair.access_token);
 assert.ok(f.calls[0].url.endsWith('/api/desktop/github/refresh'));
 const denied=fixture();denied.vscode.env.openExternal=async()=>{await fetch(`http://127.0.0.1:${denied.start.port}/github/${denied.start.nonce}?error=denied`);return true;};
 await assert.rejects(browserFlow(denied.options),error=>error.code==='cancelled');assert.equal(denied.calls.length,1);
});

function syntheticCallback(url,headers={}) {
 return new Promise((resolve,reject)=>{
  const request=http.get(url,{headers},response=>{
   let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));
  });request.on('error',reject);
 });
}
test('loopback accepts bounded synthetic browser cookies without weakening callback guards',async()=>{
 for(const bytes of [9*1024,32*1024]) {
  const f=fixture();let opened;
  f.vscode.env.openExternal=()=>opened=(async()=>{
   const base=`http://127.0.0.1:${f.start.port}`,good=`/github/${f.start.nonce}?code=${code}&ticket=${ticket}`,headers={Cookie:'fixture='+'c'.repeat(bytes)};
   for(const [path,extra,status] of [['/wrong',{},404],[good,{Host:'evil.example'},404],[good,{Origin:'https://evil.example'},403],[good+'&code=other',{},400],[good+'&extra='+'a'.repeat(8192),{},404]]) {
    const rejected=await syntheticCallback(base+path,{...headers,...extra});assert.equal(rejected.status,status);
    assert.equal(f.calls.filter(call=>call.url.endsWith('/exchange')).length,0);
   }
   const accepted=await syntheticCallback(base+good,headers);assert.equal(accepted.status,200);assert.equal(accepted.body,'Returning to Zero. You can close this tab.');return true;
  })();
  assert.equal((await browserFlow(f.options)).accessToken,pair.access_token);await opened;
  assert.equal(f.calls.filter(call=>call.url.endsWith('/exchange')).length,1);
 }
});
test('above-cap synthetic headers are rejected before exchange and preserve the valid callback',async()=>{
 const f=fixture();let opened;
 f.vscode.env.openExternal=()=>opened=(async()=>{
  const url=`http://127.0.0.1:${f.start.port}/github/${f.start.nonce}?code=${code}&ticket=${ticket}`;
  const rejected=await syntheticCallback(url,{Cookie:'fixture='+'c'.repeat(70*1024)});assert.equal(rejected.status,431);assert.equal(rejected.body,'');
  assert.equal(f.calls.filter(call=>call.url.endsWith('/exchange')).length,0);
  const accepted=await syntheticCallback(url,{Cookie:'fixture='+'c'.repeat(32*1024)});assert.equal(accepted.status,200);return true;
 })();
 assert.equal((await browserFlow(f.options)).accessToken,pair.access_token);await opened;
 assert.equal(f.calls.filter(call=>call.url.endsWith('/exchange')).length,1);
});
