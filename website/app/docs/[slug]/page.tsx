import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import path from 'node:path';
import { docs } from '@/lib/content';
import { PageHeader } from '@/components/PageHeader';
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(docs).map(slug => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: docs[slug]?.markdown.match(/^# (.+)$/m)?.[1] ?? 'Documentation' };
}
export default async function Document({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!Object.hasOwn(docs, slug)) notFound();
  const doc = docs[slug];
  return <><PageHeader /><main className="reading document"><p><Link href="/learn">← Learn about Zero</Link></p><p className="doc-source">Maintained source: <code>{doc.source}</code></p><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => {
    if (href?.startsWith('https://')) return <a href={href}>{children}</a>;
    const [relative] = (href ?? '').split('#');
    const source = path.posix.normalize(path.posix.join(path.posix.dirname(doc.source), relative));
    const target = Object.entries(docs).find(([, value]) => value.source === source);
    if (target) return <Link href={`/docs/${target[0]}`}>{children}</Link>;
    // Source examples and maintainer records outside this reading set are in the kit/repo;
    // do not invent a public link for files that may still be unpublished.
    return <span className="unlinked-source" title={`See ${source} in the downloaded source`}>{children}</span>;
  } }}>{doc.markdown}</Markdown></main></>;
}
