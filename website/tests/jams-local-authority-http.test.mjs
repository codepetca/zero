import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import contracts from '../../extension/src/sharing/contracts.js';
import {hostedManifest} from '../../jams/test/fixtures.mjs';
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {createLocalJamAuthority} from '../lib/jams-local-authority.mjs';
import {getJamResponse,postJamProposalResponse,postJamActionResponse} from '../lib/jams-http.mjs';
import {catalogResponse} from '../lib/sharing-catalog.mjs';

function transactionalStore(){
  let document={events:{},settlements:{schema:1,operations:{}}},generation=0,tail=Promise.resolve();
  const issue=(data,n)=>{const copy=structuredClone(data);return {revision:n.toString(16).padStart(40,'0'),ids:Object.keys(copy.events),settlements:copy.settlements,async read(id){return {state:structuredClone(copy.events[id]??null)};}};};
  const store={commits:0,transactions:0,locked:false,snapshot:async()=>issue(document,generation),compareAndSwap:async()=>assert.fail('Root CAS or alternate writer was selected'),
    async transact(work,{signal}={}){
      const previous=tail;let unlock;tail=new Promise(resolve=>{unlock=resolve;});await previous;
      let active=true,dirty=false,version=generation;const next=structuredClone(document);
      const check=()=>{assert.equal(active,true);assert.equal(signal?.aborted??false,false);};
      try{
        check();store.transactions++;store.locked=true;
        const result=await work({async snapshot(){check();return issue(next,version);},async compareAndSwap(id,expected,state,{settlements}={}){
          check();if(expected!==version.toString(16).padStart(40,'0'))return false;
          if(id!==null)next.events[id]=structuredClone(state);if(settlements!==undefined)next.settlements=structuredClone(settlements);
          version++;dirty=true;return true;
        }});
        check();if(dirty){document=next;generation=version;store.commits++;}return result;
      }finally{active=false;store.locked=false;unlock();}
    }};
  return store;
}

function publicCatalog(){
  const identity=contracts.identity('game','202','project'),version='0.1.0',path=contracts.artifactPath(identity,version,'zip');
  return contracts.validateCatalog({schema:1,revision:'a'.repeat(40),releases:[{schema:1,kind:'game',id:identity.id,slug:'project',version,title:'Student project',description:'Synthetic project',license:'MIT',
    repository:{id:'202',ownerId:'33',owner:'student',name:'project',url:'https://github.com/student/project'},contributor:{githubId:'33',login:'student'},
    source:{commit:'b'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),status:'available',controls:'Open the project',
    artifacts:{zip:{path,url:`https://artifacts.example/${path}`,size:1,sha256:'e'.repeat(64)}}}]});
}

