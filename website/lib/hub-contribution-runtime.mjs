/** Server-only, explicitly enabled Web Request -> Node ZeroHub authoring adapter.
 * Local prerequisite only: public execution acceptance and worker activation are separate.
 * No handler timeout race: await all DB work. Next's 60s lifecycle allows the two
 * sequential 15s OAuth requests, a 5s body deadline, 3s pool acquisition and bounded
 * 1.5s SQL statements (including transaction/role checks). This deliberately
 * tighter SQL budget can reject requests under load; hosted latency is unproven.
 * JSON <=4MiB, previews <=256KiB, Maven <=16MiB (stored object contract).
 * Successful Maven GETs stream verified bytes in <=64KiB chunks because Vercel
 * caps buffered payloads at 4.5MB. Actual hosted streaming proof remains required:
 * https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
 */
import pg from 'pg';
import {Readable} from 'node:stream';
import {createHub} from '../../hub/service/hub.mjs';
import {createPostgresStorage,MAX_OBJECT_BYTES} from '../../hub/service/postgres-storage.mjs';
import {verifyRole} from '../../hub/service/db-role.mjs';
import * as policy from '../../hub/checker/policy.mjs';
import {hubPath} from './hub-proxy.mjs';
import {readOnlyHubResponse, runtimeConfiguration} from './hub-runtime.mjs';

export const INPUT_LIMIT=1024*1024;
export const OUTPUT_LIMIT=4*1024*1024;
export const BODY_TIMEOUT_MS=5000;
export const MAVEN_CHUNK_BYTES=64*1024;
const fail=(status,message)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const unavailable=()=>fail(503,'ZeroHub is unavailable. Try again shortly.');
const disabled=()=>{throw new Error('Checking and publication are unavailable in this HTTP runtime');};
const checker={...policy,checkSubmission:async()=>disabled(),expectedPolicyDigest:disabled};
let runtime;

export function contributionConfiguration(env=process.env) {
  const flag=env.ZERO_HUB_UPLOADS;
  if(flag===undefined||flag==='0')return {enabled:false};
  if(flag!=='1')throw new Error('Invalid uploads capability');
  // Reject known integration administrator aliases and other-role credentials.
  // This does not discover arbitrary renamed secrets; verify hosted configuration separately.
  for(const [name,value] of Object.entries(env)) {
    if(value===undefined||value==='')continue;
    if(['ZERO_HUB_DATABASE_URL','ZERO_HUB_MIGRATION_DATABASE_URL','ZERO_HUB_CHECKER_DATABASE_URL','ZERO_HUB_PUBLISHER_DATABASE_URL','ZERO_HUB_WORKERS_ENABLED','DATABASE_URL','DATABASE_URL_UNPOOLED','NEON_DATABASE_URL'].includes(name)||/^ZERO_HUB_(?:POSTGRES(?:_|$)|PG)/.test(name)||/^(POSTGRES(?:_|$)|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|SSLMODE|OPTIONS)$)/.test(name))
      throw new Error('Only the restricted API database credential is allowed');
  }
  const {connectionString,origin}=runtimeConfiguration(env);
  const clientId=env.ZERO_HUB_GITHUB_CLIENT_ID, clientSecret=env.ZERO_HUB_GITHUB_CLIENT_SECRET;
  if(typeof clientId!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(clientId)||typeof clientSecret!=='string'||!clientSecret.length||clientSecret.length>512||/[\s\x00-\x1f\x7f]/.test(clientSecret))throw new Error('GitHub OAuth credentials required');
  return {enabled:true,connectionString,origin,oauth:{clientId,clientSecret}};
}

export async function createContributionRuntime(pool,{origin,oauth}) {
  await verifyRole(pool,'hub_api');
  return createHub({pool,storage:createPostgresStorage(pool),checker,origin,oauth,uploadsEnabled:true}).handler;
}
async function configuredRuntime(config) {
  if(!runtime) {
    const pool=new pg.Pool({connectionString:config.connectionString,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,options:'-c role=hub_api -c statement_timeout=1500 -c search_path=public,pg_catalog'});
    pool.on('error',()=>{});
    runtime=createContributionRuntime(pool,config).catch(async error=>{runtime=undefined;await pool.end();throw error;});
  }
  return runtime;
}

