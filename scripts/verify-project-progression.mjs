import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {lessonProjects, gameAssetFiles} from './lesson-projects.mjs';

// Reviewed maintainer fixtures only. Student files and the public executor are
// never inputs. Every build starts from the same minimal generated scaffold.
const root = fileURLToPath(new URL('../', import.meta.url));
const allIds = [...Array.from({length:10}, (_, n) => String(n)),
  '10/study','10/game','11/study','11/game','12/media','12/scrolling'];
const compileOnly = process.argv.includes('--compile-only');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
if (only && !allIds.includes(only)) throw new Error(`Unknown checkpoint: ${only}`);
const selected = only ? [only] : allIds;
const scaffold = new Map(lessonProjects(root).projects.map(project => [project.id, project]));

function sameSource(left, right) {
  const a = readFileSync(path.join(root,'teaching/checkpoints',left,'ScoreDisplay.java'));
  const b = readFileSync(path.join(root,'teaching/checkpoints',right,'ScoreDisplay.java'));
  if (!a.equals(b)) throw new Error(`ScoreDisplay drift: ${left} and ${right}`);
}
sameSource('10/study','10/game');
sameSource('11/study','11/game');
// Lesson 12 retains its older media/JavaFX component until its Zero migration.
// Keep both current consumer pairs exact; reconnect 11 -> 12 in that slice.
sameSource('12/media','12/scrolling');

function projectKind(id) {
  const lesson = Number(id.split('/')[0]);
  if (id.endsWith('/study')) return 'study';
  if (lesson < 3) return 'greeting';
  if (lesson < 8) return 'study';
  return 'game';
}

function runProject(destination, id, mode = '') {
  const wrapper = path.join(destination, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
  const commands = compileOnly ? ['-B','-q','clean','compile'] :
    ['-B','-q','-Dapp.mainClass=CheckpointHarness','clean','compile','javafx:run'];
  const result = spawnSync(wrapper, commands, {
    cwd: destination, encoding:'utf8', timeout:120000,
    shell:process.platform === 'win32',
    env:{...process.env,ZERO_CHECKPOINT_ID:id,ZERO_CHECKPOINT_MODE:mode},
  });
  const marker = `CHECKPOINT_OK ${id}${mode ? ' ' + mode : ''}`;
  if (result.error || result.status !== 0 || (!compileOnly && !result.stdout.includes(marker))) {
    throw new Error(`${id}${mode ? ' ' + mode : ''} failed: ${result.error?.message ?? `exit ${result.status}`}\n${result.stdout.slice(-5000)}\n${result.stderr.slice(-5000)}`);
  }
  console.log(`Checkpoint ${id}${mode ? ' ' + mode : ''}: ${compileOnly ? 'compiled' : 'finite behavior passed'}.`);
}

const temp = mkdtempSync(path.join(tmpdir(),'zero-progression-'));
try {
  for (const id of selected) {
    const base = scaffold.get(projectKind(id));
    if (!base) throw new Error(`No generated scaffold for ${id}`);
    const destination = path.join(temp,id.replace('/','-'));
    mkdirSync(destination,{recursive:true});
    for (const file of base.files) {
      const filename = path.join(destination,file.path);
      mkdirSync(path.dirname(filename),{recursive:true});
      writeFileSync(filename,Buffer.from(file.content,'base64'),{mode:file.mode});
    }
    const source = path.join(root,'teaching/checkpoints',id);
    const java = path.join(destination,'src/main/java');
    for (const entry of readdirSync(source,{withFileTypes:true})) {
      if (entry.isFile() && entry.name.endsWith('.java')) copyFileSync(path.join(source,entry.name),path.join(java,entry.name));
    }
    copyFileSync(path.join(root,'teaching/CheckpointHarness.java'),path.join(java,'CheckpointHarness.java'));
    runProject(destination,id);
    if (id.startsWith('12/')) {
      // The same exact bytes offered to the student as game-assets.zip.
      for (const asset of gameAssetFiles(root)) {
        const target = path.join(destination,'src/main/resources',asset.path);
        mkdirSync(path.dirname(target),{recursive:true});
        writeFileSync(target,Buffer.from(asset.content,'base64'));
      }
      runProject(destination,id,'with-media');
    }
  }
  console.log(`${selected.length} checkpoint variants ${compileOnly ? 'compiled' : 'passed finite JavaFX checks'}.`);
} finally {
  rmSync(temp,{recursive:true,force:true});
}
