import {Suspense} from 'react';
import {notFound, redirect} from 'next/navigation';
import {HubDiscovery} from '@/components/HubDiscovery';
import {LearnTheme} from '@/app/learn/LearnTheme';
import styles from './hub.module.css';
import '../../.generated/learn-theme.css';
import '../learn/learn.css';
export const metadata = {title:'ZeroHub'};
export default async function Hub({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams;
  // Repeated selectors are ambiguous; never silently select the first value.
  if (Array.isArray(query.kind) || Array.isArray(query.example)) notFound();
  if (query.example !== undefined || query.kind === 'example' || query.kind === 'all') redirect('/learn');
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className={`reading ${styles.discovery}`}><div className="intro"><h1>ZeroHub</h1><p className="fine-print">Projects are hosted by their authors and may change after sharing.</p><div className="hub-actions hub-account-actions"><a className="button primary compact" href="https://github.com/login" target="_blank" rel="noopener noreferrer">Sign in to GitHub<span className="sr-only"> (opens in a new tab)</span></a><a className="button secondary compact" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create GitHub account<span className="sr-only"> (opens in a new tab)</span></a></div></div><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></LearnTheme>;
}
