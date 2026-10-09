import { notFound } from "next/navigation";
import { lessons } from "@/lib/learning.mjs";
import { Document } from "@/components/Document";
export const dynamicParams = false;
export function generateStaticParams() {
  return lessons.map((item) => ({ lesson: item.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lesson: string }>;
}) {
  const { lesson } = await params;
  return {
    title: lessons.find((item) => item.id === lesson)?.title ?? "Tutorial",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ lesson: string }>;
}) {
  const { lesson } = await params;
  if (!lessons.some((item) => item.id === lesson)) notFound();
  return <Document id={`lesson-${lesson}`} lesson={lesson} />;
}
