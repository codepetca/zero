import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {hubGitHubGrantStore} from './hub-github-grant-store.mjs';
import {workosConfigured, workosRequested, workosSessionIdentity} from './workos-config.mjs';

export const SESSION_COOKIE = 'zero_hub_gh_session';
export const FLOW_COOKIE = 'zero_hub_gh_flow';
const OAUTH_AGE_MS = 10 * 60 * 1000;
const SESSION_AGE_MS = 8 * 60 * 60 * 1000;
const MANAGED_SESSION_PURPOSE = 'workos-session';
const MANAGED_GRANT_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 20_000;
const REFRESH_WAIT_MS = 5_000;
const GRANT_REFERENCE_PURPOSE = 'workos-grant-reference';
const grantReferencePattern = /^[A-Za-z0-9_-]{43}$/;
const accessTokenPattern = /^ghu_[A-Za-z0-9_]{10,512}$/;
const refreshTokenPattern = /^ghr_[A-Za-z0-9_]{10,512}$/;
const storedGrants = new WeakMap();
const GITHUB_API_VERSION = '2026-03-10';

const noStore = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;

export function sharedAppMatches(clientId, configuration = zeroApp) {
  return configuration.status === 'unconfigured' || configuration.status === 'configured' && configuration.clientId === clientId;
}

export function hubConfig(env = process.env) {
  const originText = env.ZERO_HUB_ORIGIN || 'https://zero.codepet.ca';
  let origin;
  try {
    const url = new URL(originText);
    const local = (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && !env.VERCEL &&
      url.protocol === 'http:' && url.port && (url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost' && workosConfigured(env) &&
        url.origin === new URL(env.NEXT_PUBLIC_WORKOS_REDIRECT_URI).origin);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) return null;
    origin = url.origin;
  } catch { return null; }
  const clientId = env.ZERO_HUB_GITHUB_CLIENT_ID;
  const clientSecret = env.ZERO_HUB_GITHUB_CLIENT_SECRET;
  const secret = env.ZERO_HUB_GITHUB_SESSION_SECRET;
  if (!clientId || !sharedAppMatches(clientId) || !/^[A-Za-z0-9_-]{10,128}$/.test(clientId) || !clientSecret ||
    !/^[\x21-\x7e]{20,256}$/.test(clientSecret) || !secret) return null;
  let key;
  if (/^[a-fA-F0-9]{64}$/.test(secret)) key = Buffer.from(secret, 'hex');
  else if (/^[A-Za-z0-9_-]{43}$/.test(secret)) key = Buffer.from(secret, 'base64url');
  if (!key || key.length !== 32) return null;
  return {origin, clientId, clientSecret, key, secure: origin.startsWith('https:')};
}

export function managedHubAvailable(config, env = process.env) {
  return !!config && workosConfigured(env) &&
    config.origin === new URL(env.NEXT_PUBLIC_WORKOS_REDIRECT_URI).origin;
}

export function safeHubReturnTo(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') ||
    value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/hub';
  try {
    const url = new URL(value, 'https://zero.codepet.ca');
    if (url.origin !== 'https://zero.codepet.ca' ||
      (url.pathname !== '/hub' && !url.pathname.startsWith('/hub/'))) return '/hub';
    return url.pathname + url.search;
  } catch { return '/hub'; }
}

export function sameOrigin(request, config) {
  const origin = request.headers.get('origin');
  return !!origin && origin === config.origin;
}

export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !tokenPattern.test(a) || !tokenPattern.test(b)) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function seal(payload, purpose, config) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.key, iv);
  cipher.setAAD(Buffer.from(`zero-hub:${purpose}:v1`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function unseal(value, purpose, config) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,4096}$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', config.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`zero-hub:${purpose}:v1`));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { return null; }
}

export function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const found = cookie.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  return found.length === 1 ? found[0].slice(name.length + 1) : null;
}

export function cookieHeader(name, value, config, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${config.secure ? 'Secure; ' : ''}Priority=High`;
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers: {...noStore, ...headers}});
}

export function redirect(location, cookies = []) {
  const headers = new Headers({...noStore, Location: location});
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, {status: 303, headers});
}

export function errorReturn(config, returnTo, code, cookies = []) {
  const url = new URL(safeHubReturnTo(returnTo), config.origin);
  url.searchParams.set('github', code);
  return redirect(url.toString(), cookies);
}

export function newFlow(returnTo, config, now = Date.now()) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const cookie = cookieHeader(FLOW_COOKIE,
    seal({state, verifier, returnTo: safeHubReturnTo(returnTo), expiresAt: now + OAUTH_AGE_MS}, 'flow', config),
    config, OAUTH_AGE_MS / 1000);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', `${config.origin}/api/hub/github/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return {url: url.toString(), cookie};
}

