import {notFound,redirect} from 'next/navigation';
import {HubListings} from '@/components/HubListings';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';

export const metadata={title:'My Projects'};

export default async function ListingsPage({searchParams}:{searchParams:Promise<{view?:string|string[]}>}) {
  if(!listingsEnabled())notFound();
  const {view}=await searchParams;
  if(view==='help')redirect('/hub?kind=game&view=publish#app-listings');
  return <><h1>My Projects</h1><HubListings/></>;
}
