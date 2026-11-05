// Explicit local-only composition. This module does not provision a database,
// choose itself from environment, install routes, or activate a deployment.
import path from 'node:path';
import {createPostgresJamStore} from '../../jams/postgres-registry.mjs';
import {createGitHubRepositoryVerifier,createGitHubSourceVerifier} from '../../jams/github-source.mjs';
import {JamError} from '../../jams/service.mjs';
import {createJamPagesRuntimeReader} from './jam-pages-runtime.mjs';
import {selectJamPagesBinding} from './jam-pages-policy.mjs';
import {createLocalJamAuthority} from './jams-local-authority.mjs';

const unavailable=()=>{throw new JamError(503,'The local jam authority is unavailable.');};
const hosted=['VERCEL','VERCEL_ENV','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','K_SERVICE','K_REVISION','FUNCTION_TARGET','FUNCTION_NAME','CF_PAGES','CF_WORKER','NETLIFY','DYNO','RENDER','FLY_APP_NAME','RAILWAY_ENVIRONMENT'];
const keys=['ZERO_JAMS_LOCAL_AUTHORITY','ZERO_JAMS_LOCAL_PG_SOCKET','ZERO_JAMS_LOCAL_PG_PORT','ZERO_JAMS_LOCAL_PG_DATABASE','ZERO_JAMS_LOCAL_PG_USER','ZERO_JAMS_LOCAL_PG_EPOCH'];
function config(env){
  // node-postgres can fall back to ambient PG* variables even when an empty
  // option was supplied. Reject their presence instead of inheriting hidden
  // destinations, credentials, or startup options.
  if(!env||typeof env!=='object'||Array.isArray(env)||env.NODE_ENV!=='development'||process.env.NODE_ENV!==undefined&&process.env.NODE_ENV!=='development'||hosted.some(key=>env[key]!==undefined||process.env[key]!==undefined)||Object.keys(env).some(key=>/^PG[A-Z0-9_]*$/.test(key))||Object.keys(process.env).some(key=>/^PG[A-Z0-9_]*$/.test(key)))unavailable();
  const [mode,socket,port,database,user,epoch]=keys.map(key=>env[key]);
  if(mode!=='postgres'||typeof socket!=='string'||!path.isAbsolute(socket)||path.normalize(socket)!==socket||socket.includes('\0')||Buffer.byteLength(socket)>90||
      typeof port!=='string'||!/^[1-9][0-9]{0,4}$/.test(port)||Number(port)>65535||
      typeof database!=='string'||!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)||
      typeof user!=='string'||!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(user)||typeof epoch!=='string'||!/^[a-f0-9]{24}$/.test(epoch))unavailable();
  return {mode,socket,port,database,user,epoch};
}
const defaultPoolFactory=async options=>{const {Pool}=await import('pg');return new Pool(options);};

/** A trusted server-side caller creates one selector per process. Its mode and
 * destination are immutable for that selector lifetime. The pool is private;
 * each request gets its own verifier closures, never a cached visitor token.
 * Environment checks cannot prove that an unknown hosting provider is local. */
