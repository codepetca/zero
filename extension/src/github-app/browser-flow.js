'use strict';
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {requestJson,tokenPair,failure}=require('./device-flow');

function brokerOrigin(configuration,allowLoopbackForTests=false){
  let url;try{url=new URL(configuration.websiteOrigin);}catch{}
  const local=allowLoopbackForTests&&url?.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port;
  if(!url||(!local&&url.origin!=='https://zero.codepet.ca')||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw failure('browser-unavailable','Browser sign-in is unavailable. Sign in using a code instead.');
  return url.origin;
}
async function brokerRequest(configuration,operation,body,options={}){
  const origin=brokerOrigin(configuration,options.allowLoopbackForTests);
  return requestJson(options.fetchImpl||globalThis.fetch,origin+'/api/desktop/github/'+operation,{body,jsonBody:true,signal:options.signal});
}
async function refreshBrowserTokens({configuration,refreshToken,now=Date.now,...options}){
  const value=await brokerRequest(configuration,'refresh',{refreshToken},options);
  return tokenPair(value,now());
}

async function browserFlow({configuration,vscode,fetchImpl=globalThis.fetch,signal,now=Date.now,timeoutMs=600000,allowLoopbackForTests=false,onProgress=()=>{}}){
  const origin=brokerOrigin(configuration,allowLoopbackForTests);
  if(signal?.aborted)throw failure('cancelled','GitHub sign-in was cancelled.');
  const nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const codeChallenge=createHash('sha256').update(verifier).digest('base64url');
  const controller=new AbortController();
  let finish,fail,settled=false,timer,port,stoppedError;
  const received=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
  // A listener can fail/cancel while start/openExternal is still pending.
  received.catch(()=>{});
  const stop=error=>{if(settled)return;settled=true;stoppedError=error;controller.abort();fail(error);};
  const abort=()=>stop(failure('cancelled','GitHub sign-in was cancelled.'));
  signal?.addEventListener('abort',abort,{once:true});
  // Browsers share loopback cookies across ports. Allow bounded incidental
  // headers independently of the strict callback URL; no cookies are inspected.
  const server=http.createServer({maxHeaderSize:64*1024},(request,response)=>{
    const headers={'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
    const reply=(status,text)=>{response.writeHead(status,headers);response.end(text);};
    if(settled||request.method!=='GET'||request.headers.host!==`127.0.0.1:${port}`||typeof request.url!=='string'||request.url.length>8192)return reply(404,'Not found');
    if(request.headers.origin&&request.headers.origin!==origin)return reply(403,'Invalid origin');
    let url;try{url=new URL(request.url,`http://127.0.0.1:${port}`);}catch{return reply(400,'Invalid request');}
    if(url.pathname!==`/github/${nonce}`)return reply(404,'Not found');
    const keys=[...url.searchParams.keys()];
    if(keys.length===1&&keys[0]==='error'&&url.searchParams.get('error')==='denied'){
      reply(200,'GitHub sign-in was cancelled. You can return to Zero.');
      return stop(failure('cancelled','GitHub sign-in was cancelled.'));
    }
    const codes=url.searchParams.getAll('code'),tickets=url.searchParams.getAll('ticket');
    if(keys.length!==2||codes.length!==1||tickets.length!==1||!/^[A-Za-z0-9_-]{10,256}$/.test(codes[0])||!/^[A-Za-z0-9_-]{40,4096}$/.test(tickets[0]))return reply(400,'Invalid request');
    settled=true;reply(200,'Returning to Zero. You can close this tab.');finish({code:codes[0],ticket:tickets[0]});
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1;
  server.on('error',()=>stop(failure('browser-unavailable','Zero could not open the sign-in return. Sign in using a code instead.')));
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    if(signal?.aborted)throw failure('cancelled','GitHub sign-in was cancelled.');
    port=server.address().port;
    timer=setTimeout(()=>stop(failure('browser-expired','Browser sign-in timed out. Sign in again or use a code.')),timeoutMs);timer.unref?.();
    const start=await brokerRequest(configuration,'start',{port,nonce,codeChallenge},{fetchImpl,signal:controller.signal,allowLoopbackForTests});
    let target;try{target=new URL(start.url);}catch{}
    if(start.clientId!==configuration.clientId||!target||target.origin!==origin||target.pathname!=='/api/desktop/github/login'||target.username||target.password||target.hash||[...target.searchParams.keys()].join(',')!=='ticket'||!/^[A-Za-z0-9_-]{40,4096}$/.test(target.searchParams.get('ticket')||''))
      throw failure('browser-unavailable','Zero could not verify the browser sign-in page. Sign in using a code instead.');
    if(controller.signal.aborted)await received;
    onProgress('Finish signing in on GitHub in your browser.');
    const opened=await Promise.race([Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(target.toString()))),received.then(()=>true)]);
    if(!opened)throw failure('browser-unavailable','The sign-in browser could not be opened. Sign in using a code instead.');
    const callback=await received;
    if(signal?.aborted)throw failure('cancelled','GitHub sign-in was cancelled.');
    const value=await brokerRequest(configuration,'exchange',{...callback,codeVerifier:verifier},{fetchImpl,signal,allowLoopbackForTests});
    return tokenPair(value,now());
  }catch(error){
    if(stoppedError)throw stoppedError;
    if(signal?.aborted||error.code==='cancelled')throw failure('cancelled','GitHub sign-in was cancelled.');
    if(error.code==='browser-expired')throw error;
    throw failure('browser-unavailable','Browser sign-in is unavailable. Sign in using a code instead.');
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();
    server.close();server.closeAllConnections?.();
  }
}
module.exports={browserFlow,refreshBrowserTokens,brokerOrigin};
