'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const workflow = require('../src/workflow');
const remote = 'https://github.com/student/workflow.git';
async function write(root, filename, content) { await fs.writeFile(path.join(root, filename), content); }
async function commit(root, filename, content) {
  await write(root, filename, content);
  await core.git(root, ['add', '--', filename]);
  await core.git(root, ['commit', '-m', 'Test change']);
  return core.git(root, ['rev-parse', 'HEAD']);
}
async function fixture(t, {empty = false, unborn = false} = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-workflow-')));
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  const root = path.join(parent, 'student'); const bare = path.join(parent, 'remote.git');
  await fs.mkdir(root); await fs.mkdir(bare);
  await core.git(bare, ['init', '--bare', '--initial-branch=main']);
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', 'core.hooksPath', os.devNull]);
  await core.git(root, ['config', 'user.name', 'Test']);
  await core.git(root, ['config', 'user.email', 'test@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', remote]);
  await write(root, 'zero.json', '{}\n'); await write(root, '.gitignore', 'secret.txt\n');
  await write(root, 'secret.txt', 'kept locally'); await write(root, 'Main.java', 'class Main {}\n');
  if (!unborn) {
    await core.git(root, ['add', 'zero.json', '.gitignore', 'Main.java']);
    await core.git(root, ['commit', '-m', 'Initial project']);
    if (!empty) await core.git(root, ['push', bare, 'HEAD:refs/heads/main']);
  }
  const calls = []; let failPush = false; let hook;
  const networkRun = async (cwd, args) => {
    calls.push(args);
    assert.ok(['ls-remote', 'fetch', 'push'].includes(args[0]));
    assert.ok(args.includes(remote));
    if (hook) await hook(cwd, args);
    if (failPush && args[0] === 'push') throw Object.assign(new Error('SECRET'), {stderr: 'network failed SECRET'});
    // Test-only transport redirects an exact reviewed URL to a disposable local bare repository.
    return core.git(cwd, args.map(arg => arg === remote ? bare : arg));
  };
  const run = (cwd, args, options) => { assert.ok(!['push', 'fetch', 'ls-remote', 'pull', 'clone'].includes(args[0]), 'Production local runner must not receive network work'); return core.git(cwd, args, options); };
  return {root, bare, parent, calls, run, networkRun, options: {run, networkRun}, setFailure(value) { failPush = value; }, setHook(value) { hook = value; }};
}
async function start(f, name = 'add-score') {
  const plan = await workflow.prepareStart(f.root, name, f.options);
  return workflow.startPrepared(plan, f.options);
}
async function sync(f) { return workflow.syncPrepared(await workflow.prepareSync(f.root, f.options), f.options); }
test('update review refuses tracked clean filters before status or network', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.root, '.git', 'info', 'attributes'), 'Main.java filter=unsafe\n');
  const calls = [];
  const run = async (cwd, args, options) => { calls.push(args); return f.run(cwd, args, options); };
  await assert.rejects(workflow.prepareSync(f.root, {...f.options, run}), /filters require native/);
  assert.ok(!calls.some(args => args.includes('status'))); assert.deepEqual(f.calls, []);
});
test('update review rechecks filters before the second status', async t => {
  const f = await fixture(t); let statuses = 0;
  const run = async (cwd, args, options) => {
    const value = await f.run(cwd, args, options);
    if (args.includes('status') && ++statuses === 1) await fs.writeFile(path.join(f.root, '.git', 'info', 'attributes'), 'Main.java filter=unsafe\n');
    return value;
  };
  await assert.rejects(workflow.prepareSync(f.root, {...f.options, run}), /filters require native/);
  assert.equal(statuses, 1); assert.deepEqual(f.calls, []);
});
test('update review refuses ambiguous literal filter names before status', async t => {
  for (const name of ['unset', 'unspecified']) {
    const f = await fixture(t);
    await fs.writeFile(path.join(f.root, '.git', 'info', 'attributes'), `Main.java filter=${name}\n`);
    await core.git(f.root, ['config', `filter.${name}.clean`, 'false']);
    const calls = [];
    const run = async (cwd, args, options) => { calls.push(args); return f.run(cwd, args, options); };
    await assert.rejects(workflow.prepareSync(f.root, {...f.options, run}), /filters require native/);
    assert.ok(!calls.some(args => args.includes('status') || args.includes('add'))); assert.deepEqual(f.calls, []);
  }
});
test('filter guard checks configuration from the Git operation environment', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, '.git', 'info', 'attributes'), 'Main.java filter=unset\n');
  const env = {...process.env, GIT_CONFIG_COUNT:'1', GIT_CONFIG_KEY_0:'filter.unset.clean', GIT_CONFIG_VALUE_0:'false'};
  const calls = [];
  const run = async (cwd, args, options) => { calls.push(args); return f.run(cwd, args, options); };
  await assert.rejects(require('../src/git-filter-guard').guardedRunner(run)(f.root, ['status', '--porcelain'], {env}), /filters require native/);
  assert.ok(!calls.some(args => args.includes('status')));
});
test('filter guard checks command-specific Git configuration', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, '.git', 'info', 'attributes'), 'Main.java filter=unset\n');
  const calls = [];
  const run = async (cwd, args, options) => { calls.push(args); return f.run(cwd, args, options); };
  await assert.rejects(require('../src/git-filter-guard').guardedRunner(run)(f.root, ['-c', 'filter.unset.clean=false', 'status', '--porcelain']), /filters require native/);
  assert.ok(!calls.some(args => args.includes('status')));
});
async function prepareIncomingUpdate(f, files) {
  await core.git(f.root, ['checkout', '-b', 'incoming-test']);
  for (const [name, data] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(f.root, name)), {recursive:true});
    await write(f.root, name, data);
  }
  await core.git(f.root, ['add', '-A']); await core.git(f.root, ['commit', '-m', 'Incoming changes']);
  const target = await core.git(f.root, ['rev-parse', 'HEAD']);
  await core.git(f.root, ['-c', `core.hooksPath=${os.devNull}`, 'push', f.bare, 'HEAD:refs/heads/main']);
  await core.git(f.root, ['checkout', 'main']); return target;
}
test('update rejects incoming attribute changes before live merge with a configured filter', async t => {
  const f = await fixture(t); await prepareIncomingUpdate(f, {'.gitattributes':'*.java filter=zero-audit-test\n', 'New.java':'class New {}\n'});
  await core.git(f.root, ['config', 'filter.zero-audit-test.smudge', 'false']);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run}), /attributes require native/);
  assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
  await assert.rejects(fs.access(path.join(f.root,'New.java')), {code:'ENOENT'});
});
test('update rejects an incoming-only path matched by info attributes before live merge', async t => {
  const f = await fixture(t); await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
  await fs.writeFile(path.join(f.root,'.git','info','attributes'), 'New.java filter=zero-audit-test\n');
  await core.git(f.root, ['config', 'filter.zero-audit-test.smudge', 'false']);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run}), /filters require native/);
  assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
});
test('update rejects configured external merge drivers before live merge', async t => {
  const f = await fixture(t); await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
  await core.git(f.root, ['config', 'merge.project.driver', 'false']);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run}), /merge drivers require native/);
  assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
});
test('update rechecks a merge driver introduced immediately before mutation', async t => {
  const f = await fixture(t); await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run, beforeMutation:async()=>core.git(f.root,['config','merge.project.driver','false'])}), /merge drivers require native/);
  assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
});
test('diverged update stops before Git merges', async t => {
  const f = await fixture(t); await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
  await commit(f.root, 'Local.java', 'class Local {}\n');
  await core.git(f.root, ['config', 'merge.project.driver', 'false']);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  await assert.rejects(workflow.prepareSync(f.root, {...f.options, run}), /different commits.*cannot update/);
  assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
});
test('update refuses branch-conditional configuration before Git merges', async t => {
  const f = await fixture(t); await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
  const included = path.join(f.parent, 'conditional-gitconfig'); await fs.writeFile(included, '');
  await core.git(f.root, ['config', 'includeIf.onbranch:some-other-branch.path', included]);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run}), /Conditional Git configuration/);
  assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
});
test('update rejects replacement refs and grafts before live merge', async t => {
  for (const kind of ['replace', 'grafts']) {
    const f = await fixture(t); const target = await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
    if (kind === 'replace') await core.git(f.root, ['replace', target, await core.git(f.root, ['rev-parse', 'HEAD'])]);
    else await fs.writeFile(path.join(f.root, '.git', 'info', 'grafts'), '');
    const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
    await assert.rejects(workflow.prepareSync(f.root, {...f.options, run}), /replacement objects|grafts/);
    assert.ok(!calls.some(args=>args.includes('merge') || args.includes('checkout')));
  }
});
test('update permits an inactive configured filter with unchanged stock attributes', async t => {
  const f = await fixture(t);
  await commit(f.root, '.gitattributes', '* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
  await core.git(f.root, ['-c', `core.hooksPath=${os.devNull}`, 'push', f.bare, 'HEAD:refs/heads/main']);
  await prepareIncomingUpdate(f, {'New.java':'class New {}\n'});
  await core.git(f.root, ['config', 'filter.zero-audit-test.smudge', 'false']);
  const result = await sync(f);
  assert.equal(result.synced, true); assert.equal(await fs.readFile(path.join(f.root,'New.java'),'utf8'), 'class New {}\n');
});
for (const archived of [false, true]) test(`update checks drivers before ${archived ? 'archived' : 'pending'} finish checkout`, async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score\n');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  if (archived) {
    await core.git(f.root, ['update-ref', `refs/zero/retired-finish/${candidate}`, candidate]);
    await core.git(f.root, ['update-ref', '-d', 'refs/zero/pending-finish', candidate]);
  }
  const mainBefore = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  await core.git(f.root, ['config', 'merge.project.driver', 'false']);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run}), /merge drivers require native/);
  assert.ok(!calls.some(args => args.includes('checkout') || args.includes('update-ref')));
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), mainBefore);
});
test('pending finish rechecks drivers after mutation authority and before moving main', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score\n');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const mainBefore = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  const calls = [], run = async (cwd, args, options) => { calls.push(args); return f.run(cwd,args,options); };
  const plan = await workflow.prepareSync(f.root, {...f.options, run});
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, run, beforeMutation:async()=>core.git(f.root,['config','merge.project.driver','false'])}), /merge drivers require native/);
  assert.ok(!calls.some(args => args.includes('checkout') || args.includes('update-ref')));
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), mainBefore);
});
async function finish(f) { return workflow.finishPrepared(await workflow.prepareFinish(f.root, f.options), f.options); }
for (const mode of ['finish','pending recovery','archived recovery']) test(`workflow ${mode} checkout suppresses configured hooks`, async t => {
  const f=await fixture(t);await start(f);await commit(f.root,'Score.java','score\n');
  if(mode!=='finish'){
    let interrupt=true;f.setHook(async(_,args)=>{if(args[0]==='ls-remote'&&f.calls.some(call=>call[0]==='push')&&interrupt){interrupt=false;throw Error('interrupted');}});
    await assert.rejects(finish(f));
    const candidate=await core.git(f.root,['rev-parse','refs/zero/pending-finish']);
    if(mode==='archived recovery'){
      await core.git(f.root,['update-ref',`refs/zero/retired-finish/${candidate}`,candidate]);
      await core.git(f.root,['update-ref','-d','refs/zero/pending-finish',candidate]);
    }
  }
  const hooks=path.join(f.parent,'hooks'),marker=path.join(f.parent,'hook-ran');await fs.mkdir(hooks);
  await fs.writeFile(path.join(hooks,'post-checkout'),`#!/bin/sh\ntouch "${marker}"\nexit 1\n`,{mode:0o755});await core.git(f.root,['config','core.hooksPath',hooks]);
  const calls=[],run=async(cwd,args,options)=>{if(args.includes('checkout'))calls.push(args);return f.run(cwd,args,options);};
  const options={...f.options,run};
  if(mode==='finish')await workflow.finishPrepared(await workflow.prepareFinish(f.root,options),options);
  else await workflow.syncPrepared(await workflow.prepareSync(f.root,options),options);
  assert.equal(await core.git(f.root,['branch','--show-current']),'main');assert.equal(calls.length,1);
  assert.deepEqual(calls[0].slice(0,5),['-c','core.fsmonitor=false','-c',`core.hooksPath=${os.devNull}`,'checkout']);await assert.rejects(fs.stat(marker),{code:'ENOENT'});
});
async function remoteChange(f, filename, content) {
  const other = path.join(f.parent, 'other');
  try { await fs.access(other); } catch {
    await core.git(f.parent, ['clone', f.bare, other]);
    await core.git(other, ['config', 'user.name', 'Remote Test']);
    await core.git(other, ['config', 'user.email', 'remote@example.invalid']);
  }
  const head = await commit(other, filename, content);
  await core.git(other, ['push', f.bare, 'HEAD:refs/heads/main']);
  return head;
}
test('finish records a named merge on main and safely deletes only the feature', async t => {
  const f = await fixture(t); const baseline = await core.git(f.root, ['rev-parse', 'HEAD']);
  const started = await start(f); assert.equal(started.branch, 'add-score'); assert.equal(started.head, baseline);
  const feature = await commit(f.root, 'Score.java', 'class Score {}\n');
  const review = await workflow.prepareFinish(f.root, f.options);
  assert.deepEqual(review.changedPaths, ['Score.java']); assert.equal(review.commitCount, 1); assert.ok(Object.isFrozen(review));
  const result = await workflow.finishPrepared(review, f.options);
  assert.equal(result.finished, true); assert.equal(result.branch, 'main'); assert.equal(result.featureHead, feature);
  assert.deepEqual((await core.git(f.root, ['rev-list', '--parents', '-n', '1', result.head])).split(' '), [result.head, baseline, feature]);
  assert.equal(await core.git(f.root, ['show', '-s', '--format=%B', result.head]), 'Zero: finish add-score\n\nZero-Finished-Change: 1\nZero-Change-Branch: add-score');
  assert.equal(await core.git(f.root, ['rev-parse', `${result.head}^{tree}`]), await core.git(f.root, ['rev-parse', `${feature}^{tree}`]));
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), result.head);
  assert.equal(await fs.readFile(path.join(f.root, 'secret.txt'), 'utf8'), 'kept locally');
  assert.deepEqual(f.calls.map(args => args[0]), ['ls-remote', 'ls-remote', 'ls-remote', 'push', 'ls-remote']);
  assert.deepEqual(f.calls[3], ['push', remote, `${result.head}:refs/heads/main`]);
  assert.ok(!f.calls.some(args => args.includes('--force') || args.includes('--force-with-lease')));
  await assert.rejects(fs.access(path.join(f.root, '.git', 'FETCH_HEAD')));
  await workflow.deleteFinishedBranch(f.root, result.finishedBranch, result.featureHead, {run: f.run});
  await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/add-score']));
  assert.equal(await core.git(f.bare, ['for-each-ref', '--format=%(refname)']), 'refs/heads/main');
});
test('explicit Sync fast-forwards a clean main to pinned newer remote main', async t => {
  const f = await fixture(t); const updated = await remoteChange(f, 'Remote.java', 'class Remote {}');
  const result = await sync(f); assert.equal(result.head, updated);
  assert.equal(result.synced, true); assert.equal(result.remoteBranch, 'main'); assert.equal(result.remoteHead, updated);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), updated);
  assert.equal(await fs.readFile(path.join(f.root, 'Remote.java'), 'utf8'), 'class Remote {}');
  assert.deepEqual(f.calls.find(args => args[0] === 'fetch'), ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, updated]);
  await assert.rejects(fs.access(path.join(f.root, '.git', 'FETCH_HEAD')));
});
test('diverged main hands off without changing the feature or local main', async t => {
  const f = await fixture(t); await start(f);
  const feature = await commit(f.root, 'Score.java', 'class Score {}');
  const remoteHead = await remoteChange(f, 'Remote.java', 'class Remote {}');
  const localMain = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), feature);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), localMain);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
  assert.equal(await fs.readFile(path.join(f.root, 'Score.java'), 'utf8'), 'class Score {}');
  assert.ok(!f.calls.some(args => args[0] === 'push'));
});
test('conflicting main changes hand off before starting a merge', async t => {
  const f = await fixture(t); await start(f);
  const feature = await commit(f.root, 'Main.java', 'class Main { int score; }\n');
  const initialMain = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  const remoteHead = await remoteChange(f, 'Main.java', 'class Main { int lives; }\n');
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), feature);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), initialMain);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'class Main { int score; }\n');
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'MERGE_HEAD']));
  assert.ok(!f.calls.some(args => args[0] === 'push'));
});
test('failed push keeps local main and retries the same pending SHA', async t => {
  const f = await fixture(t); await start(f);
  const base = await core.git(f.root, ['rev-parse', 'refs/heads/main']);
  const head = await commit(f.root, 'Score.java', 'class Score {}');
  f.setFailure(true);
  await assert.rejects(finish(f), error => /commits are preserved/.test(error.message) && !/SECRET/.test(error.message));
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), base);
  const pending = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  f.setFailure(false); const result = await finish(f); assert.equal(result.head, pending); assert.equal(result.featureHead, head);
});
test('remote racing the final push preserves the feature and hands off divergence', async t => {
  const f = await fixture(t); await start(f); const feature=await commit(f.root, 'Score.java', 'class Score {}');
  let remoteHead;
  f.setHook(async (_, args) => { if (args[0] === 'push') { f.setHook(null); remoteHead = await remoteChange(f, 'Remote.java', 'class Remote {}'); } });
  await assert.rejects(finish(f), /GitHub main changed and refused/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), feature);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
  const callsBefore=f.calls.filter(args=>args[0]==='push').length;
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), feature);
  assert.equal(f.calls.filter(args=>args[0]==='push').length,callsBefore);
});
test('cancelled executor and forged plans leave refs and files untouched', async t => {
  const f = await fixture(t); const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  const refs = await core.git(f.root, ['show-ref']); const before = f.calls.length;
  await assert.rejects(workflow.startPrepared(plan, {...f.options, beforeMutation: async () => { throw new Error('Cancelled'); }}), /Cancelled/);
  assert.equal(await core.git(f.root, ['show-ref']), refs); assert.equal(f.calls.length, before);
  await assert.rejects(workflow.startPrepared({...plan}, f.options), /Review this project/);
});
test('post-review file, branch, destination and main drift invalidate before mutation', async t => {
  for (const kind of ['file', 'branch', 'destination', 'main']) {
    const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'class Score {}');
    const plan = await workflow.prepareFinish(f.root, f.options);
    if (kind === 'file') await write(f.root, 'Score.java', 'changed');
    if (kind === 'branch') await core.git(f.root, ['checkout', '-b', 'other']);
    if (kind === 'destination') await core.git(f.root, ['remote', 'set-url', 'origin', 'https://github.com/other/project.git']);
    if (kind === 'main') await core.git(f.root, ['update-ref', 'refs/heads/main', plan.head]);
    if (kind === 'remote') await remoteChange(f, 'Remote.java', 'class Remote {}');
    const calls = f.calls.length;
    await assert.rejects(workflow.finishPrepared(plan, f.options), /changed after review/);
    assert.ok(!f.calls.slice(calls).some(args => ['fetch', 'push'].includes(args[0])));
  }
});
test('drift introduced during pinned fetch stops before main/feature mutation', async t => {
  const f = await fixture(t); await remoteChange(f, 'Remote.java', 'class Remote {}');
  f.setHook(async (_, args) => { if (args[0] === 'fetch') await write(f.root, 'Main.java', 'edited during fetch'); });
  await assert.rejects(workflow.prepareSync(f.root, f.options), /changed after review/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'main');
  await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/feature']));
});
test('unsafe/duplicate names, unborn/main/detached and pending-operation guards are actionable', async t => {
  const f = await fixture(t);
  for (const name of ['main', '-x', 'x..y', 'x@{1}', 'HEAD~1', 'x//y', 'x.lock', '', 'a b', 'x:main', '../x']) await assert.rejects(workflow.prepareStart(f.root, name, f.options), /name|valid feature/);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), /Start a feature/);
  await start(f); const nested = await workflow.prepareStart(f.root, 'other', f.options); assert.equal(nested.branch, 'add-score');
  await core.git(f.root, ['checkout', 'main']); await assert.rejects(workflow.prepareStart(f.root, 'add-score', f.options), /already exists/);
  await core.git(f.root, ['checkout', '--detach']); await assert.rejects(workflow.prepareStart(f.root, 'other', f.options), /detached HEAD/);
  await core.git(f.root, ['checkout', 'main']); await write(f.root, '.git/MERGE_HEAD', 'pending');
  await assert.rejects(workflow.prepareStart(f.root, 'other', f.options), /current Git merge/);
  const u = await fixture(t, {unborn: true}); await assert.rejects(workflow.prepareStart(u.root, 'feature', u.options), /local commit on main.*Pushing is not required/);
});

