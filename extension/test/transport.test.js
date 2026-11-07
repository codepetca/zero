'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const {createTransport} = require('../src/transport');
const {prepareUpload,uploadPrepared} = require('../src/github');
const {withLocalMutation,withReadOnly} = require('../src/commit-provenance');
const {createAuthentication} = require('../src/authentication');
const remote='https://github.com/student/app.git';const sha='a'.repeat(40);const token='TEST_SECRET_DO_NOT_PRINT';
async function project(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-auth-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await core.git(root,['init','-b','main']);await core.git(root,['config','--local','user.name','Test']);await core.git(root,['config','--local','user.email','test@example.invalid']);
  await core.git(root,['remote','add','origin',remote]);await fs.writeFile(path.join(root,'zero.json'),'{}');return root;
}
const nativeSession = () => ({accessToken:token});
function settings(env) { return Array.from({length:Number(env.GIT_CONFIG_COUNT)},(_,i)=>[env[`GIT_CONFIG_KEY_${i}`],env[`GIT_CONFIG_VALUE_${i}`]]); }
test('only exact GitHub push/confirmation get a transient credential environment, cleaned after return', async t => {
  const root=await project(t);let spawnOptions;let hookPath;let calls=0;
  const environment={PATH:process.env.PATH,GIT_TRACE:'trace.log',GIT_TRACE_CURL:'curl.log',GIT_CURL_VERBOSE:'1',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'bad',GIT_CONFIG_VALUE_0:'bad',GIT_CONFIG_PARAMETERS:'bad',GIT_SSL_NO_VERIFY:'1'};
  const transport=createTransport(remote,async()=>nativeSession(),{assertCurrentNow:nativeSession,environment,spawn:async(command,args,options)=>{
    calls++;spawnOptions=options;assert.equal(command,'git');assert.ok(!args.join(' ').includes(token));
    assert.ok(!options.env.GIT_TRACE);assert.ok(!options.env.GIT_TRACE_CURL);assert.ok(!options.env.GIT_CURL_VERBOSE);assert.ok(!options.env.GIT_CONFIG_PARAMETERS);assert.ok(!options.env.GIT_SSL_NO_VERIFY);
    const config=settings(options.env);assert.ok(config.some(([key,value])=>key===`http.${remote}.extraHeader` && value===`Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`));
    for (const [key,value] of [['credential.helper',''],[`http.${remote}.followRedirects`,'false'],[`http.${remote}.sslVerify`,'true'],[`http.${remote}.curloptResolve`,'']]) assert.ok(config.some(([k,v])=>k===key&&v===value));
    hookPath=config.find(([key])=>key==='core.hooksPath')[1];assert.match(hookPath,/zero-upload-hooks-/);assert.deepEqual(await fs.readdir(hookPath),[]);
    return {stdout:args[0]==='push'?token:`${sha}\trefs/heads/main\n`};
  }});
  await transport(root,['push',remote,`${sha}:refs/heads/main`]);assert.equal(spawnOptions.env.GIT_CONFIG_COUNT,undefined);await assert.rejects(fs.access(hookPath));
  assert.equal(await transport(root,['ls-remote','--heads',remote,'refs/heads/main']),`${sha}\trefs/heads/main`);
  assert.equal(calls,2);assert.equal(environment.GIT_TRACE,'trace.log');
  const disk=await fs.readFile(path.join(root,'.git','config'),'utf8');assert.doesNotMatch(disk,/Authorization|TEST_SECRET|extraHeader|hooksPath/);
  for(const args of [['config','user.name'],['push','https://evil.test/student/app.git',`${sha}:refs/heads/main`],['push',remote,`${sha}:refs/heads/main`,'--force'],['ls-remote','--heads','https://github.com/other/app.git','refs/heads/main']]) await assert.rejects(transport(root,args),/Only the reviewed/);
  assert.throws(()=>createTransport('https://github.com@evil.test/student/app',nativeSession));
  assert.equal(calls,2);
});
test('secret child errors and malformed confirmation output are redacted and config references cleared', async t => {
  const root=await project(t);
  for(const failure of ['Authentication failed '+token,'non-fast-forward '+token,'unexpected '+token]) {
    let options;const run=createTransport(remote,async()=>nativeSession(),{assertCurrentNow:nativeSession,spawn:async(_,__,value)=>{options=value;throw Object.assign(new Error(token),{stderr:failure});}});
    await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),error=>{assert.doesNotMatch(error.message,/TEST_SECRET/);return true;});
    assert.equal(options.env.GIT_CONFIG_COUNT,undefined);
  }
  const run=createTransport(remote,async()=>nativeSession(),{assertCurrentNow:nativeSession,spawn:async()=>({stdout:token})});
  await assert.rejects(run(root,['ls-remote','--heads',remote,'refs/heads/main']),error=>error.kind==='unconfirmed'&&!error.message.includes(token));
});
test('native account removal/drift stops before credential-bearing process; revoke between push and confirmation never reports success', async t => {
  for (const revokeAt of ['review','push']) {
    const root=await project(t);let session={id:'one',account:{id:'student',label:'student'},accessToken:token};let listener;let calls=0;
    const auth=createAuthentication({getSession:async(provider,scopes)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);return session;},onDidChangeSessions:fn=>{listener=fn;return {dispose(){}};}});t.after(()=>auth.dispose());
    const ticket=await auth.capture();const plan=await prepareUpload(root);
    const check=()=>auth.assertCurrent(ticket);
    const networkRun=createTransport(remote,check,{assertCurrentNow:()=>auth.assertCurrentNow(ticket),spawn:async()=>{calls++;session=undefined;listener({provider:{id:'zero-github'}});return {stdout:''};}});
    if(revokeAt==='review') {session={...session,account:{id:'other',label:'other'}};listener({provider:{id:'zero-github'}});}
    await assert.rejects(uploadPrepared(plan,'Save',{beforeUpload:check,networkRun,withLocalMutation}),/account or sign-in changed/);
    assert.equal(calls,revokeAt==='review'?0:1);
  }
});
test('URL rewrite introduced during session revalidation is rejected before transport', async t => {
  const root=await project(t);let calls=0;
  const run=createTransport(remote,async()=>{await core.git(root,['config','--local','url.https://evil.test/.insteadOf','https://github.com/']);return nativeSession();},{assertCurrentNow:nativeSession,spawn:async()=>{calls++;return {stdout:''};}});
  await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/URL rewriting/);assert.equal(calls,0);
});

