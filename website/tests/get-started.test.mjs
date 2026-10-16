import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectForLesson, publishedTutorialTemplate } from "../lib/learning.mjs";

const source = await readFile(new URL("../components/GetStarted.jsx", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
}).outputText.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const { GetStarted } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const render = (template = null) => renderToStaticMarkup(createElement(GetStarted, { template }));
const fixture = { templateHref: "https://github.com/fixture-owner/verified-greeting/generate" };
const projectSection = html => html.slice(html.indexOf('<section id="project"'), html.indexOf('<section id="lesson"'));

test("all setup steps are readable together with public downloads and direct GitHub choices", () => {
  const html = render();
  let previous = -1;
  for (const id of ["github", "install", "project", "lesson"]) {
    const position = html.indexOf(`<section id="${id}"`);
    assert.ok(position > previous, `${id} follows previous step`);
    previous = position;
  }
  for (const url of ["https://github.com/login", "https://github.com/signup"]) {
    assert.ok(html.includes(`href="${url}" target="_blank" rel="noopener noreferrer"`));
  }
  assert.match(html, /href="\/downloads">Download Zero/);
  assert.match(html, /Download and launch Zero/);
  assert.match(html, /Mac with Apple Silicon or Windows ZIP \(manual setup\)/);
  assert.match(html, /href="\/tutorials\/0">Start lesson 0/);
  assert.doesNotMatch(html, /Step 1 of|Already installed\?|My project is open|<form|<input|access_token/);
});

test("unpublished template remains unavailable without blocking the rest of the page", () => {
  const html = render();
  const project = projectSection(html);
  assert.match(project, /Template not available yet/);
  assert.match(project, /your own already-cloned Greeting app/);
  assert.doesNotMatch(project, /href="https:\/\/github.com|Create my project|\.zip/);
  assert.match(html, /href="\/tutorials\/0"/);
});

test("published template links only supplied metadata and teaches an owned clone", async () => {
  const html = render(fixture);
  assert.ok(projectSection(html).includes(`href="${fixture.templateHref}"`));
  assert.match(html, /Create your own repository from the template/);
  assert.match(html, /Code → HTTPS URL/);
  assert.match(html, /Git: Clone/);
  assert.match(html, /open the folder/);
  assert.doesNotMatch(html, /Template not available yet/);
  const route = await readFile(new URL("../app/get-started/page.tsx", import.meta.url), "utf8");
  assert.match(route, /publishedTutorialTemplate\(project.id\)/);
  assert.match(route, /projectForLesson\("0"\)/);
  const current = render(publishedTutorialTemplate(projectForLesson("0").id));
  if (publishedTutorialTemplate("greeting") === null) assert.match(current, /Template not available yet/);
});

test("optional help preserves identity, offline Run, public Publish and separate submission", () => {
  const html = render();
  assert.match(html, /href="\/docs\/setup#before-lesson-0-github-and-privacy"/);
  assert.match(html, /<details id="sharing">/);
  assert.match(html, /this repository.*Git name\/email before your first upload/);
  assert.match(html, /offline once build tools are cached/);
  assert.match(html, /nothing uploads automatically/);
  assert.match(html, /Publish app is optional and public/);
  assert.match(html, /First Publish confirms the destination; later Publish updates that site/);
  assert.match(html, /separately in Pika/);
});
