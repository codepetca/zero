'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../src/core');
const {prepareUpload, uploadPrepared} = require('../src/github');
async function project(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-upload-')));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await core.git(root, ['init', '-b', 'main']);
  await core.git(root, ['config', '--local', 'user.name', 'Zero Test']);
  await core.git(root, ['config', '--local', 'user.email', 'zero-test@example.invalid']);
  await core.git(root, ['remote', 'add', 'origin', 'https://github.com/student/test.git']);
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.writeFile(path.join(root, '.gitignore'), 'secret.txt\nbuild/\n');
  await fs.writeFile(path.join(root, 'secret.txt'), 'DO NOT UPLOAD');
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main {}\n');
  return root;
}
function transport(options = {}) {
  const calls = [];
  let pushedHead;
  const run = async (root, args) => {
    calls.push(args);
    // Every transport operation is intercepted; the real Git helper only sees local commands.
    if (['push', 'fetch', 'ls-remote', 'pull', 'clone'].includes(args[0])) {
      if (args[0] === 'push') {
        pushedHead = args[2].split(':')[0];
        if (options.onPush) await options.onPush(root, args);
        if (options.failure) throw Object.assign(new Error('private token'), {stderr: options.failure});
        return '';
      }
      if (args[0] === 'ls-remote') return `${options.wrongHead ? '0'.repeat(40) : pushedHead}\trefs/heads/main`;
      throw new Error('Unexpected transport command');
    }
    return core.git(root, args);
  };
  return {run, calls};
}
test('reviewed first upload commits project paths, preserves ignored files, and confirms mocked remote', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  assert.equal(plan.head, null); assert.equal(plan.page, 'https://github.com/student/test');
  assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.changes));
  assert.ok(!plan.changes.some(change => change.path === 'secret.txt'));
  const result = await uploadPrepared(plan, 'Start my app', {run: mock.run});
  assert.equal(result.uploaded, true); assert.equal(result.committed, true);
  assert.equal(await fs.readFile(path.join(root, 'secret.txt'), 'utf8'), 'DO NOT UPLOAD');
  assert.doesNotMatch(await core.git(root, ['ls-files']), /secret/);
  assert.deepEqual(mock.calls.find(args => args[0] === 'push'), ['push', plan.remote, `${result.head}:refs/heads/main`]);
  assert.equal(mock.calls.filter(args => args[0] === 'ls-remote').length, 1);
  const clean = await prepareUpload(root, mock.run);
  assert.equal((await uploadPrepared(clean, 'Save', {run: mock.run})).committed, false);
});
test('review detects edited source even when porcelain status is unchanged', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  await fs.writeFile(path.join(root, 'Main.java'), 'class Main { int score; }\n');
  await assert.rejects(uploadPrepared(plan, 'Save', {run: mock.run}), /changed after review/);
  assert.ok(!mock.calls.some(args => args[0] === 'push' || args[0] === 'commit' || args.includes('add')));
});
async function binaryProject(t) {
  const root = await project(t);
  await fs.mkdir(path.join(root, 'assets'));
  const filename = path.join(root, 'assets', 'picture.bin');
  // Incompressible replacements make Git's binary patch exceed its 1 MiB
  // command-output limit, even though only one reviewed path has changed.
  await fs.writeFile(filename, crypto.randomBytes(1100000));
  await core.git(root, ['add', '-A']);
  await core.git(root, ['commit', '-m', 'Baseline asset']);
  await fs.writeFile(filename, crypto.randomBytes(1100000));
  return {root, filename};
}
test('tracked binary replacement larger than 1 MiB can be reviewed, committed and uploaded through mocked transport', async t => {
  const {root, filename} = await binaryProject(t); const mock = transport();
  const expectedBlob = await core.git(root, ['hash-object', '--', filename]);
  const plan = await prepareUpload(root, mock.run);
  assert.deepEqual(plan.changes, [{path: 'assets/picture.bin', kind: 'M'}]);
  const result = await uploadPrepared(plan, 'Replace picture', {run: mock.run});
  assert.equal(result.uploaded, true); assert.equal(result.committed, true);
  assert.equal(await core.git(root, ['rev-parse', `${result.head}:assets/picture.bin`]), expectedBlob);
  assert.equal(await core.git(root, ['status', '--porcelain=v1']), '');
  assert.deepEqual(mock.calls.find(args => args[0] === 'push'), ['push', plan.remote, `${result.head}:refs/heads/main`]);
  assert.deepEqual(mock.calls.find(args => args[0] === 'ls-remote'), ['ls-remote', '--heads', plan.remote, 'refs/heads/main']);
  assert.ok(!mock.calls.some(args => args.includes('--binary')));
});
test('large binary review rejects working bytes, index-only content and mode drift with unchanged status', async t => {
  for (const drift of ['working bytes', 'index only', 'working mode', 'index mode']) await t.test(drift, async t => {
    if (drift === 'working mode' && process.platform === 'win32') { t.skip('Windows does not expose Unix executable file modes.'); return; }
    const {root, filename} = await binaryProject(t); const mock = transport();
    await core.git(root, ['config', '--local', 'core.filemode', 'true']);
    await core.git(root, ['add', '--', 'assets/picture.bin']);
    const workingBytes = crypto.randomBytes(1100000);
    await fs.writeFile(filename, workingBytes);
    const plan = await prepareUpload(root, mock.run);
    assert.deepEqual(plan.changes, [{path: 'assets/picture.bin', kind: 'MM'}]);
    if (drift === 'working bytes') await fs.writeFile(filename, crypto.randomBytes(1100000));
    if (drift === 'index only') {
      await fs.writeFile(filename, crypto.randomBytes(1100000));
      await core.git(root, ['add', '--', 'assets/picture.bin']);
      await fs.writeFile(filename, workingBytes);
    }
    if (drift === 'working mode') await fs.chmod(filename, 0o755);
    if (drift === 'index mode') await core.git(root, ['update-index', '--chmod=+x', '--', 'assets/picture.bin']);
    assert.equal(await core.git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']), plan.status);
    const changed = await prepareUpload(root, mock.run);
    assert.notEqual(changed.fingerprint, plan.fingerprint);
    if (drift.startsWith('index')) assert.equal(changed.contentFingerprint, plan.contentFingerprint);
    mock.calls.length = 0;
    await assert.rejects(uploadPrepared(plan, 'Replace picture', {run: mock.run}), /changed after review/);
    assert.ok(!mock.calls.some(args => args.includes('add') || ['commit', 'push', 'ls-remote'].includes(args[0])));
  });
});
test('remote, branch, operation, detached HEAD, nested repository and ignored staging are refused', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  await core.git(root, ['remote', 'set-url', 'origin', 'https://github.com/other/test.git']);
  await assert.rejects(uploadPrepared(plan, 'Save', {run: mock.run}), /changed after review/);
  await core.git(root, ['config', '--local', 'remote.origin.pushurl', 'https://github.com/foreign/test.git']);
  await assert.rejects(prepareUpload(root, mock.run), /different repository/);
  await core.git(root, ['config', '--local', '--unset', 'remote.origin.pushurl']);
  await fs.writeFile(path.join(root, '.git', 'MERGE_HEAD'), 'pending');
  await assert.rejects(prepareUpload(root, mock.run), /current Git merge/);
  await fs.rm(path.join(root, '.git', 'MERGE_HEAD'));
  const nested = path.join(root, 'nested'); await fs.mkdir(nested);
  await core.git(nested, ['init']); await fs.writeFile(path.join(nested, 'child.txt'), 'child');
  await assert.rejects(prepareUpload(root, mock.run), /Nested repositories/);
  await fs.rm(nested, {recursive:true});
  await core.git(root, ['add', '-f', 'secret.txt']);
  await assert.rejects(prepareUpload(root, mock.run), /Ignored files/);
  await core.git(root, ['rm', '--cached', 'secret.txt']);
  await uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run});
  await core.git(root, ['checkout', '--detach']);
  await assert.rejects(prepareUpload(root, mock.run), /detached HEAD/);
});
test('wrong project root is refused before mutations', async t => {
  const root = await project(t); const child = path.join(root, 'child'); await fs.mkdir(child); await fs.writeFile(path.join(child, 'zero.json'), '{}');
  const mock = transport();
  await assert.rejects(prepareUpload(child, mock.run), /different Git repository/);
  assert.deepEqual(mock.calls, [['rev-parse', '--show-toplevel']]);
});
test('failed push or mismatched confirmation never reports success and masks private stderr', async t => {
  for (const failure of ['rejected non-fast-forward token=PRIVATE', 'Authentication failed token=PRIVATE', 'Permission denied token=PRIVATE']) {
    const root = await project(t); const mock = transport({failure});
    await assert.rejects(uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run}), error => {
      assert.doesNotMatch(error.message, /PRIVATE/); return /changes|authentication|refused/.test(error.message);
    });
    assert.ok(!mock.calls.some(args => args[0] === 'ls-remote'));
    assert.ok(await core.git(root, ['rev-parse', 'HEAD']));
  }
  const root = await project(t); const mock = transport({wrongHead: true});
  await assert.rejects(uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run}), /did not confirm/);
});
test('renames, deletions and filenames with pathspec syntax are staged literally', async t => {
  const root = await project(t); const mock = transport();
  await uploadPrepared(await prepareUpload(root, mock.run), 'Start', {run: mock.run});
  await core.git(root, ['mv', 'Main.java', 'Renamed.java']);
  await fs.rm(path.join(root, 'zero.json'));
  // Keep the required marker; delete another tracked file instead.
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.rm(path.join(root, '.gitignore'));
  await fs.rm(path.join(root, 'secret.txt'));
  await fs.writeFile(path.join(root, ':literal.java'), 'class Literal {}');
  const result = await uploadPrepared(await prepareUpload(root, mock.run), 'Rename and tidy', {run: mock.run});
  assert.equal(result.uploaded, true);
  assert.match(await core.git(root, ['ls-files']), /:literal.java/);
  assert.doesNotMatch(await core.git(root, ['ls-files']), /Main.java|\.gitignore/);
});
test('branch drift and multiple push destinations require a new review', async t => {
  const root = await project(t); const mock = transport();
  const plan = await prepareUpload(root, mock.run);
  await core.git(root, ['symbolic-ref', 'HEAD', 'refs/heads/other']);
  await assert.rejects(uploadPrepared(plan, 'Start', {run: mock.run}), /changed after review/);
  await core.git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  await core.git(root, ['config', '--local', '--add', 'remote.origin.pushurl', 'https://github.com/student/test.git']);
  await core.git(root, ['config', '--local', '--add', 'remote.origin.pushurl', 'https://github.com/student/second.git']);
  await assert.rejects(prepareUpload(root, mock.run), /multiple destinations/);
  assert.ok(!mock.calls.some(args => args[0] === 'push'));
});
test('commit identity failure is actionable and stops before transport', async t => {
  const root = await project(t); const mock = transport();
  const run = async (cwd, args) => {
    if (args[0] === 'commit') throw Object.assign(new Error('private'), {stderr: 'Author identity unknown private=SECRET'});
    return mock.run(cwd, args);
  };
  await assert.rejects(uploadPrepared(await prepareUpload(root, run), 'Start', {run}), error => {
    assert.match(error.message, /name and email/); assert.doesNotMatch(error.message, /SECRET/); return true;
  });
  assert.ok(!mock.calls.some(args => ['push', 'ls-remote'].includes(args[0])));
});
test('leading-space filenames remain exact and editing one after review stops before staging', async t => {
  const root = await project(t); const mock = transport();
  await fs.writeFile(path.join(root, ' leading.java'), 'class Leading {}\n');
  const plan = await prepareUpload(root, mock.run);
  assert.ok(plan.changes.some(change => change.path === ' leading.java'));
  await fs.writeFile(path.join(root, ' leading.java'), 'class Leading { int score; }\n');
  await assert.rejects(uploadPrepared(plan, 'Save', {run: mock.run}), /changed after review/);
  assert.ok(!mock.calls.some(args => args.includes('add') || args[0] === 'commit' || args[0] === 'push'));
  const reviewed = await prepareUpload(root, mock.run);
  const result = await uploadPrepared(reviewed, 'Save leading filename', {run: mock.run});
  assert.equal(result.uploaded, true);
  assert.ok((await core.git(root, ['ls-files', '-z'])).split('\0').includes(' leading.java'));
});
test('HEAD changed at dispatch cannot replace the captured reviewed commit', async t => {
  const root = await project(t);
  let dispatchedHead;
  const mock = transport({onPush: async (cwd, args) => {
    dispatchedHead = args[2].split(':')[0];
    await core.git(cwd, ['commit', '--allow-empty', '-m', 'Concurrent local commit']);
    assert.notEqual(await core.git(cwd, ['rev-parse', 'HEAD']), dispatchedHead);
  }});
  const plan = await prepareUpload(root, mock.run);
  const result = await uploadPrepared(plan, 'Save reviewed project', {run: mock.run});
  assert.equal(result.uploaded, true); assert.equal(result.localChanged, true); assert.equal(result.head, dispatchedHead);
  assert.deepEqual(mock.calls.find(args => args[0] === 'push'), ['push', plan.remote, `${dispatchedHead}:refs/heads/main`]);
  assert.deepEqual(mock.calls.find(args => args[0] === 'ls-remote'), ['ls-remote', '--heads', plan.remote, 'refs/heads/main']);
});
test('origin changed at dispatch cannot replace the captured reviewed destination', async t => {
  const root = await project(t);
  const mock = transport({onPush: async cwd => {
    await core.git(cwd, ['remote', 'set-url', 'origin', 'https://github.com/foreign/other.git']);
  }});
  const plan = await prepareUpload(root, mock.run);
  const result = await uploadPrepared(plan, 'Save reviewed project', {run: mock.run});
  assert.equal(result.uploaded, true); assert.equal(result.localChanged, true); assert.equal(result.page, plan.page);
  assert.equal(mock.calls.find(args => args[0] === 'push')[1], plan.remote);
  assert.equal(mock.calls.find(args => args[0] === 'ls-remote')[2], plan.remote);
});
test('configured fetch or push URL rewrites are refused before staging and transport', async t => {
  for (const rule of ['insteadOf', 'pushInsteadOf']) {
    const root = await project(t); const mock = transport();
    await core.git(root, ['config', '--local', `url.https://github.com/foreign/.${rule}`, 'https://github.com/student/']);
    await assert.rejects(prepareUpload(root, mock.run), /URL rewriting is configured/);
    assert.ok(!mock.calls.some(args => args.includes('add') || ['commit', 'push', 'ls-remote'].includes(args[0])));
  }
});