function canonicalQuery(url,path) {
  if(url.search.length>8192)throw new Error('Invalid query');
  // GitHub includes error_uri on cancellation/error callbacks. It is bounded
  // data only: the controller ignores it, never follows or renders the URI.
  const allowed=path==='auth/callback'?new Set(['code','state','error','error_description','error_uri']):/^libraries\/ui[1-9a-z][0-9a-z]*$/.test(path)?new Set(['version']):new Set();
  const seen=new Set();
  for(const [name,value] of url.searchParams) {
    if(!allowed.has(name)||seen.has(name)||value.length>2048||/[\x00-\x1f\x7f]/.test(value))throw new Error('Invalid query');
    if(name==='code'&&value.length>512)throw new Error('Invalid query');
    if(name==='version'&&!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?$/.test(value))throw new Error('Invalid version');
    seen.add(name);
  }
  return url.searchParams.size?`?${url.searchParams.toString()}`:'';
}
function inputHeaders(request) {
  const headers={accept:'application/json'};
  for(const name of ['origin','x-zero-csrf']) {
    const value=request.headers.get(name);
    if(value!==null) {if(value.length>2048||/[\x00-\x1f\x7f]/.test(value))throw new Error('Invalid header');headers[name]=value;}
  }
  const rawCookie=request.headers.get('cookie')??'';
  if(rawCookie.length>16*1024)throw new Error('Invalid cookie');
  const cookies=[];const seen=new Set();
  for(const item of rawCookie.split(';')) {
    const match=item.trim().match(/^(zero_hub_session|zero_hub_oauth)=([^;]*)$/);
    if(!match)continue;
    if(seen.has(match[1])||match[2].length>512||/[^\x21-\x7e]/.test(match[2]))throw new Error('Invalid cookie');
    seen.add(match[1]);cookies.push(`${match[1]}=${match[2]}`);
  }
  if(cookies.length)headers.cookie=cookies.join('; ');
  return headers;
}

/** Cancellation and a stalled cancel() cannot hold this reader past its deadline. */
export async function contributionBody(request,{timeoutMs=BODY_TIMEOUT_MS}={}) {
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')||request.headers.has('content-encoding'))throw Object.assign(new Error(),{status:415});
  const declared=request.headers.get('content-length');
  if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||!Number.isSafeInteger(Number(declared))))throw Object.assign(new Error(),{status:400});
  if(Number(declared)>INPUT_LIMIT)throw Object.assign(new Error(),{status:413});
  if(request.signal.aborted)throw Object.assign(new Error(),{status:400});
  const reader=request.body?.getReader();
  let timer,onAbort;
  const interrupted=new Promise((_,reject)=>{
    onAbort=()=>reject(Object.assign(new Error(),{status:400}));
    request.signal.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>reject(Object.assign(new Error(),{status:408})),timeoutMs);
  });
  try {
    const chunks=[];let size=0;
    if(reader)for(;;) {
      const {done,value}=await Promise.race([reader.read(),interrupted]);
      if(done)break;
      size+=value.byteLength;
      if(size>INPUT_LIMIT)throw Object.assign(new Error(),{status:413});
      chunks.push(value);
    }
    if(request.signal.aborted)throw Object.assign(new Error(),{status:400});
    if(declared!==null&&Number(declared)!==size)throw Object.assign(new Error(),{status:400});
    const bytes=Buffer.concat(chunks,size);
    try {JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch {throw Object.assign(new Error(),{status:400});}
    return bytes;
  } finally {
    clearTimeout(timer);request.signal.removeEventListener('abort',onAbort);
    if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}
  }
}

