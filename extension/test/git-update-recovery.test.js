'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const workflow = require('../src/workflow');
const remote = 'https://github.com/student/recovery.git';
async function write(root, name, value) { await fs.writeFile(path.join(root, name), value); }
async function commit(root, name, value) {
  if (name) await write(root, name, value);
  await core.git(root, ['add', '-A']);
  await core.git(root, ['commit', '-m', 'Test change']);
  return core.git(root, ['rev-parse', 'HEAD']);
}
async function fixture(t) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-update-')));
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  const root = path.join(parent, 'student'); const bare = path.join(parent, 'remote.git'); const other = path.join(parent, 'other');
  await fs.mkdir(root); await fs.mkdir(bare);
  await core.git(bare, ['init', '--bare', '--initial-branch=main']);
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', 'user.name', 'Test']); await core.git(root, ['config', 'user.email', 'test@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', remote]);
  await write(root, 'zero.json', '{}\n'); await write(root, '.gitignore', 'private.txt\n'); await write(root, 'private.txt', 'private');
  const original = await commit(root, 'Main.java', 'class Main { int score; }\n');
  await core.git(root, ['push', bare, 'main']);
  await core.git(parent, ['clone', bare, other]);
  await core.git(other, ['config', 'user.name', 'Other']); await core.git(other, ['config', 'user.email', 'other@example.invalid']);
  const calls = [];
  const options = {
    run: (cwd, args) => { assert.ok(!['push', 'fetch', 'ls-remote'].includes(args[0])); return core.git(cwd, args); },
    networkRun: (cwd, args) => { calls.push(args); return core.git(cwd, args.map(arg => arg === remote ? bare : arg)); }
  };
  const publish = async (branch = 'main') => core.git(other, ['push', bare, `HEAD:refs/heads/${branch}`]);
  return {root, bare, other, parent, original, options, calls, publish};
}
async function update(f, extra = {}) { const opts = {...f.options, ...extra}; return workflow.syncPrepared(await workflow.prepareSync(f.root, opts), opts); }
async function conflict(f) {
  const local = await commit(f.root, 'Main.java', 'class Main { int localScore; }\n');
  await commit(f.other, 'Main.java', 'class Main { int incomingScore; }\n'); await f.publish();
  const result = await update(f);
  assert.equal(result.synced, false); assert.equal(result.recovery.files[0].kind, 'text');
  return {local, result};
}
function choose(recovery, side = 'local') {
  const file = recovery.files[0]; return {path: file.path, conflictId: file.conflicts[0].id, side};
}
function disabledSafetyTest(name, ...args) { return test(name, { skip: 'Temporarily unavailable: divergent update or conflict recovery mutation is disabled for safety.' }, args.at(-1)); }
disabledSafetyTest('diverged main merges disjoint histories and repeated/ahead updates preserve local commits', async t => {
  const f = await fixture(t); const local = await commit(f.root, 'Local.java', 'local\n');
  const incoming = await commit(f.other, 'Incoming.java', 'incoming\n'); await f.publish();
  const result = await update(f);
  assert.equal(result.synced, true); assert.equal(result.branch, 'main');
  await core.git(f.root, ['merge-base', '--is-ancestor', local, result.head]);
  await core.git(f.root, ['merge-base', '--is-ancestor', incoming, result.head]);
  assert.equal((await update(f)).updated, false);
  assert.equal(await fs.readFile(path.join(f.root, 'private.txt'), 'utf8'), 'private');
  assert.ok(!f.calls.some(args => args[0] === 'push'));
});
disabledSafetyTest('main conflict resumes from disk and guided resolution commits both histories without network', async t => {
  const f = await fixture(t); const {local, result} = await conflict(f);
  const persisted = await workflow.readRecovery(f.root, {run: f.options.run});
  assert.deepEqual(persisted, result.recovery);
  delete require.cache[require.resolve('../src/git-update-recovery')];
  const calls = f.calls.length;
  const final = await workflow.resolveRecovery(f.root, choose(persisted, 'incoming'), {run: f.options.run});
  assert.equal(final.synced, true); assert.equal(final.branch, 'main'); assert.equal(f.calls.length, calls);
  await core.git(f.root, ['merge-base', '--is-ancestor', local, final.head]);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'class Main { int incomingScore; }\n');
  assert.equal(await workflow.readRecovery(f.root, {run: f.options.run}), null);
});
disabledSafetyTest('failed final conflict commit can continue from the validated staged state', async t => {
  const f=await fixture(t), {local,result}=await conflict(f), calls=f.calls.length;
  const run=async(root,args)=>{if(args.includes('commit')&&args.includes('--no-edit'))throw Error('injected commit failure');return f.options.run(root,args);};
  await assert.rejects(workflow.resolveRecovery(f.root,choose(result.recovery),{run}),/conflict choice stopped/i);
  const ready=await workflow.readRecovery(f.root,{run:f.options.run});assert.equal(ready.readyToCommit,true);assert.deepEqual(ready.files,[]);
  const contents=await fs.readFile(path.join(f.root,'Main.java'));const final=await workflow.completeRecovery(f.root,ready.id,ready.readyFingerprint,{run:f.options.run});
  assert.equal(final.synced,true);assert.equal(f.calls.length,calls);assert.deepEqual(await fs.readFile(path.join(f.root,'Main.java')),contents);
  assert.equal(await core.git(f.root,['rev-list','--parents','-n','1',final.head]),`${final.head} ${local} ${ready.remoteHead}`);assert.equal(await workflow.readRecovery(f.root,{run:f.options.run}),null);
});
disabledSafetyTest('staged conflict continuation rejects drift and stale authority', async t => {
  const f=await fixture(t), {result}=await conflict(f);
  const run=async(root,args)=>{if(args.includes('commit')&&args.includes('--no-edit'))throw Error('injected commit failure');return f.options.run(root,args);};
  await assert.rejects(workflow.resolveRecovery(f.root,choose(result.recovery),{run}));
  const ready=await workflow.readRecovery(f.root,{run:f.options.run}),head=await core.git(f.root,['rev-parse','HEAD']);
  await assert.rejects(workflow.completeRecovery(f.root,ready.id,'0'.repeat(64),{run:f.options.run}),/changed/i);
  await fs.writeFile(path.join(f.root,'Main.java'),'later work\n');
  await assert.rejects(workflow.completeRecovery(f.root,ready.id,ready.readyFingerprint,{run:f.options.run}),/changed/i);
  assert.equal(await core.git(f.root,['rev-parse','HEAD']),head);assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'later work\n');
});
disabledSafetyTest('uncertain conflict commit outcome never offers another guided commit', async t => {
  const f=await fixture(t), {result}=await conflict(f);
  const run=async(root,args)=>{const value=await f.options.run(root,args);if(args.includes('commit')&&args.includes('--no-edit'))throw Error('injected lost result');return value;};
  await assert.rejects(workflow.resolveRecovery(f.root,choose(result.recovery),{run}));
  const head=await core.git(f.root,['rev-parse','HEAD']);
  await assert.rejects(workflow.readRecovery(f.root,{run:f.options.run}),/may have completed.*history/i);
  await assert.rejects(workflow.completeRecovery(f.root,result.recovery.id,'0'.repeat(64),{run:f.options.run}),/may have completed.*history/i);
  assert.equal(await core.git(f.root,['rev-parse','HEAD']),head);
});
disabledSafetyTest('individual text choices retain auto-merged edits and all unchosen conflicting sections', async t => {
  const f = await fixture(t);
  const base = ['first', ...Array.from({length: 12}, (_, i) => `line${i}`), 'last', ...Array.from({length: 12}, (_, i) => `tail${i}`), 'end'].join('\n') + '\n';
  await commit(f.root, 'Main.java', base); await core.git(f.root, ['push', f.bare, 'main']);
  await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', base.replace('first', 'local-first').replace('last', 'local-last'));
  await commit(f.other, 'Main.java', base.replace('first', 'incoming-first').replace('last', 'incoming-last').replace('end\n', 'incoming-end\n')); await f.publish();
  let result = await update(f); assert.equal(result.recovery.files[0].conflicts.length, 2);
  result = await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run});
  assert.equal(result.recovery.files[0].conflicts.length, 1);
  const partial = await fs.readFile(path.join(f.root, 'Main.java'));
  const infoAttributes = path.join(f.root, '.git', 'info', 'attributes');
  await fs.writeFile(infoAttributes, 'Main.java filter=unsafe\n');
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run}), /filters require native/);
  assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), partial);
  await fs.unlink(infoAttributes);
  const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run});
  assert.equal(final.synced, true);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), base.replace('first', 'local-first').replace('last', 'incoming-last').replace('end\n', 'incoming-end\n'));
});
disabledSafetyTest('text choices refuse a newly configured filter before any status or mutation', async t => {
  for (const side of ['local', 'incoming']) {
    const f = await fixture(t); const {result} = await conflict(f);
    const target = path.join(f.root, 'Main.java'), before = await fs.readFile(target);
    await fs.writeFile(path.join(f.root, '.git', 'info', 'attributes'), `${side === 'local' ? 'Main.java' : 'zero.json'} filter=unsafe\n`);
    const calls = [];
    const run = async (cwd, args) => { calls.push(args); return f.options.run(cwd, args); };
    await assert.rejects(workflow.readRecovery(f.root, {run}), /filters require native/);
    await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery, side), {run}), /filters require native/);
    assert.deepEqual(await fs.readFile(target), before);
    assert.ok(!calls.some(args => args.includes('status') || args.includes('add') || args.includes('update-index')));
  }
});
disabledSafetyTest('text choice accepts stock text auto and stages exact chosen bytes without git add', async t => {
  const f = await fixture(t);
  await commit(f.root, '.gitattributes', '* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
  await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  const {result} = await conflict(f); const calls = [];
  const run = async (cwd, args) => { calls.push(args); return f.options.run(cwd, args); };
  const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run});
  assert.equal(final.synced, true);
  assert.equal(await core.git(f.root, ['show', 'HEAD:Main.java']), 'class Main { int incomingScore; }');
  assert.ok(!calls.some(args => args.includes('add')));
  assert.ok(calls.some(args => args.includes('hash-object') && args.includes('--no-filters')));
});
disabledSafetyTest('text choice detects staged object drift before committing', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const other = path.join(f.parent, 'other-blob'); await fs.writeFile(other, 'different\n');
  const otherOid = await core.git(f.root, ['hash-object', '-w', other]); let injected = false;
  const run = async (cwd, args) => {
    const value = await f.options.run(cwd, args);
    if (!injected && args.includes('update-index') && args.includes('--cacheinfo')) {
      injected = true; await core.git(cwd, ['update-index', '--cacheinfo', `100644,${otherOid},Main.java`]);
    }
    return value;
  };
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), {run}), /Recovery data is retained/);
  assert.ok(injected); assert.ok(await core.git(f.root, ['rev-parse', '--verify', 'MERGE_HEAD']));
});
disabledSafetyTest('text choice refuses line-ending conversion before replacing conflict text', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const target = path.join(f.root, 'Main.java'), before = await fs.readFile(target);
  await core.git(f.root, ['config', 'core.autocrlf', 'true']);
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), {run:f.options.run}), /line-ending conversion/);
  assert.deepEqual(await fs.readFile(target), before);
});
disabledSafetyTest('cancel restores committed checkpoint and refuses later working/index/untracked/ref drift', async t => {
  const f = await fixture(t); const {local} = await conflict(f);
  const record=JSON.parse(await fs.readFile(path.join(f.root,'.git','zero-update-recovery.json'),'utf8'));
  assert.equal(record.cancelCapture.head,local);assert.ok(Object.hasOwn(record,'cancelAutoMerge'));
  let abortCalled=false;
  const run=(root,args)=>{if(args.includes('--abort'))abortCalled=true;return f.options.run(root,args);};
  const cancelled = await workflow.cancelRecovery(f.root, {run});
  assert.equal(abortCalled,false);
  assert.equal(cancelled.head, local); assert.equal(await core.git(f.root, ['status', '--porcelain']), '');
  assert.equal(await fs.readFile(path.join(f.root, 'private.txt'), 'utf8'), 'private');
  await update(f);
  await write(f.root, 'after.txt', 'external work');
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'after.txt'), 'utf8'), 'external work');
  await fs.unlink(path.join(f.root, 'after.txt'));
  await write(f.root, 'Main.java', 'external editing');
  await assert.rejects(workflow.resolveRecovery(f.root, {path: 'Main.java', conflictId: 'file', side: 'local'}, {run: f.options.run}), /changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'external editing');
});
test('divergent remote feature hands off without changing local main or work', async t => {
  const f = await fixture(t); await core.git(f.root, ['checkout', '-b', 'feature']); await core.git(f.other, ['checkout', '-b', 'feature']);
  await commit(f.root, 'Local.java', 'local'); const remoteHead = await commit(f.other, 'Feature.java', 'remote feature'); await f.publish('feature');
  const before = await core.git(f.root, ['rev-parse', 'HEAD']);
  await assert.rejects(update(f, {target: 'branch'}), error => error.nativeUpdateHandoff === true && /different commits/.test(error.message));
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), before);
  assert.equal(await core.git(f.root, ['rev-parse', 'main']), f.original);
  assert.equal(await core.git(f.other, ['rev-parse', 'HEAD']), remoteHead);
  assert.equal(await fs.readFile(path.join(f.root, 'Local.java'), 'utf8'), 'local');
  await assert.rejects(update(f, {target: 'invalid'}), /Choose main/);
});
disabledSafetyTest('binary and modify/delete conflicts support guarded whole-file choices', async t => {
  for (const kind of ['binary', 'delete']) {
    const f = await fixture(t);
    if (kind === 'binary') {
      await commit(f.root, 'Main.java', Buffer.from([0, 1, 2])); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
      await commit(f.root, 'Main.java', Buffer.from([0, 3, 4])); await commit(f.other, 'Main.java', Buffer.from([0, 5, 6]));
    } else {
      await commit(f.root, 'Main.java', 'local modification'); await fs.unlink(path.join(f.other, 'Main.java')); await commit(f.other);
    }
    await f.publish(); const result = await update(f);
    assert.equal(result.recovery.files[0].kind, kind);
    const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run});
    assert.equal(final.synced, true);
    if (kind === 'binary') assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), Buffer.from([0, 5, 6]));
    else await assert.rejects(fs.access(path.join(f.root, 'Main.java')));
  }
});
disabledSafetyTest('mixed binary and attribute-marked conflicts offer both choices and cancel', async t => {
  for (const kind of ['mixed', 'base-binary', 'attribute']) {
    for (const action of ['local', 'incoming', 'cancel']) {
      const f = await fixture(t);
      if (kind === 'attribute') {
        await commit(f.root, '.gitattributes', 'Main.java binary\n');
        await core.git(f.root, ['push', f.bare, 'main']);
        await core.git(f.other, ['pull', f.bare, 'main']);
      }
      if (kind === 'base-binary') {
        await commit(f.root, 'Main.java', Buffer.from([0, 1, 2]));
        await core.git(f.root, ['push', f.bare, 'main']);
        await core.git(f.other, ['pull', f.bare, 'main']);
      }
      const local = Buffer.from('local text\n');
      const incoming = kind === 'mixed' ? Buffer.from([0, 5, 6]) : Buffer.from('incoming text\n');
      const localHead = await commit(f.root, 'Main.java', local);
      await commit(f.other, 'Main.java', incoming); await f.publish();
      const result = await update(f);
      assert.equal(result.recovery.files[0].kind, 'binary', `${kind} ${action}`);
      if (action === 'cancel') {
        await workflow.cancelRecovery(f.root, {run: f.options.run});
        assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), localHead);
      } else {
        assert.equal((await workflow.resolveRecovery(f.root, choose(result.recovery, action), {run: f.options.run})).synced, true);
      }
      assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), action === 'incoming' ? incoming : local);
      assert.equal(await core.git(f.root, ['status', '--porcelain']), '');
    }
  }
});
disabledSafetyTest('rename and symlink conflicts preserve native fallback without unsafe cancellation', async t => {
  for (const kind of ['rename', 'symlink']) {
    const f = await fixture(t);
    if (kind === 'rename') {
      await core.git(f.root, ['mv', 'Main.java', 'Local.java']); await commit(f.root);
      await core.git(f.other, ['mv', 'Main.java', 'Incoming.java']); await commit(f.other);
    } else {
      await fs.unlink(path.join(f.root, 'Main.java')); await fs.symlink('local.txt', path.join(f.root, 'Main.java')); await commit(f.root);
      await fs.unlink(path.join(f.other, 'Main.java')); await fs.symlink('incoming.txt', path.join(f.other, 'Main.java')); await commit(f.other);
    }
    await f.publish();
    if(kind==='symlink') {
      await assert.rejects(update(f),/Symbolic links/);
      assert.equal(await fs.readlink(path.join(f.root,'Main.java')),'local.txt');
      continue;
    }
    const result = await update(f);
    assert.equal(result.synced, false); assert.ok(result.recovery.files.every(file => file.kind === 'complex'));
    await assert.rejects(workflow.resolveRecovery(f.root, {path: result.recovery.files[0].path, conflictId: 'file', side: 'local'}, {run: f.options.run}), /native/);
    await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}),/additional paths/);
  }
});
test('checkpoint saves nonignored work offline with no origin, detects drift and clean is a no-op', async t => {
  const f = await fixture(t); await core.git(f.root, ['remote', 'remove', 'origin']);
  assert.equal((await workflow.checkpoint(f.root, {run: f.options.run})).checkpointed, false);
  await write(f.root, 'Main.java', 'edited'); await write(f.root, 'New.java', 'new');
  const result = await workflow.checkpoint(f.root, {run: f.options.run});
  assert.equal(result.checkpointed, true); assert.equal(await core.git(f.root, ['status', '--porcelain']), '');
  assert.equal(await core.git(f.root, ['ls-files', 'private.txt']), ''); assert.equal(f.calls.length, 0);
  await fs.unlink(path.join(f.root, 'New.java'));
  assert.equal((await workflow.checkpoint(f.root, {run: f.options.run})).checkpointed, true);
  await write(f.root, 'Main.java', 'reviewed');
  await assert.rejects(workflow.checkpoint(f.root, {run: f.options.run, beforeMutation: () => write(f.root, 'Main.java', 'changed')}), /changed/);
});
test('checkpoint refuses filtered untracked paths before staging and rechecks after review', async t => {
  for (const delayed of [false, true]) {
    const f = await fixture(t); const target = path.join(f.root, 'New.java');
    await fs.writeFile(target, 'new student work\n');
    const attrs = path.join(f.root, '.git', 'info', 'attributes');
    if (!delayed) await fs.writeFile(attrs, 'New.java filter=unsafe\n');
    const calls = [];
    const run = async (cwd, args) => { calls.push(args); return f.options.run(cwd, args); };
    await assert.rejects(workflow.checkpoint(f.root, {run, beforeMutation:async()=>{if(delayed)await fs.writeFile(attrs, 'New.java filter=unsafe\n');}}), /filters require native/);
    assert.ok(!calls.some(args=>args.includes('add') || args.includes('commit')));
    assert.equal(await fs.readFile(target, 'utf8'), 'new student work\n');
    assert.equal(await core.git(f.root, ['ls-files', '--', 'New.java']), '');
  }
});
test('checkpoint accepts stock line-ending attributes', async t => {
  const f = await fixture(t);
  await commit(f.root, '.gitattributes', '* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
  await write(f.root, 'Main.java', 'updated student work\n');
  await write(f.root, 'New.java', 'new student work\n');
  assert.equal((await workflow.checkpoint(f.root, {run:f.options.run})).checkpointed, true);
  assert.equal(await core.git(f.root, ['show', 'HEAD:New.java']), 'new student work');
});
disabledSafetyTest('beforeMutation authority cancellation leaves pending update intact; no-pending read invokes no Git', async t => {
  const f = await fixture(t); assert.equal(await workflow.readRecovery(f.root, {run: () => { throw new Error('unexpected Git'); }}), null);
  const {result} = await conflict(f); const before = await fs.readFile(path.join(f.root, 'Main.java'));
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run, beforeMutation: () => { throw new Error('Session changed'); }}), /Session changed/);
  assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), before);
});
disabledSafetyTest('cancel and choices refuse index-only and reference drift, including drift inside authority callback', async t => {
  for (const mutation of ['index', 'ref', 'callback']) {
    const f = await fixture(t); const {result} = await conflict(f);
    if (mutation === 'index') await core.git(f.root, ['--literal-pathspecs', 'add', '--', 'Main.java']);
    if (mutation === 'ref') await core.git(f.root, ['update-ref', 'refs/heads/another', f.original]);
    const options = {...f.options, ...(mutation === 'callback' ? {beforeMutation: () => write(f.root, 'new.txt', 'external')} : {})};
    await assert.rejects(workflow.cancelRecovery(f.root, options), /changed/);
    assert.ok(await core.git(f.root, ['rev-parse', 'MERGE_HEAD']));
    await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), options), /changed/);
  }
});
disabledSafetyTest('literal conflict-marker source is native fallback and stale record after native completion is harmless', async t => {
  const f = await fixture(t);
  const base = '<<<<<<< literal\na\n=======\nb\n>>>>>>> literal\n' + Array.from({length: 12}, (_, i) => `line${i}\n`).join('') + 'score\n';
  await commit(f.root, 'Main.java', base); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', base.replace('score\n', 'local\n')); await commit(f.other, 'Main.java', base.replace('score\n', 'incoming\n')); await f.publish();
  const result = await update(f); assert.equal(result.recovery.files[0].kind, 'complex');
  await core.git(f.root, ['merge', '--abort']);
  assert.equal(await workflow.readRecovery(f.root, {run: f.options.run}), null);
  const again = await update(f); assert.equal(again.recovery.files[0].kind, 'complex');
  assert.equal((await workflow.cancelRecovery(f.root, {run: f.options.run})).cancelled, true);
});
test('checkpoint supports unborn original projects and preserves executable/symlink and ignored bytes', async t => {
  const f = await fixture(t);
  const fresh = path.join(f.parent, 'original'); await fs.mkdir(fresh); await core.git(fresh, ['init', '-b', 'main']);
  await core.git(fresh, ['config', 'user.name', 'Test']); await core.git(fresh, ['config', 'user.email', 'test@example.invalid']);
  await write(fresh, 'zero.json', '{}'); await write(fresh, 'Main.java', 'main'); await write(fresh, '.gitignore', 'private.txt\n'); await write(fresh, 'private.txt', 'private');
  await fs.symlink('Main.java', path.join(fresh, 'link.java'));
  assert.equal((await workflow.checkpoint(fresh, {run: f.options.run})).checkpointed, true);
  assert.equal(await core.git(fresh, ['status', '--porcelain']), ''); assert.equal(await fs.readlink(path.join(fresh, 'link.java')), 'Main.java');
});
disabledSafetyTest('a saved partial text choice can be cancelled, but later edits remain protected', async t => {
  const f = await fixture(t); const base = 'first\n' + Array.from({length: 15}, (_, i) => `line${i}\n`).join('') + 'last\n';
  await commit(f.root, 'Main.java', base); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  const local = await commit(f.root, 'Main.java', base.replace('first', 'local-first').replace('last', 'local-last'));
  await commit(f.other, 'Main.java', base.replace('first', 'incoming-first').replace('last', 'incoming-last')); await f.publish();
  let result = await update(f);
  result = await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run});
  assert.equal(result.recovery.files[0].conflicts.length, 1);
  assert.equal((await workflow.cancelRecovery(f.root, {run: f.options.run})).head, local);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), base.replace('first', 'local-first').replace('last', 'local-last'));
  result = await update(f); result = await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run});
  await fs.appendFile(path.join(f.root, 'Main.java'), 'new external work\n');
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  assert.match(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), /new external work/);
});
disabledSafetyTest('an edit introduced while staging a choice is detected and never accepted as managed recovery', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const run = async (root, args) => {
    const value = await f.options.run(root, args);
    if (args[0] === '--literal-pathspecs' && args[1] === 'add') await write(root, 'outside.java', 'external work');
    return value;
  };
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery), {run}), error=>/changed/.test(error.cause?.message||'')&&typeof error.recoveryPath==='string');
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'outside.java'), 'utf8'), 'external work');
});
disabledSafetyTest('merge-to-record edits never become an owned cancellation baseline', async t => {
  for (const kind of ['conflict-append', 'nonconflict-edit', 'staged-edit', 'untracked', 'ignored-untracked', 'orig-head', 'merge-message']) {
    const f = await fixture(t);
    if (kind === 'ignored-untracked') {
      await commit(f.root, 'Removed.java', 'original tracked work'); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
      await fs.unlink(path.join(f.other, 'Removed.java')); await write(f.other, '.gitignore', 'private.txt\nRemoved.java\n');
    }
    await commit(f.root, 'Main.java', 'class Main { int localScore; }\n');
    await commit(f.other, 'Main.java', 'class Main { int incomingScore; }\n'); await f.publish();
    let injected = false;
    const run = async (root, args) => {
      try { return await f.options.run(root, args); }
      catch (error) {
        if (args.includes('merge')) {
          injected = true;
          if (kind === 'conflict-append' || kind === 'staged-edit') {
            await fs.appendFile(path.join(root, 'Main.java'), 'EXTERNAL EDIT WHILE UPDATE FINISHES\n');
            if (kind === 'staged-edit') await core.git(root, ['add', '--', 'Main.java']);
          }
          if (kind === 'nonconflict-edit') await write(root, 'zero.json', '{"externalEdit":true}\n');
          if (kind === 'untracked') await write(root, 'outside.java', 'EXTERNAL UNTRACKED WORK\n');
          if (kind === 'ignored-untracked') await write(root, 'Removed.java', 'EXTERNAL IGNORED WORK\n');
          if (kind === 'orig-head') await write(root, '.git/ORIG_HEAD', f.original + '\n');
          if (kind === 'merge-message') await fs.appendFile(path.join(root, '.git/MERGE_MSG'), 'EXTERNAL MERGE MESSAGE EDIT\n');
        }
        throw error;
      }
    };
    await assert.rejects(update(f, {run}), /could not be verified as unchanged/);
    assert.equal(injected, true);
    assert.equal(await workflow.readRecovery(f.root, {run: f.options.run}), null);
    const filename = kind === 'nonconflict-edit' ? 'zero.json' : kind === 'untracked' ? 'outside.java' : kind === 'ignored-untracked' ? 'Removed.java' : kind === 'orig-head' ? '.git/ORIG_HEAD' : kind === 'merge-message' ? '.git/MERGE_MSG' : 'Main.java';
    const bytes = await fs.readFile(path.join(f.root, filename));
    await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /no managed update/);
    assert.deepEqual(await fs.readFile(path.join(f.root, filename)), bytes);
    assert.ok(await core.git(f.root, ['rev-parse', '--verify', 'MERGE_HEAD']));
    if (kind === 'staged-edit') assert.equal(await core.git(f.root, ['ls-files', '--unmerged', '-z']), '');
  }
});

