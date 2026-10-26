import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, mkdir, cp, rm, symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {JAM_TEMPLATE_FILES,JAM_TEMPLATE_VERSION,jamTemplateFiles,createJamTemplateZip} from '../lib/jam-template.mjs';
const sourceRoot=new URL('../../jam-template/',import.meta.url);
const execute=promisify(execFile);

test('template inventory refuses linked files/directories rather than downloading unrelated local bytes',async()=>{
  const temporary=await mkdtemp(join(tmpdir(),'zero-jam-linked-'));
  try {
    const root=join(temporary,'template');await cp(sourceRoot,root,{recursive:true});
    const outside=join(temporary,'unrelated.txt');await writeFile(outside,'unrelated private fixture');
    await rm(join(root,'assets/jam.css'));await symlink(outside,join(root,'assets/jam.css'));
    await assert.rejects(()=>jamTemplateFiles('game',root),/linked/);
    await rm(join(root,'assets'),{recursive:true});await symlink(fileURLToPath(new URL('assets/',sourceRoot)),join(root,'assets'));
    await assert.rejects(()=>jamTemplateFiles('game',root),/linked/);
  }finally{await rm(temporary,{recursive:true,force:true});}
});

test('template generation resolves canonical source from root, website and traced deployment cwd',async()=>{
  const expected=createHash('sha256').update(await createJamTemplateZip('app')).digest('hex');
  const helper=new URL('../lib/jam-template.mjs',import.meta.url).href;
  const script=`const {createHash}=await import('node:crypto');const {createJamTemplateZip}=await import(process.argv[1]);process.stdout.write(createHash('sha256').update(await createJamTemplateZip('app')).digest('hex'));`;
  const temporary=await mkdtemp(join(tmpdir(),'zero-jam-trace-'));
  try {
    await mkdir(join(temporary,'website'));
    await cp(sourceRoot,join(temporary,'jam-template'),{recursive:true});
    const directories=[fileURLToPath(new URL('../../',import.meta.url)),fileURLToPath(new URL('../',import.meta.url)),temporary,join(temporary,'website')];
    for(const cwd of directories) {
      const {stdout}=await execute(process.execPath,['--input-type=module','--eval',script,helper],{cwd});
      assert.equal(stdout,expected,`same complete ZIP from ${cwd}`);
    }
  }finally{await rm(temporary,{recursive:true,force:true});}
});

test('both template ZIPs contain every independent source byte, with only manifest variants',async()=>{
  for(const type of ['game','app']) {
    const files=await jamTemplateFiles(type),zip=await createJamTemplateZip(type),decoded=unzipSync(zip);
    assert.deepEqual(Object.keys(files).sort(),[...JAM_TEMPLATE_FILES].sort());
    assert.deepEqual(Object.keys(decoded).sort(),JAM_TEMPLATE_FILES.map(path=>`zero-${type}-jam/${path}`).sort());
    for(const path of JAM_TEMPLATE_FILES) {
      assert.deepEqual(decoded[`zero-${type}-jam/${path}`],files[path],path);
      if(path!=='zero-jam.json')assert.deepEqual(files[path],new Uint8Array(await readFile(new URL(path,sourceRoot))),path);
    }
    const manifest=JSON.parse(strFromU8(files['zero-jam.json']));
    assert.equal(manifest.type,type);assert.equal(manifest.schema,1);assert.equal(manifest.templateVersion,JAM_TEMPLATE_VERSION);
    assert.equal(manifest.websiteUrl,'https://example.com/your-jam/');
    for(const instant of Object.values(manifest.schedule))assert.ok(Number.isFinite(Date.parse(instant))&&instant.endsWith('Z'));
    assert.deepEqual(zip,await createJamTemplateZip(type),'unchanged source downloads are reproducible');
  }
  await assert.rejects(()=>jamTemplateFiles('invalid'),/Choose Game Jam or App Jam/);
});

test('source inventory includes local assets, README and only commit-pinned deployment actions',async()=>{
  const files=await jamTemplateFiles('game'),index=strFromU8(files['index.html']),script=strFromU8(files['assets/jam.js']),workflow=strFromU8(files['.github/workflows/pages.yml']);
  for(const [,path] of index.matchAll(/(?:src|href)="(assets\/[^"]+)"/g))assert.ok(files[path],`local asset exists: ${path}`);
  const actions=[...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map(match=>match[1]);
  assert.equal(actions.length,4);for(const action of actions)assert.match(action,/^actions\/[\w-]+@[a-f0-9]{40}$/);
  assert.match(workflow,/cp index\.html zero-jam\.json LICENSE _site\//);assert.match(workflow,/cp -R assets _site\/assets/);
  assert.doesNotMatch(workflow,/npm install|npm ci|secrets\./);
  assert.doesNotMatch(index+script,/https:\/\/.*\.(?:js|css)["']/);
  assert.doesNotMatch(script,/innerHTML|postMessage|Authorization|method:\s*['"]POST/);
  assert.match(script,/textContent/);assert.match(script,/https:\/\/zero\.codepet\.ca\/hub\/jams/);
  assert.match(index,/target="_blank" rel="noopener noreferrer"/);
  const readme=strFromU8(files['README.md']);
  assert.match(readme,/no separately\s+published GitHub template repository/);
  assert.match(readme,/including the\s+hidden `\.github` folder/);
  assert.match(readme,/does not change approved rules/);
});

test('independent copies retain the exact canonical MIT notice and publish it with public source',async()=>{
  const files=await jamTemplateFiles('game');
  assert.deepEqual(files.LICENSE,new Uint8Array(await readFile(new URL('../../LICENSE',import.meta.url))));
  assert.match(strFromU8(files['assets/jam.js']),/Copyright \(c\) 2026 Codepet Inc\. MIT license/);
  assert.match(strFromU8(files['README.md']),/Keep its notice with reused/);
});
