import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {coreSources} from './prepare-starter.mjs';
import {prepareLessonProjects} from './lesson-projects.mjs';
import {prepareTutorials} from './prepare-tutorials.mjs';
import {prepareDesign} from '../design/prepare.mjs';
import {processSpecification} from './process-specification.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const commonFiles = ['pom.xml', 'mvnw', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.properties', '.mvn/wrapper/LICENSE-APACHE-2.0.txt', '.mvn/wrapper/NOTICE'];

// Generated projects stay in this checkout. VS Code state uses a short, separate
// home path because macOS IPC sockets cannot use long worktree paths.
function ordinary(filename, directory = false) {
  const stat = lstatSync(filename, {throwIfNoEntry:false});
  if (stat && (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile()))) {
    throw new Error(`Zero Dev needs an ordinary ${directory ? 'directory' : 'file'}: ${filename}`);
  }
  return stat;
}
function output(root, relative) {
  let current = root;
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part); ordinary(current, true);
  }
  const filename = path.join(root, relative); ordinary(filename); return filename;
}
function source(root, relative) {
  const filename = output(root, relative);
  if (!ordinary(filename)) throw new Error(`Missing Zero Dev source: ${relative}`);
  return readFileSync(filename);
}
function write(filename, bytes) {
  mkdirSync(path.dirname(filename), {recursive:true});
  if (!existsSync(filename) || !readFileSync(filename).equals(bytes)) {
    const temporary = `${filename}.zero-dev-${process.pid}`;
    try {writeFileSync(temporary, bytes, {flag:'wx'}); renameSync(temporary, filename);}
    finally {rmSync(temporary, {force:true});}
  }
}
export function devPaths(root, home = homedir()) {
  const base = path.join(root, '.verification/zero-dev');
  const editor = path.join(home, '.zero-dev', hash(root).slice(0,12));
  return {base, game:path.join(base, 'game'), workspace:path.join(base, 'Zero Dev.code-workspace'),
    userData:path.join(editor, 'user'), extensions:path.join(editor, 'extensions')};
}