function safeCookie(cookie) {
  if(typeof cookie!=='string'||cookie.length>1024||/[\x00-\x1f\x7f]/.test(cookie))return false;
  const [pair,...attributes]=cookie.split(';').map(s=>s.trim());
  if(!/^(zero_hub_session|zero_hub_oauth)=(?:[a-f0-9]{64})?$/.test(pair))return false;
  const values=new Map();
  for(const attribute of attributes) {
    const index=attribute.indexOf('=');const name=(index<0?attribute:attribute.slice(0,index)).toLowerCase();const value=index<0?null:attribute.slice(index+1);
    if(values.has(name)||!['path','httponly','samesite','max-age','secure'].includes(name))return false;
    values.set(name,value);
  }
  return values.get('path')==='/api/hub'&&values.get('samesite')==='Lax'&&values.has('httponly')&&values.get('httponly')===null&&values.has('secure')&&values.get('secure')===null&&/^(0|[1-9][0-9]{0,5})$/.test(values.get('max-age')??'');
}
function safeRedirect(value,path,{origin,oauth}) {
  if(typeof value!=='string'||value.length>4096||/[\x00-\x20\x7f\\]/.test(value))throw new Error('Unsafe redirect');
  const target=new URL(value,origin);
  if(target.username||target.password||target.hash)throw new Error('Unsafe redirect');
  if(target.origin===origin&&['/hub','/hub/prepare'].includes(target.pathname)&&!target.search)return target.pathname;
  if(path==='auth/start'&&target.origin==='https://github.com'&&target.pathname==='/login/oauth/authorize') {
    const names=new Set(['client_id','redirect_uri','state','scope','code_challenge','code_challenge_method']);const seen=new Set();
    for(const [name]of target.searchParams){if(!names.has(name)||seen.has(name))throw new Error('Unsafe redirect');seen.add(name);}
    if(target.searchParams.get('client_id')!==oauth.clientId||!/^([a-f0-9]{64})$/.test(target.searchParams.get('state')??'')||!/^[A-Za-z0-9_-]{43}$/.test(target.searchParams.get('code_challenge')??'')||target.searchParams.get('redirect_uri')!==`${origin}/api/hub/auth/callback`||target.searchParams.get('scope')!=='read:user'||target.searchParams.get('code_challenge_method')!=='S256')throw new Error('Unsafe redirect');
    return target.href;
  }
  throw new Error('Unsafe redirect');
}

/** The service has already verified full stored size/digest before this runs.
 * Copy each small chunk so delivered chunks cannot retain the full stored object.
 * Zero queued chunks: reading controls pulls; completion/cancel drops the source.
 */
function mavenStream(verifiedBytes,signal) {
  let source=verifiedBytes,offset=0,onAbort;
  verifiedBytes=null; // Keep only the releasable source reference in this closure.
  const release=()=>{source=null;signal.removeEventListener('abort',onAbort);};
  return new ReadableStream({
    start(controller){
      onAbort=()=>{release();controller.error(new Error('Hub transfer was cancelled.'));};
      signal.addEventListener('abort',onAbort,{once:true});
      if(signal.aborted)onAbort();
    },
    pull(controller){
      if(!source)return;
      const next=Math.min(offset+MAVEN_CHUNK_BYTES,source.length);
      controller.enqueue(Uint8Array.from(source.subarray(offset,next)));
      offset=next;
      if(offset===source.length){release();controller.close();}
    },
    cancel(){release();}
  },{highWaterMark:0});
}

