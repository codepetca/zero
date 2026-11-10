import Link from 'next/link';
import type {ReactNode} from 'react';
import styles from '@/app/hub/hub.module.css';

type Navigation = {active:'game'|'library'|'practice'|'jams';showListings?:boolean;showJams?:boolean};

export function HubSidebar({children,...navigation}:Navigation & {children?:ReactNode}) {
  return <aside className={styles.sidebar} aria-label="ZeroHub discovery">
    {navigation.active==='jams'?<p className={styles.sidebarTitle}>ZeroHub</p>:<h1 className={styles.sidebarTitle}>ZeroHub</h1>}
    <p className={styles.tagline}>Play. Share. Learn.</p>
    {children}
    <HubNavigation {...navigation} />
    <p className={styles.sidebarDescription}>Play projects in your browser, find reusable libraries, and share what you build with Zero.</p>
  </aside>;
}

export function HubNavigation({active,showListings=false,showJams=false}:Navigation) {
  return <div className={styles.catalogTools}>
    <Link className={styles.shareAction} href="/hub/share">Share your work</Link>
    <nav className={styles.navigation} aria-label="ZeroHub catalog">
    <Link href="/hub?kind=game" aria-current={active === 'game' ? 'page' : undefined}>Projects</Link>
    <Link href="/hub?kind=library" aria-current={active === 'library' ? 'page' : undefined}>Libraries</Link>
    {showListings && <Link href="/hub/listings">My Apps</Link>}
    {showJams && <Link href="/hub/jams" aria-current={active==='jams'?'page':undefined}>Jams</Link>}
    </nav>
  </div>;
}
