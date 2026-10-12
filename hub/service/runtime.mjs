import pg from 'pg';
import {configurationError} from './db-role.mjs';
export {configurationError,verifyRole} from './db-role.mjs';
const ROLES=new Set(['hub_api','hub_checker','hub_publisher','hub_migration_owner']);
export function createRuntimePool(connectionString,role) {
  if(!connectionString) throw configurationError('Set the database URL for this service role');
  if(!ROLES.has(role)) throw configurationError('Unsupported hub database role');
  let url;
  try {url=new URL(connectionString);} catch {throw configurationError('Invalid hub database URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)) throw configurationError('Use a PostgreSQL database URL');
  if(url.searchParams.has('options')) throw configurationError('Database URL must not override runtime role options');
  // Keep URL sslmode/certificate semantics. Never inject ssl:{rejectUnauthorized:false}.
  const pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,options:`-c role=${role} -c statement_timeout=15000 -c search_path=public,pg_catalog`});
  pool.on('error',()=>console.error('ZeroHub database connection interrupted; credentials are not logged.'));
  return pool;
}
export function runMain(action) {
  return action().catch(error=>{console.error(error?.code==='ZERO_HUB_CONFIG'?error.message:'ZeroHub service failed. Check role grants and database availability; credentials are not logged.');process.exitCode=1;});
}
