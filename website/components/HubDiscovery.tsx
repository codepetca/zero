'use client';
import Link from 'next/link';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {useSearchParams} from 'next/navigation';
import {dependencySnippet, maintainedPlayLink, playLink, projectSummary, releaseAuthor, releaseImage, releaseSummary, selectMaintainedProjects, selectReleases, sourceLink} from '@/lib/sharing-client.mjs';
import styles from '@/app/hub/hub.module.css';
import {CodeBlock} from './CodeBlock';
import {Icon} from './Icon';
import {loadMetricBatches, metricLabel} from '@/lib/hub-metrics-client.mjs';
import {HubProjectCard} from './HubProjectCard';
import {HubPublishedProjects} from './HubPublishedProjects';
import {HubProjectInfo} from './HubProjectInfo';
import {HubProjectFeedback, HubProjectDetails, type ProjectFeedback} from './HubProjectFeedback';
type Artifact = {url:string; size:number; sha256:string};
type Component = {className:string; description:string; usage:string; api:string[]};
type Release = {slug:string; kind:'library'|'game'; id:string; version:string; title:string; description:string; license:string; status:string; libraryKind?:string; namespace?:string; controls?:string; web?:{provider:'github-pages';url:string;commit:string;runId:number}; components?:Component[]; contributor:{login:string; githubId:string}; repository:{id?:string;ownerId?:string;url:string}; source:{commit:string; folder:string; sha256:string}; coordinate?:{groupId:string;artifactId:string;version:string}; artifacts:{zip?:Artifact;jar?:Artifact;sources?:Artifact;pom?:Artifact;preview?:Artifact}};
type Catalog = {schema:number;revision:string;releases:Release[]};
type MaintainedProject = {id:string;title:string;description:string;author:string;repositoryId?:string;ownerId?:string;repositoryUrl:string;sourceCommit:string;image?:string;web?:{provider:'github-pages';url:string;commit:string;runId:number}};
type Presentation = {id:string;sourceCommit:string;image?:string;description?:string;author?:string};
type PublishedProject = {id:string; title:string; author:string; repositoryUrl:string; identity:string; pagesUrl?:string; gameJamWinner?:boolean};
type GalleryAllowance = {maintained:string[];releases:string[];listings:PublishedProject[]};
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
type Discovery = {schema:1;maintained:MaintainedProject[];catalog:Catalog|null;catalogError?:string;presentation:Presentation[];listings?:PublishedProject[];next?:string|null};

