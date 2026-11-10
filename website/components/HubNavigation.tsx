import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';

export type HubSection = 'game' | 'library' | 'practice' | 'listings' | 'share' | 'jams';

export function HubNavigation({active, showListings, showJams}: {active:HubSection; showListings:boolean; showJams:boolean}) {
  return <div className={styles.catalogTools}>
    <Link className={styles.shareAction} href="/hub/share" aria-current={active === 'share' ? 'page' : undefined}>Share your work</Link>
    <nav className={styles.navigation} aria-label="ZeroHub catalog">
    <Link href="/hub?kind=game" aria-current={active === 'game' ? 'page' : undefined}>Projects</Link>
    <Link href="/hub?kind=library" aria-current={active === 'library' ? 'page' : undefined}>Libraries</Link>
    {showListings && <Link href="/hub/listings" aria-current={active === 'listings' ? 'page' : undefined}>My Apps</Link>}
    {showJams && <Link href="/hub/jams" aria-current={active === 'jams' ? 'page' : undefined}>Jams</Link>}
    </nav>
  </div>;
}
