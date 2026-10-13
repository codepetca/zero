import {Suspense} from 'react';
import Link from 'next/link';
import {HubDiscovery} from '@/components/HubDiscovery';
import {PageHeader} from '@/components/PageHeader';
export const metadata = {title:'ZeroHub'};
export default function Hub() {
  return <><PageHeader active="ZeroHub" /><main id="page-content" tabIndex={-1} className="reading"><div className="intro"><h1>ZeroHub</h1><h2 className="page-subtitle">Games and libraries</h2><p className="lead">Browse shared games and libraries without signing in.</p><p className="hub-note">To share your work, sign in to GitHub in Zero. <Link href="/hub/share">See how to share</Link>.</p></div><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></>;
}
