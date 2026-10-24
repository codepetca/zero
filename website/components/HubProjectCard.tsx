'use client';
import {type ReactNode} from 'react';
import {HubProjectInfo} from './HubProjectInfo';
import {recordPlayOpen} from '@/lib/hub-metrics-client.mjs';
import styles from '@/app/hub/hub.module.css';

type Props = {
  projectId?: string; title: string; description: string; author: string; version?: string;
  repositoryHref: string; image?: string; playHref?: string; compact?: boolean; siteReachable?: boolean;
  feedback?: (identity?: ReactNode, description?: string) => ReactNode; children?: ReactNode;
};

export function HubProjectCard({projectId, title, description, author, version, repositoryHref, image, playHref, compact, siteReachable, feedback, children}: Props) {
  const recordOpen = (event: {button: number}) => { if (projectId && (event.button === 0 || event.button === 1)) recordPlayOpen(projectId); };
  const identity = <p className={styles.metadata}><a href={version ? `https://github.com/${author}` : repositoryHref}>@{author}</a>{version && <> · <a href={repositoryHref} aria-label={`${title} v${version} on GitHub`}>v{version}</a></>}</p>;
  const preview = <>
    {image ? <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" /> : <span className={styles.playPlaceholder} aria-hidden="true" />}
    {playHref && <span className={styles.playOverlay} aria-hidden="true"><span>▶ Play</span></span>}
  </>;
  if (compact) return <article className={styles.projectCard} data-hub-project-id={projectId}>
    {playHref ? <a className={styles.playImage} data-muted={!siteReachable || undefined} href={playHref} onClick={recordOpen} onAuxClick={event=>{if(event.button===1)recordOpen(event);}} target="_blank" rel="noopener noreferrer" aria-label={`Play ${title} (opens in a new tab)`}>
      {preview}
    </a> : <div className={styles.playImage} data-muted>{preview}</div>}
    <h3 className={styles.imageTitle}><span title={title}>{title}</span></h3>
    <div className={styles.cardFooter}>
      {children}
      {feedback ? feedback(identity, description) : <div className={styles.projectActions}><HubProjectInfo title={title} available={!!siteReachable}><p>{description}</p>{identity}</HubProjectInfo></div>}
    </div>
  </article>;
  return <article className={styles.card} data-hub-project-id={projectId}>
    {playHref ? <a className={styles.playImage} href={playHref} onClick={recordOpen} onAuxClick={event=>{if(event.button===1)recordOpen(event);}} target="_blank" rel="noopener noreferrer" aria-label={`Play ${title} (opens in a new tab)`}>{preview}</a> : image && <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" />}
    <div className={styles.cardContent}>
      <h3>{title}</h3><p className={styles.description}>{description}</p>
      {identity}{feedback?.()}
      {children}
    </div>
  </article>;
}
