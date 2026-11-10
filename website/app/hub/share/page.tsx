import {HubPrepare} from '@/components/HubPrepare';
import styles from '../hub.module.css';

export const metadata = {title:'Share on ZeroHub'};
export default function Share() {
  return <section className={styles.catalog} aria-labelledby="share-heading">
    <div className="intro"><h2 id="share-heading" className="page-subtitle">Share your work</h2><p className="lead">Use your own GitHub game repository for games and library folders.</p></div>
    <HubPrepare />
  </section>;
}