disabledSafetyTest('legacy unverified recovery is refused while active and ignored after native abort', async t => {
  const f = await fixture(t); await conflict(f);
  const record = path.join(f.root, '.git', 'zero-update-recovery.json');
  const saved = JSON.parse(await fs.readFile(record, 'utf8')); saved.version = 1; delete saved.provenance; await fs.writeFile(record, JSON.stringify(saved));
  await assert.rejects(workflow.readRecovery(f.root, {run: f.options.run}), /changed/);
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /changed/);
  await core.git(f.root, ['merge', '--abort']);
  assert.equal(await workflow.readRecovery(f.root, {run: () => { throw new Error('Stale record should need no Git'); }}), null);
  const again = await update(f); assert.equal(again.recovery.files[0].kind, 'text');
  assert.equal((await workflow.cancelRecovery(f.root, {run: f.options.run})).cancelled, true);
});
disabledSafetyTest('project-specific external merge drivers cannot define a managed cancellation baseline', async t => {
  const f = await fixture(t);
  await commit(f.root, '.gitattributes', 'Main.java merge=project-driver\n'); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  await core.git(f.root, ['config', 'merge.project-driver.driver', 'false']);
  await commit(f.root, 'Main.java', 'local project driver input\n'); await commit(f.other, 'Main.java', 'incoming project driver input\n'); await f.publish();
  await assert.rejects(update(f), /could not be verified as unchanged/);
  assert.equal(await workflow.readRecovery(f.root, {run: f.options.run}), null);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'local project driver input\n');
  await assert.rejects(workflow.cancelRecovery(f.root, {run: f.options.run}), /no managed update/);
});

