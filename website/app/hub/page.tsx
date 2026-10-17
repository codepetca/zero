import {Suspense} from 'react';
import {notFound, redirect} from 'next/navigation';
import {HubDiscovery} from '@/components/HubDiscovery';
import {HubExamples} from '@/components/HubExamples';
import {LearnTheme} from '@/app/learn/LearnTheme';
import styles from './hub.module.css';
import examples from '../../.generated/example-projects.json';
import {selectHubProject} from '@/lib/project-curriculum.mjs';
export const metadata = {title:'ZeroHub'};
export default async function Hub({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams;
  // Repeated selectors are ambiguous; never silently select the first value.
  if (Array.isArray(query.kind) || Array.isArray(query.example)) notFound();
  const kind = query.kind ?? (query.example !== undefined ? 'example' : query.id !== undefined || query.version !== undefined ? 'library' : 'game');
  if (kind === 'example') {
    if (query.id !== undefined || query.version !== undefined) notFound();
    if (query.example === undefined) redirect('/learn');
    const project = selectHubProject(examples, query.example);
    if (!project) notFound();
    return <HubExamples snapshot={examples} project={project} />;
  }
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className={`reading ${styles.discovery}`}><div className="intro"><h1>ZeroHub</h1><p className="fine-print">Projects are hosted by students and may change after sharing.</p><div className="hub-actions hub-account-actions"><a className="button primary compact" href="https://github.com/login" target="_blank" rel="noopener noreferrer">Sign in to GitHub<span className="sr-only"> (opens in a new tab)</span></a><a className="button secondary compact" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create GitHub account<span className="sr-only"> (opens in a new tab)</span></a></div></div><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></LearnTheme>;
}
