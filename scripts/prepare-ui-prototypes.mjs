import {createHash} from 'node:crypto';
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const owner = 'zero-ui-prototypes-v1';
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
export function prepareUiPrototypes(root = repository) {
  const output = path.join(root, '.verification/ui-prototypes');
  ordinary(output);
  const framework = path.join(root, 'framework/src/main/java');
  const helpers = javaFiles(framework);
  if (helpers.length !== 16) throw new Error(`Expected 16 reviewed Zero helper sources, found ${helpers.length}.`);
  const shared = readFileSync(path.join(root, 'framework/prototypes/shared/ScoreDisplay.java'));
  const plans = ['counter', 'coin-game', 'beginner-coin-game', 'actor-stress'].map(id => {
    const directory = path.join(output, id);
    ordinary(directory);
    const entries = Object.fromEntries(scaffold.map(name => [name, readFileSync(path.join(root, 'student-template', name))]));
    entries.LICENSE = readFileSync(path.join(root, 'LICENSE'));
    for (const name of helpers) entries[`src/main/java/${name}`] = readFileSync(path.join(framework, name));
    const standalone = id === 'beginner-coin-game' || id === 'actor-stress';
    const studentSources = standalone ? javaFiles(path.join(root, 'framework/prototypes', id))
      : [...javaFiles(path.join(root, 'framework/prototypes', id)), 'ScoreDisplay.java'];
    for (const name of studentSources) {
      const bytes = name === 'ScoreDisplay.java' ? shared : readFileSync(path.join(root, 'framework/prototypes', id, name));
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
  if (!readFileSync(path.join(projects[0].directory, 'src/main/java/ScoreDisplay.java')).equals(
    readFileSync(path.join(projects[1].directory, 'src/main/java/ScoreDisplay.java')))) throw new Error('ScoreDisplay copies differ.');
  return projects;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const project of prepareUiPrototypes()) console.log(`Prepared standalone ${project.id}: ${project.directory}`);
}
