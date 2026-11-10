import {JamShell} from '@/components/JamShell';
import {JamCreationPane} from '@/components/JamClient';

export const metadata={title:'Create a ZeroJam'};
export default function CreateJam(){return <JamShell><JamCreationPane/></JamShell>;}
