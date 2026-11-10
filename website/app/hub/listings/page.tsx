import {notFound} from 'next/navigation';
import {HubListings} from '@/components/HubListings';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import styles from '../hub.module.css';

export const metadata = {title:'My Apps'};
export const dynamic = 'force-dynamic';

export default function ListingsPage() {
  if (!listingsEnabled()) notFound();
  return <section className={styles.catalog} aria-labelledby="my-apps-heading">
    <h2 id="my-apps-heading">My Apps</h2>
    <HubListings />
  </section>;
}
