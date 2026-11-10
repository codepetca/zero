// Opt-in only: requires a separately created, marker-verified disposable local
// PostgreSQL cluster. No real GitHub, Pages, deployment, or selector mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {userInfo} from 'node:os';
import {readFile} from 'node:fs/promises';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import contracts from '../../extension/src/sharing/contracts.js';
import {hostedManifest} from '../../jams/test/fixtures.mjs';
import {POSTGRES_REGISTRY_SCHEMA,POSTGRES_REGISTRY_SEED,freshRegistryEpoch} from '../../jams/postgres-registry.mjs';
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';

const enabled=process.env.ZERO_TEST_PG_DISPOSABLE==='1';
function catalog(){
  const identity=contracts.identity('game','202','project'),version='0.1.0',path=contracts.artifactPath(identity,version,'zip');
  return contracts.validateCatalog({schema:1,revision:'a'.repeat(40),releases:[{schema:1,kind:'game',id:identity.id,slug:'project',version,title:'Student project',description:'Synthetic project',license:'MIT',repository:{id:'202',ownerId:'33',owner:'student',name:'project',url:'https://github.com/student/project'},contributor:{githubId:'33',login:'student'},source:{commit:'b'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),status:'available',controls:'Open',artifacts:{zip:{path,url:`https://artifacts.example/${path}`,size:1,sha256:'e'.repeat(64)}}}]});
}

