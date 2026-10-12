'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {useSearchParams} from 'next/navigation';
import {checkLabel, contributorProfile, dependencySnippet, previewPath, selectedLibraries, uploadsAvailable } from '@/lib/hub-client.mjs';
export type HubComponent = {className:string;description:string;api:string[];usage:string};
export type HubRelease = {status:'automatically-checked';libraryId:string;version:string;title:string;description:string;namespace:string;components:HubComponent[];platforms:string[];checks:{id:string;passed:boolean;detail:string}[];coordinate:{groupId:string;artifactId:string;version:string};preview:{path:string};contributor?:{githubId:string;login:string}};
export function HubDiscovery() {
  const [catalog,setCatalog] = useState<{mode:string;capabilities?:{uploads:boolean};libraries:HubRelease[]} | null>(null);
  const query=useSearchParams();
  const selection=query.has('library')||query.has('version') ? {library:query.get('library')||'',version:query.get('version')||''}:null;
  const [error,setError] = useState(''); const [search,setSearch] = useState(''); const [origin,setOrigin]=useState('');
  useEffect(()=>{let active=true; setOrigin(window.location.origin); fetch('/api/hub/catalog',{cache:'no-store'}).then(async response=>{const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Hub unavailable.'); if(!Array.isArray(data.libraries)) throw new Error('Hub catalog is invalid.'); if(active)setCatalog(data);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
  return <section aria-labelledby="hub-components"><h2 id="hub-components">Library components</h2>
    {error ? <p className="fine-print" role="status">{error}</p> : !catalog ? <p role="status">Loading libraries…</p> : <>
      {catalog.mode==='local' && <p className="hub-note">Local test hub. These libraries are published only to this local service.</p>}
      {selection && <p className="hub-note">Exact release: {selection.library} · {selection.version}. <Link href="/hub">Browse latest components</Link></p>}
      {selection && !catalog.libraries.some(library=>library.status==='automatically-checked'&&library.libraryId===selection.library&&library.version===selection.version) && <p role="status">That exact checked release is unavailable. No newer release has been substituted.</p>}
      <div className="hub-form"><label htmlFor="component-search">Find a component</label><input id="component-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name or description" /></div>
      <div className="component-choices">{(selectedLibraries(catalog.libraries,selection) as HubRelease[]).flatMap(library=>library.components.filter(component=>`${component.className} ${component.description} ${library.title}`.toLowerCase().includes(search.toLowerCase())).map(component=>{
        const preview=previewPath(library),contributor=contributorProfile(library); let snippet=''; try{snippet=origin ? dependencySnippet(library,origin):'';}catch{return null;}
        return <article className="component-choice" key={`${library.libraryId}-${component.className}`}><h3>{component.className}</h3><p>{component.description}</p><p className="component-meta">In {library.title} · {library.libraryId} · {library.version}{contributor&&<> · <a href={contributor.url}>By @{contributor.login}</a></>}</p>
          {preview && <img className="hub-preview" src={preview} alt={`${library.title} component preview`} loading="lazy" />}
          <details><summary>Use this component</summary><p>Add this exact library version to your app’s pom.xml. Components in this library share the same dependency.</p><pre><code>{snippet}</code></pre><pre><code>{`import ${library.namespace}.${component.className};\n\n${component.usage}`}</code></pre><pre><code>{component.api.join('\n')}</code></pre></details>
          <details><summary>Automatically checked</summary><p>Checked platforms: {library.platforms.join(', ') || 'No platform reported'}. Java 17 · JavaFX 21.0.12 · MIT.</p><ul>{library.checks.map(check=><li key={check.id}>{check.passed?'Passed':'Failed'}: {checkLabel(check.id)}{!check.passed&&`: ${check.detail}`} </li>)}</ul><p className="fine-print">These checks cover the declared APIs, source boundaries and two consumer apps. They do not establish every behavior or compatibility with other platforms.</p></details>
        </article>;
      }))}</div>
      {!catalog.libraries.length && <p>No libraries are available yet.</p>}
    </>}
    {catalog && (uploadsAvailable(catalog) ? <Link className="button secondary compact" href="/hub/prepare">Make a library</Link> : <p className="fine-print" role="status">Library uploads are not open yet. You can browse and use available libraries.</p>)}
  </section>;
}
