'use client';
import Link from 'next/link';
import {useEffect, useState, type ReactNode} from 'react';
import {useSearchParams} from 'next/navigation';
import {dependencySnippet, maintainedPlayLink, playLink, projectSummary, releaseAuthor, releaseImage, releaseSummary, selectMaintainedProjects, selectReleases, sourceLink} from '@/lib/sharing-client.mjs';
import maintainedProjects from '@/content/projects.json';
import projectPreviews from '@/content/project-previews.json';
import releaseAuthors from '@/content/release-authors.json';
import styles from '@/app/hub/hub.module.css';
import {HubNavigation} from './HubNavigation';
import {CodeBlock} from './CodeBlock';
import {loadMetricBatches, metricLabel} from '@/lib/hub-metrics-client.mjs';
import {HubProjectCard} from './HubProjectCard';
import {HubProjectInfo} from './HubProjectInfo';
import {HubProjectFeedback, HubProjectDetails, type ProjectFeedback} from './HubProjectFeedback';
type Artifact = {url:string; size:number; sha256:string};
type Component = {className:string; description:string; usage:string; api:string[]};
type Release = {kind:'library'|'game'; id:string; version:string; title:string; description:string; license:string; status:string; libraryKind?:string; namespace?:string; controls?:string; web?:{provider:'github-pages';url:string;commit:string;runId:number}; components?:Component[]; contributor:{login:string; githubId:string}; repository:{url:string}; source:{commit:string; folder:string; sha256:string}; coordinate?:{groupId:string;artifactId:string;version:string}; artifacts:{zip?:Artifact;jar?:Artifact;sources?:Artifact;pom?:Artifact;preview?:Artifact}};
type Catalog = {schema:number;revision:string;releases:Release[]};
export function HubDiscovery() {
  const query = useSearchParams();
  const requestedKind = query.get('kind') || (query.has('id') || query.has('version') ? 'library' : 'game');
  const kind = requestedKind === 'game' ? 'game' : 'library';
  const id = query.get('id') || '', version = query.get('version') || '';
  const [catalog, setCatalog] = useState<Catalog|null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<Record<string,ProjectFeedback>>({});
  type Metric = {id:string;kind:string;opens?:number|null;projects?:number|null;observedProjects?:number|null;totalProjects?:number|null};
  const [metrics, setMetrics] = useState<Record<string,Metric>>({});
  const [retry, setRetry] = useState(0);
  const projects = selectMaintainedProjects(maintainedProjects, {kind, search, id, version}) as typeof maintainedProjects;
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    setCatalog(null); setError('');
    void fetch('/api/sharing/catalog/web', {cache:'no-store', redirect:'error', signal:controller.signal}).then(async response => {
      if (!response.ok) throw new Error('The shared catalog is unavailable. Try again shortly.');
      const data = await response.json();
      if (active) setCatalog(data);
    }).catch(() => {if (active) setError('The shared catalog is unavailable. Try again shortly.');}).finally(() => clearTimeout(timer));
    return () => {active = false; clearTimeout(timer); controller.abort();};
  }, [retry]);
  let releases:Release[] = [], selectionError = '';
  if (catalog) try {
    if (!['game','library'].includes(requestedKind)) throw new Error('Choose games or libraries.');
    releases = selectReleases(catalog, {kind, search, id, version, attributions:releaseAuthors}) as Release[];
  } catch (failure) {selectionError = failure instanceof Error ? failure.message : 'This release link is invalid.';}
  const feedbackIds = [...projects.map(project=>project.id),...releases.filter(release=>release.status==='available').map(release=>release.id)].slice(0,12).join(',');
  const metricIds = [...projects.map(project=>project.id),...releases.filter(release=>release.status==='available').map(release=>release.id)].join(',');
  useEffect(()=>{
    const controller=new AbortController();let active=true;setFeedback({});
    if(feedbackIds)void fetch(`/api/hub/projects?${new URLSearchParams({kind,ids:feedbackIds})}`,{cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(async response=>{
      if(!response.ok)return;const data=await response.json();
      if(!active||data.schema!==1||!Array.isArray(data.items))return;
      const ids=new Set(feedbackIds.split(','));
      setFeedback(Object.fromEntries(data.items.filter((item:ProjectFeedback)=>item&&ids.has(item.id)&&item.kind===kind&&typeof item.repositoryUrl==='string'&&(item.stars===null||Number.isSafeInteger(item.stars)&&item.stars>=0)&&(item.issuesEnabled===null||typeof item.issuesEnabled==='boolean')&&item.site&&['reachable','unreachable','unknown','not-checked'].includes(item.site.status)&&(!item.site.checkedAt||Number.isFinite(Date.parse(item.site.checkedAt)))).map((item:ProjectFeedback)=>[item.id,item])));
    }).catch(()=>{/* Counts and checks are optional; browsing and reporting remain available. */});
    return()=>{active=false;controller.abort();};
  },[kind,feedbackIds]);
  useEffect(()=>{
    const controller=new AbortController(), requested=new Set<string>();setMetrics({});
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
  },[kind,metricIds]);
  const projectMetric=(id:string)=>{const label=metricLabel(kind,metrics[id]);return label?<p className={styles.metrics} title={label.hint}>{label.text}<span className="sr-only">. {label.hint}</span></p>:null;};
  const projectFeedback=(entry:{id:string;title:string;repositoryHref:string;playHref?:string;sourceCommit?:string;version?:string})=>(identity?:ReactNode,description?:string,placement?:'details')=>{
    const observed=feedback[entry.id]?.repositoryUrl===entry.repositoryHref?feedback[entry.id]:undefined;
    if(placement==='details')return <HubProjectInfo title={entry.title} available={observed?.site.status==='reachable'}><HubProjectDetails {...entry} feedback={observed} description={description}>{identity}</HubProjectDetails></HubProjectInfo>;
    return <HubProjectFeedback {...entry} kind={kind} compact={kind==='game'} feedback={observed} metric={projectMetric(entry.id)}>{identity}</HubProjectFeedback>;
  };
  return <section className={styles.catalog} aria-labelledby="sharing-heading">
    <h2 id="sharing-heading" className="sr-only">{kind === 'game' ? 'Projects' : 'Libraries'}</h2>
    <HubNavigation active={kind} />
    {id || version ? <p className="hub-note">Exact release: {id || 'Missing ID'} · {version || 'Missing version'}. <Link href={`/hub?kind=${kind}`}>Browse all {kind==='game'?'projects':'libraries'}</Link></p> : <div className="hub-form"><label htmlFor="sharing-search">Find {kind==='game'?'a project':'a library'}</label><input id="sharing-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} maxLength={200} placeholder="Title, author or description" /></div>}
    <div className={`${styles.cards}${kind==='game'?` ${styles.projectCards}`:''}`}>
    {projects.map(project => <HubProjectCard projectId={project.id} key={project.id} title={project.title} description={projectSummary(project.description)} author={project.author}
      compact siteReachable={feedback[project.id]?.repositoryUrl===project.repositoryUrl && feedback[project.id]?.site.status==='reachable'} image={project.image} playHref={maintainedPlayLink(project)} repositoryHref={project.repositoryUrl} feedback={projectFeedback({id:project.id,title:project.title,repositoryHref:project.repositoryUrl,playHref:maintainedPlayLink(project),sourceCommit:project.sourceCommit})} />)}
    {error ? <div role="status"><p>{error}</p><button className={styles.retry} onClick={()=>setRetry(value=>value+1)}>Try again</button></div> : !catalog ? <p role="status">Loading {kind==='game'?'projects':'libraries'}…</p> : selectionError ? <p role="status">{selectionError}</p> : <>
      {!releases.length && !projects.length && <p role="status">{id || version ? 'This exact release is not in the catalog. No other version was substituted.' : search.trim() ? `No ${kind==='game'?'projects':'libraries'} match this search.` : `No ${kind==='game'?'projects':'libraries'} are available yet.`}</p>}
      {releases.map(release=><HubProjectCard projectId={release.status==='available'?release.id:undefined} key={`${release.id}/${release.version}`} title={release.title} description={releaseSummary(release, projectPreviews)} author={releaseAuthor(release, releaseAuthors)}
        compact={release.kind==='game'} siteReachable={feedback[release.id]?.repositoryUrl===release.repository.url && feedback[release.id]?.site.status==='reachable'} version={release.version} repositoryHref={release.repository.url} image={releaseImage(release, projectPreviews)} playHref={playLink(release)} feedback={release.status==='available'?projectFeedback({id:release.id,title:release.title,repositoryHref:release.repository.url,playHref:playLink(release),sourceCommit:release.source.commit,version:release.version}):undefined}>
        {release.status !== 'available' ? <p role="status">This release has been withdrawn.</p> : release.kind === 'library' ? <details><summary>Use this library</summary>
          <p>In Zero, choose Browse ZeroHub → {release.title} → Add library → Apply.</p>
          <p><a href={`${sourceLink(release)}/examples`}>View examples</a></p>
          {release.components?.map(component=><div key={component.className}><h4>{component.className}</h4>{component.description && <p>{component.description}</p>}<CodeBlock><code>{`import ${component.className};${component.usage ? `\n\n${component.usage}` : ''}`}</code></CodeBlock><details><summary>Public API</summary><CodeBlock><code>{component.api.join('\n')}</code></CodeBlock></details></div>)}
          {!release.components?.length && <p>Read the exact source for this library’s Java API and examples. Namespace: <code>{release.namespace}</code>.</p>}
          <details><summary>Manual Maven setup</summary><p>Add these entries to pom.xml.</p><CodeBlock><code>{dependencySnippet(release)}</code></CodeBlock><div className="resource-links"><a href={release.artifacts.jar?.url}>Download JAR</a><a href={release.artifacts.pom?.url}>View POM</a></div></details>
        </details> : null}
      </HubProjectCard>)}
    </>}
    </div>
  </section>;
}
