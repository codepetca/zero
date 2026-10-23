import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archivePolicy from "../../extension/src/sharing/archive.js";
import { examples } from "../lib/learning.mjs";
import { courseStarterId, featuredProjectIds, projectGuides } from "../lib/project-curriculum.mjs";
import { buildCourseStarter, buildExampleProject, prepareExampleProjects } from "../lib/example-projects.mjs";

import { templateDefinitions, templateDefinition, validatePublishedTemplates } from "../lib/project-templates.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const coreNames = ["App", "GameApp", "Actor", "ImageRegion", "SpriteAnimation", "Collisions", "Sound", "Music", "Color", "ui/Element", "ui/Label", "ui/Button", "ui/Column"];
const corePaths = coreNames.map(name => `src/main/java/zero/${name}.java`);
const scaffolding = ["pom.xml", "mvnw", "mvnw.cmd", ".mvn/wrapper/maven-wrapper.properties", ".mvn/wrapper/LICENSE-APACHE-2.0.txt", ".mvn/wrapper/NOTICE", ".vscode/tasks.json", ".vscode/extensions.json", ".gitignore"];

async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "zero-example-projects-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sources = new Set(["LICENSE", "student-template/src/main/java/Main.java", ...scaffolding.map(file => `student-template/${file}`), ...coreNames.map(name => `framework/src/main/java/zero/${name}.java`)]);
  for (const example of examples) {
    for (const file of example.files) sources.add(`student-template/examples/${file}`);
    for (const resource of example.resources ?? []) sources.add(`student-template/examples/${resource.file}`);
  }
  for (const source of sources) {
    await mkdir(path.dirname(path.join(directory, source)), { recursive: true });
    await writeFile(path.join(directory, source), await readFile(path.join(root, source)));
  }
  await mkdir(path.join(directory, "website/public/example-previews"), {recursive: true});
  for (const id of featuredProjectIds) {
    await writeFile(path.join(directory, `website/public/example-previews/${id}.png`),
      await readFile(path.join(root, `website/public/example-previews/${id}.png`)));
  }
  await mkdir(path.join(directory, "website/content"), {recursive: true});
  await writeFile(path.join(directory, "website/content/project-templates.json"), JSON.stringify({schema: 1, templates: []}));
  return directory;
}

test("all 26 complete projects preserve exact manifest sources and resources, with no starter splicing", async () => {
  assert.equal(examples.length, 26);
  for (const example of examples) {
    const project = await buildExampleProject({ root, example });
    const inspected = archivePolicy.inspectGamePackage(project.bytes);
    const files = new Map(inspected.map(file => [file.path, file]));
    const expected = ["LICENSE", "README.md", "zero.json", ...scaffolding, ...corePaths,
      ...example.files.map(file => `src/main/java/${path.posix.basename(file)}`), ...(example.resources ?? []).map(resource => resource.destination)].sort();
    assert.deepEqual([...files.keys()], expected, example.id);
    for (const file of example.files) {
      assert.deepEqual(files.get(`src/main/java/${path.posix.basename(file)}`).data, await readFile(path.join(root, "student-template/examples", file)), `${example.id}: ${file}`);
    }
    for (const resource of example.resources ?? []) {
      assert.deepEqual(files.get(resource.destination).data, await readFile(path.join(root, "student-template/examples", resource.file)), `${example.id}: ${resource.file}`);
    }
    for (const name of coreNames) {
      assert.deepEqual(files.get(`src/main/java/zero/${name}.java`).data, await readFile(path.join(root, `framework/src/main/java/zero/${name}.java`)));
    }
    assert.deepEqual(JSON.parse(files.get("zero.json").data), { name: example.title, templateVersion: "0.1.0", mainClass: "Main" });
    const readme = files.get("README.md").data.toString();
    assert.match(readme, /Extract the downloaded ZIP/);
    assert.match(readme, /Run App in the Zero sidebar/);
    assert.match(readme, /\.\/mvnw clean compile javafx:run/);
    assert.match(readme, /\.\\mvnw\.cmd clean compile javafx:run/);
    assert.equal(project.size, project.bytes.length);
    assert.equal(project.sha256, createHash("sha256").update(project.bytes).digest("hex"));
  }
});