test('successful reviewed upload uses isolated native-session transport for push and confirmation only', async t => {
  const root=await project(t);const localCalls=[],networkCalls=[];let pushedHead;
  const localRun=async(cwd,args)=>{assert.ok(!JSON.stringify(process.env).includes(token));assert.ok(!['push','ls-remote'].includes(args[0]));localCalls.push(args[0]);return core.git(cwd,args);};
  const auth=createAuthentication({getSession:async()=>({id:'one',account:{id:'student',label:'student'},accessToken:token}),onDidChangeSessions:()=>({dispose(){}})});t.after(()=>auth.dispose());
  let nativeChecks=0;const ticket=await auth.capture();const check=()=>{nativeChecks++;return auth.assertCurrent(ticket);};const plan=await prepareUpload(root,localRun);
  const networkRun=createTransport(remote,check,{assertCurrentNow:()=>auth.assertCurrentNow(ticket),localRun,spawn:async(_,args,options)=>{
    networkCalls.push(args[0]);assert.ok(settings(options.env).some(([key,value])=>key===`credential.${remote}.helper`&&value===''));
    if(args[0]==='push'){pushedHead=args[2].split(':')[0];return {stdout:''};}
    return {stdout:`${pushedHead}\trefs/heads/main\n`};
  }});
  const result=await uploadPrepared(plan,'Save',{run:localRun,beforeUpload:check,networkRun});
  assert.equal(result.uploaded,true);assert.deepEqual(networkCalls,['push','ls-remote']);assert.ok(localCalls.includes('commit'));
  assert.ok(nativeChecks>=3,'The upload and both protected operations revalidate the native session');
  assert.doesNotMatch(await fs.readFile(path.join(root,'.git','config'),'utf8'),/Authorization|TEST_SECRET/);
});

