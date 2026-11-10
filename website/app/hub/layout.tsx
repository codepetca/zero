import {Suspense,type ReactNode} from 'react';
import {LearnTheme} from '@/app/learn/LearnTheme';
import {HubWorkspace} from '@/components/HubWorkspace';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import {jamsNavigationAvailable,jamsPreviewAvailable} from '@/lib/jams-visibility.mjs';
import '../../.generated/learn-theme.css';
import '../learn/learn.css';

export const dynamic = 'force-dynamic';

export default function HubLayout({children}:{children:ReactNode}) {
  return <LearnTheme active="ZeroHub"><Suspense fallback={<p role="status">Loading ZeroHub…</p>}>
    <HubWorkspace showListings={listingsEnabled()} showJams={jamsNavigationAvailable()}
      jamRoutesAvailable={jamsPreviewAvailable()}>{children}</HubWorkspace>
  </Suspense></LearnTheme>;
}
