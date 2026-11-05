'use client';

import { useEffect } from 'react';
import { DOCS_RESUME_DEFAULT, resumeLearningLocation } from '@/lib/docs-resume.mjs';

export default function ResumeDocs() {
  useEffect(() => {
    let destination = DOCS_RESUME_DEFAULT;
    try { destination = resumeLearningLocation(window.localStorage, window.location.origin); } catch { /* Storage may be disabled. */ }
    window.location.replace(destination);
  }, []);
  return <main id="page-content"><p>Opening your last learning page…</p><p><a href={DOCS_RESUME_DEFAULT}>Open the tutorial</a></p></main>;
}
