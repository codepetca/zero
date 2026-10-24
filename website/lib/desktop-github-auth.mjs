import zeroApp from '../../extension/src/github-app/config.json' with {type: 'json'};
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {githubJson, hubConfig, readCookie, seal, unseal} from './hub-github-auth.mjs';

const FLOW_AGE_MS = 10 * 60 * 1000;
const DELIVERY_AGE_MS = 2 * 60 * 1000;
const BODY_LIMIT = 8192;
const PATH = '/api/desktop/github';
const COOKIE_PREFIX = 'zero_desktop_gh_flow_';
const PURPOSE = {intent: 'desktop-intent', state: 'desktop-state', delivery: 'desktop-delivery'};
const URL_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-Za-z0-9_-]{10,256}$/;
const VERIFIER = /^[A-Za-z0-9_-]{43,128}$/;
const REFRESH_TOKEN = /^ghr_[A-Za-z0-9_]{10,512}$/;
const HEADERS = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};

// Desktop credentials are separate from ZeroHub browser sessions. The feature
// stays off until the separately approved server/App configuration is activated.
export function desktopConfig(env = process.env) {
  if (env.ZERO_DESKTOP_GITHUB_ENABLED !== '1' || zeroApp.status !== 'configured') return null;
  const config = hubConfig(env);
  if (!config || config.clientId !== zeroApp.clientId) return null;
  if (config.origin !== 'https://zero.codepet.ca' && config.secure) return null;
  return config;
}

const json = (data, status = 200) => Response.json(data, {status, headers: HEADERS});
const unavailable = () => json({error: 'GitHub sign-in unavailable', configured: false}, 503);
const invalid = (status = 400) => json({error: 'Invalid sign-in request'}, status);
const failed = () => json({error: 'GitHub sign-in failed'}, 502);
const hash = value => createHash('sha256').update(value).digest('base64url');
const randomToken = () => randomBytes(32).toString('base64url');
function equal(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function shape(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function age(value, duration, now) {
  return Number.isSafeInteger(value.issuedAt) && value.issuedAt >= 0 && value.issuedAt <= now &&
    Number.isSafeInteger(value.expiresAt) && value.expiresAt > now &&
    value.expiresAt > value.issuedAt && value.expiresAt <= value.issuedAt + duration;
}
function open(value, purpose, config) {
  // Reject noncanonical encodings too, including modified unused base64 bits.
  if (typeof value !== 'string' || value.length > 4096 ||
    Buffer.from(value, 'base64url').toString('base64url') !== value) return null;
  return unseal(value, purpose, config);
}
function readIntent(ticket, config, now, state = false) {
  const intent = open(ticket, state ? PURPOSE.state : PURPOSE.intent, config);
  const keys = ['flowId', 'port', 'nonce', 'codeChallenge', 'clientId', 'issuedAt', 'expiresAt'];
  if (state) keys.push('csrf');
  return shape(intent, keys) && typeof intent.flowId === 'string' && URL_TOKEN.test(intent.flowId) &&
    Number.isInteger(intent.port) && intent.port >= 1024 && intent.port <= 65535 &&
    typeof intent.nonce === 'string' && URL_TOKEN.test(intent.nonce) &&
    typeof intent.codeChallenge === 'string' && URL_TOKEN.test(intent.codeChallenge) &&
    intent.clientId === config.clientId && age(intent, FLOW_AGE_MS, now) &&
    (!state || typeof intent.csrf === 'string' && URL_TOKEN.test(intent.csrf)) ? intent : null;
}
function flowCookie(flowId, value, config, maxAge) {
  return `${COOKIE_PREFIX}${flowId}=${value}; Path=${PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${config.secure ? 'Secure; ' : ''}Priority=High`;
}
function redirect(location, cookie) {
  const headers = new Headers({...HEADERS, Location: location});
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, {status: 303, headers});
}

// All accepted request objects contain only primitive fields. Inspect top-level
// JSON keys after parsing so duplicate keys cannot acquire last-value semantics.
function hasDuplicateKeys(text) {
  const keys = new Set();
  let depth = 0, expectingKey = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const start = i;
      for (i++; i < text.length; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '"') break;
      }
      if (depth === 1 && expectingKey) {
        const key = JSON.parse(text.slice(start, i + 1));
        if (keys.has(key)) return true;
        keys.add(key);
        expectingKey = false;
      }
    } else if (ch === '{' || ch === '[') {
      depth++;
      if (depth === 1 && ch === '{') expectingKey = true;
    } else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 1) expectingKey = true;
  }
  return false;
}
async function readPost(request, config) {
  if (request.method !== 'POST') return {error: invalid(405)};
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== config.origin) return {error: invalid(403)};
  if (request.headers.get('x-zero-desktop') !== '1' ||
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return {error: invalid(403)};
  const length = request.headers.get('content-length');
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > BODY_LIMIT))
    return {error: invalid(413)};
  const reader = request.body?.getReader();
  if (!reader) return {error: invalid()};
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) return {error: invalid(413)};
      chunks.push(value);
    }
    const text = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
    const data = JSON.parse(text);
    return hasDuplicateKeys(text) ? {error: invalid()} : {data};
  } catch { return {error: invalid()}; }
  finally { await reader.cancel().catch(() => {}); }
}

export async function startResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = desktopConfig(env);
  if (!config) return unavailable();
  const body = await readPost(request, config);
  if (body.error) return body.error;
  const data = body.data;
  if (!shape(data, ['port', 'nonce', 'codeChallenge']) ||
    !Number.isInteger(data.port) || data.port < 1024 || data.port > 65535 ||
    typeof data.nonce !== 'string' || !URL_TOKEN.test(data.nonce) ||
    typeof data.codeChallenge !== 'string' || !URL_TOKEN.test(data.codeChallenge)) return invalid();
  const intent = {...data, flowId: randomToken(), clientId: config.clientId,
    issuedAt: now, expiresAt: now + FLOW_AGE_MS};
  const url = new URL(`${PATH}/login`, config.origin);
  url.searchParams.set('ticket', seal(intent, PURPOSE.intent, config));
  return json({url: url.toString(), clientId: config.clientId});
}

