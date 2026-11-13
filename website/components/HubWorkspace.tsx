'use client';

import type {ReactNode} from 'react';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import {LearnTheme} from '@/app/learn/LearnTheme';
import styles from '@/app/hub/hub.module.css';
import {SidebarLayout} from './SidebarLayout';
import {HubNavigation,type HubSection} from './HubNavigation';
import {JamDirectoryProvider,useJamDirectory} from './JamClient';

// The sidebar names the current ZeroHub section above its navigation.
export const HUB_SECTION_TITLES:Record<HubSection,string>={game:'Projects',library:'Libraries',jams:'ZeroJams'};
function Workspace({active,path,view,showListings,showJams,children}:{
  active:HubSection;path:string;view:string;showListings:boolean;showJams:boolean;children:ReactNode;
}) {
  const {canCreate}=useJamDirectory();
  const sidebar = <>
    <Link className={styles.sidebarEyebrow} href="/hub">ZeroHub</Link>
    <p className={`${styles.sidebarTitle} ${styles.sidebarIntro}`}>{HUB_SECTION_TITLES[active]}</p>
    <HubNavigation active={active} path={path} view={view} showListings={showListings}
      showJams={showJams||active==='jams'} canCreateJam={canCreate}/>
  </>;
  return <SidebarLayout className={`reading ${styles.discovery}`} sidebarClassName={styles.sidebar}
    sidebarLabel="ZeroHub discovery" sidebar={sidebar} skipToPane>
    <div className={styles.catalog}>{children}</div>
  </SidebarLayout>;
}

export function HubWorkspace({children,showListings,showJams,jamRoutesAvailable}:{
  children:ReactNode;showListings:boolean;showJams:boolean;jamRoutesAvailable:boolean;
}) {
  const path=usePathname(), query=useSearchParams();
  const exact=path==='/hub'&&(query.has('id')||query.has('version'));
  const kind=query.get('kind')||(exact?'library':'game');
  const sharePage=path==='/hub/share';
  const requestedView=sharePage&&query.getAll('view').length>1?'':query.get('view')||'';
  const inJams=jamRoutesAvailable&&(path==='/hub/jams'||path.startsWith('/hub/jams/'));
  let active:HubSection=kind==='game'?'game':'library';
  if(inJams)active='jams';
  else if(sharePage)active=requestedView==='game'?'game':'library';
  else if(path==='/hub/listings')active='game';
  const view=path==='/hub'&&kind==='practice'?'practice':exact||requestedView==='practice'?'':requestedView;
  const searchParams=query.toString();
  const returnTo=searchParams?`${path}?${searchParams}`:path;
  return <LearnTheme active="ZeroHub" hubReturnTo={returnTo}>
    <JamDirectoryProvider enabled={active==='jams'}>
      <Workspace active={active} path={path} view={view}
        showListings={showListings} showJams={showJams}>{children}</Workspace>
    </JamDirectoryProvider>
  </LearnTheme>;
}
