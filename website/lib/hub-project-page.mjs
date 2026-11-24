import {listingThumbnailPath} from './hub-listing-thumbnail.mjs';
import {createHash} from 'node:crypto';
import contracts from '../../extension/src/sharing/contracts.js';
import projects from '../content/projects.json' with {type:'json'};
import previews from '../content/project-previews.json' with {type:'json'};
import sharedGameDates from '../content/shared-game-publication-dates.json' with {type:'json'};
import authors from '../content/release-authors.json' with {type:'json'};
import {hubDiscoveryResponse, maintainedTarget, presentationFor, MAX_MAINTAINED_DISCOVERY_PROJECTS} from './hub-discovery.mjs';
import {readCatalog} from './sharing-catalog.mjs';
import {selectMaintainedProjects, selectReleases} from './sharing-client.mjs';
import {hubTargetVisible, hubVisibilityDecision} from './hub-project-status.mjs';
import {readJamHubVisibility, assertJamVisibilityTime} from './jam-hub-visibility.mjs';
import {bindProjectListingEntries, claimPublicHubRequest, observeProjectListingPlay} from './hub-listings-http.mjs';
import {configuredListingsStore, listingsEnabled} from './hub-listings-store.mjs';
import {hubConfig, json, seal, unseal} from './hub-github-auth.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {createOpensStore,listingOpenId} from './hub-opens.mjs';
import {projectPlayRef} from './hub-play-reference.mjs';

export const PROJECT_PAGE_SIZE = 24;
const SCAN_LIMIT = 96;
const ORDER_MAX = 9223372036854775807n;
const CURSOR_PURPOSE = 'project-discovery-listing';
const error = () => json({error:'ZeroHub projects are temporarily unavailable. Try again.'}, 503);
const invalid = () => json({error:'Invalid Projects page.'}, 400);
const restart = () => json({code:'restart',error:'Projects changed. Return to the first page.'}, 409);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function readCursor(token, search, config) {
  if (!token || !/^[A-Za-z0-9_-]{1,2048}$/.test(token)) return null;
  try {
    const cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (cursor?.search !== hash(search) || !/^[a-f0-9]{64}$/.test(cursor.revision)) return null;
    if (cursor.v === 1 || cursor.v === 2 && cursor.sealed !== !!config) return {restart:true};
    if (cursor.v !== 2 || typeof cursor.position !== 'string') return null;
    const decoded = config ? unseal(cursor.position,CURSOR_PURPOSE,config) : JSON.parse(cursor.position);
    if (decoded?.search !== cursor.search || decoded.revision !== cursor.revision) return null;
    const position = decoded.position;
    if (!Array.isArray(position) || position.length !== 3) return null;
    const [time,lane,key] = position;
    if (!Number.isSafeInteger(time) || time < 0 || time > 8.64e15 || ![0,1,2].includes(lane) || typeof key !== 'string') return null;
    if (lane === 2 ? !config || time === 0 || !/^[1-9][0-9]{0,18}$/.test(key) || BigInt(key) > ORDER_MAX
      : !/^[a-z0-9:@.-]{1,180}$/.test(key)) return null;
    return {revision:cursor.revision,position};
  } catch { return null; }
}

function writeCursor(search, revision, position, config) {
  const payload = {search:hash(search),revision,position};
  return Buffer.from(JSON.stringify({v:2,search:payload.search,revision,sealed:!!config,
    position:config ? seal(payload,CURSOR_PURPOSE,config) : JSON.stringify(payload)})).toString('base64url');
}

const maintainedKey = project => `m:${project.id}`;
const releaseKey = release => `r:${release.id}@${release.version}`;
const listingKey = entry => `l:${entry.repositoryId}`;
const epoch = value => {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isSafeInteger(time) && time > 0 ? time : 0;
};

// Equal dates keep a stable order across sources and listing pages.
function comparePosition(left,right) {
  const [leftTime,leftLane,leftKey] = left;
  const [rightTime,rightLane,rightKey] = right;
  if (leftTime !== rightTime) return rightTime - leftTime;
  if (leftLane !== rightLane) return leftLane - rightLane;
  if (leftKey === rightKey) return 0;
  return leftLane === 2 ? (BigInt(leftKey) > BigInt(rightKey) ? -1 : 1) : (leftKey < rightKey ? -1 : 1);
}

