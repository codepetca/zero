'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {createDesktopAccounts: createAccounts} = require('../src/desktop.cjs');
const createDesktopAccounts = options => createAccounts({withLock:async callback=>callback(),...options});
const {createWorkOS} = require('../src/workos.cjs');
const {resolveWorkOSFirstUseConfiguration, validateWorkOSDistribution} = require('../src/workos-configuration');
const {createWorkOSFirstUse} = require('../src/workos-first-use');

function secrets() {
  const values = new Map();
  return {values, get:async k=>values.get(k), store:async(k,v)=>values.set(k,v), delete:async k=>values.delete(k)};
}
function editor(choice = 'Continue with GitHub') {
  let prompts=0, warnings=0;
  return {get prompts(){return prompts;}, get warnings(){return warnings;}, ProgressLocation:{Notification:1},
    window:{showInformationMessage:async()=>{prompts++;return choice;}, showWarningMessage:async()=>{warnings++;},
      withProgress:async(_options, callback)=>callback({}, {isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})})}};
}

test('first-use prompt is shared, can be cancelled and retried', async () => {
  let reads=0, signed=0;
  const api=editor(undefined);
  api.window.showInformationMessage=async()=>undefined;
  const gate=createWorkOSFirstUse({vscode:api,context:{},required:true,clientId:'client_test',accounts:{read:async()=>{reads++;return null;},signIn:async()=>{signed++;}}});
  assert.deepEqual(await Promise.all([gate.ensure(),gate.ensure()]),[false,false]);
  assert.equal(reads,1);assert.equal(signed,0);
  api.window.showInformationMessage=async()=> 'Continue with GitHub';
  assert.equal(await gate.ensure(),true);assert.equal(signed,1);
  gate.dispose();
});

test('a failed connection closes progress and can retry while its warning is open', async () => {
  const api=editor();
  const withProgress=api.window.withProgress;
  let progressOpen=false, progressAtWarning, attempts=0, dismiss;
  const warning=new Promise(resolve=>{dismiss=resolve;});
  api.window.withProgress=async (...args)=>{
    progressOpen=true;
    try {return await withProgress(...args);}
    finally {progressOpen=false;}
  };
  api.window.showWarningMessage=()=>{
    progressAtWarning=progressOpen;
    return warning;
  };
  const gate=createWorkOSFirstUse({vscode:api,context:{},required:true,clientId:'client_test',
    accounts:{read:async()=>null,signIn:async()=>{if(++attempts===1) throw new Error('fixture');}}});
  try {
    assert.equal(await Promise.race([gate.ensure(),new Promise(resolve=>setImmediate(()=>resolve('still waiting')))]),false);
    assert.equal(progressAtWarning,false);
    assert.equal(await gate.ensure(),true);
    assert.equal(attempts,2);
  } finally {dismiss();gate.dispose();}
});

test('required distribution without environment signs in and works after offline restart', async () => {
  const configuration=resolveWorkOSFirstUseConfiguration({env:{},readDistribution:()=>({mode:'required',productionClientId:'client_test'})});
  const store=secrets();let exchanges=0;
  const workos=createWorkOS('client_test',async(_url,request)=>{
    if (_url === 'https://api.github.com/user') {assert.equal(request.headers.Authorization,'Bearer secret_github');return Response.json({id:42,type:'User'});}
    exchanges++;
    const body=JSON.parse(request.body);
    assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);
    return Response.json({authentication_method:'GitHubOAuth',user:{id:'user_same'},access_token:'secret_access',refresh_token:'secret_refresh',oauth_tokens:{access_token:'secret_github'}});
  });
  let challenge;
  const accounts=createDesktopAccounts({secrets:store,clientId:'client_test',workos,openBrowser:async url=>{
    const authorize=new URL(url);challenge=authorize.searchParams.get('code_challenge');
    // A reused AuthKit session can omit the GitHub token needed by the exchange.
    assert.equal(authorize.searchParams.get('max_age'),'0');
    const callback=new URL(authorize.searchParams.get('redirect_uri'));
    callback.searchParams.set('state',authorize.searchParams.get('state'));callback.searchParams.set('code','fixture');
    assert.equal((await fetch(callback)).status,200);return true;
  }});
  const first=createWorkOSFirstUse({vscode:editor(),context:{},...configuration,accounts});
  assert.equal(await first.ensure(),true);first.dispose();
  assert.equal(exchanges,1);
  assert.deepEqual(JSON.parse([...store.values.values()][0]),{version:1,clientId:'client_test',id:'user_same',githubId:'42'});
  assert.doesNotMatch([...store.values.values()][0],/secret|fixture/);
  const offline=createDesktopAccounts({secrets:store,clientId:'client_test'});
  const restartedEditor=editor();
  const restarted=createWorkOSFirstUse({vscode:restartedEditor,context:{},...configuration,accounts:offline});
  assert.equal(await restarted.ensure(),true);assert.equal(restartedEditor.prompts,0);assert.equal(exchanges,1);
  restarted.dispose();
});