function validProjectPage(data:Discovery) {
  if (!Array.isArray(data.listings) || !(data.next===null || typeof data.next==='string' && /^[A-Za-z0-9_-]{1,2048}$/.test(data.next)) ||
      data.maintained.length+(data.catalog?.releases.length ?? 0)+data.listings.length>24) return false;
  const identities=new Set<string>();
  for (const item of data.listings) {
    if (!item || !numericIdentity(item.id) || typeof item.title!=='string' || typeof item.author!=='string' ||
        typeof item.repositoryUrl!=='string' || !item.repositoryUrl.startsWith('https://github.com/') ||
        typeof item.identity!=='string' || !/^[a-f0-9]{64}$/.test(item.identity) || identities.has(item.id)) return false;
    identities.add(item.id);
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

export function HubDiscovery({enforceJamVisibility=true, showListings=false, libraryOwnerId, paginatedProjects=false}: {
  enforceJamVisibility?:boolean;showListings?:boolean;libraryOwnerId?:string;paginatedProjects?:boolean;
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
  const [catalogResult, setCatalogResult] = useState<{key:string; discovery:Discovery|null; error:string; restart?:boolean}|null>(null);
  const [search, setSearch] = useState('');
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageQuery = new URLSearchParams({q:search.trim()});
  const pageCursor = pageCursors.at(-1);
  if (pageCursor) pageQuery.set('cursor',pageCursor);
  const pageUrl = projectPage ? `/api/hub/projects/discover?${pageQuery}` : '';
  const includeListings = !projectPage && showListings && browseProjects;
  const [feedbackResult, setFeedbackResult] = useState<{key:string; items:Record<string,ProjectFeedback>; failed:boolean; gallery?:GalleryAllowance}|null>(null);
  type Metric = {id:string;kind:string;opens?:number|null;projects?:number|null;observedProjects?:number|null;totalProjects?:number|null};
  const [metrics, setMetrics] = useState<Record<string,Metric>>({});
  const [retry, setRetry] = useState(0);
  const catalogQuery = JSON.stringify(projectPage?[pageUrl,retry]:enforceJamVisibility?[requestedKind,search,id,version,retry]:[practiceOnly,retry]);
  const catalogGeneration = useRef({query:catalogQuery,value:0,search,retry,delay:0});
  if(catalogGeneration.current.query!==catalogQuery) catalogGeneration.current={query:catalogQuery,value:catalogGeneration.current.value+1,search,retry,delay:catalogGeneration.current.search!==search&&catalogGeneration.current.retry===retry?300:0};
  const searchDelay = catalogGeneration.current.delay;
  const catalogKey = `${catalogGeneration.current.value}:${catalogQuery}`;
  const discovery = catalogResult?.key===catalogKey ? catalogResult.discovery : null;
  const catalog = discovery?.catalog || null;
  const error = catalogResult?.key===catalogKey ? catalogResult.error || (discovery && !catalog ? 'The shared catalog is unavailable. Try again shortly.' : '') : '';
  const restartPage = projectPage && catalogResult?.key===catalogKey && catalogResult.restart;
  const listings = projectPage ? discovery?.listings ?? [] : [];
  const nextPage = discovery?.next;
  const projectPreviews = discovery?.presentation || [];
  const releaseAuthors = projectPreviews.filter(item=>item.author).map(item=>({id:item.id,sourceCommits:[item.sourceCommit],author:item.author as string}));
  const revalidating = useRef({running:false, left:false});
  const projects = projectPage ? discovery?.maintained ?? [] :
    selectMaintainedProjects(discovery?.maintained || [], {kind, search, id, version}) as MaintainedProject[];
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const load=()=>{
      timeout=setTimeout(() => controller.abort(), 22000);
      void fetch(pageUrl||(practiceOnly?'/api/hub/discovery?practice=1':'/api/hub/discovery'), {cache:'no-store', redirect:'error', signal:controller.signal}).then(async response => {
        if (pageUrl && response.status===409) {
          if (active) setCatalogResult({key:catalogKey,discovery:null,error:'Projects changed. Return to the first page.',restart:true});
          return;
        }
        if (!response.ok) throw new Error('The shared catalog is unavailable. Try again shortly.');
        const data = await response.json();
        if (data?.schema!==1 || !Array.isArray(data.maintained) || !Array.isArray(data.presentation) || !(data.catalog===null || (data.catalog && Array.isArray(data.catalog.releases)))) throw new Error('Invalid discovery response');
        if (validateEarlyProjects) discoveryIdentities(data);
        if (pageUrl && !validProjectPage(data)) throw new Error('Invalid Projects page');
        if (active) setCatalogResult({key:catalogKey,discovery:data,error:''});
      }).catch(() => {if (active) setCatalogResult({key:catalogKey,discovery:null,error:'The shared catalog is unavailable. Try again shortly.'});}).finally(() => clearTimeout(timeout));
    };
    const debounce=searchDelay?setTimeout(load,searchDelay):undefined;
    if(!searchDelay)load();
    return () => {active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort();};
  }, [retry, practiceOnly, catalogKey, searchDelay, validateEarlyProjects, pageUrl]);
  let releases:Release[] = [], selectionError = '';
  if (catalog) try {
    if (!['game','library','practice'].includes(requestedKind)) throw new Error('Choose projects, libraries or tutorial practice.');
    releases = projectPage ? catalog.releases :
      selectReleases(catalog, {kind, search, id, version, attributions:releaseAuthors}) as Release[];
    if(libraryOwnerId)releases=releases.filter(release=>release.kind==='library'&&release.repository.ownerId===libraryOwnerId);
  } catch (failure) {selectionError = failure instanceof Error ? failure.message : 'This release link is invalid.';}
  const feedbackIds = [...new Set([...projects.map(project=>project.id),...releases.filter(release=>release.status==='available').map(release=>release.id)])].join(',');
  const requiresGalleryCheck=enforceJamVisibility&&(projects.length>0||releases.length>0)||listings.length>0;
  const gallerySelection=requiresGalleryCheck?JSON.stringify([projects.map(maintainedIdentity),releases.map(gameIdentity),listings.map(item=>item.identity)]):'';
  const feedbackQuery = JSON.stringify([requestedKind, search, id, version, pageUrl, feedbackIds, gallerySelection, retry]);
  const feedbackGeneration = useRef({query:feedbackQuery, value:0,search,retry,delay:0});
  if(feedbackGeneration.current.query!==feedbackQuery) feedbackGeneration.current={query:feedbackQuery,value:feedbackGeneration.current.value+1,search,retry,delay:feedbackGeneration.current.search!==search&&feedbackGeneration.current.retry===retry?300:0};
  const feedbackDelay = feedbackGeneration.current.delay;
  const feedbackKey = `${feedbackGeneration.current.value}:${feedbackQuery}`;
  const feedback = feedbackResult?.key===feedbackKey ? feedbackResult.items : {};
  // Discovery already binds repository identity and checks fresh visibility.
  // Browse can show that result while status and the later whole-gallery
  // recheck are pending. Play waits for the recheck, which can also remove cards.
  const allowance=feedbackResult?.key===feedbackKey?feedbackResult.gallery:undefined;
  const visibilityPending = requiresGalleryCheck && feedbackResult?.key!==feedbackKey;
  const showDiscoveryCards = browseProjects && visibilityPending;
  const visibleProjects = kind==='game' && enforceJamVisibility && !showDiscoveryCards ? projects.filter(project=>{
    const identity=maintainedIdentity(project);
    return identity!==null&&allowance?.maintained.includes(identity)&&(projectPage||feedback[project.id]?.repositoryUrl===project.repositoryUrl);
  }) : projects;
  const visibleReleases = enforceJamVisibility && !showDiscoveryCards ? releases.filter(release=>{
    const identity=gameIdentity(release);return identity!==null&&allowance?.releases.includes(identity);
  }) : releases;
  const visibleListings = showDiscoveryCards ? listings : allowance?.listings ?? [];
  const visibilityFailed = requiresGalleryCheck && feedbackResult?.key===feedbackKey && feedbackResult.failed;
  const metricIds = showDiscoveryCards ? '' : [...visibleProjects.map(project=>project.id),...visibleReleases.filter(release=>release.status==='available').map(release=>release.id)].join(',');
  useEffect(()=>{
    const leave=()=>{if(revalidating.current.running)revalidating.current.left=true;};
    const refresh=()=>{
      if(document.visibilityState==='hidden'){leave();return;}
      if(revalidating.current.running){
        if(revalidating.current.left){revalidating.current.left=false;setRetry(value=>value+1);}
        return;
      }
      revalidating.current={running:true,left:false};
      setRetry(value=>value+1);
    };
    window.addEventListener('focus',refresh);
    window.addEventListener('blur',leave);
    document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('blur',leave);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  useEffect(()=>{
    if(catalogResult?.key!==catalogKey || ((feedbackIds&&!practiceOnly||requiresGalleryCheck) && feedbackResult?.key!==feedbackKey))return;
    revalidating.current={running:false,left:false};
  },[catalogResult,catalogKey,feedbackIds,feedbackResult,feedbackKey,practiceOnly,requiresGalleryCheck]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    const load=()=>{
    if(!practiceOnly&&feedbackIds||requiresGalleryCheck) {
      const ids=!practiceOnly&&feedbackIds?feedbackIds.split(','):[];
      const batches=Array.from({length:Math.ceil(ids.length/12)},(_,index)=>ids.slice(index*12,index*12+12));
      const statusRequests=Promise.all(batches.map(async batch=>{
        const response=await fetch(`/api/hub/projects?${new URLSearchParams({kind,ids:batch.join(',')})}`,{cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(22000)])});
        if(!response.ok)throw new Error('Status unavailable');
        const data=await response.json();
        if(data.schema!==1||!Array.isArray(data.items))throw new Error('Invalid status');
        const requested=new Set(batch);
        return data.items.filter((item:ProjectFeedback)=>item&&requested.has(item.id)&&item.kind===kind&&typeof item.repositoryUrl==='string'&&(item.stars===null||Number.isSafeInteger(item.stars)&&item.stars>=0)&&(item.issuesEnabled===null||typeof item.issuesEnabled==='boolean')&&item.site&&['reachable','unreachable','unknown','not-checked'].includes(item.site.status)&&(!item.site.checkedAt||Number.isFinite(Date.parse(item.site.checkedAt))));
      }));
      // Status is supplemental on a paginated browse. Always try the fresh
      // page check even if one of the supplemental batches is unavailable.
      void (pageUrl?statusRequests.catch(()=>[]):statusRequests).then(async batches=>{
        const items:Record<string,ProjectFeedback>=Object.fromEntries(batches.flat().map((item:ProjectFeedback)=>[item.id,item]));
        let gallery:GalleryAllowance|undefined, galleryUnavailable=false;
        if(requiresGalleryCheck) {
          // Status responses are batch-local snapshots. Re-read both trusted
          // source lanes and their final global authority after all batches.
          const url=pageUrl?`${pageUrl}&revalidate=1`:practiceOnly?'/api/hub/discovery?revalidate=1&practice=1':'/api/hub/discovery?revalidate=1';
          const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(22000)])});
          if(!response.ok)throw new Error('Project availability unavailable');
          const data=await response.json();
          if(data?.schema!==1||!Array.isArray(data.maintained)||!Array.isArray(data.presentation)||
              !(data.catalog===null||data.catalog&&Array.isArray(data.catalog.releases)))throw new Error('Invalid project availability');
          if (pageUrl && !validProjectPage(data)) throw new Error('Invalid Projects page');
          const current=enforceJamVisibility?discoveryIdentities(data):{maintained:new Set<string>(),releases:new Set<string>()};
          const initialListings=new Set(listings.map(item=>item.identity));
          gallery={maintained:projects.map(maintainedIdentity).filter((identity):identity is string=>identity!==null&&current.maintained.has(identity)),
            releases:releases.map(gameIdentity).filter((identity):identity is string=>identity!==null&&current.releases.has(identity)),
            listings:((data.listings ?? []) as PublishedProject[]).filter(item=>initialListings.has(item.identity))};
          // A failed shared source cannot prove an empty gallery. Keep the
          // independently verified maintained lane and offer a whole-view retry.
          galleryUnavailable=data.catalog===null&&releases.length>0;
        }
        if(active)setFeedbackResult({key:feedbackKey,items,failed:galleryUnavailable,gallery});
      }).catch(()=>{if(active)setFeedbackResult({key:feedbackKey,items:{},failed:true});});
    }
    };
    const debounce=feedbackDelay?setTimeout(load,feedbackDelay):undefined;
    if(!feedbackDelay)load();
    return()=>{active=false;clearTimeout(debounce);controller.abort();};
  },[kind,feedbackIds,feedbackKey,practiceOnly,retry,feedbackDelay,enforceJamVisibility,requiresGalleryCheck,pageUrl]);
  useEffect(()=>{
    const controller=new AbortController(), requested=new Set<string>();setMetrics({});
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
  },[kind,metricIds,practiceOnly]);
  const projectMetric=(id:string)=>{
    const metric=metrics[id], label=practiceOnly?null:metricLabel(kind,metric);
    if(!label)return null;
    return <p className={styles.metrics} title={`${label.text}. ${label.hint}`}>
      {kind==='game'?<><Icon name="play" className={styles.playCountIcon} /><span aria-hidden="true">{metric?.opens?.toLocaleString()}</span><span className="sr-only">{label.text}</span></>:label.text}
      <span className="sr-only">. {label.hint}</span>
    </p>;
  };
  const projectFeedback=(entry:{id:string;title:string;repositoryHref:string;playHref?:string;sourceCommit?:string;version?:string})=>(identity?:ReactNode,description?:string,placement?:'details')=>{
    const observed=feedback[entry.id]?.repositoryUrl===entry.repositoryHref?feedback[entry.id]:undefined;
    if (placement==='details') return <HubProjectInfo title={entry.title} available={observed?.site.status==='reachable'}>
      <HubProjectDetails {...entry} feedback={observed} description={description} pending={showDiscoveryCards}>{identity}</HubProjectDetails>
    </HubProjectInfo>;
    if(showDiscoveryCards)return null;
    return <HubProjectFeedback {...entry} kind={kind==='game'?'game':'library'} compact={kind==='game'} feedback={observed} metric={projectMetric(entry.id)}>{identity}</HubProjectFeedback>;
  };
  function changePage(cursors:string[]) {
    heading.current?.focus();
    setPageCursors(cursors);
  }
  return <section className={styles.catalog} aria-labelledby="sharing-heading">
    <h1 id="sharing-heading" ref={heading} tabIndex={projectPage?-1:undefined}>{libraryOwnerId?'My Libraries':practiceOnly?'Tutorial practice':kind === 'game' ? 'Projects' : 'Libraries'}</h1>
      {!id && !version && <div className={styles.search}><Icon name="search" /><input id="sharing-search" type="search" aria-label={libraryOwnerId?'Search my libraries':'Search ZeroHub'} value={search} onChange={event=>{setSearch(event.target.value);if(projectPage)setPageCursors([]);}} maxLength={200} placeholder={libraryOwnerId?'Search my libraries':'search zerohub'} /></div>}
    {practiceOnly && <p className="hub-note">These CreditsBadge libraries are copied tutorial work. Similar copies are expected, and each repository keeps its own library identity. Periodic cleanup may remove libraries from the catalog. Your source and any copies already added to projects stay available.</p>}
    {(id || version) && <p className="hub-note">Exact release: {id || 'Missing ID'} · {version || 'Missing version'}. <Link href={`/hub?kind=${kind}`}>Browse all {label}</Link></p>}
    <div className={gridClassName}>
    {visibleProjects.map(project => {
      const playHref=showDiscoveryCards?undefined:maintainedPlayLink(project);
      return <HubProjectCard projectId={project.id} key={project.id} title={project.title} description={projectSummary(project.description)} author={project.author}
        compact siteReachable={feedback[project.id]?.repositoryUrl===project.repositoryUrl && feedback[project.id]?.site.status==='reachable'} image={project.image} playHref={playHref} repositoryHref={project.repositoryUrl} feedback={projectFeedback({id:project.id,title:project.title,repositoryHref:project.repositoryUrl,playHref,sourceCommit:project.sourceCommit})} />;
    })}
    {includeListings && <HubPublishedProjects key={`${search}:${retry}`} search={search}
      hasOtherProjects={visibleProjects.length > 0 || visibleReleases.length > 0 || visibilityPending || !catalog} />}
    {visibilityPending && !showDiscoveryCards && <p role="status">Checking project availability…</p>}
    {visibilityFailed && <div role="status"><p>Project availability is unavailable. Try again shortly.</p><button className={styles.retry} onClick={()=>{setFeedbackResult(null);setRetry(value=>value+1);}}>Try again</button></div>}
    {error ? <div role="status"><p>{error}</p><button className={styles.retry} onClick={()=>restartPage?changePage([]):setRetry(value=>value+1)}>{restartPage?'First page':'Try again'}</button></div> : !catalog ? <p role="status">Loading {label}…</p> : selectionError ? <p role="status">{selectionError}</p> : <>
      {!includeListings && !visibleReleases.length && !visibleProjects.length && !visibleListings.length && !visibilityPending && !visibilityFailed && <p role="status">{id || version ? 'This exact release is not in the catalog. No other version was substituted.' : search.trim() ? `No ${label} match this search.` : libraryOwnerId ? 'You have no libraries in the main catalog yet.' : `No ${label} are available yet.`}</p>}
      {visibleReleases.map(release=>{
        const playHref=showDiscoveryCards?undefined:playLink(release);
        return <HubProjectCard projectId={!practiceOnly&&release.status==='available'?release.id:undefined} key={`${release.id}/${release.version}`} title={release.title} description={releaseSummary(release, projectPreviews)} author={releaseAuthor(release, releaseAuthors)}
        compact={release.kind==='game'} siteReachable={feedback[release.id]?.repositoryUrl===release.repository.url && feedback[release.id]?.site.status==='reachable'} version={release.version} repositoryHref={release.repository.url} image={releaseImage(release, projectPreviews)} playHref={playHref} feedback={!practiceOnly&&release.status==='available'?projectFeedback({id:release.id,title:release.title,repositoryHref:release.repository.url,playHref,sourceCommit:release.source.commit,version:release.version}):undefined}>
        {release.status !== 'available' ? <p role="status">This release has been withdrawn.</p> : release.kind === 'library' ? <details><summary>Use this library</summary>
          <p>In the updated Zero editor, choose Libraries and games → {practiceOnly?'Browse tutorial practice':'Browse ZeroHub'} → {release.title} → Add library → Apply. Check the author and exact version before applying.</p>
          <p><a href={`${sourceLink(release)}/examples`}>View examples</a></p>
          {release.components?.map(component=><div key={component.className}><h4>{component.className}</h4>{component.description && <p>{component.description}</p>}<CodeBlock><code>{`import ${component.className};${component.usage ? `\n\n${component.usage}` : ''}`}</code></CodeBlock><details><summary>Public API</summary><CodeBlock><code>{component.api.join('\n')}</code></CodeBlock></details></div>)}
          {!release.components?.length && <p>Read the exact source for this library’s Java API and examples. Namespace: <code>{release.namespace}</code>.</p>}
          <details><summary>Manual Maven setup</summary><p>Add these entries to pom.xml.</p><CodeBlock><code>{dependencySnippet(release)}</code></CodeBlock><div className="resource-links"><a href={release.artifacts.jar?.url}>Download JAR</a><a href={release.artifacts.pom?.url}>View POM</a></div></details>
        </details> : null}
      </HubProjectCard>;
      })}
    </>}
    {visibleListings.map(item=><HubProjectCard key={item.identity} title={item.title} description="GitHub Pages app"
      author={item.author} repositoryHref={item.repositoryUrl} playHref={showDiscoveryCards?undefined:item.pagesUrl}
      siteReachable={!showDiscoveryCards&&!!item.pagesUrl} compact>
      {item.gameJamWinner && <span className={styles.winnerBadge}>Game Jam winner</span>}
      {!showDiscoveryCards && !item.pagesUrl && <a href={item.repositoryUrl}>Open on GitHub</a>}
    </HubProjectCard>)}
    </div>
    {projectPage && !restartPage && (pageCursors.length>0 || nextPage) && <nav aria-label="Projects pages" className="resource-links">
      {pageCursors.length>0 && <button className={styles.retry} type="button" onClick={()=>changePage(pageCursors.slice(0,-1))}>Previous page</button>}
      {nextPage && <button className={styles.retry} type="button" onClick={()=>changePage([...pageCursors,nextPage])}>Next page</button>}
    </nav>}
    </section>;
}
