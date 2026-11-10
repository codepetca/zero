import {HubPrepare} from '@/components/HubPrepare';

export const metadata={title:'Share on ZeroHub'};

export default async function Share({searchParams}:{searchParams:Promise<{view?:string|string[]}>}) {
  const {view}=await searchParams;
  const selected=view==='game'||view==='library'||view==='requests'?view:undefined;
  return <><h1>{selected==='game'?'Share a game':selected==='library'?'Share a library':selected==='requests'?'Requests and results':'Share your work'}</h1>
    <HubPrepare view={selected}/>
  </>;
}
