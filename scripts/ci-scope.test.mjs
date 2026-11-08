import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createAppcast,hash} from './mac-update-feed.mjs';
import {sparklePin,updaterFeedURL} from './mac-updater.mjs';
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
test('publication metadata and classifier changes narrow only alongside a verified kit promotion', () => {
  const expected={source:true,native:false,browser:false,windows:false,website:true,sharing:false,lessons:false};
  for(const file of ['release/kit.json','release/published-kit.json','release/installer.json','release/published-installer.json','release/mac-appcast.xml','release/mac-update-feed.json']) {
    assert.ok(Object.values(classify([file])).every(Boolean),`${file} alone stays full`);
    assert.deepEqual(classify(['release/kit.json',file],{kitPublicationPromotion:true}),expected);
  }
  for(const files of [['scripts/ci-scope.mjs'],['scripts/ci-scope.test.mjs'],['scripts/ci-scope.mjs','scripts/ci-scope.test.mjs','docs/FAST-DEV-FLOW.md']]) {
    assert.ok(Object.values(classify(files)).every(Boolean),'standalone classifier edits stay full');
    assert.deepEqual(classify(['release/kit.json',...files],{kitPublicationPromotion:true}),expected);
  }
  for(const file of ['scripts/ci-gate.mjs','scripts/ci-gate.test.mjs','scripts/ci-browser.mjs','scripts/ci-scope-new.mjs','.github/workflows/ci-scope.yml','.github/workflows/windows-native.yml','.github/workflows/web-export.yml','native-installer/windows/Program.cs','extension/src/web-export/index.js','extension/src/web-publishing.js','extension/src/core.js']) {
    assert.ok(Object.values(classify(['release/kit.json','scripts/ci-scope.mjs',file],{kitPublicationPromotion:true})).every(Boolean),file);
  }
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
    write('scripts/ci-scope.mjs','standalone classifier change');git('add','.');git('commit','-qm','classifier only');assert.ok(Object.values(scope()).every(Boolean));git('switch','-c','promotion',base);
    publish();const promotedHead=git('rev-parse','HEAD');
    assert.deepEqual(scope(),{source:true,native:false,browser:false,windows:false,website:true,sharing:false,lessons:false});
    write('README.md','updated public download');git('add','.');git('commit','-qm','document download');assert.equal(scope().windows,false);
    git('switch','-c','classifier-contracts',git('rev-parse','HEAD'));write('scripts/ci-scope.mjs','classifier change');write('scripts/ci-scope.test.mjs','selection regressions');write('docs/FAST-DEV-FLOW.md','document dependency scope');git('add','.');git('commit','-qm','promotion and classifier contracts');
    const recovery=git('rev-parse','HEAD');
    assert.deepEqual(scope(),{source:true,native:false,browser:false,windows:false,website:true,sharing:false,lessons:false});
    let caseNumber=0;
    for(const file of ['extension/src/native-updates.js','native-installer/windows/Program.cs','framework/src/main/java/zero/App.java','student-template/README.md','release/START-HERE.md','scripts/ci-gate.mjs','scripts/ci-scope-new.mjs','.github/workflows/windows-native.yml','.github/workflows/web-export.yml','.github/workflows/ci-scope.yml','extension/src/web-export/index.js','extension/src/web-publishing.js','extension/src/core.js','unknown.cfg']) {
      git('switch','-c',`mixed-${++caseNumber}`,recovery);write(file,'changed executable or unknown input');git('add','.');git('commit','-qm','mixed change');
      assert.ok(Object.values(scope()).every(Boolean),file);
    }
    git('switch','-c','mixed-manifest',base);const changed=structuredClone(after);changed.coreVersion='0.4.0';write('release/kit.json',changed);git('add','.');git('commit','-qm','mixed manifest change');assert.ok(Object.values(scope()).every(Boolean));
    write('release/kit.json','invalid JSON');git('add','.');git('commit','-qm','malformed manifest');assert.ok(Object.values(scope()).every(Boolean));
    git('switch','-c','removed-manifest',base);git('rm','release/kit.json');git('commit','-qm','remove manifest');assert.ok(Object.values(scope()).every(Boolean));
    git('switch','-c','promoted-inspection',promotedHead);assert.ok(Object.values(scopeForEvent({},root)).every(Boolean),'manual runs stay full');
    // Compare publication metadata at the merge base, matching the path diff,
    // even when the target branch has advanced independently.
    git('checkout','-qb','advanced-base',base);write('docs/advance.md','new base docs');git('add','.');git('commit','-qm','advance target');const advanced=git('rev-parse','HEAD');
    git('switch','-c','promoted-merge-base',promotedHead);assert.equal(scope(advanced).windows,false);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('combined publication requires intact matching snapshots and a signed coherent feed', () => {
  const root=mkdtempSync(path.join(os.tmpdir(),'zero-ci-native-promotion-'));
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  const names=['kit.json','published-kit.json','installer.json','published-installer.json','mac-appcast.xml','mac-update-feed.json','mac-updater.json'];
  const version='0.5.15',keys=generateKeyPairSync('ed25519');
  const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  const config={schema:1,buildNumber:2,feedURL:updaterFeedURL,publicKey,sparkle:{...sparklePin}};
  const kitPublished={schema:1,kitVersion:version,coreVersion:'0.3.0',publication:{status:'published',repository:'codepetca/zero',tag:`v${version}`},assets:{}};
  for(const [key,filename] of Object.entries({kit:'zero-bootstrap.zip',starter:'zero-starter.zip',extension:`zero-${version}.vsix`}))kitPublished.assets[key]={filename,label:key,size:123,sha256:'a'.repeat(64),url:`https://github.com/codepetca/zero/releases/download/v${version}/${filename}`};
  const dmg=Buffer.from('fixture DMG'),filename=`Zero-${version}-macos.dmg`,url=`https://github.com/codepetca/zero/releases/download/setup-v${version}/${filename}`;
  const publishedInstaller={schema:1,kitVersion:version,publication:{status:'published',repository:'codepetca/zero',tag:`setup-v${version}`},sourceRevision:'b'.repeat(40),kit:{filename:'zero-bootstrap.zip',size:123,sha256:'a'.repeat(64)},asset:{filename,platform:'macos',architectures:['arm64','x86_64'],minimumOS:'12.0',size:dmg.length,sha256:hash(dmg),url},signing:{identitySha1:'A'.repeat(40),teamIdentifier:'A'.repeat(10)},notarizationSubmissionId:'a'.repeat(36)};
  const asset={filename,url,size:dmg.length,sha256:hash(dmg),edSignature:sign(null,dmg,keys.privateKey).toString('base64')};
  const feed={schema:1,publication:{status:'published'},kitVersion:version,buildNumber:2,feedURL:updaterFeedURL,publicKeySha256:hash(Buffer.from(publicKey,'base64')),sourceRevision:publishedInstaller.sourceRevision,createdAt:'2026-10-15T01:00:00.000Z',asset};
  const payload=Buffer.from(createAppcast(feed));
  const xml=Buffer.concat([payload,Buffer.from(`<!-- sparkle-signatures:\nedSignature: ${sign(null,payload,keys.privateKey).toString('base64')}\nlength: ${payload.length}\n-->\n`)]);
  feed.feed={filename:'appcast.xml',size:xml.length,sha256:hash(xml)};
  const source=Object.fromEntries(Object.entries({'kit.json':kitPublished,'published-kit.json':kitPublished,'installer.json':publishedInstaller,'published-installer.json':publishedInstaller,'mac-appcast.xml':xml,'mac-update-feed.json':feed,'mac-updater.json':config}).map(([name,value])=>[name,Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value))]));
  const write=(name,value)=>writeFileSync(path.join(root,'release',name),Buffer.isBuffer(value)?value:JSON.stringify(value));
  const kit=JSON.parse(source['kit.json']);kit.publication.status='local';
  for(const asset of Object.values(kit.assets)){delete asset.size;delete asset.sha256;delete asset.url;}
  const installer=JSON.parse(source['installer.json']);installer.publication.status='local';delete installer.asset.url;
  try {
    git('init','-q');git('config','maintenance.auto','false');git('config','user.name','CI fixture');git('config','user.email','ci@example.invalid');
    mkdirSync(path.join(root,'release'));for(const name of names)write(name,source[name]);
    write('kit.json',kit);write('installer.json',{old:'previous release'});
    // Old snapshots differ, ensuring every promoted file is in the Git diff.
    for(const name of ['published-kit.json','published-installer.json','mac-appcast.xml','mac-update-feed.json'])write(name,'old snapshot');
    git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
    write('installer.json',installer);git('add','.');git('commit','-qm','record local installer');
    for(const name of names)write(name,source[name]);git('add','.');git('commit','-qm','coherent promotion');const promoted=git('rev-parse','HEAD');
    const scope=()=>scopeForEvent({pull_request:{base:{sha:base},head:{sha:git('rev-parse','HEAD')}}},root);
    assert.deepEqual(scope(),{source:true,native:false,browser:false,windows:false,website:true,sharing:false,lessons:false});
    let n=0;
    for(const name of ['published-kit.json','installer.json','published-installer.json','mac-appcast.xml','mac-update-feed.json','mac-updater.json']) {
      git('switch','-c',`deleted-${++n}`,promoted);git('rm',`release/${name}`);git('commit','-qm','delete required file');
      assert.ok(Object.values(scope()).every(Boolean),`deleted ${name}`);
    }
    for(const name of ['published-kit.json','installer.json','published-installer.json','mac-appcast.xml','mac-update-feed.json']) {
      git('switch','-c',`malformed-${++n}`,promoted);write(name,'malformed');git('add','.');git('commit','-qm','malformed file');
      assert.ok(Object.values(scope()).every(Boolean),`malformed ${name}`);
    }
    for(const [name,mutate] of [
      ['published-kit.json',v=>v.assets.kit.sha256='0'.repeat(64)],
      ['installer.json',v=>v.kit.sha256='0'.repeat(64)],
      ['published-installer.json',v=>v.asset.sha256='0'.repeat(64)],
      ['mac-update-feed.json',v=>v.asset.sha256='0'.repeat(64)],
      ['mac-update-feed.json',v=>v.publication.status='local']
    ]) {
      git('switch','-c',`inconsistent-${++n}`,promoted);const value=JSON.parse(source[name]);mutate(value);write(name,value);git('add','.');git('commit','-qm','inconsistent metadata');
      assert.ok(Object.values(scope()).every(Boolean),`inconsistent ${name}`);
    }
    git('switch','-c',`tampered-${++n}`,promoted);write('mac-appcast.xml',Buffer.concat([source['mac-appcast.xml'],Buffer.from('tampered')]));git('add','.');git('commit','-qm','tamper signed feed');
    assert.ok(Object.values(scope()).every(Boolean),'tampered signed feed');
  } finally {rmSync(root,{recursive:true,force:true});}
});
