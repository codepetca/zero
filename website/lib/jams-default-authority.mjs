// One process-local selection feeds both default Jam and Hub entry points.
// Selector construction is lazy to avoid a module cycle through the explicit
// local composition; neither module import nor an inactive production route
// opens a database. Visitor tokens never enter these cached selection records.
import {JamError} from '../../jams/service.mjs';

const localFields=['ZERO_JAMS_LOCAL_AUTHORITY','ZERO_JAMS_LOCAL_PG_SOCKET','ZERO_JAMS_LOCAL_PG_PORT','ZERO_JAMS_LOCAL_PG_DATABASE','ZERO_JAMS_LOCAL_PG_USER','ZERO_JAMS_LOCAL_PG_EPOCH'];
const stagingFields=['ZERO_JAMS_STAGING_AUTHORITY','ZERO_JAMS_STAGING_PROJECT_REF','ZERO_JAMS_STAGING_PG_HOST','ZERO_JAMS_STAGING_PG_PORT','ZERO_JAMS_STAGING_PG_DATABASE','ZERO_JAMS_STAGING_PG_ROLE','ZERO_JAMS_STAGING_PG_EPOCH','ZERO_JAMS_STAGING_PG_CA_PEM','ZERO_JAMS_STAGING_PG_URI'];
const productionFields=['ZERO_JAMS_PRODUCTION_AUTHORITY','ZERO_JAMS_PRODUCTION_PROJECT_REF','ZERO_JAMS_PRODUCTION_PG_HOST','ZERO_JAMS_PRODUCTION_PG_PORT','ZERO_JAMS_PRODUCTION_PG_DATABASE','ZERO_JAMS_PRODUCTION_PG_ROLE','ZERO_JAMS_PRODUCTION_PG_EPOCH','ZERO_JAMS_PRODUCTION_PG_CA_PEM','ZERO_JAMS_PRODUCTION_PG_URI','ZERO_JAMS_PRODUCTION_CREATOR_OID','ZERO_JAMS_PRODUCTION_ADMIN_OID'];
const fields=[...localFields,...stagingFields,...productionFields];
const identityFields={projectRef:'ZERO_JAMS_STAGING_PROJECT_REF',host:'ZERO_JAMS_STAGING_PG_HOST',port:'ZERO_JAMS_STAGING_PG_PORT',database:'ZERO_JAMS_STAGING_PG_DATABASE',role:'ZERO_JAMS_STAGING_PG_ROLE',epoch:'ZERO_JAMS_STAGING_PG_EPOCH'};
const hosted=['VERCEL','VERCEL_ENV','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','K_SERVICE','K_REVISION','FUNCTION_TARGET','FUNCTION_NAME','CF_PAGES','CF_WORKER','NETLIFY','DYNO','RENDER','FLY_APP_NAME','RAILWAY_ENVIRONMENT'];
const unavailable=()=>{throw new JamError(503,'The local jam authority is unavailable.');};
const present=(env,prefix)=>fields.some(key=>key.startsWith(prefix)&&env[key]!==undefined)||Object.keys(env).some(key=>key.startsWith(prefix)&&env[key]!==undefined);
const local=env=>env.NODE_ENV==='development'&&(process.env.NODE_ENV===undefined||process.env.NODE_ENV==='development')&&hosted.every(key=>env[key]===undefined&&process.env[key]===undefined);
const defaultFactory=async options=>{
  const {createLocalPostgresAuthoritySelector}=await import('./jams-local-postgres-selector.mjs');
  return createLocalPostgresAuthoritySelector(options);
};
const defaultStagingFactory=async options=>{
  const {createStagingPostgresAuthoritySelector}=await import('./jams-staging-postgres-selector.mjs');
  return createStagingPostgresAuthoritySelector(options);
};

const defaultProductionFactory=async options=>{
  const {createProductionPostgresAuthoritySelector}=await import('./jams-neon-postgres-selector.mjs');
  return createProductionPostgresAuthoritySelector(options);
};

/** Staging is denied by default. Only a separately reviewed static identity or
 * explicit owner-approved trusted bootstrap may supply reviewedStagingIdentity;
 * environment self-attestation cannot approve a project. This process-local
 * admission gate does not retire other writers or fence a dispatched COMMIT. */