function listingPosition(entry) {
  const time = epoch(entry.runCreatedAt);
  if (!time) throw new Error('Invalid listing publication date.');
  return [time,2,entry.order];
}

const publicRelease = release => ({kind:'game',repositoryId:release.repository.id});
const publicListing = entry => ({kind:'game',repositoryId:entry.repositoryId});

function selectCandidates(projectRecords, catalog, search, dates) {
  if (!Array.isArray(projectRecords) || projectRecords.length > MAX_MAINTAINED_DISCOVERY_PROJECTS)
    throw new Error('Invalid maintained projects.');
  const original = new Map();
  for (const project of projectRecords) {
    const target = maintainedTarget(project);
    if (!target) continue;
    if (original.has(target.id)) throw new Error('Duplicate maintained project.');
    original.set(target.id, {project,target});
  }
  const maintained = selectMaintainedProjects([...original.values()].map(item=>item.target), {search});
  const releases = catalog ? selectReleases(catalog, {kind:'game',search}) : [];
  const candidates = maintained.map(target=>{
    const {project} = original.get(target.id);
    const key = maintainedKey(target);
    return {key,position:[epoch(project.publishedAt),0,key],target,project};
  });
  for (const release of releases) {
    const key = releaseKey(release);
    candidates.push({key,position:[epoch(dates[key.slice(2)]),1,key],target:publicRelease(release),release});
  }
  candidates.sort((left,right)=>comparePosition(left.position,right.position));
  return candidates;
}

function listingDto(entry, visibility, env, opens) {
  const winner = jamsPreviewAvailable(env) && visibility?.isGameJamWinner?.(entry.repositoryId, entry.accountId);
  return {id:entry.repositoryId,title:entry.title,author:entry.author,repositoryUrl:entry.repositoryUrl,
    identity:hash([entry.repositoryId,entry.accountId,entry.repositoryUrl,entry.pagesUrl,entry.commit,entry.runId]),
    playRef:projectPlayRef('listing',entry),
    ...(Number.isSafeInteger(opens) && opens >= 0 ? {opens} : {}),
    stars:entry.feedback?.stars ?? null, issuesEnabled:entry.feedback?.issuesEnabled ?? null,
    ...(entry.playUrl ? {pagesUrl:entry.playUrl, thumbnail:listingThumbnailPath(entry.repositoryId, entry.commit)} : {}),
    ...(winner ? {gameJamWinner:true} : {})};
}

/** Only the page and lookahead receive destination checks. The cursor selects
 * a position in a validated catalog, and never authorizes a visibility result. */
