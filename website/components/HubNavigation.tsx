import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';
import {jamsNavigationAvailable} from '@/lib/jams-visibility.mjs';

export function HubNavigation({active, showListings=false}: {active: 'game' | 'library' | 'practice'; showListings?:boolean}) {
  return <div className={styles.catalogTools}>
    <Link className={styles.shareAction} href="/hub/share">Share your work</Link>
    <nav className={styles.navigation} aria-label="ZeroHub catalog">
    <Link href="/hub?kind=game" aria-current={active === 'game' ? 'page' : undefined}>Projects</Link>
    <Link href="/hub?kind=library" aria-current={active === 'library' ? 'page' : undefined}>Libraries</Link>
    {showListings && <Link href="/hub/listings">My Apps</Link>}
    {jamsNavigationAvailable() && <Link href="/hub/jams">ZeroJams</Link>}
    </nav>
  </div>;
}
