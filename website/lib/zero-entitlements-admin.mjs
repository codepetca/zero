import {listingLimit} from './hub-listings-store.mjs';
import {hasManualJamPro} from '../../jams/entitlements.mjs';
import {boundedJson, equalSecret, githubUser, hubConfig, json, managedHubAvailable, readSession, sameOrigin} from './hub-github-auth.mjs';

const OWNER = '4050555';
const account = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const grantId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reason = value => typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);
const capabilities = new Set(['pro_listings', 'jam_hosting']);
const exact = (body, keys) => body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));
const unavailable = () => json({error:'Entitlement administration is unavailable. Try again.'}, 503);
const invalid = () => json({error:'Invalid entitlement request.'}, 400);
const project = (row, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));

// Injectable dependencies are for local tests. Production route supplies only the store factory.
/** @param {Request} request @param {any} options */
export async function entitlementAdminResponse(request, {getStore, env = process.env, now = Date.now,
  read = readSession, github = githubUser} = {}) {
  try {
    const config = hubConfig(env);
    if (!config || !managedHubAvailable(config, env)) return unavailable();
    const session = await read(request, config, now(), env);
    if (!session || !session.workos) return json({error:'Sign in with your Zero account.'}, 401);
    if (session.id !== OWNER) return json({error:'Access denied.'}, 403);
    if (request.method === 'POST' && (!sameOrigin(request, config) || !equalSecret(request.headers.get('x-hub-csrf'), session.csrf)))
      return json({error:'Your session changed. Reload and try again.'}, 403);
    // Revalidate the GitHub grant even for reads; readSession verifies WorkOS and rejects impersonation.
    const user = await github(session.token);
    if (String(user?.id) !== OWNER || String(user?.id) !== session.id)
      return json({error:'Your GitHub account changed. Sign in again.'}, 401);
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => key !== 'accountId') || params.getAll('accountId').length > 1) return invalid();
      const targetId = params.get('accountId');
      if (targetId === null) return json({csrfToken:session.csrf});
      if (!account(targetId)) return invalid();
      const store = await getStore?.(env);
      if (!store) return unavailable();
      const result = await store.list(targetId);
      const resolved = result?.access;
      if (![1,10].includes(resolved?.listingLimit) || typeof resolved?.jamHosting !== 'boolean') throw new Error('Invalid entitlement resolution');
      const legacyListings = listingLimit(targetId, env) === 10;
      const legacyJamHosting = hasManualJamPro(targetId, env);
      if (!Array.isArray(result?.grants) || !Array.isArray(result?.audit)) throw new Error('Invalid store response');
      return json({access:{listingLimit:legacyListings ? 10 : resolved.listingLimit, jamHosting:legacyJamHosting || resolved.jamHosting, legacyListings, legacyJamHosting}, grants:result.grants.map(row => project(row,['id','grantId','targetId','capability','expiresAt','createdAt','revokedAt','source'])),
        audit:result.audit.map(row => project(row,['operationId','grantId','targetId','action','actorId','reason','createdAt']))});
    }
    if (request.method !== 'POST') return json({error:'Method not allowed.'}, 405, {'Allow':'GET, POST'});
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return json({error:'Expected JSON.'}, 415);
    let body;
    try { body = await boundedJson(request, 4096); } catch { return invalid(); }
    if (!identifier(body?.operationId) || !reason(body?.reason)) return invalid();
    let input;
    if (body.action === 'grant') {
      if (!exact(body,['action','targetId','capability','expiresAt','reason','operationId']) || !account(body.targetId) || !capabilities.has(body.capability) ||
          !(body.expiresAt === null || typeof body.expiresAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.expiresAt) &&
          Number.isFinite(Date.parse(body.expiresAt)) && new Date(body.expiresAt).toISOString() === body.expiresAt)) return invalid();
      input = {targetId:body.targetId, capability:body.capability, expiresAt:body.expiresAt, reason:body.reason, actorId:OWNER, operationId:body.operationId};
    } else if (body.action === 'revoke') {
      if (!exact(body,['action','grantId','reason','operationId']) || !grantId(body.grantId)) return invalid();
      input = {grantId:body.grantId, reason:body.reason, actorId:OWNER, operationId:body.operationId};
    } else return invalid();
    const store = await getStore?.(env);
    if (!store) return unavailable();
    try {
      if (body.action === 'grant') await store.grant(input); else await store.revoke(input);
    } catch (error) {
      if ([400,404,409].includes(error?.status)) return json({error:'The action could not be applied. Refresh the account and try again.'}, error.status);
      throw error;
    }
    return json({ok:true});
  } catch { return unavailable(); }
}
