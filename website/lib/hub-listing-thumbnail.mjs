// Serves a published app's optional ZeroHub card image. Publish copies a
// student's zerohub/thumbnail.png to zero-thumbnail.png on their Pages site.
// ZeroHub reads it only from the GitHub-controlled canonical address of a
// listed app, checks it again and serves the checked bytes. Anything else is
// a 404 and the card draws its generated pattern.
import thumbnailRules from '../../extension/src/web-publish-thumbnail.js';
import {configuredListingsStore, listingsEnabled} from './hub-listings-store.mjs';
import {canonicalPagesUrl} from './hub-project-status.mjs';

const {checkThumbnail, MAX_BYTES, PUBLISHED} = thumbnailRules;
const ID = /^[1-9][0-9]{0,19}$/, COMMIT = /^[a-f0-9]{40}$/;

export const listingThumbnailPath = (repositoryId, commit) =>
  ID.test(String(repositoryId)) && COMMIT.test(String(commit)) ? `/api/hub/listings/thumbnail/${repositoryId}/${commit}` : undefined;

const missing = () => new Response(null, {status:404, headers:{'Cache-Control':'public, max-age=300, s-maxage=3600'}});

async function boundedBytes(response, limit) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit || !response.body) { await response.body?.cancel(); return null; }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) return null;
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

export async function hubListingThumbnailResponse(_request, {repositoryId, commit}, {env = process.env,
  getStore = configuredListingsStore, fetchImpl = fetch} = {}) {
  if (!ID.test(String(repositoryId)) || !COMMIT.test(String(commit)) || !listingsEnabled(env)) return missing();
  try {
    const store = getStore(env);
    const entry = store && await store.listedPublication(repositoryId, commit);
    const canonical = entry && canonicalPagesUrl(entry.repositoryUrl);
    if (!canonical || entry.pagesUrl !== canonical) return missing();
    const response = await fetchImpl(new URL(PUBLISHED, canonical).href, {redirect:'error', cache:'no-store',
      signal:AbortSignal.timeout(4000)});
    if (response.status !== 200) { await response.body?.cancel(); return missing(); }
    const bytes = await boundedBytes(response, MAX_BYTES);
    if (!bytes || !checkThumbnail(bytes).valid) return missing();
    return new Response(bytes, {status:200, headers:{'Content-Type':'image/png',
      'Cache-Control':'public, max-age=3600, s-maxage=86400', 'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch { return missing(); }
}
