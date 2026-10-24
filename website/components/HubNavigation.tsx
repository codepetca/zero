import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';

export function HubNavigation({active}: {active: 'game' | 'library'}) {
  return <div className={styles.catalogTools}><nav className={styles.navigation} aria-label="ZeroHub catalog">
    <Link href="/hub?kind=game" aria-current={active === 'game' ? 'page' : undefined}>Projects</Link>
    <Link href="/hub?kind=library" aria-current={active === 'library' ? 'page' : undefined}>Libraries</Link>
  </nav><Link className={styles.shareAction} href="/hub/share">Share your work</Link></div>;
}
