/** Bounded public edge caching; private routes never inherit upstream cache policy.
 * Vercel consumes this targeted header without changing browser artifact caching:
 * https://vercel.com/docs/caching/cache-control-headers
 * A future withdrawal must address edge purge/stale behavior and existing
 * immutable browser copies; CDN caching is best-effort, not a removal deadline.
 */
export const IMMUTABLE_BROWSER_CACHE='public, max-age=31536000, immutable';
const publicHeaders=new Set(['content-type','content-length','cache-control','cdn-cache-control','vercel-cdn-cache-control','x-content-type-options','etag','last-modified','date','server','connection','keep-alive','transfer-encoding','age','x-vercel-cache']);
const previewPath=/^previews\/ui[1-9a-z][0-9a-z]*\/\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?\.png$/;
const mavenPath=/^maven\/ca\/codepet\/zero\/library\/ui[1-9a-z][0-9a-z]*\/\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?\/[A-Za-z0-9._-]+\.(jar|pom|sha256|sha1)$/;
export function publicHubKind(path,method) {
  if(!['GET','HEAD'].includes(method))return null;
  if(path==='catalog'||/^libraries\/ui[1-9a-z][0-9a-z]*$/.test(path))return 'metadata';
  if(mavenPath.test(path)||previewPath.test(path))return 'object';
  return null;
}
/** Source headers must be inspected before adapters discard cookies/secrets.
 * Only a successful, validated public response can opt in. The caller still
 * owns route/query, body, stored integrity, length and content-type validation.
 */
export function publicHubCacheHeaders(output,{path,method,status,source}) {
  const kind=publicHubKind(path,method),headers=new Headers(source);
  // Never let an upstream choose shared caching for a private/error response.
  output.delete('CDN-Cache-Control');output.set('Vercel-CDN-Cache-Control','no-store');
  output.set('Cache-Control','no-store');
  if(!kind||status!==200)return output;
  for(const [name]of headers)if(!publicHeaders.has(name))return output;
  if(/\bprivate\b/i.test(headers.get('cache-control')??'')||/\bprivate\b/i.test(headers.get('cdn-cache-control')??'')||/\bprivate\b/i.test(headers.get('vercel-cdn-cache-control')??''))return output;
  const type=headers.get('content-type')??'';
  if(kind==='metadata'&&!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))return output;
  if(kind==='object') {
    if(headers.get('cache-control')!==IMMUTABLE_BROWSER_CACHE)return output;
    if(path.startsWith('previews/')?type!=='image/png':!/^(application\/(java-archive|octet-stream|xml)|text\/(plain|xml))(?:;\s*charset=utf-8)?$/i.test(type))return output;
    output.set('Cache-Control',IMMUTABLE_BROWSER_CACHE);
  } else output.set('Cache-Control','public, max-age=0, must-revalidate');
  output.set('Vercel-CDN-Cache-Control',`public, s-maxage=${kind==='metadata'?60:3600}, must-revalidate`);
  return output;
}
