import Link from 'next/link';
import {PageHeader} from '@/components/PageHeader';
import {HubPrepare} from '@/components/HubPrepare';
export const metadata={title:'Make a ZeroHub library'};
export default function Prepare(){return <><PageHeader active="ZeroHub"/><main id="page-content" tabIndex={-1} className="reading"><Link className="back-link" href="/hub">← ZeroHub</Link><div className="intro"><p className="eyebrow">ZeroHub</p><h1>Make a library.</h1><p className="lead">Prepare a folder, edit Java in VS Code, then upload it for automatic checks.</p></div><HubPrepare/></main></>;}
