import {coreSources} from './prepare-starter.mjs';
import core from '../extension/src/core-contract.js';
import {projectBuilderFilesSync} from './prepare-project-builder.mjs';
import {readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, existsSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';

const repository = fileURLToPath(new URL('../', import.meta.url));
import {practiceProjects, sampleGameAssets, petAssets, publishedTutorialTemplate} from '../teaching/projects.mjs';
function read(root, relative) {
  const parts = relative.split('/');
  if (path.isAbsolute(relative) || parts.some(p => !p || p === '.' || p === '..')) throw new Error(`Invalid maintained lesson path: ${relative}`);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`No symlinks in maintained lessons: ${relative}`);
  }
  if (!lstatSync(current).isFile()) throw new Error(`Expected maintained file: ${relative}`);
  return readFileSync(current);
}
// One minimal scaffold per continuing project. Finished programs and lesson
// references are never copied into the learner's project.
export function lessonProjects(root = repository) {
  const common = new Map();
  const add = (files, filename, bytes, mode = 0o644) => files.set(filename, {path:filename, content:Buffer.from(bytes).toString('base64'), mode});
  for (const name of ['pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties','.mvn/wrapper/LICENSE-APACHE-2.0.txt','.mvn/wrapper/NOTICE','.vscode/tasks.json']) add(common, name, read(root, `student-template/${name}`), name === 'mvnw' ? 0o755 : 0o644);
  const settings = JSON.parse(read(root, 'student-template/.vscode/settings.json'));
  settings['git.enabled'] = true;
  add(common, '.vscode/settings.json', JSON.stringify(settings, null, 2) + '\n');
  add(common, '.gitignore', read(root, 'student-template/.gitignore'));
  // Published tutorial scaffolds retain their verified historical MIT notice.
  add(common, 'LICENSE', read(root, 'scripts/tutorial-license-MIT.txt'));
  for (const name of coreSources) add(common, `src/main/java/zero/${name}`, read(root, `framework/src/main/java/zero/${name}`));
  for (const file of projectBuilderFilesSync({sourceRoot:root})) add(common,'.zero-build/' + file.path,file.bytes);
  add(common, 'zero-core.json', JSON.stringify(core.makeCoreRecord(Object.fromEntries(core.coreSourcePaths.map(name =>
    [name, Buffer.from(common.get(name).content,'base64')]))),null,2) + '\n');
  const projects = practiceProjects.map(project => {
    const files = new Map(common);
    add(files, 'src/main/java/Main.java', read(root, `teaching/starters/${project.kind}/Main.java`));
    add(files, 'zero.json', JSON.stringify({name:project.title,templateVersion:'0.1.0',mainClass:'Main',repositoryRequired:true,tutorialProjectId:project.id,lessonId:project.firstLesson}, null, 2) + '\n');
    add(files, 'README.md', `# ${project.title}\n\nBefore lesson 0, have your own verified GitHub account, Git 2.31+ and school-approved access/privacy. Read the [account and privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy). Choose Private unless teacher/school policy says otherwise, invite your teacher as a collaborator and verify access; collaborators can edit. Use a teacher-approved commit identity and the exact GitHub noreply email for email privacy. Publishing is optional/public; private-repository Pages depends on the plan. No paid plan is needed for tutorial source work.\n\nCreate your own GitHub repository from the published tutorial template, then copy YOUR repository’s HTTPS URL. Sign in to Zero and choose **Project → Clone from GitHub…**. Paste that URL in **Clone from GitHub**. In **Clone location**, keep the default ~/Zero Projects or choose another folder outside any Git repository, then choose **Clone here**. Zero opens the clone in the current window. For an already-cloned Zero folder, use **Project → Open local project…** to open it in the current window without cloning again. A ZIP or a folder inside another repository cannot start this tutorial.\n\nKeep using your repository for lessons ${project.lessons[0]}–${project.lessons.at(-1)} as you write your own code. The scaffold contains only setup and an empty Main; the first run opens a blank window or canvas.\n\nOpen src/main/java/Main.java and read the [first lesson](https://zero.codepet.ca/tutorials/${project.firstLesson}). After edits, click **Run App again**. Run uses local Git checks and needs no GitHub sign-in. Sign in when you want to Commit & push, start a New branch, or Merge to main. Submit your repository link separately in Pika.\n\nLesson 11 uses the tutorial-credits-badge practice library from the Coin game. Keep other ZeroHub contributions in a separate original project.\n`);
    if (project.id === 'pet') add(files, 'README.md', '# Animated pet\n\nBefore starting, complete the [account/privacy and Zero setup](https://zero.codepet.ca/help/setup). Create your own repository from this template. On Zero’s Start Page, choose Project → Clone, enter YOUR repository URL and choose Clone here.\n\nThe scaffold contains only setup and an empty Main; the first run opens a blank window or canvas. You write the pet, animation and input. Follow [the animated pet lesson](https://zero.codepet.ca/tutorials/13) when the updated tutorials are available, including its separate asset download and attribution. Ask your teacher if the lesson or assets are not available yet. Keep completed checkpoint programs outside this starter.\n\nRun App after each change. Commit & push meaningful checkpoints; review the account, repository and visibility before publishing. Submit your own repository link separately in Pika.\n');
    return {id:project.id,lesson:project.firstLesson,title:project.title,folder:`zero-project-${project.id}`,template:publishedTutorialTemplate(project.id),files:[...files.values()].sort((a,b) => a.path.localeCompare(b.path))};
  });
  return {schema:2, projects};
}
export function gameAssetFiles(root = repository) {
  return sampleGameAssets.files.map(filename => ({path:filename,content:read(root, `student-template/examples/media-demo/resources/${filename}`).toString('base64'),mode:0o644}));
}
export function petAssetFiles(root = repository) {
  return petAssets.files.map(filename => ({path:filename,content:read(root, `teaching/new-curriculum/pet/resources/${filename}`).toString('base64'),mode:0o644}));
}

