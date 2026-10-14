import { LearnTheme } from '@/app/learn/LearnTheme';
import '../.generated/learn-theme.css';
import '@/app/learn/learn.css';
import { ApiReference } from './ApiReference';
import { docs, sources } from '@/lib/content';
import { buildApiReference } from '@/lib/api-reference.mjs';
import { resolveContentLink } from '@/lib/markdown.mjs';
export function ApiDocs() {
  const links = Object.fromEntries([...docs.api.markdown.matchAll(/\]\(([^)]+)\)/g)].map(match =>
    [match[1], resolveContentLink(docs.api.source, match[1], docs, sources)]));
  return <div className="api-page"><LearnTheme active="Docs"><ApiReference categories={buildApiReference(docs.api.markdown)} links={links} /></LearnTheme></div>;
}
