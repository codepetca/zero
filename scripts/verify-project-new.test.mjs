import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {assertStarterTree, preparationStarterRequest, replayGreeting, verifyPublicStarter} from './verify-project-new.mjs';
import {lessonProjects} from './lesson-projects.mjs';
import {projectBuilderAssetBytes} from './prepare-extension-assets.mjs';
import upgrade from '../extension/src/project-builder-upgrade.js';
import starterTemplate from '../extension/src/github-app/starter-template.js';

const tree = 'a'.repeat(40);
const commit = 'b'.repeat(40);
const bytes = Buffer.from('#!/bin/sh\n');
const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const files = [{path:'mvnw', data:bytes, mode:0o755}];
const entry = {path:'mvnw', type:'blob', mode:'100755', sha};
const payload = treeEntries => ({sha:tree, truncated:false, tree:treeEntries});
const github = 'https://api.github.com/repos/codepetca/zero-starter';
const root = fileURLToPath(new URL('..', import.meta.url));
const preparationEnv = () => ({ZERO_STARTER_API_TOKEN:'synthetic-read-only-token', GITHUB_ACTIONS:'true',
  GITHUB_EVENT_NAME:'workflow_dispatch', GITHUB_REPOSITORY:'codepetca/zero',
  GITHUB_WORKFLOW_REF:'codepetca/zero/.github/workflows/release-review.yml@refs/heads/main'});
const repo = {id:1418150992, full_name:'codepetca/zero-starter', private:false, is_template:true, default_branch:'main'};
const branch = {name:'main', commit:{sha:commit, commit:{tree:{sha:tree}}}};

test('Project New verifies either whole installed starter inventory and rejects a mixed builder', async t => {
  const extension = await mkdtemp(path.join(tmpdir(), 'zero-starter-inventory-'));
  t.after(() => rm(extension, {recursive:true,force:true}));
  await mkdir(path.join(extension, 'media'));
  await writeFile(path.join(extension, 'media/lesson-projects.json'), JSON.stringify(lessonProjects(root)));
  await writeFile(path.join(extension, upgrade.BUNDLED_BUILDER_PATH), projectBuilderAssetBytes(root));
  const inventories = await starterTemplate.installedStarterInventories(extension);
  const entries = inventory => [...inventory].map(([path, {sha,mode}]) => ({path,sha,mode,type:'blob'}));
  const [publishedFiles, currentFiles] = inventories.map(entries);
  assert.notDeepEqual(publishedFiles, currentFiles);
  for (const files of [publishedFiles, currentFiles]) assert.doesNotThrow(() => starterTemplate.assertCompatibleStarter(payload(files),tree,inventories));
  const currentManifest = currentFiles.find(file => file.path === '.zero-build/builder.json');
  const mixed = publishedFiles.map(file => file.path === currentManifest.path ? currentManifest : file);
  assert.throws(() => starterTemplate.assertCompatibleStarter(payload(mixed),tree,inventories), {code:'ZERO_STARTER_INCOMPATIBLE'});
});

test('manual preparation consumes its token before child processes and rejects other execution contexts', () => {
  const env = preparationEnv();
  preparationStarterRequest({env});
  assert.equal(Object.hasOwn(env, 'ZERO_STARTER_API_TOKEN'), false);
  const child = spawnSync(process.execPath, ['-e',
    'if (process.env.ZERO_STARTER_API_TOKEN) process.exit(1)'], {env, encoding:'utf8'});
  assert.equal(child.status, 0, child.stderr);
  for (const [name, value] of [['GITHUB_ACTIONS','false'], ['GITHUB_EVENT_NAME','pull_request'],
    ['GITHUB_REPOSITORY','other/zero'], ['GITHUB_WORKFLOW_REF','codepetca/zero/.github/workflows/other.yml@refs/heads/main']]) {
    const invalid = {...preparationEnv(), [name]:value};
    assert.throws(() => preparationStarterRequest({env:invalid}), /restricted to manual/);
    assert.equal(Object.hasOwn(invalid, 'ZERO_STARTER_API_TOKEN'), false);
  }
  const request = () => {};
  assert.equal(preparationStarterRequest({env:{GH_TOKEN:'unrelated-token'}, request}), request);
});

test('the fallback permits only fixed starter GET endpoints and never follows redirects', async () => {
  const calls = [];
  const request = preparationStarterRequest({env:preparationEnv(), request:async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(new Headers(options.headers).has('authorization'), false);
    return new Response('', {status:302});
  }});
  for (const url of [github, github + '/branches/main', github + `/git/trees/${tree}?recursive=1`]) {
    assert.equal((await request(url, {redirect:'follow'})).status, 302);
  }
  for (const url of [github + '-private', github + '/branches/other', github + '/git/trees/main?recursive=1',
    github + `/git/trees/${tree}?recursive=1&extra=1`, github + '/contents/secrets',
    github + '?redirect=1', 'https://api.github.com/repos/other/zero-starter',
    'https://api.github.com.evil.example/repos/codepetca/zero-starter']) {
    await assert.rejects(request(url), /refuses another destination/);
  }
  await assert.rejects(request(github, {method:'POST'}), /only reads/);
  await assert.rejects(request(github, {body:'data'}), /does not send/);
  await assert.rejects(request(github, {headers:{Authorization:'Bearer other'}}), /start anonymously/);
  assert.equal(calls.length, 3);
});

