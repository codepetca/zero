import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectForLesson, publishedTutorialTemplate } from "../lib/learning.mjs";

// Exercise the production content with publication fixtures; no account or
// network operations are needed to read the guide.
const source = await readFile(new URL("../components/GetStarted.jsx", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
}).outputText.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const { GetStarted } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const render = (template = null) => renderToStaticMarkup(createElement(GetStarted, { template }));
const fixture = {
  templateHref: "https://github.com/fixture-owner/verified-greeting/generate",
  repositoryUrl: "https://github.com/fixture-owner/verified-greeting",
};

function section(html, id) {
  return html.slice(html.indexOf(`<section id="${id}"`), html.indexOf("</section>", html.indexOf(`<section id="${id}"`)));
}

test("public guide presents the five steps in order with usable deep links and returning-student path", () => {
  const html = render();
  let previous = -1;
  for (const id of ["github", "install", "project", "lesson", "sharing"]) {
    assert.ok(html.includes(`href="#${id}"`));
    const position = html.indexOf(`<section id="${id}"`);
    assert.ok(position > previous, `${id} follows previous step`);
    previous = position;
  }
  assert.match(html, /href="\/tutorials\/0">Already set up\? Continue tutorials/);
  assert.match(section(html, "install"), /href="\/downloads"/);
  assert.match(section(html, "install"), /Mac with Apple Silicon/);
  assert.match(section(html, "install"), /Windows ZIP uses manual setup/);
  assert.match(section(html, "install"), /Setup Help.*Java and Git/);
  assert.match(section(html, "lesson"), /href="\/tutorials\/0"/);
});

test("GitHub preparation opens official pages safely and keeps website access public", () => {
  const html = render();
  for (const url of ["https://github.com/signup", "https://github.com/login"]) {
    assert.ok(html.includes(`href="${url}" target="_blank" rel="noopener noreferrer"`));
  }
  assert.match(html, /verify your email/);
  assert.match(html, /school access to GitHub and VS Code, repository privacy/);
  assert.match(html, /href="\/docs\/setup#before-lesson-0-github-and-privacy"/);
  assert.match(html, /read this website without signing in; it does not check your GitHub account/);
  assert.doesNotMatch(html, /<form|<input|oauth|\/api\/auth|access_token/i);
});

test("unpublished template stays unavailable while lessons and recovery remain accessible", () => {
  const html = render();
  const project = section(html, "project");
  assert.match(project, /Template not available yet/);
  assert.match(project, /has not been published/);
  assert.match(project, /Ask your teacher for the published tutorial template/);
  assert.match(project, /your own already-cloned Greeting app repository/);
  assert.doesNotMatch(project, /href="https:\/\/github.com|\.zip|download=/);
  assert.match(section(html, "lesson"), /browse the lesson while waiting for the template/);
  assert.match(section(html, "lesson"), /Start the coding work after cloning/);
});

test("published fixture links only the supplied template and preserves own-repository clone ordering", () => {
  const html = render(fixture);
  const project = section(html, "project");
  assert.ok(project.includes(`href="${fixture.templateHref}" target="_blank" rel="noopener noreferrer"`));
  assert.doesNotMatch(project, /Template not available yet|has not been published|\.zip/);
  const instructions = ["create a new repository under your own GitHub account", "your new repository", "Code → HTTPS", "Git: Clone", "outside any other Git repository", "open the cloned folder", "Before your first upload", "Git name and email for this repository"];
  let previous = -1;
  for (const instruction of instructions) {
    const position = project.indexOf(instruction);
    assert.ok(position > previous, instruction);
    previous = position;
  }
  assert.match(project, /Clone your own copy, rather than the teacher/);
  assert.match(project, /href="\/docs\/course-project#tutorial-repositories"/);
});

test("Run remains local and source upload, optional public publishing and Pika submission remain separate", () => {
  const html = render(fixture);
  assert.match(section(html, "lesson"), /ordinary Java.*Run App.*browser/);
  assert.match(section(html, "lesson"), /cached, local Run works offline without an active GitHub sign-in/);
  const sharing = section(html, "sharing");
  let previous = -1;
  for (const action of ["New branch", "Run App", "Upload changes", "Finish change"]) {
    const position = sharing.indexOf(`<strong>${action}</strong>`);
    assert.ok(position > previous, action);
    previous = position;
  }
  assert.match(sharing, /review your account, repository, branch and files/);
  assert.match(sharing, /Nothing uploads automatically/);
  assert.match(sharing, /VS Code.*own GitHub sign-in flow/);
  assert.match(sharing, /Publish app.*separate, optional action.*public playable link/);
  assert.match(sharing, /Private repositories may need a paid GitHub plan for Pages/);
  assert.match(sharing, /source repository link separately in Pika/);
});

test("production route reads the first lesson's verified publication metadata", async () => {
  const route = await readFile(new URL("../app/get-started/page.tsx", import.meta.url), "utf8");
  assert.match(route, /projectForLesson\("0"\)/);
  assert.match(route, /publishedTutorialTemplate\(project.id\)/);
  assert.match(route, /<LearnTheme/);
  const current = render(publishedTutorialTemplate(projectForLesson("0").id));
  if (publishedTutorialTemplate("greeting") === null) assert.match(current, /Template not available yet/);
});