test('persistent Git Trace2 config cannot write native-session secrets through early initialization', async t => {
  const root=await project(t);
  const {execFile}=require('node:child_process');const {promisify}=require('node:util');const execute=promisify(execFile);
  const encoded=Buffer.from(`x-access-token:${token}`).toString('base64');
  const header=`Authorization: Basic ${encoded}`;
  const configFile=path.join(root,'isolated-global-config');
  const eventFile=path.join(root,'trace2-event.json');const normalFile=path.join(root,'trace2-normal.log');const perfFile=path.join(root,'trace2-perf.log');
  const environment={...process.env,GIT_CONFIG_GLOBAL:configFile,GIT_CONFIG_NOSYSTEM:'1'};
  for(const [key,value] of [['trace2.eventTarget',eventFile],['trace2.normalTarget',normalFile],['trace2.perfTarget',perfFile],['trace2.envVars','GIT_CONFIG_VALUE_*'],['trace2.configParams','http.*.extraHeader']]) {
    await execute('git',['config','--file',configFile,key,value],{cwd:root,env:environment});
  }
  let calls=0;
  const run=createTransport(remote,async()=>nativeSession(),{assertCurrentNow:nativeSession,environment,spawn:async(command,args,options)=>{
    calls++;assert.equal(command,'git');assert.equal(args[0],'push');
    assert.equal(options.env.GIT_CONFIG_GLOBAL,configFile);
    for(const key of ['GIT_TRACE2','GIT_TRACE2_EVENT','GIT_TRACE2_PERF']) assert.equal(options.env[key],'0');
    // The only actual child operation is local Git config. No transport occurs.
    await execute('git',['config','--get','core.hooksPath'],options);
    return {stdout:''};
  }});
  await run(root,['push',remote,`${sha}:refs/heads/main`]);assert.equal(calls,1);
  for(const file of [configFile,eventFile,normalFile,perfFile,path.join(root,'.git','config')]) {
    let contents='';try{contents=await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
    assert.ok(!contents.includes(token),`${path.basename(file)} must exclude the raw token`);
    assert.ok(!contents.includes(encoded),`${path.basename(file)} must exclude the encoded token`);
    assert.ok(!contents.includes(header),`${path.basename(file)} must exclude the Basic header`);
  }
});

test('account removal or switch during asynchronous preparation stops dispatch and removes the hook directory', async t => {
  for(const preparation of ['root','rewrite','temporary-directory']) for(const change of ['remove','switch']) {
    const root=await project(t);let session={id:'one',account:{id:'student',label:'student'},accessToken:token};let listener,hookPath;let calls=0,nativeChecks=0,changed=false;
    const auth=createAuthentication({getSession:async(provider,scopes)=>{assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);return session;},onDidChangeSessions:fn=>{listener=fn;return {dispose(){}};}});
    const ticket=await auth.capture();
    const revoke=()=>{if(changed)return;changed=true;session=change==='remove'?undefined:{...session,id:'other',account:{id:'other',label:'other'}};listener({provider:{id:'zero-github'}});};
    const originalMkdtemp=fs.mkdtemp;
    fs.mkdtemp=async prefix=>{const result=await originalMkdtemp(prefix);if(prefix.includes('zero-upload-hooks-')){hookPath=result;if(preparation==='temporary-directory')revoke();}return result;};
    const localRun=async(cwd,args)=>{
      const result=await core.git(cwd,args).catch(error=>{if(args[0]==='config'&&error.code===1){if(preparation==='rewrite')revoke();}throw error;});
      if(preparation==='root'&&args[0]==='rev-parse')revoke();
      if(preparation==='rewrite'&&args[0]==='config')revoke();
      return result;
    };
    try {
      const run=createTransport(remote,()=>{nativeChecks++;return auth.assertCurrent(ticket);},{assertCurrentNow:()=>auth.assertCurrentNow(ticket),localRun,spawn:async()=>{calls++;return {stdout:''};}});
      await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/account or sign-in changed/);
      assert.equal(calls,0,`${change} during ${preparation} must prevent dispatch`);
      assert.equal(nativeChecks,1,'One fresh native lookup runs before asynchronous preparation');
      assert.ok(hookPath,'Preparation creates the guarded empty hook directory');
      await assert.rejects(fs.access(hookPath));
    } finally {fs.mkdtemp=originalMkdtemp;auth.dispose();}
  }
});

