import test from "node:test";
import core from "../../extension/src/core-contract.js";
import { tutorialTemplateDefinitions } from "../../teaching/projects.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lessons, lessonGroups, lessonNavigation, lessonNumber, isLessonDocumentId, lessonAssets, examples, projectForLesson, publishedTutorialTemplate, sampleGameAssets } from "../lib/learning.mjs";
import { documentHref, foldSections, resolveContentLink } from "../lib/markdown.mjs";
import { tutorialAfterLines, tutorialAfterCopyText } from "../lib/tutorial-after-code.mjs";
import { orderGroupLessons } from "../lib/lesson-navigation.mjs";

test("copying contextual examples omits display markers and preserves indentation", () => {
  const lines = tutorialAfterLines("    void setup() {\n        // old\n        show(greeting);\n    }\n", "language-java-after-3-r2");
  assert.deepEqual(lines.map((line) => line.added), [false, false, true, false]);
  assert.deepEqual(lines.map((line) => line.removed), [false, true, false, false]);
  assert.equal(tutorialAfterCopyText(lines), "    void setup() {\n        show(greeting);\n    }\n");
});

test("tutorial change blocks mark real distinct lines and copy their finished code", () => {
  const folder = new URL("../../student-template/lessons/", import.meta.url);
  let blocks = 0;
  for (const name of readdirSync(folder).filter((entry) => entry.endsWith(".md"))) {
    const source = readFileSync(new URL(name, folder), "utf8");
    for (const match of source.matchAll(/```(java-after-([^\n]+))\n([\s\S]*?)```/g)) {
      blocks++;
      assert.match(match[2], /^\d+(?:-\d+)*(?:-r\d+(?:-\d+)*)?$/, name);
      const [added, removed = ""] = match[2].split("-r");
      const indices = [...added.split("-"), ...removed.split("-").filter(Boolean)].map(Number);
      const lineCount = match[3].replace(/\n$/, "").split("\n").length;
      assert.equal(new Set(indices).size, indices.length, name);
      assert.ok(indices.every((index) => index >= 1 && index <= lineCount), name);
      const lines = tutorialAfterLines(match[3], `language-${match[1]}`);
      assert.equal(tutorialAfterCopyText(lines), lines.filter((line) => !line.removed).map((line) => line.code).join("\n") + "\n", name);
    }
  }
  assert.ok(blocks > 0);
});

