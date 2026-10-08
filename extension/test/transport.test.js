'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
const {createTransport} = require('../src/transport');
const {prepareUpload,uploadPrepared} = require('../src/github');
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
  const transport=createTransport(remote,async()=>nativeSession(),{environment,spawn:async(command,args,options)=>{
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
    let options;const run=createTransport(remote,async()=>nativeSession(),{spawn:async(_,__,value)=>{options=value;throw Object.assign(new Error(token),{stderr:failure});}});
    await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),error=>{assert.doesNotMatch(error.message,/TEST_SECRET/);return true;});
    assert.equal(options.env.GIT_CONFIG_COUNT,undefined);
  }
  const run=createTransport(remote,async()=>nativeSession(),{spawn:async()=>({stdout:token})});
  await assert.rejects(run(root,['ls-remote','--heads',remote,'refs/heads/main']),/transport failed/);
});
test('native account removal/drift stops before credential-bearing process; revoke between push and confirmation never reports success', async t => {
  for (const revokeAt of ['review','push']) {
    const root=await project(t);let session={id:'one',account:{id:'student',label:'student'},accessToken:token};let listener;let calls=0;
    const auth=createAuthentication({getSession:async()=>session,onDidChangeSessions:fn=>{listener=fn;return {dispose(){}};}});t.after(()=>auth.dispose());
    const ticket=await auth.capture();const plan=await prepareUpload(root);
    const check=()=>auth.assertCurrent(ticket);
    const networkRun=createTransport(remote,check,{spawn:async()=>{calls++;session=undefined;listener({provider:{id:'github'}});return {stdout:''};}});
    if(revokeAt==='review') {session={...session,account:{id:'other',label:'other'}};listener({provider:{id:'github'}});}
    await assert.rejects(uploadPrepared(plan,'Save',{beforeUpload:check,networkRun}),/account or sign-in changed/);
    assert.equal(calls,revokeAt==='review'?0:1);
  }
});
test('URL rewrite introduced during session revalidation is rejected before transport', async t => {
  const root=await project(t);let calls=0;
  const run=createTransport(remote,async()=>{await core.git(root,['config','--local','url.https://evil.test/.insteadOf','https://github.com/']);return nativeSession();},{spawn:async()=>{calls++;return {stdout:''};}});
  await assert.rejects(run(root,['push',remote,`${sha}:refs/heads/main`]),/URL rewriting/);assert.equal(calls,0);
});

test('successful reviewed upload uses isolated native-session transport for push and confirmation only', async t => {
  const root=await project(t);const localCalls=[],networkCalls=[];let pushedHead;
  const localRun=async(cwd,args)=>{assert.ok(!JSON.stringify(process.env).includes(token));assert.ok(!['push','ls-remote'].includes(args[0]));localCalls.push(args[0]);return core.git(cwd,args);};
  const auth=createAuthentication({getSession:async()=>({id:'one',account:{id:'student',label:'student'},accessToken:token}),onDidChangeSessions:()=>({dispose(){}})});t.after(()=>auth.dispose());
  const ticket=await auth.capture();const check=()=>auth.assertCurrent(ticket);const plan=await prepareUpload(root,localRun);
  const networkRun=createTransport(remote,check,{localRun,spawn:async(_,args,options)=>{
    networkCalls.push(args[0]);assert.ok(settings(options.env).some(([key,value])=>key===`credential.${remote}.helper`&&value===''));
    if(args[0]==='push'){pushedHead=args[2].split(':')[0];return {stdout:''};}
    return {stdout:`${pushedHead}\trefs/heads/main\n`};
  }});
  const result=await uploadPrepared(plan,'Save',{run:localRun,beforeUpload:check,networkRun});
  assert.equal(result.uploaded,true);assert.deepEqual(networkCalls,['push','ls-remote']);assert.ok(localCalls.includes('commit'));
  assert.doesNotMatch(await fs.readFile(path.join(root,'.git','config'),'utf8'),/Authorization|TEST_SECRET/);
});
