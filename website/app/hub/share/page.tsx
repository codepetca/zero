import {redirect} from 'next/navigation';
import {HubPrepare} from '@/components/HubPrepare';

export const metadata={title:'Share on ZeroHub'};

export default async function Share({searchParams}:{searchParams:Promise<{view?:string|string[]}>}) {
  const {view}=await searchParams;
  // Games reach ZeroHub through Publish an app; keep old Share a game links working.
  if(view==='game')redirect('/hub?kind=game&view=publish');
  const selected=view==='library'||view==='requests'?view:undefined;
  return <><h1>{selected==='library'?'Share a library':selected==='requests'?'Requests and results':'Share your work'}</h1>
    <HubPrepare view={selected}/>
  </>;
}