export async function contributionHubResponse(request,parts,{env=process.env,handler,bodyTimeoutMs=BODY_TIMEOUT_MS}={}) {
  let config;
  try {config=contributionConfiguration(env);}catch{return unavailable();}
  if(!config.enabled)return readOnlyHubResponse(request,parts,{handler});
  const path=hubPath(parts,request.method);
  if(!path||path.length>2048||request.method==='HEAD'&&/^(session|auth\/|submissions\/)/.test(path))return fail(404,'Unknown hub endpoint.');
  let query,headers,body;
  try {
    const url=new URL(request.url);
    if(url.origin!==config.origin)return fail(400,'Invalid hub origin.');
    if(url.pathname!==`/api/hub/${path}`)return fail(400,'Invalid hub path.');
    query=canonicalQuery(url,path);headers=inputHeaders(request);
  }catch{return fail(400,'Invalid hub request.');}
  if(request.signal.aborted)return fail(400,'Hub request was cancelled.');
  if(request.method==='POST')try {
    body=await contributionBody(request,{timeoutMs:bodyTimeoutMs});
    headers['content-type']='application/json';headers['content-length']=String(body.length);
  }catch(error){return fail(error.status??400,error.status===413?'Submission exceeds 1 MiB.':error.status===415?'Send uncompressed application/json.':error.status===408?'Hub request timed out.':'Invalid JSON request.');}
  if(request.signal.aborted)return fail(400,'Hub request was cancelled.');
  try {
    const execute=handler??await configuredRuntime(config);
    if(request.signal.aborted)return fail(400,'Hub request was cancelled.');
    const req=Readable.from(body?[body]:[]);
    req.url=`/api/hub/${path}${query}`;req.method=request.method;req.headers=headers;req.socket={remoteAddress:'127.0.0.1'};
    const outputLimit=path.startsWith('maven/')?MAX_OBJECT_BYTES:path.startsWith('previews/')?256*1024:OUTPUT_LIMIT;
    const values=new Map();let status=200,bytes=null,ended=false,failed=false;
    const res={headersSent:false,
      getHeader(name){return values.get(name.toLowerCase());},
      setHeader(name,value){if(this.headersSent)throw new Error('Headers sent');values.set(name.toLowerCase(),Array.isArray(value)?value.map(String):String(value));return this;},
      writeHead(code,fields={}){if(this.headersSent)throw new Error('Headers sent');status=code;for(const[name,value]of Object.entries(fields))this.setHeader(name,value);this.headersSent=true;return this;},
      end(value){if(ended)throw new Error('Response completed');if(value!==undefined&&value!==null){if(Buffer.byteLength(value)>outputLimit)throw new Error('Response too large');bytes=Buffer.from(value);}ended=true;},
      destroy(){failed=true;}
    };
    await execute(req,res);
    if(!ended||failed||!Number.isInteger(status)||status<200||status>599)return unavailable();
    const output=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const artifact=/^(maven|previews)\//.test(path);
    const cookies=values.get('set-cookie');
    if(!artifact&&cookies!==undefined) {
      const list=Array.isArray(cookies)?cookies:[cookies];
      if(list.length>2)return unavailable();
      const names=new Set();
      for(const cookie of list){const name=cookie.split('=')[0];if(!safeCookie(cookie)||names.has(name))return unavailable();names.add(name);output.append('Set-Cookie',cookie);}
    }
    if(status>=300&&status<400){output.set('Location',safeRedirect(values.get('location'),path,config));return new Response(null,{status,headers:output});}
    if(values.has('location'))return unavailable();
    if(status>=400&&bytes&&bytes.length>OUTPUT_LIMIT)return unavailable();
    const type=values.get('content-type');
    if(typeof type!=='string'||!(path.startsWith('previews/')&&status<300&&type==='image/png'||/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||artifact&&status<300&&/^(application\/(java-archive|octet-stream|xml)|text\/(plain|xml))(?:;\s*charset=utf-8)?$/i.test(type)))return unavailable();
    if(path.startsWith('previews/')&&status<300&&(type!=='image/png'||bytes&&request.method!=='HEAD'&&(bytes.length<8||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))))return unavailable();
    output.set('Content-Type',type);
    const length=values.get('content-length');
    if(length!==undefined){if(typeof length!=='string'||!/^\d+$/.test(length)||Number(length)>outputLimit||request.method!=='HEAD'&&Number(length)!==(bytes?.length??0))return unavailable();output.set('Content-Length',length);}
    if(artifact&&status<300&&values.get('cache-control')==='public, max-age=31536000, immutable')output.set('Cache-Control','public, max-age=31536000, immutable');
    if(request.method==='GET'&&path.startsWith('maven/')&&status<300&&![204,205].includes(status)) {
      if(!bytes?.length)return unavailable();
      const verifiedBytes=bytes;bytes=null;
      output.set('Content-Length',String(verifiedBytes.length));
      return new Response(mavenStream(verifiedBytes,request.signal),{status,headers:output});
    }
    return new Response(request.method==='HEAD'||[204,205,304].includes(status)?null:bytes,{status,headers:output});
  }catch{return unavailable();}
}
