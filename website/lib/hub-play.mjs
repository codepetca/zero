import projects from '../content/projects.json' with {type:'json'};
import {maintainedTarget} from './hub-discovery.mjs';
import {hubConfig, json} from './hub-github-auth.mjs';
import {listingThumbnailPath} from './hub-listing-thumbnail.mjs';
import {listingRepositoryReader} from './hub-listings-github-app.mjs';
import {claimPublicHubRequest} from './hub-listings-http.mjs';
import {configuredListingsStore, listingsEnabled} from './hub-listings-store.mjs';
import {publicListingPlayUrl} from './hub-listings-verification.mjs';
import {projectPlayRef} from './hub-play-reference.mjs';
import {parseProjectPlayRef} from './hub-play-selector.mjs';
import {bindHubProjectDestination, canonicalPagesUrl, hubTargetVisible, hubVisibilityDecision} from './hub-project-status.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {assertJamVisibilityTime, readJamHubVisibility} from './jam-hub-visibility.mjs';
import {readCatalog} from './sharing-catalog.mjs';
import {playLink, selectReleases} from './sharing-client.mjs';

const missing = () => json({error:'Project unavailable.'}, 404);
const unavailable = () => json({error:'Could not check this project. Try again.'}, 503);
const visibilityUnavailable = () => json({code:'visibility-unavailable',error:'Could not confirm project visibility.'},503);
let backgroundChecks = 0;

async function checkPage(url, {signal}) {
  const response = await fetch(url, {method:'HEAD', redirect:'manual', cache:'no-store', credentials:'omit', signal});
  try {
    if (response.redirected || response.url && response.url !== url) return 'unknown';
    if (response.ok) return 'reachable';
    return [404,410].includes(response.status) || response.status >= 500 ? 'unreachable' : 'unknown';
  } finally { await response.body?.cancel(); }
}

// Share only a short provider observation for the exact publication. Each
// waiting request owns its own source binding, list membership and Jam decision.
// A tab closing cannot cancel a probe another tab is about to use.
export function createPlayObservationReader({pageReader=checkPage, listingPlayReader=publicListingPlayUrl,
  now=()=>performance.now()}={}) {
  const ready = new Map(), pending = new Map();
  return async (ref, lane, record, url) => {
    const cached = ready.get(ref);
    if (cached && cached.expires > now()) return cached;
    ready.delete(ref);
    if (pending.has(ref)) return pending.get(ref);
    if (pending.size >= 4) throw new Error('Site checks are busy.');
    const timeout = createHubRequestDeadline({budgetMs:3500});
    const probe = timeout.run(async signal => {
      if (lane === 'listing') return await listingPlayReader(record, {signal}) === url ? 'reachable' : 'unknown';
      return pageReader(url, {signal});
    }).catch(()=>'unknown').then(siteStatus => {
      const result = {siteStatus, expires:now()+30_000};
      if (siteStatus === 'reachable') {
        ready.set(ref, result);
        if (ready.size > 128) ready.delete(ready.keys().next().value);
      }
      return result;
    }).finally(()=>{timeout.dispose(); pending.delete(ref);});
    pending.set(ref, probe);
    return probe;
  };
}
const readObservation = createPlayObservationReader();

