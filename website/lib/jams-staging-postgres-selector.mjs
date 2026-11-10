// Local-process access to an independently provisioned, dedicated staging DB.
// This module never selects itself, provisions schema, or enables hosted routes.
import {X509Certificate} from 'node:crypto';
import {checkServerIdentity} from 'node:tls';
import {createPostgresJamStore} from '../../jams/postgres-registry.mjs';
import {createGitHubRepositoryVerifier,createGitHubSourceVerifier} from '../../jams/github-source.mjs';
import {JamError} from '../../jams/service.mjs';
import {createJamPagesRuntimeReader} from './jam-pages-runtime.mjs';
import {selectJamPagesBinding} from './jam-pages-policy.mjs';
import {createLocalJamAuthority} from './jams-local-authority.mjs';

const unavailable=()=>{throw new JamError(503,'The staging jam authority is unavailable.');};
const hosted=['VERCEL','VERCEL_ENV','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','K_SERVICE','K_REVISION','FUNCTION_TARGET','FUNCTION_NAME','CF_PAGES','CF_WORKER','NETLIFY','DYNO','RENDER','FLY_APP_NAME','RAILWAY_ENVIRONMENT'];
const keys=['ZERO_JAMS_STAGING_AUTHORITY','ZERO_JAMS_STAGING_PROJECT_REF','ZERO_JAMS_STAGING_PG_HOST','ZERO_JAMS_STAGING_PG_PORT','ZERO_JAMS_STAGING_PG_DATABASE','ZERO_JAMS_STAGING_PG_ROLE','ZERO_JAMS_STAGING_PG_EPOCH','ZERO_JAMS_STAGING_PG_CA_PEM','ZERO_JAMS_STAGING_PG_URI'];
const forbidden=env=>Object.keys(env).some(key=>/^PG[A-Z0-9_]*$/.test(key)||/^ZERO_JAMS_LOCAL_/.test(key)||/^NEXT_PUBLIC_ZERO_JAMS_STAGING_/.test(key));
function config(env){
  if(!env||typeof env!=='object'||Array.isArray(env)||env.NODE_ENV!=='development'||process.env.NODE_ENV!==undefined&&process.env.NODE_ENV!=='development'||
    hosted.some(key=>env[key]!==undefined||process.env[key]!==undefined)||forbidden(env)||forbidden(process.env)||env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')unavailable();
  const [mode,projectRef,host,port,database,role,epoch,ca,uri]=keys.map(key=>env[key]);
  // Supabase's project-ref OpenAPI schema is exactly 20 lowercase letters.
  // The exact shared-pooler hostname must come from the approved Connect dialog.
  if(mode!=='supabase-postgres'||typeof projectRef!=='string'||!/^[a-z]{20}$/.test(projectRef)||
    typeof host!=='string'||host.length>253||!/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(host)||
    port!=='5432'||database!=='postgres'||typeof role!=='string'||!/^zerojams_staging_[a-z0-9_]{1,30}$/.test(role)||
    typeof epoch!=='string'||!/^[a-f0-9]{24}$/.test(epoch)||typeof ca!=='string'||ca.length>32768||
    !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\r?\n?$/.test(ca)||
    typeof uri!=='string'||uri.length>4096||!/^postgres(?:ql)?:\/\/[\x21-\x7e]+$/.test(uri)||/[?#\\]/.test(uri))unavailable();
  try{if(!new X509Certificate(ca).ca)unavailable();}catch{unavailable();}
  let parsed,password;
  try{parsed=new URL(uri);password=decodeURIComponent(parsed.password);}catch{unavailable();}
  const user=`${role}.${projectRef}`;
  // Inspect the raw authority as well: URL canonicalization must not hide an
  // alternate spelling, extra @, omitted port, encoded host, or path traversal.
  const raw=uri.slice(uri.indexOf('://')+3),at=raw.indexOf('@');
  if(at<0||at!==raw.lastIndexOf('@')||raw.slice(at+1)!==`${host}:${port}/${database}`||
    parsed.username!==user||parsed.hostname!==host||parsed.port!==port||parsed.pathname!==`/${database}`||parsed.search||parsed.hash||
    typeof password!=='string'||password.length<16||password.length>1024||/[\x00-\x20\x7f]/.test(password))unavailable();
  return {mode,projectRef,host,port,database,role,epoch,ca,uri,user,password};
}
const defaultPoolFactory=async options=>{const {Pool}=await import('pg');return new Pool(options);};
// Inspect only this runtime role and this fixed staging relation. Configuration
// cannot turn a project-owner credential into a restricted runtime credential.
const identitySql=`SELECT pg_catalog.current_database() AS database,current_user AS role,
  (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls) AS elevated,
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles other WHERE other.oid OPERATOR(pg_catalog.<>) r.oid AND pg_catalog.pg_has_role(r.oid,other.oid,'MEMBER')) AS membership,
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles other WHERE NOT other.rolsuper AND other.oid OPERATOR(pg_catalog.<>) r.oid AND
    (pg_catalog.pg_has_role(other.oid,r.oid,'MEMBER') OR (other.oid OPERATOR(pg_catalog.<>) c.relowner AND pg_catalog.pg_has_role(other.oid,c.relowner,'MEMBER')))) AS delegated_access,
  c.relkind AS relation_kind,c.relrowsecurity AS row_security,c.relforcerowsecurity AS force_row_security,
  pg_catalog.pg_get_userbyid(c.relowner) AS table_owner,pg_catalog.pg_get_userbyid(n.nspowner) AS schema_owner,
  pg_catalog.has_schema_privilege(current_user,n.oid,'CREATE') AS schema_create,
  pg_catalog.pg_has_role(current_user,c.relowner,'MEMBER') AS owner_member,
  pg_catalog.has_table_privilege(current_user,c.oid,'SELECT') AS readable,
  pg_catalog.has_column_privilege(current_user,c.oid,'generation','UPDATE') AS generation_write,
  pg_catalog.has_column_privilege(current_user,c.oid,'document','UPDATE') AS document_write,
  pg_catalog.has_column_privilege(current_user,c.oid,'epoch','UPDATE') AS epoch_write,
  pg_catalog.has_column_privilege(current_user,c.oid,'singleton','UPDATE') AS singleton_write,
  pg_catalog.has_table_privilege(current_user,c.oid,'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS extra_write,
  (EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) acl WHERE acl.grantee OPERATOR(pg_catalog.=) 0)
    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE acl.grantee OPERATOR(pg_catalog.=) 0)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl WHERE a.attrelid OPERATOR(pg_catalog.=) c.oid AND acl.grantee OPERATOR(pg_catalog.=) 0)) AS public_access,
  (EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) acl WHERE acl.grantee OPERATOR(pg_catalog.<>) r.oid AND acl.grantee OPERATOR(pg_catalog.<>) n.nspowner)
    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE acl.grantee OPERATOR(pg_catalog.<>) r.oid AND acl.grantee OPERATOR(pg_catalog.<>) c.relowner)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl WHERE a.attrelid OPERATOR(pg_catalog.=) c.oid AND acl.grantee OPERATOR(pg_catalog.<>) r.oid AND acl.grantee OPERATOR(pg_catalog.<>) c.relowner)) AS unexpected_access,
  (SELECT pg_catalog.count(*) OPERATOR(pg_catalog.=) 3 FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY(ARRAY['anon','authenticated','service_role']::pg_catalog.name[])) AS api_roles_present,
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY(ARRAY['anon','authenticated','service_role']::pg_catalog.name[]) AND
    (a.rolsuper OR pg_catalog.pg_has_role(a.oid,r.oid,'MEMBER') OR pg_catalog.pg_has_role(a.oid,c.relowner,'MEMBER') OR pg_catalog.pg_has_role(a.oid,n.nspowner,'MEMBER')
      OR pg_catalog.has_schema_privilege(a.oid,n.oid,'USAGE,CREATE')
      OR pg_catalog.has_table_privilege(a.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR pg_catalog.has_any_column_privilege(a.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS api_access
  FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_class c ON c.oid OPERATOR(pg_catalog.=) 'zerojams_staging_private.registry'::pg_catalog.regclass
    JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) c.relnamespace WHERE r.rolname OPERATOR(pg_catalog.=) current_user`;

/** Explicit trusted server-side factory; not registered with any default route.
 * The URI, password and CA stay in private closures, never fingerprints/errors.
 * Flag checks are admission checks, not a fence for already-dispatched COMMIT.
 * Operators must independently review/pin a dedicated staging project distinct
 * from production: self-consistent env/CA/epoch cannot prove that designation.
 * A DB restore/reset needs a fresh epoch; an identically cloned epoch cannot be
 * distinguished from its source by this application-level identity check. */
export function createStagingPostgresAuthoritySelector({env=process.env,now=Date.now,fetchImpl=fetch,poolFactory=defaultPoolFactory}={}){
  if(typeof now!=='function'||typeof fetchImpl!=='function'||typeof poolFactory!=='function')unavailable();
  let pinned;try{pinned=config(env);}catch{unavailable();}
  let pending,pool,closed=false,compromised=false;
  const guard=()=>{
    if(closed||compromised)unavailable();
    let current;try{current=config(env);}catch{compromised=true;unavailable();}
    // Direct comparison only. Never serialize secret values into a fingerprint.
    if(Object.keys(pinned).some(key=>current[key]!==pinned[key])){compromised=true;unavailable();}
  };
  const checkEpoch=snapshot=>{if(!snapshot||typeof snapshot.revision!=='string'||!/^[a-f0-9]{40}$/.test(snapshot.revision)||!snapshot.revision.startsWith(pinned.epoch)){compromised=true;unavailable();}return snapshot;};
  const guardSnapshot=snapshot=>{
    checkEpoch(snapshot);if(typeof snapshot.read!=='function')unavailable();
    return Object.freeze({...snapshot,async read(...args){guard();const result=await snapshot.read(...args);guard();return result;}});
  };
  // Existing handler injection can read these fields normally, but returned
  // options neither retain the original env object nor serialize credentials.
  // App signing material and ALL staging connection settings are omitted.
  const facade={};
  for(const key of ['NODE_ENV','ZERO_JAMS_ENABLED','ZERO_JAMS_PRO_GITHUB_IDS','ZERO_JAMS_ADDITIONAL_PRO_GITHUB_IDS','ZERO_HUB_ORIGIN','ZERO_HUB_GITHUB_CLIENT_ID','ZERO_HUB_GITHUB_CLIENT_SECRET','ZERO_HUB_GITHUB_SESSION_SECRET','ZERO_SHARING_CATALOG_URL','ZERO_SHARING_REGISTRY_URL','ZERO_SHARING_ARTIFACT_ORIGIN']){
    Object.defineProperty(facade,key,{get(){guard();return env[key];},enumerable:false});
  }
  Object.freeze(facade);
  async function checkIdentity(){
    let client,released=false,stopped=false,timer;const expires=performance.now()+2000;
    const release=destroy=>{if(client&&!released){released=true;client.release(destroy);}};
    const check=()=>{guard();if(stopped||performance.now()>=expires)unavailable();};
    const work=Promise.resolve().then(()=>{check();return pool.connect();}).then(async value=>{
      client=value;if(stopped){release(true);unavailable();}
      check();return client.query(identitySql);
    });
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;try{release(true);}catch{}reject(new Error('Staging identity timed out.'));},2000);});
    try{
      const result=await Promise.race([work,deadline]);check();
      const rows=result?.rows,row=rows?.[0];
      if(rows?.length!==1||row.database!==pinned.database||row.role!==pinned.role||
        row.relation_kind!=='r'||row.table_owner!=='zerojams_staging_owner'||row.schema_owner!=='zerojams_staging_owner'||
        ['elevated','membership','delegated_access','schema_create','owner_member','epoch_write','singleton_write','extra_write','public_access','unexpected_access','api_access'].some(key=>row[key]!==false)||
        ['readable','generation_write','document_write','row_security','force_row_security','api_roles_present'].some(key=>row[key]!==true)){compromised=true;unavailable();}
      check();release(false);check();
    }catch{stopped=true;try{release(true);}catch{}unavailable();}
    finally{clearTimeout(timer);}
  }
  async function makeStore(){
    guard();
    if(!pending)pending=(async()=>{
      let timer;const expires=performance.now()+2000;
      const creation=Promise.resolve().then(()=>{guard();if(performance.now()>=expires)unavailable();return poolFactory({host:pinned.host,port:Number(pinned.port),database:pinned.database,user:pinned.user,password:()=>pinned.password,
        ssl:{ca:pinned.ca,rejectUnauthorized:true,servername:pinned.host,checkServerIdentity,minVersion:'TLSv1.2'},application_name:'zerojams-staging-local',
        max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,allowExitOnIdle:true,query_timeout:5000});});
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Staging pool setup timed out.')),2000);});
      let value;
      try{value=await Promise.race([creation,deadline]);if(performance.now()>=expires)unavailable();}
      catch{void creation.then(late=>late?.end?.(),()=>{}).catch(()=>{});unavailable();}
      finally{clearTimeout(timer);}
      if(!value||typeof value.connect!=='function'||typeof value.end!=='function'){
        void Promise.resolve().then(()=>value?.end?.()).catch(()=>{});unavailable();
      }
      // pg emits idle-client network failures on its Pool. Handle the event
      // without printing driver errors/credentials or crashing the local app;
      // active calls still fail through their normal, uncertain-outcome path.
      if(typeof value.on==='function')value.on('error',()=>{});
      pool=value;
      try{guard();}catch{pool=undefined;void Promise.resolve().then(()=>value.end()).catch(()=>{});unavailable();}
      const base=createPostgresJamStore({pool:value,target:'staging'});
      async function snapshot(options){guard();const result=await base.snapshot(options);guard();return guardSnapshot(result);}
      async function transact(callback,options){
        guard();if(typeof callback!=='function')unavailable();
        const result=await base.transact(async tx=>{
          guard();checkEpoch(await tx.snapshot());guard();
          const isolated=Object.freeze({
            async snapshot(...args){guard();const current=await tx.snapshot(...args);guard();return guardSnapshot(current);},
            async compareAndSwap(id,expected,state,update){
              guard();checkEpoch(await tx.snapshot());guard();if(typeof expected!=='string'||!expected.startsWith(pinned.epoch))unavailable();
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
        const {sourceToken}=options;if(sourceToken!==undefined&&(typeof sourceToken!=='string'||!/^[\x21-\x7e]{10,1024}$/.test(sourceToken)))unavailable();
        guard();const store=await makeStore();await checkIdentity();await store.snapshot();guard();
        const authority=createLocalJamAuthority({env:facade,store,now,
          verifySource:createGitHubSourceVerifier({token:sourceToken,fetchImpl}),verifyRepository:createGitHubRepositoryVerifier({token:sourceToken,fetchImpl}),
          pagesBindingReader:selectJamPagesBinding({env,reader:createJamPagesRuntimeReader({env,fetchImpl,now})})});
        const service=Object.freeze(Object.fromEntries(Object.entries(authority.service).map(([name,method])=>[name,async(...args)=>{
          try{guard();const result=await method(...args);guard();return result;}
          catch(error){if(error instanceof JamError&&error.status<500)throw error;unavailable();}
        }])));
        const visibilityReader=async(...args)=>{try{guard();const result=await authority.visibilityReader(...args);guard();return result;}catch{unavailable();}};
        return Object.freeze({service,visibilityReader,jamOptions:Object.freeze({...authority.jamOptions,service,visibilityReader}),hubOptions:Object.freeze({...authority.hubOptions,visibilityReader})});
      }catch{unavailable();}
    },
    async close(){if(closed)return;closed=true;try{if(pending)await pending.catch(()=>{});if(pool)await pool.end();}catch{/* Best effort physical shutdown only. */}}
  });
}