export function createDefaultJamAuthorityManager({selectorFactory=defaultFactory,stagingSelectorFactory=defaultStagingFactory,productionSelectorFactory=defaultProductionFactory,reviewedStagingIdentity,now=Date.now,fetchImpl=fetch}={}) {
  if(typeof selectorFactory!=='function'||typeof stagingSelectorFactory!=='function'||typeof productionSelectorFactory!=='function'||typeof now!=='function'||typeof fetchImpl!=='function')unavailable();
  let reviewed;
  if(reviewedStagingIdentity!==undefined){
    try{
      if(!reviewedStagingIdentity||typeof reviewedStagingIdentity!=='object'||Array.isArray(reviewedStagingIdentity)||Object.keys(reviewedStagingIdentity).sort().join(',')!==Object.keys(identityFields).sort().join(','))unavailable();
      reviewed=Object.fromEntries(Object.keys(identityFields).map(key=>[key,reviewedStagingIdentity[key]]));
      if(!/^[a-z]{20}$/.test(reviewed.projectRef)||typeof reviewed.projectRef!=='string'||typeof reviewed.host!=='string'||!/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(reviewed.host)||reviewed.port!=='5432'||reviewed.database!=='postgres'||typeof reviewed.role!=='string'||!/^zerojams_staging_[a-z0-9_]{1,30}$/.test(reviewed.role)||typeof reviewed.epoch!=='string'||!/^[a-f0-9]{24}$/.test(reviewed.epoch))unavailable();
      Object.freeze(reviewed);
    }catch{unavailable();}
  }
  let record,closed=false;
  function get(env){
    if(closed||!env||typeof env!=='object'||Array.isArray(env))unavailable();
    const socket=present(env,'ZERO_JAMS_LOCAL_'),staging=present(env,'ZERO_JAMS_STAGING_'),production=present(env,'ZERO_JAMS_PRODUCTION_')||(env===process.env&&env.NODE_ENV==='production'&&(env.VERCEL_ENV==='production'||env.VERCEL_ENV===undefined));
    const mode=[socket,staging,production].filter(Boolean).length>1?'invalid':socket?'local':staging?'staging':production?'production':'git',selected=mode!=='git';
    // Includes presence (undefined differs from null) without serializing URI,
    // CA, or any other private connection value into a fingerprint or log.
    const values=fields.map(key=>env[key]);
    if(!record)record={mode,values,env:selected?env:undefined,failed:false,pending:null};
    if(record.failed)unavailable();
    const required=mode==='local'?localFields:mode==='staging'?stagingFields:productionFields;
    const unknown=Object.keys(env).some(key=>(key.startsWith('ZERO_JAMS_LOCAL_')||key.startsWith('ZERO_JAMS_STAGING_')||key.startsWith('ZERO_JAMS_PRODUCTION_'))&&!fields.includes(key)&&env[key]!==undefined);
    const invalid=selected&&(mode==='invalid'||unknown||record.env!==env||(mode!=='production'&&!local(env))||required.some(key=>typeof env[key]!=='string'||!env[key])||
      mode==='local'&&env.ZERO_JAMS_LOCAL_AUTHORITY!=='postgres'||mode==='production'&&(env!==process.env||env.NODE_ENV!=='production'||env.VERCEL_ENV!=='production'||env.VERCEL!=='1'||env.ZERO_JAMS_PRODUCTION_AUTHORITY!=='neon-postgres')||mode==='staging'&&(env.ZERO_JAMS_STAGING_AUTHORITY!=='supabase-postgres'||!reviewed||Object.entries(identityFields).some(([key,field])=>env[field]!==reviewed[key])));
    if(record.mode!==mode||record.values.some((value,i)=>value!==values[i])||invalid){
      record.failed=true;unavailable();
    }
    return record;
  }
  return Object.freeze({
    // Observe/pin selection before authentication awaits. This helper runs
    // outside the HTTP error boundary, so invalid/drifted configuration stays
    // truthy and reaches the guarded resolver's503 instead of throwing here or
    // being interpreted as permission to use the Git writer.
    requested(env=process.env){try{return get(env).mode!=='git';}catch{return true;}},
    async authorityForRequest({env=process.env,sourceToken}={}){
      try{
        const record=get(env);if(record.mode==='git')return null;
        if(!record.pending)record.pending=Promise.resolve().then(()=>{
          get(env);return (record.mode==='production'?productionSelectorFactory:record.mode==='staging'?stagingSelectorFactory:selectorFactory)({env,now,fetchImpl});
        });
        const selector=await record.pending;get(env);
        if(!selector||typeof selector.authorityForRequest!=='function')unavailable();
        const authority=await selector.authorityForRequest(sourceToken===undefined?{}:{sourceToken});get(env);
        if(!authority||!authority.service||typeof authority.visibilityReader!=='function')unavailable();
        const service=Object.freeze(Object.fromEntries(Object.entries(authority.service).map(([name,value])=>[name,typeof value!=='function'?value:async(...args)=>{
          try{get(env);const result=await value.apply(authority.service,args);get(env);return result;}
          catch(error){if(error instanceof JamError&&error.status<500)throw error;unavailable();}
        }])));
        {
          // Default Hub orchestration supplies its canonical process env. The
          // staging selector deliberately binds a sanitized facade instead;
          // validate the caller's identity, then omit this redundant override.
          const visibilityReader=async(options={})=>{
            try{
              get(env);
              if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['env','signal'].includes(key))||
                options.env!==undefined&&options.env!==env&&options.env!==authority.hubOptions?.env)unavailable();
              const result=await authority.visibilityReader(record.mode==='staging'||record.mode==='production'?{signal:options.signal}:options);get(env);return result;
            }catch{unavailable();}
          };
          return Object.freeze({...authority,service,visibilityReader,
            jamOptions:Object.freeze({...authority.jamOptions,service,visibilityReader}),
            hubOptions:Object.freeze({...authority.hubOptions,visibilityReader})});
        }
      }catch{unavailable();}
    },
    async close(){
      if(closed)return;closed=true;
      if(record){
        record.failed=true;
        if(record.pending)try{await (await record.pending).close?.();}catch{/* Best effort shutdown only. */}
      }
    }
  });
}

const defaults=createDefaultJamAuthorityManager();
export const localJamAuthorityRequested=env=>defaults.requested(env);
export const readDefaultLocalJamAuthority=options=>defaults.authorityForRequest(options);
