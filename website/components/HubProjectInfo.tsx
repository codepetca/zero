'use client';
import {useId, type ReactNode} from 'react';
import {Icon} from './Icon';
import styles from '@/app/hub/hub.module.css';

export function HubProjectInfo({title, children}: {title:string; children:ReactNode}) {
  const id = useId(), heading = `${id}-heading`;
  return <>
    <h3 className={styles.imageTitle}><button type="button" popoverTarget={id} title={title}><span>{title}</span></button></h3>
    <div id={id} popover="auto" className={styles.projectInfo} aria-labelledby={heading}>
      <div className={styles.infoHeading}><h4 id={heading}>{title}</h4><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={`Close details for ${title}`}><Icon name="x" /></button></div>
      {children}
    </div>
  </>;
}
