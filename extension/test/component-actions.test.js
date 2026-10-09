'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {loadCatalog, prepareChange, readProject} = require('../src/components');
const {createComponentActions} = require('../src/component-actions');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const starter = path.join(__dirname, '../../student-template');

// Real catalog/POM files exercise the command boundary without replacing the engine.
async function fixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-component-actions-')));
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  const root = path.join(directory, 'student');
  const catalogPath = path.join(directory, 'catalog.json');
  const repository = path.join(directory, 'repository');
  await fs.mkdir(path.join(root, 'src/main/java'), {recursive:true});
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.copyFile(path.join(starter, 'pom.xml'), path.join(root, 'pom.xml'));
  const java = path.join(root, 'src/main/java/Main.java');
  await fs.writeFile(java, 'class Main { /* student work */ }\n');
  const catalog = {schemaVersion:1, origin:'local-proof', repositorySubdirectory:'repository', latest:'0.1.1',
    library:{groupId:'school.zero.community',artifactId:'zero-community',javaRelease:17,javafxVersion:'21.0.12'}, releases:[],
    components:[{id:'health-bar',name:'HealthBar',className:'zero.community.HealthBar',description:'App health.',api:['Node view()'],examples:[{id:'demo',path:'examples/demo/Main.java',description:'Try health.'}],status:'experimental',license:'UNLICENSED',maintainer:null}]};
  for (const version of ['0.1.0', '0.1.1']) {
    const artifacts = {};
    for (const [kind,suffix] of Object.entries({jar:'.jar',pom:'.pom',sources:'-sources.jar',javadoc:'-javadoc.jar'})) {
      const relative = `school/zero/community/zero-community/${version}/zero-community-${version}${suffix}`;
      const bytes = kind === 'pom' ? `<project><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>${version}</version></project>` : `immutable ${version} ${kind}`;
      await fs.mkdir(path.dirname(path.join(repository, relative)), {recursive:true});
      await fs.writeFile(path.join(repository, relative), bytes);
      artifacts[kind] = {path:relative,sha256:hash(bytes)};
    }
    catalog.releases.push({version,artifacts});
  }
  const saveCatalog = () => fs.writeFile(catalogPath, JSON.stringify(catalog));
  await saveCatalog();
  const source = await loadCatalog(catalogPath);
  const add = await prepareChange(root, source, '0.1.0');
  await fs.writeFile(path.join(root, 'pom.xml'), add.afterText);
  return {directory,root,catalogPath,repository,catalog,source,java,saveCatalog};
}
async function harness(t) {
  const f = await fixture(t);
  const pom = path.join(f.root, 'pom.xml');
  const document = {version:1,isDirty:false,text:await fs.readFile(pom,'utf8'),getText(){return this.text;},positionAt(offset){return {offset};},
    async save(){events.push('save'); if (hooks.save === false) return false; await fs.writeFile(pom,this.text); this.isDirty=false; return true;}};
  const events = [], hooks = {}, messages = [];
  let busy = false, currentRoot = f.root;
  const context = {extensionPath:path.join(f.directory,'extension'),workspaceState:{get:()=>f.catalogPath,update:async()=>{}}};
  const vscode = {Uri:{file:filename=>({fsPath:filename})},Range:class {constructor(start,end){this.start=start;this.end=end;}},
    workspace:{isTrusted:true,openTextDocument:async()=>{events.push('open'); return document;}},
    window:{showInformationMessage:async(message,options,action)=>{messages.push({message,options,action}); if (options?.modal) {events.push('review'); if(hooks.approve) await hooks.approve(); return hooks.cancel ? undefined : action;}},
      showQuickPick:async(items)=>{events.push('pick'); if(hooks.pick) return hooks.pick(items); return items[0];},
      showTextDocument:async()=>{events.push('show'); if(hooks.show) await hooks.show(); return {edit:async(callback)=>{events.push('edit'); let replacement; callback({replace:(range,text)=>{assert.equal(range.start.offset,0); assert.equal(range.end.offset,document.text.length); replacement=text;}}); if(hooks.edit === false) return false; document.text=replacement; document.version++; document.isDirty=true; return true;}};}}};
  const host = {project:async()=>currentRoot,isBusy:()=>busy,setBusy:value=>{busy=value;events.push(value?'busy':'idle');},run:async()=>events.push('run'),captureRunGeneration:()=>17,
    runExample:async(...args)=>{events.push('example'); if(hooks.example) return hooks.example(...args); return true;}};
  const actions = createComponentActions(vscode,context,host);
  return {...f,pom,document,events,hooks,messages,context,vscode,host,actions,setRoot:root=>{currentRoot=root;},isBusy:()=>busy};
}
async function unchanged(h, before) {
  assert.equal(await fs.readFile(h.pom,'utf8'), before);
  assert.equal(await fs.readFile(h.java,'utf8'), 'class Main { /* student work */ }\n');
  assert.equal(h.events.includes('run'), false);
  assert.equal(h.isBusy(), false);
}

