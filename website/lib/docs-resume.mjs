export const DOCS_RESUME_KEY = 'zero.docs.lastVisited';
export const DOCS_RESUME_DEFAULT = '/tutorials/15';

// Store only local learning paths and fragments. Queries can contain sensitive data.
export function learningLocation(value, origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !(url.pathname === '/docs' || url.pathname.startsWith('/docs/') || url.pathname.startsWith('/tutorials/'))) return null;
    return url.pathname + url.hash;
  } catch {
    return null;
  }
}

export function rememberLearningLocation(storage, location) {
  const value = learningLocation(location.pathname + location.hash, location.origin);
  if (!value) return;
  try { storage.setItem(DOCS_RESUME_KEY, value); } catch { /* Storage may be disabled. */ }
}

export function resumeLearningLocation(storage, origin) {
  try { return learningLocation(storage.getItem(DOCS_RESUME_KEY), origin) || DOCS_RESUME_DEFAULT; }
  catch { return DOCS_RESUME_DEFAULT; }
}
