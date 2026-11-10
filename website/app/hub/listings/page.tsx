import Link from 'next/link';
import {notFound} from 'next/navigation';
import {LearnTheme} from '@/app/learn/LearnTheme';
import {HubListings} from '@/components/HubListings';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import '../../../.generated/learn-theme.css';
import '../../learn/learn.css';
import styles from '../hub.module.css';

export const metadata = {title:'My listings'};
export const dynamic = 'force-dynamic';

export default function ListingsPage() {
  if (!listingsEnabled()) notFound();
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className={`reading ${styles.discovery}`}>
    <Link href="/hub">Back to ZeroHub</Link>
    <h1>My listings</h1>
    <HubListings />
  </main></LearnTheme>;
}
