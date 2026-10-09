import { notFound } from "next/navigation";
import { examples } from "@/lib/learning.mjs";
import { sources } from "@/lib/content";
import { Example } from "@/components/Example";
export const dynamicParams = false;
export function generateStaticParams() {
  return examples.map((e) => ({ slug: e.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: examples.find((e) => e.id === slug)?.title ?? "Example" };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const example = examples.find((e) => e.id === slug);
  if (!example) notFound();
  const selected = Object.fromEntries(
    [...example.files, ...(example.resources || []).map((resource) => resource.file)].map((file) => {
      const key = `student-template/examples/${file}`;
      return [key, sources[key]];
    }),
  );
  return <Example example={example} sources={selected} />;
}
