import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyPublishedKit} from './verify-published-kit.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
function fixture(t, {separateBrowserBuilder = false} = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'zero-published-test-'));
  t.after(() => rmSync(directory, {recursive:true, force:true}));
  const git = (...args) => {
    const result = spawnSync('git', args, {cwd:directory, encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (name, value) => {
    const file = path.join(directory, name);
    mkdirSync(path.dirname(file), {recursive:true});
    writeFileSync(file, value);
  };
  const json = (name, value) => write(name, JSON.stringify(value, null, 2) + '\n');
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  write('extension/source.js', 'reviewed original source');
  if (separateBrowserBuilder) write('teaching/published-builder/src/sharing/contracts.js','archived tutorial source');
  git('add', '.');git('commit', '-m', 'reviewed original');
  const sourceRevision = git('rev-parse', 'HEAD');
  git('tag', 'v1.2.3');
  const bytes = {kit:Buffer.from('reviewed original source'), starter:Buffer.from('starter'), extension:Buffer.from('extension')};
  const names = {kit:'zero-bootstrap.zip', starter:'zero-starter.zip', extension:'zero-1.2.3.vsix'};
  const assets = Object.fromEntries(Object.keys(bytes).map(key => [key, {
    filename:names[key], label:key, size:bytes[key].length, sha256:digest(bytes[key]),
    url:`https://github.com/codepetca/zero/releases/download/v1.2.3/${names[key]}`
  }]));
  const manifest = {schema:1, kitVersion:'1.2.3', coreVersion:'0.3.0',
    publication:{status:'published', repository:'codepetca/zero', tag:'v1.2.3'}, assets};
  const bundle = {kitVersion:'1.2.3', kitSourceRevision:sourceRevision, kitSha256:assets.kit.sha256,
    publication:{status:'published'}};
  const commitMetadata = () => {
    json('release/kit.json', manifest);json('release/published-kit.json', manifest);
    json('release/windows-portable-bundle.json', bundle);
    git('add', 'release');git('commit', '-m', 'reviewed publication');
    json('dist/release.json', manifest);
  };
  commitMetadata();
  for (const key of Object.keys(bytes)) write(`dist/${names[key]}`, bytes[key]);
  write('extension/source.js', 'new reporting source');
  git('add', 'extension');git('commit', '-m', 'new PR source');
  const verify = ({sourceRoot, artifactRoot, release, compile, legacyBrowserBuilder}) => {
    assert.equal(compile, false, 'Downloaded kit code must not run');
    assert.equal(legacyBrowserBuilder,!separateBrowserBuilder,'Browser layout must come from the verified source archive');
    assert.equal(release.kitVersion, '1.2.3');
    assert.deepEqual(readFileSync(path.join(artifactRoot, release.assets.kit.filename)),
      readFileSync(path.join(sourceRoot, 'extension/source.js')), 'Packaged source drift');
  };
  return {directory, git, write, json, bytes, names, manifest, bundle, commitMetadata, verify, sourceRevision,
    run:()=>verifyPublishedKit({repositoryRoot:directory, artifactRoot:path.join(directory,'dist'), verify})};
}

test('published kit verification binds recorded assets to the original commit, not changed PR source',t=>{
  const f=fixture(t);
  const result=f.run();
  assert.equal(result.sourceRevision,f.sourceRevision);
  assert.equal(readFileSync(path.join(f.directory,'extension/source.js'),'utf8'),'new reporting source');
});

test('published kit verification requires the separate asset layout from its archived source marker',t=>{
  const f=fixture(t,{separateBrowserBuilder:true});
  assert.equal(f.run().sourceRevision,f.sourceRevision);
});

test('published kit verification rejects corrupt assets, receipts and uncommitted metadata',async t=>{
  for (const kind of ['asset','receipt','metadata']) await t.test(kind,t=>{
    const f=fixture(t);
    if(kind==='asset')f.write('dist/'+f.names.kit,'corrupt');
    if(kind==='receipt')f.json('dist/release.json',{...f.manifest,kitVersion:'9.9.9'});
    if(kind==='metadata')f.write('release/kit.json','{}');
    assert.throws(()=>f.run());
  });
});

test('published kit verification rejects rebound assets and source commits even if metadata agrees',async t=>{
  await t.test('rebound asset',t=>{
    const f=fixture(t),forged=Buffer.from('tampered package');
    f.write('dist/'+f.names.kit,forged);
    f.manifest.assets.kit.size=forged.length;f.manifest.assets.kit.sha256=digest(forged);
    f.bundle.kitSha256=digest(forged);f.commitMetadata();
    assert.throws(()=>f.run(),/Packaged source drift/);
  });
  await t.test('source tag differs from pinned commit',t=>{
    const f=fixture(t);f.git('tag','-f','v1.2.3','HEAD');
    assert.throws(()=>f.run(),/tag and recorded kit source differ/);
  });
  await t.test('rebound tag and source do not match original assets',t=>{
    const f=fixture(t),different=f.git('rev-parse','HEAD');
    f.git('tag','-f','v1.2.3',different);f.bundle.kitSourceRevision=different;f.commitMetadata();
    assert.throws(()=>f.run(),/Packaged source drift/);
  });
});
