'use strict';
// Host-private, builder-partitioned response cache. Reads never fall back to a
// network client. Existing catalog/artifact validators still verify every byte.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES=16*1024*1024,MAX_RESPONSES=256;
const unavailable=message=>Object.assign(new Error('Browser checks unavailable: '+message),{code:'ZERO_COMPATIBILITY_UNAVAILABLE'});
async function ordinary(filename,{optional=false}={}) {
 let current=path.parse(path.resolve(filename)).root;
 for(const part of path.resolve(filename).slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);let stat;
  try{stat=await fs.lstat(current);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  if(stat.isSymbolicLink())throw unavailable('cache paths must not be symbolic links.');
  if(current===path.resolve(filename))return stat;
 }
}
async function read(filename,maximum) {
 try{const stat=await ordinary(filename);if(!stat.isFile()||stat.nlink!==1||stat.size>maximum)throw unavailable('cache entry is linked, special or oversized.');const bytes=await fs.readFile(filename);if(bytes.length>maximum)throw unavailable('cache entry exceeds its limit.');return bytes;}
 catch(error){if(error.code==='ZERO_COMPATIBILITY_UNAVAILABLE')throw error;throw unavailable(error.code==='ENOENT'?'required exact cached library metadata/artifact is missing; choose preparation explicitly.':error.message);}
}
function urlKey(url){const value=new URL(url);if(!['https:','http:'].includes(value.protocol)||value.username||value.password||value.hash||value.search)throw unavailable('invalid cached response URL.');return sha(Buffer.from(value.href));}
function response(bytes){return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});}
async function createCacheOnlyFetcher(cacheRoot){
 const directory=path.join(cacheRoot,'library-responses'),record=JSON.parse((await read(path.join(directory,'index.json'),128*1024)).toString('utf8'));
 if(!record||record.schema!==1||Object.keys(record).sort().join(',')!=='responses,schema'||!Array.isArray(record.responses)||!record.responses.length||record.responses.length>MAX_RESPONSES)throw unavailable('invalid cached response inventory.');
 const byUrl=new Map();let total=0;
 for(const entry of record.responses){if(!entry||Object.keys(entry).sort().join(',')!=='bytes,key,sha256,url'||typeof entry.url!=='string'||entry.key!==urlKey(entry.url)||!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>MAX_BYTES||byUrl.has(entry.url))throw unavailable('invalid or duplicate cached library response.');total+=entry.bytes;if(total>64*1024*1024)throw unavailable('cached library response inventory exceeds its bound.');byUrl.set(entry.url,entry);}
 return {fingerprint:sha(Buffer.from(JSON.stringify(record))),async fetcher(url,{signal}={}){if(signal?.aborted)throw Object.assign(Error('Browser checks cancelled.'),{name:'AbortError'});const entry=byUrl.get(String(url));if(!entry)throw unavailable('the exact selected catalog or artifact URL has not been prepared.');const bytes=await read(path.join(directory,entry.sha256+'.bin'),entry.bytes);if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw unavailable('cached library response differs from its recorded exact bytes.');return response(bytes);}};
}
function createRecordingFetcher(fetcher=fetch){
 const responses=new Map();let total=0;
 return {async fetcher(url,options){const result=await fetcher(url,options);if(!result.ok)return result;const reader=result.body?.getReader();if(!reader)throw unavailable('prepared response has no body.');const chunks=[];let length=0;try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>MAX_BYTES)throw unavailable('prepared response exceeds its byte bound.');chunks.push(Buffer.from(part.value));}}finally{try{await reader.cancel();}finally{reader.releaseLock();}}const bytes=Buffer.concat(chunks);if(bytes.length>MAX_BYTES||responses.size>=MAX_RESPONSES||total+bytes.length>64*1024*1024)throw unavailable('prepared library responses exceed their limit.');urlKey(String(url));const previous=responses.get(String(url));if(previous&&!previous.equals(bytes))throw unavailable('library response changed during preparation.');if(!previous)total+=bytes.length;responses.set(String(url),bytes);return response(bytes);},
 async commit(cacheRoot){if(!responses.size)return null;const directory=path.join(cacheRoot,'library-responses');await ordinary(cacheRoot,{optional:true});await fs.mkdir(directory,{recursive:true});await ordinary(directory);const entries=[];for(const [url,bytes]of responses){const digest=sha(bytes),filename=path.join(directory,digest+'.bin');await ordinary(filename,{optional:true});try{await fs.writeFile(filename,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(sha(await read(filename,MAX_BYTES))!==digest)throw unavailable('existing cached response bytes differ.');}entries.push({url,key:urlKey(url),sha256:digest,bytes:bytes.length});}entries.sort((a,b)=>a.url<b.url?-1:a.url>b.url?1:0);const record={schema:1,responses:entries},filename=path.join(directory,'index.json');await ordinary(filename,{optional:true});const temporary=filename+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temporary,JSON.stringify(record)+'\n',{flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true});}return sha(Buffer.from(JSON.stringify(record)));}}
}
module.exports={createCacheOnlyFetcher,createRecordingFetcher,unavailable,_test:{sha}};
