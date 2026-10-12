'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {useSearchParams} from 'next/navigation';
import {checkLabel, contributorProfile, dependencySnippet, previewPath, discoveryPage, appendDiscoveryPage, uploadsAvailable } from '@/lib/hub-client.mjs';
export type HubComponent = {className:string;description:string;api:string[];usage:string};
export type HubRelease = {status:'automatically-checked';libraryId:string;version:string;title:string;description:string;namespace:string;components:HubComponent[];platforms:string[];checks:{id:string;passed:boolean;detail:string}[];coordinate:{groupId:string;artifactId:string;version:string};preview:{path:string};contributor?:{githubId:string;login:string}};
export function HubDiscovery() {
  type Catalog={mode:string;capabilities?:{uploads:boolean};libraries:HubRelease[];nextCursor:string|null};
  const [result,setResult] = useState<{key:string;catalog:Catalog}|null>(null);
  const query=useSearchParams();
  const library=query.get('library')||'',version=query.get('version')||'';
  const exact=query.has('library')||query.has('version');
  const selection=exact?{library,version}:null;
  const [error,setError] = useState<{key:string;message:string}|null>(null);
  const [search,setSearch] = useState(''); const [origin,setOrigin]=useState('');
  const [loadingMore,setLoadingMore]=useState(false);
  const more=useRef<()=>void>(()=>{});
  const key=JSON.stringify([exact,library,version,exact?'':search]);
  const catalog=result?.key===key?result.catalog:null;
  const message=error?.key===key?error.message:'';
  useEffect(()=>{
    const abort=new AbortController();let active=true,busy=false,current:Catalog|null=null;
    setOrigin(window.location.origin);setError(null);setLoadingMore(false);
    const load=async(cursor:string|null=null)=>{
      if(busy)return;busy=true;if(cursor)setLoadingMore(true);
      try {
        const page=await discoveryPage({search,selection:exact?{library,version}:null,cursor,signal:abort.signal}) as Catalog;
        if(!active)return;
        const combined:Catalog=cursor&&current?appendDiscoveryPage(current,page):page;
        current=combined;setResult({key,catalog:combined});setError(null);
      }catch(error){if(active)setError({key,message:error instanceof Error?error.message:'Hub unavailable.'});}
      finally{busy=false;if(active)setLoadingMore(false);}
    };
    more.current=()=>{if(current?.nextCursor)void load(current.nextCursor);};
    const timer=setTimeout(()=>void load(),exact||!search?0:300);
    return()=>{active=false;clearTimeout(timer);abort.abort();more.current=()=>{};};
  },[key,exact,library,version,search]);
  return <section aria-labelledby="hub-components"><h2 id="hub-components">Library components</h2>
      {!selection && <div className="hub-form"><label htmlFor="component-search">Find a component</label><input id="component-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name or description" maxLength={200} /></div>}
      {selection && <p className="hub-note">Exact release: {selection.library} · {selection.version}. <Link href="/hub">Browse latest components</Link></p>}
    {!catalog && message ? <p className="fine-print" role="status">{message}</p> : !catalog ? <p role="status">Loading libraries…</p> : <>
      {catalog.mode==='local' && <p className="hub-note">Local test hub. These libraries are published only to this local service.</p>}
      <div className="component-choices">{catalog.libraries.flatMap(library=>library.components.map(component=>{
        const preview=previewPath(library),contributor=contributorProfile(library); let snippet=''; try{snippet=origin ? dependencySnippet(library,origin):'';}catch{return null;}
        return <article className="component-choice" key={`${library.libraryId}-${library.version}-${component.className}`}><h3>{component.className}</h3><p>{component.description}</p><p className="component-meta">In {library.title} · {library.libraryId} · {library.version}{contributor&&<> · <a href={contributor.url}>By @{contributor.login}</a></>}</p>
          {preview && <img className="hub-preview" src={preview} alt={`${library.title} component preview`} loading="lazy" />}
          <details><summary>Use this component</summary><p>Add this exact library version to your app’s pom.xml. Components in this library share the same dependency.</p><pre><code>{snippet}</code></pre><pre><code>{`import ${library.namespace}.${component.className};\n\n${component.usage}`}</code></pre><pre><code>{component.api.join('\n')}</code></pre></details>
          <details><summary>Automatically checked</summary><p>Checked platforms: {library.platforms.join(', ') || 'No platform reported'}. Java 17 · JavaFX 21.0.12 · MIT.</p><ul>{library.checks.map(check=><li key={check.id}>{check.passed?'Passed':'Failed'}: {checkLabel(check.id)}{!check.passed&&`: ${check.detail}`} </li>)}</ul><p className="fine-print">These checks cover the declared APIs, source boundaries and two consumer apps. They do not establish every behavior or compatibility with other platforms.</p></details>
        </article>;
      }))}</div>
      {!catalog.libraries.length && !selection && <p>{search.trim()?'No components match this search.':'No libraries are available yet.'}</p>}
      {message && <p role="status">{message}</p>}
      {catalog.nextCursor && <button className="button secondary compact" onClick={()=>more.current()} disabled={loadingMore}>{loadingMore?'Loading…':'Show more'}</button>}
    </>}
    {catalog && (uploadsAvailable(catalog) ? <Link className="button secondary compact" href="/hub/prepare">Make a library</Link> : <p className="fine-print" role="status">Library uploads are not open yet. You can browse and use available libraries.</p>)}
  </section>;
}
