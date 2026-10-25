import {notFound} from 'next/navigation';
import {JamShell} from '@/components/JamShell';
import {JamDetail} from '@/components/JamClient';
export const metadata={title:'ZeroJam details'};
export default async function Jam({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^jam-[1-9][0-9]*$/.test(id))notFound();return <JamShell><JamDetail id={id}/></JamShell>;}
