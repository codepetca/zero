import {notFound} from 'next/navigation';
import {JamShell} from '@/components/JamShell';
import {JamParticipate} from '@/components/JamClient';
export const metadata={title:'Take part in a ZeroJam'};
export default async function Participate({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^jam-[1-9][0-9]*$/.test(id))notFound();return <JamShell><JamParticipate id={id}/></JamShell>;}
