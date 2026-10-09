import { notFound } from "next/navigation";
import { sources } from "@/lib/content";
import { PageHeader } from "@/components/PageHeader";
export const metadata = { title: "Readable source" };
export default async function Source({
  searchParams,
}: {
  searchParams: Promise<{ file?: string | string[] }>;
}) {
  const { file } = await searchParams;
  if (typeof file !== "string" || !Object.hasOwn(sources, file)) notFound();
  return (
    <>
      <PageHeader active="Examples" />
      <main id="page-content" tabIndex={-1} className="catalog source-page">
        <a className="back-link" href="/examples">
          ← Example apps
        </a>
        <p className="eyebrow">Readable source</p>
        <h1>{file.split("/").pop()}</h1>
        <p className="source-path">{file}</p>
        <p>
          This is a read-only view. Edit the copy in your local project, then
          Run App.
        </p>
        <pre>
          <code>{sources[file]}</code>
        </pre>
      </main>
    </>
  );
}