export async function hubProjectPageResponse(request, {env=process.env, catalogReader=readCatalog,
  visibilityReader=readJamHubVisibility, destinationReader, pagesBindingReader, projects:projectRecords=projects,
  previews:previewRecords=previews, authors:authorRecords=authors, releaseDates=sharedGameDates,
  getStore=configuredListingsStore, listingDestinationReader, playReader, opensStore=createOpensStore({env}),
  responseBudgetMs=18_000, decisionNow=Date.now}={}) {
  const params = new URL(request.url).searchParams;
  const search = (params.get('q') ?? '').trim();
  const cursorValue = params.get('cursor');
  const revalidate = params.get('revalidate');
  if (search.length > 200 || [...params.keys()].some(key=>!['q','cursor','revalidate'].includes(key) || params.getAll(key).length!==1) ||
      revalidate !== null && revalidate !== '1') return invalid();
  const config = listingsEnabled(env) ? hubConfig(env) : null;
  const cursor = cursorValue === null ? null : readCursor(cursorValue, search, config);
  if (cursorValue !== null && !cursor) return invalid();
  if (cursor?.restart) return restart();
  const after = cursor?.position;
  const listingBefore = after ? {publishedAt:new Date(after[0]).toISOString(),order:after[1]===2 ? after[2] : null} : null;
  const releaseAdmission = claimPublicHubRequest();
  if (!releaseAdmission) return error();
  const started = performance.now();
  const optionalBudget = ceiling => Math.min(ceiling,Math.max(0,responseBudgetMs-(performance.now()-started)-3500));
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs,signal:request.signal});
  try {
    let initial;
    const readVisibility = async ({signal}={}) => {
      const value = await hubVisibilityDecision({visibilityReader,env,signal});
      assertJamVisibilityTime(value,decisionNow,env);
      if (initial!==undefined && (initial===null)!==(value===null)) throw new Error('Visibility mode changed.');
      return value;
    };
    const catalogDeadline = createHubRequestDeadline({budgetMs:Math.min(8000,responseBudgetMs),signal:deadline.signal});
    const [visibility, catalog] = await Promise.all([
      deadline.run(signal=>readVisibility({signal})),
      catalogDeadline.run(signal=>catalogReader({env,signal}))
        .then(contracts.validateCatalog)
        .catch(()=>{deadline.check(); return null;})
        .finally(()=>catalogDeadline.dispose())
    ]);
    initial = visibility;
    const candidates = selectCandidates(projectRecords,catalog,search,releaseDates);
    const revision = hash([catalog,projectRecords,releaseDates,!!config]);
    if (cursor && cursor.revision!==revision) return restart();

    const eligible = candidates.filter(item=>(!after || comparePosition(item.position,after)>0) && hubTargetVisible(item.target,initial));
    const store = config ? getStore(env) : null;
    const excluded = initial?.heldRepositoryIds?.() ?? [];
    const listingRows = [];
    let nextListingCursor = listingBefore;
    let listingsExhausted = !store;
    let catalogIndex = 0;
    let scanned = 0;
    const confirmed = [];
    const listingFailures = new Map();

    // Merge raw candidates first so repository checks are spent on the page
    // and its lookahead. Refill either lane only when the merge needs it.
    while (confirmed.length <= PROJECT_PAGE_SIZE && scanned < SCAN_LIMIT) {
      const window = [];
      const limit = Math.min(PROJECT_PAGE_SIZE+1-confirmed.length,SCAN_LIMIT-scanned);
      while (window.length < limit) {
        if (!listingRows.length && !listingsExhausted) {
          const rows = await deadline.run(()=>store.discover(nextListingCursor,search,excluded,PROJECT_PAGE_SIZE+1,{byPublication:true}));
          listingRows.push(...rows.map(entry=>({key:listingKey(entry),position:listingPosition(entry),entry,target:publicListing(entry)})));
          listingsExhausted = rows.length < PROJECT_PAGE_SIZE+1;
          const last = rows.at(-1);
          if (last) nextListingCursor = {publishedAt:last.runCreatedAt,order:last.order};
        }
        const catalogItem = eligible[catalogIndex];
        const listingItem = listingRows[0];
        if (!catalogItem && !listingItem) break;
        if (listingItem && (!catalogItem || comparePosition(listingItem.position,catalogItem.position)<0)) {
          window.push(listingRows.shift());
        } else {
          window.push(catalogItem);
          catalogIndex++;
        }
      }
      if (!window.length) break;
      scanned += window.length;
      const catalogWindow = window.filter(item=>!item.entry);
      const bound = new Map();
      if (catalogWindow.length) {
        const response = await deadline.run(signal=>hubDiscoveryResponse(new Request(new URL('/api/hub/discovery',request.url),{signal}),{
          env,visibilityReader:readVisibility,destinationReader,pagesBindingReader,decisionNow,
          projects:catalogWindow.flatMap(item=>item.project?[item.project]:[]),previews:[],authors:[],
          catalogReader:async()=>({...catalog,schema:1,revision:catalog?.revision ?? '0'.repeat(40),
            releases:catalogWindow.flatMap(item=>item.release?[item.release]:[])})
        }));
        if (!response.ok) throw new Error('Project projection unavailable.');
        const projection = await deadline.run(()=>response.json());
        if (projection.catalog===null) throw new Error('Project projection unavailable.');
        for (const project of projection.maintained) bound.set(maintainedKey(project),{project,target:{...project,kind:'game'}});
        for (const release of projection.catalog.releases) bound.set(releaseKey(release),{release,target:publicRelease(release)});
      }
      const listingWindow = window.flatMap(item=>item.entry?[item.entry]:[]);
      const linkedListings = new Map();
      if (listingWindow.length) {
        const entries = await deadline.run(signal=>bindProjectListingEntries(listingWindow,{
          env,signal,visibility:initial,destinationReader:listingDestinationReader,
          onUnavailable:reason=>listingFailures.set(reason,(listingFailures.get(reason) ?? 0)+1)
        }));
        for (const entry of entries) linkedListings.set(entry.order,entry);
      }
      for (const {key,position,entry,target} of window) {
        if (entry) {
          const linked = linkedListings.get(entry.order);
          if (linked) confirmed.push({key,position,entry:linked,target});
        } else if (bound.has(key)) confirmed.push({key,position,...bound.get(key)});
      }
    }
    if (listingFailures.size && env.VERCEL_ENV==='production')
      console.warn('ZeroHub listing bindings unavailable',Object.fromEntries(listingFailures));
    const moreUnscanned = catalogIndex < eligible.length || listingRows.length > 0 || !listingsExhausted;
    if (store && revalidate==='1') {
      const shown = confirmed.slice(0,PROJECT_PAGE_SIZE).filter(item=>item.entry);
      const entries = shown.map(item=>item.entry);
      await deadline.run(signal=>observeProjectListingPlay(entries,{signal,playReader,
        playBudgetMs:()=>optionalBudget(4000)}));
      shown.forEach((item,index)=>{item.entry=entries[index];});
    }
    const verifiedListings = confirmed.flatMap(item=>item.entry?[item.entry]:[]);
    const opens = new Map();
    const countBudget = optionalBudget(1000);
    if (opensStore && verifiedListings.length && countBudget>0) {
      // Counts are optional and cannot delay the whole gallery on a slow store.
      const counterDeadline = createHubRequestDeadline({budgetMs:countBudget,signal:deadline.signal});
      try {
        const ids = [...new Set(verifiedListings.filter(entry=>projectPlayRef('listing',entry)).map(listingOpenId))];
        const batches = Array.from({length:Math.ceil(ids.length/12)},(_,index)=>ids.slice(index*12,index*12+12));
        const results = await counterDeadline.run(()=>Promise.allSettled(batches.map(batch=>opensStore.counts(batch))));
        for (const result of results) if (result.status==='fulfilled') {
          for (const [id,count] of Object.entries(result.value)) opens.set(id,count);
        }
      } catch { deadline.check(); }
      finally { counterDeadline.dispose(); }
    }
    // Confirm the publication is still listed after destination and counter reads.
    const currentOrders = new Set(verifiedListings.length
      ? (await deadline.run(()=>store.stillListed(verifiedListings)))
        .map(entry=>entry.order) : []);
    const final = await deadline.run(signal=>readVisibility({signal}));
    const visible = confirmed.filter(item=>(!item.entry || currentOrders.has(item.entry.order)) && hubTargetVisible(item.target,final));
    if ((visible.length<=PROJECT_PAGE_SIZE && moreUnscanned) || (!visible.length && listingFailures.size)) return error();
    const page = visible.slice(0,PROJECT_PAGE_SIZE);
    const next = visible.length>PROJECT_PAGE_SIZE
      ? writeCursor(search,revision,page.at(-1).position,config) : null;
    const projectedCatalog = catalog && {schema:1,revision:catalog.revision,releases:page.flatMap(item=>
      item.release?[{...item.release,playRef:projectPlayRef('release',item.release)}]:[])};
    const result = {schema:1,maintained:page.flatMap(item=>
      item.project?[{...item.project,playRef:projectPlayRef('maintained',item.project)}]:[]),
      catalog:projectedCatalog,presentation:presentationFor(projectedCatalog,previewRecords,authorRecords),
      listings:page.flatMap(item=>item.entry?[listingDto(item.entry,final,env,opens.get(listingOpenId(item.entry)))]:[]),
      order:page.map(item=>item.key),next};
    deadline.check();
    assertJamVisibilityTime(final,decisionNow,env);
    return json(result);
  } catch { return error(); }
  finally { deadline.dispose(); releaseAdmission(); }
}