test('New branch carries staged, unstaged, untracked and ignored work without committing', async t => {
  const f = await fixture(t);
  const head = await core.git(f.root, ['rev-parse', 'HEAD']);
  await write(f.root, 'Main.java', 'staged');
  await core.git(f.root, ['add', 'Main.java']);
  await write(f.root, 'Main.java', 'staged and unstaged');
  await write(f.root, 'New.java', 'untracked');
  const before = await core.git(f.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  assert.ok(plan.status);
  await workflow.startPrepared(plan, f.options);
  assert.equal(await core.git(f.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']), before);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), head);
  assert.equal(await core.git(f.root, ['rev-parse', 'main']), head);
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'staged and unstaged');
  assert.equal(await core.git(f.root, ['show', ':Main.java']), 'staged');
  assert.equal(await fs.readFile(path.join(f.root, 'New.java'), 'utf8'), 'untracked');
  assert.equal(await fs.readFile(path.join(f.root, 'secret.txt'), 'utf8'), 'kept locally');
  assert.equal(f.calls.length, 0);
});

test('New branch rechecks dirty file contents after confirmation', async t => {
  const f = await fixture(t);
  await write(f.root, 'Main.java', 'first edit');
  const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  await write(f.root, 'Main.java', 'later edit');
  await assert.rejects(workflow.startPrepared(plan, f.options), /changed after review/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'main');
  await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/feature']));
  assert.equal(await fs.readFile(path.join(f.root, 'Main.java'), 'utf8'), 'later edit');
});
test('New branch checks editor state immediately before checkout', async t => {
  const f = await fixture(t);
  const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  await assert.rejects(workflow.startPrepared(plan, {...f.options, beforeCheckout:async()=>{await Promise.resolve();throw Error('Open files changed');}}), /Open files changed/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'main');
  await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/feature']));
});
test('New branch reports successful checkout when files change during it', async t => {
  const f = await fixture(t);
  const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  const run = async (cwd,args) => {const result=await f.run(cwd,args);if(args.includes('checkout')) await write(f.root,'Main.java','autosaved edit');return result;};
  const result = await workflow.startPrepared(plan, {...f.options,run});
  assert.equal(result.postCheckoutChanged,true);
  assert.equal(await core.git(f.root,['branch','--show-current']),'feature');
  assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'autosaved edit');
});
test('New branch reports uncertain active branch if another operation switches it', async t => {
  const f = await fixture(t);
  const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  const run = async (cwd,args) => {const result=await f.run(cwd,args);if(args.includes('checkout') && args.includes('-b')) await f.run(cwd,['checkout','main']);return result;};
  const result = await workflow.startPrepared(plan, {...f.options,run});
  assert.equal(result.activeUncertain,true);
  assert.equal(await core.git(f.root,['branch','--show-current']),'main');
  assert.equal(await core.git(f.root,['rev-parse','refs/heads/feature']),plan.head);
});
test('New branch detects a switch during its final inspection', async t => {
  const f = await fixture(t);
  const plan = await workflow.prepareStart(f.root, 'feature', f.options);
  let checkedOut=false, switched=false;
  const run=async(cwd,args)=>{const result=await f.run(cwd,args);if(args.includes('checkout') && args.includes('-b'))checkedOut=true;else if(checkedOut && !switched && args[0]==='symbolic-ref'){switched=true;await f.run(cwd,['checkout','main']);}return result;};
  const result=await workflow.startPrepared(plan,{...f.options,run});
  assert.equal(result.activeUncertain,true);
  assert.equal(await core.git(f.root,['branch','--show-current']),'main');
});
test('New branch suppresses the configured post-checkout hook', async t => {
  const f=await fixture(t),hooks=path.join(f.parent,'hooks'),marker=path.join(f.parent,'hook-ran');
  await fs.mkdir(hooks);await fs.writeFile(path.join(hooks,'post-checkout'),`#!/bin/sh\ntouch "${marker}"\nexit 1\n`,{mode:0o755});
  await core.git(f.root,['config','core.hooksPath',hooks]);
  const calls=[],run=async(cwd,args,options)=>{if(args.includes('checkout'))calls.push(args);return f.run(cwd,args,options);};
  const plan=await workflow.prepareStart(f.root,'feature',{...f.options,run});
  const result=await workflow.startPrepared(plan,{...f.options,run});
  assert.equal(result.checkoutWarning,false);assert.equal(result.activeUncertain,false);
  assert.deepEqual(calls[0].slice(0,3),['-c',`core.hooksPath=${os.devNull}`,'checkout']);
  await assert.rejects(fs.stat(marker),{code:'ENOENT'});
  assert.equal(await core.git(f.root,['branch','--show-current']),'feature');
});
test('New branch reports unknown outcome when ref inspection fails after checkout', async t => {
  const f=await fixture(t);const plan=await workflow.prepareStart(f.root,'feature',f.options);
  let checkoutStarted=false;const run=async(cwd,args)=>{if(args.includes('checkout') && args.includes('-b')) {await f.run(cwd,args);checkoutStarted=true;throw Object.assign(Error('checkout failed'),{code:1});}if(checkoutStarted && args[0]==='show-ref' && args.includes('--quiet'))throw Object.assign(Error('inspection failed'),{code:128});return f.run(cwd,args);};
  await assert.rejects(workflow.startPrepared(plan,{...f.options,run}),/branch outcome could not be checked/);
  assert.equal(await core.git(f.root,['branch','--show-current']),'feature');
});
test('Sync keeps locally ahead main and Merge refuses missing local or remote main', async t => {
  const f = await fixture(t); await commit(f.root, 'Local.java', 'local');
  assert.equal((await sync(f)).updated, false);
  await start(f); await core.git(f.root, ['checkout', 'main']);
  await core.git(f.root, ['checkout', '-b', 'feature', 'HEAD~1']);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), /Local main contains changes/);
  const e = await fixture(t, {empty: true}); await start(e); await commit(e.root, 'Score.java', 'score');
  const feature = await core.git(e.root, ['rev-parse', 'HEAD']);
  await assert.rejects(finish(e), /GitHub main is missing/);
  assert.equal(await core.git(e.root, ['rev-parse', 'HEAD']), feature);
  assert.ok(!e.calls.some(args => args[0] === 'push'));
});
test('cleanup refuses modified feature, missing commits and a dirty/non-main worktree', async t => {
  const f = await fixture(t); await start(f); const head = await commit(f.root, 'Score.java', 'score'); await finish(f);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'main', head, {run: f.run}), /exact finished/);
  await write(f.root, 'Main.java', 'dirty'); await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run: f.run}), /local commit.*Source Control → Commit.*Pushing is not required/);
  await core.git(f.root, ['restore', 'Main.java']); await core.git(f.root, ['checkout', 'add-score']);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run: f.run}), /Switch to clean main/);
  const changed = await commit(f.root, 'More.java', 'more'); await core.git(f.root, ['checkout', 'main']);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run: f.run}), /changed or has work/);
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', changed, {run: f.run}), /changed or has work/);
});
test('incoming main cannot overwrite ignored local files and no helper/network fallback is used', async t => {
  const f = await fixture(t);
  // Remote removes ignore and introduces a file deliberately kept private locally.
  const other = path.join(f.parent, 'other'); await remoteChange(f, 'Remote.java', 'remote');
  await write(other, '.gitignore', ''); await core.git(other, ['add', '.gitignore']);
  await commit(other, 'secret.txt', 'remote file'); await core.git(other, ['push', f.bare, 'HEAD:refs/heads/main']);
  await assert.rejects(sync(f), /overwrite a local ignored file/);
  assert.equal(await fs.readFile(path.join(f.root, 'secret.txt'), 'utf8'), 'kept locally');
  await assert.rejects(workflow.prepareSync(f.root), /native GitHub connection/);
});

