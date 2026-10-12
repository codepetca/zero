/** Server-only read-only catalog runtime for Vercel-managed PostgreSQL. */
import pg from 'pg';
import {canonicalHubQuery} from '../../hub/service/catalog.mjs';
import {Readable} from 'node:stream';
import {createHub} from '../../hub/service/hub.mjs';
import {createPostgresStorage,MAX_OBJECT_BYTES} from '../../hub/service/postgres-storage.mjs';
import {verifyRole} from '../../hub/service/db-role.mjs';
import * as policy from '../../hub/checker/policy.mjs';
import {hubPath} from './hub-proxy.mjs';
import {mavenStream} from './hub-stream.mjs';
const JSON_LIMIT=4*1024*1024;
const unavailable=()=>Response.json({error:'ZeroHub is unavailable. Try again shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});
// This process can read published bytes; it cannot run a checker or publisher.
const disabled=()=>{throw new Error('Checking and publication are unavailable in this HTTP runtime');};
const checker={...policy,checkSubmission:async()=>disabled(),expectedPolicyDigest:disabled};
let runtime;
export async function createReadOnlyRuntime(pool,origin) {
  await verifyRole(pool,'hub_api');
  return createHub({pool,storage:createPostgresStorage(pool),checker,origin,uploadsEnabled:false}).handler;
}
export function runtimeConfiguration(env=process.env) {
  const connectionString=env.ZERO_HUB_API_DATABASE_URL;
  const origin=env.ZERO_HUB_ORIGIN;
  if(!connectionString || !origin)throw new Error('Restricted runtime database and exact public origin required');
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.searchParams.has('options'))throw new Error('Invalid runtime database configuration');
  if(url.hostname.split('.')[0].endsWith('-pooler'))throw new Error('Use a direct database URL with runtime role startup settings');
  const publicOrigin=new URL(origin);
  if(publicOrigin.origin!==origin||publicOrigin.protocol!=='https:')throw new Error('HTTPS public origin required');
  return {connectionString,origin};
}
async function configuredRuntime() {
  if(!runtime) {
    const {connectionString,origin}=runtimeConfiguration();
    const pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,options:'-c role=hub_api -c statement_timeout=15000 -c search_path=public,pg_catalog'});
    pool.on('error',()=>{}); // Return a sanitized HTTP failure, never credentials.
    runtime=createReadOnlyRuntime(pool,origin).catch(async error=>{runtime=undefined;await pool.end();throw error;});
  }
  return runtime;
}
export async function readOnlyHubResponse(request,parts,{handler}={}) {
  const path=hubPath(parts,request.method);
  if(!path)return Response.json({error:'Unknown hub endpoint.'},{status:404});
  const url=new URL(request.url);
  // Authoring is closed even if a browser calls the endpoint directly.
  if(path.startsWith('auth/')||path.startsWith('submissions/')||['libraries','submissions','logout'].includes(path))
    return Response.json({error:'Library uploads are not open yet.'},{status:503,headers:{'Cache-Control':'no-store'}});
  let query;
  try {query=canonicalHubQuery(url,path);}catch{return Response.json({error:'Unexpected hub query.'},{status:400});}
  try {
    const execute=handler??await configuredRuntime();
    const req=Readable.from([]);
    req.url=`/api/hub/${path}${query}`;req.method=request.method;req.headers={};req.socket={remoteAddress:'127.0.0.1'};
    // Turning uploads off must preserve access to valid immutable stored objects.
    const outputLimit=path.startsWith('maven/')?MAX_OBJECT_BYTES:path.startsWith('previews/')?256*1024:JSON_LIMIT;
    const headers=new Headers();let status=200,bytes,ended=false,failed=false;
    const res={headersSent:false,
      setHeader(name,value){if(Array.isArray(value))for(const item of value)headers.append(name,String(item));else headers.set(name,String(value));},
      writeHead(code,values={}){status=code;for(const[name,value]of Object.entries(values))this.setHeader(name,value);this.headersSent=true;return this;},
      end(value){if(ended)throw new Error('Response already completed');if(value!==undefined&&value!==null){if(Buffer.byteLength(value)>outputLimit)throw new Error('Hub response exceeds its size limit');bytes=Buffer.from(value);}else bytes=null;ended=true;},
      destroy(){failed=true;}
    };
    await execute(req,res);
    if(!ended||failed)return unavailable();
    headers.delete('set-cookie'); // No browser session can be issued by this runtime.
    const responseLimit=status>=400||/^application\/json\b/i.test(headers.get('content-type')??'')?Math.min(outputLimit,JSON_LIMIT):outputLimit;
    if(bytes&&bytes.length>responseLimit)return unavailable();
    const length=headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>responseLimit||request.method!=='HEAD'&&Number(length)!==(bytes?.length??0)))return unavailable();
    if(request.method==='GET'&&path.startsWith('maven/')&&status>=200&&status<300&&![204,205].includes(status)) {
      if(!bytes?.length)return unavailable();
      const verifiedBytes=bytes;bytes=null;
      headers.set('Content-Length',String(verifiedBytes.length));
      return new Response(mavenStream(verifiedBytes,request.signal),{status,headers});
    }
    return new Response(request.method==='HEAD'?null:bytes,{status,headers});
  } catch {return unavailable();}
}
