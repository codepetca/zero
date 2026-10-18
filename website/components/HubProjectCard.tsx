import type {ReactNode} from 'react';
import styles from '@/app/hub/hub.module.css';

type Props = {
  title: string; description: string; author: string; version?: string;
  repositoryHref: string; image?: string; playHref?: string; feedback?: ReactNode; children?: ReactNode;
};

export function HubProjectCard({title, description, author, version, repositoryHref, image, playHref, feedback, children}: Props) {
  return <article className={styles.card}>
    {playHref ? <a className={styles.playImage} href={playHref} target="_blank" rel="noopener noreferrer" aria-label={`Play ${title} (opens in a new tab)`}>
      {image ? <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" /> : <span className={styles.playPlaceholder} aria-hidden="true" />}
      <span className={styles.playOverlay} aria-hidden="true"><span>▶ Play</span></span>
    </a> : image && <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" />}
    <div className={styles.cardContent}>
      <h3>{title}</h3><p className={styles.description}>{description}</p>
      <p className={styles.metadata}><a href={version ? `https://github.com/${author}` : repositoryHref}>@{author}</a>{version && <> · <a href={repositoryHref} aria-label={`${title} v${version} on GitHub`}>v{version}</a></>}</p>
      {feedback}
      {children}
    </div>
  </article>;
}
