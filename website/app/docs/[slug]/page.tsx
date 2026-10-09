import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isValidElement, type ReactNode } from 'react';
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
  const headingCounts = new Map<string, number>();
  function textOf(node: ReactNode): string {
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
    return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  }
  function headingId(children: ReactNode) {
    const slug = textOf(children).toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const count = headingCounts.get(slug) ?? 0;
    headingCounts.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  }
  return <><PageHeader /><main className="reading document"><p><Link href="/learn">← Learn about Zero</Link></p><p className="doc-source">Maintained source: <code>{doc.source}</code></p><Markdown remarkPlugins={[remarkGfm]} components={{
    h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
    h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
    h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
    h4: ({ children }) => <h4 id={headingId(children)}>{children}</h4>,
    h5: ({ children }) => <h5 id={headingId(children)}>{children}</h5>,
    h6: ({ children }) => <h6 id={headingId(children)}>{children}</h6>,
    a: ({ href, children }) => {
    if (href?.startsWith('https://')) return <a href={href}>{children}</a>;
    if (href?.startsWith('#')) return <a href={href}>{children}</a>;
    const hashIndex = href?.indexOf('#') ?? -1;
    const relative = hashIndex >= 0 ? href!.slice(0, hashIndex) : href ?? '';
    const fragment = hashIndex >= 0 ? href!.slice(hashIndex) : '';
    const source = path.posix.normalize(path.posix.join(path.posix.dirname(doc.source), relative));
    const target = Object.entries(docs).find(([, value]) => value.source === source);
    if (target) return <Link href={`/docs/${target[0]}${fragment}`}>{children}</Link>;
    // Source examples and maintainer records outside this reading set are in the kit/repo;
    // do not invent a public link for files that may still be unpublished.
    return <span className="unlinked-source" title={`See ${source} in the downloaded source`}>{children}</span>;
  } }}>{doc.markdown}</Markdown></main></>;
}
