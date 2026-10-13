import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docs, sources } from "@/lib/content";
import { lessons, lessonNavigation, lessonAssets } from "@/lib/learning.mjs";
import {
  foldSections,
  resolveContentLink,
  documentHref,
  slugify,
} from "@/lib/markdown.mjs";
import { PageHeader } from "./PageHeader";
import { Icon } from "./Icon";
import { FoldingReader } from "./FoldingReader";
import { ReaderNavigation } from "./ReaderNavigation";
export function Document({ id, lesson = "" }) {
  const doc = docs[id];
  const title =
    doc.markdown.match(/^# (.+)$/m)?.[1].replace(/^\d+\. /, "") ||
    "Documentation";
  const { related, previous, next } = lessonNavigation(lesson);
  const items = lesson
    ? lessons.map((item) => ({
        id: item.id,
        title: `${item.id}. ${item.title}`,
        href: `/tutorials/${item.id}`,
      }))
    : Object.entries(docs)
        .filter(([key]) => !key.startsWith("lesson-") || key === "lesson-guide")
        .map(([id, doc]) => ({
          id,
          title: doc.markdown.match(/^# (.+)$/m)?.[1] || id,
          href: documentHref(id),
        }));
  return (
    <>
      <PageHeader active={lesson ? "Tutorials" : "Docs"} />
      <main
        id="page-content"
        tabIndex={-1}
        className="reader-layout compact-reader"
      >
        <aside className="reader-navigation">
          <a className="back-link" href={lesson ? "/learn" : "/docs"}>
            <Icon name="arrow-left" />
            {lesson ? "All tutorials" : "All docs"}
          </a>
          <ReaderNavigation
            items={items}
            current={lesson || id}
            lesson={!!lesson}
          />
        </aside>
        <article className="reader-content">
          <p className="eyebrow">
            {lesson ? `Tutorials / Lesson ${lesson}` : "Documentation"}
          </p>
          <h1 id={slugify(doc.markdown.match(/^# (.+)$/m)?.[1] || title)}>
            {title}
          </h1>
          {related && <p className="reader-subtitle">{related.description}</p>}
          <FoldingReader key={id}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[foldSections, { lesson: !!lesson }]]}
              components={{
                img: ({ src, alt }) => {
                  const target = resolveContentLink(doc.source, src, {}, {}, lessonAssets);
                  return target && Object.values(lessonAssets).includes(target) ? (
                    <img className="lesson-visual" src={target} alt={alt || "Lesson target illustration"} />
                  ) : <span className="source-note">{alt}</span>;
                },
                summary: ({ children }) => (
                  <summary>
                    {children}
                    <Icon name="chevron-down" />
                  </summary>
                ),
                a: ({ href, children }) => {
                  const target = resolveContentLink(
                    doc.source,
                    href,
                    docs,
                    sources,
                    lessonAssets,
                  );
                  return target ? (
                    <a href={target} download={Object.values(lessonAssets).includes(target) ? target.split("/").at(-1) : undefined}>{children}</a>
                  ) : (
                    <span
                      className="source-note"
                      title="See this file in the downloaded source"
                    >
                      {children}
                    </span>
                  );
                },
              }}
            >
              {doc.markdown}
            </Markdown>
          </FoldingReader>
          {related && (
            <section className="compact-related" aria-label="Related docs">
              <a href={`/docs/${related.doc}#${related.anchor}`}>
                {related.doc === "api"
                  ? "Java API reference"
                  : "Contribution guide"}
              </a>
              <a href="/examples">Example apps</a>
            </section>
          )}
          {lesson && (
            <nav
              className="lesson-pagination"
              aria-label="Next and previous lessons"
            >
              {previous ? (
                <a href={`/tutorials/${previous.id}`}>
                  <Icon name="arrow-left" />
                  {previous.title}
                </a>
              ) : (
                <a href="/learn">
                  <Icon name="arrow-left" />
                  All tutorials
                </a>
              )}
              {next ? (
                <a className="button" href={`/tutorials/${next.id}`}>
                  Next: {next.title}
                  <Icon name="arrow-right" />
                </a>
              ) : (
                <a className="button" href="/examples">
                  Explore the examples
                  <Icon name="arrow-right" />
                </a>
              )}
            </nav>
          )}
        </article>
      </main>
    </>
  );
}
