import {coreSources} from './prepare-starter.mjs';
import {publishedTutorialTemplate,validateTutorialTemplates,tutorialTemplateDefinitions} from '../teaching/projects.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {lessonProjects, lessonProjectZip, prepareLessonProjects, gameAssetFiles} from './lesson-projects.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = lessonProjects(root);
const content = (project, filename) => Buffer.from(project.files.find(file => file.path === filename).content, 'base64');

test('three continuing projects cover every lesson without distributing solutions', () => {
  assert.deepEqual(bundle.projects.map(project => project.id), ['greeting','study','game']);
  const first = {greeting:'0',study:'3',game:'8'};
  const expected = ['.gitignore','.mvn/wrapper/maven-wrapper.properties','.mvn/wrapper/LICENSE-APACHE-2.0.txt','.mvn/wrapper/NOTICE','.vscode/settings.json','.vscode/tasks.json','LICENSE','README.md','mvnw','mvnw.cmd','pom.xml','src/main/java/Main.java',...coreSources.map(name => `src/main/java/zero/${name}`),'zero.json'].sort();
  for (const project of bundle.projects) {
    assert.deepEqual(project.files.map(file => file.path).sort(),expected);
    const marker=JSON.parse(content(project,'zero.json'));
    assert.equal(marker.localOnly,undefined);
    assert.equal(marker.repositoryRequired,true);
    assert.deepEqual(project.template,publishedTutorialTemplate(project.id));
    assert.equal(marker.tutorialProjectId,project.id);
    assert.equal(marker.lessonId,first[project.id]);
    assert.equal(JSON.parse(content(project,'.vscode/settings.json'))['git.enabled'],true);
    assert.equal(project.files.find(file => file.path === 'mvnw').mode,0o755);
    for (const notice of ['LICENSE-APACHE-2.0.txt','NOTICE']) assert.deepEqual(content(project,`.mvn/wrapper/${notice}`),readFileSync(path.join(root,'student-template/.mvn/wrapper',notice)));
    const main=content(project,'src/main/java/Main.java').toString();
    assert.doesNotMatch(main,/new (Label|Button|Player|Coin|Counter|Question|ScoreDisplay)|show\(/);
    assert.match(main,/void setup\(\)/);
    assert.match(content(project,'README.md').toString(),/blank window or canvas/);
  }
});
test('Greeting teaching path uses Zero UI with ordinary Java callbacks', () => {
  const starter = readFileSync(path.join(root, 'student-template/src/main/java/Main.java'), 'utf8');
  assert.match(starter, /import zero\.ui\.Label;/);
  assert.doesNotMatch(starter, /import javafx\./);
  for (const [id, lesson] of ['00-hello-world', '01-hello-button', '02-hello-name'].entries()) {
    const source = readFileSync(path.join(root, `teaching/checkpoints/${id}/Main.java`), 'utf8');
    const instructions = readFileSync(path.join(root, `student-template/lessons/${lesson}.md`), 'utf8');
    assert.doesNotMatch(source, /import javafx\.|setOnAction|new VBox\(/);
    assert.doesNotMatch(instructions, /import javafx\.|setOnAction|new VBox\(/);
    assert.match(source, /extends App/);
    if (id > 0) {
      assert.match(source, /button\.onClick\(\(\) ->/);
      assert.match(instructions, /button\.onClick\(\(\) ->/);
    }
  }
});
test('Study teaching path keeps quiz rules in ordinary Java and uses Zero UI', () => {
  const lessons = ['03-quiz', '04-counter', '05-methods', '06-objects', '07-study-app'];
  for (const [offset, lesson] of lessons.entries()) {
    const source = readFileSync(path.join(root, `teaching/checkpoints/${offset + 3}/Main.java`), 'utf8');
    const instructions = readFileSync(path.join(root, `student-template/lessons/${lesson}.md`), 'utf8');
    for (const text of [source, instructions]) {
      assert.doesNotMatch(text, /import javafx\.|setOnAction|new VBox\(|answer\.clear\(|\.setDisable\(/);
    }
    assert.match(source, /extends App/);
    assert.match(source, /check\.onClick\(\(\) ->/);
    if (offset >= 2) assert.match(source, /answer\.setText\(""\)/);
  }
  const session = readFileSync(path.join(root, 'teaching/checkpoints/7/Main.java'), 'utf8');
  assert.match(session, /if \(answered \|\| finished\) return;/);
  assert.match(session, /check\.setEnabled\(false\)/);
  assert.match(session, /next\.setEnabled\(true\)/);
});
test('optional asset archive contains only the two media resources', () => {
  const files=gameAssetFiles(root);
  assert.deepEqual(files.map(file=>file.path),['media-demo/player.png','media-demo/chime.wav']);
  const extracted=unzipSync(lessonProjectZip({folder:'',files}));
  for (const file of files) assert.deepEqual(Buffer.from(extracted[file.path]),readFileSync(path.join(root,'student-template/examples/media-demo/resources',file.path)));
  assert.equal(Object.keys(extracted).length,2);
});
test('ZIPs round-trip every source byte and preserve runnable wrapper permissions', () => {
  for (const project of bundle.projects) {
    const bytes = lessonProjectZip(project), extracted = unzipSync(bytes);
    assert.deepEqual(lessonProjectZip(project),bytes,'deterministic archives');
    assert.equal(Object.keys(extracted).length,project.files.length);
    for (const file of project.files) assert.deepEqual(Buffer.from(extracted[`${project.folder}/${file.path}`]),Buffer.from(file.content,'base64'));
    const end = bytes.length-22, start = bytes.readUInt32LE(end+16); let offset=start; let wrapperMode;
    for (let index=0; index<project.files.length; index++) {
      assert.equal(bytes.readUInt32LE(offset),0x02014b50);
      const length=bytes.readUInt16LE(offset+28), name=bytes.subarray(offset+46,offset+46+length).toString();
      if(name === `${project.folder}/mvnw`) wrapperMode = (bytes.readUInt32LE(offset+38) >>> 16) & 0o777;
      offset += 46+length+bytes.readUInt16LE(offset+30)+bytes.readUInt16LE(offset+32);
    }
    assert.equal(wrapperMode,0o755);
  }
});
test('generated project tracks student source and ignores build outputs', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'zero-lesson-ignore-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const project=bundle.projects[0];
  for(const file of project.files) {const filename=path.join(directory,file.path);mkdirSync(path.dirname(filename),{recursive:true});writeFileSync(filename,Buffer.from(file.content,'base64'));}
  execFileSync('git',['init','-q'],{cwd:directory});
  mkdirSync(path.join(directory,'target'));writeFileSync(path.join(directory,'target','temporary.class'),'generated');
  execFileSync('git',['add','--all'],{cwd:directory});
  const tracked=execFileSync('git',['ls-files'],{cwd:directory,encoding:'utf8'});
  assert.match(tracked,/src\/main\/java\/Main.java/);
  assert.match(tracked,/zero.json/);
  assert.doesNotMatch(tracked,/target\//);
});
test('maintained source symlink is rejected before producing project payloads', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'zero-lesson-symlink-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  mkdirSync(path.join(directory,'student-template'));symlinkSync(path.join(root,'student-template/pom.xml'),path.join(directory,'student-template/pom.xml'));
  assert.throws(()=>lessonProjects(directory),/No symlinks/);
});
test('native receives maintained bytes and website preparation removes stale tutorial ZIPs', () => {
  for(const project of bundle.projects) {
    const destination=path.join(root,`website/public/generated/projects/${project.folder}.zip`);
    mkdirSync(path.dirname(destination),{recursive:true});writeFileSync(destination,'stale tutorial ZIP');
  }
  prepareLessonProjects(root,{website:true,extension:true});
  const generated=JSON.parse(readFileSync(path.join(root,'extension/media/lesson-projects.json')));
  assert.deepEqual(generated,bundle);
  for(const project of generated.projects) assert.equal(existsSync(path.join(root,`website/public/generated/projects/${project.folder}.zip`)),false);
});

test('tutorial publications stay unavailable until complete verified metadata exists', async () => {
  for (const item of tutorialTemplateDefinitions) {
    const repositoryUrl=`https://github.com/${item.repository}`;
    assert.deepEqual(publishedTutorialTemplate(item.id),item.publication ? {repository:item.repository,repositoryUrl,templateHref:`${repositoryUrl}/generate`} : null);
  }
  const unpublished={schema:1,templates:tutorialTemplateDefinitions.map(item=>({...item,publication:null}))};
  assert.ok(validateTutorialTemplates(unpublished).every(item=>item.publication===null));
  for (const publication of [{}, {repositoryId:1,visibility:'private',isTemplate:true,defaultBranch:'main',commit:'a'.repeat(40),tree:'b'.repeat(40)}]) {
    const metadata={schema:1,templates:tutorialTemplateDefinitions.map(item=>({...item}))};metadata.templates[0].publication=publication;
    assert.throws(()=>validateTutorialTemplates(metadata),/publication/);
  }
});
