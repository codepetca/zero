import maintainedProjects from '../content/projects.json' with {type: 'json'};
import {readCatalog} from './sharing-catalog.mjs';
import {maintainedPlayLink, playLink, selectReleases} from './sharing-client.mjs';
import {assertJamVisibilityTime, readJamHubVisibility} from './jam-hub-visibility.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {readJamDestinationBinding} from './jam-destination-binding.mjs';

const REPO_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/;
const ID_PATTERN = /^(?:game|lib)-r[1-9][0-9]*-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUS_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const CATALOG_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
const MAX_BODY_BYTES = 128 * 1024;
const TIMEOUT_MS = 6000;
const REPOSITORY_ID = /^[1-9][0-9]{0,19}$/;
// Maintained DTOs and every public selection/count consumer share this bound.
export const MAX_HUB_PROJECT_ID_LENGTH = 128;
export const hubProjectId = id => typeof id === 'string' && id.length <= MAX_HUB_PROJECT_ID_LENGTH &&
  /^[a-z0-9][a-z0-9-]*(?![\s\S])/.test(id);
class RepositoryIdentityMismatch extends Error {}
class ProjectVisibilityError extends Error {
  constructor() { super('Project visibility is unavailable.'); }
}

function checkedVisibility(visibility) {
  if (visibility === null) return null;
  if (!visibility || typeof visibility.revision !== 'string' ||
      !/^[a-f0-9]{40}$/.test(visibility.revision) || typeof visibility.isHeld !== 'function')
    throw new ProjectVisibilityError();
  return visibility;
}

/** Null explicitly means this deployment has no active Jam authority. An omitted
 * decision must be read fresh; undefined or malformed supplied decisions reject. */
export async function hubVisibilityDecision(options = {}) {
  const visibility = checkedVisibility(Object.hasOwn(options, 'visibility') ? options.visibility :
    await (options.visibilityReader ?? readJamHubVisibility)({env:options.env, signal:options.signal}));
  options.onVisibilityDecision?.(visibility);
  return visibility;
}

/** Resolve metadata first, then gate its immutable repository identity. Never
 * infer authority from the caller's ID or a mutable repository URL. */
export function hubTargetVisible(target, visibility) {
  checkedVisibility(visibility);
  if (!target) return false;
  if (visibility === null) return true;
  if (!['game','library'].includes(target.kind) || typeof target.repositoryId !== 'string' || !REPOSITORY_ID.test(target.repositoryId)) return false;
  try {
    const held = visibility.isHeld(target.repositoryId);
    if (typeof held !== 'boolean') throw new ProjectVisibilityError();
    return !held;
  } catch { throw new ProjectVisibilityError(); }
}

const repositoryIdentity = (value, ownerId) => ({
  ...(typeof value === 'string' && REPOSITORY_ID.test(value) ? {repositoryId:value} : {}),
  ...(ownerId !== undefined ? {ownerId} : {})
});

async function freshVisibility(target, options) {
  options.check?.();
  const visibility = await hubVisibilityDecision({visibilityReader:options.visibilityReader,
    env:options.env, signal:options.signal, onVisibilityDecision:options.onVisibilityDecision});
  options.check?.();
  // Disappearing authority cannot turn an active observation into permission.
  if (visibility === null) throw new ProjectVisibilityError();
  return hubTargetVisible(target, visibility) ? visibility : null;
}

/** Fresh source-destination observation. The submitted Pages URL remains
 * independent and mutable. Supplied visibility is only the first snapshot;
 * the independent reader is always read
 * again after lookup. Each active call owns a bounded, cancellable lookup and
 * does not cache its authorization. A name/provider change after the last
 * observation still races use; callers performing slow work must recheck holds.
 * Throws for unavailable observations; confirmed mismatches return null. */
