import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {projectForLesson, sampleGameAssets} from "../lib/learning.mjs";

// Render the production component with explicit publication fixtures. This does
// not change the authored availability metadata or make any GitHub request.
const source = await readFile(new URL("../components/TutorialProject.jsx", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext},
}).outputText.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const {TutorialProject} = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const render = (lesson, template = null) => renderToStaticMarkup(createElement(TutorialProject, {
  project: projectForLesson(lesson), lesson, template, assets: sampleGameAssets,
}));

test("only starting lessons offer the published template and a concise own-repository path", () => {
  for (const lesson of ["0", "3", "8", "13"]) {
    const project = projectForLesson(lesson);
    const repository = `fixture-owner/tutorial-${project.id}`;
    const template = {repository, repositoryUrl: `https://github.com/${repository}`, templateHref: `https://github.com/${repository}/generate`};
    const html = render(lesson, template);
    assert.ok(html.includes(`href="${template.templateHref}">Use template</a>`));
    assert.match(html, /Create your own GitHub repository from the template/);
    assert.match(html, /Project → Clone from GitHub…<\/strong> in Zero/);
    assert.match(html, /paste your URL and choose <strong>Clone here<\/strong>/);
    assert.match(html, /href="\/help\/setup#start-here">Setup<\/a>/);
    assert.equal((html.match(/<p>/g) || []).length, 1);
    assert.doesNotMatch(html, /Template not available yet|\.zip|download=|<ol|Publish app|New branch|Open in browser/);
  }
});

test("unpublished templates explain recovery without a guessed GitHub link or ZIP bypass", () => {
  for (const lesson of ["0", "3", "8", "13"]) {
    const html = render(lesson);
    assert.match(html, /Template not available yet/);
    assert.ok(html.includes(`Ask your teacher for the published ${projectForLesson(lesson).title} tutorial template`));
    assert.match(html, /your own already-cloned repository/);
    assert.match(html, /href="\/help\/setup#start-here">Setup<\/a>/);
    assert.doesNotMatch(html, /href="https:\/\/github\.com|class="button"|\.zip|download=/);
  }
});

test("continuing lessons omit repeated generic setup and workflow cards", () => {
  for (const lesson of ["1", "2", "4", "5", "6", "7", "9", "11"]) {
    assert.equal(render(lesson), "", `Lesson ${lesson} has no project setup card`);
  }
  for (const lesson of ["10", "12"]) {
    assert.doesNotMatch(render(lesson), /Setup|Use template|Clone from GitHub|Clone here|Continue your|New branch|Publish app|Open in browser/);
  }
});

test("reuse keeps two existing repositories and optional game media remains the only tutorial ZIP", () => {
  assert.match(render("10"), /Study quiz and Coin game repositories/);
  const html = render("12");
  assert.ok(html.includes(`href="${sampleGameAssets.href}" download="${sampleGameAssets.filename}"`));
  assert.match(html, /ZIP contains only media files/);
  for (let id = 0; id < 12; id++) assert.doesNotMatch(render(String(id)), /download=|\.zip/);
});

test("own-project explains the unverified starter without offering a tutorial template",()=>{
  const html=render('14');
  assert.match(html,/Project → New/);
  assert.match(html,/Updated starter not available yet/);
  assert.match(html,/Once the updated original starter is published and verified/);
  assert.doesNotMatch(html,/Use template|Template not available|github\.com|download=|\.zip/);
});