test('New branch ignores remote branch names and works offline without origin or authentication', async t => {
  const f = await fixture(t); const head = await core.git(f.root, ['rev-parse', 'HEAD']);
  await core.git(f.root, ['push', f.bare, `${head}:refs/heads/old-feature`]);
  const never = async () => { throw new Error('Network or authentication must not run'); };
  const plan = await workflow.prepareStart(f.root, 'old-feature', {run: f.run, networkRun: never});
  assert.equal((await workflow.startPrepared(plan, {run: f.run, networkRun: never, beforeNetwork: never})).head, head);
  assert.equal(f.calls.length, 0);
  await core.git(f.root, ['checkout', 'main']); await core.git(f.root, ['remote', 'remove', 'origin']);
  const offline = await workflow.prepareStart(f.root, 'offline', {run: f.run});
  assert.equal((await workflow.startPrepared(offline, {run: f.run})).branch, 'offline');
  assert.equal(await fs.readFile(path.join(f.root, 'secret.txt'), 'utf8'), 'kept locally');
});

test('cleanup compare-and-delete preserves a branch concurrently moved to unmerged work', async t => {
  const f = await fixture(t); await start(f); const head = await commit(f.root, 'Score.java', 'score'); await finish(f);
  await core.git(f.root, ['checkout', '-b', 'unmerged']); const changed = await commit(f.root, 'More.java', 'more'); await core.git(f.root, ['checkout', 'main']);
  let attempted = false;
  const run = async (root, args, options) => {
    if (args.includes('--show-ref-format')) {
      attempted = true;
      await core.git(root, ['update-ref', 'refs/heads/add-score', changed]);
    }
    return f.run(root, args, options);
  };
  await assert.rejects(workflow.deleteFinishedBranch(f.root, 'add-score', head, {run}), /could not delete/);
  assert.equal(attempted, true);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/add-score']), changed);
});

