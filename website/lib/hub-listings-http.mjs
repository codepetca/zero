import {listingRepositoryReader} from './hub-listings-github-app.mjs';
import {boundedJson, equalSecret, hubConfig, json, readSession, sameOrigin, seal, unseal} from './hub-github-auth.mjs';
import {configuredListingsStore, listingLimit, listingPageSize, listingsEnabled} from './hub-listings-store.mjs';
import {checkListingToken, listingId, listingReceipt, publicListingPlayUrl, verifyListingPublication} from './hub-listings-verification.mjs';
import {assertJamVisibilityTime, readJamHubVisibility} from './jam-hub-visibility.mjs';
import {hubVisibilityDecision, hubTargetVisible} from './hub-project-status.mjs';
import {configuredEntitlementStore} from './zero-entitlements-store.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';

const unavailable = () => json({error:'ZeroHub app listings are temporarily unavailable. Try again.'}, 503);
const authRequired = () => json({error:'Sign in with GitHub to manage your apps.'}, 401);
const invalid = () => json({error:'Invalid app listing request.'}, 400);
const validCursor = value => listingId(value) && BigInt(value) <= 9223372036854775807n;
const manageActions = new Set(['protect', 'unprotect', 'move', 'unlist', 'list']);
const pagePurpose = 'listing-page';
let publicRequests = 0;

// Shared by all public discovery routes so neither can bypass the provider cap.
export function claimPublicHubRequest() {
  if (publicRequests >= 4) return null;
  publicRequests++;
  let released = false;
  return () => {
    if (!released) { released = true; publicRequests--; }
  };
}

// The caller owns cursor validation, the request claim, and the final fresh
// visibility decision. Raw order and lookahead remain server-side only.
export async function readProjectListingPage({env = process.env, signal, search = '', before = null,
  limit, excluded = [], visibility, getStore = configuredListingsStore, destinationReader,
  playReader = publicListingPlayUrl, checkPlay = false, playBudgetMs = 4000}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) throw new Error('Invalid listing page size');
  const store = getStore(env);
  if (!store) return {entries:[], more:false, lookahead:null};
  const readDestination = destinationReader ?? listingRepositoryReader(env);
  if (!readDestination) throw new Error('Listing destination reader unavailable');
  const omit = [...new Set([...excluded.map(item => typeof item === 'string' ? item : item?.repositoryId ?? item?.id),
    ...(visibility?.heldRepositoryIds?.() ?? [])].filter(Boolean))];
  const visible = entry => hubTargetVisible({kind:'game', repositoryId:entry.repositoryId}, visibility);
  const windowSize = Math.max(listingPageSize+1,limit+1);
  let order = before, exhausted = false;
  const observed = [];
  for (let attempt = 0; attempt < 4 && !exhausted && observed.length <= limit; attempt++) {
    signal?.throwIfAborted();
    const candidates = await store.discover(order, search, omit, windowSize);
    exhausted = candidates.length < windowSize;
    order = candidates.at(-1)?.order ?? order;
    for (let offset = 0; offset < candidates.length && observed.length <= limit;) {
      signal?.throwIfAborted();
      const batch = candidates.slice(offset,offset+Math.min(4,limit+1-observed.length));
      offset += batch.length;
      const checked = await Promise.all(batch.map(async entry =>
        visible(entry) && await readDestination(entry, {signal}) ? entry : null));
      observed.push(...checked.filter(Boolean));
    }
  }
  // If the bounded scan cannot prove exhaustion or a visible next entry, do
  // not silently truncate the discovery results.
  if (!exhausted && observed.length <= limit) throw new Error('Listing scan budget exhausted');
  const selected = observed.slice(0, limit);
  const lookahead = observed[limit] ?? null;
  const budget = typeof playBudgetMs==='function' ? playBudgetMs() : playBudgetMs;
  if (checkPlay && selected.length && budget>0) {
    const playDeadline = createHubRequestDeadline({budgetMs:budget,signal});
    try {
      await playDeadline.run(async playSignal => {
        for (let offset = 0; offset < selected.length; offset += 4) {
          playDeadline.check();
          await Promise.all(selected.slice(offset, offset + 4).map(async (entry,index) => {
            try {
              const playUrl = await playReader(entry,{signal:playSignal});
              playDeadline.check();
              selected[offset+index] = {...entry,playUrl};
            } catch { /* A Play-only failure leaves the repository card available. */ }
          }));
        }
      });
    } catch { signal?.throwIfAborted(); }
    finally { playDeadline.dispose(); }
  }
  signal?.throwIfAborted();
  const current = await store.stillListed([...selected, ...(lookahead ? [lookahead] : [])]);
  signal?.throwIfAborted();
  const currentOrders = new Set(current.map(entry => entry.order));
  const entries = selected.filter(entry => currentOrders.has(entry.order));
  const confirmed = lookahead && currentOrders.has(lookahead.order) ? lookahead : null;
  if (lookahead && !confirmed) throw new Error('Listing continuation changed');
  if (confirmed && !entries.length) throw new Error('Listing page changed');
  return {entries, more:!!confirmed, lookahead:confirmed};
}
const ownerDto = ({repositoryId, title, pagesUrl, listed, protected:keep}) => ({repositoryId, title, pagesUrl, listed, protected:keep});

