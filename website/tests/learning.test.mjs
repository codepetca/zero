import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lessons, lessonGroups, lessonNavigation, isLessonDocumentId, lessonAssets, examples, projectForLesson, sampleGameAssets } from "../lib/learning.mjs";
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
  assert.ok(html.indexOf("Introduction.") < html.indexOf("<details"));
  assert.equal((html.match(/<details[^>]*open/g) || []).length, 2);
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

test("tutorial navigation prose and rules are removed without changing instructions or code", () => {
  const markdown = "# Lesson\n\nPrevious: [Your study quiz](07-study-app.md).\n\n---\n\n## 2. Connect Player to your existing Main\n\nKeep your existing Main.\n\n---\n\n```text\nPrevious: keep this literal\n---\n```\n\nNext: [Coins](09-coin-game.md).";
  const render = (lesson) => renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [remarkGfm], rehypePlugins: [[foldSections, { lesson }]], children: markdown,
  }));
  const html = render(true);
  assert.doesNotMatch(html, /Your study quiz|href="09-coin-game.md"|<hr/);
  assert.match(html, /id="2-connect-player-to-your-existing-main"/);
  assert.match(html, /Keep your existing Main\./);
  assert.match(html, /<code class="language-text">Previous: keep this literal\n---\n<\/code>/);
  const guide = render(false);
  assert.match(guide, /Your study quiz/);
  assert.match(guide, /<hr/);
});