const crcTable = Array.from({length:256}, (_, index) => {
  let crc = index; for (let bit=0; bit<8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;}
// ZIP32 with explicit UNIX modes, fixed timestamps and UTF-8 names. No request
// paths or user data are inputs. Avoid a second website compression dependency.
export function lessonProjectZip(project) {
  const local = [], central = []; let offset = 0;
  for (const file of project.files) {
    const name = Buffer.from(project.folder ? `${project.folder}/${file.path}` : file.path), bytes = Buffer.from(file.content, 'base64'), compressed = deflateRawSync(bytes), crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6); header.writeUInt16LE(8,8); header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14); header.writeUInt32LE(compressed.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(name.length,26);
    local.push(header,name,compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50,0); record.writeUInt16LE(0x314,4); record.writeUInt16LE(20,6); record.writeUInt16LE(0x800,8); record.writeUInt16LE(8,10); record.writeUInt16LE(33,14);
    record.writeUInt32LE(crc,16); record.writeUInt32LE(compressed.length,20); record.writeUInt32LE(bytes.length,24); record.writeUInt16LE(name.length,28);
    record.writeUInt32LE(((0o100000 | file.mode) << 16) >>> 0,38); record.writeUInt32LE(offset,42); central.push(record,name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(project.files.length,8); end.writeUInt16LE(project.files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
export function prepareLessonProjects(root = repository, {extension = true, website = false} = {}) {
  const bundle = lessonProjects(root);
  if (extension) {
    const destination = path.join(root, 'extension/media/lesson-projects.json');
    mkdirSync(path.dirname(destination), {recursive:true}); writeFileSync(destination, JSON.stringify(bundle) + '\n');
  }
  if (website) {
    // These are generated build artifacts, never student folders. Remove the old
    // generated lesson variants so a local rebuild exposes only the new path.
    const oldDirectory = path.join(root, 'website/public/generated/lessons');
    if (existsSync(oldDirectory)) {
      if (lstatSync(oldDirectory).isSymbolicLink()) throw new Error('Generated lesson directory must not be a symlink.');
      for (const entry of readdirSync(oldDirectory, {withFileTypes:true})) {
        if (entry.isFile() && /^zero-lesson-(?:[0-9]|1[0-2]|10-game|12-(?:scrolling|platforms|levels|full))\.zip$/.test(entry.name)) unlinkSync(path.join(oldDirectory,entry.name));
      }
    }
    // Tutorial entry uses the published template + clone flow exclusively.
    // Remove only known stale generated scaffold ZIPs from earlier local builds.
    for (const project of bundle.projects) {
      const destination = path.join(root, `website/public/generated/projects/${project.folder}.zip`);
      if (existsSync(destination)) {
        if (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink()) throw new Error('Generated tutorial ZIP must be an ordinary file.');
        unlinkSync(destination);
      }
    }
    const assetDestination = path.join(root, 'website/public',sampleGameAssets.href.slice(1));
    mkdirSync(path.dirname(assetDestination), {recursive:true});
    writeFileSync(assetDestination, lessonProjectZip({folder:'',files:gameAssetFiles(root)}));
    const petDestination = path.join(root, 'website/public',petAssets.href.slice(1));
    mkdirSync(path.dirname(petDestination), {recursive:true});
    writeFileSync(petDestination, lessonProjectZip({folder:'',files:petAssetFiles(root)}));
  }
  return bundle;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = prepareLessonProjects(); console.log(`Prepared ${bundle.projects.length} minimal continuing-project starters.`);
}
