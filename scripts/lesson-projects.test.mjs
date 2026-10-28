import {projectBuilderFilesSync} from './prepare-project-builder.mjs';
import {coreSources} from './prepare-starter.mjs';
import core from '../extension/src/core-contract.js';
import {publishedTutorialTemplate,validateTutorialTemplates,tutorialTemplateDefinitions} from '../teaching/projects.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {lessonProjects, lessonProjectZip, prepareLessonProjects, gameAssetFiles, petAssetFiles} from './lesson-projects.mjs';
import {prepareTutorialTemplates} from './prepare-tutorial-templates.mjs';
import {checkTutorialTemplateDirectory,checkPublishedTutorialTemplates,checkPackagedTutorialTemplates} from './check-tutorial-templates.mjs';
import readiness from '../extension/src/tutorial-template-readiness.js';
import lessonModule from '../extension/src/lesson-projects.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = lessonProjects(root);
const content = (project, filename) => Buffer.from(project.files.find(file => file.path === filename).content, 'base64');

test('four tutorial scaffolds omit solutions and own-project remains an original project', () => {
  assert.deepEqual(bundle.projects.map(project => project.id), ['greeting','study','game','pet']);
  const first = {greeting:'0',study:'3',game:'8',pet:'13'};
  const expected = ['.gitignore','.mvn/wrapper/maven-wrapper.properties','.mvn/wrapper/LICENSE-APACHE-2.0.txt','.mvn/wrapper/NOTICE','.vscode/settings.json','.vscode/tasks.json','LICENSE','README.md','mvnw','mvnw.cmd','pom.xml','src/main/java/Main.java',...coreSources.map(name => `src/main/java/zero/${name}`),...projectBuilderFilesSync({sourceRoot:root}).map(file => '.zero-build/' + file.path),'zero.json','zero-core.json'].sort();
  for (const project of bundle.projects) {
    assert.deepEqual(project.files.map(file => file.path).sort(),expected);
    core.validateCoreRecord(JSON.parse(content(project,'zero-core.json')),Object.fromEntries(core.coreSourcePaths.map(name=>[name,content(project,name)])));
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
test('existing published scaffolds retain their exact pre-pathway file inventories',()=>{
  const expected={greeting:'b37df540bca026cdc8a852c32c962eb81e04c8eb7391ebd95412dfa2d7c2590e',study:'38da66a7d5fcd597a5ee7065504d9ec8d19d1a7e7e62c07fa4920eb6fa0a00bc',game:'3ef12936c66103dfe742b95328b5ae38adce9fc324ed11c739e93ea1250cbe11'};
  for(const project of bundle.projects.filter(project=>project.id!=='pet')) {
    assert.equal(createHash('sha256').update(JSON.stringify(project.files)).digest('hex'),expected[project.id],project.id);
    assert.doesNotThrow(()=>readiness.assertTutorialTemplateReady(lessonModule.validateBundle(bundle).find(item=>item.id===project.id)));
  }
  const own=JSON.parse(readFileSync(path.join(root,'student-template/zero.json'),'utf8'));
  assert.equal(own.tutorialProjectId,undefined);
  assert.equal(own.repositoryRequired,undefined);
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
    const quiz = offset >= 3 ? readFileSync(path.join(root, `teaching/checkpoints/${offset + 3}/StudyQuiz.java`), 'utf8') : source;
    assert.doesNotMatch(quiz, /import javafx\.|new Main/);
    if (offset >= 3) assert.doesNotMatch(quiz, /extends App/);
    assert.match(quiz, /check\.onClick\(\(\) ->/);
    if (offset >= 2) assert.match(quiz, /answer\.setText\(""\)/);
    if (offset >= 3) {
      assert.match(source, /quiz = new StudyQuiz\(\)/);
      assert.match(source, /show\(quiz\.view\(\)\)/);
      assert.doesNotMatch(source, /Button|TextField|questionIndex|checkAnswer/);
      assert.match(quiz, /public Column view\(\)/);
    }
  }
  const session = readFileSync(path.join(root, 'teaching/checkpoints/7/StudyQuiz.java'), 'utf8');
  assert.match(session, /if \(answered \|\| finished\) return;/);
  assert.match(session, /check\.setEnabled\(false\)/);
  assert.match(session, /next\.setEnabled\(true\)/);
});
test('Coin movement and scoring lessons use Zero input, drawing and controls', () => {
  for (const [id, lesson] of [[8, '08-movement'], [9, '09-coin-game']]) {
    const directory = path.join(root, `teaching/checkpoints/${id}`);
    const names = id === 8 ? ['Main.java', 'Player.java'] : ['Main.java', 'Player.java', 'Coin.java'];
    for (const name of names) {
      assert.doesNotMatch(readFileSync(path.join(directory, name), 'utf8'), /import javafx\.|KeyCode|setOnAction|layout\(\)|canvas\(\)/);
    }
    assert.doesNotMatch(readFileSync(path.join(root, `student-template/lessons/${lesson}.md`), 'utf8'), /import javafx\.|KeyCode|setOnAction|new HBox|canvas\(\)\.requestFocus/);
    const main = readFileSync(path.join(directory, 'Main.java'), 'utf8');
    for (const arrow of ['LEFT', 'RIGHT', 'UP', 'DOWN']) assert.match(main, new RegExp(`keyDown\\(Key\\.${arrow}\\)`));
    assert.match(main, /player\.update\(horizontal, vertical, seconds/);
    assert.match(main, /player\.draw\(this\)/);
    if (id === 9) {
      assert.match(main, /controls\(new Row\(12, scoreLabel, message, restartButton\)\)/);
      assert.match(main, /showGame\(\)/);
      assert.match(main, /!each\.isCollected\(\) && each\.touches\(player\)/);
    }
  }
});
test('shared component teaching path uses Zero views in both consumers', () => {
  for (const id of [10, 11]) {
    const sources = [];
    for (const kind of ['study', 'game']) {
      const directory = path.join(root, `teaching/checkpoints/${id}/${kind}`);
      const main = readFileSync(path.join(directory, 'Main.java'), 'utf8');
      const display = readFileSync(path.join(directory, 'ScoreDisplay.java'), 'utf8');
      const owner = kind === 'study' ? readFileSync(path.join(directory, 'StudyQuiz.java'), 'utf8') : main;
      sources.push(display);
      for (const text of [main, owner, display]) assert.doesNotMatch(text, /import javafx\.|setOnAction|new VBox|new HBox|\.setDisable\(|answer\.clear\(|canvas\(\)\.requestFocus|setTextFill|setStyle/);
      assert.match(display, /public Element view\(\)/);
      assert.match(display, /import zero\.ui\.Label;/);
      assert.match(owner, /score\.setScore\(points\)/);
      if (id === 11) {
        assert.match(display, /void setCaption\(String caption\)/);
        assert.match(owner, /score\.setCaption\("Score"\)/);
      }
    }
    assert.equal(sources[0], sources[1], 'Study and Game reuse the same component source');
  }
  for (const lesson of ['10-components', '11-zerohub']) {
    const instructions = readFileSync(path.join(root, `student-template/lessons/${lesson}.md`), 'utf8');
    assert.doesNotMatch(instructions, /import javafx\.|label\.setStyle|label\.setTextFill|setColor/);
  }
});
test('media teaching uses explicit Zero resources and retains the shared component', () => {
  const shared = readFileSync(path.join(root, 'teaching/checkpoints/11/game/ScoreDisplay.java'), 'utf8');
  for (const kind of ['media', 'scrolling']) {
    const directory = path.join(root, `teaching/checkpoints/12/${kind}`);
    for (const name of ['Main.java', 'Player.java', 'Coin.java', 'ScoreDisplay.java']) {
      assert.doesNotMatch(readFileSync(path.join(directory, name), 'utf8'), /import javafx\.|getResource\(|AudioClip|setColor|setOnAction|new HBox|canvas\(\)\.requestFocus/);
    }
    assert.equal(readFileSync(path.join(directory, 'ScoreDisplay.java'), 'utf8'), shared);
    const main = readFileSync(path.join(directory, 'Main.java'), 'utf8');
    assert.match(main, /ImageRegion nextSprite = loadImageRegion\("\/media-demo\/player\.png"\)/);
    assert.match(main, /Sound nextChime = loadSound\("\/media-demo\/chime\.wav"\)/);
    assert.match(main, /assetStatus\.setText\(failure\.getMessage\(\)\)/);
    assert.match(main, /artworkButton\.onClick\(\(\) -> loadAssets\(\)\)/);
  }
  assert.doesNotMatch(readFileSync(path.join(root, 'student-template/lessons/12-media.md'), 'utf8'), /import javafx\.|getResource\(|AudioClip|new HBox|setColor/);
});
test('optional asset archive contains only the two media resources', () => {
  const files=gameAssetFiles(root);
  assert.deepEqual(files.map(file=>file.path),['media-demo/player.png','media-demo/chime.wav']);
  const extracted=unzipSync(lessonProjectZip({folder:'',files}));
  for (const file of files) assert.deepEqual(Buffer.from(extracted[file.path]),readFileSync(path.join(root,'student-template/examples/media-demo/resources',file.path)));
  assert.equal(Object.keys(extracted).length,2);
});
test('pet asset archive contains only the maintained image sheet and sound',()=>{
  const files=petAssetFiles(root),extracted=unzipSync(lessonProjectZip({folder:'',files}));
  assert.deepEqual(Object.keys(extracted),['pet/bird-flap-sheet.png','pet/chime.wav']);
  for(const file of files)assert.deepEqual(Buffer.from(extracted[file.path]),readFileSync(path.join(root,'teaching/new-curriculum/pet/resources',file.path)));
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
    assert.deepEqual(publishedTutorialTemplate(item.id),item.publication ? {repository:item.repository,repositoryUrl,templateHref:`${repositoryUrl}/generate`,...(item.publication.scaffoldSha256?{scaffoldSha256:item.publication.scaffoldSha256}:{})} : null);
  }
  const unpublished={schema:1,templates:tutorialTemplateDefinitions.map(item=>({...item,publication:null}))};
  assert.ok(validateTutorialTemplates(unpublished).every(item=>item.publication===null));
  for (const publication of [{}, {repositoryId:1,visibility:'private',isTemplate:true,defaultBranch:'main',commit:'a'.repeat(40),tree:'b'.repeat(40)}]) {
    const metadata={schema:1,templates:tutorialTemplateDefinitions.map(item=>({...item}))};metadata.templates[0].publication=publication;
    assert.throws(()=>validateTutorialTemplates(metadata),/publication/);
  }
});

test('local tutorial drafts pass pristine inventory checks without claiming publication', async t=>{
  const drafts=await prepareTutorialTemplates(root);
  t.after(()=>rmSync(drafts.directory,{recursive:true,force:true}));
  const projects=lessonModule.validateBundle(bundle);
  assert.deepEqual(drafts.templates.map(item=>item.id),['greeting','study','game','pet']);
  assert.equal(drafts.templates.find(item=>item.id==='pet').publication.commit,'d633a67634af3b6c71599ba08eced0f09940f5f2');
  for(const draft of drafts.templates){
    const project=projects.find(item=>item.id===draft.id);
    assert.equal(checkTutorialTemplateDirectory(project,draft.directory),draft.scaffoldSha256);
  }
  const game=drafts.templates[2],project=projects[2];
  writeFileSync(path.join(game.directory,'src/main/java/zero/Key.java'),'// stale helper\n');
  assert.throws(()=>checkTutorialTemplateDirectory(project,game.directory),/source differs.*Key.java/);
  assert.equal(readFileSync(path.join(game.directory,'src/main/java/zero/Key.java'),'utf8'),'// stale helper\n');
});

test('publication coherence gate binds exact source and mode without upgrading projects',()=>{
  const projects=lessonModule.validateBundle(bundle).filter(project=>project.template);
  for(const project of projects)delete project.template.scaffoldSha256;
  assert.throws(()=>checkPublishedTutorialTemplates(projects),/not been verified/);
  for(const project of projects)project.template.scaffoldSha256=readiness.tutorialScaffoldSha256(project.files);
  assert.equal(checkPublishedTutorialTemplates(projects),4);
  projects[0].files.find(file=>file.path==='mvnw').mode=0o644;
  assert.throws(()=>checkPublishedTutorialTemplates(projects),/greeting:/);
  const metadata={schema:1,templates:structuredClone(tutorialTemplateDefinitions)};
  metadata.templates[0].publication.scaffoldSha256='invalid';
  assert.throws(()=>validateTutorialTemplates(metadata),/source evidence/);
});

test('release payload gate checks readiness and exact packaged scaffolds independently',()=>{
  // Explicit unit fixture; this never writes publication evidence for real templates.
  const expected=JSON.parse(JSON.stringify(bundle));
  for(const project of expected.projects){
    project.template??={repository:`codepetca/zero-tutorial-${project.id}`,repositoryUrl:`https://github.com/codepetca/zero-tutorial-${project.id}`,templateHref:`https://github.com/codepetca/zero-tutorial-${project.id}/generate`};
    project.template.scaffoldSha256=readiness.tutorialScaffoldSha256(project.files);
  }
  assert.equal(checkPackagedTutorialTemplates(structuredClone(expected),expected),4);
  const stale=structuredClone(expected);
  stale.projects[0].files.find(file=>file.path==='LICENSE').content=Buffer.from('Changed copyright notice\n').toString('base64');
  assert.throws(()=>checkPackagedTutorialTemplates(stale,expected),/greeting:.*not been verified/);
  // Self-consistent evidence in an old/tampered payload still cannot replace the
  // current source bundle. The independently expected inventory must match too.
  stale.projects[0].template.scaffoldSha256=readiness.tutorialScaffoldSha256(stale.projects[0].files);
  assert.throws(()=>checkPackagedTutorialTemplates(stale,expected),/Packaged tutorials differ/);
  const missing=structuredClone(expected);
  delete missing.projects[1].template.scaffoldSha256;
  assert.throws(()=>checkPackagedTutorialTemplates(missing,expected),/study:.*not been verified/);
});

test('verified Pet passes while unpublished Pet blocks publication and package gates',()=>{
  assert.ok(publishedTutorialTemplate('pet'));
  assert.equal(checkPublishedTutorialTemplates(),4);
  const unavailable=structuredClone(bundle);
  unavailable.projects.find(project=>project.id==='pet').template=null;
  assert.throws(()=>checkPublishedTutorialTemplates(lessonModule.validateBundle(unavailable)),/pet:.*not published/);
  assert.throws(()=>checkPackagedTutorialTemplates(unavailable,unavailable),/pet:.*not published/);
});

test('intermediate refactoring extracts input without growing the tutorial or changing core', () => {
  for (const id of ['10/game','11/game','12/media','12/scrolling']) {
    const directory = path.join(root,'teaching/checkpoints',id);
    const main = readFileSync(path.join(directory,'Main.java'),'utf8');
    const input = readFileSync(path.join(directory,'PlayerInput.java'),'utf8');
    assert.doesNotMatch(main,/keyDown\(|import zero\.Key/);
    assert.match(main,/input = new PlayerInput\(this\)/);
    assert.match(main,/int horizontal = input\.horizontal\(\)/);
    assert.match(main,/int vertical = input\.vertical\(\)/);
    assert.equal((main.match(/new PlayerInput/g)||[]).length,1);
    assert.doesNotMatch(input,/javafx|Timer|Player player|extends |implements /);
    for (const key of ['LEFT','RIGHT','UP','DOWN']) assert.ok(input.includes('game.keyDown(Key.'+key+')'));
    if(id!=='10/game') for(const key of ['W','A','S','D']) assert.ok(input.includes('game.keyDown(Key.'+key+')'));
  }
  const lesson10=readFileSync(path.join(root,'student-template/lessons/10-components.md'),'utf8');
  const lesson11=readFileSync(path.join(root,'student-template/lessons/11-zerohub.md'),'utf8');
  assert.match(lesson10,/refactor/i);assert.match(lesson10,/PlayerInput/);assert.match(lesson11,/proposal/i);
  assert.match(lesson11,/core/i);assert.match(lesson11,/original/i);
});

test('lesson 10 PlayerInput snippet matches the maintained helper and later copies stay identical', () => {
  const markdown=readFileSync(path.join(root,'student-template/lessons/10-components.md'),'utf8');
  const snippet=[...markdown.matchAll(/```java\n([\s\S]*?)```/g)].map(match=>match[1]).find(code=>code.includes('public class PlayerInput'));
  const compact=text=>text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,'');
  assert.equal(compact(snippet),compact(readFileSync(path.join(root,'teaching/checkpoints/10/game/PlayerInput.java'),'utf8')));
  const improved=readFileSync(path.join(root,'teaching/checkpoints/11/game/PlayerInput.java'),'utf8');
  for(const id of ['12/media','12/scrolling'])assert.equal(readFileSync(path.join(root,'teaching/checkpoints',id,'PlayerInput.java'),'utf8'),improved);
});

test('practice contribution uses a harmless badge, not duplicate input utilities', () => {
  const lesson=readFileSync(path.join(root,'student-template/lessons/11-zerohub.md'),'utf8');
  const badge=readFileSync(path.join(root,'teaching/checkpoints/11/game/CreditsBadge.java'),'utf8');
  const snippet=[...lesson.matchAll(/```java\n([\s\S]*?)```/g)].map(m=>m[1]).find(c=>c.includes('public class CreditsBadge'));
  assert.equal(snippet,badge);
  assert.doesNotMatch(badge,/javafx|keyDown|Timer|Player|GameApp/);
  assert.match(lesson,/Copies are expected/);
  assert.match(lesson,/tutorial-credits-badge/);
  assert.match(lesson,/Optional extension: contribute an original idea/);
  assert.match(lesson,/Library publication is currently paused/);
  for(const variant of ['12/media','12/scrolling'])assert.equal(readFileSync(path.join(root,'teaching/checkpoints',variant,'CreditsBadge.java'),'utf8'),badge);
  for(const name of ['LibraryCheck','FirstExample','SecondExample']) {
    const source=readFileSync(path.join(root,'teaching/checkpoints/11/practice',name+'.java'),'utf8');
    assert.doesNotMatch(source,/javafx/);
    assert.match(source,/CreditsBadge/);
    assert.match(source,/throw new AssertionError/);
  }
});


test('Study Main stays unchanged as the quiz and score component grow', () => {
  const first = readFileSync(path.join(root, 'teaching/checkpoints/6/Main.java'), 'utf8');
  for (const id of ['7', '10/study', '11/study']) assert.equal(readFileSync(path.join(root, 'teaching/checkpoints', id, 'Main.java'), 'utf8'), first);
  const lesson = readFileSync(path.join(root, 'student-template/lessons/06-objects.md'), 'utf8');
  for (const name of ['Main.java', 'StudyQuiz.java']) assert.ok(lesson.includes(readFileSync(path.join(root, 'teaching/checkpoints/6', name), 'utf8').trim()), name + ' refactor reference matches the runnable checkpoint');
});
