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
    assert.match(html, /Start tutorial<\/strong> → <strong>/);
    assert.ok(html.includes(`<strong>${project.title}</strong> to open the matching template`));
    assert.match(html, /Use this template → Create a new repository/);
    assert.match(html, /reuses your GitHub connection; choose Connect GitHub if prompted/);
    assert.match(html, /Return to Zero.*Clone repository/);
    assert.match(html, /Paste your URL, choose a destination outside any other Git repository/);
    assert.match(html, /Open in New Window/);
    assert.match(html, /Tutorials<\/strong> tab beside <code>Main.java/);
    assert.match(html, /repository menu<\/strong>.*Clone repository/);
    assert.match(html, /Open in browser/);
    assert.match(html, /ordinary Java/);
    assert.match(html, /From Zero.*welcome/);
    assert.match(html, /With a project open, use Zero.*menu to find Start tutorial/);
    assert.doesNotMatch(html, /Git: Clone|Command Palette/);
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

test("every lesson uses the live branch, run, commit, push and merge workflow with local Run available", () => {
  for (let id = 0; id <= 12; id++) {
    const lesson = String(id);
    const html = render(lesson);
    const actions = ["New branch", "Run App", "Commit &amp; push", "Merge to main"];
    let previous = -1;
    for (const action of actions) {
      const position = html.indexOf(`<strong>${action}</strong>`, previous + 1);
      assert.ok(position > previous, `${lesson}: ${action} stays in workflow order`);
      previous = position;
    }
    assert.match(html, /Review the account, repository, branch and files before confirming GitHub actions/);
    assert.match(html, /Nothing pushes automatically/);
    assert.match(html, /creates a commit when needed and pushes the current branch/);
    assert.match(html, /merges your branch into main and pushes main/);
    assert.match(html, /Publish app is a separate action.*GitHub Pages/);
    assert.doesNotMatch(html, /Upload changes|Finish change/);
    assert.match(html, /Local Run App needs no GitHub sign-in/);
    assert.match(html, /href="\/docs\/course-project#tutorial-repositories"/);
    assert.doesNotMatch(html, /simulation|per-repository Git commit name and email|origin and starting history/);
    if (!["0", "3", "8"].includes(lesson)) {
      assert.match(html, /Continue your .* project in the same cloned repository/);
      assert.ok(html.includes(`href="/tutorials/${projectForLesson(lesson).firstLesson}"`));
      assert.doesNotMatch(html, /Use template|Start tutorial|Clone repository|has not been published/);
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
