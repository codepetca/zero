// Bound the whole provider request, including a slow/chunked response body.
// Provider details and credentials never become a browser-facing error.
export async function githubJson(transport,url,options,{maxBytes,timeoutMs=15000}) {
  const failure=()=>Object.assign(new Error('GitHub sign-in failed'),{status:502});
  const controller=new AbortController();
  let reader,timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(failure());},timeoutMs);
  });
  try {
    const response=await Promise.race([transport(url,{...options,redirect:'error',signal:controller.signal}),deadline]);
    if (!(response instanceof Response)) throw failure();
    if (response.body) reader=response.body.getReader();
    if (!response.ok || response.redirected || !reader) throw failure();
    const declared=response.headers.get('content-length');
    if (declared!==null && (!/^[0-9]+$/.test(declared) || Number(declared)>maxBytes)) throw failure();
    const chunks=[];let size=0;
    for (;;) {
      const {done,value}=await Promise.race([reader.read(),deadline]);
      if (done) break;
      size+=value.byteLength;
      if (size>maxBytes) throw failure();
      chunks.push(value);
    }
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
    if (!result || typeof result!=='object' || Array.isArray(result) || Object.hasOwn(result,'error')) throw failure();
    return result;
  } catch {
    controller.abort();
    // Cancellation of an injected stream can itself stall; do not await it.
    if (reader) void reader.cancel().catch(()=>{});
    throw failure();
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}
