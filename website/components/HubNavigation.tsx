import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';

export function HubNavigation({active}: {active: 'game' | 'library' | 'practice'}) {
  return <div className={styles.catalogTools}><nav className={styles.navigation} aria-label="ZeroHub catalog">
    <Link href="/hub?kind=game" aria-current={active === 'game' ? 'page' : undefined}>Projects</Link>
    <Link href="/hub?kind=library" aria-current={active === 'library' ? 'page' : undefined}>Libraries</Link>
  <Link href="/hub?kind=practice" aria-current={active === 'practice' ? 'page' : undefined}>Tutorial practice</Link>
  </nav><Link className={`button primary compact ${styles.shareAction}`} href="/hub/share">Share your work</Link></div>;
}