export async function bindHubProjectDestination(target, visibility, options = {}) {
  if (!hubTargetVisible(target, visibility)) return null;
  if (visibility === null) {
    if (!await stillInactive(options)) return null;
    assertJamVisibilityTime(visibility, options.decisionNow, options.env ?? process.env);
    return target;
  }
  // Save the selected destination before awaiting injected/provider work.
  target = {...target};
  const parts = repositoryParts(target.repositoryUrl);
  if (!parts || target.ownerId !== undefined &&
      (typeof target.ownerId !== 'string' || !REPOSITORY_ID.test(target.ownerId))) return null;
  const deadline = createHubRequestDeadline({budgetMs:options.destinationTimeoutMs ?? TIMEOUT_MS, signal:options.signal});
  try {
    options.check?.();
    const binding = await deadline.run(signal => (options.destinationReader ?? readJamDestinationBinding)(target.repositoryUrl, {signal}));
    options.check?.();
    const boundParts = repositoryParts(binding?.repositoryUrl);
    if (!binding || typeof binding.repositoryId !== 'string' || !REPOSITORY_ID.test(binding.repositoryId) ||
        typeof binding.ownerId !== 'string' || !REPOSITORY_ID.test(binding.ownerId) || !boundParts ||
        binding.owner !== boundParts.owner || binding.repo !== boundParts.repo ||
        boundParts.owner.toLowerCase() !== parts.owner.toLowerCase() || boundParts.repo.toLowerCase() !== parts.repo.toLowerCase())
      throw new ProjectVisibilityError();
    const fresh = await deadline.run(signal => freshVisibility(target, {...options, signal}));
    if (!fresh || !hubTargetVisible({...target, repositoryId:binding.repositoryId}, fresh) ||
        binding.repositoryId !== target.repositoryId || target.ownerId !== undefined && binding.ownerId !== target.ownerId) return null;
    deadline.check(); options.check?.();
    // The participant's published URL remains mutable and is not an ownership
    // claim. Source identity and the fresh Jam decision authorize discovery.
    const {playUrl, ...safe} = target;
    const result = {...safe, ownerId:binding.ownerId, ...(safePlayUrl(playUrl, target.repositoryUrl) ? {playUrl} : {})};
    assertJamVisibilityTime(fresh, options.decisionNow, options.env ?? process.env);
    return result;
  } catch { throw new ProjectVisibilityError(); }
  finally { deadline.dispose(); }
}

// An inactive snapshot cannot authorize unchecked source/Pages results after
// authority activates. Fail closed; a new request can take the active binding path.
async function stillInactive(options) {
  const deadline = createHubRequestDeadline({budgetMs:options.destinationTimeoutMs ?? TIMEOUT_MS, signal:options.signal});
  try {
    options.check?.();
    const latest = await deadline.run(signal => hubVisibilityDecision({visibilityReader:options.visibilityReader, env:options.env, signal}));
    options.check?.();
    return latest === null;
  } catch { throw new ProjectVisibilityError(); }
  finally { deadline.dispose(); }
}

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
  const repo = parts.repo;
  return repo.toLowerCase() === `${owner}.github.io`
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
  const visibility = await hubVisibilityDecision(options);
  if (kind === 'game') {
    const project = (options.maintainedProjects ?? maintainedProjects).find(item => item.id === id);
    if (project) {
      if (!repositoryParts(project.repositoryUrl)) return null;
      const target = {id, kind, repositoryUrl: project.repositoryUrl, ...repositoryIdentity(project.repositoryId, project.ownerId), sourceCommit: project.sourceCommit};
      if (!hubTargetVisible(target, visibility)) return null;
      let playUrl;
      try { playUrl = safePlayUrl(maintainedPlayLink(project), project.repositoryUrl); } catch { /* Invalid editorial URL is never fetched. */ }
      return bindHubProjectDestination({...target, ...(playUrl ? {playUrl} : {})}, visibility, options);
    }
  }
  if (!ID_PATTERN.test(id)) return null;
  const catalog = await catalogFor(options);
  if (!catalog || !Array.isArray(catalog.releases)) return null;
  // Browse semantics: only the latest available release is a public feedback target.
  let release;
  try { release = selectReleases(catalog, {kind}).find(item => item.id === id); } catch { return null; }
  if (!release || release.status !== 'available' || !repositoryParts(release.repository?.url)) return null;
  const target = {id, kind, repositoryUrl:release.repository.url, ...repositoryIdentity(release.repository.id, release.repository.ownerId), sourceCommit:release.source?.commit, version:release.version};
  if (!hubTargetVisible(target, visibility)) return null;
  let playUrl;
  try { playUrl = safePlayUrl(playLink(release), release.repository.url); } catch { /* Never fetch an invalid receipt. */ }
  return bindHubProjectDestination({...target, ...(playUrl ? {playUrl} : {})}, visibility, options);
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

