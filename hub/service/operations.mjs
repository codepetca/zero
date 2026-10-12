import {verifyRole} from './db-role.mjs';
import {ADMISSION_LIMITS} from './admission.mjs';
import {AUTH_LIMITS} from './auth-admission.mjs';

export const OPERATIONS_FAILURE='ZeroHub operations report unavailable';
export const OPERATIONS_SQL=`WITH submissions AS (
  SELECT count(*) FILTER (WHERE status='queued')::text AS "queuedSubmissions",
    count(*) FILTER (WHERE status='checking')::text AS "checkingSubmissions",
    count(*) FILTER (WHERE status='checked')::text AS "pendingPublicationSubmissions",
    count(*) FILTER (WHERE status IN ('queued','checking','checked'))::text AS "activeSubmissions",
    floor(greatest(COALESCE(max(extract(epoch FROM (now()-created_at))) FILTER (WHERE status='queued'),0),0))::text AS "queuedSubmissionMaxAgeSeconds",
    floor(greatest(COALESCE(max(extract(epoch FROM (now()-created_at))) FILTER (WHERE status='checked'),0),0))::text AS "pendingPublicationSubmissionMaxAgeSeconds",
    count(*) FILTER (WHERE status='checking' AND (lease_until IS NULL OR lease_until<=now()))::text AS "staleCheckingLeases",
    count(*) FILTER (WHERE error IS NOT NULL AND created_at>=now()-interval '24 hours')::text AS "infrastructureErrorSubmissions24h",
    COALESCE(sum(octet_length(convert_to(bundle::text,'UTF8'))),0)::text AS "retainedSourceBytes"
  FROM hub_submissions
), objects AS (
  SELECT COALESCE(sum(size),0)::text AS "storedObjectBytes" FROM hub_objects
), sessions AS (
  SELECT count(*)::text AS "retainedSessions",count(*) FILTER (WHERE expires_at>now())::text AS "liveSessions",
    count(*) FILTER (WHERE expires_at<=now())::text AS "expiredSessions" FROM hub_sessions
), states AS (
  SELECT count(*)::text AS "retainedOAuthStates",count(*) FILTER (WHERE expires_at>now())::text AS "pendingOAuthStates",
    count(*) FILTER (WHERE expires_at<=now())::text AS "expiredOAuthStates" FROM hub_oauth_states
)
SELECT submissions.*,objects.*,sessions.*,states.* FROM submissions CROSS JOIN objects CROSS JOIN sessions CROSS JOIN states`;
const COUNTS=['queuedSubmissions','checkingSubmissions','pendingPublicationSubmissions','activeSubmissions','queuedSubmissionMaxAgeSeconds','pendingPublicationSubmissionMaxAgeSeconds','staleCheckingLeases','infrastructureErrorSubmissions24h','retainedSessions','liveSessions','expiredSessions','retainedOAuthStates','pendingOAuthStates','expiredOAuthStates'];
const BYTES=['retainedSourceBytes','storedObjectBytes'];
const KEYS=[...COUNTS,...BYTES];
const fail=()=>new Error(OPERATIONS_FAILURE);
function integer(value) {
  // PostgreSQL returns explicitly cast numeric text. Refuse unexpected encodings
  // and bounded overflow; no floating-point conversion is used for byte totals.
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,39})$/.test(value))throw fail();
  return BigInt(value);
}
const pressure=(value,limit)=>BigInt(value)*5n>=BigInt(limit)*4n;
export function operationsReport(row) {
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==KEYS.length||KEYS.some(key=>!Object.hasOwn(row,key)))throw fail();
  const metrics={};
  for(const key of KEYS) {
    const value=integer(row[key]);
    if(COUNTS.includes(key)){if(value>BigInt(Number.MAX_SAFE_INTEGER))throw fail();metrics[key]=Number(value);}
    else metrics[key]=value.toString();
  }
  if(metrics.activeSubmissions!==metrics.queuedSubmissions+metrics.checkingSubmissions+metrics.pendingPublicationSubmissions
    ||metrics.staleCheckingLeases>metrics.checkingSubmissions
    ||metrics.retainedSessions!==metrics.liveSessions+metrics.expiredSessions
    ||metrics.retainedOAuthStates!==metrics.pendingOAuthStates+metrics.expiredOAuthStates)throw fail();
  const alerts=[];
  if(metrics.queuedSubmissionMaxAgeSeconds>=1800)alerts.push('queued-submission-age');
  // This is submission age, not time since the checker finished.
  if(metrics.pendingPublicationSubmissionMaxAgeSeconds>=1800)alerts.push('pending-publication-submission-age');
  if(metrics.staleCheckingLeases>0)alerts.push('stale-checking-lease');
  if(metrics.infrastructureErrorSubmissions24h>=5)alerts.push('infrastructure-errors-24h');
  if(pressure(metrics.activeSubmissions,ADMISSION_LIMITS.activeGlobal))alerts.push('active-submission-pressure');
  if(pressure(metrics.retainedSourceBytes,ADMISSION_LIMITS.sourceBytesGlobal))alerts.push('retained-source-pressure');
  if(pressure(metrics.retainedSessions,AUTH_LIMITS.retainedSessions))alerts.push('retained-session-pressure');
  if(pressure(metrics.retainedOAuthStates,AUTH_LIMITS.retainedStates))alerts.push('retained-oauth-state-pressure');
  if(pressure(metrics.pendingOAuthStates,AUTH_LIMITS.pendingStates))alerts.push('pending-oauth-state-pressure');
  const report={status:alerts.length?'attention':'ok',metrics,alerts};
  if(Buffer.byteLength(JSON.stringify(report))>8192)throw fail();
  return report;
}

export async function readOperations(pool) {
  let client,began=false;
  try {
    client=await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
    await client.query("SET LOCAL statement_timeout='5000ms'");
    await client.query("SET LOCAL lock_timeout='1000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
    await verifyRole(client,'hub_api');
    const {rows}=await client.query(OPERATIONS_SQL);
    if(rows?.length!==1)throw fail();
    const report=operationsReport(rows[0]);
    await client.query('COMMIT');began=false;
    return report;
  } catch {
    if(began)await client.query('ROLLBACK').catch(()=>{});
    throw fail();
  } finally {try {client?.release();}catch {throw fail();}}
}