test("ZIP bytes are deterministic and every header uses 1980 dates and ordinary Unix file modes", async () => {
  for (const example of [null, ...examples]) {
    const first = example ? await buildExampleProject({ root, example }) : await buildCourseStarter({ root });
    const second = example ? await buildExampleProject({ root, example }) : await buildCourseStarter({ root });
    assert.deepEqual(first.bytes, second.bytes, example?.id ?? courseStarterId);
    const bytes = first.bytes;
    let offset = bytes.readUInt32LE(bytes.length - 6);
    for (const file of first.files) {
      assert.equal(bytes.readUInt16LE(offset + 12), 0); // midnight
      assert.equal(bytes.readUInt16LE(offset + 14), 33); // January 1, 1980
      assert.equal(bytes.readUInt32LE(offset + 38) >>> 16, file.path === "mvnw" ? 0o100755 : 0o100644);
      const local = bytes.readUInt32LE(offset + 42);
      assert.equal(bytes.readUInt16LE(local + 10), 0);
      assert.equal(bytes.readUInt16LE(local + 12), 33);
      offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    }
  }
});

test("preparation writes verified assets, complete local projects and canonical catalog links", async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, "student-template/.env"), "private fixture, never package");
  const projectDirectory = path.join(directory, "scratch/projects");
  const snapshot = await prepareExampleProjects({ root: directory, projectDirectory });
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "website/.generated/example-projects.json"))), snapshot);
  assert.equal(snapshot.schema, 1);
  assert.equal(snapshot.projects.length, 26);
  assert.equal(snapshot.starter.id, courseStarterId);
  assert.equal(snapshot.starter.title, "New Project");
  assert.match(snapshot.starter.description, /minimal working Java starter.*original/i);
  assert.equal(snapshot.starter.repositoryUrl, "https://github.com/codepetca/zero/tree/main/student-template");
  assert.equal(snapshot.starter.projectHref, "/generated/example-projects/zero-starter.zip");
  assert.deepEqual(snapshot.starter.images, []);
  for (const entry of [snapshot.starter, ...snapshot.projects]) {
    assert.equal(entry.templateHref, undefined);
    const example = examples.find(example => example.id === entry.id);
    if (example) assert.equal(entry.repositoryUrl, `https://github.com/codepetca/zero/tree/main/student-template/examples/${entry.id}`);
    assert.equal(entry.projectHref, `/generated/example-projects/${entry.id}.zip`);
    if (example) assert.deepEqual(entry.images, [{ src: `/example-previews/${entry.id}.png`, alt: `${entry.title} app preview` }]);
    const bytes = await readFile(path.join(directory, "website/public", entry.projectHref));
    assert.equal(entry.size, bytes.length);
    assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
    for (const file of archivePolicy.inspectGamePackage(bytes)) {
      const target = path.join(projectDirectory, entry.id, file.path);
      assert.deepEqual(await readFile(target), file.data);
      assert.equal((await lstat(target)).mode & 0o777, file.path === "mvnw" ? 0o755 : 0o644);
    }
    assert.deepEqual(await readFile(path.join(projectDirectory, entry.id, "src/main/java/Main.java")), await readFile(example ? path.join(directory, "student-template/examples", example.files.find(file => file.endsWith("/Main.java"))) : path.join(directory, "student-template/src/main/java/Main.java")));
    await assert.rejects(readFile(path.join(projectDirectory, entry.id, ".env")), { code: "ENOENT" });
  }
});

test("preparation refuses missing canonical sources, substituted wrappers, path escapes and class collisions", async t => {
  const directory = await fixture(t);
  const example = examples[0];
  await assert.rejects(buildExampleProject({ root: directory, example: { ...example, files: [...example.files, "hello-button/Main.java"] } }), /Duplicate\/case-colliding/);
  await assert.rejects(buildExampleProject({ root: directory, example: { ...example, files: ["../Main.java"] } }), /Unsafe game archive path/);
  await assert.rejects(buildExampleProject({ root: directory, example: { ...example, resources: [{ file: "media-demo/resources/media-demo/player.png", destination: "assets/player.png" }] } }), /src\/main\/resources/);
  const wrapper = path.join(directory, "student-template/mvnw");
  const trusted = await readFile(wrapper);
  await writeFile(wrapper, "substituted wrapper");
  await assert.rejects(buildExampleProject({ root: directory, example }), /pinned trusted kit/);
  await assert.rejects(buildCourseStarter({ root: directory }), /pinned trusted kit/);
  await writeFile(wrapper, trusted);
  await rm(path.join(directory, "framework/src/main/java/zero/App.java"));
  await assert.rejects(prepareExampleProjects({ root: directory }), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(directory, "website/.generated/example-projects.json")), { code: "ENOENT" });
});