test('exact project root, additional worktrees and unrelated remote main are refused', async t => {
  const f = await fixture(t); const child = path.join(f.root, 'child'); await fs.mkdir(child); await write(child, 'zero.json', '{}');
  await assert.rejects(workflow.prepareStart(child, 'feature', f.options), /different Git repository/);
  await fs.rm(child, {recursive: true});
  const extra = path.join(f.parent, 'worktree'); await core.git(f.root, ['worktree', 'add', '-b', 'extra', extra]);
  await assert.rejects(workflow.prepareStart(f.root, 'feature', f.options), /multiple Git worktrees/);
  await core.git(f.root, ['worktree', 'remove', extra]);
  await t.test('unrelated remote main', {skip:'Requires replacing remote main with unrelated history; excluded under the no-rewind constraint.'}, async()=>{
  await start(f); await commit(f.root, 'Score.java', 'score');
  await remoteChange(f, 'Remote.java', 'remote');
  const other = path.join(f.parent, 'other'); await core.git(other, ['checkout', '--orphan', 'unrelated']);
  await core.git(other, ['add', '.']); await core.git(other, ['commit', '-m', 'Unrelated root']);
  const foreign = await core.git(other, ['rev-parse', 'HEAD']);
  await core.git(other, ['push', f.bare, 'HEAD:refs/heads/unrelated']); await core.git(f.bare, ['update-ref', 'refs/heads/main', foreign]);
  await assert.rejects(sync(f), /unrelated histories/);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'add-score');
  assert.ok(!f.calls.some(args => args[0] === 'push'));
  });
});

