import {createHash, randomUUID} from 'node:crypto';
import {Pool} from 'pg';

const accountPattern = /^[1-9][0-9]{0,19}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationPattern = /^[A-Za-z0-9_-]{8,128}$/;
const capabilities = new Set(['pro_listings', 'jam_hosting']);
const pools = new Map();
function error(status, message) { return Object.assign(new Error(message), {status}); }
function account(value) { if (typeof value !== 'string' || !accountPattern.test(value)) throw error(400, 'Invalid account ID.'); return value; }
function reason(value) { if (typeof value !== 'string' || !value.trim() || value.length > 500 || /[\x00-\x1f\x7f]/.test(value)) throw error(400, 'Invalid reason.'); return value.trim(); }
function operation(value) { if (typeof value !== 'string' || !operationPattern.test(value)) throw error(400, 'Invalid operation ID.'); return value; }
function expiry(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) throw error(400, 'Invalid expiry.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace('.000Z','Z') !== value.replace(/\.000Z$/, 'Z')) throw error(400, 'Invalid expiry.');
  return date.toISOString();
}
function dto(row) { return {id:row.id, targetId:row.target_id, capability:row.capability, source:row.source, createdAt:new Date(row.created_at).toISOString(), expiresAt:row.expires_at ? new Date(row.expires_at).toISOString() : null, revokedAt:row.revoked_at ? new Date(row.revoked_at).toISOString() : null}; }
function unavailable() { return error(503, 'Entitlement storage is unavailable.'); }

export function createEntitlementStore(pool) {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function') throw new TypeError('A database pool is required.');
  async function read(sql, params) { try { return await pool.query(sql, params); } catch { throw unavailable(); } }
  async function resolve(targetId) {
    account(targetId);
    const {rows} = await read(`SELECT * FROM zero_entitlements.grants WHERE target_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC, id`, [targetId]);
    const grants = rows.map(dto);
    return {listingLimit:grants.some(g => g.capability === 'pro_listings') ? 10 : 1, jamHosting:grants.some(g => g.capability === 'jam_hosting'), grants};
  }
  async function list(targetId) {
    account(targetId);
    const [grants, audit] = await Promise.all([
      read('SELECT * FROM zero_entitlements.grants WHERE target_id=$1 ORDER BY created_at DESC, id', [targetId]),
      read('SELECT operation_id, grant_id, target_id, actor_id, action, reason, created_at FROM zero_entitlements.audit WHERE target_id=$1 ORDER BY created_at DESC, operation_id', [targetId])
    ]);
    return {grants:grants.rows.map(dto), audit:audit.rows.map(row => ({operationId:row.operation_id, grantId:row.grant_id, targetId:row.target_id, actorId:row.actor_id, action:row.action, reason:row.reason, createdAt:new Date(row.created_at).toISOString()}))};
  }
  async function mutate(request, apply) {
    const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    let client, discard = false, begun = false, commitStarted = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN'); begun = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('zero-entitlements:' || $1::text, 0))", [request.operationId]);
      const {rows:[existing]} = await client.query('SELECT request_hash, result FROM zero_entitlements.operations WHERE operation_id=$1', [request.operationId]);
      let result;
      if (existing) {
        if (existing.request_hash !== hash) throw error(409, 'Operation ID was already used for another request.');
        result = existing.result;
      } else {
        result = await apply(client);
        await client.query('INSERT INTO zero_entitlements.operations (operation_id, request_hash, result) VALUES ($1,$2,$3::jsonb)', [request.operationId, hash, JSON.stringify(result)]);
        await client.query('INSERT INTO zero_entitlements.audit (operation_id, grant_id, target_id, actor_id, action, reason) VALUES ($1,$2,$3,$4,$5,$6)', [request.operationId, result.id, result.targetId, request.actorId, request.action, request.reason]);
      }
      commitStarted = true;
      await client.query('COMMIT'); begun = false;
      return result;
    } catch (cause) {
      if (commitStarted) discard = true;
      else if (client && begun) { try { await client.query('ROLLBACK'); } catch { discard = true; } }
      if (cause?.status === 409 || cause?.status === 404) throw cause;
      throw unavailable();
    } finally { if (client) client.release(discard); }
  }
  async function grant({targetId, capability, expiresAt, reason:why, actorId, operationId} = {}) {
    account(targetId); account(actorId); operation(operationId); why = reason(why); expiresAt = expiry(expiresAt);
    if (!capabilities.has(capability)) throw error(400, 'Invalid capability.');
    const request = {action:'grant', targetId, capability, expiresAt, reason:why, actorId, operationId};
    return mutate(request, async client => {
      const {rows:[row]} = await client.query(`INSERT INTO zero_entitlements.grants (id,target_id,capability,source,expires_at) VALUES ($1,$2,$3,'manual',$4) RETURNING *`, [randomUUID(),targetId,capability,expiresAt]);
      return dto(row);
    });
  }
  async function revoke({grantId, reason:why, actorId, operationId} = {}) {
    account(actorId); operation(operationId); why = reason(why);
    if (typeof grantId !== 'string' || !uuidPattern.test(grantId)) throw error(400, 'Invalid grant ID.');
    grantId = grantId.toLowerCase();
    const request = {action:'revoke', grantId, reason:why, actorId, operationId};
    return mutate(request, async client => {
      const {rows:[row]} = await client.query('UPDATE zero_entitlements.grants SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING *', [grantId]);
      if (!row) throw error(404, 'Grant not found.');
      return dto(row);
    });
  }
  return {resolve,list,grant,revoke};
}

export function configuredEntitlementStore(env = process.env) {
  const connectionString = env.ZERO_ENTITLEMENTS_DATABASE_URL;
  if (connectionString === undefined || connectionString === '') return null;
  let url;
  try { url = new URL(connectionString); } catch { throw unavailable(); }
  const local = !env.VERCEL && ['development','test'].includes(env.NODE_ENV) && url.hostname === '127.0.0.1';
  if (url.protocol !== 'postgresql:' || !url.hostname || !url.username || !url.password || !url.pathname.slice(1) || url.search || url.hash) throw unavailable();
  const poolKey = `${local ? 'local' : 'tls'}:${connectionString}`;
  if (!pools.has(poolKey)) {
    const pool = new Pool({connectionString, ssl:local ? false : {rejectUnauthorized:true}, max:4, connectionTimeoutMillis:2500, idleTimeoutMillis:10000, statement_timeout:2500, idle_in_transaction_session_timeout:5000});
    pool.on('error', () => {});
    pools.set(poolKey, createEntitlementStore(pool));
  }
  return pools.get(poolKey);
}
