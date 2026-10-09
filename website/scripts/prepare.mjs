import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "../lib/contracts.mjs";
import { validateCommunityManifest } from "../lib/community.mjs";
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(site, "..");
const documentPaths = {
  teachers: "student-template/lessons/TEACHER.md",
  "lesson-guide": "student-template/lessons/README.md",
  "lesson-1": "student-template/lessons/01-quiz.md",
  "lesson-2": "student-template/lessons/02-objects.md",
  "lesson-3": "student-template/lessons/03-study.md",
  "lesson-4": "student-template/lessons/04-animation.md",
  "lesson-5": "student-template/lessons/05-keyboard.md",
  "lesson-6": "student-template/lessons/06-project.md",
  setup: "docs/GETTING-STARTED.md",
  api: "student-template/API.md",
  starter: "student-template/README.md",
  exercises: "student-template/EXERCISES.md",
  components: "docs/COMPONENTS.md",
  workshop: "component-workshop/README.md",
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
// Build-time allowlist only: no request ever reads arbitrary repository paths.
const sources = {};
async function collect(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) await collect(file);
    else if (entry.isFile() && /\.(java|md)$/.test(file))
      sources[file] = await readFile(resolve(root, file), "utf8");
  }
}
await collect("student-template/examples");
await collect("docs");
for (const doc of Object.values(docs)) sources[doc.source] = doc.markdown;
for (const file of [
  "student-template/pom.xml",
  "student-template/zero.json",
  "LICENSE",
  "README.md",
  "component-workshop/README.md",
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
const community = validateCommunityManifest(
  JSON.parse(await readFile(resolve(root, "release/community.json"), "utf8")),
);
await mkdir(resolve(site, ".generated"), { recursive: true });
await mkdir(resolve(site, "public/generated"), { recursive: true });
await writeFile(
  resolve(site, ".generated/content.json"),
  JSON.stringify({ release, community, docs, sources }, null, 2) + "\n",
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
