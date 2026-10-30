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
    assert.doesNotMatch(html, /If the tutorial is unavailable/);
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

test("continuing Coin lessons do not repeat starter cards", () => {
  for (const id of ['10','11','12']) assert.equal(render(id), '');
});

test("later Pet lessons continue the same project without another setup card",()=>{
  for (const id of ['16','17','14']) {
    assert.equal(projectForLesson(id).id, 'pet');
    assert.equal(render(id), '');
  }
});
