'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./core-contract');

const PROJECT_LESSONS = new Map([['greeting','0'],['study','3'],['game','8']]);
const PROJECT_FILES = new Set(['zero-core.json','zero.json','.gitignore','README.md','LICENSE','pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties','.mvn/wrapper/LICENSE-APACHE-2.0.txt','.mvn/wrapper/NOTICE','.vscode/tasks.json','.vscode/settings.json','src/main/java/Main.java','src/main/java/zero/App.java','src/main/java/zero/GameApp.java','src/main/java/zero/Actor.java','src/main/java/zero/ImageRegion.java','src/main/java/zero/SpriteAnimation.java','src/main/java/zero/Collisions.java','src/main/java/zero/Sound.java','src/main/java/zero/Music.java','src/main/java/zero/Color.java','src/main/java/zero/Key.java','src/main/java/zero/ui/Element.java','src/main/java/zero/ui/Label.java','src/main/java/zero/ui/Button.java','src/main/java/zero/ui/Column.java','src/main/java/zero/ui/Row.java','src/main/java/zero/ui/TextField.java']);
const LOCAL_MESSAGE = 'This is local lesson practice. Create your own separate student project before using GitHub or sharing.';
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const MAX_FILES = 500, MAX_PROJECT_BYTES = 4 * 1024 * 1024, MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const safePart = value => typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' && !/[\\/\x00-\x1f:<>"|?*]/.test(value) && !/[ .]$/.test(value) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value);
function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) return false;
  return value.split('/').every(part => safePart(part) && part !== '.git');
}
function decode(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('The lesson bundle contains invalid file data.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('The lesson bundle contains invalid file data.');
  return bytes;
}
function validateTemplate(value, id) {
  if (value === null) return null;
  const repository = `codepetca/zero-tutorial-${id}`;
  const repositoryUrl = `https://github.com/${repository}`;
  if (!isRecord(value) || value.repository !== repository || value.repositoryUrl !== repositoryUrl || value.templateHref !== `${repositoryUrl}/generate`) throw new Error('The tutorial bundle has invalid published template metadata.');
  return {repository, repositoryUrl, templateHref:value.templateHref};
}
async function tutorialMarker(root) {
  const text = await fs.readFile(path.join(root, 'zero.json'), 'utf8').catch(error => {if (error.code === 'ENOENT') return null; throw error;});
  if (text === null) return null;
  let data; try {data = JSON.parse(text);} catch {throw new Error('This project’s zero.json is damaged. Restore its project marker or start a new project.');}
  if (!isRecord(data)) throw new Error('This project’s zero.json must contain a valid project marker.');
  if (data.tutorialProjectId === undefined && data.repositoryRequired === undefined) return null;
  if (!PROJECT_LESSONS.has(data.tutorialProjectId) || data.repositoryRequired !== true || data.lessonId !== PROJECT_LESSONS.get(data.tutorialProjectId) || data.localOnly !== undefined || data.practiceProjectId !== undefined) throw new Error('This project’s zero.json has an invalid tutorial repository marker. Restore its project marker or start a new project.');
  return data;
}
async function assertOriginalProject(root) {
  await assertShareable(root);
  if (await tutorialMarker(root)) throw new Error('Keep this tutorial repository for learning. Create a separate original project before contributing a game or library to ZeroHub.');
}
function validateBundle(bundle) {
  if (!isRecord(bundle) || bundle.schema !== 2 || !Array.isArray(bundle.projects) || bundle.projects.length !== PROJECT_LESSONS.size) throw new Error('The lesson bundle is unavailable or invalid. Reinstall the Zero extension.');
  const ids = new Set();
  return bundle.projects.map(project => {
    if (!isRecord(project) || !PROJECT_LESSONS.has(project.id) || ids.has(project.id) || typeof project.title !== 'string' || !project.title.trim() || project.folder !== `zero-project-${project.id}` || project.lesson !== PROJECT_LESSONS.get(project.id) || !Array.isArray(project.files) || !project.files.length || project.files.length > MAX_FILES) throw new Error('The lesson bundle contains an invalid project.');
    ids.add(project.id);
    const template = validateTemplate(project.template, project.id);
    const files = new Set(); let marker = false, ignored = false, settings = false, projectBytes = 0;
    const validated = project.files.map(file => {
      if (!isRecord(file) || !safeRelative(file.path) || !PROJECT_FILES.has(file.path) || files.has(file.path) || ![420,493].includes(file.mode)) throw new Error('The lesson bundle contains an unsafe file path or mode.');
      const portable = file.path.toLowerCase();
      if (files.has(portable)) throw new Error('The lesson bundle contains duplicate file paths.');
      files.add(portable);
      const content = decode(file.content);
      projectBytes += content.length; if (projectBytes > MAX_PROJECT_BYTES) throw new Error('The lesson bundle is too large.');
      if (file.path === '.gitignore') {
        const lines = content.toString('utf8').split(/\r?\n/).map(line => line.trim());
        if (lines.includes('*') || !lines.some(line => line === 'target/' || line === '/target/')) throw new Error('The tutorial bundle must track student source and ignore build output.');
        ignored = true;
      }
      if (file.path === 'zero.json') {
        const parsed = JSON.parse(content.toString('utf8'));
        if (parsed.localOnly !== undefined || parsed.practiceProjectId !== undefined || parsed.repositoryRequired !== true || parsed.lessonId !== project.lesson || parsed.tutorialProjectId !== project.id || parsed.mainClass !== 'Main' || parsed.templateVersion !== '0.1.0') throw new Error('The lesson bundle has an invalid tutorial repository marker.');
        marker = true;
      }
      if (file.path === '.vscode/settings.json') {if (JSON.parse(content.toString('utf8'))['git.enabled'] !== true) throw new Error('The tutorial bundle must enable Git.'); settings = true;}
      return {path:file.path,content,mode:file.mode};
    });
    const coreFile = validated.find(file => file.path === 'zero-core.json');
    if (!coreFile) throw new Error('The lesson bundle is missing its core record.');
    core.validateCoreRecord(JSON.parse(core.normalizeSource(coreFile.content)),Object.fromEntries(
      validated.filter(file => core.coreSourcePaths.includes(file.path)).map(file => [file.path,file.content])));
    if (!marker || !ignored || !settings) throw new Error('The lesson bundle is missing tutorial repository setup.');
    return {id:project.id,title:project.title,folder:project.folder,lesson:project.lesson,template,files:validated};
  });
}
async function loadBundle(extensionPath) {
  const source = path.join(extensionPath, 'media', 'lesson-projects.json');
  const stat = await fs.stat(source).catch(error => {if (error.code === 'ENOENT') throw new Error('Lesson projects are missing. Reinstall the Zero extension.'); throw error;});
  if (stat.size > MAX_BUNDLE_BYTES) throw new Error('The lesson bundle is too large.');
  const bytes = await fs.readFile(source).catch(error => {if (error.code === 'ENOENT') throw new Error('Lesson projects are missing. Reinstall the Zero extension.'); throw error;});
  return validateBundle(JSON.parse(bytes.toString('utf8')));
}
async function isLocalPractice(root) {
  const marker = await fs.readFile(path.join(root, 'zero.json'), 'utf8').catch(error => {if (error.code === 'ENOENT') return null; throw error;});
  if (marker === null) return false;
  let data; try {data = JSON.parse(marker);} catch {return true;}
  return isRecord(data) && (data.localOnly === true || PROJECT_LESSONS.has(data.practiceProjectId));
}
async function assertShareable(root) {if (await isLocalPractice(root)) throw new Error(LOCAL_MESSAGE);}
async function assertOutsideGit(parent) {
  for (let current = await fs.realpath(parent); ; current = path.dirname(current)) {
    const stat = await fs.lstat(path.join(current,'.git')).catch(error => {if(error.code==='ENOENT')return null;throw error;});
    if (stat) throw new Error('Choose a folder outside a Git repository for local lesson practice.');
    if (path.dirname(current) === current) return;
  }
}
async function createLessonProject(project, destination, {forbiddenRoots = []} = {}) {
  if (!project || !Array.isArray(project.files)) throw new Error('Choose a valid bundled lesson.');
  if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw new Error('Choose an absolute path for the new lesson folder.');
  const target = path.resolve(destination), parent = path.dirname(target);
  const actualTarget = path.join(await fs.realpath(parent), path.basename(target));
  for (const root of forbiddenRoots) {
    const known = await fs.realpath(root);
    if (actualTarget === known || actualTarget.startsWith(known + path.sep)) throw new Error('Choose a folder outside the current student project for new lesson practice.');
  }
  const parentStat = await fs.lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('Choose an ordinary folder for lesson practice.');
  await assertOutsideGit(parent);
  const createdFiles = [], createdDirs = [];
  try {
    await fs.mkdir(target); createdDirs.push(target);
    for (const file of project.files) {
      if (!safeRelative(file.path) || !PROJECT_FILES.has(file.path) || ![420,493].includes(file.mode) || !Buffer.isBuffer(file.content)) throw new Error('The lesson bundle contains an unsafe file.');
      const parts = file.path.split('/'); let directory = target;
      for (const part of parts.slice(0,-1)) {
        directory = path.join(directory,part);
        const stat = await fs.lstat(directory).catch(error => {if(error.code==='ENOENT')return null;throw error;});
        if (!stat) {await fs.mkdir(directory);createdDirs.push(directory);}
        else if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The lesson folder changed while it was created.');
      }
      const filename = path.join(target,file.path);
      const handle = await fs.open(filename,'wx',file.mode); createdFiles.push(filename);
      try {await handle.writeFile(file.content);} finally {await handle.close();}
      await fs.chmod(filename,file.mode);
    }
    return target;
  } catch(error) {
    for (const filename of createdFiles.reverse()) await fs.unlink(filename).catch(() => {});
    for (const directory of createdDirs.reverse()) await fs.rmdir(directory).catch(() => {});
    throw error;
  }
}
module.exports = {tutorialMarker,assertOriginalProject,validateTemplate,loadBundle,validateBundle,createLessonProject,isLocalPractice,assertShareable,LOCAL_MESSAGE};
