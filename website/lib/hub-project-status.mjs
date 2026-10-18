import maintainedProjects from '../content/projects.json' with {type: 'json'};
import {readCatalog} from './sharing-catalog.mjs';
import {maintainedPlayLink, playLink, selectReleases} from './sharing-client.mjs';

const REPO_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/;
const ID_PATTERN = /^(?:game|lib)-r[1-9][0-9]*-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUS_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const CATALOG_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
const MAX_BODY_BYTES = 128 * 1024;
const TIMEOUT_MS = 6000;

export function repositoryParts(repositoryUrl) {
  if (typeof repositoryUrl !== 'string' || repositoryUrl.length > 256) return null;
  const match = REPO_PATTERN.exec(repositoryUrl);
  if (!match || match[2] === '.' || match[2] === '..' || match[2].endsWith('.git') ||
      match[2].startsWith('.') || match[2].endsWith('.') || match[2].includes('..')) return null;
  return {owner: match[1], repo: match[2]};
}

export function canonicalPagesUrl(repositoryUrl) {
  const parts = repositoryParts(repositoryUrl);
  if (!parts) return null;
  const owner = parts.owner.toLowerCase();
  const repo = parts.repo.toLowerCase();
  return repo === `${owner}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${repo}/`;
}

function safePlayUrl(url, repositoryUrl) {
  return typeof url === 'string' && url === canonicalPagesUrl(repositoryUrl) ? url : undefined;
}

const defaultCatalogCache = {expires: 0, value: null, pending: null};
async function catalogFor(options) {
  const reader = options.catalogReader ?? readCatalog;
  if (options.catalogReader) try { return await reader(); } catch { return null; }
  const now = (options.now ?? Date.now)();
  if (defaultCatalogCache.expires > now) return defaultCatalogCache.value;
  if (defaultCatalogCache.pending) return defaultCatalogCache.pending;
  const pending = Promise.resolve().then(() => reader()).catch(() => null).then(value => {
    defaultCatalogCache.value = value;
    defaultCatalogCache.expires = (options.now ?? Date.now)() + (value ? CATALOG_TTL_MS : FAILURE_TTL_MS);
    return value;
  }).finally(() => { defaultCatalogCache.pending = null; });
  defaultCatalogCache.pending = pending;
  return pending;
}

/** Resolve a user-selected ID into trusted publication metadata. Never accept a URL from the caller. */
export async function resolveHubProject({kind, id}, options = {}) {
  if (kind !== 'game' && kind !== 'library' || typeof id !== 'string') return null;
  if (kind === 'game') {
    const project = (options.maintainedProjects ?? maintainedProjects).find(item => item.id === id);
    if (project) {
      if (!repositoryParts(project.repositoryUrl)) return null;
      let playUrl;
      try { playUrl = safePlayUrl(maintainedPlayLink(project), project.repositoryUrl); } catch { /* Invalid editorial URL is never fetched. */ }
      return {id, kind, repositoryUrl: project.repositoryUrl, ...(playUrl ? {playUrl} : {}), sourceCommit: project.sourceCommit};
    }
  }
  if (!ID_PATTERN.test(id)) return null;
  const catalog = await catalogFor(options);
  if (!catalog || !Array.isArray(catalog.releases)) return null;
  // Browse semantics: only the latest available release is a public feedback target.
  let release;
  try { release = selectReleases(catalog, {kind}).find(item => item.id === id); } catch { return null; }
  if (!release || release.status !== 'available' || !repositoryParts(release.repository?.url)) return null;
  let playUrl;
  try { playUrl = safePlayUrl(playLink(release), release.repository.url); } catch { /* Never fetch an invalid receipt. */ }
  return {id, kind, repositoryUrl: release.repository.url, ...(playUrl ? {playUrl} : {}), sourceCommit: release.source?.commit, version: release.version};
}