test("tutorial file directions use the Project Explorer labels", () => {
  const lesson = (name) => readFileSync(new URL(`../../student-template/lessons/${name}`, import.meta.url), "utf8");
  for (const name of ["00-hello-world.md", "08-movement.md", "09-coin-game.md", "13-pet.md", "14-own-project.md"]) {
    assert.doesNotMatch(lesson(name), /(?:Open|Create) `src\/main\/java\//, name);
  }
  assert.match(lesson("00-hello-world.md"), /java → Main\.java/);
  for (const name of ["12-media.md", "13-pet.md"]) {
    assert.match(lesson(name), /\*\*Import assets…\*\*/, name);
  }
  assert.match(lesson("11-zerohub.md"), /Tutorial practice: CreditsBadge → Checks/);
  assert.match(lesson("11-zerohub.md"), /Tutorial practice: CreditsBadge → Examples → first/);
});

test("folds parsed sections without splitting code, preserving unique deep-link ids", () => {
  const markdown =
    "# Guide\n\n## First\n\n```java\n## This is code\n```\n\n### Nested\n\nRead here.\n\n## First\n\nLast body.";
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[foldSections]],
      children: markdown,
    }),
  );
  assert.equal((html.match(/<details/g) || []).length, 2);
  assert.match(html, /<h2 id="first">First/);
  assert.match(html, /<h2 id="first-1">First/);
  assert.match(html, /<h3 id="nested">Nested/);
  assert.match(html, /<code class="language-java">## This is code/);
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
    "/docs#input-methods",
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

test("retired authored example links stay unlinked while external references remain usable", () => {
  const source = "docs/COURSE-PROJECT.md";
  for (const selector of ["kind=example", "kind=all", "example=drawing", "kind=game&example=drawing", "kind=game&kind=example", "kind=example&example=zero-starter"]) {
    for (const prefix of ["", "https://zero.codepet.ca"]) {
      assert.equal(resolveContentLink(source, `${prefix}/hub?${selector}`, {}, {}), null);
    }
  }
  assert.equal(resolveContentLink(source, "https://example.com/hub?kind=example&example=zero-starter", {}, {}), "https://example.com/hub?kind=example&example=zero-starter");
});

test("main lesson navigation follows Greeting, Coin and the continuing Pet project", () => {
  const first = lessonNavigation("0");
  assert.equal(first.related.title, "Hello, world!");
  assert.equal(first.previous.id, "15");
  assert.equal(lessonNavigation("15").next.id,"0");
  assert.equal(first.next.id, "1");
  assert.equal(first.next.title, "Say hello with a button");
  assert.equal(lessonNavigation("1").previous.id, "0");
  assert.equal(lessonNavigation("1").next.id, "2");
  assert.equal(lessonNavigation("2").related.title, "Greet by name");
  assert.equal(lessonNavigation("2").next.id, "8");
  assert.equal(lessonNavigation("8").previous.id, "2");
  assert.equal(lessonNavigation("9").next.id, "13");
  assert.equal(lessonNavigation("13").next.id, "16");
  assert.equal(lessonNavigation("16").next.id, "17");
  assert.equal(lessonNavigation("17").next.id, "14");
  assert.equal(lessonNavigation("14").next, undefined);
  assert.equal(lessonNavigation("3").related.title, "A tiny quiz");
  assert.equal(lessonNavigation("12").next.id, "18");
  assert.equal(lessonNavigation("18").next, undefined);
  assert.deepEqual(lessonNavigation(""), {});
});

test("quiet project groups retain every lesson once in reading order", () => {
  assert.deepEqual(lessonGroups.map(group => group.id), ['getting-started','greeting','game','pet','practice']);
  assert.deepEqual([...lessonGroups.flatMap(group => group.lessons)].sort(),lessons.filter(lesson => !['3','4','5','6','7'].includes(lesson.id)).map(lesson => lesson.id).sort());
  assert.ok(lessonGroups.every(group=>!group.title.includes('(optional)')));
  assert.equal(projectForLesson('10').id,'game');
  for (const id of ['13','16','17','14']) assert.equal(projectForLesson(id).id,'pet');
  const pet = lessonGroups.find(group => group.id === 'pet');
  assert.deepEqual(orderGroupLessons(lessons, pet.lessons).map(item => item.id), ['13','16','17','14']);
  const revisited = lessonGroups.find(group => group.id === 'practice');
  assert.equal(revisited.title, 'Coin game revisited');
  assert.deepEqual(revisited.lessons, ['10','11','12','18']);
});

test("existing lesson addresses remain stable and optional paths have their own ends", () => {
  assert.deepEqual(['15','0','1','2','8','9','13','16','17','14','10','11','12'].map(lessonNumber),[0,1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.equal(lessonNumber('3'),undefined,'Retained quiz routes are not part of the current sequence');
  assert.deepEqual(lessons.map((lesson) => lesson.id), ["15",...Array.from({ length: 15 }, (_, id) => String(id)),"16","17","18"]);
  assert.equal(lessonNavigation("10").next.id, "11");
  assert.equal(lessonNavigation("11").previous.id, "10");
  assert.equal(lessonNavigation("11").next.id,"12");
  assert.equal(lessonNavigation("3").previous,undefined);
  assert.equal(lessonNavigation("7").next,undefined);
  assert.equal(lessonNavigation("15").related.title, "Back to Zero");
  for(let id=0;id<18;id++)assert.equal(documentHref(`lesson-${id}`),`/tutorials/${id}`);
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

test("Coin game revisited reopens the project and leaves media as a student challenge", () => {
  const folder = new URL("../../student-template/lessons/", import.meta.url);
  const refactor = readFileSync(new URL("10-components.md", folder), "utf8");
  const challenge = readFileSync(new URL("12-media.md", folder), "utf8");
  assert.match(refactor, /Project → Open local project…/);
  assert.match(refactor, /Project → Clone/);
  assert.match(challenge, /game-assets\.zip/);
  assert.match(challenge, /13-pet\.md/);
  assert.match(challenge, /16-pet-motion\.md/);
  assert.doesNotMatch(challenge, /```java/);
});

test("every tutorial shows numbered instructions and exact code without a summary or explanation disclosure", () => {
  for (const lesson of lessons) {
    const name = String(lesson.id).padStart(2, "0");
    const folder = new URL("../../student-template/lessons/", import.meta.url);
    const file = readdirSync(folder).find((file) => file.startsWith(`${name}-`) && file.endsWith(".md"));
    const markdown = readFileSync(new URL(file, folder), "utf8");
    const html = renderToStaticMarkup(React.createElement(Markdown, {
      remarkPlugins: [remarkGfm], rehypePlugins: [[foldSections, { lesson: true, encouragement: lesson.encouragement }]], children: markdown,
    }));
    assert.doesNotMatch(html, /<details|<summary|Code and explanation|Done:|lesson-summary/);
    assert.match(html, /<h2 id="1-/);
    const image = ['16','17'].includes(name) ? '13' : name === '18' ? '09' : name;
    assert.ok(html.includes(`<img src="visuals/${image}.svg"`), `Lesson ${name} retains its illustration`);
    assert.ok(html.endsWith(`<p class="lesson-encouragement">${lesson.encouragement}</p>`));
    assert.equal((html.match(/class="lesson-encouragement"/g) || []).length, 1);
    assert.doesNotMatch(html, /<p>Previous:\s/);
    const steps = [...markdown.matchAll(/^## (\d+)\. /gm)].map(match=>Number(match[1]));
    assert.deepEqual(steps,steps.map((_,index)=>index+1));
    const unwrapped = renderToStaticMarkup(React.createElement(Markdown, {remarkPlugins:[remarkGfm],children:markdown}));
    assert.deepEqual([...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(m=>m[1]), [...unwrapped.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(m=>m[1]), `Lesson ${name} keeps all fenced code intact`);
    assert.equal(resolveContentLink(`student-template/lessons/${file}`, `visuals/${image}.svg`, {}, {}, lessonAssets), `/generated/learning-assets/lessons/${image}.svg`);
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
    assert.equal(resolveContentLink("student-template/UI.md", `examples/${id}/README.md`, {}, { [`student-template/examples/${id}/README.md`]: readme }), `/source?file=${encodeURIComponent(`student-template/examples/${id}/README.md`)}`);
  }
});

test("Lesson 12 stages expose every runnable helper and reuse canonical assets", () => {
  assert.equal(lessonNavigation("12").related.title, "Add artwork and sound");
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

test("stage guides open read-only source and unknown guides stay unlinked", () => {
  const source = "student-template/lessons/12-media.md";
  for (const id of ["scrolling-game", "platform-game", "level-game", "full-game"]) {
    const key = `student-template/examples/${id}/README.md`;
    assert.equal(resolveContentLink(source, `../examples/${id}/README.md`, {}, { [key]: "# Copy files" }), `/source?file=${encodeURIComponent(`student-template/examples/${id}/README.md`)}`);
    assert.equal(resolveContentLink(source, `../examples/${id}/README.md`, {}, {}), null);
  }
  assert.equal(resolveContentLink(source, "../examples/private/README.md", {}, {}), null);
});

test("legacy starter links retain hosted setup and Pika destinations after source remapping", () => {
  const documents = {starter:{source:"docs/GETTING-STARTED.md",aliases:{"student-template/README.md":{
    "first-setup":"one-time-setup", "your-repository-and-pika":"your-individual-workflow"
  }}}};
  assert.equal(resolveContentLink("student-template/lessons/README.md","../README.md#first-setup",documents,{}),"/help/setup#one-time-setup");
  assert.equal(resolveContentLink("student-template/lessons/README.md","../README.md#your-repository-and-pika",documents,{}),"/help/setup#your-individual-workflow");
  assert.equal(resolveContentLink("docs/PRODUCT.md","../student-template/README.md",documents,{}),"/help/setup");
  assert.equal(resolveContentLink("docs/DEVELOPMENT.md","../student-template/README.md",documents,{}),"/help/setup");
  assert.equal(resolveContentLink("docs/PRODUCT.md","../student-template/README.md#old-heading",documents,{}),"/help/setup");
  const prepare = readFileSync(new URL("../scripts/prepare.mjs",import.meta.url),"utf8");
  assert.match(prepare,/docs\.starter\.aliases =/);
  assert.match(prepare,/"first-setup": "one-time-setup"/);
  assert.match(prepare,/"your-repository-and-pika": "your-individual-workflow"/);
});

test("tutorial starts use distinct setup actions from continuing lessons", () => {
  const document = readFileSync(new URL("../components/Document.jsx", import.meta.url), "utf8");
  const tutorialProject = readFileSync(new URL("../components/TutorialProject.jsx", import.meta.url), "utf8");
  const prepare = readFileSync(new URL("../scripts/prepare.mjs", import.meta.url), "utf8");
  assert.match(document, /<TutorialProject project=\{practiceProject\}/);
  assert.match(document, /lesson === practiceProject.firstLesson/);
  assert.doesNotMatch(document + tutorialProject, /First time\?|If you have not started it yet|className="lesson-help"|className="reader-subtitle"|Continue your/);
  assert.match(tutorialProject, /Start tutorial →/);
  assert.doesNotMatch(tutorialProject, /templateHref|Use template/);
  assert.match(tutorialProject, /lesson === project.firstLesson/);
  assert.doesNotMatch(document + tutorialProject, /generated\/projects\/|zero-project-|Start project|Start Project/);
  assert.match(prepare, /prepareLessonProjects\(root, \{ website: true, extension: false \}\)/);
  assert.match(prepare, /collect\("teaching\/checkpoints"\)/);
  assert.deepEqual(lessons.filter(({id})=>projectForLesson(id)?.firstLesson===id).map(({id})=>id),["0","3","8","13"]);
  for (const lesson of lessons.filter(item=>item.id!=="15")) assert.ok(projectForLesson(lesson.id));
  for (const id of ["greeting","study","game","pet"]) {
    const url = `/generated/projects/zero-project-${id}.zip`;
    assert.equal(resolveContentLink("student-template/lessons/README.md",url,{},{}),null);
    assert.equal(resolveContentLink("student-template/lessons/README.md",`https://zero.codepet.ca${url}`,{},{}),null);
    const record=tutorialTemplateDefinitions.find(item=>item.id===id);
    const repositoryUrl=`https://github.com/${record.repository}`;
    assert.deepEqual(publishedTutorialTemplate(id),record.publication ? {repository:record.repository,repositoryUrl,templateHref:`${repositoryUrl}/generate`,...(record.publication.scaffoldSha256?{scaffoldSha256:record.publication.scaffoldSha256}:{})} : null);
  }
  assert.equal(resolveContentLink("student-template/lessons/README.md","/generated/projects/zero-project-other.zip",{},{}),null);
  assert.equal(resolveContentLink("student-template/lessons/README.md","/generated/lessons/zero-lesson-10-game.zip",{},{}),null);
  assert.equal(resolveContentLink("student-template/lessons/12-media.md",sampleGameAssets.href,{},{}),sampleGameAssets.href);
});

test("practice downloads contain foundations but no completed lesson examples", async () => {
  const {lessonProjects} = await import("../../scripts/lesson-projects.mjs");
  const bundle = lessonProjects();
  assert.deepEqual(bundle.projects.map(({id})=>id),["greeting","study","game","pet"]);
  for (const project of bundle.projects) {
    const paths = project.files.map(file=>file.path);
    assert.ok(paths.includes("src/main/java/Main.java"),project.id);
    assert.ok(paths.includes("zero.json"),project.id);
    assert.ok(paths.includes("README.md"),project.id);
    assert.ok(paths.every(path=>!path.startsWith("lessons/")&&!path.startsWith("examples/")&&!path.includes("checkpoints/")),project.id);
    const java = paths.filter(path=>path.startsWith("src/main/java/") && path.endsWith(".java"));
    assert.deepEqual(java.sort(), ["src/main/java/Main.java", ...core.coreSourcePaths].sort(), project.id);
    const main = Buffer.from(project.files.find(file=>file.path==="src/main/java/Main.java").content,"base64").toString("utf8");
    assert.doesNotMatch(main,/class (?:Question|Counter|Coin|Player|ScoreDisplay)/);
  }
});

test("intermediate lessons keep the existing three small projects and a proposal path", () => {
  assert.equal(lessons.length,19);
  assert.deepEqual(lessonGroups.find(group=>group.id==='practice').lessons,['10','11','12','18']);
  assert.equal(lessons.find(lesson=>lesson.id==='10').title,'Refactor a busy Main');
  assert.equal(lessons.find(lesson=>lesson.id==='11').title,'Practise sharing a component');
  for (const [id,name] of [['10','10-components'],['11','11-zerohub']]) {
    const source=readFileSync(new URL(`../../student-template/lessons/${name}.md`,import.meta.url),'utf8');
    assert.ok(source.includes('PlayerInput'));
    assert.doesNotMatch(source,/zero-pong|zero-collector|zero-platformer/);
    const target=`teaching/checkpoints/${id}/game/PlayerInput.java`;
    assert.equal(resolveContentLink(`student-template/lessons/${name}.md`,`../../${target}`,{}, {[target]:'source'}),`/source?file=${encodeURIComponent(target)}`);
  }
});
