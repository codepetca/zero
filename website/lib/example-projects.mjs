import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import archivePolicy from "../../extension/src/sharing/archive.js";
import { examples } from "./learning.mjs";
import { coreSources } from "../../scripts/prepare-starter.mjs";
import core from "../../extension/src/core-contract.js";
import { courseStarterId, projectGuides } from "./project-curriculum.mjs";
import { templateDefinition, validatePublishedTemplates, publishedTemplate } from "./project-templates.mjs";

const { normalizeGameFiles, inspectGamePackage, safeGamePath } = archivePolicy;
const scaffolding = [
  "pom.xml", "mvnw", "mvnw.cmd", ".mvn/wrapper/maven-wrapper.properties",
  ".mvn/wrapper/LICENSE-APACHE-2.0.txt", ".mvn/wrapper/NOTICE",
  ".vscode/tasks.json", ".vscode/extensions.json", ".gitignore",
];

// Read only named, ordinary source files. No source-tree traversal or generated
// starter copies: a missing source or symlink fails preparation visibly.
async function sourceBytes(root, relative) {
  safeGamePath(relative);
  const parts = relative.split("/");
  for (let index = 1; index <= parts.length; index++) {
    const info = await lstat(path.join(root, ...parts.slice(0, index)));
    if (info.isSymbolicLink() || (index === parts.length ? !info.isFile() : !info.isDirectory())) {
      throw new Error(`Example source must be an ordinary file: ${relative}`);
    }
  }
  return readFile(path.join(root, relative));
}

const courseStarter = {
  id: courseStarterId,
  title: "New Project",
  description: "A minimal working Java starter for your own original app.",
  repositoryUrl: "https://github.com/codepetca/zero/tree/main/student-template",
};

function trustedTemplate(template, id) {
  if (template === null) return null;
  const definition = templateDefinition(id);
  if (!template || template.id !== id || template.repository !== definition.repository
    || template.repositoryUrl !== definition.repositoryUrl || template.templateHref !== definition.templateHref) {
    throw new Error("Invalid project template definition");
  }
  return definition;
}

function templateSetup(template) {
  return `## Create your own repository and clone it

1. Open [Use this template](${template.templateHref}), then choose **Create a new
   repository**. Select your personal account as owner, choose your own project
   name and follow your teacher's visibility instructions.
2. Open the repository you just created in your own account. Choose **Code →
   HTTPS** and copy its URL. Sign in to Zero and choose **Project → Clone from GitHub…**.
   Paste your URL in **Clone from GitHub**. In **Clone location**, keep the default
   ~/Zero Projects or choose another folder outside any Git repository, then
   choose **Clone here**. Newer VS Code versions open a new window automatically;
   the VS Code 1.95 fallback may ask for **Open in New Window**.

Terminal alternative with your own account and repository name:

\`\`\`sh
git clone https://github.com/YOUR-USERNAME/YOUR-PROJECT.git
cd YOUR-PROJECT
\`\`\`

   Replace both placeholders with your own account and repository name. These
   commands work in macOS Terminal and Windows PowerShell with Git installed.
3. The cloned root opens in Zero (the configured VS Code editor). For an
   already-cloned Zero folder, choose **Project → Open local project…** to open
   a new window without cloning again.
4. Choose Run App in the Zero sidebar.

Your own GitHub repository already contains the starter baseline on **main**.
The clone already connects to your own repository as origin.

## ZIP alternative

If you downloaded a ZIP instead, extract it into its own folder and open that
root folder in Zero. A ZIP has no Git history. Create your own empty GitHub
repository, leaving README, license and gitignore uninitialized. Sign in through
Zero and use **Project → Connect to GitHub…** with your own
repository's HTTPS URL, then review **Commit & push** on **main** for the initial
project. Connection alone does not push files.
`;
}

