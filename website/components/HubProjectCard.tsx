import type {ReactNode} from 'react';
import styles from '@/app/hub/hub.module.css';

type Props = {
  title: string; description: string; author: string; version?: string;
  repositoryHref: string; image?: string; playHref?: string; children?: ReactNode;
};

export function HubProjectCard({title, description, author, version, repositoryHref, image, playHref, children}: Props) {
  return <article className={styles.card}>
    {image && <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" />}
    <div className={styles.cardContent}>
      <h3>{title}</h3><p className={styles.description}>{description}</p>
      <p className={styles.metadata}><a href={version ? `https://github.com/${author}` : repositoryHref}>@{author}</a>{version && <> · <a href={repositoryHref} aria-label={`${title} v${version} on GitHub`}>v{version}</a></>}</p>
      {playHref && <div className={styles.actions}>
        <a className="button primary compact" href={playHref} target="_blank" rel="noopener noreferrer">Play</a>
      </div>}
      {children}
    </div>
  </article>;
}
