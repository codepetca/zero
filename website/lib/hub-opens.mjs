import {resolveHubProject} from './hub-project-status.mjs';

/** Aggregate Play activations only. No account, cookie, IP or event log. */
export const openId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(id);
const key = id => `zero:hub:opens:v1:${id}`;

export function opensConfiguration(env = process.env) {
  // Preview traffic must never change production counts, even with copied env.
  if (env.ZERO_HUB_OPENS_DISABLED === '1' || env.VERCEL && env.VERCEL_ENV !== 'production') return null;
  // Native Vercel Marketplace injects KV_REST_API_*. An explicit Zero pair
  // overrides it as a pair; never mix credentials from different databases.
  const explicit = env.ZERO_HUB_OPENS_REDIS_URL !== undefined || env.ZERO_HUB_OPENS_REDIS_TOKEN !== undefined;
  const endpoint = explicit ? env.ZERO_HUB_OPENS_REDIS_URL : env.KV_REST_API_URL;
  const token = explicit ? env.ZERO_HUB_OPENS_REDIS_TOKEN : env.KV_REST_API_TOKEN;
  if (!endpoint || !token || token.length > 4096 || /\s/.test(token)) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname) ||
        url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return {endpoint: url.origin, token};
  } catch { return null; }
}

export function createOpensStore({env = process.env, fetchImpl = fetch} = {}) {
  const configuration = opensConfiguration(env);
  if (!configuration) return null;
  async function command(parts) {
    const response = await fetchImpl(configuration.endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(1500),
      headers: {'Authorization': `Bearer ${configuration.token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(parts),
    });
    try {
      if (!response.ok || response.redirected) throw new Error('Open counts unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Open counts unavailable');
      const chunks = []; let length = 0;
      try {
        while (true) {
          const {done, value} = await reader.read(); if (done) break;
          length += value.byteLength;
          if (length > 4096) throw new Error('Open counts unavailable');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (data.error || !Object.hasOwn(data, 'result')) throw new Error('Open counts unavailable');
      return data.result;
    } finally { await response.body?.cancel().catch(() => {}); }
  }
  return {
    async increment(id) {
      if (!openId(id)) throw new Error('Invalid project');
      // Atomic INCR; never retry an uncertain write, which could double count.
      const count = await command(['INCR', key(id)]);
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Open counts unavailable');
      return count;
    },
    async counts(ids) {
      if (!ids.length || ids.length > 12 || !ids.every(openId)) throw new Error('Invalid projects');
      const values = await command(['MGET', ...ids.map(key)]);
      if (!Array.isArray(values) || values.length !== ids.length) throw new Error('Open counts unavailable');
      return Object.fromEntries(ids.map((id, index) => {
        const value = values[index];
        const count = value === null ? 0 : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Open counts unavailable');
        return [id, count];
      }));
    },
  };
}

function allowedOrigin(request, env) {
  const configured = env.ZERO_HUB_ORIGIN || 'https://zero.codepet.ca';
  const url = new URL(request.url);
  const local = env.NODE_ENV !== 'production' && !env.VERCEL &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(configured);
  return (configured === 'https://zero.codepet.ca' || local) &&
    url.origin === configured && request.headers.get('origin') === configured &&
    (!request.headers.get('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin');
}

export async function recordOpen(request, {env = process.env, store = createOpensStore({env}), resolve = resolveHubProject} = {}) {
  const reply = status => new Response(null, {status, headers: {'Cache-Control': 'no-store'}});
  if (!allowedOrigin(request, env)) return reply(403);
  if (!store) return reply(204);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415);
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  let id;
  try {
    const chunks = []; let length = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.length; if (length > 256) return reply(413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Object.keys(data).length !== 1 || !openId(data.id)) return reply(400);
    id = data.id;
  } catch { return reply(400); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try {
    const target = await resolve({kind: 'game', id});
    if (!target?.playUrl) return reply(404);
    await store.increment(id);
    return reply(204);
  } catch { return reply(503); }
}