export function prepareGame(inputRoot = repository, {home = homedir()} = {}) {
  const root = realpathSync(inputRoot), locations = devPaths(root, home);
  const receiptPath = output(root, '.verification/zero-dev/managed.json');
  const editorRelative = `.zero-dev/${hash(root).slice(0,12)}`;
  output(home, `${editorRelative}/extensions/.reserved`);
  const profilePath = output(home, `${editorRelative}/user/User/settings.json`);
  const previous = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : {};
  const files = new Map();
  const add = (relative, bytes, preserve = false) => files.set(relative, {bytes:Buffer.from(bytes), preserve});
  for (const name of commonFiles) add(`game/${name}`, source(root, `student-template/${name}`));
  for (const name of coreSources) add(`game/src/main/java/zero/${name}`, source(root, `framework/src/main/java/zero/${name}`));
  for (const name of ['Main', 'Player', 'Coin', 'ScoreDisplay', 'PlayerInput', 'CreditsBadge']) {
    let bytes = source(root, `teaching/checkpoints/11/game/${name}.java`);
    if (name === 'Main') bytes = Buffer.from(bytes.toString().replace('padding(20);', 'title("Zero Dev · Coin Game");\n        padding(20);'));
    add(`game/src/main/java/${name}.java`, bytes, true);
  }
  add('game/zero.json', json({name:'Zero Dev · Coin Game', templateVersion:'0.1.0', mainClass:'Main', localOnly:true}));
  const settings = JSON.parse(source(root, 'student-template/.vscode/settings.json'));
  Object.assign(settings, {'zero.uploadMode':'simulation', 'git.enabled':false});
  add('game/.vscode/settings.json', json(settings));
  const nodeTask = (label, command) => ({label, type:'process', command:process.execPath,
    args:[path.join(root, 'scripts/zero-dev.mjs'), command], options:{cwd:root}, problemMatcher:[],
    presentation:{reveal:'always', panel:'dedicated'}, runOptions:{instanceLimit:1}});
  const tasks = JSON.parse(source(root, 'student-template/.vscode/tasks.json'));
  tasks.tasks.push(nodeTask('Zero Dev: Refresh sources', 'prepare'), nodeTask('Zero Dev: Smoke tests', 'smoke'));
  add('game/.vscode/tasks.json', json(tasks));
  add('Zero Dev.code-workspace', json({folders:[{name:'Zero Dev · Coin Game', path:'game'}], settings:{
    'window.title':'Zero Dev — ${activeEditorShort}${separator}${rootName}',
    'zero.uploadMode':'simulation', 'git.enabled':false,
  }}));
  // User settings are only seeded. Subsequent personal changes remain intact.
  const profile = JSON.parse(source(root, 'profile/Zero.code-profile'));
  const profileSettings = JSON.parse(JSON.parse(profile.settings).settings);
  profileSettings['window.autoDetectColorScheme'] = true;
  profileSettings['workbench.preferredLightColorTheme'] = 'Default Light Modern';
  profileSettings['workbench.preferredDarkColorTheme'] = 'Default Dark Modern';
  const preserved = [], receipt = {};
  const updates = [...files].map(([relative, item]) => {
    const filename = output(root, `.verification/zero-dev/${relative}`);
    const current = existsSync(filename) ? hash(readFileSync(filename)) : null;
    const desired = hash(item.bytes);
    if (current && current !== desired && current !== previous[relative]) {
      if (!item.preserve) throw new Error(`Preserved edited Zero Dev managed file: ${filename}. Move framework edits to framework/src/main/java/zero, then restore this generated copy.`);
      preserved.push(relative);
      receipt[relative] = previous[relative] || desired;
      return null;
    }
    receipt[relative] = desired;
    return {filename, ...item};
  });
  const provenancePath = output(root, '.verification/zero-dev/game/.zero/dev-source.json');
  const sourceHash = hash(Buffer.concat(coreSources.flatMap(name => [Buffer.from(name), source(root, `framework/src/main/java/zero/${name}`)])));
  for (const item of updates.filter(Boolean)) write(item.filename, item.bytes);
  mkdirSync(path.join(home, '.zero-dev'), {recursive:true, mode:0o700});
  if (!existsSync(profilePath)) write(profilePath, json(profileSettings));
  chmodSync(path.join(locations.game, 'mvnw'), 0o755);
  write(receiptPath, json(receipt));
  write(provenancePath, json({sourceRoot:root, frameworkSha256:sourceHash, sources:coreSources}));
  mkdirSync(locations.extensions, {recursive:true});
  return {...locations, sourceHash, preserved};
}

export function prepareDev() {
  const result = prepareGame();
  prepareDesign({website:false});
  prepareLessonProjects();
  prepareTutorials();
  console.log(`Zero Dev · framework ${result.sourceHash.slice(0, 12)} · ${result.game}`);
  if (result.preserved.length) console.log(`Kept your edits: ${result.preserved.join(', ')}`);
  return result;
}

