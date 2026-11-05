import { createHash } from 'node:crypto';
import { DOCS_RESUME_DEFAULT, DOCS_RESUME_KEY, learningLocation, resumeInBrowser } from '../../lib/docs-resume.mjs';

// Run before the browser paints an intermediate page or loads a React bundle.
// The shared validator still restricts stored destinations to local learning pages.
const script = `(${resumeInBrowser.toString()})(${JSON.stringify(DOCS_RESUME_KEY)}, ${JSON.stringify(DOCS_RESUME_DEFAULT)}, (${learningLocation.toString()}));`;
const hash = createHash('sha256').update(script).digest('base64');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Zero Docs</title><script>${script}</script></head><body><noscript><main><h1>Zero Docs</h1><p>JavaScript is needed to reopen your last page.</p><a href="${DOCS_RESUME_DEFAULT}">Open the tutorials</a></main></noscript></body></html>`;

export function GET() {
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
