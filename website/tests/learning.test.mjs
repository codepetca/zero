import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lessonNavigation } from "../lib/learning.mjs";
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
    "lesson-0": { source: "student-template/lessons/00-hello-world.md" },
    "lesson-3": { source: "student-template/lessons/03-quiz.md" },
    api: { source: "student-template/API.md" },
  };
  assert.equal(resolveContentLink("student-template/lessons/README.md", "00-hello-world.md", documents, {}), "/tutorials/0");
  const sources = {
    "student-template/examples/quiz/Main.java": "class Main {}",
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
  assert.equal(lessonNavigation("3").related.title, "Change the quiz");
  assert.equal(lessonNavigation("8").next, undefined);
  assert.deepEqual(lessonNavigation(""), {});
});
