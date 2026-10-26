import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {getJamProviderResponse,postJamActionResponse} from '../lib/jams-http.mjs';
import {authorizeJamRequest} from '../lib/jams-access.mjs';
import pilot from '../../jams/pilot.json' with {type:'json'};

const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
let serial=600;
function fixture(id=12) {
  let now=1_800_000_000_000;
  const installationId=String(++serial),calls=[],logs=[];
  const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_APP_ID:'321',ZERO_JAMS_INSTALLATION_ID:installationId,
    ZERO_JAMS_PRIVATE_KEY:key,ZERO_JAMS_MAINTAINER_IDS:'12',ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
    ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),ZERO_HUB_GITHUB_SESSION_SECRET:randomBytes(32).toString('base64url')};
  const config=hubConfig(env),{session,cookie}=newSession('ghu_'+'x'.repeat(24),{id,login:'tester'},28800,config,now);
  const f={env,calls,logs,session,cookie,get now(){return now;},set now(value){now=value;},failQuota:false,currentId:id};
  f.fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method||'GET'});
    if(url.endsWith('/user'))return Response.json({id:f.currentId,login:'tester'});
    if(url.endsWith('/app/installations/'+installationId))return Response.json({id:Number(installationId),app_id:321,account:{login:'codepetca'},permissions:{contents:'write'},suspended_at:null});
    if(url.endsWith('/access_tokens'))return Response.json({token:'ghs_'+'z'.repeat(30),expires_at:new Date(now+3600000).toISOString(),permissions:{contents:'write',metadata:'read'},repositories:[{full_name:'codepetca/zero'}]});
    if(url.endsWith('/rate_limit')) {
      const headers={'x-ratelimit-limit':'5000','x-ratelimit-remaining':f.failQuota?'0':'4950','x-ratelimit-used':f.failQuota?'5000':'50','x-ratelimit-reset':String(Math.floor(now/1000)+3600),'x-ratelimit-resource':'core',...(f.failQuota?{'Retry-After':'120'}:{})};
      return Response.json({resources:{core:{limit:5000,remaining:f.failQuota?0:4950}}},{status:f.failQuota?429:200,headers});
    }
    throw Error('Unexpected provider request '+url);
  };
  f.options=()=>({env,now:()=>now,fetchImpl:f.fetchImpl,providerEmit:value=>logs.push(value)});
  f.request=(authenticated=true)=>new Request(config.origin+'/api/jams/provider',{headers:authenticated?{Cookie:cookie.split(';')[0]}:{}});
  return f;
}

test('provider diagnostics require configured maintainer session before any provider work',async()=>{
  const f=fixture();
  assert.equal((await getJamProviderResponse(f.request(),{...f.options(),env:{}})).status,503);
  assert.equal((await getJamProviderResponse(f.request(false),f.options())).status,401);
  const student=fixture(33);assert.equal((await getJamProviderResponse(student.request(),student.options())).status,403);
  assert.equal(f.calls.length+student.calls.length,0);
  f.currentId=999;assert.equal((await getJamProviderResponse(f.request(),f.options())).status,401);
  assert.deepEqual(f.calls.map(c=>c.url),['https://api.github.com/user']);
});

test('maintainer diagnostics use actual installation headers, bounded refresh and no secret fields',async()=>{
  const f=fixture();const response=await getJamProviderResponse(f.request(),f.options());
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const result=await response.json();assert.equal(result.provider.scope,'process');
  assert.equal(result.provider.installation.quota.scope,'installation');
  assert.equal(result.provider.installation.quota.remaining,4950);
  assert.equal(result.provider.installation.quota.limit,5000);
  assert.equal(result.provider.installation.quota.stale,false);
  assert.equal(result.acceptedIntentPacing,null,'local development does not claim pilot pacing');
  assert.equal(f.calls.length,4);assert.match(f.calls.at(-1).url,/rate_limit$/);
  await getJamProviderResponse(f.request(),f.options());assert.equal(f.calls.length,5,'recent observation needs only current identity check');
  f.now+=31_000;await getJamProviderResponse(f.request(),f.options());assert.equal(f.calls.length,7,'one fresh quota probe; warm token reused');
  const text=JSON.stringify([result,f.logs]);
  for(const secret of ['BEGIN PRIVATE','ghs_','ghu_','csrf','Authorization'])assert.ok(!text.includes(secret));
  assert.equal(f.logs.length,3);assert.ok(f.logs.every(log=>log.route==='provider'));
});

test('current provider throttle reaches HTTP Retry-After and prevents later registry dispatch',async()=>{
  const f=fixture();f.failQuota=true;
  const first=await getJamProviderResponse(f.request(),f.options());assert.equal(first.status,503);
  assert.equal(first.headers.get('Retry-After'),'3600');
  const body=await first.json();assert.equal(body.retryAfterSeconds,3600);assert.equal(f.calls.length,4);
  const request=new Request(hubConfig(f.env).origin+'/api/jams/jam-101/actions',{method:'POST',headers:{
    Origin:hubConfig(f.env).origin,Cookie:f.cookie.split(';')[0],'X-Hub-CSRF':f.session.csrf,'Content-Type':'application/json'},
    body:JSON.stringify({operationId:'throttled-join-001',action:'join',revision:'a'.repeat(64)})});
  const next=await postJamActionResponse(request,'jam-101',f.options());assert.equal(next.status,503);
  assert.equal(next.headers.get('Retry-After'),'3600');
  assert.equal(f.calls.length,5,'participant identity is checked but no registry request dispatches');
});