test("source and output symlinks are refused; copied executable bits cannot grant resource execution", async t => {
  const directory = await fixture(t);
  const example = examples.find(example => example.id === "media-demo");
  const resource = path.join(directory, "student-template/examples/media-demo/resources/media-demo/player.png");
  await chmod(resource, 0o755);
  const built = await buildExampleProject({ root: directory, example });
  assert.equal(archivePolicy.inspectGamePackage(built.bytes).find(file => file.path.endsWith("player.png")).mode, 0o100644);
  await rm(resource);
  await symlink(path.join(root, "student-template/examples/media-demo/resources/media-demo/player.png"), resource);
  await assert.rejects(buildExampleProject({ root: directory, example }), /ordinary file/);
  await rm(resource);
  await writeFile(resource, await readFile(path.join(root, "student-template/examples/media-demo/resources/media-demo/player.png")));
  await symlink(path.join(directory, "student-template"), path.join(directory, "linked-output"));
  await assert.rejects(prepareExampleProjects({ root: directory, projectDirectory: path.join(directory, "linked-output/projects") }), /ordinary directory/);
  const assets = path.join(directory, "website/public/generated/example-projects");
  await mkdir(assets, { recursive: true });
  await symlink(resource, path.join(assets, `${examples[0].id}.zip`));
  const before = await readFile(resource);
  await assert.rejects(prepareExampleProjects({ root: directory }), /Generated example asset must be an ordinary file/);
  assert.deepEqual(await readFile(resource), before);
  await assert.rejects(lstat(path.join(directory, "dist/example-projects")), { code: "ENOENT" });
});

test("a linked catalog snapshot preserves existing projects and ZIPs before any output mutation", async t => {
  const directory = await fixture(t);
  const generated = path.join(directory, "website/.generated");
  const assets = path.join(directory, "website/public/generated/example-projects");
  const project = path.join(directory, "dist/example-projects", examples[0].id);
  await mkdir(generated, { recursive: true });
  await mkdir(assets, { recursive: true });
  await mkdir(project, { recursive: true });
  const protectedFile = path.join(directory, "protected.txt");
  await writeFile(protectedFile, "leave this file intact");
  await writeFile(path.join(project, "sentinel.txt"), "existing project");
  await writeFile(path.join(assets, `${examples[0].id}.zip`), "existing ZIP");
  await symlink(protectedFile, path.join(generated, "example-projects.json"));
  await assert.rejects(prepareExampleProjects({ root: directory }), /Generated example asset must be an ordinary file/);
  assert.equal(await readFile(protectedFile, "utf8"), "leave this file intact");
  assert.equal(await readFile(path.join(project, "sentinel.txt"), "utf8"), "existing project");
  assert.equal(await readFile(path.join(assets, `${examples[0].id}.zip`), "utf8"), "existing ZIP");
  await assert.rejects(lstat(path.join(directory, "dist/example-projects", examples[1].id)), { code: "ENOENT" });
});

