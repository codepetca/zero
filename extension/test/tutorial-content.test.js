'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {validateContent,loadContent,browserUrl,renderMarkdown,renderLessons,resolveLink} = require('../src/tutorial-content');
const root = path.resolve(__dirname,'../..');
async function prepared() {
  const {prepareTutorials} = await import(pathToFileURL(path.join(root,'scripts/prepare-tutorials.mjs')));
  return prepareTutorials({check:true});
}
test('all sixteen retained lessons preserve canonical bodies, titles, illustrations and checkpoints',async () => {
  const bundle = await prepared();
  assert.deepEqual(await loadContent(path.join(root,'extension')),bundle);
  assert.equal(bundle.lessons.length,16);
  assert.equal(bundle.groups.length,8);
  for (const lesson of bundle.lessons) {
    assert.equal(lesson.markdown,fs.readFileSync(path.join(root,lesson.source),'utf8'));
    assert.equal(fs.readFileSync(path.join(root,'extension/media/tutorial-assets',lesson.asset),'utf8'),fs.readFileSync(path.join(root,'student-template/lessons/visuals',lesson.asset),'utf8'));
    assert.doesNotMatch(lesson.markdown,/\*\*Done:|Code and explanation/);
    const steps = [...lesson.markdown.matchAll(/^## (\d+)\. /gm)].map(match=>Number(match[1]));
    assert.deepEqual(steps,steps.map((_,index)=>index+1));
    assert.ok(steps.length >= 2);
    for (const [name,text] of Object.entries(lesson.references)) assert.equal(text,fs.readFileSync(path.join(root,name),'utf8'));
    for (const match of lesson.markdown.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(resolveLink(lesson,match[1],bundle),`${lesson.id}: unresolved ${match[1]}`);
  }
  const {prepareTutorials} = await import(pathToFileURL(path.join(root,'scripts/prepare-tutorials.mjs')));
  assert.doesNotThrow(() => prepareTutorials({check:true}));
});
test('rendered lessons show numbered code actions directly and keep comparison references optional', async () => {
  const bundle = await prepared();
  const result = renderLessons(bundle,{assetUri:name => `webview://asset/${name}`});
  assert.equal((result.articles.match(/<article /g) || []).length,16);
  assert.match(result.articles,/What is 2 \+ 3/);
  assert.match(result.articles,/Optional stage 2: scroll a wider world/);
  assert.doesNotMatch(result.articles,/Code and explanation|Done:|class="quick-path"|class="explanation"/);
  for (const lesson of bundle.lessons) {
    const article = result.articles.split(`data-lesson-id="${lesson.id}"`)[1].split('</article>')[0];
    const body = article.split('<div class="lesson-content">')[1].split('<section class="references"')[0];
    assert.doesNotMatch(body,/<details|<summary|class="code-line"|&lt;br&gt;/);
    assert.match(body,/<h2>1\. /);
    for (const match of lesson.markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)) assert.ok([...result.copies.values()].includes(match[1].replace(/\n$/,'')),`Lesson ${lesson.id} exact code copy`);
  }
  assert.match(result.articles,/Compare your code/);
  assert.match(result.articles,/Reference file lines/);
  assert.match(result.articles,/<span class="code-line">import /);
  assert.match(result.articles,/line numbers may differ from your own file/);
  assert.doesNotMatch(result.navigation,/<optgroup label="Study quiz">/);
  assert.match(result.navigation,/<optgroup label="Earlier lessons" hidden>/);
  assert.match(result.navigation,/<option value="3">A tiny quiz<\/option>/);
  const exact = bundle.lessons.find(lesson=>lesson.id==='3').references['teaching/checkpoints/3/Main.java'];
  assert.ok([...result.copies.values()].includes(exact));
  assert.ok(!/<script|onclick=|href="(?:https?:|command:|file:)/i.test(result.articles));
  const html = renderMarkdown('<script>alert(1)</script> **bold** `a < b` [bad](javascript:bad)');
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/<code>a &lt; b<\/code>/);
  assert.doesNotMatch(html,/<script|javascript:/);
});
test('content validation and link allowlists reject hostile and malformed replacements',async () => {
  const bundle = await prepared();
  for (const mutate of [value => value.lessons.pop(),value => value.lessons[0].id='../../0',value => value.lessons[1].id='15',value => value.lessons[0].asset='../bad.svg',value => value.lessons[0].references['../../secret']='bad',value => value.groups[0].lessons=['0']]) {
    const changed = structuredClone(bundle);mutate(changed);assert.throws(() => validateContent(changed));
  }
  for (const url of ['javascript:alert(1)','command:workbench.action.files.save','file:///secret','https://evil.test','https://zero.codepet.ca.evil.test/hub','../../secret']) assert.equal(resolveLink(bundle.lessons[0],url,bundle),null,url);
  assert.deepEqual(resolveLink(bundle.lessons[11],'https://zero.codepet.ca/hub?kind=practice',bundle),{external:'https://zero.codepet.ca/hub?kind=practice'});
  for(const url of ['https://zero.codepet.ca/hub?kind=practice&redirect=evil','https://zero.codepet.ca/hub?kind=unknown'])assert.equal(resolveLink(bundle.lessons[11],url,bundle),null);
  assert.equal(browserUrl('12'),'https://zero.codepet.ca/tutorials/12');
  assert.equal(browserUrl('13'),'https://zero.codepet.ca/tutorials/13');
  assert.equal(browserUrl('14'),'https://zero.codepet.ca/tutorials/14');
  for (const id of ['16',1,'../1','1?redirect=evil']) assert.throws(() => browserUrl(id));
});

test('main and optional navigation share explicit edges without renumbering old lessons',async () => {
  const bundle=await prepared(),{articles}=renderLessons(bundle,{assetUri:name=>name});
  const pagination=id=>articles.split(`data-lesson-id="${id}"`)[1].split('</article>')[0].split('<nav class="pagination"')[1];
  for(const [from,to] of [['15','0'],['0','1'],['1','2'],['2','8'],['8','9'],['9','13'],['13','14'],['3','4'],['6','7'],['10','11']]) assert.match(pagination(from),new RegExp(`class="primary" data-lesson="${to}"`));
  for(const end of ['7','11','12','14']) {
    assert.doesNotMatch(pagination(end),/data-index="true"/);
    assert.doesNotMatch(pagination(end),/class="primary" data-lesson=/);
  }
  const pet=bundle.lessons.find(lesson=>lesson.id==='13');
  assert.deepEqual(resolveLink(pet,'https://zero.codepet.ca/generated/learning-assets/pet-assets.zip',bundle),{external:'https://zero.codepet.ca/generated/learning-assets/pet-assets.zip'});
  assert.equal(resolveLink(pet,'https://zero.codepet.ca/generated/learning-assets/pet-assets.zip?redirect=evil',bundle),null);
  for(const mutate of [value=>value.groups[1].id='wrong',value=>value.groups[1].lessons.reverse(),value=>value.lessons.find(lesson=>lesson.id==='13').source='student-template/lessons/13-other.md',value=>value.lessons.find(lesson=>lesson.id==='13').references['teaching/checkpoints/13/4/Main.java']='class Main {}']) {
    const bad=structuredClone(bundle);mutate(bad);assert.throws(()=>validateContent(bad));
  }
});