test('reviewed local commit completes without any network or sign-in', async t => {
  const root=await project(t),mock=transport();
  const plan=await prepareUpload(root,mock.run);
  const result=await uploadPrepared(plan,'Start offline',{run:mock.run,localOnly:true,networkRun:()=>{throw new Error('unexpected network');}});
  assert.equal(result.committed,true);assert.equal(result.uploaded,false);
  assert.equal(await core.git(root,['log','-1','--format=%s']),'Start offline');
  assert.ok(!mock.calls.some(args=>['push','fetch','ls-remote','pull','clone'].includes(args[0])));
  assert.equal(await fs.readFile(path.join(root,'secret.txt'),'utf8'),'DO NOT UPLOAD');
  const clean=await prepareUpload(root,mock.run);
  await assert.rejects(uploadPrepared(clean,'No changes',{run:mock.run,localOnly:true}),/no changes/i);
});

test('local commit preserves changed files when review becomes stale',async t=>{
  const root=await project(t),mock=transport(),plan=await prepareUpload(root,mock.run);
  await fs.writeFile(path.join(root,'Main.java'),'changed after review');
  await assert.rejects(uploadPrepared(plan,'Save',{run:mock.run,localOnly:true}),/changed after review/);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'changed after review');
  assert.ok(!mock.calls.some(args=>args[0]==='commit'));
});

