import {notFound} from 'next/navigation';
import type {ReactNode} from 'react';
import {jamsPreviewAvailable} from '@/lib/jams-visibility.mjs';

export const dynamic = 'force-dynamic';
export default function JamsLayout({children}:{children:ReactNode}) {
  if (!jamsPreviewAvailable()) notFound();
  return children;
}
