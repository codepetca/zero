import type {ReactNode} from 'react';
import styles from '@/app/hub/hub.module.css';

type Props = {
  title: string; description: string; author: string; version?: string;
  sourceHref: string; image?: string; playHref?: string; children?: ReactNode;
};

export function HubProjectCard({title, description, author, version, sourceHref, image, playHref, children}: Props) {
  return <article className={styles.card}>
    {image && <img className={styles.thumbnail} src={image} alt={`${title} screenshot`} loading="lazy" />}
    <div className={styles.cardContent}>
      <h3>{title}</h3><p className={styles.description}>{description}</p>
      <p className={styles.metadata}><a href={`https://github.com/${author}`}>@{author}</a>{version && ` · v${version}`}</p>
      <div className={styles.actions}>
        {playHref && <a className="button primary compact" href={playHref} target="_blank" rel="noopener noreferrer">Play</a>}
        <a href={sourceHref}>GitHub<span className="sr-only"> source for {title}{version && ` v${version}`}</span></a>
      </div>
      {children}
    </div>
  </article>;
}