test('actual new provider route preserves production and invitation guards before dispatch',async()=>{
  const source=await readFile(new URL('../app/api/jams/provider/route.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const base={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:pilot.projectId,VERCEL_GIT_COMMIT_REF:pilot.branch,
    VERCEL_BRANCH_URL:new URL(pilot.origin).hostname,ZERO_JAMS_PILOT_ENABLED:'1',ZERO_JAMS_ENABLED:'1',ZERO_HUB_ORIGIN:pilot.origin,
    ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),ZERO_HUB_GITHUB_SESSION_SECRET:'b'.repeat(64)};
  for(const [name,id,patch]of [['production',pilot.maintainerIds[0],{VERCEL_ENV:'production'}],['anonymous',null,{}],['uninvited','999',{}],['invited',pilot.maintainerIds[0],{}]])for(const method of ['GET','POST']) {
    const env={...base,...patch},headers={};
    if(id)headers.Cookie=newSession('ghu_'+'x'.repeat(24),{id:Number(id),login:'tester'},28800,hubConfig(env),1_800_000_000_000).cookie.split(';')[0];
    let dispatched=0;const module={exports:{}};
    vm.runInNewContext(compiled,{module,exports:module.exports,Response,require:name=>name.includes('jams-access')?{authorizeJamRequest:request=>authorizeJamRequest(request,{env,pilot,now:1_800_000_000_000})}:{getJamProviderResponse:()=>{dispatched++;return Response.json({test:true});}}});
    const response=await module.exports[method](new Request(pilot.origin+'/api/jams/provider',{method,headers}));
    assert.equal(response.status,name==='production'?404:name==='anonymous'?401:name==='uninvited'?403:method==='GET'?200:405);
    assert.equal(dispatched,name==='invited'&&method==='GET'?1:0);
  }
});

test('missing quota headers stay unknown and successful diagnostic probes are bounded',async()=>{
  const f=fixture(),original=f.fetchImpl;
  f.fetchImpl=async(url,options)=>url.endsWith('/rate_limit')?(f.calls.push({url,method:'GET'}),Response.json({resources:{core:{limit:5000}}})):original(url,options);
  const first=await getJamProviderResponse(f.request(),f.options());
  assert.equal(first.status,200);const body=await first.json();
  assert.equal(body.provider.installation.quota.remaining,null);assert.equal(body.provider.installation.quota.stale,true);
  await getJamProviderResponse(f.request(),f.options());
  assert.equal(f.calls.filter(call=>call.url.endsWith('/rate_limit')).length,1);
});

test('pilot runtime enables shared admission and bounds conflicts without new registry files',async t=>{
  const {createJamRuntime,jamServiceConfig}=await import('../lib/jams-runtime.mjs');
  const {createJamProviderContext}=await import('../../jams/provider-monitor.mjs');
  const {atomicGitHttpFixture}=await import('../../jams/test/git-http-fixture.mjs');
  const {fixture:sourceFixture,approved}=await import('../../jams/test/fixtures.mjs');
  const memory=sourceFixture(),revision=await approved(memory),git=await atomicGitHttpFixture(t);
  git.seed('jam-101',memory.store.records.get('jam-101').state);await git.store.migrate();
  const f=fixture();f.now=Date.parse('2030-01-02T12:01:01Z');
  const env={...f.env,NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:pilot.projectId,
    VERCEL_GIT_COMMIT_REF:pilot.branch,VERCEL_BRANCH_URL:new URL(pilot.origin).hostname,ZERO_JAMS_PILOT_ENABLED:'1',
    ZERO_HUB_ORIGIN:pilot.origin,ZERO_JAMS_MAINTAINER_IDS:pilot.maintainerIds.join(',')};
  const raw=f.fetchImpl;
  const fetchImpl=async(url,options)=>{
    if(url.includes('/repos/codepetca/zero/')){
      assert.equal(options.headers.Authorization,'Bearer '+'ghs_'+'z'.repeat(30));
      return git.fetchImpl(url,{...options,headers:{...options.headers,Authorization:'Bearer atomic-http-fixture-only-token'}});
    }
    const response=await raw(url,options);
    if(url.endsWith('/app/installations/'+env.ZERO_JAMS_INSTALLATION_ID))return Response.json({...await response.json(),repository_selection:'selected',permissions:{contents:'write',metadata:'read'}});
    return response;
  };
  const states=new Map(),make=()=>createJamRuntime({env,fetchImpl,now:()=>f.now,providerContext:createJamProviderContext(jamServiceConfig(env),{fetchImpl,now:()=>f.now,states,writeIntervalMs:0,emit:()=>{}})});
  const input={id:'jam-101',actor:{id:pilot.creatorId,login:'stewchan'},operationId:'runtime-paced-join',action:'join',revision};
  assert.equal((await(await make()).mutate(input)).status,'joined');
  assert.equal((await(await make()).mutate({...input,actor:{id:pilot.maintainerIds[0],login:'armorup'},operationId:'runtime-second-join'})).status,'joined');
  const count=git.commits.length;
  await assert.rejects((await make()).mutate({id:input.id,actor:input.actor,action:'leave',operationId:'runtime-paced-leave'}),e=>e.status===429&&e.retryAfterSeconds===60);
  assert.equal((await(await make()).mutate(input)).status,'joined');assert.equal(git.commits.length,count);
  f.now+=61_000;let attempted=0;git.beforeRef=()=>{attempted++;git.replaceFile('README.md','external sibling '+attempted);};
  await assert.rejects((await make()).mutate({id:input.id,actor:input.actor,action:'leave',operationId:'runtime-conflict-leave'}),{status:409});
  assert.equal(attempted,2,'pilot retries only once after an actual ref conflict');
  assert.equal(git.state().registrations[pilot.creatorId].status,'joined');
  assert.deepEqual([...git.files.keys()].sort(),['README.md','jams','website/vercel.json','zero-jams-v2/events/jam-101.json','zero-jams-v2/settlements.json'].sort());
});
