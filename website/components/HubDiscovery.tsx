'use client';
import Link from 'next/link';
import {useEffect, useRef, useState, type ReactElement} from 'react';
import {useSearchParams} from 'next/navigation';
import {dependencySnippet, maintainedPlayLink, playLink, projectSummary, releaseAuthor, releaseImage, releaseSummary, selectMaintainedProjects, selectReleases, sourceLink} from '@/lib/sharing-client.mjs';
import styles from '@/app/hub/hub.module.css';
import {CodeBlock} from './CodeBlock';
import {Icon} from './Icon';
import {loadMetricBatches, metricLabel} from '@/lib/hub-metrics-client.mjs';
import {parseProjectPlayRef} from '@/lib/hub-play-selector.mjs';
import {HubProjectCard} from './HubProjectCard';
import {HubPublishedProjects} from './HubPublishedProjects';
import {HubProjectFeedback, HubProjectDetails, type ProjectFeedback} from './HubProjectFeedback';
type Artifact = {url:string; size:number; sha256:string};
type Component = {className:string; description:string; usage:string; api:string[]};
type Release = {playRef?:string;slug:string; kind:'library'|'game'; id:string; version:string; title:string; description:string; license:string; status:string; libraryKind?:string; namespace?:string; controls?:string; web?:{provider:'github-pages';url:string;commit:string;runId:number}; components?:Component[]; contributor:{login:string; githubId:string}; repository:{id?:string;ownerId?:string;url:string}; source:{commit:string; folder:string; sha256:string}; coordinate?:{groupId:string;artifactId:string;version:string}; artifacts:{zip?:Artifact;jar?:Artifact;sources?:Artifact;pom?:Artifact;preview?:Artifact}};
type Catalog = {schema:number;revision:string;releases:Release[]};
type MaintainedProject = {playRef?:string;id:string;title:string;description:string;author:string;repositoryId?:string;ownerId?:string;repositoryUrl:string;sourceCommit:string;image?:string;web?:{provider:'github-pages';url:string;commit:string;runId:number}};
type Presentation = {id:string;sourceCommit:string;image?:string;description?:string;author?:string};
type PublishedProject = {playRef?:string;id:string; title:string; author:string; repositoryUrl:string; identity:string; thumbnail?:string; opens?:number; stars?:number|null; issuesEnabled?:boolean|null; gameJamWinner?:boolean};
type GalleryAllowance = {maintained:string[];releases:string[]};
type PlayResult = {state:'observed';url?:string;site:ProjectFeedback['site'];thumbnail?:string}|{state:'hidden'|'quarantined'};
const PROJECT_REFRESH_INTERVAL = 60_000;
const numericIdentity=(value:unknown)=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const sourceIdentity=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const webIdentity=(web:MaintainedProject['web'])=>web===undefined?null:[web.provider,web.url,web.commit,web.runId];
function maintainedIdentity(project:MaintainedProject) {
  if(!project||typeof project.id!=='string'||!numericIdentity(project.repositoryId)||!numericIdentity(project.ownerId)||
      typeof project.repositoryUrl!=='string'||!sourceIdentity(project.sourceCommit))return null;
  return JSON.stringify([project.id,project.repositoryId,project.ownerId,project.repositoryUrl,project.sourceCommit,webIdentity(project.web)]);
}
function gameIdentity(release:Release) {
  if(!release||!['game','library'].includes(release.kind)||typeof release.id!=='string'||typeof release.version!=='string'||
      !['available','withdrawn'].includes(release.status)||!numericIdentity(release.repository?.id)||!numericIdentity(release.repository?.ownerId)||
      typeof release.repository?.url!=='string'||!sourceIdentity(release.source?.commit))return null;
  return JSON.stringify([release.id,release.kind,release.version,release.status,release.repository.id,release.repository.ownerId,release.repository.url,
    release.source.commit,release.source.folder,webIdentity(release.web)]);
}
type Discovery = {schema:1;maintained:MaintainedProject[];catalog:Catalog|null;catalogError?:string;presentation:Presentation[];listings?:PublishedProject[];order?:string[];next?:string|null};

const validPlayRef=(value:unknown):value is string=>typeof value==='string'&&!!parseProjectPlayRef(value);
const listingThumbnail=(value:unknown):value is string=>typeof value==='string'&&/^\/api\/hub\/listings\/thumbnail\/[1-9][0-9]{0,19}\/[a-f0-9]{40}$/.test(value);
const playLinkFor=(ref:string)=>`/hub/play?${new URLSearchParams({ref})}`;