test('optional distribution stays ungated and only source development honors staging environment', async () => {
  const env={ZERO_WORKOS_CLIENT_ID:'client_staging'};
  const optional=()=>({mode:'optional',productionClientId:null});
  const required=()=>({mode:'required',productionClientId:'client_production'});
  const api=editor();
  const gate=createWorkOSFirstUse({vscode:api,context:{},...resolveWorkOSFirstUseConfiguration({env,readDistribution:optional})});
  assert.equal(gate.enabled,false);assert.equal(await gate.ensure(),true);assert.equal(api.prompts,0);
  assert.deepEqual(resolveWorkOSFirstUseConfiguration({env,readDistribution:required}),{required:true,clientId:'client_production'});
  assert.deepEqual(resolveWorkOSFirstUseConfiguration({development:true,env,readDistribution:required}),{required:true,clientId:'client_staging'});
  assert.equal(resolveWorkOSFirstUseConfiguration({development:true,env:{},readDistribution:required}).required,false);
});

test('missing or invalid distribution fails closed before trying saved or staging credentials', async () => {
  const env={ZERO_WORKOS_CLIENT_ID:'client_staging'};
  const invalid=[null,{mode:'required',productionClientId:null},{mode:'required',productionClientId:'invalid'},
    {mode:'optional',productionClientId:'client_staging'},{mode:'requried',productionClientId:null},
    {mode:'required',productionClientId:'client_test',apiKey:'unexpected'}];
  for (const value of invalid) assert.throws(()=>validateWorkOSDistribution(value),/WorkOS distribution|workos-distribution\.json/);
  for (const readDistribution of [...invalid.map(value=>()=>value),()=>{throw new Error('missing');}]) {
    const api=editor();
    const configuration=resolveWorkOSFirstUseConfiguration({env,readDistribution});
    const gate=createWorkOSFirstUse({vscode:api,context:{},...configuration,accounts:{read:()=>assert.fail('Invalid policy must not read a receipt')}});
    assert.equal(gate.enabled,true);assert.equal(await gate.ensure(),false);
    assert.equal(api.prompts,0);assert.equal(api.warnings,1);
    gate.dispose();
  }
});

test('mismatched client cannot use saved record', async () => {
  const store=secrets();await store.store('zero.workos.local-account.v1',JSON.stringify({version:1,clientId:'client_old',id:'user_old'}));
  const accounts=createDesktopAccounts({secrets:store,clientId:'client_new'});
  assert.equal(await accounts.read(),null);
});

test('cancelled browser attempt does not save an account', async () => {
  const store=secrets();const controller=new AbortController();
  const workos=createWorkOS('client_test',async()=>{assert.fail('cancelled attempt must not exchange');});
  const accounts=createDesktopAccounts({secrets:store,clientId:'client_test',workos,openBrowser:async()=>{controller.abort();return true;}});
  await assert.rejects(accounts.signIn(controller.signal));
  assert.equal(store.values.size,0);
});

