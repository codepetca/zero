import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotPreflight,main,target} from './zerojams-pilot-preflight.mjs';
const sentinel = 'SENTINEL_PRIVATE_VALUE_DO_NOT_RETURN';
const policy = () => ({schema:1,status:'enabled',origin:'https://pilot-test.vercel.app',projectId:target.projectId,
  branch:target.branch,registryBranch:target.registryBranch,inviteIds:['35233916','4050555'],
  maintainerIds:['4050555'],creatorId:'35233916',
  limits:{events:2,participants:5,operations:200,safetyOperations:7,proposals:10,entryHistory:5}});
const environment = () => ({NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:target.projectId,
  VERCEL_GIT_COMMIT_REF:target.branch,VERCEL_BRANCH_URL:'pilot-test.vercel.app',
  ZERO_HUB_ORIGIN:'https://pilot-test.vercel.app',ZERO_HUB_GITHUB_CLIENT_ID:'public-client',
  ZERO_HUB_GITHUB_CLIENT_SECRET:sentinel,ZERO_HUB_GITHUB_SESSION_SECRET:sentinel,
  ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PILOT_ENABLED:'1',ZERO_JAMS_MAINTAINER_IDS:'4050555',
  ZERO_JAMS_APP_ID:'999999',ZERO_JAMS_INSTALLATION_ID:'12345',ZERO_JAMS_PRIVATE_KEY:sentinel,
  UNRELATED_SECRET_NAME:sentinel});
function noSecrets(result) {
  const json = JSON.stringify(result);
  assert.ok(!json.includes(sentinel)); assert.ok(!json.includes('UNRELATED_SECRET_NAME'));
}
test('offline preparation never invokes credentials/tools or mistakes presence for acceptance',async () => {
  let calls = 0;
  const result = await pilotPreflight({env:environment(),pilot:policy(),runner:async () => { calls++; }});
  assert.equal(calls,0); assert.equal(result.localConfigurationReady,true); assert.equal(result.ready,false);
  assert.ok(result.manualEvidenceRequired.length); noSecrets(result);
  const prepared = await pilotPreflight({env:{},pilot:{...policy(),status:'prepared',origin:null}});
  assert.equal(prepared.localConfigurationReady,false);
  assert.equal(prepared.environment.ZERO_JAMS_PRIVATE_KEY,'absent');
});
test('production, wrong branch/project/origin, desktop writer and changed invitations fail closed',async () => {
  for (const change of [{NODE_ENV:'development'},{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'other'},
    {VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_BRANCH_URL:'other.example.test'},
    {ZERO_HUB_ORIGIN:'https://other.example.test'},{ZERO_JAMS_APP_ID:target.desktopAppId},
    {ZERO_JAMS_PILOT_ENABLED:'0'},{ZERO_JAMS_MAINTAINER_IDS:'35233916'},
    {ZERO_JAMS_PRIVATE_KEY:42}]) {
    const result = await pilotPreflight({env:{...environment(),...change},pilot:policy()});
    assert.equal(result.localConfigurationReady,false); noSecrets(result);
  }
  for (const change of [{origin:'https://pilot-test.vercel.app/path'},
    {inviteIds:['35233916','4050555','999']},{limits:{events:999}},{status:'prepared'}]) {
    assert.equal((await pilotPreflight({env:environment(),pilot:{...policy(),...change}})).localConfigurationReady,false);
  }
});
test('audit denial retains unknown, emits no CLI error output and never switches credentials',async () => {
  const calls = [];
  const result = await pilotPreflight({env:environment(),pilot:policy(),audit:true,
    writerAppSlug:'minimal-writer',runner:async (cmd,args) => {
      calls.push([cmd,args]); throw new Error(`403 ${sentinel} UNRELATED_SECRET_NAME`);
    }});
  assert.equal(calls.length,8); noSecrets(result);
  assert.ok(Object.values(result.audit).every(item => item.status === 'unknown'));
  assert.ok(calls.every(([cmd,args]) => cmd === 'gh' ? args[0] === 'api' && args.at(-1) === 'GET' :
    args[0] === 'env' || args.includes('GET')));
  assert.ok(!JSON.stringify(calls).includes(sentinel));
});
test('audit checks selected minimal writer and strips secret values and unrelated env names',async () => {
  const calls = [];
  const runner = async (cmd,args) => {
    calls.push([cmd,args]);
    if (cmd === 'vercel' && args[0] === 'env') return {envs:[
      {key:'ZERO_HUB_GITHUB_CLIENT_SECRET',value:sentinel,target:['production']},
      {key:'ZERO_JAMS_PRIVATE_KEY',value:sentinel,target:['preview'],gitBranch:target.branch},
      {key:'UNRELATED_SECRET_NAME',value:sentinel,target:['preview']}]};
    if (cmd === 'vercel') return {id:target.projectId,accountId:target.teamId,rootDirectory:'website',
      nodeVersion:'22.x',link:{productionBranch:'main'},ssoProtection:{deploymentType:'all_except_custom_domains'},secret:sentinel};
    if (args[1] === '/apps/codepet-zero') return {id:Number(target.desktopAppId),secret:sentinel};
    if (args[1] === '/apps/minimal-writer') return {id:999999,permissions:{contents:'write',metadata:'read'},secret:sentinel};
    if (args[1] === '/user/installations') return {installations:[{id:12345,app_id:999999,
      account:{login:'codepetca'},repository_selection:'selected',permissions:{contents:'write',metadata:'read'}}]};
    if (args[1].includes('/contents/jams?')) return [];
    if (args[1].includes('/git/ref/')) return {ref:`refs/heads/${target.registryBranch}`,object:{sha:'a'.repeat(40)}};
    return {id:1409613370,full_name:target.repository,private:false,token:sentinel};
  };
  const result = await pilotPreflight({env:environment(),pilot:policy(),audit:true,
    writerAppSlug:'minimal-writer',runner,projectDir:'/existing/linked'});
  assert.equal(result.audit.writerApp.status,'pass'); assert.equal(result.audit.writerInstallation.status,'pass');
  assert.equal(result.audit.vercelProject.status,'pass');
  assert.equal(result.audit.vercelEnvironment.variables.ZERO_HUB_GITHUB_CLIENT_SECRET.production,true);
  assert.equal(result.audit.vercelEnvironment.variables.ZERO_HUB_GITHUB_CLIENT_SECRET.preview,false);
  assert.equal(result.audit.vercelEnvironment.variables.ZERO_JAMS_PRIVATE_KEY.pilotBranch,true);
  assert.equal(result.ready,false); noSecrets(result);
  assert.ok(calls.some(([,args]) => args.includes('/existing/linked')));
  const broad = await pilotPreflight({env:environment(),pilot:policy(),audit:true,writerAppSlug:'minimal-writer',
    runner:async (cmd,args,opts) => args[1] === '/apps/minimal-writer' ?
      {id:999999,permissions:{contents:'write',metadata:'read',workflows:'write'}} : runner(cmd,args,opts)});
  assert.equal(broad.audit.writerApp.status,'blocked');
});
test('CLI exit codes, help and invalid arguments do not print user-controlled diagnostics',async () => {
  let output = '';
  const deps = {env:environment(),read:async () => JSON.stringify({...policy(),status:'prepared',origin:null}),
    write:value => { output += value; },runner:async () => { throw new Error(sentinel); }};
  assert.equal(await main([],deps),1); noSecrets(output); assert.equal(JSON.parse(output).ready,false);
  output=''; assert.equal(await main(['--help'],deps),0); assert.match(output,/--audit/);
  for (const args of [['--wat',sentinel],['--project-dir'],['--audit','--audit'],['--writer-app-slug','../bad']]) {
    output=''; assert.equal(await main(args,deps),2); noSecrets(output);
  }
  output=''; assert.equal(await main([],{...deps,read:async () => { throw new Error(sentinel); }}),2);
  noSecrets(output);
});