test('anonymous success and ordinary failures do not use the fallback; denied retries stay bounded', async () => {
  for (const status of [200, 401, 403, 404, 429, 500]) {
    let calls = 0;
    const request = preparationStarterRequest({env:preparationEnv(), request:async (url, options) => {
      calls++;
      assert.equal(new Headers(options.headers).get('authorization'), calls === 1 ? null : 'Bearer synthetic-read-only-token');
      assert.equal(options.redirect, 'error');
      return new Response('', {status});
    }});
    assert.equal((await request(github)).status, status);
    assert.equal(calls, status === 403 || status === 429 ? 2 : 1);
  }
});

test('authenticated fallback preserves starter identity, bounded tree proof and the second branch read', async () => {
  for (const failure of [null, 'private', 'id', 'name', 'template', 'default', 'move', 'oversize']) {
    let branchReads = 0;
    const authenticated = [];
    const request = preparationStarterRequest({env:preparationEnv(), request:async (url, options) => {
      if (!new Headers(options.headers).has('authorization')) return new Response('', {status:403});
      authenticated.push(url);
      if (url === github) return Response.json({...repo,
        ...(failure === 'private' ? {private:true} : {}), ...(failure === 'id' ? {id:1} : {}),
        ...(failure === 'name' ? {full_name:'other/zero-starter'} : {}),
        ...(failure === 'template' ? {is_template:false} : {}), ...(failure === 'default' ? {default_branch:'other'} : {})});
      if (url === github + '/branches/main') {
        branchReads++;
        return Response.json(failure === 'move' && branchReads > 1
          ? {...branch, commit:{...branch.commit, sha:'e'.repeat(40)}} : branch);
      }
      return failure === 'oversize' ? new Response(' '.repeat(512 * 1024 + 1)) : Response.json(payload([entry]));
    }});
    const verify = verifyPublicStarter(root, files, request);
    if (failure) await assert.rejects(verify, /public|ID changed|equal|template|default branch|changed during|512 KiB/i);
    else {
      assert.deepEqual(await verify, {repository:'codepetca/zero-starter', commit, tree});
      assert.deepEqual(authenticated, [github, github + '/branches/main', github + `/git/trees/${tree}?recursive=1`, github + '/branches/main']);
    }
  }
});

test('only the manual starter verification step receives the existing read-only workflow token', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release-review.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  const steps = workflow.split(/^      - /m);
  const tokenSteps = steps.filter(step => step.includes('ZERO_STARTER_API_TOKEN:'));
  assert.equal(tokenSteps.length, 1);
  assert.match(tokenSteps[0], /^name: Verify Project → New/);
  assert.match(tokenSteps[0], /if: github.event_name == 'workflow_dispatch'/);
  assert.match(tokenSteps[0], /ZERO_STARTER_API_TOKEN: \$\{\{ github.token \}\}/);
  assert.doesNotMatch(tokenSteps[0], /ci-browser|npm|mvn/);
});

test('the public starter proof requires the exact blob, executable bit and complete file inventory', () => {
  assert.doesNotThrow(() => assertStarterTree(payload([entry]), tree, files));
  for (const candidate of [
    {...payload([entry]), truncated:true},
    payload([{...entry, mode:'100644'}]),
    payload([{...entry, mode:'120000'}]),
    payload([{...entry, sha:'d'.repeat(40)}]),
    payload([{...entry, path:'other'}]),
    payload([entry, entry]),
    payload([entry, {...entry, path:'.mvn/maven.config'}]),
  ]) assert.throws(() => assertStarterTree(candidate, tree, files), /incomplete|differs|duplicate/);
});

test('the public starter proof rejects a moved default branch', async () => {
  let reads = 0;
  const request = async (url, options) => {
    assert.equal(new Headers(options.headers).has('authorization'), false);
    if (url.endsWith('/zero-starter')) return Response.json({
      id:1418150992, full_name:'codepetca/zero-starter', private:false, is_template:true, default_branch:'main'
    });
    if (url.endsWith('/branches/main')) return Response.json({
      name:'main', commit:{sha:++reads === 1 ? commit : 'e'.repeat(40), commit:{tree:{sha:tree}}}
    });
    assert.ok(url.endsWith(`/git/trees/${tree}?recursive=1`));
    return Response.json(payload([entry]));
  };
  await assert.rejects(verifyPublicStarter(fileURLToPath(new URL('..', import.meta.url)), files, request), /changed during verification/);
});

test('Greeting replay follows the authored edits and fails on a stale continuation', async () => {
  const names = ['00-hello-world.md', '01-hello-button.md', '02-hello-name.md'];
  const lessons = await Promise.all(names.map(async name => [name,
    await readFile(new URL('../student-template/lessons/' + name, import.meta.url), 'utf8')]));
  const source = replayGreeting(lessons);
  assert.match(source, /button.onClick\(\(\) ->\s+greeting.setText\("Hello, " \+ name.getText\(\) \+ "!"\)\);/);
  assert.doesNotMatch(source, /You did it|title\("Greeting"\)/);
  lessons[2][1] = lessons[2][1].replace('show(new Column(10, greeting, button));', 'show(new Column(5, greeting, button));');
  assert.throws(() => replayGreeting(lessons), /must match exactly once/);
});
