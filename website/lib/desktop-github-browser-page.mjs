function prefersHtml(accept) {
  const weights = new Map();
  for (const item of (accept ?? '').split(',')) {
    const [type, ...parameters] = item.toLowerCase().split(';').map(part => part.trim());
    const quality = parameters.find(part => part.startsWith('q='));
    const weight = quality === undefined ? 1 : Number(quality.slice(2));
    const validWeight = Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0;
    weights.set(type, Math.max(weights.get(type) ?? 0, validWeight));
  }
  const wildcard = weights.get('*/*') ?? 0;
  const html = weights.get('text/html') ?? weights.get('text/*') ?? wildcard;
  const json = weights.get('application/json') ?? weights.get('application/*') ?? wildcard;
  return html > json;
}

export function desktopGitHubBrowserPage(request, response, {pages, pageHeaders}) {
  if (response.status !== 400 && response.status !== 503) return response;

  response.headers.append('Vary', 'Accept');
  if (!prefersHtml(request.headers.get('accept'))) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(pageHeaders)) headers.set(name, value);
  const html = response.status === 503 ? pages.unavailable : pages.failed;
  return new Response(html, {status: response.status, headers});
}