test('local authority authenticates HTTP writes and CSRF before shared transaction and reveal decisions',async()=>{
  let time=Date.parse('2030-01-02T12:00:00Z');
  const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555',ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
    ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'synthetic-client-secret-'.repeat(2),ZERO_HUB_GITHUB_SESSION_SECRET:randomBytes(32).toString('base64url')};
  const config=hubConfig(env),store=transactionalStore(),identityCalls=[],tokens=new Map();let repositoryCalls=0,pagesCalls=0;
  assert.ok(config);
  const actors={creator:{id:11,login:'creator'},owner:{id:4050555,login:'armorup'},participant:{id:33,login:'student'}};
  const sessions=Object.fromEntries(Object.entries(actors).map(([name,actor],i)=>{
    const token=`ghu_${String.fromCharCode(97+i).repeat(24)}`;tokens.set(token,actor);
    return [name,newSession(token,actor,28800,config,time)];
  }));
  const fetchImpl=async(url,options)=>{
    identityCalls.push(url);assert.equal(url,'https://api.github.com/user','No provider or registry fallback is permitted');assert.equal(options.method??'GET','GET');
    const actor=tokens.get(options.headers.Authorization?.replace(/^Bearer /,''));assert.ok(actor,'Only a sealed synthetic session token may reach identity verification');
    return Response.json(actor);
  };
  const authority=createLocalJamAuthority({env,store,now:()=>time,verifySource:async()=>assert.fail('Unexpected source provider fallback'),
    verifyRepository:async({actor})=>{assert.equal(store.locked,false);repositoryCalls++;return {repository:{id:'202',ownerId:actor.id,fullName:`${actor.login}/project`}};},
    pagesBindingReader:async(repo,pagesUrl)=>{assert.equal(store.locked,false);pagesCalls++;return {status:'verified',pagesUrl,repositoryId:repo.id,ownerId:repo.ownerId};}});
  const options={...authority.jamOptions,fetchImpl};
  function post(name,path,body,headers={}){
    const signed=sessions[name],all=new Headers({Origin:config.origin,Cookie:signed.cookie.split(';')[0],'X-Hub-CSRF':signed.session.csrf,'Content-Type':'application/json'});
    for(const [key,value]of Object.entries(headers))if(value===null)all.delete(key);else all.set(key,value);
    return new Request(config.origin+path,{method:'POST',headers:all,body:JSON.stringify(body)});
  }
  async function rejectedBeforeIdentity(call,status){
    const counts=[identityCalls.length,store.transactions,store.commits,repositoryCalls,pagesCalls],response=await call();
    assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual([identityCalls.length,store.transactions,store.commits,repositoryCalls,pagesCalls],counts);
  }
  const proposalBody={operationId:'http-local-proposal',manifest:hostedManifest()},proposalPath='/api/jams/proposals';
  for(const headers of [{'X-Hub-CSRF':null},{'X-Hub-CSRF':'z'.repeat(43)}])
    await rejectedBeforeIdentity(()=>postJamProposalResponse(post('creator',proposalPath,proposalBody,headers),options),403);
  await rejectedBeforeIdentity(()=>postJamProposalResponse(post('creator',proposalPath,proposalBody,{Cookie:null}),options),401);
  const [cookieName,sealed]=sessions.creator.cookie.split(';')[0].split('=');
  const brokenCookie=`${cookieName}=${sealed[0]==='A'?'B':'A'}${sealed.slice(1)}`;
  await rejectedBeforeIdentity(()=>postJamProposalResponse(post('creator',proposalPath,proposalBody,{Cookie:brokenCookie}),options),401);
  let response=await postJamProposalResponse(post('creator',proposalPath,proposalBody),options);assert.equal(response.status,200);
  const proposal=await response.json(),id=proposal.eventId,actionPath=`/api/jams/${id}/actions`;
  const approval={operationId:'http-local-approval',action:'approve',revision:proposal.revision};
  const beforeApproval=store.commits;
  response=await postJamActionResponse(post('creator',actionPath,approval),id,options);assert.equal(response.status,403);assert.equal(store.commits,beforeApproval);
  response=await postJamActionResponse(post('participant',actionPath,approval),id,options);assert.equal(response.status,403);assert.equal(store.commits,beforeApproval);
  assert.equal((await (await store.snapshot()).read(id)).state.accepted,null,'an unrelated nonmaintainer cannot approve the proposal');
  response=await postJamActionResponse(post('owner',actionPath,approval),id,options);assert.equal(response.status,200);
  const join={operationId:'http-local-join',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student/project'};
  const submit={operationId:'http-local-submit',action:'submit',revision:proposal.revision,title:'Project',description:'Synthetic project',demoUrl:'https://student.github.io/project/'};
  for(const body of [join,submit]){
    for(const headers of [{'X-Hub-CSRF':null},{'X-Hub-CSRF':'z'.repeat(43)}])
      await rejectedBeforeIdentity(()=>postJamActionResponse(post('participant',actionPath,body,headers),id,options),403);
    response=await postJamActionResponse(post('participant',actionPath,body),id,options);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).status,body===join?'joined':'submitted');
  }
  const snapshot=await store.snapshot(),state=(await snapshot.read(id)).state;
  assert.equal(state.creator.id,'11');assert.equal(state.accepted.reviewedBy,'4050555');assert.equal(state.registrations['33'].status,'joined');
  assert.equal(state.entries['33'].length,1);assert.equal(Object.keys(state.operations).length,4);assert.equal(store.commits,4);
  assert.equal(identityCalls.length,6);assert.equal(repositoryCalls,2);assert.equal(pagesCalls,1);
  const ownerProposalBody={operationId:'http-local-owner-proposal',manifest:hostedManifest()};
  response=await postJamProposalResponse(post('owner',proposalPath,ownerProposalBody),options);assert.equal(response.status,200);
  const ownerProposal=await response.json(),ownerPath=`/api/jams/${ownerProposal.eventId}/actions`,beforeSelfApproval=await store.snapshot();
  const commitsBeforeSelfApproval=store.commits;
  response=await postJamActionResponse(post('owner',ownerPath,{operationId:'http-local-owner-self-approval',action:'approve',revision:ownerProposal.revision}),ownerProposal.eventId,options);
  assert.equal(response.status,403);assert.match((await response.json()).error,/different maintainer/i);
  const afterSelfApproval=await store.snapshot(),ownerState=(await afterSelfApproval.read(ownerProposal.eventId)).state;
  assert.equal(afterSelfApproval.revision,beforeSelfApproval.revision);assert.equal(store.commits,commitsBeforeSelfApproval);
  assert.equal(ownerState.creator.id,'4050555');assert.equal(ownerState.accepted,null);assert.equal(ownerState.proposals.at(-1).status,'submitted');
  assert.equal(ownerState.proposals.at(-1).reviewedBy,undefined);assert.equal(Object.keys(ownerState.operations).length,1);
  const destinationReader=async url=>{assert.equal(url,'https://github.com/student/project');return {repositoryId:'202',ownerId:'33',owner:'student',repo:'project',repositoryUrl:url};};
  const jam=()=>getJamResponse(new Request(config.origin+`/api/jams/${id}`),id,{...options,destinationReader});
  const hub=()=>catalogResponse(new Request(config.origin+'/api/hub/catalog'),{...authority.hubOptions,reader:async()=>publicCatalog(),destinationReader});
  response=await jam();assert.equal(response.status,200);assert.deepEqual((await response.json()).event.entries,[]);
  response=await hub();assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[]);
  time=Date.parse('2030-01-05T00:00:00Z');
  response=await jam();assert.equal(response.status,200);assert.equal((await response.json()).event.entries.length,1);
  response=await hub();assert.equal(response.status,200);assert.equal((await response.json()).releases.length,1);
  assert.equal(identityCalls.length,8,'Anonymous reveal reads do not dispatch identity or provider fallback requests');
  assert.equal(store.commits,5,'Public projection cannot create registry writes');
  // A real authenticated Free account can participate above but cannot create,
  // and a browser license claim never becomes server entitlement authority.
  time=Date.parse('2030-01-02T12:00:00Z'); // Reuse the fixture's unexpired sign-in.
  const freeProposal={operationId:'http-local-free-proposal',manifest:hostedManifest()};
  response=await postJamProposalResponse(post('participant',proposalPath,freeProposal),options);
  assert.equal(response.status,403);assert.match((await response.json()).error,/Pro license/);
  response=await postJamProposalResponse(post('participant',proposalPath,{...freeProposal,license:'pro'}),options);
  assert.equal(response.status,400);assert.equal(store.commits,5);

});
