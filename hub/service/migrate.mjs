import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {migrateDatabase} from './database.mjs';
import {createRuntimePool,verifyRole,runMain,configurationError} from './runtime.mjs';
await runMain(async()=>{
  const connectionString=process.env.ZERO_HUB_MIGRATION_DATABASE_URL;
  if(!connectionString)throw configurationError('Set ZERO_HUB_MIGRATION_DATABASE_URL');
  const bootstrap=process.argv.slice(2).join(' ')==='--bootstrap-roles';
  if(process.argv.length>2&&!bootstrap)throw configurationError('Use --bootstrap-roles only for first setup');
  const pool=bootstrap?new pg.Pool({connectionString,max:1,connectionTimeoutMillis:10000}):createRuntimePool(connectionString,'hub_migration_owner');
  try {
    if(bootstrap)await pool.query(await readFile(new URL('../sql/000-roles.sql',import.meta.url),'utf8'));
    else {await verifyRole(pool,'hub_migration_owner');await migrateDatabase(pool,{roles:true});}
    console.log(bootstrap?'ZeroHub NOLOGIN roles prepared; operator must separately assign login memberships':'ZeroHub migrations complete');
  } finally {await pool.end();}
});