function validProjectPage(data:Discovery) {
  if ([...data.maintained,...(data.catalog?.releases??[])].some(item=>item?.playRef!==undefined&&!validPlayRef(item.playRef))) return false;
  if (!Array.isArray(data.listings) || !(data.next===null || typeof data.next==='string' && /^[A-Za-z0-9_-]{1,2048}$/.test(data.next)) ||
      data.maintained.length+(data.catalog?.releases.length ?? 0)+data.listings.length>24) return false;
  const identities=new Set<string>();
  for (const item of data.listings) {
    if (!item || !numericIdentity(item.id) || typeof item.title!=='string' || typeof item.author!=='string' ||
        typeof item.repositoryUrl!=='string' || !item.repositoryUrl.startsWith('https://github.com/') ||
        (item.playRef!==undefined && !validPlayRef(item.playRef)) ||
        (item.stars != null && (!Number.isSafeInteger(item.stars) || item.stars < 0)) ||
        (item.issuesEnabled != null && typeof item.issuesEnabled !== 'boolean') ||
        typeof item.identity!=='string' || !/^[a-f0-9]{64}$/.test(item.identity) || identities.has(item.id)) return false;
    identities.add(item.id);
  }
  if (data.order !== undefined) {
    const keys = new Set([...data.maintained.map(item=>`m:${item.id}`),
      ...(data.catalog?.releases ?? []).map(item=>`r:${item.id}@${item.version}`),
      ...data.listings.map(item=>`l:${item.id}`)]);
    if (!Array.isArray(data.order) || data.order.length!==keys.size ||
      !data.order.every(key=>keys.delete(key))) return false;
  }
  return true;
}

function discoveryIdentities(data:Discovery) {
  const maintained=new Set<string>(), releases=new Set<string>();
  const maintainedIds=new Set<string>(), releaseVersions=new Set<string>();
  for (const project of data.maintained) {
    const identity=maintainedIdentity(project);
    if (identity===null || maintainedIds.has(project.id)) throw new Error('Invalid project identity');
    maintainedIds.add(project.id);
    maintained.add(identity);
  }
  for (const release of data.catalog?.releases || []) {
    if (!['game','library'].includes(release?.kind)) continue;
    const identity=gameIdentity(release), key=JSON.stringify([release.id,release.version]);
    if (identity===null || releaseVersions.has(key)) throw new Error('Invalid release identity');
    releaseVersions.add(key);
    releases.add(identity);
  }
  return {maintained,releases};
}

function checkedDiscovery(value:unknown, checkIdentities:boolean, paginated:boolean):Discovery {
  const data=value as Discovery;
  if (data?.schema!==1 || !Array.isArray(data.maintained) || !Array.isArray(data.presentation) ||
      !(data.catalog===null || (data.catalog && Array.isArray(data.catalog.releases)))) throw new Error('Invalid discovery response');
  if (checkIdentities) discoveryIdentities(data);
  if (paginated && !validProjectPage(data)) throw new Error('Invalid Projects page');
  return data;
}

// Next may replay a cached server response during same-document history traversal.
let restoredLocation:string|undefined;
let observingHistory=false;
const historySubscribers=new Set<()=>void>();
function observeProjectHistory(listener:()=>void) {
  if (!observingHistory) {
    observingHistory=true;
    window.addEventListener('popstate',()=>{
      restoredLocation=window.location.href;
      historySubscribers.forEach(subscriber=>subscriber());
    },{capture:true});
  }
  historySubscribers.add(listener);
  return()=>{historySubscribers.delete(listener);};
}
const isHistoryRestore=()=>typeof window!=='undefined'&&restoredLocation!==undefined&&restoredLocation===window.location.href;

function ProjectPlaceholders() {
  return Array.from({length:4},(_,index)=><div key={index} className={styles.projectPlaceholder} aria-hidden="true" />);
}

export function HubProjectsFallback() {
  return <section className={styles.catalog} aria-labelledby="sharing-heading">
    <h1 id="sharing-heading">Projects</h1>
    <div className={styles.searchPlaceholder} aria-hidden="true" />
    <p className="sr-only" role="status">Loading projects…</p>
    <div className={`${styles.cards} ${styles.projectCards} ${styles.compactProjectCards}`} aria-busy="true">
      <ProjectPlaceholders/>
    </div>
  </section>;
}

