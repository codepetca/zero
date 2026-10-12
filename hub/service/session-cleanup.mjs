// Bounded operator job: removes expired authentication material only.
import {transaction} from './database.mjs';
import {createRuntimePool,verifyRole,configurationError,runMain} from './runtime.mjs';

function batchLimit(value) {
  if(!Number.isSafeInteger(value)||value<1||value>1000)throw configurationError('Authentication cleanup batch must be from 1 to 1000');
  return value;
}

export async function pruneExpiredAuthentication(pool,{batchSize=500}={}) {
  const limit=batchLimit(batchSize);
  await verifyRole(pool,'hub_api');
  return transaction(pool,async client=>{
    // Serialize cleanup batches without granting authentication-row UPDATE.
    await client.query('SELECT pg_advisory_xact_lock(92104422)');
    const counts={};
    // Table and key names are fixed trusted identifiers, never request input.
    for(const [table,key,name] of [['hub_sessions','token_hash','sessions'],['hub_oauth_states','state_hash','oauthStates']]) {
      const result=await client.query(`WITH expired AS (
        SELECT ${key} FROM ${table} WHERE expires_at<=now()
        ORDER BY expires_at,${key} LIMIT $1
      ) DELETE FROM ${table} target USING expired WHERE target.${key}=expired.${key}`,[limit]);
      counts[name]=result.rowCount;
    }
    return counts;
  });
}

export async function runAuthenticationCleanup(env=process.env) {
  if(env.ZERO_HUB_CLEANUP_ENABLED!=='1')throw configurationError('Authentication cleanup requires explicit ZERO_HUB_CLEANUP_ENABLED=1');
  for(const name of ['ZERO_HUB_DATABASE_URL','ZERO_HUB_MIGRATION_DATABASE_URL','ZERO_HUB_CHECKER_DATABASE_URL','ZERO_HUB_PUBLISHER_DATABASE_URL','ZERO_HUB_GITHUB_CLIENT_SECRET'])
    if(env[name])throw configurationError('Authentication cleanup must contain only its API database credential');
  const batchSize=batchLimit(Number(env.ZERO_HUB_CLEANUP_BATCH??500));
  const pool=createRuntimePool(env.ZERO_HUB_API_DATABASE_URL,'hub_api');
  try {return await pruneExpiredAuthentication(pool,{batchSize});}
  finally {await pool.end();}
}

if(import.meta.url===`file://${process.argv[1]}`)await runMain(async()=>{
  const counts=await runAuthenticationCleanup();
  console.log(JSON.stringify({expiredAuthenticationRemoved:counts}));
});
