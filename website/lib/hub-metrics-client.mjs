/** Navigation always remains a normal direct link, including without JS. */
export function recordPlayOpen(id, fetchImpl = fetch) {
  try {
    void fetchImpl('/api/hub/opens', {method: 'POST', credentials: 'omit', keepalive: true,
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id}),
      signal: AbortSignal.timeout(2500),
    }).catch(() => {});
  } catch { /* Metrics never prevent opening the author's project. */ }
}

/** Load visible cards in API-sized batches, merging rather than replacing them. */
export async function loadMetricBatches(kind, ids, {signal, onItems, fetchImpl = fetch}) {
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length && !signal.aborted; offset += 12) {
    const batch = unique.slice(offset, offset + 12), allowed = new Set(batch);
    try {
      const response = await fetchImpl(`/api/hub/metrics?${new URLSearchParams({kind, ids: batch.join(',')})}`, {
        cache: 'no-store', redirect: 'error', credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (signal.aborted || data.schema !== 1 || !Array.isArray(data.items)) continue;
      onItems(data.items.filter(item => item && item.kind === kind && allowed.has(item.id)));
    } catch { /* Optional counts never block later batches or browsing. */ }
  }
}

export function metricLabel(kind, metric) {
  if (!metric) return null;
  if (kind === 'game') return Number.isSafeInteger(metric.opens) && metric.opens >= 0
    ? {text: `${metric.opens.toLocaleString()} ${metric.opens === 1 ? 'open' : 'opens'}`, hint: 'Play-link activations from ZeroHub since counting began. Includes repeat opens; does not measure unique visitors or gameplay.'} : null;
  if (!Number.isSafeInteger(metric.projects) || metric.projects < 0 ||
      !Number.isSafeInteger(metric.observedProjects) || !Number.isSafeInteger(metric.totalProjects) ||
      metric.observedProjects < 0 || metric.observedProjects > metric.totalProjects) return null;
  const partial = metric.observedProjects < metric.totalProjects;
  if (partial && metric.projects === 0) return {text: 'Usage not measured yet', hint: 'Older shared projects have no dependency observations. Unshared projects and copied code are not counted.'};
  return {text: `Used by ${partial ? 'at least ' : ''}${metric.projects.toLocaleString()} shared ${metric.projects === 1 ? 'project' : 'projects'}`,
    hint: `Declared library dependencies in shared snapshots, counted once per repository. ${metric.observedProjects} of ${metric.totalProjects} shared repositories measured. Unshared projects, copied code and runtime use are not measured.`};
}
