import {notFound} from 'next/navigation';
import {JamShell} from '@/components/JamShell';
import {JamParticipate} from '@/components/JamClient';
import {jamPagesInstallLink} from '@/lib/jam-pages-install-link.mjs';

export const metadata={title:'Take part in a ZeroJam'};
export const dynamic = 'force-dynamic';

export default async function Participate({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/.test(id))notFound();return <JamShell><JamParticipate id={id} pagesInstallLink={jamPagesInstallLink('codepet-zero')}/></JamShell>;}