test('local commit remains available after origin is removed, but cannot upload that plan',async t=>{
 const root=await project(t),mock=transport();await core.git(root,['remote','remove','origin']);
 const plan=await require('../src/github').prepareLocalCommit(root,mock.run);
 assert.equal(plan.remote,null);
 await assert.rejects(uploadPrepared(plan,'Save',{run:mock.run}),/destination/);
 const result=await uploadPrepared(plan,'Save locally',{run:mock.run,localOnly:true});
 assert.equal(result.committed,true);assert.equal(result.uploaded,false);
 assert.ok(!mock.calls.some(args=>['push','fetch','ls-remote'].includes(args[0])));
});

test('local commit recovery identifies the saved head when files change immediately after committing',async t=>{
 const root=await project(t);await core.git(root,['remote','remove','origin']);
 const run=async(cwd,args)=>{const result=await core.git(cwd,args);if(args[0]==='commit')await fs.writeFile(path.join(root,'Main.java'),'newer work');return result;};
 const plan=await require('../src/github').prepareLocalCommit(root,run);
 let recovery;await assert.rejects(uploadPrepared(plan,'Save locally',{run,localOnly:true}),error=>{
   assert.match(error.message,/commit was saved locally/);
   recovery=error.localCommitRecovery;return true;
 });
 assert.deepEqual(recovery,{root,branch:'main',head:await core.git(root,['rev-parse','HEAD'])});
 assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'newer work');
 assert.match(await core.git(root,['status','--porcelain']),/Main.java/);
});