async function githubRepository(parts, fetchImpl, timeoutMs, expectedIdentity) {
  const url = `https://api.github.com/repos/${parts.owner}/${parts.repo}`;
  try {
    return await withDeadline(async signal => {
      const response = await fetchImpl(url, {method:'GET', redirect:'error', cache:'no-store', signal,
        headers:{Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'ZeroHub'}});
      try {
        if (!response.ok || response.redirected || response.url && response.url !== url) return {stars:null, issuesEnabled:null};
        const data = await boundedJson(response);
        // An active name-addressed lookup may now refer to a replacement or
        // transferred repository. Never cache its aggregates under the earlier
        // bound identity, even if a later lookup observes the old identity again.
        if (expectedIdentity && (!Number.isSafeInteger(data?.id) || data.id < 1 ||
            !Number.isSafeInteger(data?.owner?.id) || data.owner.id < 1 ||
            String(data.id) !== expectedIdentity.repositoryId || String(data.owner.id) !== expectedIdentity.ownerId))
          throw new RepositoryIdentityMismatch();
        return {stars:Number.isSafeInteger(data?.stargazers_count) && data.stargazers_count >= 0 ? data.stargazers_count : null,
          issuesEnabled:typeof data?.has_issues === 'boolean' ? data.has_issues : null};
      } finally { await response.body?.cancel().catch(() => {}); }
    }, timeoutMs);
  } catch (error) {
    if (error instanceof RepositoryIdentityMismatch) throw error;
    return {stars:null, issuesEnabled:null};
  }
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
    timeoutMs = TIMEOUT_MS, visibilityReader = readJamHubVisibility, destinationReader = readJamDestinationBinding,
    pagesBindingReader, destinationTimeoutMs = TIMEOUT_MS, env = process.env, decisionNow = Date.now} = {}) {
  const repoCache = new Map(), pageCache = new Map(), repoInflight = new Map(), pageInflight = new Map();
  const resolve = (input, options = {}) => resolveHubProject(input, {catalogReader, maintainedProjects: projects, now, visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs, env, decisionNow, ...options});
  async function statusTarget(target, remainingMs = timeoutMs, options = {}) {
    if (!target) return null;
    const visibility = await hubVisibilityDecision({visibilityReader, env, ...options});
    let finalVisibility = visibility;
    const bindingOptions = {visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs, env, decisionNow, ...options,
      onVisibilityDecision:latest => { finalVisibility = latest; options.onVisibilityDecision?.(latest); }};
    target = await bindHubProjectDestination(target, visibility, bindingOptions);
    if (!target) return null;
    const parts = repositoryParts(target.repositoryUrl);
    if (!parts) return null;
    // An enclosing request can expire while the explicit decision is awaited.
    // Do not start provider work for that request after its budget has elapsed.
    options.check?.();
    const destinationKey = `${parts.owner.toLowerCase()}/${parts.repo.toLowerCase()}`;
    // Active status caches/in-flight work belong to the freshly bound immutable
    // repository, so a later namespace replacement cannot inherit old counts.
    const repoKey = visibility !== null ? `${target.repositoryId}:${target.ownerId}:${destinationKey}` : destinationKey;
    const [repository, site] = await Promise.all([
      cached(repoCache, repoInflight, repoKey, () => githubRepository(parts, fetchImpl, Math.min(remainingMs, timeoutMs, TIMEOUT_MS),
        visibility !== null ? target : undefined), now,
        value => value.stars !== null && value.issuesEnabled !== null).catch(error => {
          if (error instanceof RepositoryIdentityMismatch) return null;
          throw error;
        }),
      target.playUrl ? cached(pageCache, pageInflight, visibility !== null ?
        `${target.repositoryId}:${target.playUrl}` : target.playUrl,
        () => pageStatus(target.playUrl, fetchImpl, Math.min(remainingMs, timeoutMs, TIMEOUT_MS), now), now,
        value => value.status !== 'unknown') : {status:'not-checked'}
    ]);
    if (!repository) return null;
    // Slow provider/cache work may overlap a namespace replacement. Rebind
    // source identity and then fresh authority before returning an active result.
    // Supplied snapshots never authorize this final observation.
    if (visibility !== null ?
        !await bindHubProjectDestination(target, visibility, bindingOptions) : !await stillInactive(bindingOptions)) return null;
    const result = {id:target.id, kind:target.kind, repositoryUrl:target.repositoryUrl,
      stars:repository.stars, issuesEnabled:repository.issuesEnabled, site};
    assertJamVisibilityTime(finalVisibility, options.decisionNow ?? decisionNow, options.env ?? env);
    return result;
  }
  async function status(input, options = {}) {
    const visibility = await hubVisibilityDecision({visibilityReader, env, ...options});
    const target = await resolve(input, {...options, visibility});
    let finalVisibility = visibility;
    const result = await statusTarget(target, timeoutMs, {...options, visibility,
      onVisibilityDecision:latest => { finalVisibility = latest; options.onVisibilityDecision?.(latest); }});
    assertJamVisibilityTime(finalVisibility, options.decisionNow ?? decisionNow, options.env ?? env);
    return result;
  }
  return {resolve, status, statusTarget};
}