export function HubDiscovery({enforceJamVisibility=true, showListings=false, libraryOwnerId, paginatedProjects=false, initialProjects}: {
  enforceJamVisibility?:boolean;showListings?:boolean;libraryOwnerId?:string;paginatedProjects?:boolean;initialProjects?:unknown;
}) {
  const query = useSearchParams();
  const requestedKind = query.get('kind') || (query.has('id') || query.has('version') ? 'library' : 'game');
  const kind = requestedKind === 'practice' ? 'practice' : requestedKind === 'game' ? 'game' : 'library';
  const practiceOnly=kind==='practice';
  const label=practiceOnly?'tutorial practice libraries':kind==='game'?'projects':'libraries';
  const id = query.get('id') || '', version = query.get('version') || '';
  const browseProjects = kind==='game' && !id && !version;
  const projectPage = paginatedProjects && browseProjects;
  const gridClassName = [styles.cards, kind==='game' && styles.projectCards, browseProjects && styles.compactProjectCards].filter(Boolean).join(' ');
  const validateEarlyProjects = browseProjects && enforceJamVisibility;
  const [search, setSearch] = useState('');
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const revalidating = useRef(false);
  const pageQuery = new URLSearchParams({q:search.trim()});
  const pageCursor = pageCursors.at(-1);
  if (pageCursor) pageQuery.set('cursor',pageCursor);
  const pageUrl = projectPage ? `/api/hub/projects/discover?${pageQuery}` : '';
  const includeListings = !projectPage && showListings && browseProjects;
  const [feedbackResult, setFeedbackResult] = useState<{key:string; items:Record<string,ProjectFeedback>; failed:boolean; gallery?:GalleryAllowance}|null>(null);
  type Metric = {id:string;kind:string;opens?:number|null;projects?:number|null;observedProjects?:number|null;totalProjects?:number|null};
  const [metrics, setMetrics] = useState<Record<string,Metric>>({});
  const metricView = useRef('');
  const [retry, setRetry] = useState(0);
  // Background checks keep the current view and card keys stable.
  const [projectRefresh, setProjectRefresh] = useState(0);
  const refresh = projectPage ? projectRefresh : 0;
  const catalogQuery = JSON.stringify(projectPage?[pageUrl,retry]:enforceJamVisibility?[requestedKind,search,id,version,retry]:[practiceOnly,retry]);
  const catalogGeneration = useRef({query:catalogQuery,value:0,search,retry,delay:0});
  if(catalogGeneration.current.query!==catalogQuery) catalogGeneration.current={query:catalogQuery,value:catalogGeneration.current.value+1,search,retry,delay:catalogGeneration.current.search!==search&&catalogGeneration.current.retry===retry?300:0};
  const searchDelay = catalogGeneration.current.delay;
  const catalogKey = `${catalogGeneration.current.value}:${catalogQuery}`;
  const [initialCatalog] = useState(()=>{
    if (!projectPage || initialProjects===undefined || isHistoryRestore()) return null;
    try { return {key:catalogKey,refresh,discovery:checkedDiscovery(initialProjects,validateEarlyProjects,true),error:''}; }
    catch { return {key:catalogKey,refresh,discovery:null,error:'The shared catalog is unavailable. Try again shortly.'}; }
  });
  const [catalogResult,setCatalogResult] = useState<{key:string;refresh:number;discovery:Discovery|null;error:string;restart?:boolean}|null>(initialCatalog);
  const [playResult,setPlayResult] = useState<{key:string;items:Record<string,{refresh:number; result:PlayResult}>}|null>(null);
  const playItems = playResult?.key===catalogKey ? playResult.items : {};
  const currentCatalog = catalogResult?.key===catalogKey ? catalogResult : null;
  const catalogRefresh = currentCatalog?.refresh;
  const currentPlayItem=(ref:string)=>{
    const observation=playItems[ref];
    return observation?.refresh===catalogRefresh ? observation?.result : undefined;
  };
  const visiblePlayItem=(item:{playRef?:string})=>{
    const state=item.playRef ? currentPlayItem(item.playRef)?.state : undefined;
    return state!=='hidden'&&state!=='quarantined';
  };
  const discovery = currentCatalog?.discovery ?? null;
  const catalog = discovery?.catalog || null;
  const error = catalogResult?.key===catalogKey ? catalogResult.error || (discovery && !catalog ? 'The shared catalog is unavailable. Try again shortly.' : '') : '';
  const restartPage = projectPage && catalogResult?.key===catalogKey && catalogResult.restart;
  const listings = projectPage ? discovery?.listings ?? [] : [];
  const nextPage = discovery?.next;
  const projectPreviews = discovery?.presentation || [];
  const releaseAuthors = projectPreviews.filter(item=>item.author).map(item=>({id:item.id,sourceCommits:[item.sourceCommit],author:item.author as string}));
  const leftPage = useRef(false);
  const projects = projectPage ? discovery?.maintained ?? [] :
    selectMaintainedProjects(discovery?.maintained || [], {kind, search, id, version}) as MaintainedProject[];
  useEffect(() => {
    if (initialCatalog?.key===catalogKey && refresh===0) return;
    const controller = new AbortController(); let active = true;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const load=()=>{
      timeout=setTimeout(() => controller.abort(), 22000);
      void fetch(pageUrl||(practiceOnly?'/api/hub/discovery?practice=1':'/api/hub/discovery'), {cache:'no-store', redirect:'error', signal:controller.signal}).then(async response => {
        if (pageUrl && response.status===409) {
          if (active) setCatalogResult({key:catalogKey,refresh,discovery:null,error:'Projects changed. Return to the first page.',restart:true});
          return;
        }
        if (!response.ok) throw new Error('The shared catalog is unavailable. Try again shortly.');
        const data = checkedDiscovery(await response.json(),validateEarlyProjects,!!pageUrl);
        if (active) setCatalogResult({key:catalogKey,refresh,discovery:data,error:''});
      }).catch(() => {if (active) setCatalogResult({key:catalogKey,refresh,discovery:null,error:'The shared catalog is unavailable. Try again shortly.'});}).finally(() => clearTimeout(timeout));
    };
    const debounce=searchDelay?setTimeout(load,searchDelay):undefined;
    if(!searchDelay)load();
    return () => {active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort();};
  }, [refresh, practiceOnly, catalogKey, searchDelay, validateEarlyProjects, pageUrl, initialCatalog]);
  let releases:Release[] = [], selectionError = '';
  if (catalog) try {
    if (!['game','library','practice'].includes(requestedKind)) throw new Error('Choose projects, libraries or tutorial practice.');
    releases = projectPage ? catalog.releases :
      selectReleases(catalog, {kind, search, id, version, attributions:releaseAuthors}) as Release[];
    if(libraryOwnerId)releases=releases.filter(release=>release.kind==='library'&&release.repository.ownerId===libraryOwnerId);
  } catch (failure) {selectionError = failure instanceof Error ? failure.message : 'This release link is invalid.';}
  const feedbackIds = [...new Set([...projects.map(project=>project.id),...releases.filter(release=>release.status==='available').map(release=>release.id)])].join(',');
  const requiresGalleryCheck = !projectPage && enforceJamVisibility && (projects.length>0||releases.length>0);
  const gallerySelection=requiresGalleryCheck?JSON.stringify([projects.map(maintainedIdentity),releases.map(gameIdentity)]):'';
  const feedbackQuery=JSON.stringify([catalogKey,requestedKind,projectPage?null:search,id,version,feedbackIds,gallerySelection]);
  const feedbackGeneration=useRef({query:feedbackQuery,value:0,search,retry,delay:0});
  if (feedbackGeneration.current.query!==feedbackQuery) feedbackGeneration.current={query:feedbackQuery,
    value:feedbackGeneration.current.value+1,search,retry,
    delay:!projectPage&&feedbackGeneration.current.search!==search&&feedbackGeneration.current.retry===retry?300:0};
  const feedbackDelay=feedbackGeneration.current.delay;
  const feedbackKey=`${feedbackGeneration.current.value}:${feedbackQuery}`;
  const feedback = feedbackResult?.key===feedbackKey ? feedbackResult.items : {};
  const allowance=feedbackResult?.key===feedbackKey?feedbackResult.gallery:undefined;
  const visibilityPending = requiresGalleryCheck && feedbackResult?.key!==feedbackKey;
  const showDiscoveryCards = browseProjects && visibilityPending;
  const visibleProjects = projectPage ? projects.filter(visiblePlayItem) :
    kind==='game' && enforceJamVisibility && !showDiscoveryCards ? projects.filter(project=>{
      const identity=maintainedIdentity(project);
      return identity!==null&&allowance?.maintained.includes(identity)&&feedback[project.id]?.repositoryUrl===project.repositoryUrl;
    }) : projects;
  const visibleReleases = projectPage ? releases.filter(visiblePlayItem) :
    enforceJamVisibility && !showDiscoveryCards ? releases.filter(release=>{
      const identity=gameIdentity(release);return identity!==null&&allowance?.releases.includes(identity);
    }) : releases;
  const visibleListings = listings.filter(visiblePlayItem);
  const visibilityFailed = requiresGalleryCheck && feedbackResult?.key===feedbackKey && feedbackResult.failed;
  const metricIds = showDiscoveryCards ? '' : [...(projectPage?projects:visibleProjects).map(project=>project.id),
    ...(projectPage?releases:visibleReleases).filter(release=>release.status==='available').map(release=>release.id)].join(',');
  const quarantined = [...projects,...releases,...listings].some(item=>
    item.playRef && currentPlayItem(item.playRef)?.state==='quarantined');
  const playRefs = projectPage ? [...new Set([...projects,...releases,...listings].map(item=>item.playRef).filter(validPlayRef))].join(',') : '';
  useEffect(()=>{
    if (projectPage) {
      const checkRestored=()=>setRetry(value=>value+1);
      const returnFromHistory=(event:PageTransitionEvent)=>{if(event.persisted)checkRestored();};
      const stopObserving=observeProjectHistory(checkRestored);
      restoredLocation=undefined;
      window.addEventListener('pageshow',returnFromHistory);
      return()=>{stopObserving();window.removeEventListener('pageshow',returnFromHistory);};
    }
    const leave=()=>{leftPage.current=true;};
    const refresh=()=>{
      if(document.visibilityState==='hidden'){leave();return;}
      if(revalidating.current&&!leftPage.current)return;
      revalidating.current=true;
      leftPage.current=false;
      setRetry(value=>value+1);
    };
    const returnFromHistory=(event:PageTransitionEvent)=>{if(event.persisted){leave();refresh();}};
    window.addEventListener('focus',refresh);
    window.addEventListener('blur',leave);
    window.addEventListener('pageshow',returnFromHistory);
    document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('blur',leave);window.removeEventListener('pageshow',returnFromHistory);document.removeEventListener('visibilitychange',refresh);};
  },[projectPage]);
  useEffect(()=>{
    if (!projectPage && catalogResult?.key===catalogKey && (!((feedbackIds&&!practiceOnly)||requiresGalleryCheck) || feedbackResult?.key===feedbackKey))
      revalidating.current=false;
  },[catalogResult,catalogKey,projectPage,feedbackIds,practiceOnly,requiresGalleryCheck,feedbackResult,feedbackKey]);
  useEffect(()=>{
    if(!projectPage || catalogRefresh!==refresh || restartPage)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=()=>{
      clearTimeout(timer);
      if(document.visibilityState==='visible')timer=setTimeout(()=>setProjectRefresh(value=>value+1),PROJECT_REFRESH_INTERVAL);
    };
    schedule();
    document.addEventListener('visibilitychange',schedule);
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
  },[projectPage,catalogKey,catalogRefresh,refresh,restartPage]);
  useEffect(()=>{
    if (!playRefs || catalogRefresh===undefined) return;
    const controller=new AbortController();
    const refs=playRefs.split(',');
    const allowed=new Set(refs);
    const queued=new Set<string>();
    const pending:string[]=[];
    const expiryTimers:ReturnType<typeof setTimeout>[]=[];
    const stop=()=>{controller.abort();expiryTimers.forEach(clearTimeout);};
    let running=0;
    const update=(ref:string,result:PlayResult)=>{
      if(!controller.signal.aborted)setPlayResult(previous=>({key:catalogKey,
        items:{...(previous?.key===catalogKey?previous.items:{}),[ref]:{refresh:catalogRefresh,result}}}));
    };
    const load=()=>{
      while (!controller.signal.aborted && running<2 && pending.length) {
        const ref=pending.shift()!;
        running++;
        const started=performance.now();
        void fetch(`/api/hub/projects/play?${new URLSearchParams({ref})}`,{
          cache:'no-store',redirect:'error',headers:{'X-ZeroHub-Background':'1'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])
        }).then(async response=>{
          if (response.status===404) {update(ref,{state:'hidden'});return;}
          const data=await response.json();
          if (response.status===503 && data?.code==='visibility-unavailable') {update(ref,{state:'quarantined'});return;}
          if (!response.ok) throw new Error('Play check unavailable');
          if (controller.signal.aborted) return;
          if (!['reachable','unreachable','unknown','not-checked'].includes(data.siteStatus)) throw new Error('Invalid Play status');
          if (data.url===null) {update(ref,{state:'observed',site:{status:data.siteStatus}});return;}
          if (typeof data.url!=='string'||!data.url.startsWith('https://')) throw new Error('Invalid Play destination');
          const target=new URL(data.url);
          if (target.protocol!=='https:'||target.username||target.password) throw new Error('Invalid Play destination');
          const observation:PlayResult={state:'observed',site:{status:data.siteStatus},
            thumbnail:listingThumbnail(data.thumbnail)?data.thumbnail:undefined};
          const remaining=Number.isFinite(data.freshForMs)?Math.min(30_000,data.freshForMs)-(performance.now()-started):0;
          update(ref,remaining>0?{...observation,url:target.href}:observation);
          if (remaining>0) expiryTimers.push(setTimeout(()=>update(ref,observation),remaining));
        }).catch(()=>update(ref,{state:'observed',site:{status:'unknown'}})).finally(()=>{running--;load();});
      }
    };
    const enqueue=(ref:string)=>{
      if (!allowed.has(ref)||queued.has(ref)) return;
      queued.add(ref);
      pending.push(ref);
    };
    if(!('IntersectionObserver' in window)){
      refs.forEach(enqueue);
      load();
      return stop;
    }
    const observer=new IntersectionObserver(entries=>{
      for (const entry of entries) if(entry.isIntersecting) {
        const ref=entry.target.getAttribute('data-hub-play-ref');
        if (ref) enqueue(ref);
        observer.unobserve(entry.target);
      }
      load();
    },{rootMargin:'200px'});
    document.querySelectorAll('[data-hub-play-ref]').forEach(card=>observer.observe(card));
    return()=>{observer.disconnect();stop();};
  },[catalogKey,catalogRefresh,playRefs]);
  useEffect(()=>{
    if ((!feedbackIds||practiceOnly)&&!requiresGalleryCheck) return;
    const controller=new AbortController();
    const load=()=>{
      const ids=!practiceOnly&&feedbackIds?feedbackIds.split(','):[];
      const batches=Array.from({length:Math.ceil(ids.length/12)},(_,index)=>ids.slice(index*12,index*12+12));
      const statusRequests=batches.map(async batch=>{
        const response=await fetch(`/api/hub/projects?${new URLSearchParams({kind,ids:batch.join(','),...(projectPage?{metadata:'1'}:{})})}`,{cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(22000)])});
        if(!response.ok)throw new Error('Status unavailable');
        const data=await response.json();
        if(data.schema!==1||!Array.isArray(data.items))throw new Error('Invalid status');
        const requested=new Set(batch);
        return data.items.filter((item:ProjectFeedback)=>item&&requested.has(item.id)&&item.kind===kind&&typeof item.repositoryUrl==='string'&&(item.stars===null||Number.isSafeInteger(item.stars)&&item.stars>=0)&&(item.issuesEnabled===null||typeof item.issuesEnabled==='boolean')&&item.site&&['reachable','unreachable','unknown','not-checked'].includes(item.site.status)&&(!item.site.checkedAt||Number.isFinite(Date.parse(item.site.checkedAt))));
      });
      if (projectPage) {
        for (const status of statusRequests) void status.then((items:ProjectFeedback[])=>{
          if (!controller.signal.aborted) setFeedbackResult(previous=>({key:feedbackKey,failed:false,
            items:{...(previous?.key===feedbackKey?previous.items:{}),...Object.fromEntries(items.map(item=>[item.id,item]))}}));
        }).catch(()=>{});
        return;
      }
      void Promise.all(statusRequests).then(async batches=>{
        const items:Record<string,ProjectFeedback>=Object.fromEntries(batches.flat().map((item:ProjectFeedback)=>[item.id,item]));
        let gallery:GalleryAllowance|undefined, galleryUnavailable=false;
        if (requiresGalleryCheck) {
          const url=practiceOnly?'/api/hub/discovery?revalidate=1&practice=1':'/api/hub/discovery?revalidate=1';
          const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(22000)])});
          if(!response.ok)throw new Error('Project availability unavailable');
          const data=checkedDiscovery(await response.json(),false,false);
          const current=discoveryIdentities(data);
          gallery={maintained:projects.map(maintainedIdentity).filter((identity):identity is string=>identity!==null&&current.maintained.has(identity)),
            releases:releases.map(gameIdentity).filter((identity):identity is string=>identity!==null&&current.releases.has(identity))};
          galleryUnavailable=data.catalog===null&&releases.length>0;
        }
        if(!controller.signal.aborted)setFeedbackResult({key:feedbackKey,items,failed:galleryUnavailable,gallery});
      }).catch(()=>{if(!controller.signal.aborted)setFeedbackResult({key:feedbackKey,items:{},failed:true});});
    };
    const debounce=feedbackDelay?setTimeout(load,feedbackDelay):undefined;
    if(!feedbackDelay)load();
    return()=>{clearTimeout(debounce);controller.abort();};
  },[kind,feedbackIds,feedbackKey,feedbackDelay,practiceOnly,requiresGalleryCheck,projectPage]);
  useEffect(()=>{
    const controller=new AbortController(), requested=new Set<string>();
    const view=JSON.stringify([catalogKey,metricIds]);
    if(metricView.current!==view){metricView.current=view;setMetrics({});}
    if(practiceOnly)return()=>controller.abort();
    const ids=new Set(metricIds?metricIds.split(','):[]);
    const load=(visible:string[])=>{
      const pending=visible.filter(id=>ids.has(id)&&!requested.has(id));
      pending.forEach(id=>requested.add(id));
      void loadMetricBatches(kind,pending,{signal:controller.signal,onItems:(items:Metric[])=>{
        if(!controller.signal.aborted)setMetrics(previous=>({...previous,...Object.fromEntries(items.map(item=>[item.id,item]))}));
      }});
    };
    if(!('IntersectionObserver' in window)){load([...ids]);return()=>controller.abort();}
    const observer=new IntersectionObserver(entries=>{
      const visible:string[]=[];
      for(const entry of entries)if(entry.isIntersecting){const id=entry.target.getAttribute('data-hub-project-id');if(id)visible.push(id);observer.unobserve(entry.target);}
      load(visible);
    },{rootMargin:'200px'});
    document.querySelectorAll('[data-hub-project-id]').forEach(card=>observer.observe(card));
    return()=>{observer.disconnect();controller.abort();};
  },[kind,metricIds,practiceOnly,catalogKey,catalogRefresh]);
  const projectMetric=(id:string,metric=metrics[id])=>{
    const label=practiceOnly?null:metricLabel(kind,metric);
    if(!label)return null;
    return <p className={styles.metrics} title={`${label.text}. ${label.hint}`}>
      {kind==='game'?<><Icon name="play" className={styles.playCountIcon} /><span aria-hidden="true">{metric?.opens?.toLocaleString()}</span><span className="sr-only">{label.text}</span></>:label.text}
      <span className="sr-only">. {label.hint}</span>
    </p>;
  };
  const observedFeedback=(id:string, repositoryHref:string)=>feedback[id]?.repositoryUrl===repositoryHref?feedback[id]:undefined;
  function cardPlay(ref?:string) {
    const cached=ref ? playItems[ref]?.result : undefined;
    const play=ref ? currentPlayItem(ref) : undefined;
    return {playRef:ref,fallbackPlayHref:ref?playLinkFor(ref):undefined,
      // Direct URLs belong to one check. Later checks can use the guarded link
      // while refreshing, even if cleanup canceled the previous URL's timer.
      playHref:play?.state==='observed'?play.url:undefined,
      site:cached?.state==='observed'?cached.site:undefined,
      thumbnail:cached?.state==='observed'?cached.thumbnail:undefined};
  }
  function changePage(cursors:string[]) {
    heading.current?.focus();
    setPageCursors(cursors);
  }
  function retryDiscovery() {
    if (restartPage) changePage([]);
    setRetry(value=>value+1);
  }
  const projectCards = visibleProjects.map(project => {
    const {site,thumbnail:_thumbnail,...playProps}=projectPage?cardPlay(project.playRef):
      {site:undefined,thumbnail:undefined,playHref:showDiscoveryCards?undefined:maintainedPlayLink(project)};
    const observed=observedFeedback(project.id,project.repositoryUrl), description=projectSummary(project.description);
    const checked=projectPage ? {...observed,site:site??{status:'not-checked' as const},id:project.id,kind:'game' as const,
      repositoryUrl:project.repositoryUrl,stars:null,issuesEnabled:observed?.issuesEnabled??null} : observed;
    return [`m:${project.id}`, <HubProjectCard projectId={project.id} key={project.id} title={project.title} description={description} author={project.author}
      compact siteUnavailable={checked?.site.status==='unreachable'} image={project.image} {...playProps} repositoryHref={project.repositoryUrl}
      metric={showDiscoveryCards?null:projectMetric(project.id)}
      details={identity=><HubProjectDetails title={project.title} repositoryHref={project.repositoryUrl} playHref={playProps.playHref}
        sourceCommit={project.sourceCommit} description={description} feedback={checked} pending={showDiscoveryCards}>{identity}</HubProjectDetails>} />] as const;
  });
  const releaseCards = visibleReleases.map(release=>{
    const {site,thumbnail:_thumbnail,...playProps}=projectPage?cardPlay(release.playRef):
      {site:undefined,thumbnail:undefined,playHref:showDiscoveryCards?undefined:playLink(release)};
    const isGame=release.kind==='game', available=release.status==='available';
    const description=releaseSummary(release, projectPreviews), repositoryHref=release.repository.url;
    const observed=observedFeedback(release.id,repositoryHref);
    const checked=projectPage ? {...observed,site:site??{status:'not-checked' as const},id:release.id,kind:'game' as const,
      repositoryUrl:repositoryHref,stars:null,issuesEnabled:observed?.issuesEnabled??null} : observed;
    const entry={title:release.title,repositoryHref,playHref:playProps.playHref,sourceCommit:release.source.commit,version:release.version,feedback:checked};
    return [`r:${release.id}@${release.version}`, <HubProjectCard projectId={!practiceOnly&&available?release.id:undefined} key={`${release.id}/${release.version}`} title={release.title} description={description} author={releaseAuthor(release, releaseAuthors)}
    compact={isGame} siteUnavailable={isGame&&checked?.site.status==='unreachable'} version={release.version} repositoryHref={repositoryHref} image={releaseImage(release, projectPreviews)} {...playProps}
    metric={isGame&&available&&!showDiscoveryCards?projectMetric(release.id):null}
    details={isGame&&available?identity=><HubProjectDetails {...entry} description={description} pending={showDiscoveryCards}>{identity}</HubProjectDetails>:undefined}
    feedback={!isGame&&!practiceOnly&&available?<HubProjectFeedback {...entry} id={release.id} kind="library" metric={projectMetric(release.id)} />:undefined}>
    {release.status !== 'available' ? <p role="status">This release has been withdrawn.</p> : release.kind === 'library' ? <details><summary>Use this library</summary>
      <p>In the updated Zero editor, open Zero: Libraries and Games from the Command Palette. Choose {practiceOnly?'Browse tutorial practice':'Browse libraries'} → {release.title} → Add library → Apply. Check the author and exact version before applying.</p>
      <p><a href={`${sourceLink(release)}/examples`}>View examples</a></p>
      {release.components?.map(component=><div key={component.className}><h4>{component.className}</h4>{component.description && <p>{component.description}</p>}<CodeBlock><code>{`import ${component.className};${component.usage ? `\n\n${component.usage}` : ''}`}</code></CodeBlock><details><summary>Public API</summary><CodeBlock><code>{component.api.join('\n')}</code></CodeBlock></details></div>)}
      {!release.components?.length && <p>Read the exact source for this library’s Java API and examples. Namespace: <code>{release.namespace}</code>.</p>}
      <details><summary>Manual Maven setup</summary><p>Add these entries to pom.xml.</p><CodeBlock><code>{dependencySnippet(release)}</code></CodeBlock><div className="resource-links"><a href={release.artifacts.jar?.url}>Download JAR</a><a href={release.artifacts.pom?.url}>View POM</a></div></details>
    </details> : null}
      </HubProjectCard>] as const;
  });
  const listingCards = visibleListings.map(item=>{
    const {site,thumbnail,...playProps}=cardPlay(item.playRef);
    return [`l:${item.id}`, <HubProjectCard key={item.identity} title={item.title} description="GitHub Pages app"
    author={item.author} repositoryHref={item.repositoryUrl} {...playProps}
    image={thumbnail??(listingThumbnail(item.thumbnail)?item.thumbnail:undefined)}
    siteUnavailable={site?.status==='unreachable'} compact
    metric={projectMetric(item.id,{id:item.id,kind:'game',opens:item.opens})}
    details={identity=><HubProjectDetails title={item.title} repositoryHref={item.repositoryUrl} playHref={playProps.playHref} description="GitHub Pages app"
      feedback={{id:item.id,kind:'game',repositoryUrl:item.repositoryUrl,stars:null,
        issuesEnabled:item.issuesEnabled??null,site:site??{status:'not-checked'}}}>{identity}</HubProjectDetails>}>
    {item.gameJamWinner && <span className={styles.winnerBadge}>Game Jam winner</span>}
    {!item.playRef && <a href={item.repositoryUrl}>Open on GitHub</a>}
    </HubProjectCard>] as const;
  });
  const pageCards = [...projectCards,...releaseCards,...listingCards];
  const cardsByKey = new Map<string,ReactElement>(pageCards);
  const orderedCards = discovery?.order
    ? discovery.order.map(key=>cardsByKey.get(key))
    : pageCards.map(([,card])=>card);
  return <section className={styles.catalog} aria-labelledby="sharing-heading">
    <h1 id="sharing-heading" ref={heading} tabIndex={projectPage?-1:undefined}>{libraryOwnerId?'My Libraries':practiceOnly?'Tutorial practice':kind === 'game' ? 'Projects' : 'Libraries'}</h1>
      {!id && !version && <div className={styles.search}><Icon name="search" /><input id="sharing-search" type="search" aria-label={libraryOwnerId?'Search my libraries':'Search ZeroHub'} value={search} onChange={event=>{setSearch(event.target.value);if(projectPage)setPageCursors([]);}} maxLength={200} placeholder={libraryOwnerId?'Search my libraries':'search zerohub'} /></div>}
    {practiceOnly && <p className="hub-note">These CreditsBadge libraries are copied tutorial work. Similar copies are expected, and each repository keeps its own library identity. Periodic cleanup may remove libraries from the catalog. Your source and any copies already added to projects stay available.</p>}
    {(id || version) && <p className="hub-note">Exact release: {id || 'Missing ID'} · {version || 'Missing version'}. <Link href={`/hub?kind=${kind}`}>Browse all {label}</Link></p>}
    {projectPage&&!discovery&&!error&&<p className="sr-only" role="status">Loading projects…</p>}
    <div className={gridClassName} aria-busy={projectPage&&!discovery&&!error||undefined}>
    {projectPage&&!discovery&&!error&&<ProjectPlaceholders/>}
    {projectPage ? orderedCards : projectCards.map(([,card])=>card)}
    {includeListings && <HubPublishedProjects key={`${search}:${retry}`} search={search}
      hasOtherProjects={visibleProjects.length > 0 || visibleReleases.length > 0 || visibilityPending || !catalog} />}
    {visibilityPending && !showDiscoveryCards && <p role="status">Checking project availability…</p>}
    {quarantined && <div role="status"><p>Some projects couldn’t be verified.</p><button className={styles.retry} type="button" onClick={retryDiscovery}>Try again</button></div>}
    {visibilityFailed && <div role="status"><p>Project availability is unavailable. Try again shortly.</p><button className={styles.retry} onClick={()=>{setFeedbackResult(null);setRetry(value=>value+1);}}>Try again</button></div>}
    {error ? <div role="status"><p>{error}</p><button className={styles.retry} onClick={retryDiscovery}>{restartPage?'First page':'Try again'}</button></div> : !catalog ? (projectPage ? null : <p role="status">Loading {label}…</p>) : selectionError ? <p role="status">{selectionError}</p> : <>
      {!includeListings && !quarantined && !visibleReleases.length && !visibleProjects.length && !visibleListings.length && !visibilityPending && !visibilityFailed && <p role="status">{id || version ? 'This exact release is not in the catalog. No other version was substituted.' : search.trim() ? `No ${label} match this search.` : libraryOwnerId ? 'You have no libraries in the main catalog yet.' : `No ${label} are available yet.`}</p>}
      {!projectPage && releaseCards.map(([,card])=>card)}
    </>}
    </div>
    {projectPage && !restartPage && (pageCursors.length>0 || nextPage) && <nav aria-label="Projects pages" className="resource-links">
      {pageCursors.length>0 && <button className={styles.retry} type="button" onClick={()=>changePage(pageCursors.slice(0,-1))}>Previous page</button>}
      {nextPage && <button className={styles.retry} type="button" onClick={()=>changePage([...pageCursors,nextPage])}>Next page</button>}
    </nav>}
    </section>;
}