test("the course guide renders a clickable local starter link while remaining usable as GitHub Markdown", () => {
  const source = "docs/COURSE-PROJECT.md";
  const markdown = readFileSync(new URL("../../docs/COURSE-PROJECT.md", import.meta.url), "utf8");
  const html = renderToStaticMarkup(React.createElement(Markdown, {
    components: {a: ({href, children}) => {
      const target = resolveContentLink(source, href, {}, {});
      return target ? React.createElement("a", {href: target}, children) : React.createElement("span", {}, children);
    }}, children: markdown,
  }));
  assert.match(markdown, /\[minimal Zero starter\]\(https:\/\/zero\.codepet\.ca\/hub\?kind=example&example=zero-starter\)/);
  assert.match(html, /<a href="\/hub\?kind=example&amp;example=zero-starter">minimal Zero starter<\/a>/);
  assert.equal(resolveContentLink(source, "/hub?kind=example&example=zero-starter", {}, {}), "/hub?kind=example&example=zero-starter");
  assert.equal(resolveContentLink(source, "/hub?kind=example&example=private", {}, {}), null);
  assert.equal(resolveContentLink(source, "https://example.com/hub?kind=example&example=zero-starter", {}, {}), "https://example.com/hub?kind=example&example=zero-starter");
  for (const id of ["hello-app", "study", "coin-game-component", "drawing"]) {
    assert.match(html, new RegExp(`<a href="/hub\\?kind=example&amp;example=${id}">`));
  }
  assert.doesNotMatch(markdown, /https:\/\/github\.com\/codepetca\/zero-(?:starter|hello-java|study-session|coin-game|drawing-pad)(?:\/generate)?\)/);
  assert.match(markdown, /Use template\*\* when that action is available/);
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

test("quiet project groups retain every lesson once in reading order", () => {
  assert.deepEqual(lessonGroups.map(group => group.title), ["Greeting app", "Study quiz", "Coin game"]);
  assert.deepEqual(lessonGroups.flatMap(group => group.lessons), lessons.map(lesson => lesson.id));
  for (const group of lessonGroups) {
    for (const id of group.lessons) assert.equal(projectForLesson(id).id, group.id);
  }
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
  const documents = { "lesson-11": { source: "student-template/lessons/11-zerohub.md" } };
  assert.equal(resolveContentLink("student-template/lessons/10-components.md", "11-zerohub.md#share", documents, {}), "/tutorials/11#share");
});

test("lesson media links use only the explicit build-time asset mapping", () => {
  const source = "student-template/lessons/12-media.md";
  assert.equal(resolveContentLink(source, "../examples/media-demo/resources/media-demo/player.png", {}, {}, lessonAssets), "/generated/learning-assets/media-demo/player.png");
  assert.equal(resolveContentLink(source, "../examples/media-demo/resources/media-demo/chime.wav", {}, {}, lessonAssets), "/generated/learning-assets/media-demo/chime.wav");
  assert.equal(resolveContentLink(source, "../examples/media-demo/resources/media-demo/private.wav", {}, {}, lessonAssets), null);
});

test("every lesson has a Summary card and closes its final explanation with encouragement", () => {
  for (const lesson of lessons) {
    const name = String(lesson.id).padStart(2, "0");
    const folder = new URL("../../student-template/lessons/", import.meta.url);
    const file = readdirSync(folder).find((file) => file.startsWith(`${name}-`) && file.endsWith(".md"));
    const markdown = readFileSync(new URL(file, folder), "utf8");
    const html = renderToStaticMarkup(React.createElement(Markdown, {
      remarkPlugins: [remarkGfm], rehypePlugins: [[foldSections, { lesson: true, encouragement: lesson.encouragement }]], children: markdown,
    }));
    const image = html.indexOf(`<img src="visuals/${name}.svg"`);
    assert.match(html, /class="lesson-quick-path"/);
    assert.match(html, /aria-labelledby="lesson-summary-title"><h2 id="lesson-summary-title">Summary<\/h2>/);
    assert.ok(lesson.encouragement, `Lesson ${name} has a closing message`);
    assert.ok(html.endsWith(`<p class="lesson-encouragement">${lesson.encouragement}</p></div></details>`), `Lesson ${name} closes its final explanation with encouragement`);
    assert.equal((html.match(/class="lesson-encouragement"/g) || []).length, 1);
    const cardEnd = html.indexOf("</section>");
    assert.ok(html.indexOf("<ol>") < cardEnd && html.indexOf("Done:") < cardEnd, `Lesson ${name} actions and checkpoint belong in Summary`);
    assert.ok(image >= 0 && image < cardEnd, `Lesson ${name} illustration belongs inside the lesson card`);
    assert.doesNotMatch(html, /<p>Previous:\s/, `Lesson ${name} must omit previous navigation`);
    assert.ok(image >= 0 && image < html.indexOf("<details"), `Lesson ${name} target must be visible`);
    assert.ok(html.indexOf("<ol>") < html.indexOf("<details"), `Lesson ${name} actions must be visible`);
    assert.equal(resolveContentLink(`student-template/lessons/${file}`, `visuals/${name}.svg`, {}, {}, lessonAssets), `/generated/learning-assets/lessons/${name}.svg`);
    const svg = readFileSync(new URL(`visuals/${name}.svg`, folder), "utf8");
    assert.match(svg, /<title/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)="https?:\/\//);
  }
});

test("composed examples supply the same shared screens and every ordinary helper", () => {
  const shared = ["composition-shared/StartScreen.java", "composition-shared/Hud.java", "shared/ScoreDisplay.java"];
  for (const id of ["composed-study", "composed-game"]) {
    const example = examples.find((item) => item.id === id);
    const helpers = id === "composed-study" ? ["study/Question.java"] : ["coin-game/Player.java", "coin-game/Coin.java"];
    assert.deepEqual(example.files, [`${id}/Main.java`, ...helpers, ...shared]);
    for (const file of example.files) assert.ok(readFileSync(new URL(`../../student-template/examples/${file}`, import.meta.url), "utf8").length);
    const readme = readFileSync(new URL(`../../student-template/examples/${id}/README.md`, import.meta.url), "utf8");
    assert.equal(resolveContentLink("student-template/UI.md", `examples/${id}/README.md`, {}, { [`student-template/examples/${id}/README.md`]: readme }), `/hub?kind=example&example=${id}`);
  }
});

test("Lesson 12 stages expose every runnable helper and reuse canonical assets", () => {
  assert.equal(lessonNavigation("12").related.title, "Build a platformer");
  for (const id of ["scrolling-game", "platform-game", "level-game", "full-game"]) {
    const example = examples.find((item) => item.id === id);
    assert.equal(example.lesson, "12");
    const folder = new URL(`../../student-template/examples/${id}/`, import.meta.url);
    const actual = readdirSync(folder).filter((name) => name.endsWith(".java")).map((name) => `${id}/${name}`);
    assert.deepEqual([...example.files].sort(), [...actual, "shared/ScoreDisplay.java"].sort());
    for (const file of example.files) {
      assert.ok(readFileSync(new URL(`../../student-template/examples/${file}`, import.meta.url), "utf8").length);
    }
    assert.deepEqual(example.resources.map(({ destination }) => destination), [
      "src/main/resources/media-demo/player.png", "src/main/resources/media-demo/chime.wav",
    ]);
    for (const { file } of example.resources) assert.ok(lessonAssets[`student-template/examples/${file}`]);
  }
});

test("stage guides open the runnable example page and unknown guides stay unlinked", () => {
  const source = "student-template/lessons/12-media.md";
  for (const id of ["scrolling-game", "platform-game", "level-game", "full-game"]) {
    const key = `student-template/examples/${id}/README.md`;
    assert.equal(resolveContentLink(source, `../examples/${id}/README.md`, {}, { [key]: "# Copy files" }), `/hub?kind=example&example=${id}`);
    assert.equal(resolveContentLink(source, `../examples/${id}/README.md`, {}, {}), null);
  }
  assert.equal(resolveContentLink(source, "../examples/private/README.md", {}, {}), null);
});

test("legacy starter links retain hosted setup and Pika destinations after source remapping", () => {
  const documents = {starter:{source:"docs/GETTING-STARTED.md",aliases:{"student-template/README.md":{
    "first-setup":"one-time-setup", "your-repository-and-pika":"your-individual-workflow"
  }}}};
  assert.equal(resolveContentLink("student-template/lessons/README.md","../README.md#first-setup",documents,{}),"/docs/starter#one-time-setup");
  assert.equal(resolveContentLink("student-template/lessons/README.md","../README.md#your-repository-and-pika",documents,{}),"/docs/starter#your-individual-workflow");
  assert.equal(resolveContentLink("docs/PRODUCT.md","../student-template/README.md",documents,{}),"/docs/starter");
  assert.equal(resolveContentLink("docs/DEVELOPMENT.md","../student-template/README.md",documents,{}),"/docs/starter");
  assert.equal(resolveContentLink("docs/PRODUCT.md","../student-template/README.md#old-heading",documents,{}),"/docs/starter");
  const prepare = readFileSync(new URL("../scripts/prepare.mjs",import.meta.url),"utf8");
  assert.match(prepare,/docs\.starter\.aliases =/);
  assert.match(prepare,/"first-setup": "one-time-setup"/);
  assert.match(prepare,/"your-repository-and-pika": "your-individual-workflow"/);
});

test("only three lessons start a project, without generic setup or continuation cards", () => {
  const document = readFileSync(new URL("../components/Document.jsx", import.meta.url), "utf8");
  const prepare = readFileSync(new URL("../scripts/prepare.mjs", import.meta.url), "utf8");
  assert.match(document, /lesson === practiceProject.firstLesson/);
  assert.doesNotMatch(document, /First time\?|If you have not started it yet|className="lesson-help"|className="reader-subtitle"/);
  assert.match(document, /lesson === "10"/);
  assert.match(document, /lesson === "12"/);
  assert.match(prepare, /prepareLessonProjects\(root, \{ website: true, extension: false \}\)/);
  assert.match(prepare, /collect\("teaching\/checkpoints"\)/);
  assert.deepEqual(lessons.filter(({id})=>projectForLesson(id)?.firstLesson===id).map(({id})=>id),["0","3","8"]);
  for (const lesson of lessons) assert.ok(projectForLesson(lesson.id));
  for (const id of ["greeting","study","game"]) {
    const url = `/generated/projects/zero-project-${id}.zip`;
    assert.equal(resolveContentLink("student-template/lessons/README.md",url,{},{}),url);
    assert.equal(resolveContentLink("student-template/lessons/README.md",`https://zero.codepet.ca${url}`,{},{}),url);
  }
  assert.equal(resolveContentLink("student-template/lessons/README.md","/generated/projects/zero-project-other.zip",{},{}),null);
  assert.equal(resolveContentLink("student-template/lessons/README.md","/generated/lessons/zero-lesson-10-game.zip",{},{}),null);
  assert.equal(resolveContentLink("student-template/lessons/12-media.md",sampleGameAssets.href,{},{}),sampleGameAssets.href);
});

test("practice downloads contain foundations but no completed lesson examples", async () => {
  const {lessonProjects} = await import("../../scripts/lesson-projects.mjs");
  const bundle = lessonProjects();
  assert.deepEqual(bundle.projects.map(({id})=>id),["greeting","study","game"]);
  for (const project of bundle.projects) {
    const paths = project.files.map(file=>file.path);
    assert.ok(paths.includes("src/main/java/Main.java"),project.id);
    assert.ok(paths.includes("zero.json"),project.id);
    assert.ok(paths.includes("README.md"),project.id);
    assert.ok(paths.every(path=>!path.startsWith("lessons/")&&!path.startsWith("examples/")&&!path.includes("checkpoints/")),project.id);
    const java = paths.filter(path=>path.endsWith(".java"));
    assert.ok(java.every(path=>path==="src/main/java/Main.java" || /^src\/main\/java\/zero\/(?:App|GameApp)\.java$/.test(path)),project.id);
    const main = Buffer.from(project.files.find(file=>file.path==="src/main/java/Main.java").content,"base64").toString("utf8");
    assert.doesNotMatch(main,/class (?:Question|Counter|Coin|Player|ScoreDisplay)/);
  }
});
