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
}).outputText
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replace('"react"', JSON.stringify(import.meta.resolve("react")));
const { GetStarted, GetStartedStep, wizardStep } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const routeSource = await readFile(new URL("../app/get-started/page.tsx", import.meta.url), "utf8");
const render = (step, template = null) => renderToStaticMarkup(createElement(GetStartedStep, { step, template }));
const fixture = { templateHref: "https://github.com/fixture-owner/verified-greeting/generate" };

test("first screen shows one GitHub entry and no later steps or website login form", () => {
  const html = renderToStaticMarkup(createElement(GetStarted, { template: null }));
  assert.match(html, /Step 1 of 4/);
  assert.match(html, /href="https:\/\/github.com\/login" target="_blank" rel="noopener noreferrer">Continue with GitHub/);
  assert.equal((html.match(/class="guide-button"/g) || []).length, 1);
  assert.doesNotMatch(html, /Download Zero|Create my project|Start lesson 0|<input|<form|oauth|access_token/i);
  assert.match(html, /href="\/docs\/setup#before-lesson-0-github-and-privacy"/);
});

test("bookmark and browser-history steps stay bounded, including the old sharing link", () => {
  for (const id of ["github", "install", "project", "lesson"]) assert.equal(wizardStep(`#${id}`), id);
  for (const hash of ["", "#unknown", "#https://github.com", "#__proto__"]) assert.equal(wizardStep(hash), "github");
  assert.equal(wizardStep("#sharing"), "lesson");
});

test("installation stays public with platform labels and useful setup help", () => {
  const html = render("install");
  assert.match(html, /href="\/downloads">Download Zero/);
  assert.match(html, /Mac with Apple Silicon or Windows ZIP \(manual setup\)/);
  assert.match(html, /check Java and Git/);
  assert.match(html, /href="\/docs\/setup"/);
  assert.doesNotMatch(html, /signed in successfully|account verified|<form/i);
});

test("project fixtures retain verified publication availability and an owned clone before coding", () => {
  const missing = render("project");
  assert.match(missing, /Template not available yet/);
  assert.match(missing, /Ask your teacher/);
  assert.match(missing, /your own already-cloned Greeting app/);
  assert.doesNotMatch(missing, /href="https:\/\/github.com|Create my project|\.zip/);
  const published = render("project", fixture);
  assert.ok(published.includes(`href="${fixture.templateHref}"`));
  assert.match(published, /repository in your GitHub account/);
  assert.match(published, /your repository/);
  assert.match(published, /Code → HTTPS/);
  assert.match(published, /Git: Clone/);
  assert.match(published, /open the folder/);
  assert.match(published, /this repository.*Git name and email before your first upload/);
  assert.doesNotMatch(published, /Template not available yet/);
});

test("lesson keeps local Run, reviewed optional public publishing and separate submission guidance", () => {
  const html = render("lesson");
  assert.match(html, /href="\/tutorials\/0">Start lesson 0/);
  assert.match(html, /Open your cloned project before coding/);
  assert.match(html, /offline once build tools are cached/);
  assert.match(html, /nothing uploads automatically/);
  assert.match(html, /Publish app is optional and public/);
  assert.match(html, /First Publish confirms the destination; later Publish updates that site/);
  assert.match(html, /separately in Pika/);
  const route = routeSource;
  assert.match(route, /publishedTutorialTemplate\(project.id\)/);
  assert.match(route, /projectForLesson\("0"\)/);
  const current = render("project", publishedTutorialTemplate(projectForLesson("0").id));
  if (publishedTutorialTemplate("greeting") === null) assert.match(current, /Template not available yet/);
});
