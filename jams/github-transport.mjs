import {JamError, fail} from './schema.mjs';

export function credential(token) {
  if (typeof token !== 'string' || !/^[\x21-\x7e]{10,1024}$/.test(token)) fail(503,'Jam GitHub access is unavailable.');
}
export async function githubRequest(route,{token,fetchImpl=fetch,timeoutMs=8000,method='GET',body,maxBytes=3_000_000}={}) {
  credential(token);
  let response;
  try {
    response = await fetchImpl(`https://api.github.com${route}`,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'ZeroJams',Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if (response.redirected || response.url && response.url !== `https://api.github.com${route}`) fail(503,'Jam GitHub access is unavailable.');
    if (!response.ok) { await response.body?.cancel().catch(()=>{}); return {status:response.status,data:null}; }
    if (!/^application\/(?:json|vnd\.github\+json)\b/i.test(response.headers.get('content-type')||'')) fail(503,'Jam GitHub access is unavailable.');
    const declared = response.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared)>maxBytes)) fail(503,'Jam GitHub response exceeded its limit.');
    const reader = response.body?.getReader(); if (!reader) fail(503,'Jam GitHub access is unavailable.');
    let size=0; const chunks=[];
    try { while (true) { const {done,value}=await reader.read(); if(done)break;size+=value.byteLength;if(size>maxBytes)fail(503,'Jam GitHub response exceeded its limit.');chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    return {status:response.status,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  } catch(error) {
    await response?.body?.cancel().catch(()=>{});
    if (error instanceof JamError) throw error;
    fail(503,'Jam GitHub access is unavailable. Retry with the same operation ID.');
  }
}
