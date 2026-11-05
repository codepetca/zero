// Test-only adapter. This does not provision a branch or authorize live traffic.
// The caller must inject a transport; there is deliberately no default fetch.
const origin='https://api.github.com';
const root='/repos/codepetca/zero/git/';
const logical='zero-jams-registry';
const sha='[0-9a-f]{40}';

export function capacityTransport({branch,transport,onInvalidRef=()=>{}}={}) {
  // A random 128-bit run suffix prevents accidental reuse of a fixed target.
  if(typeof branch!=='string'||!/^zero-jams-capacity-[0-9a-f]{32}$/.test(branch)||typeof transport!=='function'||typeof onInvalidRef!=='function')throw new Error('Invalid isolated capacity transport configuration.');
  return async function guardedFetch(input,init={}) {
    if(typeof input!=='string'||!input.startsWith(origin+root))throw new Error('Blocked capacity request origin or repository.');
    const path=input.slice((origin+root).length),method=init.method||'GET';
    let target=path,refRequest=false,canonicalBody,expectedSha;
    if(method==='GET'&&path===`ref/heads/${logical}`){target=`ref/heads/${branch}`;refRequest=true;}
    else if(method==='PATCH'&&path===`refs/heads/${logical}`){
      const rawBody=init.body;
      if(typeof rawBody!=='string')throw new Error('Blocked invalid ref update.');
      let body;try{body=JSON.parse(rawBody);}catch{throw new Error('Blocked invalid ref update.');}
      if(!body||Object.keys(body).sort().join(',')!=='force,sha'||body.force!==false||!new RegExp(`^${sha}$`).test(body.sha))throw new Error('Blocked unsafe ref update.');
      canonicalBody=JSON.stringify({sha:body.sha,force:false});
      expectedSha=body.sha;
      target=`refs/heads/${branch}`;refRequest=true;
    } else if(method==='GET'&&new RegExp(`^(trees|commits|blobs)/${sha}$`).test(path)) {
      // Immutable objects only.
    } else if(method==='POST'&&['blobs','trees','commits'].includes(path)) {
      // These create repository objects but cannot move a ref.
    } else throw new Error('Blocked unexpected capacity request.');
    const url=origin+root+target;
    const response=await transport(url,{...init,method,...(canonicalBody===undefined?{}:{body:canonicalBody}),redirect:'error'});
    if(response.redirected||response.url&&response.url!==url)throw new Error('Blocked redirected capacity response.');
    if(!refRequest)return response;
    if(!response.ok)return new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers});
    // The actual store checks the logical ref in the response. Translate only
    // after verifying that GitHub returned the exact isolated target.
    try{
      const reader=response.body?.getReader();
      if(!reader)throw new Error('Missing capacity ref response.');
      const chunks=[];let size=0;
      try{
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw new Error('Oversized capacity ref response.');chunks.push(Buffer.from(value));}
      }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(data?.ref!==`refs/heads/${branch}`||method==='PATCH'&&(data.object?.type!=='commit'||data.object.sha!==expectedSha))throw new Error('Unexpected capacity ref response.');
      data.ref=`refs/heads/${logical}`;
      const headers=new Headers(response.headers);headers.delete('content-length');
      return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
    }catch(error){if(method==='PATCH')onInvalidRef();throw error;}
  };
}
