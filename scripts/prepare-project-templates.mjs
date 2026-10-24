// Local preparation only. Publication is a separately authorized maintainer action.
import {mkdtemp, mkdir, writeFile, chmod, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {templateDefinitions, templateDefinition} from '../website/lib/project-templates.mjs';
import {buildCourseStarter, buildExampleProject} from '../website/lib/example-projects.mjs';
import {examples} from '../website/lib/learning.mjs';
import {prepareTutorialTemplates} from './prepare-tutorial-templates.mjs';

// Keep the standalone maintainer entry point compatible; tutorial drafts are
// the three minimal continuing projects, selected explicitly.
if(process.argv.length>2 && (process.argv.length!==3 || process.argv[2]!=='--tutorials'))throw Error('Usage: node scripts/prepare-project-templates.mjs [--tutorials]');
if(process.argv[2]==='--tutorials') {
  console.log(JSON.stringify(await prepareTutorialTemplates(),null,2));
  process.exit(0);
}

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
// Build and inspect all five inventories before creating any draft directory.
const prepared = [];
for (const definition of templateDefinitions) {
  const template = templateDefinition(definition.id);
  const project = definition.id === 'zero-starter'
    ? await buildCourseStarter({root, template})
    : await buildExampleProject({root, template, example: examples.find(item => item.id === definition.id)});
  prepared.push({template, project});
}
// Fresh real directories outside any parent Git repository can become template
// repository roots; no prior draft, student folder or private files are traversed.
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zero-project-templates-')));
const templates = [];
for (const {template, project} of prepared) {
  const destination = path.join(directory, template.repository.split('/')[1]);
  await mkdir(destination);
  for (const file of project.files) {
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, file.data, {flag:'wx', mode: file.mode & 0o777});
    await chmod(target, file.mode & 0o777);
  }
  templates.push({...template, directory: destination, archiveSha256: project.sha256,
    files: project.files.map(file => ({path:file.path, mode:file.mode, size:file.data.length,
      sha256:createHash('sha256').update(file.data).digest('hex')}))});
}
console.log(JSON.stringify({schema:1,directory,templates},null,2));
