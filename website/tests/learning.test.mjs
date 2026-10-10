import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lessons, lessonNavigation, isLessonDocumentId, lessonAssets } from "../lib/learning.mjs";
import { documentHref, foldSections, resolveContentLink } from "../lib/markdown.mjs";

test("folds parsed sections without splitting code, preserving unique deep-link ids", () => {
  const markdown =
    "# Guide\n\nIntroduction.\n\n## First\n\n```java\n## This is code\n```\n\n### Nested\n\nRead here.\n\n## First\n\nLast body.";
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[foldSections, { lesson: true }]],
      children: markdown,
    }),
  );
  assert.equal((html.match(/<details/g) || []).length, 2);
  assert.match(html, /<h2 id="first">First/);
  assert.match(html, /<h2 id="first-1">First/);
  assert.match(html, /<h3 id="nested">Nested/);
  assert.match(html, /<code class="language-java">## This is code/);
  assert.ok(html.indexOf("Introduction.") > html.indexOf("<summary>"));
  assert.doesNotMatch(html, /<details[^>]*open/);
});
test("relative links preserve fragments and route only maintained documents or allowlisted sources", () => {
  const documents = {
    "lesson-0": { source: "student-template/lessons/00-hello-world.md" },
    "lesson-3": { source: "student-template/lessons/03-quiz.md" },
    api: { source: "student-template/API.md" },
  };
  assert.equal(resolveContentLink("student-template/lessons/README.md", "00-hello-world.md", documents, {}), "/tutorials/0");
  const sources = {
    "student-template/examples/tiny-quiz/Main.java": "class Main {}",
  };
  assert.equal(
    resolveContentLink(
      "student-template/lessons/README.md",
      "03-quiz.md#try-it",
      documents,
      sources,
    ),
    "/tutorials/3#try-it",
  );
  assert.equal(
    resolveContentLink(
      "student-template/lessons/03-quiz.md",
      "../API.md#input-methods",
      documents,
      sources,
    ),
    "/docs/api#input-methods",
  );
  assert.equal(
    resolveContentLink(
      "student-template/lessons/03-quiz.md",
      "../examples/tiny-quiz/Main.java",
      documents,
      sources,
    ),
    "/source?file=student-template%2Fexamples%2Ftiny-quiz%2FMain.java",
  );
  assert.equal(
    resolveContentLink(
      "docs/README.md",
      "../../private.txt",
      documents,
      sources,
    ),
    null,
  );
  assert.equal(
    resolveContentLink(
      "docs/README.md",
      "https://example.com",
      documents,
      sources,
    ),
    "https://example.com",
  );
});

test("lesson navigation starts at zero and reaches the button, name then quiz without looping", () => {
  const first = lessonNavigation("0");
  assert.equal(first.related.title, "Hello, world!");
  assert.equal(first.previous, undefined);
  assert.equal(first.next.id, "1");
  assert.equal(first.next.title, "Say hello with a button");
  assert.equal(lessonNavigation("1").previous.id, "0");
  assert.equal(lessonNavigation("1").next.id, "2");
  assert.equal(lessonNavigation("2").related.title, "Greet by name");
  assert.equal(lessonNavigation("2").next.id, "3");
  assert.equal(lessonNavigation("3").related.title, "A tiny quiz");
  assert.equal(lessonNavigation("12").next, undefined);
  assert.deepEqual(lessonNavigation(""), {});
});

test("the curriculum ends at twelve and routes two-digit lessons without truncation", () => {
  assert.deepEqual(lessons.map((lesson) => lesson.id), Array.from({ length: 13 }, (_, id) => String(id)));
  assert.equal(lessonNavigation("9").next.id, "10");
  assert.equal(lessonNavigation("10").next.id, "11");
  assert.equal(lessonNavigation("11").previous.id, "10");
  assert.equal(lessonNavigation("11").next.id, "12");
  assert.deepEqual(lessonNavigation("13"), {});
  assert.equal(documentHref("lesson-10"), "/tutorials/10");
  assert.equal(documentHref("lesson-11"), "/tutorials/11");
  assert.equal(isLessonDocumentId("lesson-11"), true);
  assert.equal(isLessonDocumentId("lesson-12"), true);
  const documents = { "lesson-11": { source: "student-template/lessons/11-community.md" } };
  assert.equal(resolveContentLink("student-template/lessons/10-components.md", "11-community.md#share", documents, {}), "/tutorials/11#share");
});

test("lesson media links use only the explicit build-time asset mapping", () => {
  const source = "student-template/lessons/12-media.md";
  assert.equal(resolveContentLink(source, "../examples/media-demo/resources/media-demo/player.png", {}, {}, lessonAssets), "/generated/learning-assets/media-demo/player.png");
  assert.equal(resolveContentLink(source, "../examples/media-demo/resources/media-demo/chime.wav", {}, {}, lessonAssets), "/generated/learning-assets/media-demo/chime.wav");
  assert.equal(resolveContentLink(source, "../examples/media-demo/resources/media-demo/private.wav", {}, {}, lessonAssets), null);
});
