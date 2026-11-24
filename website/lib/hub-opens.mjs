import {createHash} from 'node:crypto';
import {hubConfig} from './hub-github-auth.mjs';
import {listingRepositoryReader} from './hub-listings-github-app.mjs';
import {configuredListingsStore,listingsEnabled} from './hub-listings-store.mjs';
import {projectPlayRef} from './hub-play-reference.mjs';
import {parseProjectPlayRef} from './hub-play-selector.mjs';
import {hubProjectId, hubTargetVisible, hubVisibilityDecision, resolveHubProject} from './hub-project-status.mjs';
import {assertJamVisibilityTime, readJamHubVisibility} from './jam-hub-visibility.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {upstashCommand, upstashConfiguration} from './upstash-redis.mjs';

/** Aggregate Play activations only. No account, cookie, IP or event log. */
export const openId = hubProjectId;
const counterId = id => openId(id) || typeof id === 'string' && /^listing:[a-f0-9]{64}$/.test(id);
export const listingOpenId = ({accountId,repositoryId}) =>
  'listing:'+createHash('sha256').update(JSON.stringify([accountId,repositoryId])).digest('hex');
const key = id => `zero:hub:opens:v1:${id}`;

export function opensConfiguration(env = process.env) {
  // Preview traffic must never change production counts, even with copied env.
  if (env.ZERO_HUB_OPENS_DISABLED === '1' || env.VERCEL && env.VERCEL_ENV !== 'production') return null;
  // Native Vercel Marketplace injects KV_REST_API_*. An explicit Zero pair
  // overrides it as a pair; never mix credentials from different databases.
  const explicit = env.ZERO_HUB_OPENS_REDIS_URL !== undefined || env.ZERO_HUB_OPENS_REDIS_TOKEN !== undefined;
  const endpoint = explicit ? env.ZERO_HUB_OPENS_REDIS_URL : env.KV_REST_API_URL;
  const token = explicit ? env.ZERO_HUB_OPENS_REDIS_TOKEN : env.KV_REST_API_TOKEN;
  return upstashConfiguration(endpoint, token);
}

export function createOpensStore({env = process.env, fetchImpl = fetch} = {}) {
  const configuration = opensConfiguration(env);
  if (!configuration) return null;
  const command = upstashCommand(configuration, fetchImpl);
  return {
    async increment(id) {
      if (!counterId(id)) throw new Error('Invalid project');
      // Atomic INCR; never retry an uncertain write, which could double count.
      const count = await command(['INCR', key(id)]);
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Open counts unavailable');
      return count;
    },
    async counts(ids) {
      if (!ids.length || ids.length > 12 || !ids.every(counterId)) throw new Error('Invalid projects');
      const values = await command(['MGET', ...ids.map(key)]);
      if (!Array.isArray(values) || values.length !== ids.length) throw new Error('Open counts unavailable');
      return Object.fromEntries(ids.map((id, index) => {
        const value = values[index];
        const count = value === null ? 0 : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Open counts unavailable');
        return [id, count];
      }));
    },
  };
}

function allowedOrigin(request, env) {
  const configured = env.ZERO_HUB_ORIGIN || 'https://zero.codepet.ca';
  const url = new URL(request.url);
  const local = env.NODE_ENV !== 'production' && !env.VERCEL &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(configured);
  return (configured === 'https://zero.codepet.ca' || local) &&
    url.origin === configured && request.headers.get('origin') === configured &&
    (!request.headers.get('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin');
}

export async function recordOpen(request, {env = process.env, store = createOpensStore({env}), resolve = resolveHubProject,
  visibilityReader = readJamHubVisibility, destinationReader, pagesBindingReader, destinationTimeoutMs = 6000,
  getListingStore = configuredListingsStore, listingDestinationReader,
  responseBudgetMs = 18_000, deadlineNow, decisionNow = Date.now} = {}) {
  const reply = status => new Response(null, {status, headers: {'Cache-Control': 'no-store'}});
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal, now:deadlineNow});
  try {
    deadline.check();
    if (!allowedOrigin(request, env)) return reply(403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415);
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    // A stalled read or cancellation must not extend the total request budget.
    // Cleanup observes eventual rejection but never waits for an untrusted stream.
    const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
    deadline.signal.addEventListener('abort', cancel, {once:true});
    let id, reference, listing;
    try {
      const chunks = []; let length = 0;
      while (true) {
        const {done, value} = await deadline.run(() => reader.read()); if (done) break;
        length += value.byteLength; if (length > 256) return reply(413);
        chunks.push(value);
      }
      deadline.check();
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || Object.keys(data).length !== 1) return reply(400);
      if (openId(data.id)) id = data.id;
      else {
        reference = data.ref;
        listing = parseProjectPlayRef(reference);
        if (listing?.lane !== 'listing') return reply(400);
      }
    } catch {
      deadline.check();
      return reply(400);
    } finally {
      deadline.signal.removeEventListener('abort', cancel);
      cancel();
      try { reader.releaseLock(); } catch { /* A noncooperative read may still be pending. */ }
    }
    // Body consumption is controlled by the caller and can stall. Do not let an
    // earlier authority decision survive that wait and authorize a later write.
    const options = {env, signal:deadline.signal, visibilityReader, destinationReader, pagesBindingReader,
      destinationTimeoutMs, decisionNow, check:deadline.check};
    const visibility = await deadline.run(() => hubVisibilityDecision(options));
    if (!store && visibility === null) { assertJamVisibilityTime(visibility, decisionNow, env); return reply(204); }
    let target, countId = id;
    if (listing) {
      if (!listingsEnabled(env) || !hubConfig(env) || !hubTargetVisible({kind:'game',repositoryId:listing.id},visibility))
        return reply(404);
      const listings = getListingStore(env);
      const readDestination = listingDestinationReader ?? listingRepositoryReader(env);
      if (!listings || !readDestination) return reply(503);
      const rows = await deadline.run(()=>listings.listedForPlay(listing.id,listing.runId));
      const entry = rows.find(row=>row.repositoryId===listing.id && projectPlayRef('listing',row)===reference);
      if (!entry || !await deadline.run(signal=>readDestination(entry,{signal})) ||
          !(await deadline.run(()=>listings.stillListed([entry]))).length) return reply(404);
      target = {repositoryId:entry.repositoryId,playUrl:entry.pagesUrl};
      countId = listingOpenId(entry);
    } else {
      target = await deadline.run(()=>resolve({kind:'game',id},{...options,visibility}));
    }
    if (!target?.playUrl || !hubTargetVisible({...target,kind:'game'},visibility)) return reply(404);
    // A catalog-backed resolver can also wait. Gate the resolved numeric
    // identity again immediately before issuing the counter operation.
    const latest = await deadline.run(() => hubVisibilityDecision(options));
    if ((visibility === null) !== (latest === null)) return reply(404);
    if (!hubTargetVisible({...target, kind:'game'}, latest)) return reply(404);
    if (!store) { assertJamVisibilityTime(latest, decisionNow, env); return reply(204); }
    await deadline.run(() => {
      deadline.check();
      assertJamVisibilityTime(latest, decisionNow, env);
      // Once called, an increment can complete after timeout/cancellation. Its
      // outcome is uncertain: return only the existing empty 503 and never retry.
      return store.increment(countId);
    });
    assertJamVisibilityTime(latest, decisionNow, env);
    return reply(204);
  } catch { return reply(503); }
  finally { deadline.dispose(); }
}
