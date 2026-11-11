function preference(weights, mediaType) {
  const [category] = mediaType.split('/');
  const ranges = [mediaType, `${category}/*`, '*/*'];
  const match = ranges.findIndex(range => weights.has(range));
  return match === -1 ? {quality: 0, specificity: 0} : {
    quality: weights.get(ranges[match]),
    specificity: ranges.length - match,
  };
}

function prefersHtml(accept) {
  const weights = new Map();
  for (const item of (accept ?? '').split(',')) {
    const [type, ...parameters] = item.toLowerCase().split(';').map(part => part.trim());
    const quality = parameters.find(part => part.startsWith('q='));
    const weight = quality === undefined ? 1 : Number(quality.slice(2));
    const validWeight = Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0;
    weights.set(type, Math.max(weights.get(type) ?? 0, validWeight));
  }
  const html = preference(weights, 'text/html');
  const json = preference(weights, 'application/json');
  return html.quality > 0 && (html.quality > json.quality ||
    html.quality === json.quality && html.specificity > json.specificity);
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