export async function hubPlayResponse(request, {env=process.env, visibilityReader=readJamHubVisibility,
  destinationReader, listingDestinationReader, getStore=configuredListingsStore, projectRecords=projects,
  catalogReader=readCatalog, observationReader=readObservation, decisionNow=Date.now, responseBudgetMs=14_000}={}) {
  const query = new URL(request.url).searchParams;
  const ref = query.get('ref'), parsed = parseProjectPlayRef(ref);
  if (query.size !== 1 || !parsed) return json({error:'Invalid Play request.'},400);
  const {lane,id,runId} = parsed;
  const background = request.headers.get('X-ZeroHub-Background') === '1';
  if (background && backgroundChecks >= 2) return unavailable();
  const release = claimPublicHubRequest();
  if (!release) return unavailable();
  if (background) backgroundChecks++;
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs,signal:request.signal});
  let authorityPending = false, authorityFailed = false, first, latest;
  try {
    const readVisibility = async ({signal}) => {
      authorityPending = true;
      try {
        const decision = await hubVisibilityDecision({visibilityReader,env,signal});
        assertJamVisibilityTime(decision,decisionNow,env);
        if (first !== undefined && (first === null) !== (decision === null)) throw new Error('Visibility mode changed.');
        latest = decision;
        return decision;
      } catch (error) { authorityFailed=true; throw error; }
      finally { authorityPending=false; }
    };
    first = await deadline.run(readVisibility);
    let record, url, target;
    // Reread catalog membership for a release after any outstanding site probe.
    const readRelease = async signal => {
      const catalog = await catalogReader({env,signal});
      return selectReleases(catalog,{kind:'game'}).find(item=>item.id === id);
    };
    const bind = input => deadline.run(signal=>bindHubProjectDestination(input,first,{
      env, visibilityReader:readVisibility, destinationReader, signal, decisionNow, check:deadline.check
    }));
    let store, listingReader;
    if (lane === 'listing') {
      target = {kind:'game', repositoryId:id};
      if (!hubTargetVisible(target,first) || !listingsEnabled(env) || !hubConfig(env)) return missing();
      store = getStore(env);
      listingReader = listingDestinationReader ?? listingRepositoryReader(env);
      if (!store || !listingReader) return unavailable();
      const entries = await deadline.run(()=>store.listedForPlay(id,runId));
      record = entries.find(item=>item.repositoryId === id && projectPlayRef(lane,item) === ref);
      if (!record || !await deadline.run(signal=>listingReader(record,{signal}))) return missing();
      url = record.pagesUrl;
    } else {
      if (lane === 'maintained') {
        record = projectRecords.find(item=>item.id === id);
        target = maintainedTarget(record);
        url = target?.playUrl;
      } else {
        record = await deadline.run(readRelease);
        if (record) {
          url = playLink(record);
          target = {kind:'game', repositoryId:record.repository.id, ownerId:record.repository.ownerId,
            repositoryUrl:record.repository.url, playUrl:url};
        }
      }
      if (!target || !url) return missing();
      target = await bind(target);
      if (!target) return missing();
      // Maintained records may acquire their immutable owner ID during binding.
      if (lane === 'maintained') record = {...record, ownerId:target.ownerId};
      if (projectPlayRef(lane,record) !== ref) return missing();
    }
    // Reviewed noncanonical URLs are browser destinations. Only the canonical
    // GitHub-controlled address is eligible for a server-side health request.
    const canonical = canonicalPagesUrl(lane === 'listing' ? record.repositoryUrl : target.repositoryUrl);
    const observation = url === canonical
      ? await deadline.run(()=>observationReader(ref,lane,record,url))
      : {siteStatus:'not-checked'};
    if (lane === 'listing') {
      if (!await deadline.run(signal=>listingReader(record,{signal})) ||
          !(await deadline.run(()=>store.stillListed([record]))).length) return missing();
    } else {
      if (lane === 'release') {
        const current = await deadline.run(readRelease);
        if (!current || projectPlayRef(lane,current) !== ref) return missing();
      }
      if (!await bind(target)) return missing();
    }
    const final = await deadline.run(readVisibility);
    if (!hubTargetVisible(target,final)) return missing();
    const available = observation.siteStatus === 'reachable' || observation.siteStatus === 'not-checked';
    const freshForMs = observation.expires === undefined ? 30_000 : Math.max(0,Math.floor(observation.expires - performance.now()));
    if (available && freshForMs === 0) return unavailable();
    const result = {url:available ? url : null, siteStatus:observation.siteStatus, freshForMs,
      ...(available && lane === 'listing' ? {thumbnail:listingThumbnailPath(record.repositoryId,record.commit)} : {}),
      ...(available && lane !== 'listing' ? {projectId:id} : {})};
    deadline.check();
    try { assertJamVisibilityTime(final,decisionNow,env); }
    catch { return visibilityUnavailable(); }
    return json(result);
  } catch {
    // A nested source binder also samples the clock after its final lookup.
    if (latest !== undefined) try { assertJamVisibilityTime(latest,decisionNow,env); }
    catch { return visibilityUnavailable(); }
    return authorityFailed || authorityPending ? visibilityUnavailable() : unavailable();
  }
  finally { deadline.dispose(); release(); if (background) backgroundChecks--; }
}