test('Sync downloads the immutable reviewed main even if the remote advances during fetch', async t => {
  const f = await fixture(t); const reviewed = await remoteChange(f, 'Remote.java', 'first remote change');
  let latest;
  f.setHook(async (_, args) => { if (args[0] === 'fetch') { f.setHook(null); latest = await remoteChange(f, 'Remote.java', 'remote'); } });
  const plan = await workflow.prepareSync(f.root, f.options);
  const result = await workflow.syncPrepared(plan, f.options);
  assert.equal(result.head, reviewed); assert.equal(result.remoteHead, reviewed);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), latest);
  assert.equal((await sync(f)).head, latest);
});

test('New branch uses current local main despite newer GitHub main and never snapshots source assets', async t => {
  const f = await fixture(t); const head = await core.git(f.root, ['rev-parse', 'HEAD']);
  await remoteChange(f, 'Remote.java', 'remote');
  const run = async (root, args) => {
    assert.ok(!args.includes('cat-file') && !args.includes('show'), 'Local branch creation must not read source contents');
    return f.run(root, args);
  };
  const plan = await workflow.prepareStart(f.root, 'offline', {run});
  assert.equal((await workflow.startPrepared(plan, {run})).head, head);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), head);
  assert.equal(f.calls.length, 0);
});

test('New branch refuses stale HEAD, branch, dirty files and local main before creating a branch', async t => {
  for (const kind of ['head', 'branch', 'dirty', 'main']) {
    const f = await fixture(t); const plan = await workflow.prepareStart(f.root, 'feature', f.options);
    if (kind === 'head') await commit(f.root, 'New.java', 'new');
    if (kind === 'branch') await core.git(f.root, ['checkout', '-b', 'other']);
    if (kind === 'dirty') await write(f.root, 'Main.java', 'unsaved');
    if (kind === 'main') await core.git(f.root, ['update-ref', '-d', 'refs/heads/main', plan.head]);
    await assert.rejects(workflow.startPrepared(plan, f.options), /changed after review/);
    await assert.rejects(core.git(f.root, ['show-ref', '--verify', 'refs/heads/feature']));
    assert.equal(f.calls.length, 0);
  }
});

test('Sync checks session and project guards before downloading and before mutating', async t => {
  const f = await fixture(t); await remoteChange(f, 'Remote.java', 'remote');
  const plan = await workflow.prepareSync(f.root, f.options);
  const calls = f.calls.length; const refs = await core.git(f.root, ['show-ref']);
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, beforeNetwork: async () => { throw new Error('Session ended'); }}), /Session ended/);
  assert.equal(f.calls.length, calls); assert.equal(await core.git(f.root, ['show-ref']), refs);
  await assert.rejects(workflow.syncPrepared(plan, {...f.options, beforeMutation: async () => { throw new Error('Project closed'); }}), /Project closed/);
  assert.equal(await core.git(f.root, ['show-ref']), refs);
  assert.equal(await core.git(f.root, ['branch', '--show-current']), 'main');
});

test('Merge preparation checks remote and session failure blocks push', async t => {
  const f = await fixture(t); await start(f); const base = await core.git(f.root, ['rev-parse', 'refs/heads/main']); await commit(f.root, 'Score.java', 'score');
  let snapshots = 0;
  const run = async (root, args) => { if (args[0] === 'ls-files' && args.includes('--cached') && args.includes('--ignored')) snapshots++; return f.run(root, args); };
  const plan = await workflow.prepareFinish(f.root, {...f.options,run});
  assert.deepEqual(f.calls.map(args=>args[0]),['ls-remote']);
  await assert.rejects(workflow.finishPrepared(plan, {...f.options, run, beforeNetwork: async () => { throw new Error('Session ended'); }}), /Session ended/);
  assert.deepEqual(f.calls.map(args=>args[0]),['ls-remote']); assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), base);
  f.calls.length=0;snapshots = 0;
  const retry = await workflow.prepareFinish(f.root, {...f.options,run});
  const result = await workflow.finishPrepared(retry, {...f.options, run});
  assert.equal(result.finished, true); assert.ok(snapshots >= 4);
  assert.deepEqual(f.calls.map(args => args[0]), ['ls-remote', 'ls-remote', 'ls-remote', 'push', 'ls-remote']);
});

test('Sync refuses dirty main and hands off divergence without losing commits', async t => {
  const f = await fixture(t); await write(f.root, 'Main.java', 'dirty');
  await assert.rejects(workflow.prepareSync(f.root, f.options), /local commit.*Source Control → Commit.*Pushing is not required/);
  assert.equal(f.calls.length, 0);
  await core.git(f.root, ['restore', 'Main.java']); const head = await commit(f.root, 'Local.java', 'local');
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), head);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
  assert.ok(!f.calls.some(args => args[0] === 'push'));
});

