'use client';
import {useId, type ReactNode} from 'react';
import {Icon} from './Icon';
import styles from '@/app/hub/hub.module.css';

export function HubProjectInfo({title, available, children}: {title:string; available:boolean; children:ReactNode}) {
  const id = useId(), heading = `${id}-heading`;
  return <>
    <button type="button" className={styles.infoButton} data-available={available} popoverTarget={id}
      aria-label={`Details for ${title}, ${available ? 'site available' : 'availability not confirmed'}`} title="Project details"><Icon name="info" /></button>
    <div id={id} popover="auto" className={styles.projectInfo} aria-labelledby={heading}>
      <div className={styles.infoHeading}><h4 id={heading}>{title}</h4><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={`Close details for ${title}`}><Icon name="x" /></button></div>
      {children}
    </div>
  </>;
}
