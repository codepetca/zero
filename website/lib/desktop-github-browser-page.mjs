export function desktopGitHubBrowserPage(request, response, {pages, pageHeaders}) {
  if (response.status !== 400 && response.status !== 503) return response;

  response.headers.append('Vary', 'Accept');
  const acceptsHtml = request.headers.get('accept')?.split(',')
    .some(type => type.trim().toLowerCase() === 'text/html');
  if (!acceptsHtml) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(pageHeaders)) headers.set(name, value);
  const html = response.status === 503 ? pages.unavailable : pages.failed;
  return new Response(html, {status: response.status, headers});
}
