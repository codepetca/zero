import Link from 'next/link';
import {notFound} from 'next/navigation';
import {HubListings} from '@/components/HubListings';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';

export const metadata={title:'My Apps'};

export default async function ListingsPage({searchParams}:{searchParams:Promise<{view?:string|string[]}>}) {
  if(!listingsEnabled())notFound();
  const {view}=await searchParams;
  if(view==='help')return <>
    <h1>How app listings work</h1>
    <p>When you publish an eligible app through Zero, it can appear in ZeroHub. If your app slots are full, a new app replaces the first unprotected app in the queue.</p>
    <p>Choose <strong>Do not replace</strong> to protect one app. Choose <strong>Move to back</strong> to keep an app in the queue longer.</p>
    <p><strong>Remove from ZeroHub</strong> takes the app out of discovery. Its GitHub Pages link still works.</p>
    <p><Link href="/hub/listings">Manage apps</Link></p>
  </>;
  return <><h1>My Apps</h1><HubListings/></>;
}
