import {LearnTheme} from '@/app/learn/LearnTheme';
import {HubPrepare} from '@/components/HubPrepare';
import '../../../.generated/learn-theme.css';
import '../../learn/learn.css';
export const metadata = {title:'Share on ZeroHub'};
export default function Share() {
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className="reading"><div className="intro"><h1>ZeroHub</h1><h2 className="page-subtitle">Share your work</h2><p className="lead">Use your own GitHub game repository for games and library folders.</p></div><HubPrepare/></main></LearnTheme>;
}
