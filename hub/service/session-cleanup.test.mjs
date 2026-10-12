import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startDisposablePostgres} from './postgres-fixture.mjs';
import {migrateDatabase} from './database.mjs';
import {createRuntimePool} from './runtime.mjs';
import {pruneExpiredAuthentication,runAuthenticationCleanup} from './session-cleanup.mjs';

let fixture,pool;
before(async()=>{
  fixture=await startDisposablePostgres({port:15443});
  await migrateDatabase(fixture.pool,{roles:true});
  const password=randomBytes(32).toString('hex');
  await fixture.pool.query(`CREATE ROLE zero_cleanup_runtime LOGIN NOINHERIT PASSWORD '${password}'`);
  await fixture.pool.query('GRANT hub_api TO zero_cleanup_runtime');
  const url=new URL(fixture.connectionString);url.username='zero_cleanup_runtime';url.password=password;
  pool=createRuntimePool(url.href,'hub_api');
});
beforeEach(async()=>{
  await fixture.pool.query('TRUNCATE hub_sessions,hub_oauth_states,hub_users CASCADE');
  await fixture.pool.query("INSERT INTO hub_users(github_id,login) VALUES('101','alice')");
});
after(async()=>{await pool?.end();await fixture?.stop();});

async function seed(expired=5) {
  await fixture.pool.query(`INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at)
    SELECT 'expired-'||n,'101','csrf',now()-interval '1 hour' FROM generate_series(1,$1::int) n`,[expired]);
  await fixture.pool.query(`INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at)
    SELECT 'expired-'||n,'binding',now()-interval '1 hour' FROM generate_series(1,$1::int) n`,[expired]);
  await fixture.pool.query("INSERT INTO hub_sessions VALUES('live','101','live-csrf',now()+interval '1 hour')");
  await fixture.pool.query("INSERT INTO hub_oauth_states VALUES('live','live-binding',now()+interval '1 hour')");
}

test('restricted API login prunes a bounded batch and preserves live authentication and user identity',async()=>{
  await seed();
  assert.deepEqual(await pruneExpiredAuthentication(pool,{batchSize:2}),{sessions:2,oauthStates:2});
  assert.equal((await fixture.pool.query('SELECT count(*) FROM hub_sessions')).rows[0].count,'4');
  assert.equal((await fixture.pool.query('SELECT count(*) FROM hub_oauth_states')).rows[0].count,'4');
  assert.equal((await fixture.pool.query("SELECT csrf_token FROM hub_sessions WHERE token_hash='live'")).rows[0].csrf_token,'live-csrf');
  assert.equal((await fixture.pool.query("SELECT binding_hash FROM hub_oauth_states WHERE state_hash='live'")).rows[0].binding_hash,'live-binding');
  assert.equal((await fixture.pool.query('SELECT count(*) FROM hub_users')).rows[0].count,'1');
});

test('parallel cleanup serializes bounded batches and repeated jobs become harmless no-ops',async()=>{
  await seed();
  const results=await Promise.all(Array.from({length:3},()=>pruneExpiredAuthentication(pool,{batchSize:2})));
  assert.equal(results.reduce((n,row)=>n+row.sessions,0),5);
  assert.equal(results.reduce((n,row)=>n+row.oauthStates,0),5);
  assert.ok(results.every(row=>row.sessions<=2&&row.oauthStates<=2));
  assert.deepEqual(await pruneExpiredAuthentication(pool),{sessions:0,oauthStates:0});
  assert.equal((await fixture.pool.query('SELECT count(*) FROM hub_sessions')).rows[0].count,'1');
});

test('cleanup refuses owner authority, invalid limits and implicit or mixed credential activation',async()=>{
  await seed();
  await assert.rejects(pruneExpiredAuthentication(fixture.pool),/runtime role/);
  for(const batchSize of [0,-1,1001,1.5,'2',NaN])await assert.rejects(pruneExpiredAuthentication(pool,{batchSize}),/batch/);
  await assert.rejects(runAuthenticationCleanup({}),/explicit/);
  await assert.rejects(runAuthenticationCleanup({ZERO_HUB_CLEANUP_ENABLED:'1',ZERO_HUB_CHECKER_DATABASE_URL:'excluded'}),/only its API/);
  await assert.rejects(runAuthenticationCleanup({ZERO_HUB_CLEANUP_ENABLED:'1',ZERO_HUB_CLEANUP_BATCH:'1001'}),/batch/);
  assert.equal((await fixture.pool.query('SELECT count(*) FROM hub_sessions')).rows[0].count,'6');
});