export function createLocalPostgresAuthoritySelector({env=process.env,now=Date.now,fetchImpl=fetch,poolFactory=defaultPoolFactory}={}){
  if(typeof now!=='function'||typeof fetchImpl!=='function'||typeof poolFactory!=='function')unavailable();
  const pinned=config(env),fingerprint=JSON.stringify(pinned);let pending,closed=false,compromised=false,pool;
  const guard=()=>{
    if(closed||compromised)unavailable();
    let current;try{current=config(env);}catch{compromised=true;unavailable();}
    if(JSON.stringify(current)!==fingerprint){compromised=true;unavailable();}
  };
  const checkEpoch=snapshot=>{if(!snapshot||typeof snapshot.revision!=='string'||!/^[a-f0-9]{40}$/.test(snapshot.revision)||!snapshot.revision.startsWith(pinned.epoch)){compromised=true;unavailable();}return snapshot;};
  const guardSnapshot=snapshot=>{
    checkEpoch(snapshot);
    if(typeof snapshot.read!=='function')unavailable();
    return Object.freeze({...snapshot,async read(...args){guard();const result=await snapshot.read(...args);guard();return result;}});
  };
  async function makeStore(){
    guard();
    if(!pending)pending=(async()=>{
      let timer;
      const creation=Promise.resolve().then(()=>{guard();return poolFactory({host:pinned.socket,port:Number(pinned.port),database:pinned.database,user:pinned.user,password:()=>'',ssl:false,options:'-c search_path=public',application_name:'zerojams-local',max:4,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,allowExitOnIdle:true});});
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Pool setup timed out.')),2000);});
      let value;
      try{value=await Promise.race([creation,deadline]);}
      catch(error){void creation.then(late=>late?.end?.(),()=>{}).catch(()=>{});throw error;}
      finally{clearTimeout(timer);}
      if(!value||typeof value.connect!=='function'||typeof value.end!=='function'){
        void Promise.resolve().then(()=>value?.end?.()).catch(()=>{});unavailable();
      }
      pool=value;
      // If shutdown/mode change happened during creation, never expose a pool.
      try{guard();}catch(error){pool=undefined;void Promise.resolve().then(()=>value.end()).catch(()=>{});throw error;}
      const base=createPostgresJamStore({pool:value});
      async function snapshot(options){guard();const result=await base.snapshot(options);guard();return guardSnapshot(result);}
      async function transact(callback,options){
        guard();if(typeof callback!=='function')unavailable();
        const result=await base.transact(async tx=>{
          guard();checkEpoch(await tx.snapshot());guard();
          const isolated=Object.freeze({
            async snapshot(...args){guard();const current=await tx.snapshot(...args);guard();return guardSnapshot(current);},
            async compareAndSwap(id,expected,state,update){
              guard();checkEpoch(await tx.snapshot());guard();
              if(typeof expected!=='string'||!expected.startsWith(pinned.epoch))unavailable();
              const changed=await tx.compareAndSwap(id,expected,state,update);guard();return changed;
            }
          });
          const output=await callback(isolated);guard();return output;
        },options);
        guard();return result;
      }
      return Object.freeze({snapshot,transact,async compareAndSwap(id,expected,state,update={}){return transact(tx=>tx.compareAndSwap(id,expected,state,update),{signal:update.signal});}});
    })();
    const store=await pending;guard();return store;
  }
  return Object.freeze({
    async authorityForRequest(options={}){
      try{
        if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='sourceToken'))unavailable();
        const {sourceToken}=options;
        if(sourceToken!==undefined&&(typeof sourceToken!=='string'||!/^[\x21-\x7e]{10,1024}$/.test(sourceToken)))unavailable();
        guard();const store=await makeStore();await store.snapshot();guard();
        const verifySource=createGitHubSourceVerifier({token:sourceToken,fetchImpl});
        const verifyRepository=createGitHubRepositoryVerifier({token:sourceToken,fetchImpl});
        const pagesBindingReader=selectJamPagesBinding({env,reader:createJamPagesRuntimeReader({env,fetchImpl,now})});
        if(typeof pagesBindingReader!=='function')unavailable();
        const authority=createLocalJamAuthority({env,store,now,verifySource,verifyRepository,pagesBindingReader});
        const service=Object.freeze(Object.fromEntries(Object.entries(authority.service).map(([name,method])=>[name,async(...args)=>{guard();const result=await method(...args);guard();return result;}])));
        const visibilityReader=async(...args)=>{guard();const result=await authority.visibilityReader(...args);guard();return result;};
        return Object.freeze({service,visibilityReader,
          jamOptions:Object.freeze({...authority.jamOptions,service,visibilityReader}),
          hubOptions:Object.freeze({...authority.hubOptions,visibilityReader})});
      }catch{unavailable();}
    },
    async close(){if(closed)return;closed=true;try{if(pending)await pending.catch(()=>{});if(pool)await pool.end();}catch{/* Pool shutdown is best effort. */}}
  });
}
