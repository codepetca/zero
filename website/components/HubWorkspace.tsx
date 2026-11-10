'use client';

import {createContext, useContext, useState, type ReactNode} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {LearnTheme} from '@/app/learn/LearnTheme';
import styles from '@/app/hub/hub.module.css';
import {HubNavigation, type HubSection} from './HubNavigation';
import {Icon} from './Icon';
import {SidebarLayout} from './SidebarLayout';

const HubSearch = createContext('');
export const useHubSearch = () => useContext(HubSearch);

export function HubWorkspace({children, showListings, showJams, allowJams}:{children:ReactNode; showListings:boolean; showJams:boolean; allowJams:boolean}) {
  const path = usePathname();
  const query = useSearchParams();
  const [search, setSearch] = useState('');
  const [jamSearch, setJamSearch] = useState('');
  const discovery = path === '/hub';
  const exact = discovery && Boolean(query.get('id') || query.get('version'));
  let active:HubSection;
  if (discovery) {
    const kind = query.get('kind') || (query.has('id') || query.has('version') ? 'library' : 'game');
    active = kind === 'game' || kind === 'practice' ? kind : 'library';
  } else if (path === '/hub/listings' && showListings) {
    active = 'listings';
  } else if (path === '/hub/share') {
    active = 'share';
  } else if (path === '/hub/jams' && allowJams) {
    active = 'jams';
  } else {
    return children;
  }

  const searchParams = query.toString();
  const returnTo = searchParams ? `${path}?${searchParams}` : path;
  const jams = active === 'jams';
  const sidebar = <>
    {jams ? <p className={styles.sidebarTitle}>ZeroHub</p> : <h1 className={styles.sidebarTitle}>ZeroHub</h1>}
    <p className={styles.tagline}>Play. Share. Learn.</p>
    {!exact && <div className={styles.search}>
      <Icon name="search" />
      <input id="sharing-search" type="search" aria-label={jams ? 'Search jams' : 'Search ZeroHub'} value={jams ? jamSearch : search}
        onChange={event=>(jams ? setJamSearch : setSearch)(event.target.value)} maxLength={200}
        placeholder={jams ? 'Search jams' : 'search zerohub'} disabled={!discovery && !jams} />
    </div>}
    <HubNavigation active={active} showListings={showListings} showJams={showJams || jams} />
    <p className={styles.sidebarDescription}>Play projects in your browser, find reusable libraries, and share what you build with Zero.</p>
  </>;
  return <LearnTheme active="ZeroHub" hubReturnTo={returnTo}>
    <SidebarLayout className={`reading ${styles.discovery}`} sidebarClassName={styles.sidebar}
      sidebarLabel="ZeroHub discovery" sidebar={sidebar}>
      <HubSearch.Provider value={jams ? jamSearch : exact ? '' : search}>{children}</HubSearch.Provider>
    </SidebarLayout>
  </LearnTheme>;
}