function templateWorkflow() {
  return `## Your GitHub repository and Pika

1. Sign in through the account control in Zero’s sidebar using your personal account.
   Configure Git's per-repository name/email identity manually; signing in does
   not configure commit identity. Real pushes require native GitHub sign-in.
   GitHub actions are live by default; nothing pushes automatically. Check the
   account, repository and branch before submitting a name or commit message.
2. Personalize this README with your project idea and a short change plan.
   If edits are pending, use **Commit & push** on **main** before starting a
   change. Check your repository, branch and changed files, then enter a commit
   message to commit and push.
3. With clean committed main, choose **New branch** in the repository menu and enter its name. Edit the Java, choose **Run App**, and check the behavior you changed.
4. **Commit & push** creates a commit when needed and pushes the current branch.
   Use an explanatory commit message. Review the destination
   and changed files. Commit & push any pending edits before finishing.
5. Click **Merge to main** beside your branch to merge and push the completed change.
   If Zero brings in newer main code, Run App again, then click Merge to main again.
   Merge to main merges the current branch into main and pushes main; it does not create a pull request.
6. Check your actual files on GitHub's **main** branch. Submit your own repository
   link separately in Pika, giving your teacher access if it is private.

Run App does not require GitHub sign-in. Ask your teacher for help with setup,
conflicts or failed pushes. See the [repository and push guide](https://github.com/codepetca/zero/blob/main/docs/GETTING-STARTED.md#your-individual-workflow).
`;
}

function repositoryWorkflow() {
  return `## Your GitHub repository and Pika

1. Create your own empty GitHub repository in your personal account. Follow your
   teacher's visibility instructions; leave README, license and gitignore
   uninitialized. This downloaded ZIP becomes the files in your repository.
2. Sign in through the account control in Zero’s sidebar. Use **Project → Connect to GitHub…** with your own repository's HTTPS URL. Connection
   alone does not push files.
3. Configure Git's per-repository name/email identity. Real pushes require
   native GitHub sign-in. GitHub actions are live by default; nothing pushes
   automatically. Check the account, repository and branch before submitting a name
   or commit message.
4. Use **Commit & push** on **main** for the initial project. Write a commit
   message after checking the repository, branch and files; submitting it proceeds
   with the commit and push.
5. For an improvement, choose **New branch** in the repository menu and enter its name.
   Edit the Java, choose **Run App**, and check the behavior you changed.
6. **Commit & push** creates a commit when needed and pushes the current branch.
   Use an explanatory commit message, such as "Add feedback
   after an incorrect answer". Review the destination and changed files.
7. Click **Merge to main** beside your branch to merge and push main.
   If Zero brings in newer main code, Run App again, then click Merge to main again.
8. Check your actual files on GitHub's **main** branch. Submit your own repository
   link separately in Pika, giving your teacher access if it is private.

Run App does not require GitHub sign-in. Ask your teacher for help with setup,
conflicts or failed pushes. See the [repository and push guide](https://github.com/codepetca/zero/blob/main/docs/GETTING-STARTED.md#your-individual-workflow).
`;
}

function readme(project, { starter = false, template = null } = {}) {
  const guide = starter ? null : projectGuides[project.id];
  const title = guide?.title ?? project.title;
  const projectPlan = starter ? `## Plan your course project

Choose an original idea that matters to you: an app, game, drawing or simulation.
Replace this README's title and introduction with your idea, intended user and
what the first working version should do. Add a short change plan with a few small
steps; build and verify one step at a time. Start by changing the greeting in
\`src/main/java/Main.java\`, then grow your own project using the tutorials.

` : guide ? `## Try one change

${guide.challenge}

` : "";
  const repositoryUrl = template?.repositoryUrl ?? (starter ? project.repositoryUrl
    : `https://github.com/codepetca/zero/tree/main/student-template/examples/${project.id}`);
  return `# ${title}

${project.description}

This is a complete editable Zero project.

${template && !starter ? `![${title} app preview](preview.png)\n\n` : ""}${template ? templateSetup(template) : `1. Extract the downloaded ZIP into its own folder.
2. Sign in to Zero and choose **Project → Open local project…** to open that Zero folder in a new window.
3. Choose Run App in the Zero sidebar.`}

A supported JDK 17 or later is required. Read and edit the Java files in
\`src/main/java\`; the Zero framework source is included in its \`zero\` folder.

From a terminal in this project folder, run:

macOS:

\`\`\`sh
./mvnw clean compile javafx:run
\`\`\`

Windows PowerShell:

\`\`\`powershell
.\\mvnw.cmd clean compile javafx:run
\`\`\`

The pinned Maven wrapper downloads build tools and JavaFX dependencies on the
first run. You can also run \`./mvnw clean compile\` (or
\`.\\mvnw.cmd clean compile\`) to check your code without opening the app.

${projectPlan}${starter || guide ? (template ? templateWorkflow() : repositoryWorkflow()) + "\n" : ""}Canonical ${starter ? "starter" : "example"} source: ${repositoryUrl}
`;
}

