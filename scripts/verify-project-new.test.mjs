import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {assertStarterTree, replayGreeting, verifyPublicStarter} from './verify-project-new.mjs';

const tree = 'a'.repeat(40);
const commit = 'b'.repeat(40);
const bytes = Buffer.from('#!/bin/sh\n');
const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const files = [{path:'mvnw', data:bytes, mode:0o755}];
const entry = {path:'mvnw', type:'blob', mode:'100755', sha};
const payload = treeEntries => ({sha:tree, truncated:false, tree:treeEntries});

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