export function readFlow(request, config, now = Date.now()) {
  const flow = unseal(readCookie(request, FLOW_COOKIE), 'flow', config);
  return flow && tokenPattern.test(flow.state) && tokenPattern.test(flow.verifier) &&
    Number.isSafeInteger(flow.expiresAt) && flow.expiresAt > now && flow.expiresAt <= now + OAUTH_AGE_MS &&
    safeHubReturnTo(flow.returnTo) === flow.returnTo ? flow : null;
}

function validSession(session) {
  return session && typeof session.id === 'string' && /^[1-9][0-9]{0,19}$/.test(session.id) &&
    typeof session.login === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(session.login) &&
    typeof session.token === 'string' && accessTokenPattern.test(session.token) &&
    tokenPattern.test(session.csrf) && Number.isSafeInteger(session.expiresAt);
}

async function activeWorkOSIdentity(request, config, env, now) {
  if (!managedHubAvailable(config, env) || !readCookie(request, env.WORKOS_COOKIE_NAME)) return null;
  // The AuthKit proxy verifies the token and strips client-injected session headers.
  try {
    const {withAuth, getTokenClaims} = await import('@workos-inc/authkit-nextjs');
    const auth = await withAuth();
    if (!auth.user || auth.impersonator != null || !auth.accessToken) return null;
    const claims = await getTokenClaims(auth.accessToken);
    const identity = workosSessionIdentity(claims, auth.user.id, env.WORKOS_ISSUER, now);
    return identity?.sessionId === auth.sessionId ? {...identity, validUntil:claims.exp * 1000} : null;
  } catch { return null; }
}

function matchesWorkOSUser(session, identity) {
  return !!identity && session.workos?.userId === identity.userId && session.workos?.issuer === identity.issuer;
}

function matchesWorkOS(session, identity) {
  return matchesWorkOSUser(session, identity) && session.workos.sessionId === identity.sessionId;
}

function openGrantReference(cookie, config) {
  if (!cookie?.startsWith('v2.')) return null;
  const pointer = unseal(cookie.slice(3), GRANT_REFERENCE_PURPOSE, config);
  return typeof pointer?.reference === 'string' && grantReferencePattern.test(pointer.reference) ? pointer : null;
}

function liveGrantReference(cookie, config, now) {
  const pointer = openGrantReference(cookie, config);
  return pointer && Number.isSafeInteger(pointer.expiresAt) && pointer.expiresAt > now &&
    pointer.expiresAt <= now + MANAGED_GRANT_AGE_MS ? pointer : null;
}

export async function readSession(request, config, now = Date.now(), env = process.env, fetchImpl = fetch) {
  const managed = workosRequested(env);
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return null;
  if (managed && cookie.startsWith('v2.')) {
    const pointer = liveGrantReference(cookie, config, now);
    if (!pointer) return null;
    const started = performance.now();
    const identity = await activeWorkOSIdentity(request, config, env, now);
    return identity && matchesWorkOS(pointer, identity) ?
      readManagedGrant(pointer, identity, config, env, now, started, fetchImpl, request.signal) : null;
  }
  const session = unseal(cookie, managed ? MANAGED_SESSION_PURPOSE : 'session', config);
  if (!validSession(session) || session.expiresAt <= now || session.expiresAt > now + SESSION_AGE_MS) return null;
  if (!managed) return session;
  const identity = await activeWorkOSIdentity(request, config, env, now);
  return identity && matchesWorkOS(session, identity) ? session : null;
}

const RESTORE_REJECTED = Symbol('saved GitHub connection cannot be restored');
const grantPurpose = reference => `workos-grant:${reference}`;

function validStoredGrant(grant, pointer, now) {
  return validSession(grant) && matchesWorkOSUser(grant, pointer.workos) &&
    grant.grantExpiresAt === pointer.expiresAt && grant.grantExpiresAt > now &&
    typeof grant.refreshToken === 'string' && refreshTokenPattern.test(grant.refreshToken);
}

function managedGrantCookie(session, reference, expiresAt, config, now) {
  const pointer = seal({reference, workos:session.workos, expiresAt}, GRANT_REFERENCE_PURPOSE, config);
  return cookieHeader(SESSION_COOKIE, `v2.${pointer}`, config, Math.floor((expiresAt - now) / 1000));
}