test("final preparation requires every app preview and includes actual shared-screen started views", async t => {
  const directory = await fixture(t);
  await assert.rejects(prepareExampleProjects({ root: directory, requirePreviews: true }), /Example preview missing/);
  await assert.rejects(lstat(path.join(directory, "dist/example-projects")), { code: "ENOENT" });
  const previews = path.join(directory, "website/public/example-previews");
  await mkdir(previews, { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=", "base64");
  for (const example of examples) await writeFile(path.join(previews, `${example.id}.png`), png);
  await writeFile(path.join(previews, "composed-study-started.png"), png);
  const snapshot = await prepareExampleProjects({ root: directory, requirePreviews: true });
  assert.deepEqual(snapshot.starter.images, []);
  assert.deepEqual(snapshot.projects.find(project => project.id === "composed-study").images.map(image => image.src), ["/example-previews/composed-study.png", "/example-previews/composed-study-started.png"]);
  assert.equal(snapshot.projects.find(project => project.id === "composed-game").images.length, 1);
});


test("course starter contains canonical Main, shared scaffold and framework only", async t => {
  const directory = await fixture(t);
  for (const relative of ["student-template/.env", "student-template/lessons/private.md", "student-template/src/main/java/Extra.java"]) {
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await writeFile(path.join(directory, relative), "unrelated and private content");
  }
  const project = await buildCourseStarter({ root: directory });
  const files = new Map(archivePolicy.inspectGamePackage(project.bytes).map(file => [file.path, file]));
  assert.deepEqual([...files.keys()], ["LICENSE", "README.md", "zero.json", ...scaffolding,
    "src/main/java/Main.java", ...corePaths].sort());
  const sources = [
    ["src/main/java/Main.java", "student-template/src/main/java/Main.java"],
    ...coreNames.map(name => [`src/main/java/zero/${name}.java`, `framework/src/main/java/zero/${name}.java`]),
    ["LICENSE", "LICENSE"], ...scaffolding.map(file => [file, `student-template/${file}`]),
  ];
  for (const [destination, source] of sources) assert.deepEqual(files.get(destination).data, await readFile(path.join(directory, source)));
  assert.deepEqual(JSON.parse(files.get("zero.json").data), {name: "New Project", templateVersion: "0.1.0", mainClass: "Main"});
  const readme = files.get("README.md").data.toString();
  assert.match(readme, /original idea/);
  assert.match(readme, /README.*title and introduction/);
  assert.match(readme, /change plan/);
  assert.match(readme, /Run App in the Zero sidebar/);
  assert.match(readme, /\.\/mvnw clean compile javafx:run/);
  assert.match(readme, /\.\\mvnw\.cmd clean compile javafx:run/);
  assert.equal(project.size, project.bytes.length);
  assert.equal(project.sha256, createHash("sha256").update(project.bytes).digest("hex"));
});

test("starter and featured downloads give concrete changes and the actual individual Git workflow", async () => {
  const downloads = [await buildCourseStarter({ root }), ...await Promise.all(featuredProjectIds.map(id => buildExampleProject({ root, example: examples.find(example => example.id === id) })))];
  for (const [index, project] of downloads.entries()) {
    const readme = project.files.find(file => file.path === "README.md").data.toString();
    if (index > 0) {
      const guide = projectGuides[featuredProjectIds[index - 1]];
      assert.ok(readme.startsWith(`# ${guide.title}\n`));
      assert.ok(readme.includes(guide.challenge));
    }
    assert.match(readme, /own empty GitHub repository/);
    assert.match(readme, /Project → Connect to GitHub…/);
    assert.match(readme, /per-repository name\/email identity/);
    assert.match(readme, /native GitHub sign-in/);
    assert.match(readme, /GitHub actions are live by default/);
    assert.doesNotMatch(readme, /zero\.uploadMode|default simulation/);
    assert.match(readme, /Commit & push.*main/);
    assert.match(readme, /New branch/);
    assert.match(readme, /New branch.*repository menu/);
    assert.match(readme, /explanatory commit message/);
    assert.match(readme, /Merge to main/);
    assert.match(readme, /GitHub's.*main.*branch/);
    assert.match(readme, /own repository.*\n.*link separately in Pika/);
    assert.doesNotMatch(readme, /github\.com\/[^\s)]+\/generate|git clone|pull request/i);
  }
});

test("starter canonical Main symlinks or missing sources fail before any output mutation", async t => {
  const directory = await fixture(t);
  const main = path.join(directory, "student-template/src/main/java/Main.java");
  await rm(main);
  await assert.rejects(prepareExampleProjects({ root: directory }), {code: "ENOENT"});
  await symlink(path.join(root, "student-template/src/main/java/Main.java"), main);
  await assert.rejects(prepareExampleProjects({ root: directory }), /ordinary file/);
  await assert.rejects(lstat(path.join(directory, "dist/example-projects")), {code: "ENOENT"});
});

test("a linked starter ZIP preserves existing projects and ZIPs before any output mutation", async t => {
  const directory = await fixture(t);
  const assets = path.join(directory, "website/public/generated/example-projects");
  const project = path.join(directory, "dist/example-projects", examples[0].id);
  await mkdir(assets, {recursive: true});
  await mkdir(project, {recursive: true});
  const protectedFile = path.join(directory, "protected.txt");
  await writeFile(protectedFile, "leave this file intact");
  await writeFile(path.join(project, "sentinel.txt"), "existing project");
  await writeFile(path.join(assets, `${examples[0].id}.zip`), "existing ZIP");
  await symlink(protectedFile, path.join(assets, `${courseStarterId}.zip`));
  await assert.rejects(prepareExampleProjects({root: directory}), /Generated example asset must be an ordinary file/);
  assert.equal(await readFile(protectedFile, "utf8"), "leave this file intact");
  assert.equal(await readFile(path.join(project, "sentinel.txt"), "utf8"), "existing project");
  assert.equal(await readFile(path.join(assets, `${examples[0].id}.zip`), "utf8"), "existing ZIP");
  await assert.rejects(lstat(path.join(directory, "dist/example-projects", courseStarterId)), {code: "ENOENT"});
  await assert.rejects(lstat(path.join(directory, "website/.generated")), {code: "ENOENT"});
});


test("a missing later example source leaves the entire generated starter set intact", async t => {
  const directory = await fixture(t);
  const starter = path.join(directory, "dist/example-projects", courseStarterId);
  const assets = path.join(directory, "website/public/generated/example-projects");
  const generated = path.join(directory, "website/.generated");
  await mkdir(starter, {recursive: true});
  await mkdir(assets, {recursive: true});
  await mkdir(generated, {recursive: true});
  await writeFile(path.join(starter, "sentinel.txt"), "existing starter");
  await writeFile(path.join(assets, `${courseStarterId}.zip`), "existing starter ZIP");
  await writeFile(path.join(generated, "example-projects.json"), "existing snapshot");
  await rm(path.join(directory, "student-template/examples", examples.at(-1).files[0]));
  await assert.rejects(prepareExampleProjects({root: directory}), {code: "ENOENT"});
  assert.equal(await readFile(path.join(starter, "sentinel.txt"), "utf8"), "existing starter");
  assert.equal(await readFile(path.join(assets, `${courseStarterId}.zip`), "utf8"), "existing starter ZIP");
  assert.equal(await readFile(path.join(generated, "example-projects.json"), "utf8"), "existing snapshot");
  await assert.rejects(lstat(path.join(directory, "dist/example-projects", examples[0].id)), {code: "ENOENT"});
});

function publishedFixture() {
  return {schema: 1, templates: templateDefinitions.map((definition, index) => ({
    id: definition.id, repository: definition.repository, repositoryId: index + 1,
    visibility: "public", isTemplate: true, defaultBranch: "main",
    commit: "a".repeat(40), tree: "b".repeat(40),
  }))};
}

test("trusted templates clone the student's own repository and keep ZIP setup separate", async () => {
  for (const definition of templateDefinitions) {
    const template = templateDefinition(definition.id);
    const build = definition.id === courseStarterId
      ? options => buildCourseStarter(options)
      : options => buildExampleProject({...options, example: examples.find(example => example.id === definition.id)});
    const original = await build({root});
    const project = await build({root, template});
    const again = await build({root, template});
    assert.deepEqual(project.bytes, again.bytes);
    assert.equal(project.sha256, createHash("sha256").update(project.bytes).digest("hex"));
    const files = new Map(project.files.map(file => [file.path, file.data]));
    for (const file of original.files.filter(file => file.path !== "README.md")) {
      assert.deepEqual(files.get(file.path), file.data, `${definition.id}: ${file.path}`);
    }
    const readme = files.get("README.md").toString();
    const [clone, alternative] = readme.split("## ZIP alternative");
    assert.ok(clone.includes(`[Use this template](${template.templateHref})`));
    assert.match(clone, /Create a new\n   repository/);
    assert.match(clone, /personal account as owner/);
    assert.match(clone, /Code →\n   HTTPS/);
    assert.match(clone, /Project → Clone from GitHub…/);
    assert.match(clone, /Paste your URL in \*\*Clone from GitHub\*\*/);
    assert.match(clone, /Clone location/);
    assert.match(clone, /~\/Zero Projects/);
    assert.match(clone, /choose \*\*Clone here\*\*/);
    assert.match(clone, /Project → Open local project…/);
    assert.match(clone, /new window automatically/);
    assert.match(clone, /Open in New Window/);
    assert.match(clone, /git clone https:\/\/github.com\/YOUR-USERNAME\/YOUR-PROJECT.git\ncd YOUR-PROJECT/);
    assert.match(clone, /The cloned root opens in Zero/);
    assert.match(clone, /baseline on \*\*main\*\*/);
    assert.doesNotMatch(clone, /empty GitHub|Connect a repo/);
    assert.match(alternative, /ZIP has no Git history/);
    assert.match(alternative, /own empty GitHub/);
    assert.match(alternative, /Project → Connect to GitHub…/);
    assert.match(readme, /per-repository name\/email identity manually/);
    assert.match(readme, /signing in does\n   not configure commit identity/);
    assert.match(readme, /GitHub actions are live by default/);
    assert.match(readme, /nothing pushes automatically/);
    assert.match(readme, /Commit & push.*main.*before starting a/);
    assert.match(readme, /New branch/);
    assert.match(readme, /New branch.*repository menu/);
    assert.match(readme, /Commit & push any pending edits before finishing/);
    assert.match(readme, /Merge to main merges the current branch into main and pushes main; it does not create a pull request/);
    assert.match(readme, /link separately in Pika/);
    assert.match(readme, /\.\/mvnw clean compile javafx:run/);
    assert.match(readme, /\.\\mvnw\.cmd clean compile javafx:run/);
    assert.doesNotMatch(readme, /git clone https:\/\/github.com\/codepetca|push to codepetca|Connect[^\n]*codepetca/);
    if (definition.id === courseStarterId) assert.equal(files.has("preview.png"), false);
    else {
      assert.ok(readme.includes(`![${projectGuides[definition.id].title} app preview](preview.png)`));
      assert.deepEqual(files.get("preview.png"), await readFile(path.join(root, `website/public/example-previews/${definition.id}.png`)));
    }
    for (const invalid of [{...template, id: "drawing" === definition.id ? courseStarterId : "drawing"},
      {...template, repository: "someone/else"}, {...template, repositoryUrl: "https://example.com"},
      {...template, templateHref: "https://example.com/generate"}]) {
      await assert.rejects(build({root, template: invalid}), /Invalid project template definition/);
    }
  }
});

test("only recorded published templates get standalone links and cloning READMEs", async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, "website/content/project-templates.json"), JSON.stringify(publishedFixture()));
  const snapshot = await prepareExampleProjects({root: directory});
  for (const entry of [snapshot.starter, ...snapshot.projects]) {
    const definition = templateDefinitions.find(template => template.id === entry.id);
    const bytes = await readFile(path.join(directory, "website/public", entry.projectHref));
    assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
    const readme = archivePolicy.inspectGamePackage(bytes).find(file => file.path === "README.md").data.toString();
    if (definition) {
      const template = templateDefinition(entry.id);
      assert.equal(entry.repositoryUrl, template.repositoryUrl);
      assert.equal(entry.templateHref, template.templateHref);
      assert.match(readme, /git clone/);
    } else {
      assert.equal(entry.repositoryUrl, `https://github.com/codepetca/zero/tree/main/student-template/examples/${entry.id}`);
      assert.equal(entry.templateHref, undefined);
      assert.doesNotMatch(readme, /git clone|Use this template/);
    }
  }
});

