import {Suspense} from 'react';
import {notFound,redirect} from 'next/navigation';
import Link from 'next/link';
import {HubDiscovery,HubProjectsFallback} from '@/components/HubDiscovery';
import {HubMyLibraries} from '@/components/HubMyLibraries';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import {isJamHubVisibilityEnforced} from '@/lib/jam-hub-visibility.mjs';
import {hubProjectPageResponse} from '@/lib/hub-project-page.mjs';

export const metadata={title:'ZeroHub'};

async function Projects() {
  // The reader uses the URL only to parse selectors. Resolve providers on
  // the server without an extra HTTP request to this deployment.
  const response=await hubProjectPageResponse(new Request('https://zerohub.invalid/api/hub/projects/discover?q='));
  const initialProjects=response.ok?await response.json():null;
  return <HubDiscovery key="project-browser" enforceJamVisibility={isJamHubVisibilityEnforced()}
    paginatedProjects initialProjects={initialProjects}/>;
}

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
      <p>To choose the ZeroHub picture, commit a square PNG as <code>zerohub/thumbnail.png</code> (128 to 2048 pixels, up to 1 MB) before publishing. Without one, ZeroHub shows a pattern made from your GitHub name and repository name.</p>
      <p>Zero publishes the app to GitHub Pages. Eligible apps can also appear in ZeroHub.</p>
      {listingsEnabled()&&<>
        <h2 id="app-listings">How app listings work</h2>
        <p>Choose <strong>Do not replace</strong> to protect one app. Choose <strong>Move to back</strong> to keep an app in the queue longer.</p>
        <p><strong>Remove from ZeroHub</strong> takes the app out of discovery. Its GitHub Pages link still works.</p>
      </>}
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
  const browseProjects=query.kind==='game'?!query.id&&!query.version:
    !query.kind&&query.id===undefined&&query.version===undefined;
  if(browseProjects)return <Suspense fallback={<HubProjectsFallback/>}>
    <Projects/>
  </Suspense>;
  return <Suspense fallback={null}>
    <HubDiscovery key="legacy-discovery" enforceJamVisibility={isJamHubVisibilityEnforced()}/>
  </Suspense>;
}