async function scaffoldInventory(root) {
  const inventory = [];
  for (const file of scaffolding) {
    inventory.push({ path: file, data: await sourceBytes(root, `student-template/${file}`) });
  }
  inventory.push({ path: "LICENSE", data: await sourceBytes(root, "LICENSE") });
  for (const name of coreSources) {
    inventory.push({ path: `src/main/java/zero/${name}`, data: await sourceBytes(root, `framework/src/main/java/zero/${name}`) });
  }
  inventory.push({path:'zero-core.json',data:Buffer.from(JSON.stringify(core.makeCoreRecord(Object.fromEntries(
    inventory.filter(file => core.coreSourcePaths.includes(file.path)).map(file => [file.path,file.data]))),null,2) + '\n')});
  return inventory;
}

// Both kinds of downloads use exactly the same archive policy and pinned build
// scaffold, with explicit manifests rather than source-tree traversal.
function packageProject(inventory, project, options) {
  inventory.push({ path: "zero.json", data: Buffer.from(JSON.stringify({ name: project.title, templateVersion: "0.1.0", mainClass: "Main" }, null, 2) + "\n") });
  inventory.push({ path: "README.md", data: Buffer.from(readme(project, options)) });
  const files = normalizeGameFiles(inventory);
  if (files.length !== inventory.length) throw new Error("Example manifest contains a file outside the game package policy");
  const zipped = Object.create(null);
  for (const file of files) {
    zipped[file.path] = [file.data, { os: 3, attrs: file.mode << 16, mtime: new Date(1980, 0, 1), level: 6 }];
  }
  const bytes = Buffer.from(zipSync(zipped));
  inspectGamePackage(bytes);
  return { files, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

/** Assemble the minimal course project from canonical Main and the scaffold. */
export async function buildCourseStarter({ root, template = null }) {
  template = trustedTemplate(template, courseStarterId);
  root = path.resolve(root);
  const inventory = await scaffoldInventory(root);
  inventory.push({ path: "src/main/java/Main.java", data: await sourceBytes(root, "student-template/src/main/java/Main.java") });
  return packageProject(inventory, courseStarter, { starter: true, template });
}

/** Assemble one manifest's complete project, then validate its actual ZIP using
 * the same pinned-wrapper, path, POM, tasks and mode policy as shared games. */
export async function buildExampleProject({ root, example, template = null }) {
  if (!example || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(example.id)
    || typeof example.title !== "string" || !example.title.trim() || example.title.length > 120
    || typeof example.description !== "string" || !Array.isArray(example.files) || !example.files.length) {
    throw new Error("Invalid example project manifest");
  }
  template = trustedTemplate(template, example.id);
  root = path.resolve(root);
  const inventory = await scaffoldInventory(root);
  const copy = async (source, destination) => inventory.push({ path: destination, data: await sourceBytes(root, source) });
  for (const file of example.files) {
    safeGamePath(file);
    if (!file.endsWith(".java")) throw new Error("Example Java manifest must name Java source");
    await copy(`student-template/examples/${file}`, `src/main/java/${path.posix.basename(file)}`);
  }
  for (const resource of example.resources ?? []) {
    safeGamePath(resource.file);
    safeGamePath(resource.destination);
    if (!resource.destination.startsWith("src/main/resources/")) throw new Error("Example resources must use src/main/resources");
    await copy(`student-template/examples/${resource.file}`, resource.destination);
  }
  if (template) await copy(`website/public/example-previews/${example.id}.png`, "preview.png");
  return packageProject(inventory, example, { template });
}

async function ordinaryDirectory(directory, create = true) {
  const absolute = path.resolve(directory);
  // Refuse symlinked output ancestors before touching generated files.
  for (let current = absolute; ; current = path.dirname(current)) {
    const info = await lstat(current).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Example output must be an ordinary directory: ${current}`);
    if (path.dirname(current) === current) break;
  }
  if (create) await mkdir(absolute, { recursive: true });
}

async function ordinaryGeneratedFile(target) {
  const info = await lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error(`Generated example asset must be an ordinary file: ${target}`);
}

async function generatedFile(target, data) {
  await ordinaryGeneratedFile(target);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: "wx", mode: 0o644 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function prepareExampleProjects({ root, projectDirectory = path.join(root, "dist/example-projects"), requirePreviews = false }) {
  root = path.resolve(root);
  const assetDirectory = path.join(root, "website/public/generated/example-projects");
  const snapshotDirectory = path.join(root, "website/.generated");
  // Finish source validation before replacing any generated output.
  const publication = validatePublishedTemplates(JSON.parse((await sourceBytes(root, "website/content/project-templates.json")).toString("utf8")));
  const built = [{ example: courseStarter, template: publishedTemplate(publication, courseStarterId),
    project: await buildCourseStarter({ root, template: publishedTemplate(publication, courseStarterId) }) }];
  for (const example of examples) {
    const template = publishedTemplate(publication, example.id);
    built.push({ example, template, project: await buildExampleProject({ root, example, template }) });
  }
  const previewImages = new Map();
  for (const example of examples) {
    const preview = path.join(root, "website/public/example-previews", `${example.id}.png`);
    const info = await lstat(preview).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (requirePreviews && (!info?.isFile() || info.isSymbolicLink())) throw new Error(`Example preview missing or not an ordinary file: ${example.id}`);
    const images = [{ src: `/example-previews/${example.id}.png`, alt: `${example.title} app preview` }];
    if (["composed-study", "composed-game"].includes(example.id)) {
      const started = await lstat(path.join(root, "website/public/example-previews", `${example.id}-started.png`)).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (started?.isFile() && !started.isSymbolicLink()) images.push({ src: `/example-previews/${example.id}-started.png`, alt: `${example.title} after starting` });
    }
    previewImages.set(example.id, images);
  }
  const projects = [];
  let starter;
  // Check all existing output paths before creating directories or replacing a
  // project. A linked ZIP or snapshot must leave the entire previous set intact.
  for (const directory of [projectDirectory, assetDirectory, snapshotDirectory]) await ordinaryDirectory(directory, false);
  for (const { example } of built) {
    await ordinaryDirectory(path.join(projectDirectory, example.id), false);
    await ordinaryGeneratedFile(path.join(assetDirectory, `${example.id}.zip`));
  }
  await ordinaryGeneratedFile(path.join(snapshotDirectory, "example-projects.json"));
  await ordinaryDirectory(projectDirectory);
  await ordinaryDirectory(assetDirectory);
  await ordinaryDirectory(snapshotDirectory);
  for (const { example, project, template } of built) {
    const destination = path.join(projectDirectory, example.id);
    const info = await lstat(destination).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Example output must be an ordinary directory: ${destination}`);
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination);
    for (const file of project.files) {
      const target = path.join(destination, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.data, { flag: "wx", mode: file.mode & 0o777 });
      await chmod(target, file.mode & 0o777);
    }
    await generatedFile(path.join(assetDirectory, `${example.id}.zip`), project.bytes);
    const entry = {
      id: example.id, title: example.title, description: example.description,
      repositoryUrl: template?.repositoryUrl ?? example.repositoryUrl ?? `https://github.com/codepetca/zero/tree/main/student-template/examples/${example.id}`,
      projectHref: `/generated/example-projects/${example.id}.zip`,
      images: previewImages.get(example.id) ?? [],
      size: project.size, sha256: project.sha256,
    };
    if (template) entry.templateHref = template.templateHref;
    if (example.id === courseStarterId) starter = entry;
    else projects.push(entry);
  }
  const snapshot = { schema: 1, starter, projects };
  await generatedFile(path.join(snapshotDirectory, "example-projects.json"), JSON.stringify(snapshot, null, 2) + "\n");
  return snapshot;
}
