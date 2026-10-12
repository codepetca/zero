/** Server-only fixed-destination hub gateway. Never imported by client components. */
export function hubDestination(value) {
  if (!value) return null;
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) throw new Error('Invalid ZERO_HUB_URL. Use a fixed HTTPS origin or local loopback HTTP origin.');
  return url;
}
export function hubPath(parts, method) {
  if (!Array.isArray(parts) || parts.some(p => !/^[A-Za-z0-9._-]+$/.test(p) || p === '.' || p === '..')) return null;
  const path = parts.join('/');
  const read = /^(catalog|session|auth\/(start|callback)|libraries\/ui[1-9a-z][0-9a-z]*|submissions\/[A-Za-z0-9_-]+|previews\/ui[1-9a-z][0-9a-z]*\/\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?\.png)$/;
  const maven = /^maven\/ca\/codepet\/zero\/library\/ui[1-9a-z][0-9a-z]*\/\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?\/[A-Za-z0-9._-]+\.(jar|pom|sha256|sha1)$/;
  if ((method === 'GET' || method === 'HEAD') && (read.test(path) || maven.test(path))) return path;
  if (method === 'POST' && /^(libraries|submissions|logout)$/.test(path)) return path;
  return null;
}
export async function boundedBytes(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader(); const chunks = []; let size = 0; let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel(); }, 15000);
  try { while (true) { const {value, done} = await reader.read(); if (timedOut) throw new Error('Hub transfer timed out.'); if (done) break; size += value.byteLength; if (size > limit) throw new Error('Hub transfer exceeds its size limit.'); chunks.push(value); } }
  finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
}
function failure(message, status) { return Response.json({error: message}, {status, headers:{'Cache-Control':'no-store'}}); }
export async function proxyHub(request, parts, options = {}) {
  let destination;
  try { destination = hubDestination(options.destination ?? process.env.ZERO_HUB_URL); } catch { return failure('Hub configuration is invalid.', 503); }
  if (!destination) return failure('ZeroHub is not configured.', 503);
  const path = hubPath(parts, request.method);
  if (!path) return failure('Unknown hub endpoint.', 404);
  const target = new URL(`/api/hub/${path}`, destination);
  const query = new URL(request.url).searchParams;
  if (path === 'auth/callback') {
    for (const key of ['code','state','error','error_description']) if (query.has(key)) {
      const value = query.get(key); if (value.length > 2048) return failure('Invalid OAuth response.', 400); target.searchParams.set(key, value);
    }
  } else if ([...query.keys()].length) return failure('Unexpected hub query.', 400);
  const headers = new Headers();
  for (const name of ['origin','x-zero-csrf']) { const value = request.headers.get(name); if (value) headers.set(name, value); }
  const cookies = (request.headers.get('cookie') || '').split(';').map(value=>value.trim()).filter(value=>/^(zero_hub_session|zero_hub_oauth)=/.test(value));
  if(cookies.length) headers.set('cookie',cookies.join('; '));
  headers.set('accept', 'application/json');
  let body;
  try {
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return failure('Send JSON to the hub.', 415);
      body = await boundedBytes(request.body, 1024 * 1024); headers.set('content-type','application/json');
    }
  } catch { return failure('Submission exceeds 1 MiB.', 413); }
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const upstream = await (options.fetch ?? fetch)(target, {method:request.method, headers, body, redirect:'manual', signal:abort.signal, cache:'no-store'});
    const output = new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    for (const cookie of upstream.headers.getSetCookie()) {
      if (/^(zero_hub_session|zero_hub_oauth)=/.test(cookie) && /;\s*Path=\/api\/hub(?:;|$)/i.test(cookie) && /;\s*HttpOnly(?:;|$)/i.test(cookie) && !/;\s*Domain=/i.test(cookie)) output.append('Set-Cookie', cookie);
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = new URL(upstream.headers.get('location') || '', target);
      const website = new URL(request.url);
      // Next can normalize Request.url to localhost for a 127.0.0.1 visit.
      // Relative redirects retain the browser's host and its host-only cookies.
      if (location.origin === destination.origin && location.pathname.startsWith('/api/hub/')) output.set('Location', `${location.pathname}${location.search}`);
      else if ([destination.origin,website.origin].includes(location.origin) && ['/hub','/hub/prepare'].includes(location.pathname) && !location.search && !location.hash && !location.username && !location.password) output.set('Location',location.pathname);
      else if (path === 'auth/start' && location.origin === 'https://github.com' && location.pathname === '/login/oauth/authorize' && !location.username && !location.password && !location.hash) output.set('Location',location.href);
      else return failure('Hub returned an unsafe redirect.', 502);
      return new Response(null, {status:upstream.status,headers:output});
    }
    const type = upstream.headers.get('content-type') || '';
    const preview = path.startsWith('previews/'); const maven = path.startsWith('maven/');
    if (preview && upstream.ok && !type.startsWith('image/png')) return failure('Hub preview must be PNG.',502);
    if (!preview && !maven && !type.startsWith('application/json')) return failure('Hub returned an invalid response.',502);
    if (maven && upstream.ok && !/^(application\/(octet-stream|java-archive|xml)|text\/(xml|plain))\b/.test(type)) return failure('Hub artifact has an invalid type.',502);
    const bytes = await boundedBytes(upstream.body, preview ? 256 * 1024 : 4 * 1024 * 1024);
    if (preview && request.method !== 'HEAD' && upstream.ok && (bytes.length < 8 || ![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))) return failure('Hub preview is not a PNG.',502);
    output.set('Content-Type', preview && upstream.ok ? 'image/png' : type);
    return new Response(request.method === 'HEAD' ? null : bytes, {status:upstream.status,headers:output});
  } catch { return failure('ZeroHub is unavailable. Try again shortly.',502); }
  finally { clearTimeout(timer); }
}
