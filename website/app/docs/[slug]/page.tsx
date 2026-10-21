import { notFound } from "next/navigation";
import { docs } from "@/lib/content";
import { isLessonDocumentId } from "@/lib/learning.mjs";
import { LegacyDocumentRedirect } from "@/components/LegacyDocumentRedirect";
import { documentDestination } from "@/lib/document-navigation.mjs";
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(docs)
    .filter((id) => !isLessonDocumentId(id))
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
  if (!Object.hasOwn(docs, slug) || isLessonDocumentId(slug)) notFound();
  const destination = documentDestination(slug);
  if (!destination) notFound();
  return <LegacyDocumentRedirect id={slug} destination={destination} />;
}
