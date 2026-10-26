import { notFound } from "next/navigation";
import { sources } from "@/lib/content";
import { PageHeader } from "@/components/PageHeader";
import { CodeBlock } from "@/components/CodeBlock";
import { LegalFooter } from "@/components/LegalFooter";
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
      <PageHeader active="Docs" />
      <main id="page-content" tabIndex={-1} className="catalog source-page">
        <h1>Docs</h1>
        <h2 className="page-subtitle">{file.split("/").pop()}</h2>
        <p className="source-path">{file}</p>
        <p>
          This is a read-only view. Edit the copy in your local project, then
          Run App.
        </p>
        <CodeBlock key={file}>
          <code>{sources[file]}</code>
        </CodeBlock>
      </main>
      <LegalFooter />
    </>
  );
}