test('syncing a new branch uploads its saved head without staging dirty files',async t=>{
 const root=await project(t);await core.git(root,['add','zero.json','Main.java','.gitignore']);await core.git(root,['commit','-m','Initial']);await core.git(root,['checkout','-b','feature']);
 const head=await core.git(root,['rev-parse','HEAD']);await fs.writeFile(path.join(root,'Main.java'),'unfinished');await fs.writeFile(path.join(root,'new.wav'),'asset');
 const plan=await prepareUpload(root);let pushed;const calls=[];
 const networkRun=async(_root,args)=>{calls.push(args);if(args[0]==='push'){pushed=args[2].split(':')[0];return '';}if(args[0]==='ls-remote')return `${pushed}\trefs/heads/feature`;throw Error('Unexpected network');};
 const result=await require('../src/github').syncExistingHead(plan,{networkRun});
 assert.equal(result.head,head);assert.equal(result.committed,false);assert.equal(await core.git(root,['rev-parse','HEAD']),head);
 assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'unfinished');assert.match(await core.git(root,['status','--porcelain']),/Main.java/);assert.match(await core.git(root,['status','--porcelain']),/new.wav/);
 assert.deepEqual(calls.map(args=>args[0]),['push','ls-remote']);
});

test('branch-head sync refuses drift before transmission and records unconfirmed failures',async t=>{
 const root=await project(t);await core.git(root,['add','zero.json','Main.java','.gitignore']);await core.git(root,['commit','-m','Initial']);await core.git(root,['checkout','-b','feature']);
 await fs.writeFile(path.join(root,'Main.java'),'first');let plan=await prepareUpload(root);await fs.writeFile(path.join(root,'Main.java'),'changed');let calls=0;
 await assert.rejects(require('../src/github').syncExistingHead(plan,{networkRun:async()=>{calls++;return '';}}),/changed after review/);assert.equal(calls,0);
 plan=await prepareUpload(root);await assert.rejects(require('../src/github').syncExistingHead(plan,{networkRun:async(_root,args)=>{if(args[0]==='push')return '';throw Error('offline');}}),error=>{assert.equal(error.uploadRecovery.pushStarted,true);assert.equal(error.uploadRecovery.kind,'unconfirmed');assert.equal(error.uploadRecovery.branch,'feature');return true;});
 assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'changed');
});