test('the final asynchronous session lookup precedes rewrite guards and cannot dispatch a rewritten destination', async t => {
  const root=await project(t);let lookups=0,dispatches=0;
  const authenticate=async()=>{lookups++;await core.git(root,['config','--local','url.https://evil.test/.insteadOf','https://github.com/']);return nativeSession();};
  const run=createTransport(remote,authenticate,{assertCurrentNow:nativeSession,spawn:async()=>{dispatches++;return {stdout:''};}});
  await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/URL rewriting/);
  assert.equal(lookups,1,'There is no second asynchronous session lookup after the rewrite guard');assert.equal(dispatches,0);
});

test('transport requires a synchronous final guard and rejects promise-returning guards before dispatch with cleanup', async t => {
  assert.throws(()=>createTransport(remote,async()=>nativeSession()),/synchronous session guard/);
  assert.throws(()=>createTransport(remote,async()=>nativeSession(),{assertCurrentNow:async()=>nativeSession()}),/synchronous session guard/);
  const root=await project(t);let hookPath,calls=0;
  const originalMkdtemp=fs.mkdtemp;fs.mkdtemp=async prefix=>{const result=await originalMkdtemp(prefix);if(prefix.includes('zero-upload-hooks-'))hookPath=result;return result;};
  try {
    const run=createTransport(remote,async()=>nativeSession(),{assertCurrentNow:()=>Promise.resolve(nativeSession()),spawn:async()=>{calls++;return {stdout:''};}});
    await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/synchronous session guard/);
    assert.equal(calls,0);assert.ok(hookPath);await assert.rejects(fs.access(hookPath));
  } finally {fs.mkdtemp=originalMkdtemp;}
});

test('Git runtime-configuration version gate rejects old or unknown Git before obtaining credentials and accepts current suffixes', async t => {
  const root=await project(t);
  for(const version of ['git version 2.30.9','git version 1.99.0','unknown Git','git version 2.31.0','git version 2.53.0.windows.1','git version 3.0.0']) {
    let lookups=0,dispatches=0;
    const localRun=(cwd,args)=>args[0]==='--version'?Promise.resolve(version):core.git(cwd,args);
    const run=createTransport(remote,async()=>{lookups++;return nativeSession();},{assertCurrentNow:nativeSession,localRun,spawn:async()=>{dispatches++;return {stdout:''};}});
    if(/2\.30|1\.99|unknown/.test(version)) {
      await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/Git 2.31 or newer/);assert.equal(lookups,0);assert.equal(dispatches,0);
    } else {await run(root,['push',remote,`${sha}:refs/heads/main`]);assert.equal(lookups,1);assert.equal(dispatches,1);}
  }
});

