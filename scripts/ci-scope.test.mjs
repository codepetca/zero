import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {classify, scopeForEvent} from './ci-scope.mjs';

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
