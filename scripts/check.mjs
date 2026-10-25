import {prepareDesign} from '../design/prepare.mjs';
import {prepareTutorials} from './prepare-tutorials.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {prepareStarter} from './prepare-starter.mjs';
import {prepareLessonProjects} from './lesson-projects.mjs';
import {releaseDefinition} from './release.mjs';
import {readMacUpdaterConfig} from './mac-updater.mjs';
import {verifyUpdateBuildOrder} from './mac-update-feed.mjs';
import {verifyWebProfiles} from './web-profiles.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
prepareStarter();
prepareLessonProjects();
prepareDesign();
prepareTutorials();
verifyWebProfiles();
const checkedRelease=releaseDefinition();
for (const match of readFileSync(path.join(root,'release/START-HERE.md'),'utf8').matchAll(/zero-\d+\.\d+\.\d+\.vsix/g)) {
  assert.equal(match[0],checkedRelease.assets.extension.filename,'Bundled VSIX instructions must match the candidate');
}
const priorUpdateFeed=path.join(root,'release/mac-update-feed.json');
verifyUpdateBuildOrder(readMacUpdaterConfig(root),checkedRelease.kitVersion,existsSync(priorUpdateFeed) ? JSON.parse(readFileSync(priorUpdateFeed,'utf8')) : undefined);
function json(relative) { return JSON.parse(readFileSync(path.join(root, relative), 'utf8')); }
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.git', '.verification', 'node_modules', 'target', 'dist', '.next', '.generated', 'generated'].includes(entry.name) || entry.isSymbolicLink()) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}
const profile = json('profile/Zero.code-profile');
assert.equal(profile.name, 'Zero');
const importedSettings = JSON.parse(profile.settings);
assert.equal(typeof importedSettings.settings, 'string', 'Profile settings must use the VS Code exported resource envelope');
assert.equal(JSON.parse(importedSettings.settings)['files.autoSave'], 'afterDelay');
if (profile.extensions) assert.ok(Array.isArray(JSON.parse(profile.extensions)));
json('profile/optional-keybindings.json');
const manifest = json('extension/package.json');
assert.equal(`${manifest.publisher}.${manifest.name}`, 'zero.zero');
for (const command of ['zero.toggleApp', 'zero.runApp', 'zero.stopApp', 'zero.uploadToGitHub', 'zero.copyRepositoryLink', 'zero.chooseBranch', 'zero.startChange', 'zero.finishChange']) {
  assert.ok(manifest.contributes.commands.some(item => item.command === command), command);
}
assert.ok(existsSync(path.join(root, manifest.main.startsWith('./')
  ? 'extension/' + manifest.main.slice(2) : 'extension/' + manifest.main)));
json('student-template/zero.json');
assert.equal(json('student-template/.vscode/settings.json')['java.configuration.updateBuildConfiguration'], 'automatic', 'Student library changes must refresh the Java classpath without a manual prompt');
const tasks = json('student-template/.vscode/tasks.json');
assert.ok(tasks.tasks.some(task => task.group?.kind === 'build' && task.group.isDefault), 'Default build task missing');
for (const relative of ['student-template/.vscode/tasks.json', '.vscode/tasks.json']) {
  for (const task of json(relative).tasks) {
    if (task.type !== 'zero') continue;
    assert.equal(task.task, 'run');
    const name = task.problemMatcher.slice(1);
    assert.ok(manifest.contributes.problemMatchers.some(matcher => matcher.name === name), `Unknown matcher: ${task.problemMatcher}`);
  }
}
for (const filename of files(root)) {
  if (filename.endsWith('.json') || filename.endsWith('.code-profile')) JSON.parse(readFileSync(filename, 'utf8'));
  if (/\.(?:js|mjs)$/.test(filename)) {
    const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
    assert.equal(result.status, 0, filename);
  }
  if (filename.endsWith('.md')) {
    const text = readFileSync(filename, 'utf8');
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^(?:https?:|mailto:|\/)/.test(destination)) continue;
      assert.ok(existsSync(path.resolve(path.dirname(filename), destination)), `Broken link in ${filename}: ${destination}`);
    }
  }
}
console.log('Configuration, syntax, command contracts and local documentation links passed.');