async function restoreManagedGrant(store, pointer, grant, refreshToken, config, now) {
  const {reference} = pointer;
  const purpose = grantPurpose(reference);
  const started = performance.now();
  for (;;) {
    const sealed = await store.read(reference);
    const elapsed = Math.floor(performance.now() - started);
    const checkedAt = now + elapsed;
    const previous = unseal(sealed, purpose, config);
    if (!validStoredGrant(previous, pointer, checkedAt)) return RESTORE_REJECTED;
    if (previous.id !== grant.session.id) return null;
    if (elapsed >= REFRESH_WAIT_MS) throw new Error('GitHub connection renewal is busy');
    if (!(previous.refreshAfter > checkedAt)) {
      // The callback verified both accounts. Use its fresh access token and
      // keep the saved refresh token when AuthKit omitted a replacement.
      const record = {...grant.session, refreshToken:refreshToken ?? previous.refreshToken,
        grantExpiresAt:pointer.expiresAt};
      if (await store.replace(reference, sealed, seal(record, purpose, config))) {
        const finishedAt = now + Math.floor(performance.now() - started);
        if (pointer.expiresAt - finishedAt < 1000) return RESTORE_REJECTED;
        return {...grant, cookie:managedGrantCookie(grant.session, reference, pointer.expiresAt, config, finishedAt)};
      }
    }
    await delay(350);
  }
}

export async function persistManagedSession(grant, refreshToken, config, env, fetchImpl, now, {previousCookie = null} = {}) {
  const store = hubGitHubGrantStore(env, fetchImpl);
  if (!store) return grant;
  const refresh = typeof refreshToken === 'string' && refreshTokenPattern.test(refreshToken) ? refreshToken : null;
  try {
    const previous = liveGrantReference(previousCookie, config, now);
    if (previous && matchesWorkOSUser(previous, grant.session.workos)) {
      const restored = await restoreManagedGrant(store, previous, grant, refresh, config, now);
      if (restored === RESTORE_REJECTED) return grant;
      if (restored) return restored;
    }
    if (!refresh) return grant;
    const reference = randomBytes(32).toString('base64url');
    const grantExpiresAt = now + MANAGED_GRANT_AGE_MS;
    const record = {...grant.session, refreshToken:refresh, grantExpiresAt};
    if (await store.create(reference, seal(record, grantPurpose(reference), config), grantExpiresAt)) {
      return {...grant, cookie:managedGrantCookie(grant.session, reference, grantExpiresAt, config, now)};
    }
  } catch { /* Keep the verified short session if the store is unavailable. */ }
  return grant;
}

async function readManagedGrant(pointer, identity, config, env, now, started, fetchImpl, signal) {
  const store = hubGitHubGrantStore(env, fetchImpl);
  if (!store) throw new Error('GitHub connection storage is unavailable');
  const {reference} = pointer;
  const purpose = grantPurpose(reference);
  for (;;) {
    const sealed = await store.read(reference);
    const grant = unseal(sealed, purpose, config);
    const elapsed = Math.floor(performance.now() - started);
    const checkedAt = now + elapsed;
    if (!validStoredGrant(grant, pointer, checkedAt) || !matchesWorkOS(grant, identity) ||
        checkedAt >= identity.validUntil) return null;
    if (grant.expiresAt > checkedAt && !(grant.refreshAfter > checkedAt)) {
      return authorizedGrant(grant, store, reference, sealed);
    }
    if (signal.aborted || elapsed >= REFRESH_WAIT_MS) throw new Error('GitHub connection renewal is busy');
    if (!(grant.refreshAfter > checkedAt)) {
      const claimed = seal({...grant, refreshAfter:checkedAt + REFRESH_LEASE_MS}, purpose, config);
      if (await store.replace(reference, sealed, claimed)) {
        // The claim is shared across server instances. GitHub invalidates the
        // previous pair on rotation, so only the winner can exchange it.
        const next = await renewManagedGrant(grant, config, fetchImpl, checkedAt);
        const replacement = next && seal(next, purpose, config);
        const saved = await store.replace(reference, claimed, replacement);
        // Sign-out or expiry can remove the grant while GitHub is responding.
        const finishedAt = now + Math.floor(performance.now() - started);
        return saved && next && finishedAt < Math.min(identity.validUntil, next.grantExpiresAt, next.expiresAt) ?
          authorizedGrant(next, store, reference, replacement) : null;
      }
    }
    await delay(350, undefined, {signal});
  }
}

