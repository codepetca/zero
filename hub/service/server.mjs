import http from 'node:http';
import * as policy from '../checker/policy.mjs';
import {expectedPolicyDigest} from '../checker/image-policy.mjs';
import {createHub} from './hub.mjs';
import {createPostgresStorage} from './postgres-storage.mjs';
import {createRuntimePool,verifyRole,runMain,configurationError} from './runtime.mjs';

// HTTP only. Migration and checking/publication are separate process identities.
export async function startHttpService(env=process.env) {
  if(!env.ZERO_HUB_ORIGIN) throw configurationError('Set ZERO_HUB_ORIGIN');
  const port=Number(env.ZERO_HUB_PORT??8788);
  if(!Number.isSafeInteger(port)||port<1||port>65535) throw configurationError('Invalid hub port');
  const host=env.ZERO_HUB_HOST??'127.0.0.1';
  if(!host || /[\s/@?#]/.test(host)) throw configurationError('Invalid hub bind host');
  if(env.ZERO_HUB_UPLOADS && !['0','1'].includes(env.ZERO_HUB_UPLOADS)) throw configurationError('Uploads requires an explicit 0 or 1');
  const uploadsEnabled=env.ZERO_HUB_UPLOADS==='1';
  // Read-only staging never constructs or passes OAuth credentials/identity.
  const oauth=uploadsEnabled&&(env.ZERO_HUB_GITHUB_CLIENT_ID||env.ZERO_HUB_GITHUB_CLIENT_SECRET)?{clientId:env.ZERO_HUB_GITHUB_CLIENT_ID,clientSecret:env.ZERO_HUB_GITHUB_CLIENT_SECRET}:undefined;
  const pool=createRuntimePool(env.ZERO_HUB_API_DATABASE_URL,'hub_api');
  let server;
  let closed=false;
  async function close() {
    if(closed)return;closed=true;
    if(server) await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();setTimeout(()=>{server.closeAllConnections();resolve();},5000).unref();});
    await pool.end();
  }
  try {
    await verifyRole(pool,'hub_api');
    await pool.query('SELECT digest FROM hub_objects LIMIT 0');
    const checker={...policy,expectedPolicyDigest,checkSubmission:async()=>{throw configurationError('HTTP service cannot execute candidates');}};
    const hub=createHub({pool,storage:createPostgresStorage(pool),checker,origin:env.ZERO_HUB_ORIGIN,oauth,uploadsEnabled});
    server=http.createServer(async(req,res)=>{
      if(['GET','HEAD'].includes(req.method)&&req.url==='/healthz') {
        try {await pool.query('SELECT 1');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true,capabilities:{uploads:uploadsEnabled}}));}
        catch {res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:false}));}
        return;
      }
      await hub.handler(req,res);
    });
    server.requestTimeout=30000;server.headersTimeout=15000;
    await new Promise((resolve,reject)=>server.once('error',reject).listen(port,host,resolve));
    return {server,pool,close};
  } catch(error) {await close();throw error;}
}
if(import.meta.url===`file://${process.argv[1]}`) await runMain(async()=>{
  const service=await startHttpService();
  console.log(`ZeroHub HTTP service listening; uploads ${process.env.ZERO_HUB_UPLOADS==='1'?'enabled':'disabled'}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>service.close().then(()=>process.exit(0)));
});
