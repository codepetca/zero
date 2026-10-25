import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {generateKeyPairSync} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import prepared from '../../jams/pilot.json' with {type:'json'};
import app from '../../extension/src/github-app/config.json' with {type:'json'};
import {jamDeploymentPolicy} from '../lib/jams-pilot-policy.mjs';
import {authorizeJamRequest} from '../lib/jams-access.mjs';
import {hubConfig,newSession,readSession} from '../lib/hub-github-auth.mjs';
import {jamServiceConfig,jamInstallationToken} from '../lib/jams-runtime.mjs';

const origin='https://pilot-zero.vercel.app',now=1_800_000_000_000;
const pilot={...prepared,status:'enabled',origin};
const env={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:prepared.projectId,VERCEL_GIT_COMMIT_REF:prepared.branch,VERCEL_BRANCH_URL:'pilot-zero.vercel.app',ZERO_JAMS_PILOT_ENABLED:'1',ZERO_HUB_ORIGIN:origin,ZERO_HUB_GITHUB_CLIENT_ID:app.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'s'.repeat(32),ZERO_HUB_GITHUB_SESSION_SECRET:'a'.repeat(64)};
const cookie=(id='35233916',options=env)=>newSession('ghu_'+'x'.repeat(30),{id:Number(id),login:'tester'},28800,hubConfig(options),now).cookie.split(';')[0];
const request=(id,method='GET',url=origin+'/hub/jams')=>new Request(url,{method,headers:id?{Cookie:cookie(id)}:{}});
const access=(req,p=pilot,e=env)=>authorizeJamRequest(req,{env:e,pilot:p,now});
const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const routes=[['api/jams/route.ts','GET'],['api/jams/[id]/route.ts','GET'],['api/jams/[id]/actions/route.ts','POST'],['api/jams/proposals/route.ts','POST'],['api/jams/template/route.ts','GET'],['api/jams/template/route.ts','POST'],['api/jams/template/preview/route.ts','POST'],['api/jams/template/preview/route.ts','GET'],['hub/jams/[id]/panel/route.ts','GET']];
function load(source,imports) {const module={exports:{}};vm.runInNewContext(compile(source),{module,exports:module.exports,require:name=>Object.hasOwn(imports,name)?imports[name]:require(name),Request,Response,URL});return module.exports;}

