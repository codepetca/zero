import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';

export const SESSION_COOKIE = 'zero_hub_gh_session';
export const FLOW_COOKIE = 'zero_hub_gh_flow';
const OAUTH_AGE_MS = 10 * 60 * 1000;
const SESSION_AGE_MS = 8 * 60 * 60 * 1000;
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
      url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port;
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
  return {origin, clientId, clientSecret, key, secure: origin.startsWith('https:'),
    ...(env.VERCEL_ENV === 'preview' ? {sessionBinding:origin} : {})};
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
  cipher.setAAD(Buffer.from(`zero-hub:${purpose}:v1${config.sessionBinding ? `:${config.sessionBinding}` : ''}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function unseal(value, purpose, config) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,4096}$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', config.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`zero-hub:${purpose}:v1${config.sessionBinding ? `:${config.sessionBinding}` : ''}`));
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

export function readSession(request, config, now = Date.now()) {
  const session = unseal(readCookie(request, SESSION_COOKIE), 'session', config);
  return session && typeof session.id === 'string' && /^[1-9][0-9]{0,19}$/.test(session.id) &&
    typeof session.login === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(session.login) &&
    typeof session.token === 'string' && /^ghu_[A-Za-z0-9_]{10,512}$/.test(session.token) &&
    tokenPattern.test(session.csrf) && Number.isSafeInteger(session.expiresAt) &&
    session.expiresAt > now && session.expiresAt <= now + SESSION_AGE_MS ? session : null;
}

export function newSession(token, user, tokenExpiresIn, config, now = Date.now()) {
  if (!user || !Number.isSafeInteger(user.id) || user.id < 1 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user.login || '') ||
    typeof token !== 'string' || !/^ghu_[A-Za-z0-9_]{10,512}$/.test(token)) throw new Error('Invalid GitHub identity');
  const tokenAge = Number.isSafeInteger(tokenExpiresIn) && tokenExpiresIn > 0 ? tokenExpiresIn * 1000 : SESSION_AGE_MS;
  const expiresAt = now + Math.min(SESSION_AGE_MS, tokenAge) - 60_000;
  if (expiresAt <= now) throw new Error('Expired GitHub token');
  const session = {id: String(user.id), login: user.login, token,
    csrf: randomBytes(32).toString('base64url'), expiresAt};
  return {session, cookie: cookieHeader(SESSION_COOKIE, seal(session, 'session', config), config,
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

export async function exchangeCode(code, verifier, config, fetchImpl = fetch) {
  const {status, data} = await githubJson('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: {Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: config.clientId, client_secret: config.clientSecret,
      code, redirect_uri: `${config.origin}/api/hub/github/callback`, code_verifier: verifier}).toString()
  }, fetchImpl);
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

export function sessionResponse(request, env = process.env, now = Date.now()) {
  const config = hubConfig(env);
  const session = config && readSession(request, config, now);
  return json({configured: !!config, user: session ?
    {id: session.id, login: session.login, csrfToken: session.csrf} : null});
}

export function loginResponse(request, env = process.env, now = Date.now()) {
  const config = hubConfig(env);
  if (!config) return json({error: 'GitHub sign-in unavailable', configured: false}, 503);
  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get('returnTo') || '/hub';
  const flow = newFlow(returnTo, config, now);
  return redirect(flow.url, [flow.cookie]);
}

export async function callbackResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = hubConfig(env);
  if (!config) return redirect('https://zero.codepet.ca/hub?github=unavailable');
  const clearFlow = cookieHeader(FLOW_COOKIE, '', config, 0);
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

export function logoutResponse(request, env = process.env, now = Date.now()) {
  const config = hubConfig(env);
  if (!config) return json({error: 'GitHub sign-in unavailable', configured: false}, 503);
  if (!sameOrigin(request, config)) return json({error: 'Invalid origin'}, 403);
  const session = readSession(request, config, now);
  if (!session) return json({error: 'GitHub sign-in required'}, 401);
  if (!equalSecret(request.headers.get('x-hub-csrf'), session.csrf))
    return json({error: 'Invalid session token'}, 403);
  return json({ok: true}, 200, {'Set-Cookie': cookieHeader(SESSION_COOKIE, '', config, 0)});
}
