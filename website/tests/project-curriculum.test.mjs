import test from "node:test";
import assert from "node:assert/strict";
import {examples} from "../lib/learning.mjs";
import {courseStarterId, featuredProjectIds, advancedProjectIds, projectNavigation, selectHubProject, projectGuide, projectTitle} from "../lib/project-curriculum.mjs";

const snapshot = {starter: {id: courseStarterId, title: "New Project"}, projects: examples};

test("the course picker offers an original-project starter, four distinct practice projects and three optional advanced projects", () => {
  const navigation = projectNavigation(snapshot, snapshot.starter);
  assert.equal(navigation.starter.id, "zero-starter");
  assert.deepEqual(navigation.featured.map(item => item.id), ["hello-app", "study", "coin-game-component", "drawing"]);
  assert.deepEqual(navigation.advanced.map(item => item.id), ["composed-study", "composed-game", "full-game"]);
  assert.equal(navigation.checkpoint, null);
  assert.equal(new Set([courseStarterId, ...featuredProjectIds, ...advancedProjectIds]).size, 8);
  for (const id of [courseStarterId, ...featuredProjectIds]) assert.ok(projectGuide(id).challenge);
  assert.equal(projectTitle(examples.find(project => project.id === "coin-game-component")), "Collect the coins");
});

test("all 26 canonical examples still resolve; only an explicitly selected tutorial checkpoint appears in navigation", () => {
  assert.equal(selectHubProject(snapshot), snapshot.starter);
  assert.equal(selectHubProject(snapshot, "zero-starter"), snapshot.starter);
  assert.equal(selectHubProject(snapshot, "unknown"), undefined);
  assert.equal(selectHubProject(snapshot, ""), undefined);
  const checkpoints = examples.filter(project => ![...featuredProjectIds, ...advancedProjectIds].includes(project.id));
  assert.equal(checkpoints.length, 19);
  for (const project of examples) {
    assert.equal(selectHubProject(snapshot, project.id), project);
    const navigation = projectNavigation(snapshot, project);
    assert.equal(navigation.featured.length, 4);
    assert.equal(navigation.advanced.length, 3);
    if (checkpoints.includes(project)) {
      assert.equal(navigation.checkpoint.id, project.id);
      assert.equal(navigation.checkpoint.href, `/hub?kind=example&example=${project.id}`);
    } else assert.equal(navigation.checkpoint, null);
  }
});

test("a missing retained project is a preparation error rather than a silently smaller curriculum", () => {
  const incomplete = {...snapshot, projects: examples.filter(project => project.id !== "study")};
  assert.throws(() => projectNavigation(incomplete, incomplete.starter), /Missing course project: study/);
});


test("New Project opens only the verified starter template, with an unpublished ZIP-guide fallback", () => {
  const templateHref = "https://github.com/codepetca/zero-starter/generate";
  const published = {...snapshot, starter: {...snapshot.starter, templateHref}};
  const navigation = projectNavigation(published, examples[0]);
  assert.equal(navigation.starter.title, "New Project");
  assert.equal(navigation.starter.href, templateHref);
  assert.equal(navigation.starter.external, true);
  assert.equal(projectNavigation(snapshot, snapshot.starter).starter.href, "/hub?kind=example&example=zero-starter");
  assert.equal(projectNavigation(snapshot, snapshot.starter).starter.external, undefined);
  for (const href of ["https://github.com/someone/other/generate", "javascript:alert(1)"]) {
    assert.throws(() => projectNavigation({...snapshot, starter: {...snapshot.starter, templateHref: href}}, snapshot.starter), /Invalid starter template link/);
  }
});
