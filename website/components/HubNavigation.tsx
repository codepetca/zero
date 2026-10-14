import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';

export function HubNavigation({active}: {active: 'example' | 'game' | 'library' | 'share'}) {
  return <nav className={styles.navigation} aria-label="ZeroHub catalog">
    <Link href="/hub?kind=example" aria-current={active === 'example' ? 'page' : undefined}>Starters</Link>
    <Link href="/hub?kind=game" aria-current={active === 'game' ? 'page' : undefined}>Projects</Link>
    <Link href="/hub?kind=library" aria-current={active === 'library' ? 'page' : undefined}>Libraries</Link>
    <Link href="/hub/share" aria-current={active === 'share' ? 'page' : undefined}>Share your work</Link>
  </nav>;
}
