import Link from "next/link";
import { LearnTheme } from "@/app/learn/LearnTheme";
import "../.generated/learn-theme.css";
import "@/app/learn/learn.css";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docs, sources } from "@/lib/content";
import { lessons, lessonGroups, lessonNavigation, lessonAssets, projectForLesson, publishedTutorialTemplate, sampleGameAssets } from "@/lib/learning.mjs";
import {
  foldSections,
  resolveContentLink,
  documentHref,
  slugify,
} from "@/lib/markdown.mjs";
import { Icon } from "./Icon";
import { FoldingReader } from "./FoldingReader";
import { ReaderNavigation } from "./ReaderNavigation";
import { CodeBlock } from "./CodeBlock";
import { TutorialProject } from "./TutorialProject";
export function Document({ id, lesson = "" }) {
  const doc = docs[id];
  const title =
    doc.markdown.match(/^# (.+)$/m)?.[1].replace(/^\d+\. /, "") ||
    "Documentation";
  const { related, next } = lessonNavigation(lesson);
  const practiceProject = lesson ? projectForLesson(lesson) : null;
  const pageTitle = practiceProject
    ? practiceProject.title.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : lesson ? "Tutorials" : "Docs";
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
  const content = (
      <main
        id="page-content"
        tabIndex={-1}
        className={`reader-layout compact-reader${lesson ? " tutorial-reader" : ""}`}
      >
        <aside className="reader-navigation">
          <ReaderNavigation
            items={items}
            current={lesson || id}
            section={lesson ? "Tutorials" : "Docs"}
            groups={lesson ? lessonGroups : undefined}
          />
        </aside>
        <article className="reader-content">
          <h1>{pageTitle}</h1>
          <h2 className="page-subtitle" id={slugify(doc.markdown.match(/^# (.+)$/m)?.[1] || title)}>
            {lesson ? `Lesson ${lesson}: ${title}` : title}
          </h2>
          {practiceProject && (lesson === practiceProject.firstLesson || lesson === "10" || lesson === "12") && (
            <TutorialProject project={practiceProject} lesson={lesson}
              template={publishedTutorialTemplate(practiceProject.id)} assets={sampleGameAssets} />
          )}
          <FoldingReader key={id}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[foldSections, { lesson: !!lesson, encouragement: related?.encouragement }]]}
              components={{
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
                    <a href={target} download={Object.values(lessonAssets).includes(target) || target === sampleGameAssets.href ? target.split("/").at(-1) : undefined}>{children}</a>
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
          {related && related.doc !== "api" && (
            <section className="compact-related" aria-label="Related docs">
              <a href={`/docs/${related.doc}#${related.anchor}`}>
                Contribution guide
              </a>
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
                <a className="button" href="/hub">
                  Explore projects
                  <Icon name="arrow-right" />
                </a>
              )}
            </nav>
          )}
        </article>
      </main>
  );
  return <LearnTheme active={lesson ? "Tutorials" : "Docs"}>{content}</LearnTheme>;
}
