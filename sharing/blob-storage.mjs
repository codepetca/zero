import { safeObjectPath, byteHash } from './file-storage.mjs';
import { randomUUID } from 'node:crypto';

export const BLOB_SDK_VERSION = '2.8.1';
const missing = () => Object.assign(new Error('Blob object missing'),{code:'ENOENT'});
function validateOrigin(origin) {
  const url=new URL(origin);
  if (url.origin!==origin || url.protocol!=='https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) || url.username || url.password) throw new Error('Use the configured public Blob store origin');
  return origin;
}
async function readStream(stream, maximum) {
  const reader=stream.getReader(),chunks=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maximum)throw new Error('Blob object exceeds limits');chunks.push(Buffer.from(chunk.value));}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(chunks);
}

/** Explicit SDK credentials and configured origin only. SDK 2.8.1 public get
 * ignores useCache:false. Origin API metadata plus nonce public GET must agree;
 * stale delivery fails closed instead of accepting cached metadata as bytes. */
export class BlobStorage {
  constructor({sdk,token,artifactOrigin,fetcher=fetch,maxBytes=104857600,timeoutMs=30000}) {
    if (!sdk?.put || !sdk?.head || !sdk?.del || !token || typeof token!=='string' || /[\r\n]/.test(token)) throw new Error('Explicit Blob SDK and publisher credential required');
    if(['VERCEL_BLOB_API_URL','NEXT_PUBLIC_VERCEL_BLOB_API_URL','VERCEL_BLOB_API_VERSION_OVERRIDE','NEXT_PUBLIC_VERCEL_BLOB_API_VERSION_OVERRIDE'].some(key=>process.env[key]))throw new Error('Blob API overrides are not supported by this publisher');
    this.sdk=sdk;this.token=token;this.origin=validateOrigin(artifactOrigin);this.maxBytes=maxBytes;this.timeoutMs=timeoutMs;this.fetcher=fetcher;
  }
  options(extra={}) { return {access:'public',token:this.token,abortSignal:AbortSignal.timeout(this.timeoutMs),...extra}; }
  url(key) { return this.origin+'/'+safeObjectPath(key); }
  async readObject(key) {
    let metadata;
    try{metadata=await this.sdk.head(this.url(key),this.options());}catch(error){if(this.sdk.BlobNotFoundError && error instanceof this.sdk.BlobNotFoundError)throw missing();throw new Error('Blob read unavailable');}
    if(metadata?.url!==this.url(key)||metadata.pathname!==key||typeof metadata.etag!=='string'||!Number.isSafeInteger(metadata.size)||metadata.size<1||metadata.size>this.maxBytes)throw new Error('Blob read metadata invalid');
    let response;
    try{response=await this.fetcher(this.url(key)+'?zero_verify='+randomUUID(),{method:'GET',headers:{'cache-control':'no-cache, no-store'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});}catch{throw new Error('Blob public delivery unavailable');}
    if(!response.ok||!response.body||response.headers.get('etag')!==metadata.etag)throw new Error('Blob public delivery is stale or unavailable');
    const bytes=await readStream(response.body,this.maxBytes);
    if(bytes.length!==metadata.size)throw new Error('Blob returned incomplete bytes');
    return {bytes,etag:metadata.etag};
  }
  async get(key) { return (await this.readObject(key)).bytes; }
  async verify(key,expected) {
    const bytes=await this.get(key);
    if(bytes.length!==expected.size || byteHash(bytes)!==expected.sha256)throw new Error('Blob integrity verification failed');
    return bytes;
  }
  async putImmutable(key,input) {
    const bytes=Buffer.from(input);this.url(key);
    if(!bytes.length||bytes.length>this.maxBytes)throw new Error('Blob artifact exceeds limits');
    const result={path:key,size:bytes.length,sha256:byteHash(bytes)};
    try{await this.verify(key,result);return result;}catch(error){if(error.code!=='ENOENT')throw error;}
    try{
      const uploaded=await this.sdk.put(key,bytes,this.options({allowOverwrite:false,addRandomSuffix:false,cacheControlMaxAge:31536000}));
      if(uploaded.url!==this.url(key)||uploaded.pathname!==key)throw new Error('unexpected destination');
    }catch{
      // A timed-out upload or competing identical write may have completed.
      // Only actual verified bytes can turn that uncertainty into success.
      try{await this.verify(key,result);return result;}catch{throw new Error('Blob immutable upload unavailable');}
    }
    await this.verify(key,result);
    return result;
  }
  async removeVerified(key,expected) {
    if(!key.startsWith('staging/'))throw new Error('Only verified temporary staging objects may be removed');
    let current;try{current=await this.readObject(key);}catch(error){if(error.code==='ENOENT')return;throw error;}
    if(current.bytes.length!==expected.size||byteHash(current.bytes)!==expected.sha256)throw new Error('Staged Blob integrity verification failed');
    try{await this.sdk.del(this.url(key),this.options({ifMatch:current.etag}));}catch{throw new Error('Blob staging cleanup unavailable');}
  }
}
