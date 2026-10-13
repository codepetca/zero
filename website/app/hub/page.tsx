import {Suspense} from 'react';
import {HubDiscovery} from '@/components/HubDiscovery';
import {PageHeader} from '@/components/PageHeader';
export const metadata = {title:'ZeroHub'};
export default function Hub() {
  return <><PageHeader active="ZeroHub" /><main id="page-content" tabIndex={-1} className="reading"><div className="intro"><p className="eyebrow">ZeroHub</p><h1>Games and libraries</h1><p className="lead">Explore shared Java projects and useful classes.</p></div><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></>;
}
