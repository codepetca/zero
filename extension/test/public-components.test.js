'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {loadPublicCatalog, prepareChange, readProject, validatePrepared, verifyRelease} = require('../src/components');
const {CATALOG_URL, REPOSITORY_URL} = require('../src/public-components');
const {publicFixture} = require('./helpers/public-catalog.cjs');
async function app(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero public consumer ')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'zero.json'),'{}');
  await fs.copyFile(path.join(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
  await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});
  await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main { int myWork = 42; }');
  return root;
}
test('public Add/Update/Revert uses portable Maven HTTPS and retains exact source/history', async t => {
  const root = await app(t), f = publicFixture(), context = await loadPublicCatalog({fetch:f.fetch});
  const before = await fs.readFile(path.join(root,'pom.xml'),'utf8');
  const add = await prepareChange(root,context,'0.1.2');
  assert.match(add.afterText,/<id>zero-community-public<\/id>/);
  assert.match(add.afterText,/<url>https:\/\/zero\.codepet\.ca\/community\/maven<\/url>/);
  assert.equal(add.afterText.includes('file:'),false);
  assert.equal(context.catalogPath,undefined); assert.equal(context.repositoryPath,undefined);
  assert.equal(await validatePrepared(add,context),true);
  assert.equal(await fs.readFile(path.join(root,'pom.xml'),'utf8'),before);
  await fs.writeFile(path.join(root,'pom.xml'),add.afterText);
  await assert.rejects(prepareChange(root,context,null,{operation:'revert'}),/Revert becomes available after updating/);
  const update = await prepareChange(root,context,'0.1.3',{operation:'update'});
  await fs.writeFile(path.join(root,'pom.xml'),update.afterText);
  const revert = await prepareChange(root,context,null,{operation:'revert'});
  await fs.writeFile(path.join(root,'pom.xml'),revert.afterText);
  const installed = await readProject(root,context);
  assert.equal(installed.currentVersion,'0.1.2'); assert.equal(installed.previousVersion,'0.1.3');
  assert.equal(await fs.readFile(path.join(root,'src/main/java/Main.java'),'utf8'),'class Main { int myWork = 42; }');
  assert.ok(f.requests.some(item=>item.url.endsWith('-sources.jar')));
  assert.ok(f.requests.some(item=>item.url.endsWith('-javadoc.jar')));
  assert.ok(f.requests.every(item=>item.url === CATALOG_URL || item.url.startsWith(REPOSITORY_URL+'/')));
  assert.ok(f.requests.every(item=>item.options.redirect === 'error' && item.options.credentials === 'omit'));
});
test('one public release is usable without fabricating an Update/Revert version', async t => {
  const f = publicFixture(['0.1.2']), root = await app(t), context = await loadPublicCatalog({fetch:f.fetch});
  const add = await prepareChange(root,context,'0.1.2');
  await fs.writeFile(path.join(root,'pom.xml'),add.afterText);
  await assert.rejects(prepareChange(root,context,'0.1.2',{operation:'update'}),/already installed/);
  await assert.rejects(prepareChange(root,context,null,{operation:'revert'}),/No preceding library version/);
});
test('fixed public root rejects overrides, executable fields, malformed provenance and missing artifacts', async () => {
  const edits = [
    c=>{c.repositoryUrl='https://attacker.example/maven';}, c=>{c.publication.status='local';},
    c=>{c.library.groupId='attacker';}, c=>{c.library.javaRelease=21;}, c=>{c.library.javafxVersion='24';},
    c=>{c.command='curl attacker';}, c=>{c.releases[0].artifacts.jar.url='https://github.com/attacker/library/releases/download/v0.1.2/library.jar';},
    c=>{c.releases[0].artifacts.jar.path='../escape.jar';}, c=>{c.releases[0].artifacts.jar.sha256='0';},
    c=>{c.releases[0].artifacts.jar.size=2*1024*1024+1;}, c=>{delete c.releases[0].artifacts.sources;},
    c=>{c.releases[0].sourceRevision='main';}, c=>{c.releases[0].sourceRevision=['a'.repeat(40)];}, c=>{c.releases[0].artifacts.jar.sha256=['a'.repeat(64)];}, c=>{c.releases.push(c.releases[0]);},
    c=>{c.components[0].examples[0].command='mvnw attacker';}, c=>{c.components[0].examples[0].path='../Main.java';},
    c=>{c.components[0].license='UNLICENSED';}
  ];
  for (const edit of edits) {
    const f = publicFixture(); edit(f.catalog);
    await assert.rejects(loadPublicCatalog({fetch:f.fetch}));
    assert.deepEqual(f.requests.map(item=>item.url),[CATALOG_URL]);
  }
});
test('public payload corruption/size mismatch refuses plans and does not change project files', async t => {
  const root = await app(t), f = publicFixture(), context = await loadPublicCatalog({fetch:f.fetch});
  const before = await fs.readFile(path.join(root,'pom.xml'),'utf8');
  const artifact = f.catalog.releases[0].artifacts.jar;
  f.artifacts.set(`${REPOSITORY_URL}/${artifact.path}`,Buffer.alloc(artifact.size,0));
  await assert.rejects(prepareChange(root,context,'0.1.2'),/digest or size/);
  f.artifacts.set(`${REPOSITORY_URL}/${artifact.path}`,Buffer.from('short'));
  await assert.rejects(prepareChange(root,context,'0.1.2'),/digest or size/);
  assert.equal(await fs.readFile(path.join(root,'pom.xml'),'utf8'),before);
});
test('optional Workshop receipts belong to each release and use its version and gateway size limit', async () => {
  const f = publicFixture(), context = await loadPublicCatalog({fetch:f.fetch});
  assert.equal(context.catalog.releases[0].workshop.filename,'zero-community-workshop-0.1.2.zip');
  assert.equal(context.catalog.releases[1].workshop.filename,'zero-community-workshop-0.1.3.zip');
  const edits = [
    c=>{c.workshop=c.releases[0].workshop;},
    c=>{c.releases[0].workshop=c.releases[1].workshop;},
    c=>{c.releases[0].workshop.url='https://attacker.example/workshop.zip';},
    c=>{c.releases[0].workshop.size=2*1024*1024+1;},
    c=>{c.releases[0].workshop.command='run candidate';}
  ];
  for(const edit of edits) {
    const invalid=publicFixture(); edit(invalid.catalog);
    await assert.rejects(loadPublicCatalog({fetch:invalid.fetch}));
  }
  for(const release of f.catalog.releases) delete release.workshop;
  assert.equal((await loadPublicCatalog({fetch:f.fetch})).catalog.latest,'0.1.3');
});
test('digest-valid artifact POM still needs catalog coordinates and MIT license', async () => {
  const f = publicFixture();
  f.replace('pom','0.1.2','<project><groupId>attacker</groupId><artifactId>zero-community</artifactId><version>0.1.2</version></project>');
  await assert.rejects(verifyRelease(await loadPublicCatalog({fetch:f.fetch}),'0.1.2'),/coordinates/);
  f.replace('pom','0.1.2','<project><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>0.1.2</version><licenses><license><name>Other</name></license></licenses></project>');
  await assert.rejects(verifyRelease(await loadPublicCatalog({fetch:f.fetch}),'0.1.2'),/MIT license/);
});
test('public catalog and artifact drift after review reject before applying a plan', async t => {
  const root = await app(t), f = publicFixture(), context = await loadPublicCatalog({fetch:f.fetch});
  const plan = await prepareChange(root,context,'0.1.2');
  f.catalog.releases[0].notes='Changed after review.';
  await assert.rejects(validatePrepared(plan,context),/catalog or public repository changed/);
  f.catalog.releases[0].notes='HealthBar 0.1.2: explicit updates and MIT notices.';
  const jar = f.catalog.releases[0].artifacts.jar;
  f.artifacts.set(`${REPOSITORY_URL}/${jar.path}`,Buffer.alloc(jar.size));
  await assert.rejects(validatePrepared(plan,context),/digest or size/);
  assert.equal(await fs.readFile(path.join(root,'pom.xml'),'utf8'),plan.beforeText);
});
test('network and body reads have bounded deadlines, failures retry on the next action', async () => {
  const f = publicFixture();
  f.hooks.fetch=()=>new Promise(()=>{});
  await assert.rejects(loadPublicCatalog({fetch:f.fetch,timeoutMs:20}),/timed out/);
  f.hooks.fetch=()=>new Response(new ReadableStream({start(){}}));
  await assert.rejects(loadPublicCatalog({fetch:f.fetch,timeoutMs:20}),/timed out/);
  f.hooks.fetch=()=>new Response('Service unavailable',{status:503});
  await assert.rejects(loadPublicCatalog({fetch:f.fetch}),/HTTP 503/);
  f.hooks.fetch=()=>{throw new Error('ECONNRESET');};
  await assert.rejects(loadPublicCatalog({fetch:f.fetch}),/Check your connection/);
  delete f.hooks.fetch;
  assert.equal((await loadPublicCatalog({fetch:f.fetch})).catalog.latest,'0.1.3');
});
test('size bounds and redirects fail before accepting a public catalog', async () => {
  const f = publicFixture();
  f.hooks.fetch=()=>new Response('x',{headers:{'content-length':String(2*1024*1024)}});
  await assert.rejects(loadPublicCatalog({fetch:f.fetch}),/size limit/);
  f.hooks.fetch=()=>new Response(Buffer.alloc(1024*1024+1));
  await assert.rejects(loadPublicCatalog({fetch:f.fetch}),/size limit/);
  f.hooks.fetch=()=>({ok:true,url:'https://attacker.example/catalog',headers:new Headers(),body:new ReadableStream()});
  await assert.rejects(loadPublicCatalog({fetch:f.fetch}),/redirected/);
});
