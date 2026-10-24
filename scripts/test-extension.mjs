import {prepareDesign} from '../design/prepare.mjs';
import {prepareTutorials} from './prepare-tutorials.mjs';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {prepareStarter} from './prepare-starter.mjs';
import {prepareLessonProjects} from './lesson-projects.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
prepareStarter();
prepareLessonProjects();
prepareDesign();
prepareTutorials();
const directory = path.join(root, 'extension/test');
const files = readdirSync(directory).filter(name => name.endsWith('.test.js'))
  .sort().map(name => path.join(directory, name));
if (!files.length) throw new Error('No extension tests found.');
const setupDirectory = path.join(root, 'setup/tests');
const setupFiles = readdirSync(setupDirectory).filter(name => name.endsWith('.test.mjs'))
  .sort().map(name => path.join(setupDirectory, name));
const designDirectory = path.join(root, 'design/tests');
const designFiles = readdirSync(designDirectory).filter(name => name.endsWith('.test.mjs'))
  .sort().map(name => path.join(designDirectory, name));
// Git fixtures and the local Java compatibility compiler are process-heavy.
// Bound concurrent files so the full matrix leaves the editor responsive.
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', path.join(root,'scripts/kit.test.mjs'), path.join(root,'scripts/basic-games.test.mjs'), path.join(root,'scripts/lesson-projects.test.mjs'), path.join(root,'scripts/zero-dev.test.mjs'), ...['ci-scope','ci-gate','ci-browser'].map(name=>path.join(root,`scripts/${name}.test.mjs`)), ...setupFiles, ...files, ...designFiles, path.join(root, 'design/playground/playground.test.mjs')], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