function cacheValue(cache, key, now) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires <= now) { cache.delete(key); return undefined; }
  return entry.value;
}
function putCache(cache, key, value, expires) {
  cache.delete(key);
  cache.set(key, {value, expires});
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}
async function cached(cache, inflight, key, work, now, valid) {
  const hit = cacheValue(cache, key, now());
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const pending = Promise.resolve().then(work).then(value => {
    putCache(cache, key, value, now() + (valid(value) ? STATUS_TTL_MS : FAILURE_TTL_MS));
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

async function withDeadline(work, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Timed out')); }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

async function boundedJson(response) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new Error('Oversize response');
  if (!response.body) throw new Error('Empty response');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('Oversize response');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function githubRepository(parts, fetchImpl, timeoutMs) {
  const url = `https://api.github.com/repos/${parts.owner}/${parts.repo}`;
  try {
    return await withDeadline(async signal => {
      const response = await fetchImpl(url, {method:'GET', redirect:'error', cache:'no-store', signal,
        headers:{Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'ZeroHub'}});
      try {
        if (!response.ok || response.redirected || response.url && response.url !== url) return {stars:null, issuesEnabled:null};
        const data = await boundedJson(response);
        return {stars:Number.isSafeInteger(data?.stargazers_count) && data.stargazers_count >= 0 ? data.stargazers_count : null,
          issuesEnabled:typeof data?.has_issues === 'boolean' ? data.has_issues : null};
      } finally { await response.body?.cancel().catch(() => {}); }
    }, timeoutMs);
  } catch { return {stars:null, issuesEnabled:null}; }
}

async function pageStatus(url, fetchImpl, timeoutMs, now) {
  try {
    return await withDeadline(async signal => {
      const response = await fetchImpl(url, {method:'HEAD', redirect:'error', cache:'no-store', signal});
      try {
        if (response.redirected || response.url && response.url !== url) return {status:'unknown', checkedAt:new Date(now()).toISOString()};
        const status = response.status >= 200 && response.status < 300 ? 'reachable'
          : response.status === 404 || response.status === 410 || response.status >= 500 && response.status <= 599 ? 'unreachable' : 'unknown';
        return {status, checkedAt:new Date(now()).toISOString()};
      } finally { await response.body?.cancel().catch(() => {}); }
    }, timeoutMs);
  } catch { return {status:'unknown', checkedAt:new Date(now()).toISOString()}; }
}

/** The maps are process-local, bounded and contain public aggregate data only. */
export function createHubProjectStatusService({fetchImpl = fetch, now = Date.now, catalogReader, maintainedProjects: projects,
    timeoutMs = TIMEOUT_MS} = {}) {
  const repoCache = new Map(), pageCache = new Map(), repoInflight = new Map(), pageInflight = new Map();
  const resolve = input => resolveHubProject(input, {catalogReader, maintainedProjects: projects, now});
  async function statusTarget(target, remainingMs = timeoutMs) {
    if (!target) return null;
    const parts = repositoryParts(target.repositoryUrl);
    const repoKey = `${parts.owner.toLowerCase()}/${parts.repo.toLowerCase()}`;
    const [repository, site] = await Promise.all([
      cached(repoCache, repoInflight, repoKey, () => githubRepository(parts, fetchImpl, Math.min(remainingMs, timeoutMs, TIMEOUT_MS)), now,
        value => value.stars !== null && value.issuesEnabled !== null),
      target.playUrl ? cached(pageCache, pageInflight, target.playUrl,
        () => pageStatus(target.playUrl, fetchImpl, Math.min(remainingMs, timeoutMs, TIMEOUT_MS), now), now,
        value => value.status !== 'unknown') : {status:'not-checked'}
    ]);
    return {id:target.id, kind:target.kind, repositoryUrl:target.repositoryUrl,
      stars:repository.stars, issuesEnabled:repository.issuesEnabled, site};
  }
  async function status(input) { return statusTarget(await resolve(input)); }
  return {resolve, status, statusTarget};
}

export const hubProjectStatusService = createHubProjectStatusService();

function unknownStatus(target) {
  return {id:target.id, kind:target.kind, repositoryUrl:target.repositoryUrl,
    stars:null, issuesEnabled:null, site:{status:target.playUrl ? 'unknown' : 'not-checked'}};
}

export async function hubProjectsResponse(request, {service = hubProjectStatusService, now = Date.now,
    responseBudgetMs = 14_000} = {}) {
  const started = now();
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const ids = url.searchParams.get('ids');
  if (url.searchParams.size !== 2 || url.searchParams.getAll('kind').length !== 1 ||
      url.searchParams.getAll('ids').length !== 1 || !['game','library'].includes(kind) ||
      !ids || ids.length > 1200) return Response.json({error:'Invalid project selection.'},{status:400});
  const entries = ids.split(',');
  if (entries.length > 12 || entries.some(id => !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)) ||
      new Set(entries).size !== entries.length) return Response.json({error:'Invalid project selection.'},{status:400});
  // Resolve allowlisted targets before external status work; share the catalog read.
  const targets = await Promise.all(entries.map(id => service.resolve({kind,id})));
  // Three projects at a time bounds work even when a caller requests the full batch.
  const items = [];
  for (let index = 0; index < targets.length; index += 3) {
    const batch = targets.slice(index, index + 3).filter(Boolean);
    const remaining = responseBudgetMs - (now() - started);
    if (remaining < 50) {
      items.push(...batch.map(unknownStatus));
    } else {
      items.push(...await Promise.all(batch.map(target => withDeadline(
        () => service.statusTarget(target, remaining), remaining).catch(() => unknownStatus(target)))));
    }
  }
  return Response.json({schema:1, items}, {headers:{'Cache-Control':'public, max-age=60, s-maxage=60'}});
}