// Legacy pilot grants remain independent until the owner migrates them. An
// unavailable central authority must not silently downgrade an account and
// trigger replacement of a listing which belongs to a paid/granted allowance.
async function effectiveListingLimit(account, env, getEntitlementsStore) {
  const legacy = listingLimit(account, env);
  if (legacy === 10) return legacy;
  if (!env.ZERO_ENTITLEMENTS_DATABASE_URL) return legacy;
  const authority = getEntitlementsStore(env);
  if (!authority) throw new Error('Entitlement authority unavailable');
  const decision = await authority.resolve(account);
  if (![1, 10].includes(decision?.listingLimit)) throw new Error('Invalid entitlement decision');
  return decision.listingLimit;
}

export async function hubListingsResponse(request, {
  env = process.env, getStore = configuredListingsStore, tokenOwner = checkListingToken,
  verify = verifyListingPublication, getEntitlementsStore = configuredEntitlementStore
} = {}) {
  try {
    const store = getStore(env);
    if (!store) return json({error:'App listings are unavailable.'}, 404);
    const config = hubConfig(env);
    if (!config) return unavailable();
    const authorization = request.headers.get('authorization');
    const desktop = authorization !== null;
    const session = desktop ? null : await readSession(request, config, Date.now(), env);
    if (request.method === 'GET') {
      if (!session) return authRequired();
      const before = new URL(request.url).searchParams.get('before');
      if (before !== null && !listingId(before)) return invalid();
      const page = await store.mine(session.id, before);
      // Management does not require an entitlement decision. Keep existing
      // cards removable during an authority outage without guessing a limit.
      let limit = null;
      try { limit = await effectiveListingLimit(session.id, env, getEntitlementsStore); } catch { /* unknown until authority recovers */ }
      return json({account:session.id, limit, projects:page.projects.map(ownerDto), next:page.next});
    }
    if (request.method !== 'POST') return invalid();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]);
    let token;
    let account;
    if (desktop) {
      if (request.headers.has('origin')) return invalid();
      token = /^Bearer (ghu_[A-Za-z0-9_]{10,512})$/.exec(authorization)?.[1];
      if (!token) return authRequired();
    } else {
      if (!session) return authRequired();
      if (!sameOrigin(request, config) || !equalSecret(request.headers.get('x-hub-csrf'), session.csrf))
        return json({error:'Reload ZeroHub and try again.'}, 403);
      account = session.id;
      token = session.token;
    }
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return invalid();
    let body;
    try { body = await boundedJson(request, 4096); } catch { return invalid(); }
    if (desktop) {
      const receipt = listingReceipt(body);
      if (body?.action !== 'publish' || !receipt) return invalid();
      account = await tokenOwner(token, config, signal);
      if (!account) return authRequired();
      const publication = await verify(receipt, {account, token, signal});
      if (!publication) return json({error:'The published app could not be verified.'}, 409);
      signal.throwIfAborted();
      const limit = await effectiveListingLimit(account, env, getEntitlementsStore);
      signal.throwIfAborted();
      return json(await store.savePublication(account, limit, publication));
    }
    if (!manageActions.has(body?.action) || !listingId(body.repositoryId)) return invalid();
    if (body.action === 'list') {
      const receipt = await store.owned(account, body.repositoryId);
      if (!receipt) return json({error:'This app is unavailable.'}, 404);
      const publication = await verify(receipt, {account, token, signal});
      if (!publication) return json({error:'The published app could not be verified. Publish it again in Zero.'}, 409);
      signal.throwIfAborted();
      const limit = await effectiveListingLimit(account, env, getEntitlementsStore);
      signal.throwIfAborted();
      const result = await store.savePublication(account, limit, publication, {restore:true});
      if (result.status === 'missing') return json({error:'This app is unavailable.'}, 404);
      return json(result);
    }
    signal.throwIfAborted();
    if (!await store.manage(account, body.repositoryId, body.action)) return json({error:'This app listing is unavailable.'}, 404);
    return json({status:'updated'});
  } catch { return unavailable(); }
}

