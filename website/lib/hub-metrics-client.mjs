/** Navigation always remains a normal direct link, including without JS. */
export function recordPlayOpen(id, fetchImpl = fetch) {
  try {
    void fetchImpl('/api/hub/opens', {method: 'POST', credentials: 'omit', keepalive: true,
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id}),
      signal: AbortSignal.timeout(2500),
    }).catch(() => {});
  } catch { /* Metrics never prevent opening the author's project. */ }
}

export function metricLabel(kind, metric) {
  if (!metric) return null;
  if (kind === 'game') return Number.isSafeInteger(metric.opens) && metric.opens >= 0
    ? {text: `${metric.opens.toLocaleString()} opens`, hint: 'Play opens from ZeroHub since counting began. Includes repeat opens; does not measure visitors or gameplay.'} : null;
  if (!Number.isSafeInteger(metric.projects) || metric.projects < 0 ||
      !Number.isSafeInteger(metric.observedProjects) || !Number.isSafeInteger(metric.totalProjects) ||
      metric.observedProjects < 0 || metric.observedProjects > metric.totalProjects) return null;
  const partial = metric.observedProjects < metric.totalProjects;
  if (partial && metric.projects === 0) return {text: 'Usage not measured yet', hint: 'Older shared projects have no dependency observations. Unshared projects and copied code are not counted.'};
  return {text: `Used by ${partial ? 'at least ' : ''}${metric.projects.toLocaleString()} shared ${metric.projects === 1 ? 'project' : 'projects'}`,
    hint: `Declared library dependencies in shared snapshots, counted once per repository. ${metric.observedProjects} of ${metric.totalProjects} shared repositories measured. Unshared projects, copied code and runtime use are not measured.`};
}