test('unverified successful local commits are reported without inventing a sync head',async t=>{
 for(const stage of ['head','tree','lineage'])await t.test(stage,async t=>{
  const root=await project(t);let committed=false,networkCalls=0;
  const run=async(cwd,args)=>{
   if(args.some(arg=>arg==='reset'||arg==='--reset'))throw Error('Forbidden Git command');
   if(['push','fetch','ls-remote','pull','clone'].includes(args[0])){networkCalls++;throw Error('Unexpected network');}
   if(committed&&stage==='head'&&args[0]==='rev-parse'&&args[2]==='HEAD^{commit}')throw Error('injected verification failure');
   const value=await core.git(cwd,args);
   if(args[0]==='commit')committed=true;
   if(committed&&stage==='tree'&&args[0]==='rev-parse'&&args[1]?.endsWith('^{tree}'))return '0'.repeat(40);
   if(committed&&stage==='lineage'&&args[0]==='rev-list')return `${value} ${'0'.repeat(40)}`;
   return value;
  };
  const plan=await require('../src/github').prepareLocalCommit(root,run);
  await assert.rejects(uploadPrepared(plan,'Save',{run,localOnly:true,networkRun:async()=>{networkCalls++;throw Error('Unexpected network');}}),error=>{
   assert.match(error.message,/commit was saved locally.*could not verify/i);
   assert.deepEqual(error.localCommitUncertain,{root,branch:'main'});
   assert.equal(error.localCommitRecovery,undefined);assert.equal(error.uploadRecovery,undefined);return true;
  });
  assert.equal(networkCalls,0);assert.equal(await core.git(root,['log','-1','--format=%s']),'Save');
 });
});