export function developmentEnvironment(env = process.env, home = homedir()) {
  const result = {...env};
  delete result.ZERO_KIT_DIR;
  delete result.ZERO_JAVA_HOME;
  delete result.VSCODE_IPC_HOOK_CLI;
  if (!result.JAVA_HOME && process.platform === 'darwin') {
    const runtime = path.join(home, 'Library/Application Support/Zero/runtime');
    const jdk = existsSync(runtime) && readdirSync(runtime).sort().find(name => name.startsWith('jdk-') && existsSync(path.join(runtime, name, 'bin/java')));
    if (jdk) result.JAVA_HOME = path.join(runtime, jdk);
  }
  if (result.JAVA_HOME) result.PATH = path.join(result.JAVA_HOME, 'bin') + path.delimiter + (result.PATH || '');
  return result;
}
export function editorArguments(root, home = homedir()) {
  const paths = devPaths(root, home);
  return ['--new-window', '--user-data-dir', paths.userData, '--extensions-dir', paths.extensions,
    `--extensionDevelopmentPath=${path.join(root, 'extension')}`, paths.workspace];
}
function editorCommand() {
  if (process.env.ZERO_DEV_CODE) return process.env.ZERO_DEV_CODE;
  if (process.platform === 'darwin') {
    const code = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
    if (existsSync(code)) return code;
  }
  return process.platform === 'win32' ? 'code.cmd' : 'code';
}
function child(command, args, {env = developmentEnvironment(), cwd = repository, timeout, capture = false} = {}) {
  const spec = processSpecification(command, args);
  return new Promise((resolve, reject) => {
    const task = spawn(spec.command, spec.args, {cwd, env, windowsVerbatimArguments:spec.windowsVerbatimArguments,
      detached:process.platform !== 'win32', stdio:capture ? ['ignore','pipe','pipe'] : 'inherit'});
    let output = '', timedOut = false;
    if (capture) for (const stream of [task.stdout, task.stderr]) stream.on('data', data => {output += data; process.stdout.write(data);});
    let force;
    const terminate = () => {
      if (!task.pid) return;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(task.pid), '/T', '/F'], {stdio:'ignore'});
      else {
        try {process.kill(-task.pid, 'SIGTERM');} catch {}
        force = setTimeout(() => {try {process.kill(-task.pid, 'SIGKILL');} catch {}}, 2000);
        force.unref();
      }
    };
    process.once('SIGINT', terminate); process.once('SIGTERM', terminate);
    const cleanup = () => {clearTimeout(timer); process.removeListener('SIGINT', terminate); process.removeListener('SIGTERM', terminate);};
    const timer = timeout && setTimeout(() => {timedOut = true; terminate();}, timeout);
    task.on('error', error => {cleanup(); reject(new Error(`Cannot run ${command}: ${error.message}. Install Node 22+, JDK 17+ and VS Code, or set JAVA_HOME / ZERO_DEV_CODE.`));});
    task.on('close', (code, signal) => {
      cleanup();
      if (code !== 0 || timedOut) reject(new Error(`${path.basename(command)} ${timedOut ? 'timed out' : `exited ${code ?? signal}`}`));
      else resolve(output);
    });
  });
}

