'use client';

import { useEffect } from 'react';
import { legacyDocumentDestination } from '@/lib/document-navigation.mjs';

export function LegacyDocumentRedirect({ id, destination }: { id: string; destination: string }) {
  useEffect(() => {
    // URL fragments never reach the server. Resolve old chapter bookmarks here.
    window.location.replace(legacyDocumentDestination(id, window.location.hash) ?? destination);
  }, [id, destination]);
  return <main id="page-content" tabIndex={-1} className="reading">
    <h1>This page has moved</h1>
    <p><a href={destination}>Continue to the updated page</a>.</p>
  </main>;
}
