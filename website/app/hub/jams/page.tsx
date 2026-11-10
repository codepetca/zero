import {LearnTheme} from '@/app/learn/LearnTheme';
import {JamDiscovery} from '@/components/JamClient';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import styles from '../hub.module.css';
import '../../../.generated/learn-theme.css';
import '../../learn/learn.css';
import '@/components/Jam.css';

export const metadata={title:'ZeroJams'};
export default function Jams(){
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className={`reading ${styles.discovery}`}>
    <JamDiscovery showListings={listingsEnabled()}/>
  </main></LearnTheme>;
}