// Poll only authored inputs. Generated files, editor state, targets and game
// scratch edits are excluded, so regeneration cannot cause a watcher loop.
export function inputFingerprint(root = repository) {
  const files = [];
  function walk(relative) {
    const filename = path.join(root, relative);
    const stat = lstatSync(filename, {throwIfNoEntry:false});
    if (!stat || stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(filename).sort()) walk(`${relative}/${name}`);
    } else if (stat.isFile()) files.push([relative, stat.mtimeMs, stat.size]);
  }
  for (const relative of ['framework/src', 'extension/src', 'design/tokens.json', 'design/adapters.mjs', 'design/brand', 'design/playground',
    'extension/media/controls.css', 'extension/media/sidebar.css', 'student-template/lessons', 'teaching/checkpoints', 'teaching/starters',
    'student-template/pom.xml', 'student-template/.vscode', 'profile/Zero.code-profile']) walk(relative);
  return hash(JSON.stringify(files));
}
export async function smokeGame(game) {
  const temp = mkdtempSync(path.join(devPaths(repository).base, 'smoke-'));
  try {
    function copy(relative) {
      const filename = path.join(game, relative);
      const stat = lstatSync(filename);
      if (stat.isSymbolicLink()) throw new Error(`No symlinks in the smoke project: ${filename}`);
      if (stat.isDirectory()) for (const name of readdirSync(filename)) copy(`${relative}/${name}`);
      else {const target = path.join(temp, relative); mkdirSync(path.dirname(target), {recursive:true}); copyFileSync(filename, target);}
    }
    for (const relative of [...commonFiles, 'src']) copy(relative);
    copyFileSync(path.join(repository, 'teaching/CheckpointHarness.java'), path.join(temp, 'src/main/java/CheckpointHarness.java'));
    chmodSync(path.join(temp, 'mvnw'), 0o755);
    const result = await child(path.join(temp, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'),
      ['-B', '--no-transfer-progress', '-q', '-Dapp.mainClass=CheckpointHarness', 'clean', 'compile', 'javafx:run'],
      {cwd:temp, env:{...developmentEnvironment(), ZERO_CHECKPOINT_ID:'11/game'}, timeout:120000, capture:true});
    if (!result.includes('CHECKPOINT_OK 11/game')) throw new Error('Sample game did not report its smoke-test success marker.');
    copyFileSync(path.join(repository, 'scripts/dev/ZeroDevPlayCheck.java'), path.join(temp, 'src/main/java/ZeroDevPlayCheck.java'));
    copyFileSync(path.join(repository, 'framework/checks/zero/NativeFocus.java'), path.join(temp, 'src/main/java/zero/NativeFocus.java'));
    const proof = output(repository, '.verification/zero-dev/acceptance/game-win.png');
    mkdirSync(path.dirname(proof), {recursive:true});
    const played = await child(path.join(temp, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'),
      ['-B', '--no-transfer-progress', '-q', '-Dapp.mainClass=ZeroDevPlayCheck', 'compile', 'javafx:run'],
      {cwd:temp, env:{...developmentEnvironment(), ZERO_DEV_PLAY_PROOF:proof}, timeout:120000, capture:true});
    if (!played.includes('ZERO_DEV_PLAY_OK')) throw new Error('Sample game did not complete its keyboard playthrough.');
  } finally {rmSync(temp, {recursive:true, force:true});}
}
async function preview(revision) {
  const port = process.env.ZERO_DESIGN_PORT || '3153';
  const task = spawn(process.execPath, ['design/playground/server.mjs'], {cwd:repository, stdio:['ignore','inherit','inherit','ipc'],
    env:{...process.env, ZERO_DESIGN_PORT:port, ZERO_DEV_PREVIEW:revision}});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {task.kill(); reject(new Error('Preview did not start within 10 seconds.'));}, 10000);
    task.once('error', error => {clearTimeout(timer); reject(error);});
    task.once('exit', code => {clearTimeout(timer); reject(new Error(`Preview exited ${code}; choose an unused ZERO_DESIGN_PORT.`));});
    task.once('message', message => {if (message.type === 'zero-preview-ready') {clearTimeout(timer); resolve();}});
  });
  return task;
}
async function stopPreview(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const ended = new Promise(resolve => server.once('exit', resolve));
  server.kill(); await ended;
}
async function watch({open = true} = {}) {
  const paths = prepareDev();
  let fingerprint = inputFingerprint(), server = await preview(fingerprint);
  server.on('exit', code => {if (code) console.error('Preview server exited; choose an unused ZERO_DESIGN_PORT and restart Zero Dev.');});
  try {if (open) await child(editorCommand(), editorArguments(repository));}
  catch (error) {await stopPreview(server); throw error;}
  console.log(`\nZero Dev preview: http://127.0.0.1:${process.env.ZERO_DESIGN_PORT || 3153}/components?theme=dark&state=ready`);
  console.log('Watching source. UI previews refresh automatically. After extension changes: Developer: Reload Window. After framework changes: Run again. Ctrl+C stops the watcher/preview; the editor stays open.');
  let updating = false;
  const timer = setInterval(async () => {
    if (updating) return;
    const next = inputFingerprint();
    if (next === fingerprint) return;
    updating = true;
    try {
      // A new process also reloads token JSON and renderer/preparation modules.
      // Merely calling their imported functions would retain stale inputs.
      await child(process.execPath, ['scripts/zero-dev.mjs', 'prepare']);
      await stopPreview(server);
      server = await preview(next);
      fingerprint = next;
      console.log('Sources refreshed. Reload the development window for extension changes; Run again for Java changes.');
    } catch (error) {console.error(`Refresh paused: ${error.message}`); fingerprint = next;}
    finally {updating = false;}
  }, 750);
  const stop = () => {clearInterval(timer); server.kill(); process.exitCode = 0;};
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return paths;
}
async function main() {
  const command = process.argv[2] || 'start';
  if (!['start','prepare','game','smoke','ui'].includes(command)) throw new Error('Use start, prepare, game, smoke or ui.');
  if (command === 'start' || command === 'ui') return watch({open:command === 'start' && !process.argv.includes('--no-open')});
  const paths = prepareDev();
  if (command === 'prepare') return;
  if (command === 'game') return child(path.join(paths.game, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'),
    ['-B', '--no-transfer-progress', 'clean', 'compile', 'javafx:run'], {cwd:paths.game});
  await smokeGame(paths.game);
  await child(process.execPath, ['scripts/verify-framework.mjs'], {timeout:300000});
  await child(process.execPath, ['--test', 'extension/test/start-page.test.js', 'design/playground/playground.test.mjs'], {timeout:120000});
  console.log('ZERO_DEV_SMOKE_OK game movement, scoring, win/restart; framework/native input/media; Start Page and preview contracts.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(`Zero Dev: ${error.message}`); process.exitCode = 1;});
}
