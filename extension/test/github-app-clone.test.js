'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const core=require('../src/core');
const {createGitHubAppClone}=require('../src/github-app/clone');
const execute=promisify(execFile);
const token='TEST_CLONE_SECRET_NEVER_PRINT';
const remote='https://github.com/student/project.git';
function settings(env) {return Array.from({length:Number(env.GIT_CONFIG_COUNT)},(_,index)=>[env[`GIT_CONFIG_KEY_${index}`],env[`GIT_CONFIG_VALUE_${index}`]]);}
async function fixture(t) {
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-app-clone-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const parent=path.join(base,'projects'),source=path.join(base,'source');await fs.mkdir(parent);await fs.mkdir(source);
 await core.git(source,['init','-b','main']);await core.git(source,['config','user.name','Test']);await core.git(source,['config','user.email','test@example.invalid']);await fs.writeFile(path.join(source,'zero.json'),'{}');await fs.writeFile(path.join(source,'Main.java'),'class Main {}');await core.git(source,['add','.']);await core.git(source,['commit','-m','Seed']);
 const repository={id:32,name:'project',owner:{id:17},html_url:'https://github.com/student/project',clone_url:remote},installation={id:51};
 const ticket={session:{id:'one',accountId:'17',accessToken:token},revision:1};
 let active=true,spawnHook,accessHook,localHook,accessCalls=0;
 const authentication={assertCurrent:async value=>{if(!active||value!==ticket)throw Error(token+' account changed');return ticket.session;},assertCurrentNow:value=>{if(!active||value!==ticket)throw Error(token+' account changed');return ticket.session;}};
 const repositories={access:async(url,options)=>{accessCalls++;if(accessHook)await accessHook(url,options,accessCalls);return {repository,installation,ticket};}};
 const environment={...process.env,GIT_TRACE:'SECRET_TRACE',GIT_TRACE_CURL:'SECRET_CURL',GIT_TRACE2_EVENT:'SECRET_TRACE2',GIT_CURL_VERBOSE:'1',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:'unsafe',GIT_CONFIG_PARAMETERS:'unsafe',GIT_SSL_NO_VERIFY:'1',GIT_DIR:'/invalid',GIT_WORK_TREE:'/invalid',GIT_TEMPLATE_DIR:'/invalid',GIT_ASKPASS:'/invalid',SSH_ASKPASS:'/invalid',SSLKEYLOGFILE:'/invalid'};
 const calls=[];
 const spawn=async(command,args,options)=>{
   calls.push({command,args,options,settings:settings(options.env)});
   if(spawnHook)return spawnHook(command,args,options);
   // Redirect only the injected test child to a disposable local repository;
   // production never rewrites a GitHub URL or calls a test server.
   const destination=args.at(-1);
   const result=await execute('git',['-c','protocol.file.allow=always','clone','--no-recurse-submodules','--',source,destination],options);
   await execute('git',['remote','set-url','origin',remote],{...options,cwd:destination});
   return result;
 };
 const localRun=async(root,args)=>{if(localHook){const value=await localHook(root,args);if(value!==undefined)return value;}return core.git(root,args);};
 const clone=createGitHubAppClone({authentication,repositories,spawn,environment,localRun});
 return {base,parent,source,clone,calls,repository,installation,ticket,authentication,repositories,environment,get accessCalls(){return accessCalls;},set active(value){active=value;},set spawnHook(value){spawnHook=value;},set accessHook(value){accessHook=value;},set localHook(value){localHook=value;}};
}
test('authenticated clone uses real local Git behind injected transport and verifies exact repository/commit',async t=>{
 const f=await fixture(t),result=await f.clone({repositoryUrl:f.repository.html_url,parentPath:f.parent});assert.equal(result,path.join(f.parent,'project'));assert.equal(await fs.readFile(path.join(result,'Main.java'),'utf8'),'class Main {}');
 assert.equal(await core.git(result,['remote','get-url','origin']),remote);assert.equal(await core.git(result,['rev-parse','HEAD']),await core.git(f.source,['rev-parse','HEAD']));assert.equal(f.accessCalls,2);
 const call=f.calls[0];assert.equal(call.command,'git');assert.deepEqual(call.args,['clone','--no-recurse-submodules','--',remote,result]);assert.ok(!call.args.join(' ').includes(token));
 assert.equal(call.options.env.GIT_CONFIG_COUNT,undefined,'Credential-bearing config references are dropped after dispatch');
 const header=call.settings.find(([key,value])=>key===`http.${remote}.extraHeader`&&value)[1];assert.equal(header,`Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`);
 for(const [key,value] of [['credential.helper',''],[`credential.${remote}.helper`,''],['http.extraHeader',''],[`http.${remote}.followRedirects`,'false'],[`http.${remote}.sslVerify`,'true'],['protocol.allow','never'],['protocol.https.allow','always'],['submodule.recurse','false']])assert.ok(call.settings.some(([k,v])=>k===key&&v===value));
 const hookPath=call.settings.find(([key])=>key==='core.hooksPath')[1];await assert.rejects(fs.access(hookPath));
 const disk=await fs.readFile(path.join(result,'.git','config'),'utf8');assert.ok(!disk.includes(token));assert.ok(!disk.includes(header));assert.doesNotMatch(disk,/Authorization|extraHeader|hooksPath/);
 assert.equal(f.environment.GIT_CONFIG_VALUE_0,'unsafe','Parent environment remains untouched');
});
test('credential child ignores inherited trace/config/helper/template programs',async t=>{
 const f=await fixture(t),globalFile=path.join(f.base,'global-config'),traceFile=path.join(f.base,'trace.json'),hookMarker=path.join(f.base,'hook-ran');
 await fs.writeFile(globalFile,`[trace2]\n eventTarget = ${traceFile}\n envVars = GIT_CONFIG_VALUE_*\n[core]\n hooksPath = ${f.base}\n[credential]\n helper = !touch ${hookMarker}\n[init]\n templateDir = ${f.base}\n`);f.environment.GIT_CONFIG_GLOBAL=globalFile;
 f.spawnHook=async(command,args,options)=>{
  for(const key of ['GIT_TRACE','GIT_TRACE_CURL','GIT_CURL_VERBOSE','GIT_CONFIG_PARAMETERS','GIT_SSL_NO_VERIFY','GIT_DIR','GIT_WORK_TREE','SSLKEYLOGFILE'])assert.equal(options.env[key],undefined,key);
  for(const key of ['GIT_TRACE2','GIT_TRACE2_EVENT','GIT_TRACE2_PERF'])assert.equal(options.env[key],'0');
  assert.equal(options.env.GIT_CONFIG_NOSYSTEM,'1');assert.notEqual(options.env.GIT_CONFIG_GLOBAL,globalFile);assert.equal(await fs.readFile(options.env.GIT_CONFIG_GLOBAL,'utf8'),'');assert.deepEqual(await fs.readdir(options.env.GIT_TEMPLATE_DIR),[]);
  await execute(command,['config','--get','core.hooksPath'],options);
  throw Error(token);
 };
 await assert.rejects(f.clone({repositoryUrl:f.repository.html_url,parentPath:f.parent}),error=>error.code==='clone-incomplete'&&!error.message.includes(token));await assert.rejects(fs.access(traceFile));await assert.rejects(fs.access(hookMarker));
});
test('unselected repository and old Git stop before reserving destination or dispatching credentials',async t=>{
 const f=await fixture(t);f.accessHook=()=>{throw Error('Select repository');};await assert.rejects(f.clone({repositoryUrl:f.repository.html_url,parentPath:f.parent}),/Select repository/);assert.equal(f.calls.length,0);assert.deepEqual(await fs.readdir(f.parent),[]);
 f.accessHook=undefined;f.localHook=(_,args)=>args[0]==='--version'?'git version 2.30.9':undefined;await assert.rejects(f.clone({repositoryUrl:f.repository.html_url,parentPath:f.parent}),/2.31/);assert.equal(f.accessCalls,1);assert.deepEqual(await fs.readdir(f.parent),[]);
});
test('existing folder and symlink are never overwritten or removed',async t=>{
 const f=await fixture(t),destination=path.join(f.parent,'project');await fs.mkdir(destination);await fs.writeFile(path.join(destination,'keep'),'preserve');await assert.rejects(f.clone({repositoryUrl:f.repository.html_url,parentPath:f.parent}),/already exists/);assert.equal(await fs.readFile(path.join(destination,'keep'),'utf8'),'preserve');assert.equal(f.calls.length,0);
 if(process.platform!=='win32'){await fs.rm(destination,{recursive:true});await fs.symlink(f.source,destination);await assert.rejects(f.clone({repositoryUrl:f.repository.html_url,parentPath:f.parent}),/already exists/);assert.equal((await fs.lstat(destination)).isSymbolicLink(),true);}
});
test('invalid URL, relative path, parent symlink and parent inside a repository never dispatch',async t=>{
 const f=await fixture(t);
 for(const args of [{repositoryUrl:'https://github.com@evil.invalid/project',parentPath:f.parent},{repositoryUrl:remote,parentPath:'relative'},{repositoryUrl:remote,parentPath:f.source}])await assert.rejects(f.clone(args));
 if(process.platform!=='win32'){const linked=path.join(f.base,'linked');await fs.symlink(f.parent,linked);await assert.rejects(f.clone({repositoryUrl:remote,parentPath:linked}),/ordinary folder/);}
 assert.equal(f.calls.length,0);assert.equal(f.accessCalls,0);
});
test('URL rewrites and session drift during final asynchronous preparation prevent child dispatch',async t=>{
 for(const mode of ['rewrite','session']) {
  const f=await fixture(t);f.localHook=async(_,args)=>{if(args[0]==='config'){if(mode==='rewrite')return 'url.https://evil.invalid/.insteadof';f.active=false;throw Object.assign(Error('no config'),{code:1});}};
  await assert.rejects(f.clone({repositoryUrl:remote,parentPath:f.parent}),error=>error.code==='clone-incomplete'&&!error.message.includes(token));assert.equal(f.calls.length,0);assert.deepEqual(await fs.readdir(path.join(f.parent,'project')),[]);
 }
});
test('transport failure preserves partial project and redacts child error/output',async t=>{
 const f=await fixture(t);f.spawnHook=async(_,args)=>{await fs.writeFile(path.join(args.at(-1),'partial'),'local data');throw Object.assign(Error(token),{stderr:'Authorization '+token});};
 await assert.rejects(f.clone({repositoryUrl:remote,parentPath:f.parent}),error=>error.code==='clone-incomplete'&&error.destinationPath===path.join(f.parent,'project')&&!error.message.includes(token));assert.equal(await fs.readFile(path.join(f.parent,'project','partial'),'utf8'),'local data');assert.equal(f.calls[0].options.env.GIT_CONFIG_COUNT,undefined);
});
test('cancellation before start has no side effects; cancellation during dispatch preserves partial destination',async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();await assert.rejects(f.clone({repositoryUrl:remote,parentPath:f.parent,signal:controller.signal}),error=>error.code==='cancelled');assert.equal(f.accessCalls,0);assert.deepEqual(await fs.readdir(f.parent),[]);
 const next=new AbortController();f.spawnHook=async(_,__,options)=>{assert.equal(options.signal,next.signal);next.abort();throw Error('aborted '+token);};await assert.rejects(f.clone({repositoryUrl:remote,parentPath:f.parent,signal:next.signal}),error=>error.code==='cancelled'&&!error.message.includes(token));assert.ok((await fs.stat(path.join(f.parent,'project'))).isDirectory());
});
test('a successful process without a real repository is never reported as a successful clone',async t=>{
 const f=await fixture(t);f.spawnHook=async()=>({stdout:token});await assert.rejects(f.clone({repositoryUrl:remote,parentPath:f.parent}),error=>error.code==='clone-incomplete'&&!error.message.includes(token));
});
test('repository/installation changes after clone preserve files and stop opening',async t=>{
 const f=await fixture(t);f.accessHook=async(_,__,count)=>{if(count===2)throw Error('Installation revoked');};await assert.rejects(f.clone({repositoryUrl:remote,parentPath:f.parent}),error=>error.code==='clone-incomplete');assert.equal(await fs.readFile(path.join(f.parent,'project','Main.java'),'utf8'),'class Main {}');
});
