import {readFile} from 'node:fs/promises';

export async function transaction(pool,action) {
  const client=await pool.connect();
  try { await client.query('BEGIN'); const result=await action(client); await client.query('COMMIT'); return result; }
  catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Called explicitly by local proofs or the migration entrypoint, never HTTP startup.
export async function migrateDatabase(pool,{roles=false}={}) {
  const names=['001-hub.sql','002-objects.sql',...(roles?['003-roles.sql']:[])];
  const sources=await Promise.all(names.map(name=>readFile(new URL(`../sql/${name}`,import.meta.url),'utf8')));
  await transaction(pool,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(92104419)');
    for(const sql of sources) await client.query(sql);
  });
}