test('local commit rechecks the workspace before staging and before committing',async t=>{
 for(const failAt of [2,3])await t.test(`guard ${failAt}`,async t=>{
  const root=await project(t),calls=[];let guards=0,networkCalls=0;
  const run=async(cwd,args)=>{
   if(args.some(arg=>arg==='reset'||arg==='--reset'))throw Error('Forbidden Git command');
   if(['push','fetch','ls-remote','pull','clone'].includes(args[0])){networkCalls++;throw Error('Unexpected network');}
   calls.push(args);return core.git(cwd,args);
  };
  const plan=await require('../src/github').prepareLocalCommit(root,run);
  await assert.rejects(uploadPrepared(plan,'Save',{run,localOnly:true,beforeUpload:async()=>{if(++guards===failAt)throw Error('Trust revoked');},networkRun:async()=>{networkCalls++;throw Error('Unexpected network');}}),error=>{
   assert.match(error.message,failAt===3?/No commit was made.*remain staged/:/Trust revoked/);return true;
  });
  assert.equal(networkCalls,0);assert.ok(!calls.some(args=>args[0]==='commit'));
  const index=await core.git(root,['ls-files','--cached']);
  if(failAt===2)assert.equal(index,'');else assert.match(index,/Main\.java/);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'class Main {}\n');
 });
});

test('a failed post-staging inspection reports the retained index without committing',async t=>{
 const root=await project(t);let staged=false,networkCalls=0;
 const run=async(cwd,args)=>{
  if(args.some(arg=>arg==='reset'||arg==='--reset'))throw Error('Forbidden Git command');
  if(['push','fetch','ls-remote','pull','clone'].includes(args[0])){networkCalls++;throw Error('Unexpected network');}
  if(staged&&args[0]==='status')throw Error('injected inspection failure');
  const value=await core.git(cwd,args);if(args.includes('add'))staged=true;return value;
 };
 const plan=await require('../src/github').prepareLocalCommit(root,run);
 await assert.rejects(uploadPrepared(plan,'Save',{run,localOnly:true,networkRun:async()=>{networkCalls++;throw Error('Unexpected network');}}),/No commit was made.*remain staged/);
 assert.match(await core.git(root,['ls-files','--cached']),/Main\.java/);assert.equal(networkCalls,0);
 await assert.rejects(core.git(root,['rev-parse','--verify','HEAD']));
});

