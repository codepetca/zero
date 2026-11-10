import {createHash} from 'node:crypto';
import contracts from '../../extension/src/sharing/contracts.js';
import projects from '../content/projects.json' with {type:'json'};
import previews from '../content/project-previews.json' with {type:'json'};
import authors from '../content/release-authors.json' with {type:'json'};
import {hubDiscoveryResponse, maintainedTarget, presentationFor, MAX_MAINTAINED_DISCOVERY_PROJECTS} from './hub-discovery.mjs';
import {readCatalog} from './sharing-catalog.mjs';
import {selectMaintainedProjects, selectReleases} from './sharing-client.mjs';
import {hubTargetVisible, hubVisibilityDecision} from './hub-project-status.mjs';
import {readJamHubVisibility, assertJamVisibilityTime} from './jam-hub-visibility.mjs';
import {claimPublicHubRequest, readProjectListingPage} from './hub-listings-http.mjs';
import {listingsEnabled} from './hub-listings-store.mjs';
import {hubConfig, json, seal, unseal} from './hub-github-auth.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';

export const PROJECT_PAGE_SIZE = 24;
const SCAN_LIMIT = 96;
const ORDER_MAX = 9223372036854775807n;
const CURSOR_PURPOSE = 'project-discovery-listing';
const error = () => json({error:'ZeroHub projects are temporarily unavailable. Try again.'}, 503);
const invalid = () => json({error:'Invalid Projects page.'}, 400);
const restart = () => json({code:'restart',error:'Projects changed. Return to the first page.'}, 409);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function readCursor(token, search) {
  if (!token || !/^[A-Za-z0-9_-]{1,2048}$/.test(token)) return null;
  try {
    const cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (cursor?.v !== 1 || cursor.search !== hash(search) || !/^[a-f0-9]{64}$/.test(cursor.revision) ||
        typeof cursor.position !== 'string' || cursor.position.length > 1200 ||
        typeof cursor.listing !== 'boolean') return null;
    if (!cursor.listing) {
      const key = JSON.parse(cursor.position);
      if (!Array.isArray(key) || key.length!==3 || ![0,1].includes(key[0]) ||
          typeof key[1]!=='string' || key[1].length>160 || !/^[a-z0-9-]{1,128}$/.test(key[2])) return null;
    }
    return cursor;
  } catch { return null; }
}

function writeCursor(search, revision, position, listing) {
  return Buffer.from(JSON.stringify({v:1,search:hash(search),revision,position,listing})).toString('base64url');
}

const maintainedKey = project => `m:${project.id}`;
const releaseKey = release => `r:${release.id}@${release.version}`;
const sortPosition = (lane, {title,id}) => JSON.stringify([lane,title.replace(/[\u0000-\u001f]/g,' ').toLowerCase().slice(0,160),id]);
const publicRelease = release => ({kind:'game',repositoryId:release.repository.id});
const publicListing = entry => ({kind:'game',repositoryId:entry.repositoryId});

function selectCandidates(projectRecords, catalog, search) {
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
  const candidates = maintained.map(target=>({key:maintainedKey(target),position:sortPosition(0,target),target,project:original.get(target.id).project}));
  for (const release of releases) {
    candidates.push({key:releaseKey(release),position:sortPosition(1,release),target:publicRelease(release),release});
  }
  candidates.sort((left,right)=>left.position<right.position?-1:left.position>right.position?1:0);
  return candidates;
}

function listingDto(entry, visibility, env) {
  const winner = jamsPreviewAvailable(env) && visibility?.isGameJamWinner?.(entry.repositoryId, entry.accountId);
  return {id:entry.repositoryId,title:entry.title,author:entry.author,repositoryUrl:entry.repositoryUrl,
    identity:hash([entry.repositoryId,entry.accountId,entry.repositoryUrl,entry.pagesUrl,entry.commit,entry.runId]),
    ...(entry.playUrl ? {pagesUrl:entry.playUrl} : {}), ...(winner ? {gameJamWinner:true} : {})};
}

/** Only the page and lookahead receive destination checks. The cursor selects
 * a position in a validated catalog, and never authorizes a visibility result. */
