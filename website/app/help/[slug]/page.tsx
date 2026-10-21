import { notFound } from 'next/navigation';
import { Document } from '@/components/Document';
import { helpItems } from '@/lib/document-navigation.mjs';
export const dynamicParams = false;
export function generateStaticParams() { return helpItems.map(({ id }) => ({ slug: id })); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!helpItems.some(({ id }) => id === slug)) notFound();
  return <Document id={slug} />;
}
