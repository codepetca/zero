import {createHash} from 'node:crypto';
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const owner = 'zero-ui-prototypes-v1';
export const prototypeIds = ['counter', 'coin-game', 'beginner-coin-game', 'actor-stress', 'simulation'];

export function selectUiPrototypes(only) {
  if (only === undefined) return [...prototypeIds];
  if (!Array.isArray(only) || !only.length || only.some(id => typeof id !== 'string' || !prototypeIds.includes(id))) {
    throw new Error('Select one or more known UI prototypes: ' + prototypeIds.join(', '));
  }
  if (new Set(only).size !== only.length) throw new Error('Duplicate UI prototype selection.');
  return [...only];
}

export function parseUiPrototypeArgs(args) {
  if (!args.length) return undefined;
  if (args.length !== 1 || !args[0].startsWith('--only=')) throw new Error('Usage: --only=simulation (or comma-separated prototype IDs)');
  return selectUiPrototypes(args[0].slice('--only='.length).split(','));
}
const scaffold = ['pom.xml', 'mvnw', 'mvnw.cmd', 'zero.json', '.gitignore',
  '.mvn/wrapper/maven-wrapper.properties', '.mvn/wrapper/LICENSE-APACHE-2.0.txt', '.mvn/wrapper/NOTICE',
  '.vscode/settings.json', '.vscode/tasks.json', '.vscode/extensions.json'];

function ordinary(filename) {
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatSync(current, {throwIfNoEntry: false});
    if (stat?.isSymbolicLink()) throw new Error(`Prototype paths must not contain symbolic links: ${current}`);
  }
}
function javaFiles(directory, relative = '') {
  return readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Prototype source must not be a link: ${entry.name}`);
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    return entry.isDirectory() ? javaFiles(path.join(directory, entry.name), name) : entry.isFile() && name.endsWith('.java') ? [name] : [];
  });
}

/** Assemble disposable, independently runnable projects without changing starter outputs. */
export function prepareUiPrototypes(root = repository, {only} = {}) {
  const selected = selectUiPrototypes(only);
  const output = path.join(root, '.verification/ui-prototypes');
  ordinary(output);
  const framework = path.join(root, 'framework/src/main/java');
  const helpers = javaFiles(framework);
  if (helpers.length !== 16) throw new Error(`Expected 16 reviewed Zero helper sources, found ${helpers.length}.`);
  const needsShared = selected.some(id => id === 'counter' || id === 'coin-game');
  const shared = needsShared ? Object.fromEntries(['ScoreView.java', 'ScoreDisplay.java', 'BarScoreDisplay.java'].map(name =>
    [name, readFileSync(path.join(root, 'framework/prototypes/shared', name))])) : {};
  const plans = selected.map(id => {
    const directory = path.join(output, id);
    ordinary(directory);
    const entries = Object.fromEntries(scaffold.map(name => [name, readFileSync(path.join(root, 'student-template', name))]));
    entries.LICENSE = readFileSync(path.join(root, 'LICENSE'));
    for (const name of helpers) entries[`src/main/java/${name}`] = readFileSync(path.join(framework, name));
    const standalone = id === 'beginner-coin-game' || id === 'actor-stress' || id === 'simulation';
    const studentSources = standalone ? javaFiles(path.join(root, 'framework/prototypes', id))
      : [...javaFiles(path.join(root, 'framework/prototypes', id)), ...Object.keys(shared)];
    for (const name of studentSources) {
      const bytes = !standalone && shared[name] ? shared[name] : readFileSync(path.join(root, 'framework/prototypes', id, name));
      if (/\bimport\s+(?:static\s+)?javafx\./.test(bytes.toString('utf8'))) throw new Error(`Student prototype imports JavaFX: ${id}/${name}`);
      entries[`src/main/java/${name}`] = bytes;
    }
    if (id === 'actor-stress') {
      for (const name of ['stress-sprites.png', 'stress-sprites-64.png', 'stress-sprites-128.png', 'stress-sprites-256.png']) {
        entries[`src/main/resources/${name}`] = readFileSync(path.join(root,
          'framework/prototypes/actor-stress', name));
      }
    }
    entries['README.md'] = Buffer.from(`# Zero ${id} prototype\n\nRun with the included wrapper: \`./mvnw javafx:run\` (Windows: \`mvnw.cmd javafx:run\`).\nThis project contains its own ordinary Java sources, Zero helpers and pinned Maven/JavaFX setup.\nIt does not need the surrounding Zero repository.\n`);
    const marker = path.join(directory, '.zero-ui-prototype.json');
    ordinary(marker);
    const previous = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : null;
    if (previous && (previous.owner !== owner || previous.id !== id || !previous.files)) throw new Error(`Unrecognized prototype ownership: ${marker}`);
    if (!previous && existsSync(directory) && readdirSync(directory).length) throw new Error(`Preserved unowned prototype output: ${directory}`);
    for (const [name, bytes] of Object.entries(entries)) {
      const destination = path.join(directory, name);
      ordinary(destination);
      if (existsSync(destination)) {
        if (!lstatSync(destination).isFile()) throw new Error(`Expected ordinary prototype file: ${destination}`);
        const current = digest(readFileSync(destination));
        if (current !== previous?.files[name] && current !== digest(bytes)) throw new Error(`Preserved edited prototype file: ${destination}`);
      }
    }
    return {id, directory, studentSources, entries};
  });
  // Validate all destinations before replacing any of our generated files.
  for (const plan of plans) {
    for (const [name, bytes] of Object.entries(plan.entries)) {
      const destination = path.join(plan.directory, name);
      mkdirSync(path.dirname(destination), {recursive: true});
      writeFileSync(destination, bytes);
      if (name === 'mvnw') chmodSync(destination, 0o755);
    }
    writeFileSync(path.join(plan.directory, '.zero-ui-prototype.json'), JSON.stringify({owner, id: plan.id,
      files: Object.fromEntries(Object.entries(plan.entries).map(([name, bytes]) => [name, digest(bytes)]))}, null, 2) + '\n');
  }
  const projects = plans.map(({id, directory, studentSources}) => ({id, directory, studentSources}));
  const counter = plans.find(plan => plan.id === 'counter');
  const coin = plans.find(plan => plan.id === 'coin-game');
  if (counter && coin) {
    for (const name of Object.keys(shared)) {
      if (!counter.entries['src/main/java/' + name].equals(coin.entries['src/main/java/' + name])) throw new Error('Shared score copies differ: ' + name);
    }
  }
  return projects;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const project of prepareUiPrototypes(repository, {only: parseUiPrototypeArgs(process.argv.slice(2))})) console.log(`Prepared standalone ${project.id}: ${project.directory}`);
}
