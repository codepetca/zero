import type {ReactNode} from 'react';
import {HubWorkspace} from '@/components/HubWorkspace';
import {listingsEnabled} from '@/lib/hub-listings-store.mjs';
import {jamsNavigationAvailable, jamsPreviewAvailable} from '@/lib/jams-visibility.mjs';
import '../../.generated/learn-theme.css';
import '../learn/learn.css';

export const dynamic = 'force-dynamic';

export default function HubLayout({children}:{children:ReactNode}) {
  return <HubWorkspace showListings={listingsEnabled()} showJams={jamsNavigationAvailable()} allowJams={jamsPreviewAvailable()}>{children}</HubWorkspace>;
}
