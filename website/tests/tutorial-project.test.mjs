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

test("all three starting lessons require a template and clone of the student's own repository", () => {
  for (const lesson of ["0", "3", "8"]) {
    const project = projectForLesson(lesson);
    const repository = `fixture-owner/tutorial-${project.id}`;
    const template = {repository, repositoryUrl: `https://github.com/${repository}`, templateHref: `https://github.com/${repository}/generate`};
    const html = render(lesson, template);
    assert.ok(html.includes(`href="${template.templateHref}">Use template</a>`));
    assert.ok(html.includes(`href="${template.repositoryUrl}">View tutorial template</a>`));
    assert.match(html, /create a repository under your own GitHub account/);
    assert.match(html, /your new repository/);
    assert.match(html, /Code → HTTPS/);
    assert.match(html, /Git: Clone/);
    assert.match(html, /your new repository<\/strong>.*Code → HTTPS/);
    assert.match(html, /empty Main/);
    assert.doesNotMatch(html, /Template not available yet|\.zip|download=|Unzip|Create an empty repository/);
  }
});

test("unpublished templates give a precise recovery without guessed GitHub links or a ZIP bypass", () => {
  for (const lesson of ["0", "3", "8"]) {
    const html = render(lesson);
    assert.match(html, /Template not available yet/);
    assert.match(html, /tutorial template has not been published/);
    assert.match(html, /Ask your teacher for the published tutorial template/);
    assert.match(html, /your own already-cloned repository/);
    assert.doesNotMatch(html, /href="https:\/\/github\.com|class="button"|\.zip|download=/);
  }
});

test("every lesson uses the live branch, run, upload and finish workflow with local Run available", () => {
  for (let id = 0; id <= 12; id++) {
    const lesson = String(id);
    const html = render(lesson);
    const actions = ["New branch", "Run App", "Upload changes", "Finish change"];
    let previous = -1;
    for (const action of actions) {
      const position = html.indexOf(`<strong>${action}</strong>`);
      assert.ok(position > previous, `${lesson}: ${action} stays in workflow order`);
      previous = position;
    }
    assert.match(html, /Review the account, repository, branch and files before confirming GitHub actions/);
    assert.match(html, /Nothing uploads automatically/);
    assert.match(html, /Local Run App needs no GitHub sign-in/);
    assert.match(html, /href="\/docs\/course-project#tutorial-repositories"/);
    assert.doesNotMatch(html, /simulation|per-repository Git commit name and email|origin and starting history/);
    if (!["0", "3", "8"].includes(lesson)) {
      assert.match(html, /Continue your .* project in the same cloned repository/);
      assert.ok(html.includes(`href="/tutorials/${projectForLesson(lesson).firstLesson}"`));
      assert.doesNotMatch(html, /Use template|Git: Clone|has not been published/);
    }
  }
});

test("reuse keeps two existing repositories and optional game media remains the only tutorial ZIP", () => {
  assert.match(render("10"), /Study quiz and Coin game repositories/);
  const html = render("12");
  assert.ok(html.includes(`href="${sampleGameAssets.href}" download="${sampleGameAssets.filename}"`));
  assert.match(html, /ZIP contains only media files/);
  for (let id = 0; id < 12; id++) assert.doesNotMatch(render(String(id)), /download=|\.zip/);
});
