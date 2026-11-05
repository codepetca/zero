import {assertJamVisibilityTime} from './jam-hub-visibility.mjs';
import {generateAdoption} from '../../sharing/adoption.mjs';
import {readPublicRegistry, REGISTRY_URL} from './sharing-catalog.mjs';
import {resolveHubProject, hubVisibilityDecision, hubTargetVisible, bindHubProjectDestination} from './hub-project-status.mjs';
import {createOpensStore, openId} from './hub-opens.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';

/** Inactive deployments cache projections/batches; active holds recompute them.
 * No per-visitor records are retained. */
export function createHubMetricsService({env = process.env, now = Date.now,
  store = createOpensStore({env}), registryReader = readPublicRegistry, resolve = resolveHubProject,
  visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs = 6000, decisionNow = Date.now} = {}) {
  let adoption = null, adoptionExpires = 0, adoptionPending;
  const batches = new Map();
  async function usage() {
    if (env.ZERO_SHARING_REGISTRY_URL !== REGISTRY_URL) return null;
    if (adoptionExpires > now()) return adoption;
    if (adoptionPending) return adoptionPending;
    adoptionPending = Promise.resolve().then(() => registryReader()).then(state => generateAdoption(state)).catch(() => null).then(value => {
      adoption = value; adoptionExpires = now() + 60_000; return value;
    }).finally(() => { adoptionPending = undefined; });
    return adoptionPending;
  }
  async function metricsSelection(kind, ids, options = {}) {
    const requestEnv = options.env ?? env;
    const visibility = await hubVisibilityDecision({visibilityReader, ...options, env: requestEnv});
    options.check?.();
    const cacheKey = `${kind}:${ids.join(',')}`;
    let batch = visibility === null ? batches.get(cacheKey) : undefined;
    if (!batch || batch.expires <= now()) {
      // Shared inactive work owns no caller signal/check. Each waiting caller
      // checks its own budget before starting the next stage below.
      batch = {expires: now() + 60_000, targets: (async () => {
        const targets = [];
        // Active default resolution owns a fresh destination lookup. Keep each
        // request within the shared reader's four-call admission cap; this is
        // a per-request bound, not a fleet or cross-request quota reservation.
        const width = visibility === null ? Math.max(1, ids.length) : 4;
        const check = () => {
          if (visibility === null) return;
          options.signal?.throwIfAborted(); options.check?.();
        };
        for (let index = 0; index < ids.length; index += width) {
          check();
          const group = await Promise.all(ids.slice(index, index + width).map(async id => {
            check();
            const target = await resolve({kind, id}, {visibility, env: requestEnv,
              visibilityReader:options.visibilityReader ?? visibilityReader,
              destinationReader:options.destinationReader ?? destinationReader,
              pagesBindingReader:options.pagesBindingReader ?? pagesBindingReader,
              destinationTimeoutMs:options.destinationTimeoutMs ?? destinationTimeoutMs, decisionNow:options.decisionNow ?? decisionNow,
              ...(visibility === null ? {} : {signal:options.signal, check:options.check})});
            check();
            return target?.id === id && target.kind === kind && hubTargetVisible(target, visibility) ? pinMetricTarget(target) : null;
          }));
          check(); targets.push(...group);
        }
        return targets.filter(Boolean);
      })()};
      if (visibility === null) {
        batches.set(cacheKey, batch);
        while (batches.size > 128) batches.delete(batches.keys().next().value);
      }
    }
    try {
      const targets = await batch.targets;
      options.check?.();
      if (!batch.items) batch.items = (async () => {
        if (kind === 'game') {
          const playable = targets.filter(target => target.playUrl).map(target => target.id);
          let counts = null;
          if (store && playable.length) try { counts = await store.counts(playable); } catch { /* Unknown, never a fabricated zero. */ }
          return targets.map(target => ({id: target.id, kind, opens: counts?.[target.id] ?? null}));
        }
        // An active hold can include consumers absent from this target list.
        // Its adoption and coverage aggregates therefore remain unknown.
        const summary = visibility === null ? await usage() : null;
        const counts = new Map(summary?.libraries.map(item => [item.id, item.projects]));
        return targets.map(target => ({id: target.id, kind, projects: counts.get(target.id) ?? null,
          observedProjects: summary?.observedProjects ?? null, totalProjects: summary?.totalProjects ?? null}));
      })();
      const items = await batch.items;
      options.check?.();
      return {targets, items, visibility};
    } catch (error) {
      // A cancelled waiter must not evict work still used by other callers.
      if (!options.signal?.aborted && batches.get(cacheKey) === batch) batches.delete(cacheKey);
      throw error;
    }
  }
  async function metrics(kind, ids, options = {}) {
    const selection = await metricsSelection(kind, ids, options);
    const final = await finalMetrics(kind, ids, selection, {visibilityReader, destinationReader, pagesBindingReader,
      destinationTimeoutMs, env, decisionNow, ...options});
    assertJamVisibilityTime(final.visibility, options.decisionNow ?? decisionNow, options.env ?? env);
    return final.items;
  }
  return {metrics, metricsSelection};
}