test('destination rewriting during temporary-directory preparation prevents dispatch and cleans hooks', async t => {
  const root=await project(t);let hookPath,dispatches=0;
  const originalMkdtemp=fs.mkdtemp;
  fs.mkdtemp=async prefix=>{
    const result=await originalMkdtemp(prefix);
    if(prefix.includes('zero-upload-hooks-')) {
      hookPath=result;
      await core.git(root,['config','--local','url.https://evil.test/.insteadOf','https://github.com/']);
    }
    return result;
  };
  try {
    const run=createTransport(remote,async()=>nativeSession(),{
      assertCurrentNow:nativeSession,spawn:async()=>{dispatches++;return {stdout:''};}
    });
    await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/URL rewriting/);
    assert.equal(dispatches,0);
    assert.ok(hookPath);
    await assert.rejects(fs.access(hookPath));
  } finally {fs.mkdtemp=originalMkdtemp;}
});

test('pinned fetch gets isolated credentials and no stdout, while arbitrary fetch/refspecs are refused', async t => {
  const root = await project(t); let calls = 0; let options;
  const run = createTransport(remote, async () => nativeSession(), {assertCurrentNow: nativeSession, spawn: async (_, args, value) => {
    calls++; options = value;
    assert.deepEqual(args, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, sha]);
    assert.ok(settings(value.env).some(([key, val]) => key === 'credential.helper' && val === ''));
    return {stdout: token};
  }});
  assert.equal(await run(root, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, sha]), '');
  assert.equal(options.env.GIT_CONFIG_COUNT, undefined);
  for (const args of [
    ['fetch', remote, 'main'],
    ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, 'main'],
    ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, `${sha}:refs/heads/main`],
    ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, 'a'.repeat(41)],
    ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', 'https://github.com/other/app.git', sha],
    ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, sha, '--prune'],
    ['push', remote, `${'a'.repeat(41)}:refs/heads/main`],
    ['push', remote, `${sha}:refs/heads/main:refs/heads/other`],
    ['push', remote, `${sha}:refs/heads/main..other`],
    ['ls-remote', '--heads', remote, 'refs/heads/main.lock'],
    ['ls-remote', '--heads', remote, 'refs/heads/main:refs/heads/other']
  ]) await assert.rejects(run(root, args), /Only the reviewed/);
  assert.equal(calls, 1);
  const failed = createTransport(remote, async () => nativeSession(), {assertCurrentNow: nativeSession, spawn: async () => { throw Object.assign(new Error(token), {stderr: token}); }});
  await assert.rejects(failed(root, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, sha]), error => !error.message.includes(token));
});

const featureBranch = 'feature/two';
function deleteArgs(branch = featureBranch, expected = sha, destination = remote) {
  const ref = `refs/heads/${branch}`;
  return ['push', `--force-with-lease=${ref}:${expected}`, destination, `:${ref}`];
}
function deleteAuthorization(root, fields = {}) {
  return {root, destination: remote, branch: featureBranch, expectedSha: sha, assertCurrentNow() {}, ...fields};
}