async function linkedProject(t) {
 const main=await project(t);await core.git(main,['add','zero.json','Main.java','.gitignore']);await core.git(main,['commit','-m','Initial']);
 const container=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-linked-commit-')));t.after(()=>fs.rm(container,{recursive:true,force:true}));
 const root=path.join(container,'student');await core.git(main,['worktree','add','-b','student',root]);
 return {main,root};
}
test('linked-worktree local Commit preserves the other branch and records common provenance with compatibility reminders',async t=>{
 const {main,root}=await linkedProject(t),github=require('../src/github'),provenance=require('../src/commit-provenance');
 const before=await core.git(main,['rev-parse','HEAD']);await core.git(main,['remote','remove','origin']);
 await fs.writeFile(path.join(root,'Main.java'),'class Main { int studentWork; }\n');await fs.writeFile(path.join(root,'secret.txt'),'private ignored');
 const calls=[],run=async(cwd,args)=>{assert.ok(!args.some(value=>value==='reset'||value==='--reset'));assert.ok(!['push','fetch','pull','clone','ls-remote'].includes(args[0]));calls.push(args);return core.git(cwd,args);};
 const plan=await github.prepareLocalCommit(root,run);assert.equal(plan.remote,null);assert.equal(plan.branch,'student');
 const result=await provenance.withCommit(root,async()=>({parent:plan.head,result:await uploadPrepared(plan,'Save student work',{run,localOnly:true})}));
 assert.equal(result.committed,true);assert.equal(result.uploaded,false);assert.equal(await core.git(root,['status','--porcelain']),'');
 assert.equal(await core.git(main,['rev-parse','HEAD']),before);assert.equal(await fs.readFile(path.join(main,'Main.java'),'utf8'),'class Main {}\n');
 assert.equal(await fs.readFile(path.join(root,'secret.txt'),'utf8'),'private ignored');assert.doesNotMatch(await core.git(root,['ls-files']),/secret/);
 if(process.platform!=='win32') {
  const receipt=JSON.parse(await fs.readFile(path.join(main,'.git','zero-commit-provenance.json'),'utf8'));assert.equal(receipt.root,root);assert.equal(receipt.head,result.head);assert.equal(receipt.parent,before);
 }
 const rows=new Map(),state={keys:()=>[...rows.keys()],get:key=>rows.get(key),update:async(key,value)=>{if(value===undefined)rows.delete(key);else rows.set(key,structuredClone(value));}};
 const storage=require('../src/repository-reminder-storage').createRepositoryReminderStorage({state});
 assert.equal(await storage.supportsFileLedger(root),false);
 const reminder=await storage.add(root,{root,branch:'student',head:result.head,remote:'',type:'local'});assert.equal((await storage.list(root))[0].id,reminder.id);
 await assert.rejects(storage.withProvenance(root,{},()=>{}),/compatibility reminder storage/);
 assert.ok(calls.some(args=>args[0]==='commit'));
});

test('linked Commit refuses replaced marker, backlink and private directory before staging',async t=>{
 for(const changed of ['marker','backlink','directory'])await t.test(changed,{skip:changed==='directory'?'Directory substitution reproduction is excluded':false},async t=>{
  const {main,root}=await linkedProject(t),github=require('../src/github');await fs.writeFile(path.join(root,'Main.java'),'student work');
  const calls=[],run=async(cwd,args)=>{calls.push(args);return core.git(cwd,args);},plan=await github.prepareLocalCommit(root,run),layout=await core.inspectGitLayout(root),head=await core.git(root,['rev-parse','HEAD']);
  if(changed==='directory'){await fs.rename(layout.gitDir,layout.gitDir+'-held');await fs.symlink(layout.gitDir+'-held',layout.gitDir);}
  else {const file=changed==='marker'?path.join(root,'.git'):path.join(layout.gitDir,'gitdir'),bytes=await fs.readFile(file);await fs.rename(file,file+'-held');await fs.writeFile(file,bytes);}
  calls.length=0;await assert.rejects(uploadPrepared(plan,'Save',{run,localOnly:true}),/metadata changed|changed after review/);
  assert.ok(!calls.some(args=>args.includes('add')||args[0]==='commit'));assert.equal(await core.git(root,['rev-parse','HEAD']),head);assert.equal(await core.git(main,['rev-parse','HEAD']),head);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'student work');
 });
});

