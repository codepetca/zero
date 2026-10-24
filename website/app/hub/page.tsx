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
  if (['kind', 'example', 'id', 'version'].some(key => Array.isArray(query[key]))) notFound();
  if (query.example !== undefined || query.kind === 'example' || query.kind === 'all') redirect('/learn');
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className={`reading ${styles.discovery}`}><Suspense fallback={<p role="status">Loading ZeroHub…</p>}><HubDiscovery /></Suspense></main></LearnTheme>;
}
