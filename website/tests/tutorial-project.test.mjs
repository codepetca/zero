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

test("starting lessons direct students to Zero without project-start links", () => {
  for (const lesson of ["0", "8", "13"]) {
    const html = render(lesson);
    assert.match(html, /Start tutorial →/);
    assert.ok(html.includes(projectForLesson(lesson).title));
    assert.match(html, /If the tutorial is unavailable/);
    assert.doesNotMatch(html, /<a |Use template|github\.com|\.zip|download=/);
  }
  assert.match(render("3"), /Open your existing <strong>Study<\/strong> project/);
});

test("continuing lessons omit repeated generic setup and workflow cards", () => {
  for (const lesson of ["1", "2", "4", "5", "6", "7", "9", "11"]) {
    assert.equal(render(lesson), "", `Lesson ${lesson} has no project setup card`);
  }
  for (const lesson of ["10", "12"]) {
    assert.doesNotMatch(render(lesson), /Setup|Use template|Clone from GitHub|Clone here|Continue your|New branch|Publish app|Open in browser/);
  }
});

test("reuse continues the Coin game and optional game media remains the only tutorial ZIP", () => {
  assert.match(render("10"), /Reopen your Coin game/);
  const html = render("12");
  assert.ok(html.includes(`href="${sampleGameAssets.href}" download="${sampleGameAssets.filename}"`));
  assert.match(html, /ZIP contains only media files/);
  for (let id = 0; id < 12; id++) assert.doesNotMatch(render(String(id)), /download=|\.zip/);
});

test("own-project directs students to create a project without offering a tutorial template",()=>{
  const html=render('14');
  assert.match(html,/Project → New/);
  assert.match(html,/Start Page/);
  assert.doesNotMatch(html,/not available yet|published and verified/);
  assert.doesNotMatch(html,/Use template|Template not available|github\.com|download=|\.zip/);
});
