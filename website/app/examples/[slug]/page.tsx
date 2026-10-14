import { notFound, redirect } from "next/navigation";
import { examples } from "@/lib/learning.mjs";
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
  redirect(`/hub?kind=example&example=${encodeURIComponent(example.id)}`);
}