test("publication metadata must be complete and typed before generated output changes", async t => {
  assert.doesNotThrow(() => validatePublishedTemplates({schema: 1, templates: []}));
  assert.doesNotThrow(() => validatePublishedTemplates(publishedFixture()));
  const invalid = [
    {schema: "1", templates: []}, {schema: 1, templates: publishedFixture().templates.slice(0, 4)},
    ...["id", "repository", "repositoryId", "visibility", "isTemplate", "defaultBranch", "commit", "tree"].map(field => {
      const snapshot = publishedFixture();
      snapshot.templates[0][field] = field === "repositoryId" ? "1" : field === "commit" || field === "tree" ? 1 : null;
      return snapshot;
    }),
  ];
  const duplicate = publishedFixture();
  duplicate.templates[1] = duplicate.templates[0];
  invalid.push(duplicate);
  const directory = await fixture(t);
  for (const snapshot of invalid) {
    assert.throws(() => validatePublishedTemplates(snapshot));
    await writeFile(path.join(directory, "website/content/project-templates.json"), JSON.stringify(snapshot));
    await assert.rejects(prepareExampleProjects({root: directory}));
    await assert.rejects(lstat(path.join(directory, "dist/example-projects")), {code: "ENOENT"});
  }
  await rm(path.join(directory, "website/content/project-templates.json"));
  await assert.rejects(prepareExampleProjects({root: directory}), {code: "ENOENT"});
  await symlink(path.join(root, "website/content/project-templates.json"), path.join(directory, "website/content/project-templates.json"));
  await assert.rejects(prepareExampleProjects({root: directory}), /ordinary file/);
});

test("template app previews must be exact ordinary source files", async t => {
  const directory = await fixture(t);
  const id = featuredProjectIds[0];
  const preview = path.join(directory, `website/public/example-previews/${id}.png`);
  await rm(preview);
  const options = {root: directory, example: examples.find(example => example.id === id), template: templateDefinition(id)};
  await assert.rejects(buildExampleProject(options), {code: "ENOENT"});
  await symlink(path.join(root, `website/public/example-previews/${id}.png`), preview);
  await assert.rejects(buildExampleProject(options), /ordinary file/);
});
