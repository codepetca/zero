import { notFound } from "next/navigation";
import { docs } from "@/lib/content";
import { Document } from "@/components/Document";
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(docs)
    .filter((id) => !/^lesson-[1-6]$/.test(id))
    .map((slug) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: docs[slug]?.markdown.match(/^# (.+)$/m)?.[1] ?? "Documentation",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!Object.hasOwn(docs, slug) || /^lesson-[1-6]$/.test(slug)) notFound();
  return <Document id={slug} />;
}
