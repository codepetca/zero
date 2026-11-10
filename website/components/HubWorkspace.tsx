'use client';

import type {ReactNode} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import styles from '@/app/hub/hub.module.css';
import {HubNavigation,type HubSection} from './HubNavigation';
import {JamDirectoryProvider,useJamDirectory} from './JamClient';

function Workspace({active,path,view,showListings,showJams,children}:{
  active:HubSection;path:string;view:string;showListings:boolean;showJams:boolean;children:ReactNode;
}) {
  const {canCreate}=useJamDirectory();
  return <main className={`reading ${styles.discovery}`}>
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="ZeroHub discovery">
        <p className={styles.sidebarTitle}>ZeroHub</p>
        <p className={styles.tagline}>Play. Share. Learn.</p>
        <HubNavigation active={active} path={path} view={view} showListings={showListings}
          showJams={showJams||active==='jams'} canCreateJam={canCreate}/>
      </aside>
      <div id="page-content" tabIndex={-1} className={styles.catalog}>{children}</div>
    </div>
  </main>;
}

export function HubWorkspace({children,showListings,showJams,jamRoutesAvailable}:{
  children:ReactNode;showListings:boolean;showJams:boolean;jamRoutesAvailable:boolean;
}) {
  const path=usePathname(), query=useSearchParams();
  const exact=path==='/hub'&&(query.has('id')||query.has('version'));
  const kind=query.get('kind')||(exact?'library':'game');
  const inJams=jamRoutesAvailable&&(path==='/hub/jams'||path.startsWith('/hub/jams/'));
  let active:HubSection=kind==='game'?'game':'library';
  if(inJams)active='jams';
  else if(path==='/hub/share')active='share';
  else if(path==='/hub/listings')active='game';
  const requestedView=query.get('view')||'';
  const view=path==='/hub'&&kind==='practice'?'practice':exact||requestedView==='practice'?'':requestedView;
  return <JamDirectoryProvider enabled={active==='jams'}>
    <Workspace active={active} path={path} view={view}
      showListings={showListings} showJams={showJams}>{children}</Workspace>
  </JamDirectoryProvider>;
}