export const hubProjectStatusService = createHubProjectStatusService();
// Keep private references: the exported service object is mutable and cannot
// itself attest that its resolver or status implementation is still trusted.
const builtInResolve = hubProjectStatusService.resolve;
const builtInStatusTarget = hubProjectStatusService.statusTarget;

function projectedSiteStatus(site) {
  if (site === undefined) return {status:'not-checked'};
  if (!site || typeof site !== 'object' || Array.isArray(site) ||
      !['reachable','unreachable','unknown','not-checked'].includes(site.status)) throw new ProjectVisibilityError();
  // Custom status implementations cannot return URLs or arbitrary nested fields.
  const checkedAt = site.checkedAt;
  if (checkedAt !== undefined && (typeof checkedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(checkedAt) ||
      !Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString() !== checkedAt)) throw new ProjectVisibilityError();
  return {status:site.status, ...(checkedAt ? {checkedAt} : {})};
}

function projectedAggregateStatus(item) {
  // Missing optional aggregate data remains unknown. Never serialize arbitrary
  // custom-provider objects through otherwise allowlisted response fields.
  const stars = item.stars === undefined ? null : item.stars;
  const issuesEnabled = item.issuesEnabled === undefined ? null : item.issuesEnabled;
  if (stars !== null && (!Number.isSafeInteger(stars) || stars < 0) ||
      issuesEnabled !== null && typeof issuesEnabled !== 'boolean') throw new ProjectVisibilityError();
  return {stars, issuesEnabled};
}

