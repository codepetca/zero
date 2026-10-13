import {readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';

const repository = fileURLToPath(new URL('../', import.meta.url));
const lessonNames = ['00-hello-world','01-hello-button','02-hello-name','03-quiz','04-counter','05-methods','06-objects','07-study-app','08-movement','09-coin-game','10-components','11-zerohub','12-media'];
const examples = ['hello-button','hello-name','tiny-quiz','click-counter','reset-counter','object-counter'];
const stageDefinitions = [
  ['10-game', '10', 'Reuse the component in a game', 'coin-game-component', ['coin-game/Player.java','coin-game/Coin.java','shared/ScoreDisplay.java']],
  ['12-scrolling', '12', 'Scrolling world', 'scrolling-game'],
  ['12-platforms', '12', 'Platforms and gravity', 'platform-game'],
  ['12-levels', '12', 'Enemies and levels', 'level-game'],
  ['12-full', '12', 'Win, lose and restart', 'full-game'],
];
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
function tree(root, relative) {
  if (lstatSync(path.join(root, relative)).isSymbolicLink()) throw new Error(`No symlinks in maintained lessons: ${relative}`);
  return readdirSync(path.join(root, relative), {withFileTypes:true}).flatMap(entry => {
    if (['target','.git','node_modules','.DS_Store','__pycache__'].includes(entry.name)) return [];
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`No symlinks in maintained lessons: ${name}`);
    return entry.isDirectory() ? tree(root, name) : entry.isFile() ? [name] : [];
  });
}
function firstMain(root, lesson) {
  const markdown = read(root, `student-template/lessons/${lessonNames[lesson]}.md`).toString('utf8');
  const code = [...markdown.matchAll(/```java\r?\n([\s\S]*?)```/g)].map(match => match[1]).find(code => /public class Main\b/.test(code));
  if (!code || !/public static void main\(/.test(code)) throw new Error(`Lesson ${lesson} needs a complete initial Main program.`);
  return Buffer.from(code.trimEnd() + '\n');
}

// One authored source set feeds web downloads and native project creation.
// These are maintained templates, never saved student work or Git repositories.
export function lessonProjects(root = repository) {
  const common = new Map();
  const add = (files, filename, bytes, mode = 0o644) => files.set(filename, {path:filename, content:Buffer.from(bytes).toString('base64'), mode});
  for (const name of ['pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties','.vscode/tasks.json']) add(common, name, read(root, `student-template/${name}`), name === 'mvnw' ? 0o755 : 0o644);
  const settings = JSON.parse(read(root, 'student-template/.vscode/settings.json'));
  settings['git.enabled'] = false; settings['git.autofetch'] = false;
  add(common, '.vscode/settings.json', JSON.stringify(settings, null, 2) + '\n');
  add(common, '.gitignore', '# Local lesson practice: keep every file off GitHub.\n*\n');
  add(common, 'LICENSE', read(root, 'LICENSE'));
  for (const name of ['SimpleApp','SketchApp']) add(common, `src/main/java/zero/${name}.java`, read(root, `framework/src/main/java/zero/${name}.java`));
  for (const dir of ['lessons','examples']) for (const filename of tree(root, `student-template/${dir}`)) add(common, filename.slice('student-template/'.length), read(root, filename));
  for (const filename of ['API.md','UI.md','BEGINNER.md','STYLE.md','EXERCISES.md']) add(common, filename, read(root, `student-template/${filename}`));
  const source = (files, filename) => add(files, `src/main/java/${path.posix.basename(filename)}`, read(root, `student-template/examples/${filename}`));
  const resource = files => {
    for (const filename of tree(root, 'student-template/examples/media-demo/resources')) add(files, filename.replace('student-template/examples/media-demo/resources/', 'src/main/resources/'), read(root, filename));
  };
  const create = (id, lesson, title, populate) => {
    const files = new Map(common);
    populate(files);
    add(files, 'zero.json', JSON.stringify({name:`Lesson ${lesson}: ${title}`,templateVersion:'0.1.0',mainClass:'Main',localOnly:true,lessonId:id}, null, 2) + '\n');
    add(files, 'README.md', `# ${title}\n\nThis is a local practice project. Keep it on this computer; do not connect or upload it to GitHub. Your other projects are untouched.\n\nOpen this folder in VS Code. Open \`src/main/java/Main.java\` and click **Run App**. After edits, click **Run App again**; Zero saves and restarts for you.\n\nRead [Lesson ${lesson}](lessons/${lessonNames[Number(lesson)]}.md). Examples are references outside compiled source. GitHub uploads and sharing belong to your own separate project, not this practice folder.\n`);
    return {id,lesson:String(lesson),title,folder:`zero-lesson-${id}`,files:[...files.values()].sort((a,b) => a.path.localeCompare(b.path))};
  };
  const projects = lessonNames.map((name, index) => {
    const markdown = read(root, `student-template/lessons/${name}.md`).toString('utf8');
    const title = markdown.match(/^# \d+\. (.+)$/m)?.[1];
    if (!title) throw new Error(`Missing lesson title: ${name}`);
    return create(String(index), String(index), title, files => {
      if ([0,7,8].includes(index)) add(files, 'src/main/java/Main.java', firstMain(root, index));
      else if (index >= 1 && index <= 6) source(files, `${examples[index-1]}/Main.java`);
      else if (index === 9) source(files, 'movement/Main.java');
      else if (index === 10 || index === 11) source(files, 'study/Main.java');
      else if (index === 12) source(files, 'media-demo/Main.java');
      if (index === 6) source(files, 'object-counter/Counter.java');
      if ([7,10,11].includes(index)) {source(files, 'study/Question.java');source(files, 'shared/ScoreDisplay.java');}
      if (index === 8) source(files, 'movement/Player.java');
      if (index === 9) {source(files, 'coin-game/Player.java');source(files, 'coin-game/Coin.java');}
      if (index === 12) resource(files);
    });
  });
  for (const [id, lesson, title, folder, helpers] of stageDefinitions) projects.push(create(id, lesson, title, files => {
    const sources = helpers ? [`${folder}/Main.java`, ...helpers] : tree(root, `student-template/examples/${folder}`).filter(name => name.endsWith('.java') && path.posix.dirname(name) === `student-template/examples/${folder}`).map(name => name.slice('student-template/examples/'.length));
    for (const filename of sources) source(files, filename);
    if (lesson === '12') {source(files, 'shared/ScoreDisplay.java'); resource(files);}
  }));
  return {schema:1, projects};
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
    const name = Buffer.from(`${project.folder}/${file.path}`), bytes = Buffer.from(file.content, 'base64'), compressed = deflateRawSync(bytes), crc = crc32(bytes);
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
  if (website) for (const project of bundle.projects) {
    const destination = path.join(root, `website/public/generated/lessons/${project.folder}.zip`);
    mkdirSync(path.dirname(destination), {recursive:true}); writeFileSync(destination, lessonProjectZip(project));
  }
  return bundle;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = prepareLessonProjects(); console.log(`Prepared ${bundle.projects.length} local-only lesson starters.`);
}