test('one reviewed feature delete dispatches the immutable exact lease with isolated credentials and a current Git binding', async t => {
  const root = await project(t);
  const featureSha = 'b'.repeat(64);
  const events = [];
  const args = deleteArgs(featureBranch, featureSha);
  const authorization = deleteAuthorization(root, {expectedSha: featureSha, assertCurrentNow() { events.push('authorize'); }});
  let options, hookPath;
  const run = createTransport(remote, async () => {
    events.push('authenticate');
    args.splice(1, 3, remote, ':refs/heads/main');
    return nativeSession();
  }, {
    assertCurrentNow: () => { events.push('session'); return nativeSession(); },
    deleteAuthorization: authorization,
    environment: {...process.env, GIT_DIR:'/incorrect', GIT_CONFIG:'/incorrect', GIT_TRACE_CURL:'1'},
    spawn: async (command, sent, value) => {
      events.push('spawn');
      options = value;
      assert.equal(command, 'git');
      assert.deepEqual(sent, deleteArgs(featureBranch, featureSha));
      assert.equal(options.cwd, root);
      assert.equal(options.env.GIT_DIR, path.join(root, '.git'));
      assert.equal(options.env.GIT_COMMON_DIR, path.join(root, '.git'));
      assert.equal(options.env.GIT_CONFIG, undefined);
      assert.equal(options.env.GIT_TRACE_CURL, undefined);
      const config = new Map(settings(options.env));
      assert.equal(config.get(`http.${remote}.extraHeader`), `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`);
      assert.equal(config.get(`http.${remote}.followRedirects`), 'false');
      assert.equal(config.get('credential.helper'), '');
      for (const [key, expected] of [['push.followTags', 'false'], ['push.gpgSign', 'false'], ['push.recurseSubmodules', 'no'], ['push.pushOption', ''], ['push.negotiate', 'false']]) assert.equal(config.get(key), expected);
      hookPath = config.get('core.hooksPath');
      assert.deepEqual(await fs.readdir(hookPath), []);
      return {stdout: token};
    }
  });
  authorization.branch = 'main';
  authorization.expectedSha = sha;
  authorization.assertCurrentNow = () => assert.fail('The original reviewed guard must be retained');
  await withReadOnly(root, async binding => {
    const reviewed = Object.freeze({...binding, assertCurrentNow() { binding.assertCurrentNow(); events.push('binding'); }});
    assert.equal(await run(root, args, reviewed), '');
    await assert.rejects(run(root, deleteArgs(featureBranch, featureSha), reviewed), /no longer authorized/);
  });
  assert.deepEqual(events, ['authenticate', 'session', 'binding', 'authorize', 'session', 'spawn', 'binding', 'authorize', 'session']);
  assert.equal(options.env.GIT_CONFIG_COUNT, undefined);
  await assert.rejects(fs.access(hookPath));
  assert.doesNotMatch(await fs.readFile(path.join(root, '.git', 'config'), 'utf8'), /Authorization|TEST_SECRET/);
});

test('the delete capability rejects alternate refs, destinations, leases and unbound commands before authentication', async t => {
  const root = await project(t);
  let lookups = 0;
  const options = {assertCurrentNow: nativeSession, spawn: async () => assert.fail('An unreviewed command reached Git')};
  const authenticate = async () => { lookups++; return nativeSession(); };
  for (const fields of [{branch:'main'}, {branch:'feature..other'}, {expectedSha:'0'.repeat(40)}, {expectedSha:'a'.repeat(41)}, {expectedSha:'a'.repeat(40)+'\n'}, {root:'relative'}, {destination:'origin'}, {assertCurrentNow:async () => {}}]) {
    assert.throws(() => createTransport(remote, authenticate, {...options, deleteAuthorization: deleteAuthorization(root, fields)}), /no longer authorized/);
  }
  const ordinary = createTransport(remote, authenticate, options);
  const reviewed = createTransport(remote, authenticate, {...options, deleteAuthorization: deleteAuthorization(root)});
  await withReadOnly(root, async binding => {
    await assert.rejects(ordinary(root, deleteArgs(), binding), /Only the reviewed/);
    await assert.rejects(reviewed(root, deleteArgs()), /no longer authorized/);
    await assert.rejects(reviewed(root, deleteArgs(), {...binding}), /no longer authorized/);
    await assert.rejects(reviewed(root, deleteArgs(), Object.freeze({...binding, root:path.dirname(root)})), /binding is invalid/);
    await assert.rejects(reviewed(path.dirname(root), deleteArgs(), binding), /Only the reviewed/);
    for (const args of [
      deleteArgs('main'), deleteArgs('feature/other'), deleteArgs(featureBranch, 'b'.repeat(40)),
      deleteArgs(featureBranch, sha, 'origin'), deleteArgs(featureBranch, sha, 'https://github.com/other/app.git'),
      ['push', remote, `:refs/heads/${featureBranch}`], ['push', '--delete', remote, featureBranch],
      ['push', '--force-with-lease', remote, `:refs/heads/${featureBranch}`],
      ['push', deleteArgs()[1], remote, ':refs/heads/main'], [...deleteArgs(), '--force'],
      ['push', remote, deleteArgs()[1], deleteArgs()[3]]
    ]) await assert.rejects(reviewed(root, args, binding), /Only the reviewed/);
  });
  assert.equal(lookups, 0);
});

