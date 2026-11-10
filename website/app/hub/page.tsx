import {Suspense} from 'react';
import {notFound, redirect} from 'next/navigation';
import {HubDiscovery} from '@/components/HubDiscovery';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import {isJamHubVisibilityEnforced} from '@/lib/jam-hub-visibility.mjs';
export const metadata = {title:'ZeroHub'};
// Read deployment mode per request, not at static build time.
export const dynamic = 'force-dynamic';
export default async function Hub({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams;
  // Repeated selectors are ambiguous; never silently select the first value.
  if (['kind', 'example', 'id', 'version'].some(key => Array.isArray(query[key]))) notFound();
  if (query.example !== undefined || query.kind === 'example' || query.kind === 'all') redirect('/learn');
  return <Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery enforceJamVisibility={isJamHubVisibilityEnforced()} showListings={listingsEnabled()} /></Suspense>;
}
