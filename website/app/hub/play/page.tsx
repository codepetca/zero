import {HubPlayLaunch} from '@/components/HubPlayLaunch';
import {parseProjectPlayRef} from '@/lib/hub-play-selector.mjs';

export const metadata = {title:'Play a project',referrer:'no-referrer' as const};
export const dynamic = 'force-dynamic';

export default async function Play({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query = await searchParams;
  const ref = typeof query.ref === 'string' && Object.keys(query).length === 1 && parseProjectPlayRef(query.ref)
    ? query.ref : null;
  return <HubPlayLaunch reference={ref}/>;
}
