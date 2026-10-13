import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {lessonProjects, lessonProjectZip, prepareLessonProjects} from './lesson-projects.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = lessonProjects(root);
const content = (project, filename) => Buffer.from(project.files.find(file => file.path === filename).content, 'base64');

test('all lesson and stage starters contain only their matching compiled classes', () => {
  assert.equal(bundle.projects.length,18);
  assert.equal(new Set(bundle.projects.map(project => project.id)).size,18);
  const expected = {
    '0':['Main'], '1':['Main'], '2':['Main'], '3':['Main'], '4':['Main'], '5':['Main'],
    '6':['Counter','Main'], '7':['Main','Question','ScoreDisplay'], '8':['Main','Player'],
    '9':['Coin','Main','Player'], '10':['Main','Question','ScoreDisplay'], '11':['Main','Question','ScoreDisplay'], '12':['Main'],
    '10-game':['Coin','Main','Player','ScoreDisplay'], '12-scrolling':['Camera','Coin','Main','Player','ScoreDisplay'],
    '12-platforms':['Camera','Coin','Main','Platform','Player','ScoreDisplay'],
    '12-levels':['Camera','Coin','Enemy','Level','Main','Platform','Player','ScoreDisplay'],
    '12-full':['Camera','Coin','Enemy','Level','Main','Platform','Player','ScoreDisplay'],
  };
  for (const project of bundle.projects) {
    const classes = project.files.filter(file => /^src\/main\/java\/[^/]+\.java$/.test(file.path)).map(file => path.basename(file.path,'.java')).sort();
    assert.deepEqual(classes,expected[project.id],project.id);
    assert.equal(new Set(project.files.map(file => file.path)).size,project.files.length);
    assert.ok(project.files.every(file => !file.path.includes('..') && !file.path.startsWith('/') && !/^\.git\//.test(file.path)));
    assert.ok(!project.files.some(file => /^(target\/|zero-game\.json|libraries\/)/.test(file.path)));
    assert.equal(JSON.parse(content(project,'zero.json')).localOnly,true);
    assert.equal(JSON.parse(content(project,'zero.json')).lessonId,project.id);
    assert.equal(JSON.parse(content(project,'.vscode/settings.json'))['git.enabled'],false);
    assert.equal(project.files.find(file => file.path === 'mvnw').mode,0o755);
  }
  assert.ok(!content(bundle.projects.find(p => p.id === '8'),'src/main/java/Main.java').toString().includes('void update('),'lesson8 starts before adding movement');
  assert.ok(content(bundle.projects.find(p => p.id === '7'),'src/main/java/Main.java').toString().includes('private final Question question'),'lesson7 starts at one-question checkpoint');
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
  for(const project of generated.projects) assert.deepEqual(readFileSync(path.join(root,`website/public/generated/lessons/${project.folder}.zip`)),lessonProjectZip(project));
});