test('a fresh process can read the saved receipt without WorkOS', () => {
  const {spawnSync}=require('node:child_process');
  const code=`const {createDesktopAccounts}=require('./extension/src/desktop.cjs');
    const secrets={get:async()=>JSON.stringify({version:1,clientId:'client_test',id:'user_same'})};
    createDesktopAccounts({secrets,clientId:'client_test'}).read().then(value=>process.stdout.write(JSON.stringify(value)));`;
  const child=spawnSync(process.execPath,['-e',code],{cwd:require('node:path').resolve(__dirname,'../..'),encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  assert.deepEqual(JSON.parse(child.stdout),{id:'user_same'});
});

test('an exchange without explicit GitHub authentication never saves a connection', async () => {
  const store=secrets();
  for (const response of [{user:{id:'user_same'}}, {authentication_method:'GoogleOAuth',user:{id:'user_same'}}]) {
    const workos=createWorkOS('client_test',async()=>Response.json(response));
    const accounts=createDesktopAccounts({secrets:store,clientId:'client_test',workos,openBrowser:async url=>{
      const authorize=new URL(url);
      const callback=new URL(authorize.searchParams.get('redirect_uri'));
      callback.searchParams.set('state',authorize.searchParams.get('state'));
      callback.searchParams.set('code','fixture');
      assert.equal((await fetch(callback)).status,200);
      return true;
    }});
    await assert.rejects(accounts.signIn(),/did not return a GitHub sign-in/);
    assert.equal(store.values.size,0);
  }
});

test('old receipt permits offline local use but needs explicit upgrade for GitHub',async()=>{
 const store=secrets(),old=JSON.stringify({version:1,clientId:'client_test',id:'user_same'});
 await store.store('zero.workos.local-account.v1',old);
 let signIns=0;
 const saved=createDesktopAccounts({secrets:store,clientId:'client_test'});
 const accounts={read:()=>saved.read(),signIn:async()=>{signIns++;await store.store('zero.workos.local-account.v1',JSON.stringify({...JSON.parse(old),githubId:'42'}));}};
 const api=editor();const gate=createWorkOSFirstUse({vscode:api,context:{},required:true,clientId:'client_test',accounts});
 assert.equal(await gate.ensure(),true);assert.equal(api.prompts,0);
 await assert.rejects(gate.assertBinding('42'),/again to verify/);assert.equal(store.values.get('zero.workos.local-account.v1'),old);
 assert.equal(await gate.ensureBinding(),true);assert.equal(signIns,1);assert.equal(api.prompts,1);
 await gate.assertBinding('42');await assert.rejects(gate.assertBinding('99'),/does not match/);gate.dispose();
});

test('missing GitHub token or invalid personal identity never writes a receipt',async()=>{
 for(const payload of [undefined,{id:1,type:'Organization'},{id:0,type:'User'}]){
  const store=secrets();const workos=createWorkOS('client_test',async url=>url.includes('api.github.com')?Response.json(payload):Response.json({authentication_method:'GitHubOAuth',user:{id:'user_same'},...(payload===undefined?{}:{oauth_tokens:{access_token:'fixture_token'}})}));
  const accounts=createDesktopAccounts({secrets:store,clientId:'client_test',workos,openBrowser:async url=>{const callback=new URL(new URL(url).searchParams.get('redirect_uri'));callback.searchParams.set('state',new URL(url).searchParams.get('state'));callback.searchParams.set('code','fixture');await fetch(callback);return true;}});
  await assert.rejects(accounts.signIn());assert.equal(store.values.size,0);
 }
});

test('binding upgrade waits for an in-flight offline receipt check and then rechecks proof',async()=>{
 let release,firstRead=true,upgrades=0;const waiting=new Promise(resolve=>{release=resolve;});
 let receipt={id:'user_same'};
 const accounts={read:async()=>{if(firstRead){firstRead=false;await waiting;}return receipt;},signIn:async()=>{upgrades++;receipt={id:'user_same',githubId:'42'};}};
 const api=editor();const gate=createWorkOSFirstUse({vscode:api,context:{},required:true,clientId:'client_test',accounts});
 const local=gate.ensure(),upgrade=gate.ensureBinding();release();
 assert.equal(await local,true);assert.equal(await upgrade,true);assert.equal(upgrades,1);assert.equal(api.prompts,1);
 await gate.assertBinding('42');gate.dispose();
});

test('local use proceeds with a legacy receipt during a cancelled upgrade prompt',async()=>{
 let opened,resolveChoice;const shown=new Promise(resolve=>{opened=resolve;});
 const api=editor();api.window.showInformationMessage=async()=>{opened();return new Promise(resolve=>{resolveChoice=resolve;});};
 const accounts={read:async()=>({id:'user_same'}),signIn:async()=>assert.fail('cancelled upgrade must not sign in')};
 const gate=createWorkOSFirstUse({vscode:api,context:{},required:true,clientId:'client_test',accounts});
 const upgrade=gate.ensureBinding();await shown;
 assert.equal(await gate.ensure(),true);
 resolveChoice(undefined);assert.equal(await upgrade,false);
 assert.equal(await gate.ensure(),true);gate.dispose();
});

test('a cancelled initial first-use prompt does not cause a second upgrade prompt',async()=>{
 let opened,resolveChoice,prompts=0;const shown=new Promise(resolve=>{opened=resolve;});
 const api=editor();api.window.showInformationMessage=async()=>{prompts++;opened();return new Promise(resolve=>{resolveChoice=resolve;});};
 const gate=createWorkOSFirstUse({vscode:api,context:{},required:true,clientId:'client_test',accounts:{read:async()=>null,signIn:async()=>assert.fail('cancelled sign-in')}});
 const initial=gate.ensure();await shown;const upgrade=gate.ensureBinding();resolveChoice(undefined);
 assert.equal(await initial,false);assert.equal(await upgrade,false);assert.equal(prompts,1);gate.dispose();
});

test('a changed receipt baseline prevents both sign-in and sign-out overwriting it',async()=>{
 const store=secrets(),key='zero.workos.local-account.v1';
 const old=JSON.stringify({version:1,clientId:'client_test',id:'user_same'}),newer=JSON.stringify({version:1,clientId:'client_test',id:'user_newer'});
 await store.store(key,old);
 const workos={clientId:'client_test',begin(redirect){const state='a'.repeat(43),url=new URL('https://example.invalid');url.searchParams.set('redirect_uri',redirect);url.searchParams.set('state',state);return{url:url.href,state,verifier:'fixture'};},complete:async()=>({id:'user_same',githubId:'42'})};
 const accounts=createAccounts({secrets:store,clientId:'client_test',workos,withLock:async callback=>{await store.store(key,newer);return callback();},openBrowser:async url=>{const auth=new URL(url),callback=new URL(auth.searchParams.get('redirect_uri'));callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('code','fixture');await fetch(callback);return true;}});
 await assert.rejects(accounts.signIn(),/connection changed/);assert.equal(await store.get(key),newer);
 await store.store(key,old);
 await assert.rejects(accounts.signOut(),/connection changed/);assert.equal(await store.get(key),newer);
});
