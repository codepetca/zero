import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {rootCertificates} from 'node:tls';
import {readFile} from 'node:fs/promises';
import {createRequire,registerHooks} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createDefaultJamAuthorityManager} from '../lib/jams-default-authority.mjs';
import {hostedManifest} from '../../jams/test/fixtures.mjs';
import contracts from '../../extension/src/sharing/contracts.js';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};

const clone=value=>structuredClone(value);
function memoryAuthority(){
  let data={events:{},settlements:{schema:1,operations:{}}},version=0,tail=Promise.resolve();
  const issue=(doc,n)=>{const pinned=clone(doc);return {revision:'a'.repeat(24)+n.toString(16).padStart(16,'0'),ids:Object.keys(pinned.events),settlements:clone(pinned.settlements),read:async id=>({state:clone(pinned.events[id]??null)})};};
  return {snapshot:async()=>issue(data,version),compareAndSwap:async()=>assert.fail('root CAS'),async transact(callback,{signal}={}){
    let unlock;const before=tail;tail=new Promise(resolve=>{unlock=resolve;});await before;
    let next=clone(data),n=version,dirty=false;
    try{if(signal?.aborted)throw Error('canceled');const result=await callback({snapshot:async()=>issue(next,n),async compareAndSwap(id,revision,state,{settlements}={}){
      if(signal?.aborted)throw Error('canceled');if(revision!==issue(next,n).revision)return false;if(id!==null)next.events[id]=clone(state);if(settlements!==undefined)next.settlements=clone(settlements);n++;dirty=true;return true;
    }});if(dirty){data=next;version=n;}return result;}finally{unlock();}
  }};
}
function publicSources(){
  const repository={id:'1033',ownerId:'33',owner:'student1',name:'project',url:'https://github.com/student1/project'},identity=contracts.identity('game','1033','project');
  const frozen={schema:1,kind:'game',slug:'project',version:'0.1.0',repository,requester:{githubId:'33',login:'student1'},commit:'a'.repeat(40),folder:'.',descriptor:{schema:1,kind:'game',slug:'project',version:'0.1.0',title:'Synthetic public project',description:'Synthetic fixture',license:'MIT',controls:'Open'},policyRevision:'b'.repeat(40),sourceDigest:'c'.repeat(64)};
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
  const requestId=createHash('sha256').update(canonical(frozen)).digest('hex'),key=`game/${identity.id}/0.1.0`,artifact=contracts.artifactPath(identity,'0.1.0','zip');
  const release={schema:1,kind:'game',id:identity.id,slug:'project',version:'0.1.0',title:'Synthetic public project',description:'Synthetic fixture',license:'MIT',repository,contributor:frozen.requester,source:{commit:frozen.commit,folder:'.',sha256:frozen.sourceDigest},policyRevision:frozen.policyRevision,status:'available',controls:'Open',artifacts:{zip:{path:artifact,url:`https://artifacts.example/${artifact}`,size:1,sha256:'d'.repeat(64)}}};
  const catalog={schema:1,revision:'e'.repeat(40),releases:[release]},bytes=JSON.stringify(catalog),sha=createHash('sha256').update(bytes).digest('hex'),path=`catalog/snapshots/${sha}.json`;
  return {id:identity.id,catalog,registry:{schema:1,sequence:1,requests:{[requestId]:{id:requestId,frozen,issueIds:['123'],status:'available',releaseKey:key,attempts:[]}},releases:{[key]:{requestId,release,delivery:'ready'}},availability:[],catalog:{path,url:`https://artifacts.example/${path}`,revision:catalog.revision,sequence:1,size:Buffer.byteLength(bytes),sha256:sha}}};
}
const stagingIdentity={projectRef:'abcdefghijklmnopqrst',host:'aws-0-us-east-1.pooler.supabase.com',port:'5432',database:'postgres',role:'zerojams_staging_runtime',epoch:'a'.repeat(24)};
const stagingConfig=()=>({ZERO_JAMS_STAGING_AUTHORITY:'supabase-postgres',ZERO_JAMS_STAGING_PROJECT_REF:stagingIdentity.projectRef,ZERO_JAMS_STAGING_PG_HOST:stagingIdentity.host,ZERO_JAMS_STAGING_PG_PORT:stagingIdentity.port,ZERO_JAMS_STAGING_PG_DATABASE:stagingIdentity.database,ZERO_JAMS_STAGING_PG_ROLE:stagingIdentity.role,ZERO_JAMS_STAGING_PG_EPOCH:stagingIdentity.epoch,ZERO_JAMS_STAGING_PG_CA_PEM:rootCertificates[0],ZERO_JAMS_STAGING_PG_URI:`postgresql://${stagingIdentity.role}.${stagingIdentity.projectRef}:PRIVATE-synthetic-password-1234@${stagingIdentity.host}:5432/postgres`});
function stagingPool(){
  let generation='0',document={events:{},settlements:{schema:1,operations:{}}},tail=Promise.resolve();const stats={writes:0};
  const identity={database:'postgres',role:stagingIdentity.role,elevated:false,membership:false,delegated_access:false,relation_kind:'r',row_security:true,force_row_security:true,table_owner:'zerojams_staging_owner',schema_owner:'zerojams_staging_owner',schema_create:false,owner_member:false,readable:true,generation_write:true,document_write:true,epoch_write:false,singleton_write:false,extra_write:false,public_access:false,unexpected_access:false,api_roles_present:true,api_access:false};
  return {stats,on(){},async end(){},async connect(){let changed,unlock;
    const release=()=>{unlock?.();unlock=undefined;};
    return {release,async query(sql,params){
      if(sql.startsWith('SELECT pg_catalog.current_database()'))return {rows:[{...identity}]};
      if(sql.startsWith('SELECT epoch,generation,document')){
        if(sql.endsWith('FOR UPDATE')){const before=tail;tail=new Promise(resolve=>{unlock=resolve;});await before;}
        assert.ok(sql.includes('zerojams_staging_private.registry'));return {rows:[{epoch:stagingIdentity.epoch,generation,document:clone(document)}]};
      }
      if(sql.startsWith('UPDATE')){assert.ok(sql.startsWith('UPDATE zerojams_staging_private.registry '));changed={generation:params[0],document:JSON.parse(params[1])};return {rowCount:1};}
      if(sql==='COMMIT'&&changed){generation=changed.generation;document=changed.document;stats.writes++;}
      if(sql==='COMMIT'||sql==='ROLLBACK')release();
      assert.ok(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SET LOCAL '));return {rows:[],rowCount:1};
    }};
  }};
}

for(const mode of ['local','staging'])test(`actual Next entrypoints share ${mode} authority, isolate authenticated tokens and never fall back`,async t=>{
  let time=Date.parse('2030-01-02T12:00:00Z'),outage=false,builds=0,requests=0,compose,latestAuthority,pagesCalls=0,pgPool;const tokens=[],authenticated=new Set(),fetches=[],store=memoryAuthority(),sources=publicSources();
  const socketConfig={ZERO_JAMS_LOCAL_AUTHORITY:'postgres',ZERO_JAMS_LOCAL_PG_SOCKET:'/tmp/zero-route-test',ZERO_JAMS_LOCAL_PG_PORT:'55439',ZERO_JAMS_LOCAL_PG_DATABASE:'zerojams',ZERO_JAMS_LOCAL_PG_USER:'zerojams',ZERO_JAMS_LOCAL_PG_EPOCH:'a'.repeat(24)};
  for(const key of ['ZERO_JAMS_PRIVATE_KEY','ZERO_HUB_GITHUB_CLIENT_SECRET','ZERO_HUB_GITHUB_SESSION_SECRET','ZERO_JAMS_STAGING_PG_URI','ZERO_JAMS_STAGING_PG_CA_PEM'])assert.equal(Object.hasOwn(process.env,key),false,'Synthetic route test requires no ambient secret settings');
  const pagesConfig=mode==='staging'?{ZERO_JAMS_APP_ID:'5367740',ZERO_JAMS_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey}:{};
  const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555',...(mode==='staging'?stagingConfig():socketConfig),...pagesConfig,ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'synthetic-route-client-secret',ZERO_HUB_GITHUB_SESSION_SECRET:'a'.repeat(64),ZERO_SHARING_CATALOG_URL:'https://artifacts.example/catalog.json',ZERO_SHARING_ARTIFACT_ORIGIN:'https://artifacts.example'};
  const hosted=['VERCEL','VERCEL_ENV','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','K_SERVICE','K_REVISION','FUNCTION_TARGET','FUNCTION_NAME','CF_PAGES','CF_WORKER','NETLIFY','DYNO','RENDER','FLY_APP_NAME','RAILWAY_ENVIRONMENT'];
  const touched=[...new Set([...Object.keys(env),...Object.keys(socketConfig),...Object.keys(stagingConfig()),...hosted])],original=Object.fromEntries(touched.map(key=>[key,process.env[key]])),originalFetch=globalThis.fetch,originalNow=Date.now;
  for(const key of touched)delete process.env[key];Object.assign(process.env,env);Date.now=()=>time;
  const users={ghu_creator_token_111:{id:11,login:'creator'},ghu_owner_token_111:{id:4050555,login:'armorup'},ghu_student_token_111:{id:33,login:'student1'},ghu_student_token_222:{id:34,login:'student2'}};
  globalThis.fetch=async(input,options={})=>{
    const url=String(input);fetches.push(url);
    assert.ok(!url.includes('/git/ref/')&&!url.includes('/app/installations/123/'),'selected authority cannot fetch the Git registry or writer token');
    if(url==='https://api.github.com/user'){const token=options.headers.Authorization.slice(7);authenticated.add(token);return Response.json(users[token]);}
    const repo={id:1033,name:'project',full_name:'student1/project',html_url:'https://github.com/student1/project',private:false,visibility:'public',owner:{id:33,login:'student1',type:'User'}};
    if(url==='https://api.github.com/repos/student1/project/installation')return Response.json({id:606,app_id:5367740,suspended_at:null,account:{id:33,login:'student1',type:'User'},target_id:33,target_type:'User',permissions:{metadata:'read',pages:'read'}});
    if(url==='https://api.github.com/app/installations/606/access_tokens'){
      assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{repository_ids:[1033],permissions:{pages:'read',metadata:'read'}});
      return Response.json({token:'synthetic-installation-token',expires_at:new Date(time+3600000).toISOString(),repository_selection:'selected',repositories:[repo],permissions:{pages:'read',metadata:'read'}},{status:201});
    }
    if(url==='https://api.github.com/repositories/1033'){assert.equal(options.headers.Authorization,'Bearer ghu_student_token_111');return Response.json(repo);}
    if(url==='https://api.github.com/repos/student1/project/pages'){pagesCalls++;assert.equal(options.headers.Authorization,'Bearer synthetic-installation-token');return Response.json({html_url:'https://student1.github.io/project/',public:true,status:'built'});}
    if(/^https:\/\/api.github.com\/repos\/student[12]\/project$/.test(url)){
      const token=options.headers?.Authorization?.slice(7);
      if(token==='synthetic-installation-token'||token===undefined)return Response.json(repo);
      const actor=users[token];assert.ok(authenticated.has(token));tokens.push([String(actor.id),token]);
      return Response.json({id:1000+actor.id,name:'project',private:false,visibility:'public',owner:{id:actor.id,login:actor.login,type:'User'},full_name:`${actor.login}/project`});
    }
    if(url==='https://raw.githubusercontent.com/codepetca/zero/zero-sharing-registry/registry/state.json')return Response.json(sources.registry);
    if(url.startsWith('https://artifacts.example/'))return Response.json(sources.catalog);
    return Response.json({}, {status:404});
  };
  const manager=createDefaultJamAuthorityManager({now:()=>time,reviewedStagingIdentity:stagingIdentity,stagingSelectorFactory:async options=>{
    builds++;const {createStagingPostgresAuthoritySelector}=await import('../lib/jams-staging-postgres-selector.mjs');
    const selector=createStagingPostgresAuthoritySelector({...options,poolFactory:()=>{pgPool=stagingPool();return pgPool;}});
    return {async authorityForRequest(input={}){requests++;if(outage)throw Error('PRIVATE staging outage');if(input.sourceToken!==undefined)assert.ok(authenticated.has(input.sourceToken));latestAuthority=await selector.authorityForRequest(input);return latestAuthority;},close:()=>selector.close()};
  },selectorFactory:async()=>{builds++;return {async authorityForRequest({sourceToken}={}){
    requests++;if(outage)throw Error('PRIVATE selected outage');if(sourceToken!==undefined)assert.ok(authenticated.has(sourceToken),'source verifier created before authentication');
    return compose({env:process.env,store,now:()=>time,verifySource:async()=>assert.fail('source not expected'),verifyRepository:async({actor})=>{tokens.push([actor.id,sourceToken]);return {repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:`${actor.login}/project`}};},pagesBindingReader:async(repo,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repo.id,ownerId:repo.ownerId})});
  },async close(){}};}});
  const bridge='__zeroDefaultAuthorityRouteTest';globalThis[bridge]=manager;
  // Test-only resolution hooks replace the central manager dependency, not the
  // runtime/HTTP implementations or route code. No production injection API.
  const shim='data:text/javascript,'+encodeURIComponent(`export const localJamAuthorityRequested=e=>globalThis.${bridge}.requested(e);export const readDefaultLocalJamAuthority=o=>globalThis.${bridge}.authorityForRequest(o);`);
  const hook=registerHooks({resolve(specifier,context,next){if(specifier==='./jams-default-authority.mjs'&&/\/(?:jams-runtime|jams-http|jam-hub-visibility)\.mjs$/.test(context.parentURL??''))return {url:shim,shortCircuit:true};return next(specifier,context);}});
  t.after(async()=>{hook.deregister();delete globalThis[bridge];await manager.close();globalThis.fetch=originalFetch;Date.now=originalNow;for(const key of touched){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}});
  compose=(await import('../lib/jams-local-authority.mjs')).createLocalJamAuthority;
  const auth=await import('../lib/hub-github-auth.mjs'),routeCache=new Map();
  async function route(file){
    if(routeCache.has(file))return routeCache.get(file);
    const source=await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),imports={};
    for(const match of source.matchAll(/from ['"](@\/lib\/[^'"]+)['"]/g))imports[match[1]]=await import(new URL('../'+match[1].slice(2),import.meta.url));
    const module={exports:{}},require=createRequire(import.meta.url);
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:name=>imports[name]??require(name),Request,Response,URL});
    routeCache.set(file,module.exports);return module.exports;
  }
  const sessions=Object.fromEntries(Object.entries(users).map(([token,user])=>[user.login,auth.newSession(token,user,3600,auth.hubConfig(process.env),time)]));
  const request=(path,{method='GET',body,user='student1'}={})=>new Request('http://127.0.0.1:3000'+path,{method,headers:{origin:'http://127.0.0.1:3000',cookie:sessions[user].cookie.split(';')[0],'x-hub-csrf':sessions[user].session.csrf,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const call=async(file,method,path,options={},params={})=>(await route(file))[method](request(path,{...options,method}),{params:Promise.resolve(params)});
  const at=offset=>new Date(time+offset).toISOString(),manifest=hostedManifest({schedule:{registrationOpensAt:at(-120000),registrationClosesAt:at(120000),startsAt:at(-60000),submissionsOpenAt:at(-30000),submissionsCloseAt:at(180000),galleryRevealAt:at(240000)}});
  let response=await call('api/jams/proposals/route.ts','POST','/api/jams/proposals',{user:'creator',body:{operationId:'route-proposal-001',manifest}});
  assert.equal(response.status,200);const proposal=await response.json(),id=proposal.eventId;
  assert.equal(proposal.status,'approved');
  const joined=await Promise.all(['student1','student2'].map(user=>call('api/jams/[id]/actions/route.ts','POST',`/api/jams/${id}/actions`,{user,body:{operationId:`route-join-${user}`,action:'join',revision:proposal.revision,repositoryUrl:`https://github.com/${user}/project`}},{id})));
  assert.ok(joined.every(value=>value.status===200));assert.deepEqual(tokens.sort(),[['33','ghu_student_token_111'],['34','ghu_student_token_222']]);assert.equal(builds,1);
  if(mode==='staging'){
    assert.equal(latestAuthority.jamOptions.env.ZERO_JAMS_STAGING_PG_URI,undefined);assert.equal(latestAuthority.hubOptions.env.ZERO_JAMS_STAGING_PG_CA_PEM,undefined);
    assert.doesNotMatch(JSON.stringify(latestAuthority),/PRIVATE|BEGIN CERTIFICATE|synthetic-route-client-secret/);
  }
  response=await call('api/jams/[id]/actions/route.ts','POST',`/api/jams/${id}/actions`,{body:{operationId:'route-submit-001',action:'submit',revision:proposal.revision,title:'Synthetic submitted project',description:'Synthetic route submission',demoUrl:'https://student1.github.io/project/'}},{id});assert.equal(response.status,200,await response.clone().text());
  if(mode==='staging')assert.ok(pagesCalls>0,'Actual Pages runtime used only synthetic transport');
  response=await call('api/jams/[id]/route.ts','GET',`/api/jams/${id}`,{}, {id});assert.equal(response.status,200);assert.deepEqual((await response.json()).event.entries,[]);
  response=await call('api/sharing/catalog/route.ts','GET','/api/sharing/catalog');assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[]);
  response=await call('api/sharing/requests/[issue]/route.ts','GET','/api/sharing/requests/123',{}, {issue:'123'});assert.equal(response.status,200);assert.equal((await response.json()).results[0].releaseLink,undefined);
  response=await call('hub/jams/[id]/panel/route.ts','GET',`/hub/jams/${id}/panel`,{}, {id});assert.equal(response.status,200);assert.match(await response.text(),/2 participants/);
  time+=240000;
  response=await call('api/jams/[id]/route.ts','GET',`/api/jams/${id}`,{}, {id});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).event.entries.length,1);
  response=await call('api/sharing/catalog/route.ts','GET','/api/sharing/catalog');assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).releases.length,1);
  outage=true;
  const cases=[
    ['api/jams/route.ts','GET','/api/jams'],['api/jams/[id]/route.ts','GET',`/api/jams/${id}`,{}, {id}],['hub/jams/[id]/panel/route.ts','GET',`/hub/jams/${id}/panel`,{}, {id}],
    ['api/jams/[id]/actions/route.ts','POST',`/api/jams/${id}/actions`,{body:{operationId:'route-outage-join',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student1/project'}},{id}],
    ['api/jams/proposals/route.ts','POST','/api/jams/proposals',{user:'creator',body:{operationId:'route-outage-propose',manifest:hostedManifest()}}],
    ['api/jams/settlements/route.ts','POST','/api/jams/settlements',{body:{operationId:'route-outage-settle',scope:id,payload:{action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student1/project'}}}],
    ['api/hub/discovery/route.ts','GET','/api/hub/discovery'],['api/hub/projects/route.ts','GET',`/api/hub/projects?kind=game&ids=${sources.id}`],['api/hub/metrics/route.ts','GET',`/api/hub/metrics?kind=game&ids=${sources.id}`],
    ['api/hub/opens/route.ts','POST','/api/hub/opens',{body:{id:sources.id}}],['api/hub/github/stars/route.ts','GET',`/api/hub/github/stars?kind=game&id=${sources.id}`],['api/hub/github/stars/route.ts','POST','/api/hub/github/stars',{body:{kind:'game',id:sources.id,starred:true}}],
    ['api/sharing/catalog/route.ts','GET','/api/sharing/catalog'],['api/sharing/catalog/web/route.ts','GET','/api/sharing/catalog/web'],['api/sharing/catalog/practice/route.ts','GET','/api/sharing/catalog/practice'],['api/sharing/requests/[issue]/route.ts','GET','/api/sharing/requests/123',{}, {issue:'123'}]
  ];
  for(const args of cases){const before=requests;response=await call(...args);assert.equal(response.status,503,args[0]+' '+await response.clone().text());assert.ok(requests>before,args[0]+' did not consult the shared selected authority');assert.doesNotMatch(await response.text(),/PRIVATE|Synthetic public project/);}
  assert.equal(builds,1);assert.ok(fetches.every(url=>!url.includes('/git/ref/')));
  if(mode==='staging'){
    outage=false;const cached=await manager.authorityForRequest({env:process.env}),writes=pgPool.stats.writes;
    assert.equal(cached.jamOptions.service,cached.service);process.env.ZERO_JAMS_STAGING_FUTURE='1';assert.equal(manager.requested(process.env),true);delete process.env.ZERO_JAMS_STAGING_FUTURE;
    await assert.rejects(cached.service.propose({actor:{id:'11',login:'creator'},operationId:'latched-cached-001',manifest}),error=>error.status===503);assert.equal(pgPool.stats.writes,writes);
    let unapprovedBuilds=0;
    const rejectFactory=()=>{unapprovedBuilds++;assert.fail('unapproved project constructed a selector');};
    const unapproved=createDefaultJamAuthorityManager({selectorFactory:rejectFactory,stagingSelectorFactory:rejectFactory});globalThis[bridge]=unapproved;t.after(()=>unapproved.close());
    response=await call('api/jams/route.ts','GET','/api/jams');assert.equal(response.status,503);
    response=await call('api/sharing/catalog/route.ts','GET','/api/sharing/catalog');assert.equal(response.status,503);assert.equal(unapprovedBuilds,0);
    globalThis[bridge]=manager;
  }
  // Compiled production hold remains the first route boundary, regardless of
  // local selector flags. Nothing may obtain a DB authority or resolve params.
  process.env.NODE_ENV='production';const before=requests;
  for(const hosting of ['production','preview']){
    process.env.VERCEL_ENV=hosting;
    for(const [file,method,path,options] of cases.filter(([file])=>file.startsWith('api/jams/')||file.startsWith('hub/jams/'))){response=await (await route(file))[method](request(path,{...options,method}),{get params(){assert.fail('hidden params');}});assert.equal(response.status,404,file);}
  }
  assert.equal(requests,before);
  // A first POST must observe selection before its awaited /user check. Losing
  // all local settings during that await must never initialize Git mode.
  delete process.env.VERCEL_ENV;process.env.NODE_ENV='development';Object.assign(process.env,env);let raceBuilds=0;
  const never=()=>{raceBuilds++;assert.fail('drifted selection constructed a selector');};
  if(mode==='staging'){
    const mixed=createDefaultJamAuthorityManager({reviewedStagingIdentity:stagingIdentity,selectorFactory:never,stagingSelectorFactory:never});globalThis[bridge]=mixed;t.after(()=>mixed.close());
    process.env.ZERO_JAMS_LOCAL_AUTHORITY='postgres';
    response=await call('api/jams/route.ts','GET','/api/jams');assert.equal(response.status,503);
    response=await call('api/sharing/catalog/route.ts','GET','/api/sharing/catalog');assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE|BEGIN CERTIFICATE/);
    delete process.env.ZERO_JAMS_LOCAL_AUTHORITY;response=await call('api/jams/route.ts','GET','/api/jams');assert.equal(response.status,503);assert.equal(raceBuilds,0);
  }
  const raceManager=createDefaultJamAuthorityManager({reviewedStagingIdentity:stagingIdentity,selectorFactory:never,stagingSelectorFactory:never});
  globalThis[bridge]=raceManager;t.after(()=>raceManager.close());
  const earlierFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    if(String(url)==='https://api.github.com/user')for(const key of Object.keys(process.env))if(key.startsWith('ZERO_JAMS_LOCAL_')||key.startsWith('ZERO_JAMS_STAGING_'))delete process.env[key];
    return earlierFetch(url,options);
  };
  response=await call('api/jams/proposals/route.ts','POST','/api/jams/proposals',{user:'creator',body:{operationId:'route-auth-drift',manifest:hostedManifest()}});
  assert.equal(response.status,503);assert.equal(raceBuilds,0);assert.equal(raceManager.requested(process.env),true);
  await assert.rejects(raceManager.authorityForRequest({env:process.env}),error=>error.status===503);
});
