import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync} from 'node:fs';
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
  const expected = ['.gitignore','.mvn/wrapper/maven-wrapper.properties','.vscode/settings.json','.vscode/tasks.json','LICENSE','README.md','mvnw','mvnw.cmd','pom.xml','src/main/java/Main.java','src/main/java/zero/SimpleApp.java','src/main/java/zero/SketchApp.java','zero.json'].sort();
  for (const project of bundle.projects) {
    assert.deepEqual(project.files.map(file => file.path).sort(),expected);
    const marker=JSON.parse(content(project,'zero.json'));
    assert.equal(marker.localOnly,true);
    assert.equal(marker.practiceProjectId,project.id);
    assert.equal(marker.lessonId,first[project.id]);
    assert.equal(JSON.parse(content(project,'.vscode/settings.json'))['git.enabled'],false);
    assert.equal(project.files.find(file => file.path === 'mvnw').mode,0o755);
    const main=content(project,'src/main/java/Main.java').toString();
    assert.doesNotMatch(main,/new (Label|Button|Player|Coin|Counter|Question|ScoreDisplay)|show\(/);
    assert.match(main,/void setup\(\)/);
    assert.match(content(project,'README.md').toString(),/blank window or canvas/);
  }
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
test('generated project ignores every practice file even when Git is manually initialized', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'zero-lesson-ignore-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const project=bundle.projects[0];
  for(const file of project.files) {const filename=path.join(directory,file.path);mkdirSync(path.dirname(filename),{recursive:true});writeFileSync(filename,Buffer.from(file.content,'base64'));}
  execFileSync('git',['init','-q'],{cwd:directory});
  assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:directory,encoding:'utf8'}),'');
  execFileSync('git',['add','--all'],{cwd:directory});
  assert.equal(execFileSync('git',['ls-files'],{cwd:directory,encoding:'utf8'}),'');
});
test('maintained source symlink is rejected before producing project payloads', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'zero-lesson-symlink-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  mkdirSync(path.join(directory,'student-template'));symlinkSync(path.join(root,'student-template/pom.xml'),path.join(directory,'student-template/pom.xml'));
  assert.throws(()=>lessonProjects(directory),/No symlinks/);
});
test('website and native entry points receive the same maintained project bytes', () => {
  prepareLessonProjects(root,{website:true,extension:true});
  const generated=JSON.parse(readFileSync(path.join(root,'extension/media/lesson-projects.json')));
  assert.deepEqual(generated,bundle);
  for(const project of generated.projects) assert.deepEqual(readFileSync(path.join(root,`website/public/generated/projects/${project.folder}.zip`)),lessonProjectZip(project));
});
