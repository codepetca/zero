'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {dependencySnippet, playLink, projectSummary, selectMaintainedProjects, selectReleases, sourceLink} from '@/lib/sharing-client.mjs';
import maintainedProjects from '@/content/projects.json';
import styles from '@/app/hub/hub.module.css';
import {HubNavigation} from './HubNavigation';
import {CodeBlock} from './CodeBlock';
import {HubProjectCard} from './HubProjectCard';
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
    releases = selectReleases(catalog, {kind, search, id, version}) as Release[];
  } catch (failure) {selectionError = failure instanceof Error ? failure.message : 'This release link is invalid.';}
  return <section className={styles.catalog} aria-labelledby="sharing-heading">
    <h2 id="sharing-heading" className="sr-only">{kind === 'game' ? 'Projects' : 'Libraries'}</h2>
    <HubNavigation active={kind} />
    {id || version ? <p className="hub-note">Exact release: {id || 'Missing ID'} · {version || 'Missing version'}. <Link href={`/hub?kind=${kind}`}>Browse all {kind==='game'?'projects':'libraries'}</Link></p> : <div className="hub-form"><label htmlFor="sharing-search">Find {kind==='game'?'a project':'a library'}</label><input id="sharing-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} maxLength={200} placeholder="Title, author or description" /></div>}
    <div className={styles.cards}>
    {projects.map(project => <HubProjectCard key={project.id} title={project.title} description={projectSummary(project.description)} author={project.author}
      image={project.image} sourceHref={`${project.repositoryUrl}/tree/${project.sourceCommit}`} />)}
    {error ? <div role="status"><p>{error}</p><button className={styles.retry} onClick={()=>setRetry(value=>value+1)}>Try again</button></div> : !catalog ? <p role="status">Loading {kind==='game'?'projects':'libraries'}…</p> : selectionError ? <p role="status">{selectionError}</p> : <>
      {!releases.length && !projects.length && <p role="status">{id || version ? 'This exact release is not in the catalog. No other version was substituted.' : search.trim() ? `No ${kind==='game'?'projects':'libraries'} match this search.` : `No ${kind==='game'?'projects':'libraries'} are available yet.`}</p>}
      {releases.map(release=><HubProjectCard key={`${release.id}/${release.version}`} title={release.title} description={projectSummary(release.description)} author={release.contributor.login}
        version={release.version} sourceHref={sourceLink(release)} image={release.artifacts.preview?.url} playHref={playLink(release)}>
        {release.status !== 'available' ? <p role="status">This release has been withdrawn.</p> : release.kind === 'library' ? <details><summary>Use this library</summary>
          <p>In Zero, choose Browse ZeroHub → {release.title} → Add library → Apply.</p>
          {release.components?.map(component=><div key={component.className}><h4>{component.className}</h4><p>{component.description}</p><CodeBlock><code>{`import ${component.className};\n\n${component.usage}`}</code></CodeBlock><details><summary>Public API</summary><CodeBlock><code>{component.api.join('\n')}</code></CodeBlock></details></div>)}
          {!release.components?.length && <p>Read the exact source for this library’s Java API and examples. Namespace: <code>{release.namespace}</code>.</p>}
          <details><summary>Manual Maven setup</summary><p>Add these entries to pom.xml.</p><CodeBlock><code>{dependencySnippet(release)}</code></CodeBlock><div className="resource-links"><a href={release.artifacts.jar?.url}>Download JAR</a><a href={release.artifacts.pom?.url}>View POM</a></div></details>
        </details> : null}
      </HubProjectCard>)}
    </>}
    </div>
  </section>;
}