const cleanupRead = (ref, destination = remote) => ['ls-remote', '--heads', destination, ref];
const mainRef = 'refs/heads/main';
const featureRef = `refs/heads/${featureBranch}`;

test('cleanup authorizes only bound reads of the reviewed main and feature refs', async t => {
  const root = await project(t);
  const sent = [];
  const run = createTransport(remote, nativeSession, {assertCurrentNow:nativeSession, deleteAuthorization:deleteAuthorization(root),
    spawn:async (_, args, {env}) => {
      sent.push(args[3]);
      assert.equal(env.GIT_DIR, path.join(root, '.git'));
      assert.equal(env.GIT_COMMON_DIR, env.GIT_DIR);
      assert.equal(env.GIT_WORK_TREE, root);
      return {stdout:args[3] === mainRef ? `${sha}\t${mainRef}\n` : ''};
    }
  });
  await withReadOnly(root, async binding => {
    await assert.rejects(run(root, cleanupRead(mainRef)), /no longer authorized/);
    await assert.rejects(run(root, cleanupRead(featureRef), {...binding}), /no longer authorized/);
    await assert.rejects(run(path.dirname(root), cleanupRead(featureRef), binding), /Only the reviewed/);
    for (const args of [
      cleanupRead('refs/heads/other'), cleanupRead('refs/heads/*'), cleanupRead(featureRef, 'origin'),
      [...cleanupRead(mainRef), featureRef], ['ls-remote', '--tags', remote, mainRef],
      ['push', remote, `${sha}:${mainRef}`], ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, sha]
    ]) await assert.rejects(run(root, args, binding), /Only the reviewed/);
    assert.equal(await run(root, cleanupRead(mainRef), binding), `${sha}\t${mainRef}`);
    assert.equal(await run(root, cleanupRead(featureRef), binding), '');
  });
  assert.deepEqual(sent, [mainRef, featureRef]);
});

test('a URL-named alias introduced at any cleanup read cannot report a forged main or absent feature', async t => {
  const root = await project(t);
  const refs = [mainRef, featureRef, mainRef, featureRef];
  const alias = `remote.${remote}.url`;
  await withReadOnly(root, async binding => {
    for (let addedAt = 0; addedAt < refs.length; addedAt++) {
      let reads = 0, dispatched = 0;
      const run = createTransport(remote, async () => {
        if (reads++ === addedAt) await core.git(root, ['config', '--local', alias, 'https://github.com/other/app.git']);
        return nativeSession();
      }, {assertCurrentNow:nativeSession, deleteAuthorization:deleteAuthorization(root), spawn:async (_, args) => {
        dispatched++;
        return {stdout:args[3] === mainRef ? `${sha}\t${mainRef}` : ''};
      }});
      try {
        for (const ref of refs.slice(0, addedAt)) await run(root, cleanupRead(ref), binding);
        await assert.rejects(run(root, cleanupRead(refs[addedAt]), binding), /no longer authorized/);
        assert.equal(dispatched, addedAt);
      } finally { await core.git(root, ['config', '--local', '--unset-all', alias]); }
    }
  });
});

test('an empty cleanup read cannot confirm absence after its binding becomes invalid during the child', async t => {
  const root = await project(t);
  let active = true;
  const run = createTransport(remote, nativeSession, {assertCurrentNow:nativeSession, deleteAuthorization:deleteAuthorization(root),
    spawn:async () => { active = false; return {stdout:''}; }
  });
  await withReadOnly(root, async binding => {
    const reviewed = Object.freeze({...binding, assertCurrentNow() { binding.assertCurrentNow(); return active; }});
    await assert.rejects(run(root, cleanupRead(featureRef), reviewed), error => error.kind === 'changed');
  });
});

