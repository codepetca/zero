// Fixed authentication-record budgets, independent of uploaded-source quotas.
// All callers hold the matching transaction lock through their insert/rotation.
export const AUTH_LIMITS=Object.freeze({pendingStates:1000,retainedStates:2000,liveSessionsPerAccount:8,retainedSessions:10000,stateCleanupBatch:50,sessionCleanupBatch:100});
const limited=message=>{throw Object.assign(new Error(message),{status:429});};

export async function admitOAuthStart(client) {
  await client.query('SELECT pg_advisory_xact_lock(92104423)');
  await client.query(`WITH expired AS (
    SELECT state_hash FROM hub_oauth_states WHERE expires_at<=now()
    ORDER BY expires_at,state_hash LIMIT $1
  ) DELETE FROM hub_oauth_states target USING expired WHERE target.state_hash=expired.state_hash`,[AUTH_LIMITS.stateCleanupBatch]);
  const {rows:[row]}=await client.query(`SELECT count(*)::int AS retained,
    count(*) FILTER(WHERE expires_at>statement_timestamp())::int AS pending FROM hub_oauth_states`);
  if(row.retained>=AUTH_LIMITS.retainedStates||row.pending>=AUTH_LIMITS.pendingStates)
    limited('GitHub sign-in is busy. Please try again shortly.');
}

export async function admitSession(client,ownerId,previousHash=null) {
  await client.query('SELECT pg_advisory_xact_lock(92104424)');
  await client.query(`WITH expired AS (
    SELECT token_hash FROM hub_sessions WHERE expires_at<=now()
    ORDER BY expires_at,token_hash LIMIT $1
  ) DELETE FROM hub_sessions target USING expired WHERE target.token_hash=expired.token_hash`,[AUTH_LIMITS.sessionCleanupBatch]);
  const {rows:[row]}=await client.query(`SELECT
    count(*) FILTER(WHERE token_hash IS DISTINCT FROM $2)::int AS retained,
    count(*) FILTER(WHERE user_id=$1 AND expires_at>statement_timestamp() AND token_hash IS DISTINCT FROM $2)::int AS account
    FROM hub_sessions`,[ownerId,previousHash]);
  if(row.retained>=AUTH_LIMITS.retainedSessions)limited('GitHub sign-in is busy. Please try again shortly.');
  if(row.account>=AUTH_LIMITS.liveSessionsPerAccount)
    limited('You have 8 active sign-ins. Sign out in another browser or try again later.');
  // This browser proved possession of its previous token. Rotation happens
  // only after identity/allowance checks, in the same transaction as insertion.
  if(previousHash)await client.query('DELETE FROM hub_sessions WHERE token_hash=$1',[previousHash]);
}
