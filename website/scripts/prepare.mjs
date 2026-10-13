import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lessonAssets } from "../lib/learning.mjs";
import { validateInstallerManifest } from "../lib/installer.mjs";
import { validateManifest, validatePublishedKit } from "../lib/contracts.mjs";
import { prepareDesign } from "../../design/prepare.mjs";
import { prepareLessonProjects } from "../../scripts/lesson-projects.mjs";
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(site, "..");
const documentPaths = {
  teachers: "student-template/lessons/TEACHER.md",
  "lesson-guide": "student-template/lessons/README.md",
  "lesson-0": "student-template/lessons/00-hello-world.md",
  "lesson-1": "student-template/lessons/01-hello-button.md",
  "lesson-2": "student-template/lessons/02-hello-name.md",
  "lesson-3": "student-template/lessons/03-quiz.md",
  "lesson-4": "student-template/lessons/04-counter.md",
  "lesson-5": "student-template/lessons/05-methods.md",
  "lesson-6": "student-template/lessons/06-objects.md",
  "lesson-7": "student-template/lessons/07-study-app.md",
  "lesson-8": "student-template/lessons/08-movement.md",
  "lesson-9": "student-template/lessons/09-coin-game.md",
  "lesson-10": "student-template/lessons/10-components.md",
  "lesson-11": "student-template/lessons/11-zerohub.md",
  "lesson-12": "student-template/lessons/12-media.md",
  setup: "docs/GETTING-STARTED.md",
  api: "student-template/API.md",
  beginner: "student-template/BEGINNER.md",
  style: "student-template/STYLE.md",
  ui: "student-template/UI.md",
  starter: "docs/GETTING-STARTED.md",
  exercises: "student-template/EXERCISES.md",
  components: "docs/COMPONENTS.md",
  verification: "docs/VERIFICATION.md",
  pilot: "docs/CLASSROOM-PILOT.md",
  development: "docs/DEVELOPMENT.md",
  product: "docs/PRODUCT.md",
};
const docs = {};
for (const [slug, source] of Object.entries(documentPaths))
  docs[slug] = {
    source,
    markdown: await readFile(resolve(root, source), "utf8"),
  };
// Preserve links from immutable packaged lesson sources to the hosted setup guide.
docs.starter.aliases = {
  "student-template/README.md": {
    "first-setup": "one-time-setup",
    "your-repository-and-pika": "your-individual-workflow",
  },
};
// Build-time allowlist only: no request ever reads arbitrary repository paths.
const sources = {};
async function collect(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) await collect(file);
    else if (entry.isFile() && /\.(java|md|css)$/.test(file))
      sources[file] = await readFile(resolve(root, file), "utf8");
  }
}
await collect("student-template/examples");
await collect("teaching/checkpoints");
await collect("docs");
for (const doc of Object.values(docs)) sources[doc.source] = doc.markdown;
for (const file of [
  "student-template/pom.xml",
  "student-template/zero.json",
  "LICENSE",
  "README.md",
])
  sources[file] = await readFile(resolve(root, file), "utf8");
for (const name of ["SimpleApp", "SketchApp"])
  sources[`student-template/src/main/java/zero/${name}.java`] = await readFile(
    resolve(root, `framework/src/main/java/zero/${name}.java`),
    "utf8",
  );
const release = validateManifest(
  JSON.parse(await readFile(resolve(root, "release/kit.json"), "utf8")),
);
let publishedKit = null;
try {
  publishedKit = validatePublishedKit(JSON.parse(await readFile(resolve(root, "release/published-kit.json"), "utf8")), release);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let installer = null;
try {
  installer = validateInstallerManifest(JSON.parse(await readFile(resolve(root, "release/installer.json"), "utf8")), release);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(resolve(site, ".generated"), { recursive: true });
await prepareDesign({ website: true, extension: false });
prepareLessonProjects(root, { website: true, extension: false });
await mkdir(resolve(site, "public/generated"), { recursive: true });
await writeFile(
  resolve(site, ".generated/content.json"),
  JSON.stringify({ release, publishedKit, installer, docs, sources }, null, 2) + "\n",
);
// Reuse supplied paths exactly; only the approved logo colour changes.
const logo = (
  await readFile(resolve(root, "extension/media/zero.svg"), "utf8")
).replaceAll("currentColor", "#683BEF");
await writeFile(resolve(site, "public/generated/zero.svg"), logo);
await copyFile(
  resolve(root, "docs/design/actual-zero-editor.png"),
  resolve(site, "public/generated/editor.jpg"),
);
await copyFile(
  resolve(site, "node_modules/bootstrap-icons/icons/download.svg"),
  resolve(site, "public/generated/download.svg"),
);
console.log(
  `Prepared release ${release.kitVersion} and ${Object.keys(docs).length} canonical documents.`,
);

for (const [source, url] of Object.entries(lessonAssets)) {
  const output = resolve(site, "public", url.slice(1));
  await mkdir(dirname(output), { recursive: true });
  await copyFile(resolve(root, source), output);
}
