import {Suspense} from 'react';
import {HubDiscovery} from '@/components/HubDiscovery';
import {PageHeader} from '@/components/PageHeader';
export const metadata = {title:'ZeroHub'};
export default function Hub() {
  return <><PageHeader active="ZeroHub" /><main id="page-content" tabIndex={-1} className="reading"><div className="intro"><h1>ZeroHub</h1><h2 className="page-subtitle">Games and libraries</h2><div className="hub-actions hub-account-actions"><a className="button primary compact" href="https://github.com/login" target="_blank" rel="noopener noreferrer">Sign in to GitHub<span className="sr-only"> (opens in a new tab)</span></a><a className="button secondary compact" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create GitHub account<span className="sr-only"> (opens in a new tab)</span></a></div></div><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></>;
}