test('an unconfirmed successful push retries the exact pending commit and fresh clone sees the boundary', async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted confirmation'); } });
  await assert.rejects(finish(f), error => error.workflowRecovery?.operation === 'merge');
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), candidate);
  const completed = await finish(f); assert.equal(completed.head, candidate); assert.equal(completed.featureHead, feature);
  const clone = path.join(f.parent, 'fresh'); await core.git(f.parent, ['clone', f.bare, clone]);
  assert.equal(await core.git(clone, ['show', '-s', '--format=%B', 'HEAD']), 'Zero: finish add-score\n\nZero-Finished-Change: 1\nZero-Change-Branch: add-score');
});
test('Sync recovers an unconfirmed finish included in a subsequently advanced remote main', async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted confirmation'); } });
  await assert.rejects(finish(f), error => error.workflowRecovery?.operation === 'merge');
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  await assert.rejects(finish(f), /GitHub main no longer matches the reviewed merge base/);
  const pushes = f.calls.filter(args => args[0] === 'push').length;
  const result = await sync(f);
  assert.equal(result.synced, true); assert.equal(result.branch, 'main');
  assert.deepEqual(result.confirmedFinish, {branch:'add-score', featureHead:feature, head:candidate});
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), remoteHead);
  await core.git(f.root, ['merge-base', '--is-ancestor', feature, result.head]);
  await core.git(f.root, ['merge-base', '--is-ancestor', remoteHead, result.head]);
  assert.equal(f.calls.filter(args => args[0] === 'push').length, pushes);
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/add-score']), feature);
  assert.equal(await core.git(f.root, ['rev-list', '--count', '--grep=Zero-Finished-Change: 1', result.head]), '1');
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), remoteHead);
});
test('Sync from main retires a validated pending finish included in newer remote history', async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  await core.git(f.root, ['checkout', 'main']);
  const result = await sync(f);
  assert.equal(result.head, remoteHead);
  await core.git(f.root, ['merge-base', '--is-ancestor', candidate, result.head]);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/add-score']), feature);
  assert.equal(await core.git(f.root, ['rev-list', '--count', '--grep=Zero-Finished-Change: 1', result.head]), '1');
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
  assert.equal((await start(f, 'next-change')).branch, 'next-change');
});
test('Sync archives a rejected candidate and hands off divergent feature safely', async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  f.setFailure(true); await assert.rejects(finish(f)); f.setFailure(false);
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  await core.git(f.root, ['checkout', 'main']);
  const pushes = f.calls.filter(args => args[0] === 'push').length;
  assert.equal((await sync(f)).head, remoteHead);
  assert.equal(f.calls.filter(args => args[0] === 'push').length, pushes);
  assert.equal(await core.git(f.root, ['rev-parse', `refs/zero/retired-finish/${candidate}`]), candidate);
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
  await start(f, 'another-change');
  await core.git(f.root, ['checkout', 'add-score']);
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), feature);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), remoteHead);
  assert.equal(await core.git(f.root, ['rev-parse', `refs/zero/retired-finish/${candidate}`]), candidate);
});
test('divergent pending retirement uses the reviewed remote commit even if remote advances', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score');
  f.setFailure(true); await assert.rejects(finish(f)); f.setFailure(false);
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const reviewed = await remoteChange(f, 'Remote.java', 'first');
  await core.git(f.root, ['checkout', 'main']);
  const plan = await workflow.prepareSync(f.root, f.options);
  const later = await remoteChange(f, 'Later.java', 'later');
  const result = await workflow.syncPrepared(plan, f.options);
  assert.equal(result.head, reviewed); assert.notEqual(result.head, later);
  assert.equal(await core.git(f.root, ['rev-parse', `refs/zero/retired-finish/${candidate}`]), candidate);
});
for (const mode of ['unchanged', 'newer work', 'interrupted checkout']) test(`archived merge reappearing after pinned Sync preserves ${mode}`, {skip:'Requires a simulated remote-history rewind; excluded under the no-reset and no-force constraint.'}, async t => {
  const f = await fixture(t); const base = await core.git(f.root, ['rev-parse', 'HEAD']);
  await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const other = path.join(f.parent, 'rewriter'); await core.git(f.parent, ['clone', f.bare, other]);
  await core.git(other, ['config', 'user.name', 'Remote Test']); await core.git(other, ['config', 'user.email', 'remote@example.invalid']);
  await core.git(other, ['reset', '--hard', base]); const divergent = await commit(other, 'Remote.java', 'remote');
  await core.git(other, ['push', '--force', f.bare, 'HEAD:refs/heads/main']);
  await core.git(f.root, ['checkout', 'main']); const plan = await workflow.prepareSync(f.root, f.options);
  await core.git(other, ['merge', '--no-ff', '--no-edit', candidate]);
  const joined = await core.git(other, ['rev-parse', 'HEAD']); await core.git(other, ['push', f.bare, 'HEAD:refs/heads/main']);
  assert.equal((await workflow.syncPrepared(plan, f.options)).head, divergent);
  assert.equal(await core.git(f.root, ['rev-parse', `refs/zero/retired-finish/${candidate}`]), candidate);
  await core.git(f.root, ['checkout', 'add-score']);
  const featureHead = mode === 'newer work' ? await commit(f.root, 'More.java', 'more') : feature;
  if (mode === 'interrupted checkout') {
    let fail = true;
    const run = async (root, args) => { if (fail && args.includes('checkout') && args.at(-1) === 'main') { fail = false; throw new Error('interrupted'); } return f.run(root, args); };
    await assert.rejects(workflow.syncPrepared(await workflow.prepareSync(f.root, {...f.options, run}), {...f.options, run}), /checkout may have started/);
    assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), joined);
  }
  const result = await sync(f);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), joined);
  if (mode === 'newer work') {
    assert.equal(result.branch, 'add-score'); await core.git(f.root, ['merge-base', '--is-ancestor', featureHead, result.head]);
    const finished = await finish(f);
    assert.equal(await core.git(f.root, ['rev-list', '--count', '--grep=Zero-Finished-Change: 1', finished.head]), '2');
  } else {
    assert.equal(result.branch, 'main'); assert.equal(result.head, joined);
    assert.equal(await core.git(f.root, ['rev-list', '--count', '--grep=Zero-Finished-Change: 1', result.head]), '1');
  }
});
test('Sync refuses ambiguous matching archived finishes before moving refs', async t => {
  const f = await fixture(t); const base = await core.git(f.root, ['rev-parse', 'HEAD']);
  await start(f); const first = await commit(f.root, 'Score.java', 'score');
  const message = 'Zero: finish add-score\n\nZero-Finished-Change: 1\nZero-Change-Branch: add-score';
  const makeBoundary = async feature => core.git(f.root, ['commit-tree', await core.git(f.root, ['rev-parse', `${feature}^{tree}`]), '-p', base, '-p', feature, '-m', message]);
  const a = await makeBoundary(first); const second = await commit(f.root, 'More.java', 'more'); const b = await makeBoundary(second);
  const tree = await core.git(f.root, ['rev-parse', `${second}^{tree}`]);
  const remoteHead = await core.git(f.root, ['commit-tree', tree, '-p', a, '-p', b, '-m', 'Combined remote']);
  await core.git(f.root, ['update-ref', `refs/zero/retired-finish/${a}`, a]);
  await core.git(f.root, ['update-ref', `refs/zero/retired-finish/${b}`, b]);
  await core.git(f.root, ['push', f.bare, `${remoteHead}:refs/heads/main`]);
  await assert.rejects(sync(f), /More than one earlier merge/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), second);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), base);
});
test('Finish refuses a manually integrated archived boundary missing from local main', async t => {
  const f = await fixture(t); const base = await core.git(f.root, ['rev-parse', 'HEAD']);
  await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  const tree = await core.git(f.root, ['rev-parse', `${feature}^{tree}`]);
  const candidate = await core.git(f.root, ['commit-tree', tree, '-p', base, '-p', feature, '-m', 'Zero: finish add-score\n\nZero-Finished-Change: 1\nZero-Change-Branch: add-score']);
  await core.git(f.root, ['update-ref', `refs/zero/retired-finish/${candidate}`, candidate]);
  await core.git(f.root, ['merge', '--ff-only', candidate]);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), /earlier finished merge missing from local main/);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), base);
  assert.equal(f.calls.length, 0);
});
test('Sync from main keeps an unconfirmed candidate when remote is unchanged', async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  f.setFailure(true); await assert.rejects(finish(f)); f.setFailure(false);
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  await core.git(f.root, ['checkout', 'main']); const main = await core.git(f.root, ['rev-parse', 'HEAD']);
  await assert.rejects(sync(f), /earlier merge is still pending/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), main);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), candidate);
  await core.git(f.root, ['checkout', 'add-score']);
  const finished = await finish(f); assert.equal(finished.head, candidate); assert.equal(finished.featureHead, feature);
});
test('Sync from main preserves pending candidate when remote main is rewritten outside its base', {skip:'Requires a simulated remote-history rewind; excluded under the no-reset and no-force constraint.'}, async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score');
  f.setFailure(true); await assert.rejects(finish(f)); f.setFailure(false);
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const tree = await core.git(f.root, ['rev-parse', 'HEAD^{tree}']);
  const rewritten = await core.git(f.root, ['commit-tree', tree, '-m', 'Rewritten history']);
  await core.git(f.root, ['push', '--force', f.bare, `${rewritten}:refs/heads/main`]);
  await core.git(f.root, ['checkout', 'main']); const main = await core.git(f.root, ['rev-parse', 'HEAD']);
  await assert.rejects(sync(f), /earlier merge is still pending/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), main);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), candidate);
});
test('Sync archives an unconfirmed uploaded candidate when remote was rewritten to a divergent descendant of its base', {skip:'Requires a simulated remote-history rewind; excluded under the no-reset and no-force constraint.'}, async t => {
  const f = await fixture(t); const base = await core.git(f.root, ['rev-parse', 'HEAD']);
  await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), candidate);
  const other = path.join(f.parent, 'rewriter');
  await core.git(f.parent, ['clone', f.bare, other]);
  await core.git(other, ['config', 'user.name', 'Remote Test']); await core.git(other, ['config', 'user.email', 'remote@example.invalid']);
  await core.git(other, ['reset', '--hard', base]);
  const rewritten = await commit(other, 'Remote.java', 'remote');
  await core.git(other, ['push', '--force', f.bare, 'HEAD:refs/heads/main']);
  await core.git(f.root, ['checkout', 'main']);
  assert.equal((await sync(f)).head, rewritten);
  assert.equal(await core.git(f.root, ['rev-parse', `refs/zero/retired-finish/${candidate}`]), candidate);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/add-score']), feature);
});
for (const stage of ['merge', 'archive', 'delete']) test(`divergent main Sync resumes after interruption at ${stage}`, async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  f.setFailure(true); await assert.rejects(finish(f)); f.setFailure(false);
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  await core.git(f.root, ['checkout', 'main']);
  let fail = true;
  const run = async (root, args) => {
    const interrupted = stage === 'merge' ? args.includes('merge') && args.includes('--ff') : stage === 'archive' ? args[0] === 'update-ref' && args.includes(`refs/zero/retired-finish/${candidate}`) : args[0] === 'update-ref' && args.includes('-d') && args.includes('refs/zero/pending-finish');
    if (fail && interrupted) { fail = false; throw new Error('interrupted'); }
    return f.run(root, args);
  };
  await assert.rejects(workflow.syncPrepared(await workflow.prepareSync(f.root, {...f.options, run}), {...f.options, run}));
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), candidate);
  assert.equal((await sync(f)).head, remoteHead);
  assert.equal(await core.git(f.root, ['rev-parse', `refs/zero/retired-finish/${candidate}`]), candidate);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/add-score']), feature);
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
});
test('Sync and New branch preserve an unrelated pending ref on main', async t => {
  const f = await fixture(t);
  const initial = await core.git(f.root, ['rev-parse', 'HEAD']);
  await core.git(f.root, ['update-ref', 'refs/zero/pending-finish', initial]);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  assert.equal((await sync(f)).head, remoteHead);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), initial);
  await assert.rejects(start(f, 'next-change'), /pending finished change needs attention/);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), initial);
});
test('a marker-shaped commit with the wrong feature tree is not retired on main', async t => {
  const f = await fixture(t); const base = await core.git(f.root, ['rev-parse', 'HEAD']);
  await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  const tree = await core.git(f.root, ['rev-parse', `${base}^{tree}`]);
  const malformed = await core.git(f.root, ['commit-tree', tree, '-p', base, '-p', feature, '-m', 'Zero: finish add-score\n\nZero-Finished-Change: 1\nZero-Change-Branch: add-score']);
  await core.git(f.root, ['update-ref', 'refs/zero/pending-finish', malformed]);
  await core.git(f.root, ['checkout', 'main']);
  await core.git(f.root, ['merge', '--ff-only', malformed]);
  await sync(f);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), malformed);
  await assert.rejects(start(f, 'next-change'), /pending finished change needs attention/);
});
test('New branch clears a validated pending finish after Sync is interrupted after advancing main', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  await core.git(f.root, ['checkout', 'main']);
  let fail = true;
  const run = async (root, args) => {
    if (fail && args[0] === 'update-ref' && args.includes('-d') && args.includes('refs/zero/pending-finish')) { fail = false; throw new Error('interrupted'); }
    return f.run(root, args);
  };
  await assert.rejects(workflow.syncPrepared(await workflow.prepareSync(f.root, {...f.options, run}), {...f.options, run}), /clear the confirmed pending change/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), remoteHead);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']), candidate);
  assert.equal((await start(f, 'next-change')).head, remoteHead);
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
});
for (const afterCheckout of [false, true]) test(`Sync resumes after ${afterCheckout ? 'completed' : 'interrupted'} checkout of confirmed finish`, async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score');
  let interrupt = true;
  f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const remoteHead = await remoteChange(f, 'Remote.java', 'remote');
  let fail = true;
  const run = async (root, args) => {
    if (fail && args.includes('checkout') && args.at(-1) === 'main') { fail = false; if (afterCheckout) await f.run(root, args); throw new Error('interrupted checkout'); }
    return f.run(root, args);
  };
  await assert.rejects(workflow.syncPrepared(await workflow.prepareSync(f.root, {...f.options, run}), {...f.options, run}), /checkout may have started/);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), candidate);
  const result = await sync(f);
  assert.equal(result.head, remoteHead);
  assert.equal(await core.git(f.root, ['rev-list', '--count', '--grep=Zero-Finished-Change: 1', result.head]), '1');
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
});
test('empty change is rejected before push or pending ref creation', async t => {
  const f = await fixture(t); await start(f);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), /no commits to finish/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(core.git(f.root, ['rev-parse', '--verify', 'refs/zero/pending-finish']));
});
test('interruption after confirmed push and local main update retries without a second boundary', async t => {
  const f = await fixture(t); await start(f); const feature = await commit(f.root, 'Score.java', 'score');
  let failCheckout = true;
  const run = async (root, args) => {
    if (failCheckout && args.includes('checkout') && args.at(-1) === 'main') { failCheckout = false; throw new Error('interrupted'); }
    return f.run(root, args);
  };
  await assert.rejects(workflow.finishPrepared(await workflow.prepareFinish(f.root, {...f.options,run}), {...f.options, run}), /checkout may have started/);
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), candidate);
  const result = await workflow.finishPrepared(await workflow.prepareFinish(f.root, {...f.options,run}), {...f.options, run});
  assert.equal(result.head, candidate); assert.equal(result.featureHead, feature);
  assert.equal(await core.git(f.bare, ['rev-parse', 'refs/heads/main']), candidate);
});
test('newer feature commits survive guided recovery and divergent-update handoff', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score'); f.setFailure(true);
  await assert.rejects(finish(f));
  const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const changed = await commit(f.root, 'More.java', 'more'); f.setFailure(false);
  await assert.rejects(workflow.prepareFinish(f.root, f.options), error => error.pendingFinishDrift === true);
  const plan = await workflow.preparePendingFinishRecovery(f.root, f.options);
  const before = f.calls.filter(args => args[0] === 'push').length;
  const review = await workflow.recoverPendingFinish(plan, f.options);
  assert.equal(review.needsPush, true); assert.equal(review.candidate, candidate); assert.equal(review.page, 'https://github.com/student/workflow');
  assert.equal(f.calls.filter(args => args[0] === 'push').length, before);
  const result = await workflow.recoverPendingFinish(plan, {...f.options, allowPush:true});
  assert.equal(result.recovered, true); assert.equal(result.head, changed); assert.equal(result.finishedHead, candidate);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), changed);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), candidate);
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), changed);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), candidate);
});
test('guided recovery recognizes a successful unconfirmed push and keeps newer work', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score');
  let interrupt = true; f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupt) { interrupt = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f)); const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const changed = await commit(f.root, 'More.java', 'more');
  const pushes = f.calls.filter(args => args[0] === 'push').length;
  const result = await workflow.recoverPendingFinish(await workflow.preparePendingFinishRecovery(f.root, f.options), f.options);
  assert.equal(result.finishedHead, candidate); assert.equal(result.head, changed);
  assert.equal(f.calls.filter(args => args[0] === 'push').length, pushes);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), changed);
});
test('guided recovery leaves divergent remote for sync, preserving newer work', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score'); f.setFailure(true); await assert.rejects(finish(f));
  const changed = await commit(f.root, 'More.java', 'more'); f.setFailure(false); await remoteChange(f, 'Remote.java', 'remote');
  const result = await workflow.recoverPendingFinish(await workflow.preparePendingFinishRecovery(f.root, f.options), f.options);
  assert.equal(result.needsSync, true); assert.equal(result.recovered, false);
  const refs = await core.git(f.root, ['show-ref']);
  await assert.rejects(sync(f), /different commits.*cannot update/);
  assert.equal(await core.git(f.root, ['rev-parse', 'HEAD']), changed);
  assert.equal(await core.git(f.root, ['show-ref']), refs);
});
test('guided recovery retries after local main was advanced but pending cleanup was interrupted', async t => {
  const f = await fixture(t); await start(f); await commit(f.root, 'Score.java', 'score');
  let interrupted = true; f.setHook(async (_, args) => { if (args[0] === 'ls-remote' && f.calls.some(call=>call[0]==='push') && interrupted) { interrupted = false; throw new Error('interrupted'); } });
  await assert.rejects(finish(f)); const candidate = await core.git(f.root, ['rev-parse', 'refs/zero/pending-finish']);
  const changed = await commit(f.root, 'More.java', 'more');
  let fail = true;
  const run = async (root, args) => {
    if (fail && args[0] === 'update-ref' && args.includes('-d') && args.includes('refs/zero/pending-finish')) { fail = false; throw new Error('interrupted'); }
    return f.run(root, args);
  };
  await assert.rejects(workflow.recoverPendingFinish(await workflow.preparePendingFinishRecovery(f.root, {run}), {...f.options, run}), /clear the confirmed pending change/);
  assert.equal(await core.git(f.root, ['rev-parse', 'refs/heads/main']), candidate);
  const result = await workflow.recoverPendingFinish(await workflow.preparePendingFinishRecovery(f.root, {run}), {...f.options, run});
  assert.equal(result.recovered, true); assert.equal(result.head, changed); assert.equal(result.finishedHead, candidate);
});

