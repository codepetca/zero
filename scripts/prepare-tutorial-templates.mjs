// Maintainer-only local drafts. Never creates, pushes or publishes a repository.
import {mkdtemp, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {lessonProjects} from './lesson-projects.mjs';
import {tutorialTemplateDefinitions} from '../teaching/projects.mjs';
const require = createRequire(import.meta.url);
const {validateBundle, createLessonProject} = require('../extension/src/lesson-projects.js');
const {tutorialScaffoldSha256} = require('../extension/src/tutorial-template-readiness.js');
export async function prepareTutorialTemplates(root = fileURLToPath(new URL('../', import.meta.url))) {
  root = await realpath(root);
  const projects = validateBundle(lessonProjects(root));
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zero-tutorial-templates-')));
  const templates = [];
  for (const project of projects) {
    const definition = tutorialTemplateDefinitions.find(item => item.id === project.id);
    const destination = await createLessonProject(project, path.join(directory, definition.repository.split('/')[1]));
    templates.push({id:project.id, repository:definition.repository, publication:definition.publication, directory:destination,
      scaffoldSha256:tutorialScaffoldSha256(project.files),
      files:project.files.map(file => ({path:file.path, mode:file.mode, size:file.content.length, sha256:createHash('sha256').update(file.content).digest('hex')}))});
  }
  return {schema:1,directory,templates};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await prepareTutorialTemplates(),null,2));
