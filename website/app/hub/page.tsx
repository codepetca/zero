import {Suspense} from 'react';
import {notFound,redirect} from 'next/navigation';
import Link from 'next/link';
import {HubDiscovery} from '@/components/HubDiscovery';
import {HubMyLibraries} from '@/components/HubMyLibraries';
import {isJamHubVisibilityEnforced} from '@/lib/jam-hub-visibility.mjs';

export const metadata={title:'ZeroHub'};

export default async function Hub({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  // Repeated selectors are ambiguous; never silently select the first value.
  if(['kind','example','id','version','view'].some(key=>Array.isArray(query[key])))notFound();
  if(query.example!==undefined||query.kind==='example'||query.kind==='all')redirect('/learn');
  if(query.id===undefined&&query.version===undefined) {
    if(query.kind==='library'&&query.view==='mine')return <HubMyLibraries enforceJamVisibility={isJamHubVisibilityEnforced()}/>;
    if((!query.kind||query.kind==='game')&&query.view==='publish')return <>
      <h1>Publish an app</h1>
      <ol className="steps">
        <li>In Zero, open your project and sign in to GitHub.</li>
        <li>In the Run menu, choose <strong>Publish &amp; open app</strong>.</li>
        <li>When the published app opens, copy its link to share it.</li>
      </ol>
      <p>Zero publishes the app to GitHub Pages. Eligible apps can also appear in ZeroHub.</p>
      <p><Link href="/hub/share?view=game">Share a game with its source</Link></p>
    </>;
    if(query.kind==='library'&&query.view==='use')return <>
      <h1>Add a library</h1>
      <ol className="steps">
        <li>In Zero, open <strong>Libraries and games</strong>.</li>
        <li>Choose <strong>Browse ZeroHub</strong> and select a library.</li>
        <li>Check the author and version, then choose <strong>Add library → Apply</strong>.</li>
      </ol>
      <p><Link href="/hub?kind=library">Browse libraries</Link></p>
    </>;
  }
  return <Suspense fallback={<p role="status">Loading projects…</p>}>
    <HubDiscovery enforceJamVisibility={isJamHubVisibilityEnforced()} paginatedProjects/>
  </Suspense>;
}