test('default local authority shares a real PostgreSQL registry across authenticated Jam and Hub HTTP',{skip:!enabled,timeout:30000},async t=>{
  const socket=process.env.ZERO_TEST_PG_SOCKET,port=process.env.ZERO_TEST_PG_PORT;
  assert.match(socket||'',/^\/tmp\/zero-jams-integration\.[A-Za-z0-9]+$/);assert.match(port||'',/^[1-9][0-9]{0,4}$/);
  assert.equal(await readFile(`${socket}/.zero-jams-disposable`,'utf8'),'zero-jams-test-only\n');
  const {Pool}=createRequire(import.meta.url)('pg');
  const admin=new Pool({host:socket,port:Number(port),user:userInfo().username,database:'postgres',password:()=>'',ssl:false,options:'-c search_path=public',max:2,connectionTimeoutMillis:2000,statement_timeout:3000,lock_timeout:2000,query_timeout:4000});
  const previousFetch=globalThis.fetch,previousNow=Date.now;let ownsTable=false,ownsListings=false,time=previousNow(),blocked=0,pagesCalls=0;
  t.after(async()=>{Date.now=previousNow;globalThis.fetch=previousFetch;try{if(ownsTable){await admin.query('DROP TABLE IF EXISTS zero_jams_registry_poc');await admin.query('DROP TABLE IF EXISTS zero_jams_registry_poc_outage');}if(ownsListings)await admin.query('DROP SCHEMA zero_hub_listings CASCADE');}finally{await admin.end();}});
  const address=await admin.query('SELECT inet_server_addr() AS address, current_database() AS name');
  assert.equal(address.rows[0].address,null);assert.equal(address.rows[0].name,'postgres');
  assert.equal((await admin.query("SELECT to_regclass('public.zero_jams_registry_poc') AS name")).rows[0].name,null,'Disposable registry must begin absent');
  assert.equal((await admin.query("SELECT to_regclass('public.zero_jams_registry_poc_outage') AS name")).rows[0].name,null,'Disposable outage relation must begin absent');
  await admin.query(POSTGRES_REGISTRY_SCHEMA);ownsTable=true;const epoch=freshRegistryEpoch();
  await admin.query(POSTGRES_REGISTRY_SEED,[epoch,JSON.stringify({events:{},settlements:{schema:1,operations:{}}})]);
  assert.equal((await admin.query("SELECT to_regnamespace('zero_hub_listings') AS name")).rows[0].name,null);
  await admin.query(await readFile(new URL('../sql/zerohub-listings.sql',import.meta.url),'utf8'));
  ownsListings=true;
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11',ZERO_JAMS_LOCAL_AUTHORITY:'postgres',ZERO_JAMS_LOCAL_PG_SOCKET:socket,ZERO_JAMS_LOCAL_PG_PORT:port,ZERO_JAMS_LOCAL_PG_DATABASE:'postgres',ZERO_JAMS_LOCAL_PG_USER:userInfo().username,ZERO_JAMS_LOCAL_PG_EPOCH:epoch,
    ZERO_JAMS_APP_ID:'5367740',ZERO_JAMS_INSTALLATION_ID:'123',ZERO_JAMS_PRIVATE_KEY:privateKey,ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'synthetic-client-secret-'.repeat(2),ZERO_HUB_GITHUB_SESSION_SECRET:randomBytes(32).toString('base64url')};
  const actors={creator:{id:11,login:'creator'},owner:{id:4050555,login:'armorup'},student:{id:33,login:'student'}},tokens=new Map();
  const config=hubConfig(env);assert.ok(config);
  const sessions=Object.fromEntries(Object.entries(actors).map(([name,actor],i)=>{const token=`ghu_${String.fromCharCode(97+i).repeat(24)}`;tokens.set(token,actor);return [name,newSession(token,actor,28800,config,time)];}));
  const studentToken=[...tokens].find(([,actor])=>actor.id===33)[0];
  const repo={id:202,name:'project',full_name:'student/project',private:false,visibility:'public',owner:{id:33,login:'student',type:'User'}};
  const transport=async(input,init={})=>{
    const url=String(input),method=init.method||'GET',auth=init.headers?.Authorization;
    if(url==='https://api.github.com/user'&&method==='GET'){const actor=tokens.get(auth?.replace(/^Bearer /,''));assert.ok(actor);return Response.json(actor);}
    if(url==='https://api.github.com/repos/student/project/installation'&&method==='GET')return Response.json({id:606,app_id:5367740,suspended_at:null,account:{id:33,login:'student',type:'User'},target_id:33,target_type:'User',permissions:{metadata:'read',pages:'read'}});
    if(url==='https://api.github.com/app/installations/606/access_tokens'&&method==='POST'){assert.deepEqual(JSON.parse(init.body),{repository_ids:[202],permissions:{pages:'read',metadata:'read'}});return Response.json({token:'synthetic-installation-token',expires_at:new Date(time+3600000).toISOString(),repository_selection:'selected',repositories:[repo],permissions:{pages:'read',metadata:'read'}},{status:201});}
    if(url==='https://api.github.com/repositories/202'&&method==='GET'){assert.equal(auth,`Bearer ${studentToken}`);return Response.json(repo);}
    if(url==='https://api.github.com/repos/student/project'&&method==='GET'){assert.ok([`Bearer ${studentToken}`,'Bearer synthetic-installation-token'].includes(auth));return Response.json(repo);}
    if(url==='https://api.github.com/repos/student/project/pages'&&method==='GET'){pagesCalls++;assert.equal(auth,'Bearer synthetic-installation-token');return Response.json({html_url:'https://student.github.io/project/',public:true,status:'built'});}
    blocked++;throw new Error('Blocked unexpected synthetic transport request.');
  };
  globalThis.fetch=transport;Date.now=()=>time;
  // Import only after installing the deny-by-default transport: the real shared
  // default manager captures fetch once, without a selector/test manager mock.
  const {getJamResponse,postJamProposalResponse,postJamActionResponse}=await import('../lib/jams-http.mjs');
  const {catalogResponse}=await import('../lib/sharing-catalog.mjs');
  const {hubPublicListingsResponse}=await import('../lib/hub-listings-http.mjs');
  const {createHubListingsStore}=await import('../lib/hub-listings-store.mjs');
  const options={env,now:()=>time,fetchImpl:transport};
  const destinationReader=async url=>{assert.equal(url,'https://github.com/student/project');return {repositoryId:'202',ownerId:'33',owner:'student',repo:'project',repositoryUrl:url};};
  function post(name,path,body){const session=sessions[name];return new Request(config.origin+path,{method:'POST',headers:{Origin:config.origin,Cookie:session.cookie.split(';')[0],'X-Hub-CSRF':session.session.csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});}
  const at=offset=>new Date(time+offset).toISOString(),manifest=hostedManifest({schedule:{registrationOpensAt:at(-120000),registrationClosesAt:at(120000),startsAt:at(-60000),submissionsOpenAt:at(-30000),submissionsCloseAt:at(180000),galleryRevealAt:at(240000)}});
  let response=await postJamProposalResponse(post('creator','/api/jams/proposals',{operationId:'pg-http-propose-0001',manifest}),options);assert.equal(response.status,200,await response.clone().text());
  const proposal=await response.json(),id=proposal.eventId,action=`/api/jams/${id}/actions`,approval={operationId:'pg-http-approve-0001',action:'approve',revision:proposal.revision};
  response=await postJamActionResponse(post('student',action,approval),id,options);assert.equal(response.status,403);
  assert.equal(proposal.status,'approved');
  response=await postJamActionResponse(post('student',action,{operationId:'pg-http-join-0001',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student/project'}),id,options);assert.equal(response.status,200,await response.clone().text());
  response=await postJamActionResponse(post('student',action,{operationId:'pg-http-submit-0001',action:'submit',revision:proposal.revision,title:'Project',description:'Synthetic',demoUrl:'https://student.github.io/project/'}),id,options);assert.equal(response.status,200,await response.clone().text());
  const entryRevision=(await response.json()).revision;
  assert.ok(pagesCalls>0,'The actual Pages runtime path used the synthetic transport');
  const document=(await admin.query('SELECT document FROM zero_jams_registry_poc WHERE singleton=1')).rows[0].document,state=document.events[id];
  assert.equal(state.accepted.reviewedBy,null);assert.equal(state.registrations['33'].status,'joined');assert.equal(state.entries['33'].length,1);assert.equal(Object.keys(state.operations).length,3);
  const jam=()=>getJamResponse(new Request(config.origin+`/api/jams/${id}`),id,{...options,destinationReader});
  const hub=()=>catalogResponse(new Request(config.origin+'/api/sharing/catalog'),{env,decisionNow:()=>time,reader:async()=>catalog(),destinationReader});
  const store=createHubListingsStore(admin);
  await store.savePublication('33',1,{repositoryId:'202',repositoryUrl:'https://github.com/student/project',title:'Project',
    author:'student',pagesUrl:'https://student.github.io/project/',commit:'b'.repeat(40),runId:'1',runCreatedAt:new Date(time)});
  const listings=()=>hubPublicListingsResponse(new Request(config.origin+'/api/hub/listings/discover'),{
    env,getStore:()=>store,destinationReader:async entry=>entry.repositoryId==='202'&&entry.accountId==='33',
    playReader:async entry=>entry.pagesUrl});
  const pick=actor=>postJamActionResponse(post(actor,action,{operationId:'pg-http-pick-0001',action:'pick-winner',
    participantId:'33',revision:entryRevision}),id,options);
  const choices=actor=>getJamResponse(new Request(config.origin+`/api/jams/${id}?view=winner`,{
    headers:{Cookie:sessions[actor].cookie.split(';')[0]}}),id,options);
  assert.equal((await pick('creator')).status,409);
  assert.equal((await choices('creator')).status,409);
  response=await jam();assert.equal(response.status,200);assert.deepEqual((await response.json()).event.entries,[]);
  response=await hub();assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[]);
  time+=180000;
  assert.equal((await choices('student')).status,403);
  assert.equal((await pick('student')).status,403);
  assert.equal((await pick('owner')).status,403);
  response=await choices('creator');assert.equal(response.status,200);
  assert.deepEqual((await response.json()).winnerSelection,{currentRevision:null,entries:[
    {participantId:'33',revision:entryRevision,title:'Project',login:'student',demoUrl:'https://student.github.io/project/'}]});
  response=await pick('creator');assert.equal(response.status,200,await response.clone().text());
  const picked=await response.json();assert.equal(picked.status,'winner-selected');
  assert.deepEqual(await (await pick('creator')).json(),picked);
  response=await jam();assert.deepEqual((await response.json()).event.entries,[]);
  response=await listings();assert.equal(response.status,200);assert.deepEqual((await response.json()).projects,[]);
  time+=60000;
  response=await jam();assert.equal(response.status,200,await response.clone().text());
  const entries=(await response.json()).event.entries;
  assert.equal(entries.length,1);assert.equal(entries[0].winner,true);
  response=await listings();assert.equal(response.status,200);
  assert.deepEqual((await response.json()).projects[0].gameJamWinner,{id,title:manifest.title});
  response=await hub();assert.equal(response.status,200);assert.equal((await response.json()).releases.length,1);
  response=await postJamActionResponse(post('owner',action,{operationId:'pg-http-withdraw-0001',action:'withdraw-entry',
    participantId:'33',reason:'Fixture moderation'}),id,options);assert.equal(response.status,200,await response.clone().text());
  response=await jam();assert.deepEqual((await response.json()).event.entries,[]);
  response=await listings();const projects=(await response.json()).projects;
  assert.equal(projects.length,1);assert.equal(projects[0].gameJamWinner,undefined);
  await admin.query('ALTER TABLE zero_jams_registry_poc RENAME TO zero_jams_registry_poc_outage');
  response=await jam();assert.equal(response.status,503);response=await hub();assert.equal(response.status,503);
  await admin.query('ALTER TABLE zero_jams_registry_poc_outage RENAME TO zero_jams_registry_poc');
  response=await jam();assert.equal(response.status,200);
  await admin.query('UPDATE zero_jams_registry_poc SET epoch=$1 WHERE singleton=1',['f'.repeat(24)]);
  response=await jam();assert.equal(response.status,503);response=await hub();assert.equal(response.status,503);
  assert.equal(blocked,0,'No Git registry or other unapproved provider transport was called');
});