export function loginResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = desktopConfig(env);
  if (!config) return unavailable();
  if (request.method !== 'GET') return invalid(405);
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || params.getAll('ticket').length !== 1) return invalid();
  const intent = readIntent(params.get('ticket'), config, now);
  if (!intent) return invalid();
  const csrf = randomToken();
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', `${config.origin}${PATH}/callback`);
  url.searchParams.set('state', seal({...intent, csrf}, PURPOSE.state, config));
  url.searchParams.set('code_challenge', intent.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'offline_access');
  // A local sign-out cannot change the browser's GitHub account. Keep the
  // existing Change GitHub account command able to select a different user.
  url.searchParams.set('prompt', 'select_account');
  return redirect(url.toString(), flowCookie(intent.flowId, csrf, config,
    Math.floor((intent.expiresAt - now) / 1000)));
}

export function callbackResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = desktopConfig(env);
  if (!config) return unavailable();
  if (request.method !== 'GET') return invalid(405);
  const params = new URL(request.url).searchParams;
  if (params.getAll('state').length !== 1) return invalid();
  const state = readIntent(params.get('state'), config, now, true);
  if (!state) return invalid();
  const clear = flowCookie(state.flowId, '', config, 0);
  if (!equal(readCookie(request, `${COOKIE_PREFIX}${state.flowId}`), state.csrf)) {
    const response = invalid();
    response.headers.set('Set-Cookie', clear);
    return response;
  }
  const codes = params.getAll('code'), errors = params.getAll('error');
  const url = new URL(`http://127.0.0.1:${state.port}/github/${state.nonce}`);
  if (errors.length === 1 && errors[0] === 'access_denied' && codes.length === 0) {
    url.searchParams.set('error', 'denied');
    return redirect(url.toString(), clear);
  }
  if (errors.length || codes.length !== 1 || !CODE.test(codes[0])) {
    const response = invalid();
    response.headers.set('Set-Cookie', clear);
    return response;
  }
  const delivery = {codeChallenge: state.codeChallenge, codeHash: hash(codes[0]),
    nonce: state.nonce, clientId: config.clientId, issuedAt: now, expiresAt: now + DELIVERY_AGE_MS};
  url.searchParams.set('code', codes[0]);
  url.searchParams.set('ticket', seal(delivery, PURPOSE.delivery, config));
  return redirect(url.toString(), clear);
}

function tokenPair(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.hasOwn(data, 'error') ||
    typeof data.access_token !== 'string' || !/^ghu_[A-Za-z0-9_]{10,512}$/.test(data.access_token) ||
    typeof data.refresh_token !== 'string' || !REFRESH_TOKEN.test(data.refresh_token) ||
    typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' || data.scope !== '' ||
    !Number.isSafeInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 28800 ||
    !Number.isSafeInteger(data.refresh_token_expires_in) || data.refresh_token_expires_in < 1 ||
    data.refresh_token_expires_in > 15897600) return null;
  const {access_token, refresh_token, token_type, scope, expires_in, refresh_token_expires_in} = data;
  return {access_token, refresh_token, token_type, scope, expires_in, refresh_token_expires_in};
}
async function requestToken(fields, config, fetchImpl) {
  try {
    const {status, data} = await githubJson('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: {Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({client_id: config.clientId, client_secret: config.clientSecret, ...fields}).toString()
    }, fetchImpl);
    const pair = status === 200 && tokenPair(data);
    return pair ? json(pair) : failed();
  } catch { return failed(); }
}

export async function exchangeResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = desktopConfig(env);
  if (!config) return unavailable();
  const body = await readPost(request, config);
  if (body.error) return body.error;
  const data = body.data;
  if (!shape(data, ['code', 'codeVerifier', 'ticket']) || typeof data.code !== 'string' || !CODE.test(data.code) ||
    typeof data.codeVerifier !== 'string' || !VERIFIER.test(data.codeVerifier)) return invalid();
  const delivery = open(data.ticket, PURPOSE.delivery, config);
  if (!shape(delivery, ['codeChallenge', 'codeHash', 'nonce', 'clientId', 'issuedAt', 'expiresAt']) ||
    typeof delivery.nonce !== 'string' || !URL_TOKEN.test(delivery.nonce) || delivery.clientId !== config.clientId ||
    !age(delivery, DELIVERY_AGE_MS, now) || !equal(hash(data.code), delivery.codeHash) ||
    !equal(hash(data.codeVerifier), delivery.codeChallenge)) return invalid();
  // GitHub enforces one-use OAuth codes and PKCE. There is deliberately no local
  // durable replay registry; a repeated delivery still cannot mint a second pair.
  return requestToken({code: data.code, code_verifier: data.codeVerifier,
    redirect_uri: `${config.origin}${PATH}/callback`}, config, fetchImpl);
}

export async function refreshResponse(request, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const config = desktopConfig(env);
  if (!config) return unavailable();
  const body = await readPost(request, config);
  if (body.error) return body.error;
  if (!shape(body.data, ['refreshToken']) || typeof body.data.refreshToken !== 'string' ||
    !REFRESH_TOKEN.test(body.data.refreshToken)) return invalid();
  return requestToken({grant_type: 'refresh_token', refresh_token: body.data.refreshToken}, config, fetchImpl);
}