test('an ordinary authenticated command cannot be mutated into a delete while awaiting GitHub access', async t => {
  const root = await project(t);
  const upload = ['push', remote, `${sha}:refs/heads/main`];
  const args = [...upload];
  let calls = 0;
  const run = createTransport(remote, async () => {
    args.splice(0, args.length, ...deleteArgs('main'));
    return nativeSession();
  }, {assertCurrentNow:nativeSession, spawn:async (_, sent) => {
    calls++;
    assert.deepEqual(sent, upload);
    return {stdout:''};
  }});
  await run(root, args);
  assert.equal(calls, 1);
});

test('delete rejects changed guard or binding, authentication loss, and ambiguous Git destination before dispatch', async t => {
  const root = await project(t);
  let calls = 0;
  const options = {assertCurrentNow:nativeSession, spawn:async () => { calls++; return {stdout:''}; }};
  await withReadOnly(root, async binding => {
    let active = true;
    const run = createTransport(remote, async () => { active = false; return nativeSession(); }, {...options,
      deleteAuthorization:deleteAuthorization(root, {assertCurrentNow() { return active; }})
    });
    await assert.rejects(run(root, deleteArgs(), binding), /no longer authorized/);
    const promised = createTransport(remote, nativeSession, {...options, deleteAuthorization:deleteAuthorization(root, {assertCurrentNow:() => Promise.reject(new Error(token))})});
    await assert.rejects(promised(root, deleteArgs(), binding), error => error.kind === 'changed' && !error.message.includes(token));
    const ordinary = createTransport(remote, nativeSession, {...options, deleteAuthorization:deleteAuthorization(root)});
    const stale = Object.freeze({...binding, assertCurrentNow() { throw new Error('Binding expired'); }});
    await assert.rejects(ordinary(root, deleteArgs(), stale), /Binding expired/);
    const signedOut = createTransport(remote, nativeSession, {...options, assertCurrentNow:() => undefined, deleteAuthorization:deleteAuthorization(root)});
    await assert.rejects(signedOut(root, deleteArgs(), binding), /sign-in changed/);
    for (const [key, value] of [[`remote.${remote}.url`, 'https://github.com/other/app.git'], ['url.https://evil.test/.pushInsteadOf', 'https://github.com/']]) {
      await core.git(root, ['config', '--local', key, value]);
      try { await assert.rejects(ordinary(root, deleteArgs(), binding), /no longer authorized/); }
      finally { await core.git(root, ['config', '--local', '--unset-all', key]); }
    }
  });
  assert.equal(calls, 0);
});

test('GitHub lease, protection and authentication failures are redacted and never retried', async t => {
  const root = await project(t);
  await withReadOnly(root, async binding => {
    for (const [reason, kind] of [['stale info', 'changed'], ['protected branch hook declined', 'protected'], ['Authentication failed', 'auth']]) {
      let calls = 0, options, hookPath;
      const run = createTransport(remote, nativeSession, {assertCurrentNow:nativeSession, deleteAuthorization:deleteAuthorization(root),
        spawn:async (_, args, value) => {
          calls++;
          assert.deepEqual(args, deleteArgs());
          options = value;
          hookPath = new Map(settings(options.env)).get('core.hooksPath');
          throw Object.assign(new Error(token), {stderr:`${reason} ${token}`});
        }
      });
      await assert.rejects(run(root, deleteArgs(), binding), error => error.kind === kind && !error.message.includes(token));
      await assert.rejects(run(root, deleteArgs(), binding), /no longer authorized/);
      assert.equal(calls, 1);
      assert.equal(options.env.GIT_CONFIG_COUNT, undefined);
      await assert.rejects(fs.access(hookPath));
    }
  });
});