test('linked Commit rechecks metadata after the final workspace guards',async t=>{
 for(const failAt of [2,3])await t.test(`guard ${failAt}`,async t=>{
  const {root}=await linkedProject(t),github=require('../src/github');await fs.writeFile(path.join(root,'Main.java'),'student work');
  const calls=[],run=async(cwd,args)=>{calls.push(args);return core.git(cwd,args);},plan=await github.prepareLocalCommit(root,run),marker=path.join(root,'.git');let guards=0;
  calls.length=0;await assert.rejects(uploadPrepared(plan,'Save',{run,localOnly:true,beforeUpload:async()=>{if(++guards===failAt){const bytes=await fs.readFile(marker);await fs.rename(marker,marker+'-held');await fs.writeFile(marker,bytes);}}}),/metadata changed|No commit was made/);
  assert.ok(!calls.some(args=>args[0]==='commit'));assert.equal(calls.some(args=>args.includes('add')),failAt===3);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'student work');
 });
});

test('linked Commit retains submodule and nested-repository safeguards',async t=>{
 for(const kind of ['gitlink','nested'])await t.test(kind,async t=>{
  const {root}=await linkedProject(t),head=await core.git(root,['rev-parse','HEAD']);
  if(kind==='gitlink')await core.git(root,['update-index','--add','--cacheinfo',`160000,${head},nested`]);
  else {const nested=path.join(root,'nested');await fs.mkdir(nested);await core.git(nested,['init']);await fs.writeFile(path.join(nested,'source.txt'),'nested work');}
  await assert.rejects(require('../src/github').prepareLocalCommit(root),/Nested repositories or submodules|Nested repositories are not supported/);
  assert.equal(await core.git(root,['rev-parse','HEAD']),head);
 });
});

test('local Commit rechecks staged tree, parent and branch after the final workspace guard',async t=>{
 for(const linked of [false,true])for(const drift of ['index','head','branch'])await t.test(`${linked?'linked':'ordinary'} ${drift}`,async t=>{
  const fixture=linked?await linkedProject(t):{root:await project(t)},root=fixture.root,github=require('../src/github');
  if(!linked){await core.git(root,['add','zero.json','Main.java','.gitignore']);await core.git(root,['commit','-m','Initial']);}
  await fs.writeFile(path.join(root,'Main.java'),'reviewed work');
  const plan=await github.prepareLocalCommit(root),head=await core.git(root,['rev-parse','HEAD']);let guards=0,commitCalls=0;
  const run=async(cwd,args)=>{if(args[0]==='commit')commitCalls++;return core.git(cwd,args);};
  await assert.rejects(uploadPrepared(plan,'Save reviewed work',{run,localOnly:true,beforeUpload:async()=>{
   if(++guards!==3)return;
   if(drift==='index'){await fs.writeFile(path.join(root,'unreviewed.txt'),'external work');await core.git(root,['add','unreviewed.txt']);}
   else if(drift==='head')await core.git(root,['-c',`core.hooksPath=${os.devNull}`,'commit','--allow-empty','-m','External commit']);
   else await core.git(root,['checkout','-b','external-branch']);
  }}),/No commit was made.*remain staged/);
  assert.equal(commitCalls,0);assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'reviewed work');
  if(drift!=='head')assert.equal(await core.git(root,['rev-parse','HEAD']),head);
  else assert.equal(await core.git(root,['log','-1','--format=%s']),'External commit');
  if(drift==='index')assert.match(await core.git(root,['ls-files','--cached']),/unreviewed\.txt/);
 });
});