function authorizedGrant(grant, store, reference, sealed) {
  const {id, login, token, csrf, expiresAt, workos} = grant;
  const session = {id, login, token, csrf, expiresAt, workos};
  storedGrants.set(session, {store, reference, sealed});
  return session;
}

async function renewManagedGrant(grant, config, fetchImpl, now) {
  const {status, data} = await githubTokenRequest({
    grant_type:'refresh_token', refresh_token:grant.refreshToken
  }, config, fetchImpl, AbortSignal.timeout(4000));
  if ((status === 200 || status === 400 || status === 401) && data?.error === 'bad_refresh_token') return null;
  if (status !== 200 || data?.error || typeof data?.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' ||
      typeof data.access_token !== 'string' || !accessTokenPattern.test(data.access_token) ||
      typeof data.refresh_token !== 'string' || !refreshTokenPattern.test(data.refresh_token) ||
      !Number.isSafeInteger(data.expires_in) || data.expires_in <= 60 || data.expires_in > SESSION_AGE_MS / 1000 ||
      !Number.isSafeInteger(data.refresh_token_expires_in) || data.refresh_token_expires_in <= 0)
    throw new Error('Could not renew GitHub connection');
  const {refreshAfter, ...active} = grant;
  return {...active, token:data.access_token, refreshToken:data.refresh_token, expiresAt:now + data.expires_in * 1000 - 60_000};
}

export async function removeManagedGitHubGrant(request, env = process.env) {
  const config = hubConfig(env);
  const pointer = config && openGrantReference(readCookie(request, SESSION_COOKIE), config);
  const store = pointer && hubGitHubGrantStore(env);
  if (store) {
    try { await store.remove(pointer.reference); }
    catch { /* Sign-out still clears the browser cookies and ends the WorkOS session. */ }
  }
}

export async function updatedGitHubSession(request, session, config, now, env) {
  if (!storedGrants.has(session)) return null;
  const current = await readSession(request, config, now, env);
  return current && current.id === session.id && current.csrf === session.csrf && current.token !== session.token ? current : null;
}

export async function rejectedGitHubSession(session, config) {
  const stored = storedGrants.get(session);
  if (!stored) return {'Set-Cookie':cookieHeader(SESSION_COOKIE, '', config, 0)};
  // A delayed 401 for an older token must not remove a newer grant or cookie.
  try { await stored.store.replace(stored.reference, stored.sealed, null); } catch { /* Report the original 401. */ }
  return {};
}

export function newSession(token, user, tokenExpiresIn, config, now = Date.now()) {
  return createSession(token, user, tokenExpiresIn, config, now);
}

export function newManagedSession(token, user, tokenExpiresIn, config, identity, now = Date.now()) {
  if (!identity || !Number.isSafeInteger(tokenExpiresIn) || tokenExpiresIn <= 0) throw new Error('Invalid managed session');
  return createSession(token, user, tokenExpiresIn, config, now, identity);
}

function createSession(token, user, tokenExpiresIn, config, now, workos) {
  if (!user || !Number.isSafeInteger(user.id) || user.id < 1 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user.login || '') ||
    typeof token !== 'string' || !accessTokenPattern.test(token)) throw new Error('Invalid GitHub identity');
  const tokenAge = Number.isSafeInteger(tokenExpiresIn) && tokenExpiresIn > 0 ? tokenExpiresIn * 1000 : SESSION_AGE_MS;
  const expiresAt = now + Math.min(SESSION_AGE_MS, tokenAge) - 60_000;
  if (expiresAt <= now) throw new Error('Expired GitHub token');
  const session = {id: String(user.id), login: user.login, token,
    csrf: randomBytes(32).toString('base64url'), expiresAt, ...(workos ? {workos} : {})};
  const purpose = workos ? MANAGED_SESSION_PURPOSE : 'session';
  return {session, cookie: cookieHeader(SESSION_COOKIE, seal(session, purpose, config), config,
    Math.floor((expiresAt - now) / 1000))};
}

export async function boundedJson(response, limit = 16_384) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty GitHub response');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Oversized GitHub response');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function githubJson(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(8000), ...options});
  return {status: response.status, data: await boundedJson(response)};
}