test('switch carries compatible uncommitted edits without creating a checkpoint',async t=>{
 const f=await fixture(t);await core.git(f.root,['branch','feature']);await write(f.root,'Main.java','class Main { int score; }\n');await write(f.root,'new.wav','sound');
 const before=await core.git(f.root,['rev-parse','HEAD']);const plan=await workflow.prepareSwitch(f.root,'feature',f.options);
 const result=await workflow.switchPrepared(plan,f.options);assert.equal(result.branch,'feature');assert.equal(result.head,before);
 assert.match(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),/score/);assert.equal(await fs.readFile(path.join(f.root,'new.wav'),'utf8'),'sound');
 assert.equal(f.calls.length,0,'Switch does not contact a remote');
});
test('switch refuses conflicting changes and keeps original branch and bytes',async t=>{
 const f=await fixture(t);await core.git(f.root,['checkout','-b','feature']);await commit(f.root,'Main.java','feature\n');await core.git(f.root,['checkout','main']);await write(f.root,'Main.java','local uncommitted\n');
 const plan=await workflow.prepareSwitch(f.root,'feature',f.options);await assert.rejects(workflow.switchPrepared(plan,f.options),/cannot be moved safely/);
 assert.equal(await core.git(f.root,['symbolic-ref','--short','HEAD']),'main');assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'local uncommitted\n');
});
test('switch rechecks editor state after all Git inspection and before checkout',async t=>{
 const f=await fixture(t);await core.git(f.root,['branch','feature']);
 const plan=await workflow.prepareSwitch(f.root,'feature',f.options);let guards=0;
 await assert.rejects(workflow.switchPrepared(plan,{...f.options,beforeMutation:async()=>{if(++guards===2)throw Error('Editor changed');}}),/Editor changed/);
 assert.equal(guards,2);assert.equal(await core.git(f.root,['symbolic-ref','--short','HEAD']),'main');
});
test('switch rejects edits introduced after preparing a clean project',async t=>{
 const f=await fixture(t);await core.git(f.root,['branch','feature']);
 const plan=await workflow.prepareSwitch(f.root,'feature',f.options);
 assert.equal(plan.status,'');
 let guards=0;
 await assert.rejects(workflow.switchPrepared(plan,{...f.options,beforeMutation:async()=>{
   if(++guards===2)await write(f.root,'Main.java','new local edit\n');
 }}),/changed after review/);
 assert.equal(await core.git(f.root,['symbolic-ref','--short','HEAD']),'main');
 assert.equal(await fs.readFile(path.join(f.root,'Main.java'),'utf8'),'new local edit\n');
});
test('switch rejects file or target-ref drift after review',async t=>{
 const f=await fixture(t);await core.git(f.root,['branch','feature']);await write(f.root,'Main.java','first\n');let plan=await workflow.prepareSwitch(f.root,'feature',f.options);
 await write(f.root,'Main.java','different\n');await assert.rejects(workflow.switchPrepared(plan,f.options),/changed after review/);
 plan=await workflow.prepareSwitch(f.root,'feature',f.options);
 // Move the destination to a valid new commit while preserving the worktree.
 const tree=await core.git(f.root,['rev-parse','HEAD^{tree}']);const old=await core.git(f.root,['rev-parse','refs/heads/feature']);const target=await core.git(f.root,['commit-tree',tree,'-p',old,'-m','other']);await core.git(f.root,['merge-base','--is-ancestor',old,target]);await core.git(f.root,['update-ref','refs/heads/feature',target,old]);
 await assert.rejects(workflow.switchPrepared(plan,f.options),/changed after review/);assert.equal(await core.git(f.root,['symbolic-ref','--short','HEAD']),'main');
});
test('switch refuses a target that would replace ignored work',async t=>{
 const f=await fixture(t);await core.git(f.root,['checkout','-b','feature']);await write(f.root,'secret.txt','tracked elsewhere');await core.git(f.root,['add','-f','secret.txt']);await core.git(f.root,['commit','-m','Target']);await core.git(f.root,['checkout','main']);await write(f.root,'secret.txt','private local');
 const plan=await workflow.prepareSwitch(f.root,'feature',f.options);await assert.rejects(workflow.switchPrepared(plan,f.options),/ignored file/);
 assert.equal(await fs.readFile(path.join(f.root,'secret.txt'),'utf8'),'private local');assert.equal(await core.git(f.root,['symbolic-ref','--short','HEAD']),'main');
});
test('switch refuses custom checkout filters before execution',async t=>{
 const f=await fixture(t);await core.git(f.root,['config','filter.evil.smudge','false']);await core.git(f.root,['checkout','-b','feature']);await write(f.root,'.gitattributes','*.txt filter=evil\n');await core.git(f.root,['add','.gitattributes']);await core.git(f.root,['commit','-m','Attributes']);await core.git(f.root,['checkout','main']);
 await assert.rejects(workflow.prepareSwitch(f.root,'feature',f.options),/attributes/);assert.equal(await core.git(f.root,['symbolic-ref','--short','HEAD']),'main');
});
test('switch checks for filters introduced during metadata reads before running status',async t=>{
 const f=await fixture(t);
 await core.git(f.root,['branch','feature']);
 await core.git(f.root,['config','filter.evil.clean','false']);
 let originReviewed=false,statusReads=0;
 const run=async(cwd,args,options)=>{
   if(args.includes('status')){statusReads++;throw Error('Status would run with unchecked attributes');}
   if(args.at(-1)==='^filter\\.')assert.ok(originReviewed,'Filter inspection follows the metadata reads');
   const result=await f.run(cwd,args,options);
   if(args[0]==='remote'&&args.includes('--push')){
     await write(f.root,'.gitattributes','Main.java filter=evil\n');
     originReviewed=true;
   }
   return result;
 };
 await assert.rejects(workflow.prepareSwitch(f.root,'feature',{run}),/Custom Git attributes/);
 assert.equal(statusReads,0);
});
test('local branch switch works in a tutorial after origin is removed',async t=>{
 const f=await fixture(t);await write(f.root,'zero.json',JSON.stringify({tutorialProjectId:'greeting',lessonId:'0',repositoryRequired:true}));await core.git(f.root,['add','zero.json']);await core.git(f.root,['commit','-m','Tutorial']);await core.git(f.root,['branch','feature']);await core.git(f.root,['remote','remove','origin']);
 const plan=await workflow.prepareSwitch(f.root,'feature',f.options);assert.equal((await workflow.switchPrepared(plan,f.options)).branch,'feature');assert.equal(f.calls.length,0);
});
test('new branch can be created locally after tutorial origin is removed',async t=>{
 const f=await fixture(t);await write(f.root,'zero.json',JSON.stringify({tutorialProjectId:'greeting',lessonId:'0',repositoryRequired:true}));await core.git(f.root,['add','zero.json']);await core.git(f.root,['commit','-m','Tutorial']);await core.git(f.root,['remote','remove','origin']);
 const plan=await workflow.prepareStart(f.root,'offline-work',f.options);assert.equal(plan.remote,null);
 assert.equal((await workflow.startPrepared(plan,f.options)).branch,'offline-work');assert.equal(f.calls.length,0);
});
for(const archived of [false,true])test(`Sync preserves confirmed merge evidence when newer feature work diverges (${archived?'archived':'pending'})`,async t=>{
 const f=await fixture(t);await start(f);await commit(f.root,'Score.java','score');let interrupt=true;
 f.setHook(async(_,args)=>{if(args[0]==='ls-remote'&&f.calls.some(call=>call[0]==='push')&&interrupt){interrupt=false;throw Error('confirmation interrupted');}});
 await assert.rejects(finish(f));const candidate=await core.git(f.root,['rev-parse','refs/zero/pending-finish']);
 if(archived){await core.git(f.root,['update-ref',`refs/zero/retired-finish/${candidate}`,candidate,'0'.repeat(candidate.length)]);await core.git(f.root,['update-ref','-d','refs/zero/pending-finish',candidate]);}
 const newer=await commit(f.root,'More.java','newer work'),pushes=f.calls.filter(args=>args[0]==='push').length;
 const before=await core.git(f.root,['show-ref']);
 await assert.rejects(sync(f),/different commits.*cannot update/);
 assert.equal(await core.git(f.root,['rev-parse','HEAD']),newer);assert.equal(await core.git(f.root,['show-ref']),before);
 assert.equal(f.calls.filter(args=>args[0]==='push').length,pushes);
});
