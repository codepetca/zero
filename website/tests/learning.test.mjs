import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { foldSections, resolveContentLink } from "../lib/markdown.mjs";

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
    "lesson-1": { source: "student-template/lessons/01-quiz.md" },
    api: { source: "student-template/API.md" },
  };
  const sources = {
    "student-template/examples/quiz/Main.java": "class Main {}",
  };
  assert.equal(
    resolveContentLink(
      "student-template/lessons/README.md",
      "01-quiz.md#try-it",
      documents,
      sources,
    ),
    "/tutorials/1#try-it",
  );
  assert.equal(
    resolveContentLink(
      "student-template/lessons/01-quiz.md",
      "../API.md#input-methods",
      documents,
      sources,
    ),
    "/docs/api#input-methods",
  );
  assert.equal(
    resolveContentLink(
      "student-template/lessons/01-quiz.md",
      "../examples/quiz/Main.java",
      documents,
      sources,
    ),
    "/source?file=student-template%2Fexamples%2Fquiz%2FMain.java",
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