export async function hubProjectsResponse(request, {service = hubProjectStatusService,
    responseBudgetMs = 18_000, monotonicNow, env = process.env, visibilityReader = readJamHubVisibility,
    destinationReader = readJamDestinationBinding, pagesBindingReader, destinationTimeoutMs = TIMEOUT_MS, decisionNow = Date.now} = {}) {
  const headers = {'Cache-Control':'no-store'};
  // Pin both methods for this request. A replacement while resolution waits
  // must not turn a skipped route binding into a call to custom status code.
  const builtIn = service === hubProjectStatusService && service.resolve === builtInResolve &&
    service.statusTarget === builtInStatusTarget;
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal, ...(monotonicNow ? {now:monotonicNow} : {})});
  try {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const ids = url.searchParams.get('ids');
  if (url.searchParams.size !== 2 || url.searchParams.getAll('kind').length !== 1 ||
      url.searchParams.getAll('ids').length !== 1 || !['game','library'].includes(kind) ||
      // Maintained discovery IDs support 128 characters. Include all eleven
      // separators when accepting a full twelve-ID status selection.
      !ids || ids.length > 12 * MAX_HUB_PROJECT_ID_LENGTH + 11) return Response.json({error:'Invalid project selection.'},{status:400, headers});
  const entries = ids.split(',');
  if (entries.length > 12 || !entries.every(hubProjectId) ||
      new Set(entries).size !== entries.length) return Response.json({error:'Invalid project selection.'},{status:400, headers});
  // Resolve allowlisted targets before external status work; share the catalog read.
  let targets, visibility;
  try {
    visibility = await deadline.run(signal => hubVisibilityDecision({env, signal, visibilityReader}));
    targets = [];
    // Destination readers admit at most four calls. Keep request work at three
    // even when an injected resolver also performs its own independent binding.
    for (let index = 0; index < entries.length; index += 3) {
      targets.push(...await deadline.run(signal => Promise.all(entries.slice(index, index + 3).map(async id => {
        deadline.check();
        const options = {visibility, visibilityReader, destinationReader, decisionNow, ...(pagesBindingReader !== undefined ? {pagesBindingReader} : {}), destinationTimeoutMs, env, signal, check:deadline.check};
        const target = await (builtIn ? builtInResolve({kind,id}, options) : service.resolve({kind,id}, options));
        deadline.check();
        if (target?.kind !== kind || target.id !== id) return null;
        // The pinned built-in resolver already performed this binding. Custom
        // or modified services still receive the independent route gate.
        return builtIn ? target : bindHubProjectDestination(target, visibility, options);
      }))));
    }
  } catch {
    return Response.json({error:'ZeroHub is unavailable. Try again shortly.'},{status:503, headers});
  }
  // Three projects at a time bounds work even when a caller requests the full batch.
  const items = [];
  try {
    for (let index = 0; index < targets.length; index += 3) {
      const batch = targets.slice(index, index + 3).filter(Boolean);
      items.push(...await deadline.run(() => Promise.all(batch.map(target => {
        deadline.check();
        // Status provider requests are deduplicated across callers, so their
        // own bounded timeout must not inherit this caller's cancellation.
        // Keep the route's bound destination private from custom status code.
        // Mutating its argument must not restore a URL the route withheld.
        return (builtIn ? builtInStatusTarget : service.statusTarget).call(service, {...target}, undefined, {visibility, visibilityReader, destinationReader, decisionNow, ...(pagesBindingReader !== undefined ? {pagesBindingReader} : {}), destinationTimeoutMs,
          env, signal:deadline.signal, check:deadline.check});
      }))));
    }
  } catch {
    return Response.json({error:'ZeroHub is unavailable. Try again shortly.'},{status:503, headers});
  }
  try {
    // Catalog resolution, provider checks and earlier batches can all wait.
    // Recheck once for the complete response, including cached/unknown status,
    // so a newly accepted hold is not disclosed by a slow earlier operation.
    let finalDecision = visibility;
    let visibleItems = items.filter(Boolean);
    if (visibleItems.length) {
      const latest = await deadline.run(signal => hubVisibilityDecision({env, signal, visibilityReader}));
      finalDecision = latest;
      if ((visibility === null) !== (latest === null)) throw new ProjectVisibilityError();
      const targetsById = new Map(targets.filter(Boolean).map(target => [target.id, target]));
      visibleItems = visibleItems.filter(item => hubTargetVisible(targetsById.get(item.id), latest));
      if (visibility !== null) {
        // Earlier status batches can wait behind later provider work. Independently
        // rebind every retained source now, including custom status results.
        const rebound = new Set();
        for (let index = 0; index < visibleItems.length; index += 3) {
          await deadline.run(signal => Promise.all(visibleItems.slice(index, index + 3).map(async item => {
            const target = targetsById.get(item.id);
            if (await bindHubProjectDestination(target, latest, {visibilityReader, destinationReader, decisionNow,
              destinationTimeoutMs, env, signal, check:deadline.check})) rebound.add(item.id);
          })));
        }
        // Rebinding itself may wait. A hold accepted during a later observation
        // also gates earlier candidates before the complete response is emitted.
        const finalVisibility = await deadline.run(signal => hubVisibilityDecision({env, signal, visibilityReader}));
        if (finalVisibility === null) throw new ProjectVisibilityError();
        finalDecision = finalVisibility;
        visibleItems = visibleItems.filter(item => rebound.has(item.id) && hubTargetVisible(targetsById.get(item.id), finalVisibility));
        visibleItems = visibleItems.map(item => {
          const target = targetsById.get(item.id);
          // Injected status implementations cannot substitute another destination.
          return {id:target.id, kind:target.kind, repositoryUrl:target.repositoryUrl,
            ...projectedAggregateStatus(item), site:target.playUrl ? projectedSiteStatus(item.site) : {status:'not-checked'}};
        });
      }
    }
    deadline.check();
    assertJamVisibilityTime(finalDecision, decisionNow, env);
    return Response.json({schema:1, items:visibleItems}, {headers});
  } catch {
    return Response.json({error:'ZeroHub is unavailable. Try again shortly.'},{status:503, headers});
  }
  } finally { deadline.dispose(); }
}
