import {PageHeader} from '@/components/PageHeader';
import {HubPrepare} from '@/components/HubPrepare';
export const metadata = {title:'Share on ZeroHub'};
export default function Share() {
  return <><PageHeader active="ZeroHub"/><main id="page-content" tabIndex={-1} className="reading"><div className="intro"><h1>ZeroHub</h1><h2 className="page-subtitle">Share your work</h2><p className="lead">Use your own GitHub game repository for games and library folders.</p></div><HubPrepare/></main></>;
}
