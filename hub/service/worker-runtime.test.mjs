import test from 'node:test';
import assert from 'node:assert/strict';
import {workerLifecycle,workerLoop,runWorker} from './worker-runtime.mjs';
test('workers default to finite batches; explicit continuous operation and configuration fail closed',async()=>{
  assert.deepEqual(workerLifecycle(),{mode:'batch',maxJobs:10,intervalMs:1000});
  assert.equal(workerLifecycle({ZERO_HUB_WORKER_MODE:'continuous'}).mode,'continuous');
  for(const fields of [{ZERO_HUB_WORKER_MODE:'forever'},...[0,101,1.5,'bad'].map(ZERO_HUB_WORKER_MAX_JOBS=>({ZERO_HUB_WORKER_MAX_JOBS})),{ZERO_HUB_WORKER_INTERVAL_MS:99}]) {
    assert.throws(()=>workerLifecycle(fields));
    await assert.rejects(runWorker({kind:'checker',checker:{},env:{ZERO_HUB_WORKERS_ENABLED:'1',...fields}}));
  }
});
test('empty batch checks once and exits without sleeping or checking again',async()=>{
  let attempts=0;
  const result=await workerLoop(async()=>{attempts++;return false;},{...workerLifecycle(),stopping:()=>false,wait:()=>assert.fail('Idle batch must not poll')});
  assert.deepEqual(result,{mode:'batch',processed:0});assert.equal(attempts,1);
});
test('job budget prevents a busy or retrying queue from keeping a batch alive',async()=>{
  let attempts=0;
  const result=await workerLoop(async()=>{attempts++;return true;},{...workerLifecycle({ZERO_HUB_WORKER_MAX_JOBS:3}),stopping:()=>false,wait:()=>assert.fail('Batch must not schedule a timer')});
  assert.equal(attempts,3);assert.equal(result.processed,3);
});
test('batch drains available jobs serially and stops on the first empty result',async()=>{
  let active=0,maxActive=0,attempts=0;
  const result=await workerLoop(async()=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return ++attempts<=2;},{...workerLifecycle(),stopping:()=>false,wait:()=>assert.fail()});
  assert.deepEqual(result,{mode:'batch',processed:2});assert.equal(attempts,3);assert.equal(maxActive,1);
});
test('stop during an active job starts no new work; stage errors propagate',async()=>{
  let stopped=false,attempts=0;
  const result=await workerLoop(async()=>{attempts++;stopped=true;return true;},{...workerLifecycle(),stopping:()=>stopped,wait:()=>assert.fail()});
  assert.equal(attempts,1);assert.equal(result.processed,1);
  await assert.rejects(workerLoop(async()=>{throw new Error('stage failed');},{...workerLifecycle(),stopping:()=>false,wait:()=>assert.fail()}),/stage failed/);
});
test('continuous mode is opt-in, single-flight and waits between empty checks until stopped',async()=>{
  let attempts=0,waits=0,stopped=false;
  const result=await workerLoop(async()=>{attempts++;return false;},{...workerLifecycle({ZERO_HUB_WORKER_MODE:'continuous'}),stopping:()=>stopped,wait:async()=>{if(++waits===2)stopped=true;}});
  assert.equal(attempts,2);assert.equal(waits,2);assert.deepEqual(result,{mode:'continuous',processed:0});
});
test('role-verified workers close empty queues and honor the batch cap against actual PostgreSQL',{skip:!process.env.ZERO_HUB_TEST_DATABASE},async()=>{
  const [{default:pg},{readFile},{randomBytes,randomUUID},{migrateDatabase}]=await Promise.all([import('pg'),import('node:fs/promises'),import('node:crypto'),import('./database.mjs')]);
  const connectionString=process.env.ZERO_HUB_TEST_DATABASE;
  const admin=new pg.Pool({connectionString,max:1});const principals=[];
  const checker={validateBundle:()=>{throw new Error('Inert invalid fixture; no candidate execution');},checkSubmission:()=>assert.fail('No Java execution permitted')};
  try {
    await admin.query(await readFile(new URL('../sql/000-roles.sql',import.meta.url),'utf8'));
    await migrateDatabase(admin,{roles:true});
    await admin.query('TRUNCATE hub_sessions,hub_oauth_states,hub_results,hub_releases,hub_objects,hub_submissions,hub_libraries,hub_users CASCADE');
    for(const kind of ['checker','publisher']) {
      const name='zero_batch_'+kind+'_'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
      await admin.query(`CREATE ROLE ${name} LOGIN NOINHERIT PASSWORD '${password}'`);
      await admin.query(`GRANT hub_${kind} TO ${name}`);principals.push(name);
      const url=new URL(connectionString);url.username=name;url.password=password;
      const variable=`ZERO_HUB_${kind.toUpperCase()}_DATABASE_URL`;
      const result=await runWorker({kind,checker,env:{ZERO_HUB_WORKERS_ENABLED:'1',[variable]:url.href}});
      assert.deepEqual(result,{mode:'batch',processed:0});
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1',[name])).rows[0].n,0);
      if(kind==='checker') {
        await admin.query("INSERT INTO hub_users(github_id,login) VALUES('101','local-fixture')");
        await admin.query("INSERT INTO hub_libraries(id,owner_id) VALUES('ui1','101')");
        const id=randomUUID();
        await admin.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES($1,'ui1','101','0.1.0',$2,$3,'queued')",[id,{},'a'.repeat(64)]);
        const limited=await runWorker({kind,checker,env:{ZERO_HUB_WORKERS_ENABLED:'1',ZERO_HUB_WORKER_MAX_JOBS:'2',[variable]:url.href}});
        assert.deepEqual(limited,{mode:'batch',processed:2});
        const row=(await admin.query('SELECT status,attempts,lease_token FROM hub_submissions WHERE id=$1',[id])).rows[0];
        assert.deepEqual(row,{status:'queued',attempts:2,lease_token:null});
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1',[name])).rows[0].n,0);
      }
    }
  }finally {for(const name of principals)await admin.query(`DROP ROLE ${name}`);await admin.end();}
});
