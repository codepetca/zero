import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {classify, scopeForEvent, isKitPublicationPromotion} from './ci-scope.mjs';

test('guidance and docs avoid unrelated native/export/install checks', () => {
  for (const file of ['AGENTS.md', '.ai/CURRENT.md', 'docs/DEVELOPMENT.md']) {
    const s=classify([file]);
    assert.equal(s.native,false); assert.equal(s.browser,false); assert.equal(s.windows,false);
    assert.equal(s.website,file.startsWith('docs/'));
  }
});
test('Dev tooling and its native harness select their actual dependencies', () => {
  assert.equal(classify(['scripts/zero-dev.test.mjs']).windows,false);
  for (const file of ['scripts/zero-dev.mjs','scripts/dev/ZeroDevPlayCheck.java']) {
    const s=classify([file]); assert.equal(s.native,true); assert.equal(s.browser,false); assert.equal(s.windows,false);
  }
});
test('known UI selects source checks and shared styles also select website', () => {
  const s=classify(['extension/src/start-page.js']); assert.equal(s.source,true); assert.equal(s.windows,false); assert.equal(s.browser,false);
  assert.equal(classify(['extension/media/controls.css']).website,true);
});
test('public Java, exports, auth and transitive shared inputs retain full checks', () => {
  for(const file of ['framework/src/main/java/zero/App.java','framework/checks/zero/GameHelpersCheck.java','student-template/README.md','student-template/.mvn/wrapper/maven-wrapper.properties','teaching/projects.mjs','website/lib/learning.mjs','website/lib/project-curriculum.mjs','website/lib/installer.mjs','website/lib/local-installer.mjs','website/lib/update-feed.mjs','website/lib/contracts.mjs','website/lib/new-helper.mjs','design/brand/zero.svg','scripts/process-specification.mjs','extension/src/core.js','extension/src/web-export/index.js','extension/src/web-publishing.js','extension/src/github-app/auth.js','profile/Zero.code-profile','release/kit.json','package-lock.json','.github/workflows/web-export.yml']) {
    assert.ok(Object.values(classify([file])).every(v=>v===true),file);
  }
});
test('website-only code stays scoped; unknown, malformed and empty input fail closed', () => {
  const s=classify(['website/app/page.tsx']); assert.equal(s.website,true); assert.equal(s.windows,false);
  for(const files of [[],null,['new-shared-runtime.js'],['../docs/test.md'],['docs/../profile/test.md'],['/docs/test.md'],['docs\\test.md'],['docs/test.md\nprofile/Zero.code-profile']])
    assert.ok(Object.values(classify(files)).every(v=>v===true),JSON.stringify(files));
});
test('mixed and renamed inputs take the union, including deleted old paths', () => {
  const s=classify(['extension/src/start-page.js','docs/DEVELOPMENT.md']);
  assert.equal(s.source,true); assert.equal(s.website,true); assert.equal(s.browser,false);
  assert.ok(Object.values(classify(['extension/src/start-page.js','unknown.cfg'])).every(v=>v===true));
});
test('PR diff reads actual commits with deletion/rename and fails closed on unavailable history', () => {
  const root=mkdtempSync(path.join(os.tmpdir(),'zero-ci-scope-'));
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  try {
    git('init','-q');
    // This disposable repository must not launch maintenance that outlives Git.
    git('config','maintenance.auto','false');
    git('config','user.name','CI fixture');git('config','user.email','ci@example.invalid');
    mkdirSync(path.join(root,'profile'));writeFileSync(path.join(root,'profile/Zero.code-profile'),'{}');git('add','.');git('commit','-qm','base'); const base=git('rev-parse','HEAD');
    writeFileSync(path.join(root,'AGENTS.md'),'guide');git('add','.');git('commit','-qm','guidance only');
    const scoped=scopeForEvent({pull_request:{base:{sha:base},head:{sha:git('rev-parse','HEAD')}}},root);
    assert.equal(scoped.windows,false);assert.equal(scoped.browser,false);assert.equal(scoped.source,false);
    git('rm','AGENTS.md');git('mv','profile/Zero.code-profile','AGENTS.md');git('commit','-qm','rename across scope');const head=git('rev-parse','HEAD');
    const event={pull_request:{base:{sha:base},head:{sha:head}}};assert.ok(Object.values(scopeForEvent(event,root)).every(v=>v===true));
    assert.ok(Object.values(scopeForEvent({pull_request:{base:{sha:'a'.repeat(40)},head:{sha:head}}},root)).every(v=>v===true));
    assert.ok(Object.values(scopeForEvent({},root)).every(v=>v===true));
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('only exact three-asset local-to-published kit metadata qualifies for promotion', () => {
  const before={schema:1,kitVersion:'0.5.55',coreVersion:'0.3.0',publication:{status:'local',repository:'codepetca/zero',tag:'v0.5.55'},assets:{
    kit:{filename:'zero-bootstrap.zip',label:'Complete Zero kit'},starter:{filename:'zero-starter.zip',label:'Starter project'},extension:{filename:'zero-0.5.55.vsix',label:'Zero extension'}}};
  const after=structuredClone(before);after.publication.status='published';
  for(const asset of Object.values(after.assets))Object.assign(asset,{size:123,sha256:'a'.repeat(64),url:`https://github.com/codepetca/zero/releases/download/v0.5.55/${asset.filename}`});
  assert.equal(isKitPublicationPromotion(before,after),true);
  for(const mutate of [
    value=>value.kitVersion='0.5.56',value=>value.coreVersion='0.4.0',value=>value.publication.tag='v0.5.56',
    value=>value.publication.repository='other/zero',value=>value.publication.status='local',
    value=>value.assets.kit.filename='replacement.zip',value=>value.assets.kit.label='Changed label',
    value=>value.assets.kit.size=0,value=>value.assets.kit.size=1.5,value=>value.assets.kit.sha256='bad',value=>value.assets.kit.sha256=['a'.repeat(64)],
    value=>value.assets.kit.url+='?redirect=elsewhere',value=>value.assets.kit.url=value.assets.kit.url.replace('codepetca','other'),
    value=>delete value.assets.starter,value=>value.assets.extra={filename:'unexpected.zip'},value=>value.unexpected=true,
    value=>value.assets.kit.unexpected=true
  ]) {const invalid=structuredClone(after);mutate(invalid);assert.equal(isKitPublicationPromotion(before,invalid),false);}
  assert.equal(isKitPublicationPromotion(after,after),false,'published asset edits are not promotions');
  assert.equal(isKitPublicationPromotion(null,after),false);
  assert.ok(Object.values(classify(['release/kit.json'])).every(Boolean),'a path alone cannot establish safe metadata');
});
test('real Git publication diff scopes metadata while mixed runtime and CI changes remain full', () => {
  const root=mkdtempSync(path.join(os.tmpdir(),'zero-ci-kit-promotion-'));
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  const write=(file,value)=>{mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));};
  try {
    git('init','-q');git('config','maintenance.auto','false');git('config','user.name','CI fixture');git('config','user.email','ci@example.invalid');
    const before={schema:1,kitVersion:'0.5.55',coreVersion:'0.3.0',publication:{status:'local',repository:'codepetca/zero',tag:'v0.5.55'},assets:{
      kit:{filename:'zero-bootstrap.zip',label:'Kit'},starter:{filename:'zero-starter.zip',label:'Starter'},extension:{filename:'zero-0.5.55.vsix',label:'Extension'}}};
    write('release/kit.json',before);git('add','.');git('commit','-qm','local kit');const base=git('rev-parse','HEAD');
    const after=structuredClone(before);after.publication.status='published';
    for(const asset of Object.values(after.assets))Object.assign(asset,{size:123,sha256:'a'.repeat(64),url:`https://github.com/codepetca/zero/releases/download/v0.5.55/${asset.filename}`});
    const scope=baseSha=>scopeForEvent({pull_request:{base:{sha:baseSha||base},head:{sha:git('rev-parse','HEAD')}}},root);
    const publish=()=>{write('release/kit.json',after);git('add','.');git('commit','-qm','publish measured metadata');};
    publish();const promotedHead=git('rev-parse','HEAD');
    assert.deepEqual(scope(),{source:true,native:false,browser:false,windows:false,website:true,sharing:false,lessons:false});
    write('README.md','updated public download');git('add','.');git('commit','-qm','document download');assert.equal(scope().windows,false);
    for(const file of ['extension/src/native-updates.js','native-installer/windows/Program.cs','framework/src/main/java/zero/App.java','student-template/README.md','release/START-HERE.md','scripts/ci-scope.mjs','scripts/ci-scope.test.mjs','.github/workflows/windows-native.yml','unknown.cfg']) {
      git('reset','--hard',promotedHead);write(file,'changed executable or unknown input');git('add','.');git('commit','-qm','mixed change');
      assert.ok(Object.values(scope()).every(Boolean),file);
    }
    git('reset','--hard',base);const changed=structuredClone(after);changed.coreVersion='0.4.0';write('release/kit.json',changed);git('add','.');git('commit','-qm','mixed manifest change');assert.ok(Object.values(scope()).every(Boolean));
    write('release/kit.json','invalid JSON');git('add','.');git('commit','-qm','malformed manifest');assert.ok(Object.values(scope()).every(Boolean));
    git('reset','--hard',base);git('rm','release/kit.json');git('commit','-qm','remove manifest');assert.ok(Object.values(scope()).every(Boolean));
    git('reset','--hard',promotedHead);assert.ok(Object.values(scopeForEvent({},root)).every(Boolean),'manual runs stay full');
    // Compare publication metadata at the merge base, matching the path diff,
    // even when the target branch has advanced independently.
    git('checkout','-qb','advanced-base',base);write('docs/advance.md','new base docs');git('add','.');git('commit','-qm','advance target');const advanced=git('rev-parse','HEAD');
    git('checkout','--detach',promotedHead);assert.equal(scope(advanced).windows,false);
  } finally {rmSync(root,{recursive:true,force:true});}
});