test('registry audit rejects source checkout namespace and treats 404 as empty only with verified branch',async () => {
  const valid = {type:'file',name:'jam-1.json',path:'jams/jam-1.json',sha:'a'.repeat(40)};
  async function auditNamespace(namespace, branchKnown = true) {
    return (await pilotPreflight({env:environment(),pilot:policy(),audit:true,
      runner:async (_cmd,args) => {
        if (args[1]?.includes('/contents/jams?')) return namespace;
        if (args[1]?.includes('/git/ref/')) {
          if (!branchKnown) throw new Error(`404 or 403 diagnostics ${sentinel}`);
          return {ref:`refs/heads/${target.registryBranch}`,object:{sha:'a'.repeat(40)}};
        }
        throw new Error(sentinel);
      }})).audit;
  }
  for (const namespace of [[{...valid,name:'schema.mjs',path:'jams/schema.mjs'}],
    [{...valid,name:'pilot.json',path:'jams/pilot.json'}], [{...valid,path:'other/jam-1.json'}],
    [{...valid,type:'dir'}],[valid,valid], [1,2,3].map(n => ({...valid,name:`jam-${n}.json`,path:`jams/jam-${n}.json`}))]) {
    const audit = await auditNamespace(namespace);
    assert.equal(audit.registryNamespace.status,'blocked'); noSecrets(audit);
  }
  assert.equal((await auditNamespace([valid])).registryNamespace.status,'pass');
  const empty = await auditNamespace({httpStatus:404});
  assert.equal(empty.registryNamespace.status,'pass'); assert.equal(empty.registryNamespace.empty,true);
  const unknown = await auditNamespace({httpStatus:404},false);
  assert.equal(unknown.registryBranch.status,'unknown');
  assert.equal(unknown.registryNamespace.status,'unknown'); noSecrets(unknown);
  // A normal successful object saying 'Not Found' is not a directory or HTTP proof.
  assert.equal((await auditNamespace({message:'Not Found'})).registryNamespace.status,'unknown');
});