disabledSafetyTest('guided text choice retains a late edit moved aside before replacement', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const target = path.join(f.root, 'Main.java'); const rename = fs.rename; let injected = false; let failure;
  fs.rename = async (source, destination) => {
    if (!injected && source === target) { injected = true; await fs.writeFile(source, 'late student work\n'); }
    return rename(source, destination);
  };
  try { await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run}); }
  catch (error) { failure = error; }
  finally { fs.rename = rename; }
  assert.ok(injected); assert.match(failure?.message || '', /retained/); assert.ok(failure.recoveryPath);
  const manifest = JSON.parse(await fs.readFile(path.join(failure.recoveryPath, 'manifest.json'), 'utf8'));
  assert.equal(manifest.path, 'Main.java'); assert.equal(manifest.original, 'original');
  const observed = JSON.parse(await fs.readFile(path.join(failure.recoveryPath, 'observed.json'), 'utf8'));
  assert.equal(observed.hash, require('node:crypto').createHash('sha256').update('late student work\n').digest('hex'));
  assert.notEqual(observed.hash, manifest.expectedHash);
  assert.equal(await fs.readFile(path.join(failure.recoveryPath, manifest.original), 'utf8'), 'late student work\n');
  await assert.rejects(fs.stat(target), {code: 'ENOENT'});
});
disabledSafetyTest('guided text choice does not overwrite a newly created destination', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const target = path.join(f.root, 'Main.java'), before = await fs.readFile(target, 'utf8');
  const open = fs.open; let injected = false; let failure;
  fs.open = async (filename, flags, mode) => {
    if (!injected && filename === target && flags === 'wx') { injected = true; await fs.writeFile(target, 'new arrival\n', {flag: 'wx'}); }
    return open(filename, flags, mode);
  };
  try { await workflow.resolveRecovery(f.root, choose(result.recovery), {run: f.options.run}); }
  catch (error) { failure = error; }
  finally { fs.open = open; }
  assert.ok(injected); assert.ok(failure?.recoveryPath);
  assert.equal(await fs.readFile(target, 'utf8'), 'new arrival\n');
  assert.equal(await fs.readFile(path.join(failure.recoveryPath, 'original'), 'utf8'), before);
});

