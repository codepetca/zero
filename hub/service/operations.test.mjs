import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {OPERATIONS_FAILURE,OPERATIONS_SQL,operationsReport,readOperations} from './operations.mjs';
import {operationsConfiguration,runOperationsMonitor,operationsArguments,operationsOutput} from './operations-cli.mjs';
import {ADMISSION_LIMITS} from './admission.mjs';
import {AUTH_LIMITS} from './auth-admission.mjs';

function row(values={}) {
  return {queuedSubmissions:'0',checkingSubmissions:'0',pendingPublicationSubmissions:'0',activeSubmissions:'0',queuedSubmissionMaxAgeSeconds:'0',pendingPublicationSubmissionMaxAgeSeconds:'0',staleCheckingLeases:'0',infrastructureErrorSubmissions24h:'0',retainedSourceBytes:'0',storedObjectBytes:'0',retainedSessions:'0',liveSessions:'0',expiredSessions:'0',retainedOAuthStates:'0',pendingOAuthStates:'0',expiredOAuthStates:'0',...values};
}
test('canonical healthy report contains only fixed numeric aggregates and bounded output',()=>{
  const report=operationsReport(row({storedObjectBytes:'9007199254740993'}));
  assert.equal(report.status,'ok');assert.deepEqual(report.alerts,[]);assert.equal(report.metrics.storedObjectBytes,'9007199254740993');assert.equal(report.metrics.queuedSubmissions,0);assert.ok(Buffer.byteLength(JSON.stringify(report))<8192);
});
test('age, stale lease and infrastructure warning thresholds use fixed codes',()=>{
  assert.deepEqual(operationsReport(row({queuedSubmissionMaxAgeSeconds:'1799',pendingPublicationSubmissionMaxAgeSeconds:'1799',infrastructureErrorSubmissions24h:'4'})).alerts,[]);
  assert.deepEqual(operationsReport(row({checkingSubmissions:'1',activeSubmissions:'1',queuedSubmissionMaxAgeSeconds:'1800',pendingPublicationSubmissionMaxAgeSeconds:'1800',staleCheckingLeases:'1',infrastructureErrorSubmissions24h:'5'})).alerts,['queued-submission-age','pending-publication-submission-age','stale-checking-lease','infrastructure-errors-24h']);
});
test('80percent pressure compares existing global budgets exactly, without any stored-object cap',()=>{
  const byteBoundary=(BigInt(ADMISSION_LIMITS.sourceBytesGlobal)*4n+4n)/5n;
  const below=row({queuedSubmissions:'79',activeSubmissions:'79',retainedSourceBytes:String(byteBoundary-1n),retainedSessions:String(AUTH_LIMITS.retainedSessions*0.8-1),liveSessions:String(AUTH_LIMITS.retainedSessions*0.8-1),retainedOAuthStates:String(AUTH_LIMITS.retainedStates*0.8-1),pendingOAuthStates:String(AUTH_LIMITS.pendingStates*0.8-1),expiredOAuthStates:String(AUTH_LIMITS.retainedStates*0.8-AUTH_LIMITS.pendingStates*0.8),storedObjectBytes:'9999999999999999999999999999999999999999'});
  assert.deepEqual(operationsReport(below).alerts,[]);
  assert.deepEqual(operationsReport(row({queuedSubmissions:'80',activeSubmissions:'80',retainedSourceBytes:String(byteBoundary),retainedSessions:String(AUTH_LIMITS.retainedSessions*0.8),liveSessions:String(AUTH_LIMITS.retainedSessions*0.8),retainedOAuthStates:String(AUTH_LIMITS.retainedStates*0.8),pendingOAuthStates:String(AUTH_LIMITS.pendingStates*0.8),expiredOAuthStates:String(AUTH_LIMITS.retainedStates*0.8-AUTH_LIMITS.pendingStates*0.8)})).alerts,['active-submission-pressure','retained-source-pressure','retained-session-pressure','retained-oauth-state-pressure','pending-oauth-state-pressure']);
});
test('malformed, noncanonical, overflowing and inconsistent aggregates fail without reflecting inputs',()=>{
  for(const bad of [null,{},row({privateReason:'secret-text'}),row({queuedSubmissions:'9007199254740992'}),row({activeSubmissions:'1'}),row({staleCheckingLeases:'1'}),row({expiredSessions:'1'}),row({pendingOAuthStates:'1'}),...['-1','1.5','01','1e3',NaN,1,'secret-text','9'.repeat(41)].map(value=>row({storedObjectBytes:value}))])assert.throws(()=>operationsReport(bad),{message:OPERATIONS_FAILURE});
});
test('monitor configuration requires only restricted API credentials and explicit enabling',async()=>{
  const env={ZERO_HUB_MONITOR_ENABLED:'1',ZERO_HUB_API_DATABASE_URL:'postgresql://private-secret@example.test/test'};
  assert.equal(operationsConfiguration(env).connectionString,env.ZERO_HUB_API_DATABASE_URL);
  for(const key of ['ZERO_HUB_DATABASE_URL','ZERO_HUB_MIGRATION_DATABASE_URL','ZERO_HUB_CHECKER_DATABASE_URL','ZERO_HUB_PUBLISHER_DATABASE_URL','DATABASE_URL','POSTGRES_PASSWORD','PGHOST','PGSSLMODE','NEON_TOKEN','NEON_PASSWORD','ZERO_HUB_GITHUB_CLIENT_ID','ZERO_HUB_GITHUB_CLIENT_SECRET','ZERO_HUB_OAUTH_SECRET','GH_TOKEN','GITHUB_TOKEN','ZERO_HUB_UPLOADS','ZERO_HUB_WORKERS_ENABLED'])assert.throws(()=>operationsConfiguration({...env,[key]:'1'}),{message:OPERATIONS_FAILURE});
  for(const flag of [undefined,'0','true'])await assert.rejects(runOperationsMonitor({...env,ZERO_HUB_MONITOR_ENABLED:flag}),{message:OPERATIONS_FAILURE});
  await assert.rejects(runOperationsMonitor({...env,ZERO_HUB_API_DATABASE_URL:'private-secret'}),{message:OPERATIONS_FAILURE});
});
test('readOperations uses one read-only repeatable-read transaction and local timeouts, always releasing its client',async()=>{
  const queries=[];let released=0;
  const client={query:async sql=>{queries.push(sql);if(sql===OPERATIONS_SQL)return {rows:[row()]};if(sql==='SELECT current_user AS role')return {rows:[{role:'hub_api'}]};return {rows:[{}]};},release:()=>{released++;}};
  assert.equal((await readOperations({connect:async()=>client})).status,'ok');
  assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(queries.at(-1),'COMMIT');assert.equal(queries.filter(sql=>sql===OPERATIONS_SQL).length,1);assert.equal(released,1);
  assert.ok(queries.includes("SET LOCAL statement_timeout='5000ms'"));assert.ok(queries.includes("SET LOCAL lock_timeout='1000ms'"));assert.ok(queries.includes("SET LOCAL idle_in_transaction_session_timeout='10000ms'"));
  client.query=async sql=>{queries.push(sql);throw new Error('private-secret');};
  await assert.rejects(readOperations({connect:async()=>client}),{message:OPERATIONS_FAILURE});assert.equal(released,2);
  await assert.rejects(readOperations({connect:async()=>{throw new Error('private-secret');}}),{message:OPERATIONS_FAILURE});
});
test('aggregate or wrong-role failure rolls back without exposing private data',async()=>{
  for(const role of ['hub_checker','hub_api']) {
    const queries=[];let released=false;
    const client={query:async sql=>{queries.push(sql);if(sql==='SELECT current_user AS role')return {rows:[{role}]};if(sql===OPERATIONS_SQL)throw new Error('private-secret');return {rows:[{}]};},release:()=>{released=true;}};
    await assert.rejects(readOperations({connect:async()=>client}),{message:OPERATIONS_FAILURE});assert.equal(queries.at(-1),'ROLLBACK');assert.ok(released);
    if(role==='hub_checker')assert.ok(!queries.includes(OPERATIONS_SQL));
  }
});
test('standalone CLI fails once with exit1 and fixed sanitized text',async()=>{
  let output='';const child=spawn(process.execPath,[new URL('./operations-cli.mjs',import.meta.url).pathname,'private-secret'],{env:{...process.env,ZERO_HUB_MONITOR_ENABLED:'0',ZERO_HUB_API_DATABASE_URL:'postgresql://private-secret'},stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,1);assert.equal(output,OPERATIONS_FAILURE+'\n');
});
test('alerts-only output excludes all metric values and CLI accepts only the fixed optional flag',()=>{
  assert.deepEqual(operationsArguments([]),{alertsOnly:false});assert.deepEqual(operationsArguments(['--alerts-only']),{alertsOnly:true});
  for(const args of [['--alerts-only','--alerts-only'],['private-secret'],['--url','private-secret']])assert.throws(()=>operationsArguments(args),{message:OPERATIONS_FAILURE});
  const report=operationsReport(row({storedObjectBytes:'9999999999999999999',infrastructureErrorSubmissions24h:'5'}));
  assert.deepEqual(JSON.parse(operationsOutput(report,{alertsOnly:true})),{status:'attention',alerts:['infrastructure-errors-24h']});
  assert.ok(!operationsOutput(report,{alertsOnly:true}).includes('9999999999999999999'));assert.ok(!operationsOutput(report,{alertsOnly:true}).includes('metrics'));
  assert.deepEqual(JSON.parse(operationsOutput(report)),report);
});
