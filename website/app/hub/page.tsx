import {Suspense} from 'react';
import {notFound} from 'next/navigation';
import {HubDiscovery} from '@/components/HubDiscovery';
import {HubExamples} from '@/components/HubExamples';
import {PageHeader} from '@/components/PageHeader';
import examples from '../../.generated/example-projects.json';
import {selectHubProject} from '@/lib/project-curriculum.mjs';
export const metadata = {title:'ZeroHub'};
export default async function Hub({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams;
  // Repeated selectors are ambiguous; never silently select the first value.
  if (Array.isArray(query.kind) || Array.isArray(query.example)) notFound();
  const kind = query.kind ?? (query.id !== undefined || query.version !== undefined ? 'library' : 'example');
  if (kind === 'example') {
    if (query.id !== undefined || query.version !== undefined) notFound();
    const project = selectHubProject(examples, query.example);
    if (!project) notFound();
    return <HubExamples snapshot={examples} project={project} />;
  }
  return <><PageHeader active="ZeroHub" /><main id="page-content" tabIndex={-1} className="reading"><div className="intro"><h1>ZeroHub</h1><h2 className="page-subtitle">Games and libraries</h2><div className="hub-actions hub-account-actions"><a className="button primary compact" href="https://github.com/login" target="_blank" rel="noopener noreferrer">Sign in to GitHub<span className="sr-only"> (opens in a new tab)</span></a><a className="button secondary compact" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create GitHub account<span className="sr-only"> (opens in a new tab)</span></a></div></div><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></>;
}