test('cancelled native review preserves POM/source and never opens an edit', async t => {
  const h = await harness(t), before = h.document.text;
  h.hooks.cancel=true;
  await h.actions['zero.updateComponents']();
  await unchanged(h,before);
  assert.equal(h.document.text,before);
  assert.equal(h.events.includes('show'),false);
  assert.match(h.messages[0].options.detail,/0\.1\.0 → 0\.1\.1/);
});

test('dirty POM refuses review and preserves unsaved student text', async t => {
  const h = await harness(t), before = h.document.text;
  h.document.text += '<!-- unsaved student setting -->'; h.document.isDirty=true;
  await assert.rejects(h.actions['zero.updateComponents'](),/Save pom.xml/);
  await unchanged(h,before);
  assert.match(h.document.text,/unsaved student setting/);
  assert.equal(h.events.includes('review'),false);
});

for (const phase of ['approve','show']) {
  for (const drift of ['document','root','catalog','disk']) {
    test(`${drift} drift during ${phase} rejects before native edit`, async t => {
      const h = await harness(t), before = h.document.text;
      h.hooks[phase] = async()=>{
        if(drift==='document') { h.document.text += '\n<!-- own edit -->'; h.document.version++; h.document.isDirty=true; }
        if(drift==='root') h.setRoot(path.join(h.directory,'different'));
        if(drift==='catalog') {h.catalog.components[0].description='changed while reviewing'; await h.saveCatalog();}
        if(drift==='disk') await fs.writeFile(h.pom,before+'\n<!-- external change -->');
      };
      await assert.rejects(h.actions['zero.updateComponents'](),/changed/);
      assert.equal(h.events.includes('edit'),false);
      assert.equal(h.events.includes('run'),false);
      assert.equal(h.isBusy(),false);
      assert.equal(await fs.readFile(h.pom,'utf8'),drift==='disk'?before+'\n<!-- external change -->':before);
      assert.equal(await fs.readFile(h.java,'utf8'),'class Main { /* student work */ }\n');
      if(drift==='document') assert.match(h.document.text,/own edit/);
    });
  }
}

test('rejected native edit leaves original bytes and never saves or runs', async t => {
  const h = await harness(t), before = h.document.text;
  h.hooks.edit=false;
  await assert.rejects(h.actions['zero.updateComponents'](),/Review the dependency edit/);
  await unchanged(h,before);
  assert.equal(h.document.text,before);
  assert.equal(h.events.includes('save'),false);
});

test('failed native save retains visible undoable dependency edit and never runs', async t => {
  const h = await harness(t), before = h.document.text;
  h.hooks.save=false;
  await assert.rejects(h.actions['zero.updateComponents'](),/remains in the editor/);
  await unchanged(h,before);
  assert.notEqual(h.document.text,before);
  assert.match(h.document.text,/<version>0\.1\.1<\/version>/);
  assert.equal(h.document.isDirty,true);
});

test('update and revert use native edit, save before run and preserve Java source', async t => {
  const h = await harness(t);
  await h.actions['zero.updateComponents']();
  let installed = await readProject(h.root,h.source);
  assert.equal(installed.currentVersion,'0.1.1'); assert.equal(installed.previousVersion,'0.1.0');
  assert.equal(h.document.isDirty,false);
  assert.deepEqual(h.events.filter(e=>['edit','save','run'].includes(e)),['edit','save','run']);
  h.events.length=0;
  await h.actions['zero.revertComponents']();
  installed=await readProject(h.root,h.source);
  assert.equal(installed.currentVersion,'0.1.0'); assert.equal(installed.previousVersion,'0.1.1');
  assert.deepEqual(h.events.filter(e=>['edit','save','run'].includes(e)),['edit','save','run']);
  assert.equal(await fs.readFile(h.java,'utf8'),'class Main { /* student work */ }\n');
});