export async function hubProjectPageResponse(request, {env=process.env, catalogReader=readCatalog,
  visibilityReader=readJamHubVisibility, destinationReader, pagesBindingReader, projects:projectRecords=projects,
  previews:previewRecords=previews, authors:authorRecords=authors, getStore, listingDestinationReader, playReader,
  responseBudgetMs=18_000, decisionNow=Date.now}={}) {
  const params = new URL(request.url).searchParams;
  const search = (params.get('q') ?? '').trim();
  const cursorValue = params.get('cursor');
  const revalidate = params.get('revalidate');
  if (search.length > 200 || [...params.keys()].some(key=>!['q','cursor','revalidate'].includes(key) || params.getAll(key).length!==1) ||
      revalidate !== null && revalidate !== '1') return invalid();
  const cursor = cursorValue === null ? null : readCursor(cursorValue, search);
  if (cursorValue !== null && !cursor) return invalid();
  const config = listingsEnabled(env) ? hubConfig(env) : null;
  const includeListings = config!==null;
  let listingBefore = null;
  if (cursor?.listing) {
    if (!includeListings || !config) return restart();
    const position = unseal(cursor.position,CURSOR_PURPOSE,config);
    if (position?.revision !== cursor.revision || position.search !== cursor.search ||
        !/^[1-9][0-9]{0,18}$/.test(position.order) || BigInt(position.order)>ORDER_MAX) return invalid();
    listingBefore = position.order;
  }
  const releaseAdmission = claimPublicHubRequest();
  if (!releaseAdmission) return error();
  const started = performance.now();
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs,signal:request.signal});
  try {
    let initial;
    const readVisibility = async ({signal}={}) => {
      const value = await hubVisibilityDecision({visibilityReader,env,signal});
      assertJamVisibilityTime(value,decisionNow,env);
      if (initial!==undefined && (initial===null)!==(value===null)) throw new Error('Visibility mode changed.');
      return value;
    };
    initial = await deadline.run(signal=>readVisibility({signal}));
    let catalog = null;
    const catalogDeadline = createHubRequestDeadline({budgetMs:Math.min(8000,responseBudgetMs),signal:deadline.signal});
    try { catalog = contracts.validateCatalog(await catalogDeadline.run(signal=>catalogReader({env,signal}))); }
    catch { deadline.check(); }
    finally { catalogDeadline.dispose(); }
    const candidates = selectCandidates(projectRecords,catalog,search);
    const revision = hash([catalog,projectRecords,includeListings]);
    if (cursor && cursor.revision!==revision) return restart();

    // A client can provide an arbitrary sort boundary. Never disclose whether
    // its guessed position belongs to a project that visibility would hide.
    const eligible = cursor?.listing ? [] : candidates.filter(item=>(!cursor || item.position>cursor.position) && hubTargetVisible(item.target,initial));
    const confirmed = [];
    let scanned = 0;
    while (scanned<eligible.length && scanned<SCAN_LIMIT && confirmed.length<=PROJECT_PAGE_SIZE) {
      const limit = Math.min(PROJECT_PAGE_SIZE+1-confirmed.length,SCAN_LIMIT-scanned);
      const window = eligible.slice(scanned,scanned+limit);
      scanned += window.length;
      const response = await deadline.run(signal=>hubDiscoveryResponse(new Request(new URL('/api/hub/discovery',request.url),{signal}),{
        env,visibilityReader:readVisibility,destinationReader,pagesBindingReader,decisionNow,
        projects:window.flatMap(item=>item.project?[item.project]:[]),previews:[],authors:[],
        catalogReader:async()=>({...catalog,schema:1,revision:catalog?.revision ?? '0'.repeat(40),
          releases:window.flatMap(item=>item.release?[item.release]:[])})
      }));
      if (!response.ok) throw new Error('Project projection unavailable.');
      const projection = await deadline.run(()=>response.json());
      if (projection.catalog===null) throw new Error('Project projection unavailable.');
      const bound = new Map([
        ...projection.maintained.map(project=>[maintainedKey(project),{project,target:{...project,kind:'game'}}]),
        ...projection.catalog.releases.map(release=>[releaseKey(release),{release,target:publicRelease(release)}])
      ]);
      for (const {key,position} of window) {
        if (bound.has(key)) confirmed.push({position,...bound.get(key)});
      }
    }
    if (scanned<eligible.length && confirmed.length<=PROJECT_PAGE_SIZE) return error();
    let moreUnscanned = scanned<eligible.length;
    if (includeListings && confirmed.length<=PROJECT_PAGE_SIZE) {
      const limit = Math.max(1,PROJECT_PAGE_SIZE-confirmed.length);
      const listing = await deadline.run(signal=>readProjectListingPage({env,signal,search,before:listingBefore,limit,
        visibility:initial,getStore,destinationReader:listingDestinationReader,playReader,
        checkPlay:revalidate==='1' && confirmed.length<PROJECT_PAGE_SIZE,
        playBudgetMs:()=>Math.min(4000,Math.max(0,responseBudgetMs-(performance.now()-started)-3500))}));
      for (const entry of listing.lookahead ? [...listing.entries,listing.lookahead] : listing.entries)
        confirmed.push({entry,target:publicListing(entry)});
      moreUnscanned ||= listing.more;
    } else if (includeListings) {
      moreUnscanned = true;
    }
    const final = await deadline.run(signal=>readVisibility({signal}));
    const visible = confirmed.filter(item=>hubTargetVisible(item.target,final));
    if (visible.length<=PROJECT_PAGE_SIZE && moreUnscanned) return error();
    const page = visible.slice(0,PROJECT_PAGE_SIZE);
    let next = null;
    if (visible.length>PROJECT_PAGE_SIZE) {
      const last = page.at(-1);
      if (last.entry && !config) return error();
      const position = last.entry ? seal({order:last.entry.order,revision,search:hash(search)},CURSOR_PURPOSE,config) : last.position;
      next = writeCursor(search,revision,position,!!last.entry);
    }
    const projectedCatalog = catalog && {schema:1,revision:catalog.revision,releases:page.flatMap(item=>item.release?[item.release]:[])};
    const result = {schema:1,maintained:page.flatMap(item=>item.project?[item.project]:[]),
      catalog:projectedCatalog,presentation:presentationFor(projectedCatalog,previewRecords,authorRecords),
      listings:page.flatMap(item=>item.entry?[listingDto(item.entry,final,env)]:[]),next};
    deadline.check();
    assertJamVisibilityTime(final,decisionNow,env);
    return json(result);
  } catch { return error(); }
  finally { deadline.dispose(); releaseAdmission(); }
}