async function finalMetrics(kind, ids, selection, options) {
  selection = pinMetricsSelection(kind, ids, selection);
  const latest = await hubVisibilityDecision({visibilityReader:options.visibilityReader, env:options.env, signal:options.signal});
  options.check?.();
  // Inactive resolution has no current source proof if authority activates.
  if ((selection.visibility === null) !== (latest === null)) return {items:[], visibility:latest};
  let items = visibleMetrics(kind, selection, latest);
  if (latest === null || !items.length) return {items, visibility:latest};
  const retained = [...new Set(items.map(item => item.id))], rebound = new Set();
  // Counts and later resolution batches can wait after the original source
  // observation. Rebind every retained source before returning its historical
  // counts, using the same four-call bound as active resolution.
  for (let index = 0; index < retained.length; index += 4) {
    options.signal?.throwIfAborted(); options.check?.();
    await Promise.all(retained.slice(index, index + 4).map(async id => {
      options.signal?.throwIfAborted(); options.check?.();
      if (await bindHubProjectDestination(selection.targets.get(id), latest, options)) rebound.add(id);
      options.check?.();
    }));
  }
  options.signal?.throwIfAborted(); options.check?.();
  // A hold accepted during a later binding must also filter earlier targets.
  const finalVisibility = await hubVisibilityDecision({visibilityReader:options.visibilityReader,
    env:options.env, signal:options.signal});
  options.check?.();
  if (finalVisibility === null) throw new Error('Project visibility is unavailable.');
  return {items:visibleMetrics(kind, selection, finalVisibility).filter(item => rebound.has(item.id)), visibility:finalVisibility};
}

// Only trusted resolution metadata authorizes a metric. A store/service item
// cannot substitute its own repository identity, kind or unrequested ID.
function pinMetricTarget(target) {
  return Object.freeze({id:target.id, kind:target.kind, repositoryId:target.repositoryId,
    ownerId:target.ownerId, repositoryUrl:target.repositoryUrl, playUrl:target.playUrl});
}

function pinMetricsSelection(kind, ids, selection) {
  if (!selection || !Array.isArray(selection.targets) || !Array.isArray(selection.items)) throw new Error('Invalid metrics');
  const allowed = new Set(ids), seen = new Set(), targets = new Map();
  for (const target of selection.targets) {
    if (!target) continue;
    // Projection and binding must use exactly one pinned identity per ID. A
    // wrong-kind duplicate must never substitute a library's binding bypass.
    if (typeof target !== 'object' || Array.isArray(target) || target.kind !== kind ||
        typeof target.id !== 'string' || seen.has(target.id)) throw new Error('Invalid metrics');
    seen.add(target.id);
    if (allowed.has(target.id)) targets.set(target.id, pinMetricTarget(target));
  }
  const items = selection.items.filter(item => item && item.kind === kind && targets.has(item.id)).map(item =>
    ({id:item.id, kind:item.kind, opens:item.opens, projects:item.projects,
      observedProjects:item.observedProjects, totalProjects:item.totalProjects}));
  return {visibility:selection.visibility, targets, items};
}

function visibleMetrics(kind, selection, visibility) {
  return selection.items.filter(item => hubTargetVisible(selection.targets.get(item.id), visibility)).map(item => {
      // A hold accepted during an inactive adoption read invalidates all of its
      // aggregates, even when the requested library itself remains visible.
      if (kind === 'game') return {id:item.id, kind, opens:item.opens};
      return visibility !== null
        ? {id:item.id, kind, projects:null, observedProjects:null, totalProjects:null}
        : {id:item.id, kind, projects:item.projects, observedProjects:item.observedProjects, totalProjects:item.totalProjects};
    });
}

export const hubMetricsService = createHubMetricsService();
export async function hubMetricsResponse(request, {service = hubMetricsService, env = process.env, visibilityReader, destinationReader, pagesBindingReader,
    destinationTimeoutMs = 6000, responseBudgetMs = 18_000, monotonicNow, decisionNow = Date.now} = {}) {
  const headers = {'Cache-Control':'no-store'};
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal,
    ...(monotonicNow ? {now:monotonicNow} : {})});
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind'), list = params.get('ids');
    const ids = list?.split(',') ?? [];
    if (params.size !== 2 || params.getAll('kind').length !== 1 || params.getAll('ids').length !== 1 ||
        !['game', 'library'].includes(kind) || !ids.length || ids.length > 12 ||
        !ids.every(openId) || new Set(ids).size !== ids.length)
      return Response.json({error: 'Invalid project selection.'}, {status: 400, headers});
    try {
      const visibility = await deadline.run(signal => hubVisibilityDecision({env, signal, visibilityReader}));
      const selection = await deadline.run(signal => service.metricsSelection(kind, ids, {
        visibility, visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs, env, signal, decisionNow, check:deadline.check,
      }));
      // Rebinding and the final authority read share the total request budget.
      // Provider changes after those observations remain an inherent race.
      const final = await deadline.run(signal => finalMetrics(kind, ids, {...selection, visibility}, {
        env, signal, visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs, decisionNow, check:deadline.check,
      }));
      deadline.check();
      assertJamVisibilityTime(final.visibility, decisionNow, env);
      return Response.json({schema: 1, items:final.items}, {headers});
    } catch { return Response.json({error: 'Counts unavailable.'}, {status: 503, headers}); }
  } finally { deadline.dispose(); }
}
