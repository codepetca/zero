import {JamDiscovery} from '@/components/JamClient';
import {JamShell} from '@/components/JamShell';

export const metadata={title:'ZeroJams'};
export default function Jams(){return <JamShell><JamDiscovery/></JamShell>;}
