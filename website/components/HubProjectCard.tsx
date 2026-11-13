'use client';
import {type ReactNode, useState} from 'react';
import {HubProjectInfo} from './HubProjectInfo';
import {Icon} from './Icon';
import {recordPlayOpen} from '@/lib/hub-metrics-client.mjs';
import {projectPattern, projectPatternSeed} from '@/lib/project-pattern.mjs';
import styles from '@/app/hub/hub.module.css';

type Props = {
  projectId?: string; title: string; description: string; author: string; version?: string;
  repositoryHref: string; image?: string; playHref?: string; compact?: boolean; siteReachable?: boolean;
  feedback?: (identity?: ReactNode, description?: string, placement?: 'details') => ReactNode; children?: ReactNode;
};

// Default card art for projects without a valid image.
export function ProjectPattern({seed}: {seed: string}) {
  const {size, cells, foreground, background} = projectPattern(seed);
  return <svg className={styles.pattern} viewBox={`-1 -1 ${size + 2} ${size + 2}`} aria-hidden="true" focusable="false"
    shapeRendering="crispEdges" style={{background}} data-pattern-seed={seed}>
    {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={foreground} />)}
  </svg>;
}

export function HubProjectCard({projectId, title, description, author, version, repositoryHref, image, playHref, compact, siteReachable, feedback, children}: Props) {
  const [failedImage, setFailedImage] = useState<string>();
  const pattern = <ProjectPattern seed={projectPatternSeed(author, repositoryHref.split('/').filter(Boolean).at(-1) || title)} />;
  const recordOpen = (event: {button: number}) => { if (projectId && (event.button === 0 || event.button === 1)) recordPlayOpen(projectId); };
  const identity = <p className={styles.metadata}><a href={version ? `https://github.com/${author}` : repositoryHref}>@{author}</a>{version && <> · <a href={repositoryHref} aria-label={`${title} v${version} on GitHub`}>v{version}</a></>}</p>;
  const preview = <>
    {image && failedImage !== image ? <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" onError={() => setFailedImage(image)}
      // An image can fail before hydration attaches onError.
      ref={node => { if (node?.complete && !node.naturalWidth) setFailedImage(image); }} /> : pattern}
    {playHref && <span className={styles.playOverlay} aria-hidden="true"><span><Icon name="play" className={styles.playIcon} /></span></span>}
  </>;
  if (compact) return <article className={styles.projectCard} data-hub-project-id={projectId}>
    {playHref ? <a className={styles.playImage} data-muted={!siteReachable || undefined} href={playHref} onClick={recordOpen} onAuxClick={event=>{if(event.button===1)recordOpen(event);}} target="_blank" rel="noopener noreferrer" aria-label={`Play ${title} (opens in a new tab)`}>
      {preview}
    </a> : <div className={styles.playImage} data-muted>{preview}</div>}
    <div className={styles.projectHeading}>
      <h3 className={styles.imageTitle}><span title={title}>{title}</span></h3>
      {feedback ? feedback(identity, description, 'details') : <HubProjectInfo title={title} available={!!siteReachable}><p>{description}</p>{identity}</HubProjectInfo>}
    </div>
    <div className={styles.cardFooter}>
      {children}
      {feedback?.()}
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
