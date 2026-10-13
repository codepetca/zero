import Link from 'next/link';
import {PageHeader} from '@/components/PageHeader';
import {HubPrepare} from '@/components/HubPrepare';
export const metadata = {title:'Share on ZeroHub'};
export default function Share() {
  return <><PageHeader active="ZeroHub"/><main id="page-content" tabIndex={-1} className="reading"><Link className="back-link" href="/hub">← ZeroHub</Link><div className="intro"><p className="eyebrow">ZeroHub</p><h1>Share your work</h1><p className="lead">Use your own GitHub game repository for games and library folders.</p></div><HubPrepare/></main></>;
}
