import Link from 'next/link';
import {JamShell} from '@/components/JamShell';

export const metadata={title:'How ZeroJams works'};

export default function JamRules() {
  return <JamShell><h1>How ZeroJams works</h1>
    <h2>Taking part</h2><p>Joining is free. Sign in with GitHub. For new Zero-hosted jams, link your own public repository and submit its published GitHub Pages URL before the deadline; a configured custom domain also works. Older jams may require an exact source commit instead.</p>
    <h2>Creating a jam</h2><p>A Pro license lets you create a jam for up to 100 distinct GitHub accounts. Accounts still count after leaving. Licenses are enabled manually; <a href="mailto:info@codepet.ca">contact Codepet</a> to request access. There is no online checkout yet.</p>
    <h2>Approval and timing</h2><p>New Pro jams are automatically approved. You can have one active jam at a time, until its gallery opens. A suspended jam still counts; cancelling it frees the slot. Maintainers can moderate jams.</p>
    <h2>Game Jam winners</h2><p>After submissions close, the host can choose a winner from the submitted games and change their choice later. The winner appears when the gallery opens. A published app on ZeroHub also shows a Game Jam winner badge linked to the jam.</p>
    <p><Link href="/hub/jams">Back to ZeroJams</Link></p>
  </JamShell>;
}