test('busy guard serializes commands while modal review is pending and releases after cancel', async t => {
  const h=await harness(t);
  let reached,release;
  const atReview = new Promise(resolve=>{reached=resolve;});
  const pending = new Promise(resolve=>{release=resolve;});
  h.hooks.approve=async()=>{reached(); await pending;}; h.hooks.cancel=true;
  const first=h.actions['zero.updateComponents']();
  await atReview;
  assert.equal(h.isBusy(),true);
  await h.actions['zero.revertComponents']();
  assert.equal(h.events.filter(e=>e==='open').length,1);
  release(); await first;
  assert.equal(h.isBusy(),false);
});

test('untrusted workspace refuses dependency changes and example execution', async t => {
  const h=await harness(t), before=h.document.text;
  h.vscode.workspace.isTrusted=false;
  await assert.rejects(h.actions['zero.updateComponents'](),/Trust this student project/);
  h.hooks.pick=items=>items.find(item=>item.action==='try') || items[0];
  await assert.rejects(h.actions['zero.browseComponents'](),/Trust the workspace/);
  await unchanged(h,before);
  assert.equal(h.events.includes('open'),false);
  assert.equal(h.events.includes('example'),false);
});

test('Try example uses packaged source/wrappers, isolated settings/cache and captured Stop generation', async t => {
  const h=await harness(t), before=h.document.text;
  const assets=path.join(h.context.extensionPath,'media/component-example');
  await fs.mkdir(path.join(assets,'zero'),{recursive:true});
  await fs.copyFile(path.join(starter,'src/main/java/zero/SimpleApp.java'),path.join(assets,'zero/SimpleApp.java'));
  await fs.writeFile(path.join(assets,'Main.java'),'// trusted packaged example\nclass Main {}\n');
  for(const file of ['mvnw','mvnw.cmd']) await fs.copyFile(path.join(starter,file),path.join(assets,file));
  await fs.cp(path.join(starter,'.mvn'),path.join(assets,'.mvn'),{recursive:true});
  // Catalog example paths are descriptions only, never executable source.
  await fs.mkdir(path.join(h.directory,'examples/demo'),{recursive:true});
  await fs.writeFile(path.join(h.directory,'examples/demo/Main.java'),'// untrusted catalog example');
  h.hooks.pick=items=>items.find(item=>item.action==='try') || items[0];
  h.hooks.example=async(destination,args,generation)=>{
    t.after(()=>fs.rm(destination,{recursive:true,force:true}));
    assert.equal(generation,17);
    assert.notEqual(destination,h.root);
    assert.deepEqual(args,['-B','--no-transfer-progress','-s',path.join(destination,'settings.xml'),'-gs',path.join(destination,'settings.xml'),`-Dmaven.repo.local=${path.join(destination,'cache')}`,'compile','javafx:run']);
    for(const file of ['Main.java','zero/SimpleApp.java']) assert.deepEqual(await fs.readFile(path.join(destination,'src/main/java',file)),await fs.readFile(path.join(assets,file)));
    for(const file of ['mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties']) assert.deepEqual(await fs.readFile(path.join(destination,file)),await fs.readFile(path.join(assets,file)));
    assert.match(await fs.readFile(path.join(destination,'pom.xml'),'utf8'),/<version>0\.1\.1<\/version>/);
    assert.equal(await fs.readFile(path.join(destination,'settings.xml'),'utf8'),'<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');
    // Host rejects this generation if Stop was pressed during preparation.
    return false;
  };
  await h.actions['zero.browseComponents']();
  await unchanged(h,before);
  assert.equal(h.document.text,before);
  assert.equal(h.events.includes('example'),true);
  assert.equal(h.messages.some(m=>m.message.includes('build started')),false);
  assert.equal(await fs.readFile(path.join(assets,'Main.java'),'utf8'),'// trusted packaged example\nclass Main {}\n');
});