test('checked-in pilot stays disabled; production cannot be unlocked by valid flags, project, origin or policy',()=>{
  assert.equal(prepared.status,'prepared');assert.equal(prepared.origin,null);assert.equal(jamDeploymentPolicy(env),null);
  assert.equal(jamDeploymentPolicy(env,pilot).mode,'pilot');
  for(const patch of [{VERCEL_ENV:'production'},{VERCEL_ENV:undefined},{VERCEL_ENV:'development'},{NODE_ENV:'development'},{VERCEL:'0'},{VERCEL_PROJECT_ID:'another'},{VERCEL_GIT_COMMIT_REF:'main'},{ZERO_JAMS_PILOT_ENABLED:'0'},{ZERO_HUB_ORIGIN:'https://zero.codepet.ca'},{VERCEL_BRANCH_URL:'other.vercel.app'}])assert.equal(jamDeploymentPolicy({...env,...patch},pilot),null,JSON.stringify(patch));
  for(const patch of [{status:'prepared'},{origin:'https://zero.codepet.ca'},{origin:origin+'/'},{inviteIds:[]},{inviteIds:['35233916','4050555','4050555']},{maintainerIds:['35233916']},{registryBranch:'main'},{limits:{...pilot.limits,events:3}}])assert.equal(jamDeploymentPolicy(env,{...pilot,...patch}),null);
});
test('sealed invitations reject unknown/tampered/expired/wrong-origin identities and invitation removal is immediate',()=>{
  assert.equal(access(request('35233916')),null);assert.equal(access(request('4050555')),null);
  assert.equal(access(request()).status,401);assert.equal(access(request('99')).status,403);
  assert.equal(access(new Request(origin+'/hub/jams',{headers:{Cookie:'zero_hub_gh_session=forged'}})).status,401);
  assert.equal(authorizeJamRequest(request('35233916'),{env,pilot,now:now+28800000}).status,401);
  assert.equal(access(request('35233916','GET','https://other.vercel.app/hub/jams')).status,404);
  const expanded={...pilot,inviteIds:[...pilot.inviteIds,'99']};assert.equal(access(request('99'),expanded),null);assert.equal(access(request('99'),pilot).status,403);
  const sameKeyOtherOrigin={...env,ZERO_HUB_ORIGIN:'https://other.vercel.app'};
  assert.equal(readSession(new Request(origin,{headers:{Cookie:cookie('35233916',sameKeyOtherOrigin)}}),hubConfig(env),now),null);
  const productionAuth={...env,VERCEL_ENV:'production',ZERO_HUB_ORIGIN:'https://zero.codepet.ca'};
  assert.equal(access(new Request(origin,{headers:{Cookie:cookie('35233916',productionAuth)}})).status,401);
});
test('all API/template/panel methods gate production and uninvited callers before services, files and params',async()=>{
  for(const [path,method]of routes)for(const [who,e,expected]of [[undefined,env,401],['99',env,403],['35233916',{...env,VERCEL_ENV:'production'},404]]){
    let work=0;const blocked=()=>{work++;throw Error('Unauthorized dependency invoked');};
    const route=load(await readFile(new URL('../app/'+path,import.meta.url),'utf8'),{
      '@/lib/jams-access.mjs':{authorizeJamRequest:req=>access(req,pilot,e)},
      '@/lib/jams-pilot-policy.mjs':{jamOfficialOrigin:()=>origin},
      '@/lib/jams-http.mjs':{getJamsResponse:blocked,getJamResponse:blocked,postJamActionResponse:blocked,postJamProposalResponse:blocked},
      '@/lib/jam-template.mjs':{createJamTemplateZip:blocked},'@/lib/jam-template-http.mjs':{preparedJamResponse:blocked},
    });
    const response=await route[method](request(who,method,origin+'/hidden'),{get params(){throw Error('Unauthorized params resolved');}});
    assert.equal(response.status,expected,`${method} ${path}`);assert.equal(work,0);
    if(path.includes('/panel/')&&expected===401){const html=await response.text();assert.match(html,/Open official pilot page/);assert.doesNotMatch(html,/tester|35233916|csrf|ghu_|participants/);}
  }
});
test('server page layout bootstraps neutral sign-in without event children or data for missing/uninvited sessions',async()=>{
  const source=await readFile(new URL('../app/hub/jams/layout.tsx',import.meta.url),'utf8');
  for(const who of [undefined,'99','35233916']){
    const req=request(who);
    const layout=load(source,{'@/lib/jams-pilot-policy.mjs':{jamDeploymentPolicy:()=>jamDeploymentPolicy(env,pilot)},'@/lib/jams-access.mjs':{authorizeJamRequest:r=>access(r)},'next/headers':{headers:async()=>new Headers({host:new URL(origin).host,...(who?{Cookie:cookie(who)}:{})})},'next/navigation':{notFound:()=>{throw Error('not-found');}},'@/components/JamShell':{JamShell:({children})=>React.createElement('main',null,children)},'@/components/HubGitHub':{HubAccount:()=>React.createElement('button',null,'GitHub sign-in')}});
    const node=await layout.default({children:'PRIVATE EVENT CHILD'});
    if(who==='35233916')assert.equal(node,'PRIVATE EVENT CHILD');
    else {const html=renderToStaticMarkup(node);assert.match(html,/Invited ZeroJams pilot/);assert.doesNotMatch(html,/PRIVATE EVENT CHILD/);}
  }
});
test('pilot runtime fixes branch, approver and caps; broad desktop writer is rejected before token minting',async()=>{
  const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
  const runtimeEnv={...env,ZERO_JAMS_ENABLED:'1',ZERO_JAMS_APP_ID:'123',ZERO_JAMS_INSTALLATION_ID:'456',ZERO_JAMS_PRIVATE_KEY:key,ZERO_JAMS_MAINTAINER_IDS:'4050555'};
  const config=jamServiceConfig(runtimeEnv,pilot);assert.equal(config.registryBranch,'zero-jams-pilot-registry');assert.equal(config.limits.events,2);assert.deepEqual(config.maintainerIds,['4050555']);
  for(const patch of [{VERCEL_ENV:'production'},{ZERO_JAMS_APP_ID:String(app.appId)},{ZERO_JAMS_MAINTAINER_IDS:'35233916'}])assert.equal(jamServiceConfig({...runtimeEnv,...patch},pilot),null);
  let calls=0;
  await assert.rejects(jamInstallationToken(config,{now,cache:new Map(),fetchImpl:async()=>{calls++;return Response.json({id:456,app_id:123,account:{login:'codepetca'},permissions:{contents:'write',metadata:'read',administration:'write'}});}}),/unavailable/);
  assert.equal(calls,1,'Broad installation is rejected before issuing a token');
});

test('invited API handlers reach only their normal dependencies, and template download receives the trusted pilot origin',async()=>{
  for(const [path,method]of routes.filter(([path,method])=>!path.includes('/panel/')&&!(path.includes('/preview/')&&method==='GET'))){
    let work=0;const reply=()=>{work++;return Response.json({ok:true});};
    const route=load(await readFile(new URL('../app/'+path,import.meta.url),'utf8'),{
      '@/lib/jams-access.mjs':{authorizeJamRequest:req=>access(req)},
      '@/lib/jams-pilot-policy.mjs':{jamOfficialOrigin:()=>origin},
      '@/lib/jams-http.mjs':{getJamsResponse:reply,getJamResponse:reply,postJamActionResponse:reply,postJamProposalResponse:reply},
      '@/lib/jam-template.mjs':{createJamTemplateZip:async(type,manifest,options)=>{assert.equal(options.officialOrigin,origin);work++;return new Uint8Array([1,2,3]);}},
      '@/lib/jam-template-http.mjs':{preparedJamResponse:(req,options)=>{assert.equal(options.officialOrigin,origin);return reply();}},
    });
    const response=await route[method](request('35233916',method,origin+'/hidden'),{params:Promise.resolve({id:'jam-101'})});
    assert.equal(response.status,200,path);assert.equal(work,1);
  }
});