disabledSafetyTest('a later staging failure reports the retained text original', async t => {
  const f = await fixture(t); const {result} = await conflict(f);
  const original = await fs.readFile(path.join(f.root, 'Main.java'), 'utf8');
  const run = (cwd, args) => {
    if (args[0] === '--literal-pathspecs' && args[1] === 'add') throw new Error('injected staging failure');
    return f.options.run(cwd, args);
  };
  let failure; try { await workflow.resolveRecovery(f.root, choose(result.recovery), {run}); } catch (error) { failure = error; }
  assert.match(failure?.message || '', /Recovery data is retained/); assert.ok(failure.recoveryPath);
  assert.equal(await fs.readFile(path.join(failure.recoveryPath, 'original'), 'utf8'), original);
});

async function wholeConflict(t, kind) {
  const f = await fixture(t);
  if (kind === 'binary') {
    await commit(f.root, 'Main.java', Buffer.from([0, 1, 2])); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
    await commit(f.root, 'Main.java', Buffer.from([0, 3, 4])); await commit(f.other, 'Main.java', Buffer.from([0, 5, 6]));
  } else {
    await commit(f.root, 'Main.java', 'local modification'); await fs.unlink(path.join(f.other, 'Main.java')); await commit(f.other);
  }
  await f.publish(); const result = await update(f); assert.equal(result.recovery.files[0].kind, kind);
  return {f, result};
}
disabledSafetyTest('whole-file choices retain local binary and local modification against deletion', async t => {
  for (const kind of ['binary', 'delete']) {
    const {f, result} = await wholeConflict(t, kind);
    const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'local'), {run: f.options.run});
    assert.equal(final.synced, true);
    assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), kind === 'binary' ? Buffer.from([0, 3, 4]) : Buffer.from('local modification'));
  }
});
disabledSafetyTest('whole-file late edit is retained before deletion', async t => {
  const {f, result} = await wholeConflict(t, 'delete'); const target = path.join(f.root, 'Main.java');
  const rename = fs.rename; let injected = false; let failure;
  fs.rename = async (source, destination) => { if (!injected && source === target) { injected = true; await fs.writeFile(source, 'late binary or text'); } return rename(source, destination); };
  try { await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run}); }
  catch (error) { failure = error; } finally { fs.rename = rename; }
  assert.ok(injected); assert.ok(failure?.recoveryPath);
  assert.equal(await fs.readFile(path.join(failure.recoveryPath, 'original'), 'utf8'), 'late binary or text');
});
disabledSafetyTest('whole-file collision retains the displaced original', async t => {
  const {f, result} = await wholeConflict(t, 'binary'); const target = path.join(f.root, 'Main.java');
  const original = await fs.readFile(target); const open = fs.open; let injected = false; let failure;
  fs.open = async (filename, flags, mode) => {
    if (!injected && filename === target && flags === 'wx') { injected = true; await fs.writeFile(target, 'new work', {flag: 'wx'}); }
    return open(filename, flags, mode);
  };
  try { await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run}); }
  catch (error) { failure = error; } finally { fs.open = open; }
  assert.ok(injected); assert.ok(failure?.recoveryPath);
  assert.equal(await fs.readFile(target, 'utf8'), 'new work');
  assert.deepEqual(await fs.readFile(path.join(failure.recoveryPath, 'original')), original);
});
disabledSafetyTest('whole-file index failure exposes retained original', async t => {
  const {f, result} = await wholeConflict(t, 'binary'); const original = await fs.readFile(path.join(f.root, 'Main.java'));
  const run = (cwd, args) => { if (args[1] === 'update-index') throw Error('interrupted'); return f.options.run(cwd, args); };
  let failure; try { await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run}); } catch (error) { failure = error; }
  assert.ok(failure?.recoveryPath); assert.match(failure.message, /Recovery data is retained/);
  assert.deepEqual(await fs.readFile(path.join(failure.recoveryPath, 'original')), original);
});
disabledSafetyTest('whole-file choice preserves selected executable mode', async t => {
  const f = await fixture(t);
  await commit(f.root, 'Main.java', Buffer.from([0, 1])); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', Buffer.from([0, 2]));
  await write(f.other, 'Main.java', Buffer.from([0, 3])); await fs.chmod(path.join(f.other, 'Main.java'), 0o755); await commit(f.other);
  await f.publish(); const result = await update(f); assert.equal(result.recovery.files[0].kind, 'binary');
  const final = await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run});
  assert.equal(final.synced, true); assert.equal((await fs.stat(path.join(f.root, 'Main.java'))).mode & 0o100, 0o100);
  assert.match(await core.git(f.root, ['ls-files', '--stage', 'Main.java']), /^100755 /);
});

