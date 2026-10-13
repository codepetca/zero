import Link from "next/link";
import { LearnTheme } from "@/app/learn/LearnTheme";
import "../.generated/learn-theme.css";
import "@/app/learn/learn.css";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docs, sources } from "@/lib/content";
import { lessons, lessonNavigation, lessonAssets, projectForLesson, sampleGameAssets } from "@/lib/learning.mjs";
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
  const { related, next } = lessonNavigation(lesson);
  const practiceProject = lesson ? projectForLesson(lesson) : null;
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
  const header = <PageHeader active={lesson ? "Tutorials" : "Docs"} />;
  const content = (
      <main
        id="page-content"
        tabIndex={-1}
        className="reader-layout compact-reader"
      >
        <aside className="reader-navigation">
          <ReaderNavigation
            items={items}
            current={lesson || id}
            lesson={!!lesson}
          />
        </aside>
        <article className="reader-content">
          <h1>{lesson ? "Tutorials" : "Docs"}</h1>
          <h2 className="page-subtitle" id={slugify(doc.markdown.match(/^# (.+)$/m)?.[1] || title)}>
            {lesson ? `Lesson ${lesson}: ${title}` : title}
          </h2>
          {related && <p className="reader-subtitle">{related.description}</p>}
          {practiceProject && (
            <section className="lesson-start" aria-label={`${practiceProject.title} project`}>
              {lesson === practiceProject.firstLesson ? (
                <>
                  <a className="button" href={`/generated/projects/zero-project-${practiceProject.id}.zip`} download={`zero-project-${practiceProject.id}.zip`}>
                    Start {practiceProject.title} project
                  </a>
                  <p>This small download contains setup and an empty Main. Unzip it, open the folder in VS Code and write the code below. Click <strong>Zero → Run App</strong> to try it, then keep this same local project for later lessons.</p>
                </>
              ) : (
                <>
                  <p>Continue your {practiceProject.title} project from the earlier lesson. Open its folder in VS Code, make the next change and click <strong>Zero → Run App</strong>.</p>
                  <p>If you have not started it yet, <a href={`/tutorials/${practiceProject.firstLesson}`}>start at lesson {practiceProject.firstLesson}</a>.</p>
                </>
              )}
              {lesson === "10" && <p>Reopen your Study quiz and Coin game projects to try the same component in both.</p>}
              {lesson === "12" && <p>For optional artwork and sound in your own game, <a href={sampleGameAssets.href} download={sampleGameAssets.filename}>download sample game assets</a>. This ZIP contains only media files.</p>}
            </section>
          )}
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
                    <a href={target} download={Object.values(lessonAssets).includes(target) || target.startsWith("/generated/projects/") || target === sampleGameAssets.href ? target.split("/").at(-1) : undefined}>{children}</a>
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
              aria-label="Next lesson"
            >
              {next ? (
                <Link className="button" href={`/tutorials/${next.id}`}>
                  Next: {next.title}
                  <Icon name="arrow-right" />
                </Link>
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
  );
  return lesson ? (
    <LearnTheme active="Tutorials">{content}</LearnTheme>
  ) : <>{header}{content}</>;
}
