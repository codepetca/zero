import {generateAdoption} from '../../sharing/adoption.mjs';
import {readPublicRegistry, REGISTRY_URL} from './sharing-catalog.mjs';
import {resolveHubProject} from './hub-project-status.mjs';
import {createOpensStore, openId} from './hub-opens.mjs';

/** One cached projection, bounded cached batches, no per-visitor records. */
export function createHubMetricsService({env = process.env, now = Date.now,
  store = createOpensStore({env}), registryReader = readPublicRegistry, resolve = resolveHubProject} = {}) {
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
  async function metrics(kind, ids) {
    const cacheKey = `${kind}:${ids.join(',')}`;
    const hit = batches.get(cacheKey);
    if (hit && hit.expires > now()) return hit.value;
    // Cache pending work too, so concurrent visitors share one MGET.
    const pending = (async () => {
      const targets = (await Promise.all(ids.map(id => resolve({kind, id})))).filter(Boolean);
      if (kind === 'game') {
        const playable = targets.filter(target => target.playUrl).map(target => target.id);
        let counts = null;
        if (store && playable.length) try { counts = await store.counts(playable); } catch { /* Unknown, never a fabricated zero. */ }
        return targets.map(target => ({id: target.id, kind, opens: counts?.[target.id] ?? null}));
      }
      const summary = await usage();
      const counts = new Map(summary?.libraries.map(item => [item.id, item.projects]));
      return targets.map(target => ({id: target.id, kind, projects: counts.get(target.id) ?? null,
        observedProjects: summary?.observedProjects ?? null, totalProjects: summary?.totalProjects ?? null}));
    })();
    batches.set(cacheKey, {expires: now() + 60_000, value: pending});
    while (batches.size > 128) batches.delete(batches.keys().next().value);
    try { return await pending; }
    catch (error) { batches.delete(cacheKey); throw error; }
  }
  return {metrics};
}

export const hubMetricsService = createHubMetricsService();
export async function hubMetricsResponse(request, {service = hubMetricsService} = {}) {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind'), list = params.get('ids');
  const ids = list?.split(',') ?? [];
  if (params.size !== 2 || params.getAll('kind').length !== 1 || params.getAll('ids').length !== 1 ||
      !['game', 'library'].includes(kind) || !ids.length || ids.length > 12 ||
      !ids.every(openId) || new Set(ids).size !== ids.length)
    return Response.json({error: 'Invalid project selection.'}, {status: 400});
  try {
    return Response.json({schema: 1, items: await service.metrics(kind, ids)}, {
      headers: {'Cache-Control': 'public, max-age=60, s-maxage=60'},
    });
  } catch { return Response.json({error: 'Counts unavailable.'}, {status: 503, headers: {'Cache-Control': 'no-store'}}); }
}