function githubTokenRequest(fields, config, fetchImpl, signal = AbortSignal.timeout(8000)) {
  return githubJson('https://github.com/login/oauth/access_token', {
    method:'POST', signal, headers:{Accept:'application/json', 'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:config.clientId, client_secret:config.clientSecret, ...fields}).toString()
  }, fetchImpl);
}

export async function exchangeCode(code, verifier, config, fetchImpl = fetch) {
  const {status, data} = await githubTokenRequest({
    code, redirect_uri:`${config.origin}/api/hub/github/callback`, code_verifier:verifier
  }, config, fetchImpl);
  if (status !== 200 || data.token_type?.toLowerCase() !== 'bearer' ||
    !/^ghu_[A-Za-z0-9_]{10,512}$/.test(data.access_token || '')) throw new Error('GitHub token exchange failed');
  return {token: data.access_token, expiresIn: data.expires_in};
}

export async function githubUser(token, fetchImpl = fetch) {
  const {status, data} = await githubJson('https://api.github.com/user', {
    headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION, 'User-Agent': 'ZeroHub'}
  }, fetchImpl);
  if (status !== 200) throw new Error('GitHub identity failed');
  return data;
}

export const githubApiHeaders = token => ({Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': GITHUB_API_VERSION, 'User-Agent': 'ZeroHub'});

export async function sessionResponse(request, env = process.env, now = Date.now(), fetchImpl = fetch) {
  const config = hubConfig(env);
  const managed = workosRequested(env);
  const configured = managed ? managedHubAvailable(config, env) : !!config;
  try {
    const session = configured ? await readSession(request, config, now, env, fetchImpl) : null;
    return json({configured, ...(managed ? {managed:true} : {}), user: session ?
      {id: session.id, login: session.login, csrfToken: session.csrf} : null});
  } catch {
    return json({error:'Could not check your GitHub connection.'}, 503);
  }
}

export function loginResponse(request, env = process.env, now = Date.now()) {
  const config = hubConfig(env);
  if (!config) return json({error: 'GitHub sign-in unavailable', configured: false}, 503);
  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get('returnTo') || '/hub';
  if (workosRequested(env)) {
    if (!managedHubAvailable(config, env)) return json({error: 'GitHub sign-in unavailable', configured: false}, 503);
    const url = new URL('/zero-account/sign-in', config.origin);
    const destination = new URL(safeHubReturnTo(returnTo), config.origin);
    destination.searchParams.delete('github');
    url.searchParams.set('returnTo', destination.pathname + destination.search);
    return redirect(url.toString());
  }
  const flow = newFlow(returnTo, config, now);
  return redirect(flow.url, [flow.cookie]);
}

export async function callbackResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = hubConfig(env);
  if (!config) return redirect('https://zero.codepet.ca/hub?github=unavailable');
  const clearFlow = cookieHeader(FLOW_COOKIE, '', config, 0);
  if (workosRequested(env)) return errorReturn(config, '/hub', 'unavailable', [clearFlow]);
  const flow = readFlow(request, config, now);
  const url = new URL(request.url);
  if (!flow) return errorReturn(config, '/hub', 'invalid', [clearFlow]);
  const state = url.searchParams.getAll('state');
  const code = url.searchParams.getAll('code');
  if (state.length !== 1 || !equalSecret(state[0], flow.state))
    return errorReturn(config, flow.returnTo, 'invalid', [clearFlow]);
  if (url.searchParams.has('error')) return errorReturn(config, flow.returnTo, 'denied', [clearFlow]);
  if (code.length !== 1 ||
    !/^[A-Za-z0-9_-]{10,256}$/.test(code[0]))
    return errorReturn(config, flow.returnTo, 'invalid', [clearFlow]);
  try {
    const exchanged = await exchangeCode(code[0], flow.verifier, config, fetchImpl);
    const user = await githubUser(exchanged.token, fetchImpl);
    const {cookie} = newSession(exchanged.token, user, exchanged.expiresIn, config, now);
    return redirect(new URL(flow.returnTo, config.origin).toString(), [clearFlow, cookie]);
  } catch {
    return errorReturn(config, flow.returnTo, 'failed', [clearFlow]);
  }
}

export async function logoutResponse(request, env = process.env, now = Date.now()) {
  const config = hubConfig(env);
  if (!config) return json({error: 'GitHub sign-in unavailable', configured: false}, 503);
  if (!sameOrigin(request, config)) return json({error: 'Invalid origin'}, 403);
  try {
    const session = await readSession(request, config, now, env);
    if (!session) return json({error: 'GitHub sign-in required'}, 401);
    if (!equalSecret(request.headers.get('x-hub-csrf'), session.csrf))
      return json({error: 'Invalid session token'}, 403);
    if (workosRequested(env)) return json({error: 'Sign out through your Zero account.'}, 409);
    return json({ok: true}, 200, {'Set-Cookie': cookieHeader(SESSION_COOKIE, '', config, 0)});
  } catch {
    return json({error:'Could not check your GitHub connection.'}, 503);
  }
}
