'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {dependencySnippet, releaseLink, selectReleases, sourceLink} from '@/lib/sharing-client.mjs';
import styles from '@/app/hub/hub.module.css';
type Artifact = {url:string; size:number; sha256:string};
type Component = {className:string; description:string; usage:string; api:string[]};
type Release = {kind:'library'|'game'; id:string; version:string; title:string; description:string; license:string; status:string; libraryKind?:string; namespace?:string; controls?:string; components?:Component[]; contributor:{login:string; githubId:string}; repository:{url:string}; source:{commit:string; folder:string; sha256:string}; coordinate?:{groupId:string;artifactId:string;version:string}; artifacts:{zip?:Artifact;jar?:Artifact;sources?:Artifact;pom?:Artifact;preview?:Artifact}};
type Catalog = {schema:number;revision:string;releases:Release[]};
export function HubDiscovery() {
  const query = useSearchParams();
  const requestedKind = query.get('kind') || 'library';
  const kind = requestedKind === 'game' ? 'game' : 'library';
  const id = query.get('id') || '', version = query.get('version') || '';
  const [catalog, setCatalog] = useState<Catalog|null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    setCatalog(null); setError('');
    void fetch('/api/sharing/catalog', {cache:'no-store', redirect:'error', signal:controller.signal}).then(async response => {
      if (!response.ok) throw new Error('ZeroHub is unavailable. Try again shortly.');
      const data = await response.json();
      if (active) setCatalog(data);
    }).catch(() => {if (active) setError('ZeroHub is unavailable. Try again shortly.');}).finally(() => clearTimeout(timer));
    return () => {active = false; clearTimeout(timer); controller.abort();};
  }, [retry]);
  let releases:Release[] = [], selectionError = '';
  if (catalog) try {
    if (!['game','library'].includes(requestedKind)) throw new Error('Choose games or libraries.');
    releases = selectReleases(catalog, {kind, search, id, version}) as Release[];
  } catch (failure) {selectionError = failure instanceof Error ? failure.message : 'This release link is invalid.';}
  return <section className={styles.catalog} aria-labelledby="sharing-heading">
    <h2 id="sharing-heading">Browse {kind === 'game' ? 'games' : 'libraries'}</h2>
    <nav className={styles.navigation} aria-label="ZeroHub catalog"><Link href="/hub?kind=game" aria-current={kind==='game'?'page':undefined}>Games</Link><Link href="/hub?kind=library" aria-current={kind==='library'?'page':undefined}>Libraries</Link><Link href="/hub/share">Share your work</Link></nav>
    {id || version ? <p className="hub-note">Exact release: {id || 'Missing ID'} · {version || 'Missing version'}. <Link href={`/hub?kind=${kind}`}>Browse all {kind==='game'?'games':'libraries'}</Link></p> : <div className="hub-form"><label htmlFor="sharing-search">Find {kind==='game'?'a game':'a library'}</label><input id="sharing-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} maxLength={200} placeholder="Title, author or description" /></div>}
    {error ? <div role="status"><p>{error}</p><button className={styles.retry} onClick={()=>setRetry(value=>value+1)}>Try again</button></div> : !catalog ? <p role="status">Loading {kind==='game'?'games':'libraries'}…</p> : selectionError ? <p role="status">{selectionError}</p> : <>
      <p className="fine-print">{kind==='game'?'Games are editable source projects. Download into a new folder and open separately in VS Code. Source packaging does not establish gameplay quality or safe execution.':'Libraries use exact Maven versions. You choose when to Add, Update or Revert in Zero; browsing does not change your project.'}</p>
      {!releases.length && <p role="status">{id || version ? 'This exact release is not in the catalog. No other version was substituted.' : search.trim() ? 'No releases match this search.' : `No ${kind==='game'?'games':'libraries'} are available yet.`}</p>}
      <div className="component-choices">{releases.map(release=><article className={`component-choice ${styles.card}`} key={`${release.id}/${release.version}`}>
        <h3><Link href={releaseLink(release)}>{release.title}</Link></h3><p>{release.description}</p>
        <p className={styles.metadata}>{release.id} · Version {release.version} · <a href={`https://github.com/${release.contributor.login}`}>@{release.contributor.login}</a> · {release.license}</p>
        {release.artifacts.preview && <img className="hub-preview" src={release.artifacts.preview.url} alt={`${release.title} preview`} loading="lazy" />}
        <p><a href={sourceLink(release)}>View exact source on GitHub</a></p>
        {release.status !== 'available' ? <p role="status">This release was withdrawn and cannot be downloaded or added. Your existing local files have not changed.</p> : release.kind === 'game' ? <>
          <p><strong>Controls:</strong> {release.controls}</p><a className="button primary compact" href={release.artifacts.zip?.url}>Download project</a><p className="fine-print">Extract into a new folder, then open that folder in VS Code. Review workspace trust before choosing Run App. This is a separate project.</p>
        </> : <details><summary>Use this library</summary>
          <p>{release.libraryKind==='widget'?'JavaFX widget':'Java helper'} · Java 17 · JavaFX 21.0.12</p><p>In Zero, choose Browse ZeroHub, select this exact library version, then Add library and Apply. Use the Java example and choose Run App.</p>
          {release.components?.map(component=><div key={component.className}><h4>{component.className}</h4><p>{component.description}</p><pre><code>{`import ${component.className};\n\n${component.usage}`}</code></pre><details><summary>Public API</summary><pre><code>{component.api.join('\n')}</code></pre></details></div>)}
          {!release.components?.length && <p>Read the exact source for this library’s Java API and examples. Namespace: <code>{release.namespace}</code>.</p>}
          <details><summary>Manual Maven setup</summary><p>Merge these repository and dependency entries into the existing sections of your project’s pom.xml. Keep the exact version.</p><pre><code>{dependencySnippet(release)}</code></pre><div className="resource-links"><a href={release.artifacts.jar?.url}>Download JAR</a><a href={release.artifacts.sources?.url}>Download sources</a><a href={release.artifacts.pom?.url}>View POM</a></div></details>
        </details>}
        <details><summary>Release details</summary><p>Source commit: <code>{release.source.commit}</code></p><p className={styles.hash}>Source SHA-256: <code>{release.source.sha256}</code></p>{Object.entries(release.artifacts).filter(([name])=>name!=='preview').map(([name, artifact])=><p className={styles.hash} key={name}>{name}: {artifact.size.toLocaleString()} bytes · SHA-256 <code>{artifact.sha256}</code></p>)}</details>
      </article>)}</div>
    </>}
  </section>;
}
