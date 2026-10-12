// Administrator-seeded inert rows, never checker execution or candidate Java.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {startDisposablePostgres} from './postgres-fixture.mjs';
import {migrateDatabase} from './database.mjs';
import {createRuntimePool} from './runtime.mjs';
import {readOperations,OPERATIONS_FAILURE} from './operations.mjs';
import {runOperationsMonitor} from './operations-cli.mjs';
import {ADMISSION_LIMITS} from './admission.mjs';
import {AUTH_LIMITS} from './auth-admission.mjs';

let fixture,api,wrong,apiURL,wrongURL;const pools=[];
const secret='private-source-identity-error-token-report-marker';
const major=Number(process.env.ZERO_HUB_OPERATIONS_PG_MAJOR??17);
const envFor=url=>({ZERO_HUB_MONITOR_ENABLED:'1',ZERO_HUB_API_DATABASE_URL:url});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
before(async()=>{
  fixture=await startDisposablePostgres({port:15473,major});
  await fixture.pool.query(await readFile(new URL('../sql/000-roles.sql',import.meta.url),'utf8'));
  await migrateDatabase(fixture.pool,{roles:true});
  await fixture.pool.query("INSERT INTO hub_users(github_id,login) VALUES('101','private-student')");
  await fixture.pool.query("INSERT INTO hub_libraries(id,owner_id) VALUES('ui1','101')");
  for(const role of ['hub_api','hub_checker']) {
    const login='zero_ops_'+role,password=randomBytes(32).toString('hex');
    await fixture.pool.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);await fixture.pool.query(`GRANT ${role} TO ${login}`);
    const url=new URL(fixture.connectionString);url.username=login;url.password=password;
    const pool=createRuntimePool(url.href,role);pools.push(pool);
    if(role==='hub_api'){api=pool;apiURL=url.href;}else {wrong=pool;wrongURL=url.href;}
  }
});
after(async()=>{await Promise.all(pools.map(pool=>pool.end()));await fixture?.stop();});
async function submission(status,{ageMinutes=0,error=null,lease='none',bundle={files:{'API.md':secret+' 😀'}}}={}) {
  const id=randomUUID(),version='0.0.'+(Number((await fixture.pool.query('SELECT count(*) AS n FROM hub_submissions')).rows[0].n)+1);
  await fixture.pool.query(`INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status,error,created_at,lease_token,lease_until)
    VALUES($1,'ui1','101',$2,$3,$4,$5,$6,now()-$7::int*interval '1 minute',$8,CASE WHEN $9='expired' THEN now()-interval '1 minute' WHEN $9='live' THEN now()+interval '10 minutes' ELSE NULL END)`,[id,version,bundle,'a'.repeat(64),status,error,ageMinutes,lease==='none'?null:randomUUID(),lease]);
  return id;
}
async function snapshot() {
  const values={};for(const table of ['hub_users','hub_libraries','hub_submissions','hub_results','hub_releases','hub_objects','hub_sessions','hub_oauth_states','hub_release_events']) {
    // Private values are compared only in-memory and never emitted by monitor.
    const {rows}=await fixture.pool.query(`SELECT md5(row_to_json(t)::text) AS digest FROM ${table} t ORDER BY digest`);values[table]=hash(JSON.stringify(rows));
  }return values;
}
async function cli(url,args=[]) {
  let stdout='',stderr='';
  const child=spawn(process.execPath,[new URL('./operations-cli.mjs',import.meta.url).pathname,...args],{env:envFor(url),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  return {code,stdout,stderr};
}
test('restricted actual API report starts healthy and ordinary student failure causes no infrastructure alert',async()=>{
  assert.equal((await readOperations(api)).status,'ok');
  const id=await submission('failed');
  await fixture.pool.query("INSERT INTO hub_results(submission_id,source_digest,policy,policy_digest,passed,report) VALUES($1,$2,'fixture',$2,false,$3)",[id,'a'.repeat(64),{private:secret,checks:[{passed:false}]}]);
  const before=await snapshot(),report=await readOperations(api);assert.equal(report.status,'ok');assert.equal(report.metrics.infrastructureErrorSubmissions24h,0);
  assert.equal(report.metrics.activeSubmissions,0);assert.deepEqual(await snapshot(),before);assert.ok(!JSON.stringify(report).includes(secret));
  const expected=(await fixture.pool.query("SELECT sum(octet_length(convert_to(bundle::text,'UTF8')))::text AS bytes FROM hub_submissions")).rows[0].bytes;assert.equal(report.metrics.retainedSourceBytes,expected);
  const healthy=await cli(apiURL);assert.equal(healthy.code,0);assert.equal(healthy.stderr,'');assert.equal(JSON.parse(healthy.stdout).status,'ok');assert.ok(Buffer.byteLength(healthy.stdout)<=8192);
  const publicLog=await cli(apiURL,['--alerts-only']);assert.equal(publicLog.code,0);assert.deepEqual(JSON.parse(publicLog.stdout),{status:'ok',alerts:[]});assert.ok(!publicLog.stdout.includes('metrics'));
});
test('ages use submission creation; expired and null checking leases warn, while ordinary failed verdicts remain excluded',async()=>{
  await submission('queued',{ageMinutes:31});await submission('checked',{ageMinutes:32});
  await submission('checking',{lease:'expired'});await submission('checking',{lease:'none'});await submission('checking',{lease:'live'});
  for(let i=0;i<5;i++)await submission(i%2?'queued':'failed',{error:secret});
  await submission('failed',{ageMinutes:1500,error:secret});
  const before=await snapshot(),report=await readOperations(api);assert.deepEqual(await snapshot(),before);
  assert.equal(report.status,'attention');assert.equal(report.metrics.queuedSubmissions,3);assert.equal(report.metrics.checkingSubmissions,3);assert.equal(report.metrics.pendingPublicationSubmissions,1);assert.equal(report.metrics.activeSubmissions,7);
  assert.equal(report.metrics.staleCheckingLeases,2);assert.equal(report.metrics.infrastructureErrorSubmissions24h,5);assert.ok(report.metrics.queuedSubmissionMaxAgeSeconds>=1860);assert.ok(report.metrics.pendingPublicationSubmissionMaxAgeSeconds>=1920);
  assert.deepEqual(report.alerts,['queued-submission-age','pending-publication-submission-age','stale-checking-lease','infrastructure-errors-24h']);
  for(const privateValue of [secret,'private-student','policy','report','token','actor','reason'])assert.ok(!JSON.stringify(report).includes(privateValue),privateValue);
  const result=await cli(apiURL,['--alerts-only']);assert.equal(result.code,2);assert.equal(result.stderr,'');assert.deepEqual(JSON.parse(result.stdout),{status:report.status,alerts:report.alerts});assert.ok(!result.stdout.includes('metrics'));
});
test('admitted-source bytes, object totals and existing active/auth budget pressure aggregate without writes or token output',async()=>{
  const queuedTarget=Math.ceil(ADMISSION_LIMITS.activeGlobal*0.8)-7;
  // Compressible inert source is generated inside PostgreSQL; no student source
  // is executed. Logical UTF8 accounting includes every retained JSONB bundle.
  await fixture.pool.query(`INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status)
    SELECT md5('operations-source-'||n)::uuid,'ui1','101','1.0.'||n,jsonb_build_object('source',repeat('x',1048576)),$1,CASE WHEN n<=$2 THEN 'queued' ELSE 'failed' END FROM generate_series(1,205) n`,['b'.repeat(64),queuedTarget]);
  const bytes=Buffer.from('inert stored object '+secret);await fixture.pool.query('INSERT INTO hub_objects(digest,size,bytes) VALUES($1,$2,$3)',[hash(bytes),bytes.length,bytes]);
  const sessionTarget=Math.ceil(AUTH_LIMITS.retainedSessions*0.8),pendingTarget=Math.ceil(AUTH_LIMITS.pendingStates*0.8),statesTarget=Math.ceil(AUTH_LIMITS.retainedStates*0.8);
  await fixture.pool.query("INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at) SELECT 'private-session-'||n,'101',$1,CASE WHEN n%2=0 THEN now()+interval '1 hour' ELSE now()-interval '1 hour' END FROM generate_series(1,$2) n",[secret,sessionTarget]);
  await fixture.pool.query("INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at) SELECT 'private-state-'||n,$1,CASE WHEN n<=$2 THEN now()+interval '1 hour' ELSE now()-interval '1 hour' END FROM generate_series(1,$3) n",[secret,pendingTarget,statesTarget]);
  const before=await snapshot(),report=await readOperations(api);assert.deepEqual(await snapshot(),before);
  assert.equal(report.metrics.activeSubmissions,80);assert.equal(report.metrics.storedObjectBytes,String(bytes.length));assert.ok(BigInt(report.metrics.retainedSourceBytes)*5n>=BigInt(ADMISSION_LIMITS.sourceBytesGlobal)*4n);
  assert.equal(report.metrics.retainedSessions,sessionTarget);assert.equal(report.metrics.expiredSessions,sessionTarget/2);assert.equal(report.metrics.liveSessions,sessionTarget/2);assert.equal(report.metrics.pendingOAuthStates,pendingTarget);assert.equal(report.metrics.expiredOAuthStates,statesTarget-pendingTarget);
  for(const code of ['active-submission-pressure','retained-source-pressure','retained-session-pressure','retained-oauth-state-pressure','pending-oauth-state-pressure'])assert.ok(report.alerts.includes(code),code);
  assert.ok(Buffer.byteLength(JSON.stringify(report))<=8192);assert.ok(!JSON.stringify(report).includes(secret));assert.ok(!JSON.stringify(report).includes('private-session-'));
});
test('wrong-role and unavailability fail sanitized; CLI exits leave no retained database connections',async()=>{
  const before=await snapshot();await assert.rejects(readOperations(wrong),{message:OPERATIONS_FAILURE});assert.deepEqual(await snapshot(),before);
  const denied=await cli(wrongURL);assert.equal(denied.code,1);assert.equal(denied.stdout,'');assert.equal(denied.stderr,OPERATIONS_FAILURE+'\n');
  const invalid=await cli(apiURL,['--private-secret']);assert.equal(invalid.code,1);assert.equal(invalid.stdout,'');assert.equal(invalid.stderr,OPERATIONS_FAILURE+'\n');
  const unavailable=new URL(apiURL);unavailable.port='15474';await assert.rejects(runOperationsMonitor(envFor(unavailable.href)),{message:OPERATIONS_FAILURE});
  await api.end();pools.splice(pools.indexOf(api),1);
  await runOperationsMonitor(envFor(apiURL));
  const {rows:[connections]}=await fixture.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='zero_ops_hub_api'");assert.equal(connections.n,0);
});
