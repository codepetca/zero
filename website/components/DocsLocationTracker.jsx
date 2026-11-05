'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { rememberLearningLocation } from '@/lib/docs-resume.mjs';

export default function DocsLocationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const remember = () => {
      try { rememberLearningLocation(window.localStorage, window.location); } catch { /* Access to storage itself may be denied. */ }
    };
    remember();
    window.addEventListener('hashchange', remember);
    window.addEventListener('popstate', remember);
    window.addEventListener('zero:docs-location', remember);
    return () => {window.removeEventListener('hashchange', remember);window.removeEventListener('popstate', remember);window.removeEventListener('zero:docs-location', remember);};
  }, [pathname]);
  return null;
}
