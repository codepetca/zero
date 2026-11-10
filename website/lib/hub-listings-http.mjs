import {boundedJson, equalSecret, hubConfig, json, readSession, sameOrigin} from './hub-github-auth.mjs';
import {configuredListingsStore, listingLimit} from './hub-listings-store.mjs';
import {checkListingToken, listingId, listingReceipt, verifyListingPublication} from './hub-listings-verification.mjs';
import {readJamDestinationBinding} from './jam-destination-binding.mjs';
import {assertJamVisibilityTime, readJamHubVisibility} from './jam-hub-visibility.mjs';
import {hubVisibilityDecision, hubTargetVisible} from './hub-project-status.mjs';

const unavailable = () => json({error:'ZeroHub listings are temporarily unavailable. Try again.'}, 503);
const authRequired = () => json({error:'Sign in with GitHub to manage your listings.'}, 401);
const invalid = () => json({error:'Invalid listing request.'}, 400);
const validCursor = value => listingId(value) && BigInt(value) <= 9223372036854775807n;
const manageActions = new Set(['protect', 'unprotect', 'move', 'unlist', 'list']);
const ownerDto = ({repositoryId, title, pagesUrl, listed, protected:keep}) => ({repositoryId, title, pagesUrl, listed, protected:keep});

export async function hubListingsResponse(request, {
  env = process.env, getStore = configuredListingsStore, tokenOwner = checkListingToken,
  verify = verifyListingPublication
} = {}) {
  try {
    const store = getStore(env);
    if (!store) return json({error:'Listings are unavailable.'}, 404);
    const config = hubConfig(env);
    if (!config) return unavailable();
    const authorization = request.headers.get('authorization');
    const desktop = authorization !== null;
    const session = desktop ? null : readSession(request, config);
    if (request.method === 'GET') {
      if (!session) return authRequired();
      return json({account:session.id, limit:listingLimit(session.id, env), projects:(await store.mine(session.id)).map(ownerDto)});
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
      if (!publication) return json({error:'The published project could not be verified.'}, 409);
      signal.throwIfAborted();
      return json(await store.savePublication(account, listingLimit(account, env), publication));
    }
    if (!manageActions.has(body?.action) || !listingId(body.repositoryId)) return invalid();
    if (body.action === 'list') {
      const receipt = await store.owned(account, body.repositoryId);
      if (!receipt) return json({error:'This project is unavailable.'}, 404);
      const publication = await verify(receipt, {account, token, signal});
      if (!publication) return json({error:'The published project could not be verified. Publish it again in Zero.'}, 409);
      signal.throwIfAborted();
      const result = await store.savePublication(account, listingLimit(account, env), publication, {restore:true});
      if (result.status === 'missing') return json({error:'This project is unavailable.'}, 404);
      return json(result);
    }
    signal.throwIfAborted();
    if (!await store.manage(account, body.repositoryId, body.action)) return json({error:'This listing is unavailable.'}, 404);
    return json({status:'updated'});
  } catch { return unavailable(); }
}

export async function hubPublicListingsResponse(request, {
  env = process.env, getStore = configuredListingsStore, visibilityReader = readJamHubVisibility,
  destinationReader = readJamDestinationBinding
} = {}) {
  try {
    const store = getStore(env);
    if (!store) return json({projects:[], next:null});
    const params = new URL(request.url).searchParams;
    const before = params.get('before'), search = (params.get('q') ?? '').trim();
    if ((before !== null && !validCursor(before)) || search.length > 200) return invalid();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]);
    const visibility = await hubVisibilityDecision({env, signal, visibilityReader});
    const visible = (entry, decision) => hubTargetVisible({kind:'game', repositoryId:entry.repositoryId}, decision);
    const page = await store.discover(before, search);
    const observed = await Promise.all(page.entries.filter(entry => visible(entry, visibility)).map(async entry => {
      try {
        const binding = await destinationReader(entry.repositoryUrl, {signal});
        return binding.repositoryId === entry.repositoryId && binding.ownerId === entry.accountId ? entry : null;
      } catch { return null; }
    }));
    const current = await store.stillListed(observed.filter(Boolean));
    const fresh = await hubVisibilityDecision({env, signal, visibilityReader});
    if ((visibility === null) !== (fresh === null)) return unavailable();
    assertJamVisibilityTime(fresh, Date.now, env);
    signal.throwIfAborted();
    return json({projects:current.filter(entry => visible(entry, fresh)).map(entry => ({
      id:entry.repositoryId, title:entry.title, author:entry.author, repositoryUrl:entry.repositoryUrl, pagesUrl:entry.pagesUrl
    })), next:page.next});
  } catch { return unavailable(); }
}