export function hubListingCapabilityResponse(env = process.env) {
  return json({enabled:listingsEnabled(env) && !!env.ZERO_HUB_LISTINGS_DATABASE_URL &&
    !!listingRepositoryReader(env) && !!hubConfig(env)});
}

export async function hubPublicListingsResponse(request, {
  env = process.env, getStore = configuredListingsStore, visibilityReader = readJamHubVisibility,
  destinationReader, playReader = publicListingPlayUrl
} = {}) {
  const release = claimPublicHubRequest();
  if (!release) return unavailable();
  const controller = new AbortController();
  try {
    const store = getStore(env);
    if (!store) return json({projects:[], next:null});
    const config = hubConfig(env);
    const readDestination = destinationReader ?? listingRepositoryReader(env);
    if (!config || !readDestination) return unavailable();
    const params = new URL(request.url).searchParams;
    const before = params.get('before'), search = (params.get('q') ?? '').trim();
    const cursor = before === null ? null : unseal(before, pagePurpose, config);
    if (search.length > 200 || before !== null && (!validCursor(cursor?.order) || cursor.search !== search)) return invalid();

    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(12_000)]);
    const visibility = await hubVisibilityDecision({env, signal, visibilityReader});
    const visible = (entry, decision) => hubTargetVisible({kind:'game', repositoryId:entry.repositoryId}, decision);
    const excluded = visibility?.heldRepositoryIds?.() ?? [];
    let order = cursor?.order ?? null;
    let exhausted = false;
    const observed = [];
    // Find one extra authorized result before advertising another page.
    // Neither the count of hidden matches nor a raw row cursor leaves the server.
    for (let attempt = 0; attempt < 4 && !exhausted && observed.length <= listingPageSize; attempt++) {
      const candidates = await store.discover(order, search, excluded);
      exhausted = candidates.length <= listingPageSize;
      order = candidates.at(-1)?.order;
      for (let offset = 0; offset < candidates.length && observed.length <= listingPageSize; offset += 4) {
        signal.throwIfAborted();
        const checked = await Promise.all(candidates.slice(offset, offset+4).map(async entry => {
          if (!visible(entry, visibility) || !await readDestination(entry, {signal})) return null;
          return {...entry, playUrl:await playReader(entry, {signal})};
        }));
        observed.push(...checked.filter(Boolean));
      }
    }
    if (!exhausted && observed.length <= listingPageSize) return unavailable();
    const current = await store.stillListed(observed);
    const fresh = await hubVisibilityDecision({env, signal, visibilityReader});
    if ((visibility === null) !== (fresh === null)) return unavailable();
    assertJamVisibilityTime(fresh, Date.now, env);
    signal.throwIfAborted();
    const authorized = current.filter(entry => visible(entry, fresh));
    if (!exhausted && authorized.length <= listingPageSize) return unavailable();
    const page = authorized.slice(0, listingPageSize);
    const showAwards = jamsPreviewAvailable(env);
    return json({projects:page.map(entry => {
      const gameJamWinner = showAwards && fresh?.isGameJamWinner?.(entry.repositoryId, entry.accountId);
      return {id:entry.repositoryId, title:entry.title, author:entry.author, repositoryUrl:entry.repositoryUrl,
        pagesUrl:entry.playUrl, ...(gameJamWinner ? {gameJamWinner} : {})};
    }), next:authorized.length > listingPageSize ? seal({order:page.at(-1).order, search}, pagePurpose, config) : null});
  } catch { return unavailable(); }
  finally { controller.abort(); release(); }
}