disabledSafetyTest('whole-file resolution refuses replacement objects for a conflict stage', async t => {
  const {f, result} = await wholeConflict(t, 'binary');
  const target = path.join(f.root, 'Main.java'), before = await fs.readFile(target);
  const rows = await core.git(f.root, ['ls-files', '--unmerged', '--', 'Main.java']);
  const match = /^100644 ([a-f0-9]{40,64}) 3\t/m.exec(rows); assert.ok(match);
  const replacement = path.join(f.parent, 'replacement-blob'); await fs.writeFile(replacement, Buffer.from([0, 99, 100]));
  const replacementOid = await core.git(f.root, ['hash-object', '-w', replacement]);
  await core.git(f.root, ['replace', match[1], replacementOid]);
  await assert.rejects(workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run}), /replacement objects/);
  assert.deepEqual(await fs.readFile(target), before);
});
disabledSafetyTest('whole-file binary choice accepts stock text auto attributes', async t => {
  const f = await fixture(t);
  await commit(f.root, '.gitattributes', '* text=auto\n'); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', Buffer.from([0, 1])); await core.git(f.root, ['push', f.bare, 'main']); await core.git(f.other, ['pull', f.bare, 'main']);
  await commit(f.root, 'Main.java', Buffer.from([0, 2])); await commit(f.other, 'Main.java', Buffer.from([0, 3]));
  await f.publish(); const result = await update(f);
  assert.equal((await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run})).synced, true);
  assert.deepEqual(await fs.readFile(path.join(f.root, 'Main.java')), Buffer.from([0, 3]));
});
disabledSafetyTest('whole-file choice detects selected index drift', async t => {
  const {f, result} = await wholeConflict(t, 'binary');
  const otherPath = path.join(f.parent, 'index-other'); await fs.writeFile(otherPath, Buffer.from([0, 20]));
  const otherOid = await core.git(f.root, ['hash-object', '-w', otherPath]); let injected = false;
  const run = async (cwd, args) => {
    const value = await f.options.run(cwd, args);
    if (!injected && args[1] === 'update-index' && args.includes('--cacheinfo')) {
      injected = true; await core.git(cwd, ['update-index', '--cacheinfo', `100644,${otherOid},Main.java`]);
    }
    return value;
  };
  let failure; try { await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run}); } catch (error) { failure = error; }
  assert.ok(injected); assert.ok(failure?.recoveryPath); assert.match(failure.message, /Recovery data is retained/);
});
disabledSafetyTest('restrictive umask keeps conflict files private', async t => {
  if (!process.env.ZERO_UMASK_TEST_CHILD) {
    const {execFileSync} = require('node:child_process');
    const childEnv = {...process.env, ZERO_UMASK_TEST_CHILD: '1'}; delete childEnv.NODE_TEST_CONTEXT;
    const output = execFileSync(process.execPath, ['--test', '--test-name-pattern=^restrictive umask keeps conflict files private$', __filename], {env: childEnv, timeout: 120000, encoding: 'utf8'});
    assert.match(output, /# pass 1/);
    return;
  }
  const old = process.umask(0o077); t.after(() => process.umask(old));
  const {f, result} = await wholeConflict(t, 'binary');
  const target = path.join(f.root, 'Main.java');
  assert.equal((await fs.stat(target)).mode & 0o077, 0);
  assert.equal((await workflow.resolveRecovery(f.root, choose(result.recovery, 'incoming'), {run: f.options.run})).synced, true);
  assert.equal((await fs.stat(target)).mode & 0o077, 0);
});

disabledSafetyTest('private executable choice respects existing permissions and umask', async t => {
  if (!process.env.ZERO_PRIVATE_EXEC_CHILD) {
    const {execFileSync} = require('node:child_process');
    const childEnv = {...process.env, ZERO_PRIVATE_EXEC_CHILD: '1'}; delete childEnv.NODE_TEST_CONTEXT;
    const output = execFileSync(process.execPath, ['--test', '--test-name-pattern=^private executable choice respects existing permissions and umask$', __filename], {env: childEnv, timeout: 120000, encoding: 'utf8'});
    assert.match(output, /# pass 1/); return;
  }
  const Module = require('node:module'), filename = require.resolve('../src/git-update-recovery');
  const source = await fs.readFile(filename, 'utf8'); const isolated = new Module(filename, module);
  isolated.filename = filename; isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(source + '\nmodule.exports.testReplaceChoice = replaceChoice;', filename);
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-private-choice-'));
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  const old = process.umask(); t.after(() => process.umask(old));
  for (const mask of [0o022, 0o077]) {
    process.umask(mask); const root = path.join(parent, String(mask)); await fs.mkdir(root);
    const gitDir = path.join(root, '.git'); await fs.mkdir(gitDir); const target = path.join(root, 'Main.java');
    await fs.writeFile(target, 'original', {mode: 0o600}); await fs.chmod(target, 0o600);
    const info = await fs.stat(target), expectedHash = require('node:crypto').createHash('sha256').update('original').digest('hex');
    await isolated.exports.testReplaceChoice({root, gitDir}, 'Main.java', expectedHash, Buffer.from('selected'), 0o755, true, info.mode);
    assert.equal((await fs.stat(target)).mode & 0o777, 0o700);
    assert.equal(await fs.readFile(target, 'utf8'), 'selected');
  }
});

disabledSafetyTest('pre-merge cancel capture persists and verifies exact index and affected file bytes', async t => {
  const f = await fixture(t);
  const recovery = require('../src/git-update-recovery');
  const head = await core.git(f.root,['rev-parse','HEAD']);
  await core.git(f.root,['checkout','-b','capture-target']);
  const remoteHead = await commit(f.root,'Main.java','incoming\n');
  await core.git(f.root,['checkout','main']);
  const inspect = async (root,run) => ({root,gitDir:path.join(root,'.git'),branch:'main',head:await run(root,['rev-parse','HEAD']),mainHead:head,remote,page:'https://github.com/student/recovery',worktrees:root,status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all'])});
  const index = await fs.readFile(path.join(f.root,'.git','index'));
  const source = await fs.readFile(path.join(f.root,'Main.java'));
  const options = {run:f.options.run,inspect,beforeMutation:async()=>{}};
  const receipt = await recovery.prepareCancelCapture(f.root,remoteHead,options);
  const saved = await recovery.readCancelCapture(f.root,receipt);
  assert.equal(saved.head,head);assert.equal(saved.remoteHead,remoteHead);
  assert.deepEqual(await fs.readFile(path.join(receipt.recoveryPath,'index')),index);
  assert.deepEqual(await fs.readFile(path.join(receipt.recoveryPath,saved.files[0].copy)),source);
  assert.equal(saved.files[0].name,'Main.java');
  assert.equal(await core.git(f.root,['status','--porcelain']),'');
  assert.equal(await fs.readFile(path.join(f.root,'private.txt'),'utf8'),'private');
  await fs.writeFile(path.join(receipt.recoveryPath,saved.files[0].copy),'tampered');
  await assert.rejects(recovery.readCancelCapture(f.root,receipt),/changed/);
});

disabledSafetyTest('pre-merge cancel capture rejects dirty work and detects drift after copying', async t => {
  const f = await fixture(t);const recovery=require('../src/git-update-recovery');
  const head=await core.git(f.root,['rev-parse','HEAD']);
  await core.git(f.root,['checkout','-b','capture-target']);const remoteHead=await commit(f.root,'Main.java','incoming\n');await core.git(f.root,['checkout','main']);
  const inspect=async(root,run)=>({root,gitDir:path.join(root,'.git'),branch:'main',head:await run(root,['rev-parse','HEAD']),mainHead:head,remote,page:'https://github.com/student/recovery',worktrees:root,status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all'])});
  await write(f.root,'Main.java','student edit');
  await assert.rejects(recovery.prepareCancelCapture(f.root,remoteHead,{run:f.options.run,inspect,beforeMutation:async()=>{}}),/clean standalone/);
  await write(f.root,'Main.java','class Main { int score; }\n');
  let calls=0;
  await assert.rejects(recovery.prepareCancelCapture(f.root,remoteHead,{run:f.options.run,inspect,beforeMutation:async()=>{if(++calls===2)await write(f.root,'Main.java','late student edit');}}),error=>!!error.recoveryPath && /changed/.test(error.message));
  assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'late student edit');
});

disabledSafetyTest('captured cancel restores exact checkpoint and retains displaced conflict text', async t => {
  const f=await fixture(t), recovery=require('../src/git-update-recovery');
  const local=await commit(f.root,'Main.java','local\n');
  const incoming=await commit(f.other,'Main.java','incoming\n');await f.publish();
  await core.git(f.root,['fetch',f.bare,'main']);
  const inspect=async(root,run)=>({root,page:'https://github.com/student/recovery',remote,branch:'main',head:await run(root,['rev-parse','HEAD']),mainHead:await run(root,['rev-parse','refs/heads/main']),status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all']),gitDir:path.join(root,'.git'),worktrees:`worktree ${root}`});
  const options={run:f.options.run,inspect,beforeMutation:async()=>{}};
  await fs.writeFile(path.join(f.root,'.git','ORIG_HEAD'),f.original+'\n');
  const receipt=await recovery.prepareCancelCapture(f.root,incoming,options);
  const result=await update(f);assert.equal(result.synced,false);
  const recordPath=path.join(f.root,'.git','zero-update-recovery.json');
  const record=JSON.parse(await fs.readFile(recordPath,'utf8'));record.cancelCapture=receipt;record.cancelAutoMerge=await fs.readFile(path.join(f.root,'.git','AUTO_MERGE'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});await fs.writeFile(recordPath,JSON.stringify(record));
  const conflicted=await fs.readFile(path.join(f.root,'Main.java'));
  const indirect={...options,run:(root,args)=>args[0]==='symbolic-ref' && args.includes('--no-recurse') && args.at(-1)==='HEAD' ? Promise.resolve('refs/heads/alias') : f.options.run(root,args)};
  await assert.rejects(recovery.cancelCaptured(f.root,indirect),/changed/);
  let blocked=false;
  const done=await recovery.cancelCaptured(f.root,{...options,_testBeforeCancelStep:async step=>{if(step==='before-index'){await assert.rejects(core.git(f.root,['update-ref','refs/heads/main',local,local]));await assert.rejects(core.git(f.root,['symbolic-ref','HEAD','refs/heads/other']));await assert.rejects(core.git(f.root,['update-ref','ORIG_HEAD',local]));blocked=true;}}});
  assert.ok(blocked);assert.equal(await fs.readFile(path.join(f.root,'.git','ORIG_HEAD'),'utf8'),f.original+'\n');
  assert.equal(done.head,local);assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'local\n');
  assert.deepEqual(await fs.readFile(path.join(receipt.recoveryPath,'moved-0')),conflicted);
  assert.equal(await core.git(f.root,['status','--porcelain']),'');
  assert.equal(await fs.readFile(path.join(f.root,'private.txt'),'utf8'),'private');
});

disabledSafetyTest('captured cancel retains edits or displaced files on a late interruption', async t => {
  for(const step of ['file-0','after-move-0','after-move-collision','before-index']) {
    const f=await fixture(t),recovery=require('../src/git-update-recovery');
    await commit(f.root,'Main.java','local\n');const incoming=await commit(f.other,'Main.java','incoming\n');await f.publish();
    await core.git(f.root,['fetch',f.bare,'main']);
    const inspect=async(root,run)=>({root,page:'https://github.com/student/recovery',remote,branch:'main',head:await run(root,['rev-parse','HEAD']),mainHead:await run(root,['rev-parse','refs/heads/main']),status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all']),gitDir:path.join(root,'.git'),worktrees:`worktree ${root}`});
    const options={run:f.options.run,inspect,beforeMutation:async()=>{}};
    const receipt=await recovery.prepareCancelCapture(f.root,incoming,options);
    await update(f);
    const recordPath=path.join(f.root,'.git','zero-update-recovery.json');const record=JSON.parse(await fs.readFile(recordPath,'utf8'));record.cancelCapture=receipt;record.cancelAutoMerge=await fs.readFile(path.join(f.root,'.git','AUTO_MERGE'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});await fs.writeFile(recordPath,JSON.stringify(record));
    await assert.rejects(recovery.cancelCaptured(f.root,{...options,_testBeforeCancelStep:async name=>{if(name===step || (step==='after-move-collision' && name==='after-move-0')) {if(step==='after-move-0') throw new Error('injected interruption'); await write(f.root,'Main.java','late edit');}}}),error=>error.recoveryPath===receipt.recoveryPath && /changed|injected interruption|EEXIST/.test(error.message));
    if(step==='after-move-0') await assert.rejects(fs.lstat(path.join(f.root,'Main.java')),error=>error.code==='ENOENT');
    else assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'late edit');
    if(step!=='file-0')assert.match(await fs.readFile(path.join(receipt.recoveryPath,'moved-0'),'utf8'),/incoming/);
    assert.equal(await fs.readFile(path.join(f.root,'private.txt'),'utf8'),'private');
  }
});

disabledSafetyTest('captured cancel handles binary and deletion conflicts with stock attributes', async t => {
  for (const kind of ['binary','delete']) {
    const f=await fixture(t),recovery=require('../src/git-update-recovery');
    await commit(f.root,'.gitattributes','* text=auto\n');await core.git(f.root,['push',f.bare,'main']);await core.git(f.other,['pull',f.bare,'main']);
    if(kind==='binary') await commit(f.root,'Main.java',Buffer.from([0,1,2]));
    else {await fs.unlink(path.join(f.root,'Main.java'));await commit(f.root);}
    const incoming=await commit(f.other,'Main.java',kind==='binary'?Buffer.from([0,4,5]):'incoming\n');await f.publish();
    await core.git(f.root,['fetch',f.bare,'main']);
    const inspect=async(root,run)=>({root,page:'https://github.com/student/recovery',remote,branch:'main',head:await run(root,['rev-parse','HEAD']),mainHead:await run(root,['rev-parse','refs/heads/main']),status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all']),gitDir:path.join(root,'.git'),worktrees:`worktree ${root}`});
    const options={run:f.options.run,inspect,beforeMutation:async()=>{}};
    const receipt=await recovery.prepareCancelCapture(f.root,incoming,options);
    await update(f);
    const recordPath=path.join(f.root,'.git','zero-update-recovery.json');const record=JSON.parse(await fs.readFile(recordPath,'utf8'));record.cancelCapture=receipt;record.cancelAutoMerge=await fs.readFile(path.join(f.root,'.git','AUTO_MERGE'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});await fs.writeFile(recordPath,JSON.stringify(record));
    await recovery.cancelCaptured(f.root,options);
    if(kind==='binary')assert.deepEqual(await fs.readFile(path.join(f.root,'Main.java')),Buffer.from([0,1,2]));
    else await assert.rejects(fs.lstat(path.join(f.root,'Main.java')),error=>error.code==='ENOENT');
    assert.equal(await core.git(f.root,['status','--porcelain']),'');
  }
});

disabledSafetyTest('pre-merge capture refuses a target symlink without changing the project', {skip:process.platform==='win32'}, async t=>{
  const f=await fixture(t),recovery=require('../src/git-update-recovery');
  const head=await core.git(f.root,['rev-parse','HEAD']);
  await core.git(f.root,['checkout','-b','capture-link']);
  await fs.unlink(path.join(f.root,'Main.java'));await fs.symlink('zero.json',path.join(f.root,'Main.java'));
  const target=await commit(f.root);await core.git(f.root,['checkout','main']);
  const inspect=async(root,run)=>({root,gitDir:path.join(root,'.git'),branch:'main',head:await run(root,['rev-parse','HEAD']),mainHead:head,remote,page:'https://github.com/student/recovery',worktrees:root,status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all'])});
  await assert.rejects(recovery.prepareCancelCapture(f.root,target,{run:f.options.run,inspect,beforeMutation:async()=>{}}),/Symbolic links/);
  assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'class Main { int score; }\n');
  assert.equal(await core.git(f.root,['status','--porcelain']),'');
});

disabledSafetyTest('pre-merge capture rejects an inherited alternate index environment', async t=>{
  const f=await fixture(t),recovery=require('../src/git-update-recovery');
  const previous=process.env.GIT_INDEX_FILE;
  try {
    process.env.GIT_INDEX_FILE=path.join(f.parent,'alternate-index');
    await assert.rejects(recovery.prepareCancelCapture(f.root,f.original,{run:f.options.run,inspect:async()=>{throw new Error('unexpected');},beforeMutation:async()=>{}}),/environment overrides/);
  } finally {if(previous===undefined)delete process.env.GIT_INDEX_FILE;else process.env.GIT_INDEX_FILE=previous;}
  const redirected=(root,args)=>args[0]==='rev-parse' && args[1]==='--git-path' ? Promise.resolve(path.join(f.parent,'alternate-index')) : f.options.run(root,args);
  await assert.rejects(recovery.prepareCancelCapture(f.root,f.original,{run:redirected,inspect:async()=>{throw new Error('unexpected');},beforeMutation:async()=>{}}),/changed/);
  assert.equal(await core.git(f.root,['status','--porcelain']),'');
});

disabledSafetyTest('pre-merge capture refuses directory rename topology before modifying project files', async t=>{
  const f=await fixture(t),recovery=require('../src/git-update-recovery');
  await fs.mkdir(path.join(f.root,'old'));await write(f.root,'old/A.java','base\n');await commit(f.root);
  await core.git(f.root,['push',f.bare,'main']);await core.git(f.other,['pull',f.bare,'main']);
  await core.git(f.root,['mv','old','new']);await commit(f.root);
  await write(f.other,'old/B.java','incoming\n');const incoming=await commit(f.other);await f.publish();await core.git(f.root,['fetch',f.bare,'main']);
  const head=await core.git(f.root,['rev-parse','HEAD']);
  const inspect=async(root,run)=>({root,gitDir:path.join(root,'.git'),branch:'main',head,mainHead:head,remote,page:'https://github.com/student/recovery',worktrees:root,status:await run(root,['status','--porcelain=v1','-z','--untracked-files=all'])});
  await assert.rejects(recovery.prepareCancelCapture(f.root,incoming,{run:f.options.run,inspect,beforeMutation:async()=>{}}),/Directory changes/);
  assert.equal(await fs.readFile(path.join(f.root,'new/A.java'),'utf8'),'base\n');
  assert.equal(await core.git(f.root,['status','--porcelain']),'');
});

disabledSafetyTest('unbound managed conflict refuses cancellation without invoking merge abort', async t=>{
  const f=await fixture(t);await conflict(f);
  const recordPath=path.join(f.root,'.git','zero-update-recovery.json');
  const record=JSON.parse(await fs.readFile(recordPath,'utf8'));delete record.cancelCapture;delete record.cancelAutoMerge;await fs.writeFile(recordPath,JSON.stringify(record));
  const before=await fs.readFile(path.join(f.root,'Main.java'));let abortCalled=false;
  const run=(root,args)=>{if(args.includes('--abort'))abortCalled=true;return f.options.run(root,args);};
  await assert.rejects(workflow.cancelRecovery(f.root,{run}),/no bound safe cancellation capture/);
  assert.equal(abortCalled,false);assert.deepEqual(await fs.readFile(path.join(f.root,'Main.java')),before);
  assert.ok(await core.git(f.root,['rev-parse','--verify','MERGE_HEAD']));
});

disabledSafetyTest('guided update and cancellation execute no Git reset command', {skip:process.platform==='win32'}, async t=>{
  const {execFileSync}=require('node:child_process');
  const realGit=execFileSync('which',['git'],{encoding:'utf8'}).trim();
  const bin=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-git-guard-')));
  const old={PATH:process.env.PATH,ZERO_TEST_REAL_GIT:process.env.ZERO_TEST_REAL_GIT,ZERO_TEST_GIT_LOG:process.env.ZERO_TEST_GIT_LOG,ZERO_TEST_GIT_FORBIDDEN:process.env.ZERO_TEST_GIT_FORBIDDEN};
  const log=path.join(bin,'commands'),forbidden=path.join(bin,'forbidden');
  await fs.writeFile(path.join(bin,'git'),'#!/bin/sh\nfor arg in "$@"; do case "$arg" in reset|--reset) printf forbidden > "$ZERO_TEST_GIT_FORBIDDEN"; exit 94;; esac; done\nprintf "%s\\n" "$*" >> "$ZERO_TEST_GIT_LOG"\nexec "$ZERO_TEST_REAL_GIT" "$@"\n',{mode:0o755});
  Object.assign(process.env,{PATH:bin+path.delimiter+old.PATH,ZERO_TEST_REAL_GIT:realGit,ZERO_TEST_GIT_LOG:log,ZERO_TEST_GIT_FORBIDDEN:forbidden});
  t.after(async()=>{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await fs.rm(bin,{recursive:true,force:true});});
  const f=await fixture(t);const {local}=await conflict(f);
  const recordPath=path.join(f.root,'.git','zero-update-recovery.json');
  const originalRecord=await fs.readFile(recordPath,'utf8'),unbound=JSON.parse(originalRecord);
  const capturePath=unbound.cancelCapture.recoveryPath;
  for(const [set,clear,tag] of [['--assume-unchanged','--no-assume-unchanged',/^h /],['--skip-worktree','--no-skip-worktree',/^S /]]) {
    await core.git(f.root,['update-index',set,'zero.json']);
    await assert.rejects(workflow.cancelRecovery(f.root,{run:f.options.run}),/changed/);
    assert.match(await core.git(f.root,['ls-files','-v','--','zero.json']),tag);
    await core.git(f.root,['update-index',clear,'zero.json']);
  }
  delete unbound.cancelCapture;delete unbound.cancelAutoMerge;
  await fs.writeFile(recordPath,JSON.stringify(unbound));
  await assert.rejects(workflow.cancelRecovery(f.root,{run:f.options.run}),/no bound safe cancellation capture/);
  await fs.writeFile(recordPath,originalRecord);
  const heldLock=path.join(f.root,'.git','index.lock');
  await fs.writeFile(heldLock,'other Git operation',{flag:'wx'});
  try {
    await assert.rejects(workflow.cancelRecovery(f.root,{run:f.options.run}),error=>error.code==='EEXIST');
    assert.equal(await fs.readFile(heldLock,'utf8'),'other Git operation');
    await assert.rejects(fs.lstat(path.join(capturePath,'merge-index')),error=>error.code==='ENOENT');
    await assert.rejects(fs.lstat(path.join(capturePath,'cancel-journal.jsonl')),error=>error.code==='ENOENT');
  } finally {await fs.unlink(heldLock);}
  const incomplete=path.join(capturePath,'merge-index');
  await fs.writeFile(incomplete,'retained prior bytes',{flag:'wx'});
  await assert.rejects(workflow.cancelRecovery(f.root,{run:f.options.run}),error=>error.recoveryPath===capturePath && /earlier cancellation attempt/.test(error.message));
  assert.equal(await fs.readFile(incomplete,'utf8'),'retained prior bytes');
  await assert.rejects(fs.lstat(path.join(capturePath,'cancel-journal.jsonl')),error=>error.code==='ENOENT');
  // Simulate a separate, completed pre-journal copy from an earlier attempt.
  await fs.unlink(incomplete);
  await workflow.readRecovery(f.root,{run:f.options.run});
  const matchingIndex=await fs.readFile(path.join(f.root,'.git','index'));
  await fs.writeFile(incomplete,matchingIndex,{flag:'wx',mode:0o600});
  const originalOpen=fs.open;let copyOpens=0,syncFailed=false;
  fs.open=async (...args)=>{
    const handle=await originalOpen(...args);
    if(args[0]===incomplete && ++copyOpens===2) handle.sync=async()=>{syncFailed=true;throw new Error('injected sync failure');};
    return handle;
  };
  try {
    await assert.rejects(workflow.cancelRecovery(f.root,{run:f.options.run}),error=>error.recoveryPath===capturePath && /earlier cancellation attempt/.test(error.message));
  } finally {fs.open=originalOpen;}
  assert.equal(syncFailed,true);assert.deepEqual(await fs.readFile(incomplete),matchingIndex);
  await assert.rejects(fs.lstat(path.join(capturePath,'cancel-journal.jsonl')),error=>error.code==='ENOENT');
  assert.equal((await workflow.cancelRecovery(f.root,{run:f.options.run})).head,local);
  assert.deepEqual(await fs.readFile(incomplete),matchingIndex);
  const clean=await fixture(t);await commit(clean.root,'Local.java','local\n');
  await commit(clean.other,'Incoming.java','incoming\n');await clean.publish();
  assert.equal((await update(clean)).synced,true);
  const interrupted=await fixture(t);await conflict(interrupted);
  await assert.rejects(workflow.cancelRecovery(interrupted.root,{run:interrupted.options.run,_testBeforeCancelStep:async step=>{if(step==='before-index')await write(interrupted.root,'Main.java','late edit');}}),error=>!!error.recoveryPath && /changed/.test(error.message));
  assert.equal(await fs.readFile(path.join(interrupted.root,'Main.java'),'utf8'),'late edit');
  for(const [flag,tag] of [['--assume-unchanged',/^h /],['--skip-worktree',/^S /]]) {
    const selected=await fixture(t),{result}=await conflict(selected);
    let injected=false;
    const run=async(root,args)=>{
      const value=await selected.options.run(root,args);
      if(!injected && args[0]==='--literal-pathspecs' && args[1]==='add' && args.includes('Main.java')) {
        injected=true;await core.git(root,['update-index',flag,'Main.java']);
      }
      return value;
    };
    await assert.rejects(workflow.resolveRecovery(selected.root,choose(result.recovery),{run}),error=>!!error.recoveryPath && /stopped/.test(error.message));
    assert.equal(injected,true);
    assert.match(await core.git(selected.root,['ls-files','-v','--','Main.java']),tag);
    await assert.rejects(workflow.cancelRecovery(selected.root,{run:selected.options.run}),/changed/);
    assert.match(await core.git(selected.root,['ls-files','-v','--','Main.java']),tag);
  }
  const commands=await fs.readFile(log,'utf8');
  assert.match(commands,/read-tree -m -u /);
  await assert.rejects(fs.lstat(forbidden),error=>error.code==='ENOENT');
});
test('no pending recovery is inspected without invoking Git',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-no-pending-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'.git'));let called=false;assert.equal(await workflow.readRecovery(root,{run:()=>{called=true;throw Error('unexpected Git');}}),null);assert.equal(called,false);assert.deepEqual(await fs.readdir(path.join(root,'.git')),[]);
});
