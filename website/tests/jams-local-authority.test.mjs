import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalJamAuthority} from '../lib/jams-local-authority.mjs';
import {getJamResponse} from '../lib/jams-http.mjs';
import {catalogResponse} from '../lib/sharing-catalog.mjs';
import {JAM_PROJECTION_REVISION} from '../../jams/service.mjs';
import {hostedManifest,creator,participant} from '../../jams/test/fixtures.mjs';
import contracts from '../../extension/src/sharing/contracts.js';

const clone=value=>structuredClone(value);
const owner={id:'4050555',login:'armorup'};
const disabled=error=>error.status===503;
function storeFixture(){
  let document={events:{},settlements:{schema:1,operations:{}}},version=0,tail=Promise.resolve();
  const issue=(data,n)=>{const pinned=clone(data);return {revision:n.toString(16).padStart(40,'0'),ids:Object.keys(pinned.events),settlements:clone(pinned.settlements),async read(id){return {state:clone(pinned.events[id]??null)};}};};
  const store={available:true,stalled:false,transactions:0,commits:0,locked:false,beforeTransaction:null,afterCallback:null,
    async snapshot(){if(!store.available)throw Error('PRIVATE_AUTHORITY_FAILURE');if(store.stalled)return new Promise(()=>{});return issue(document,version);},
    async compareAndSwap(){assert.fail('root CAS escaped local transaction');},
    async transact(work,{signal}={}){
      let unlock;const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;
      let dirty=false;const next=clone(document);let n=version;
      try{
        await store.beforeTransaction?.();if(!store.available)throw Error('PRIVATE_AUTHORITY_FAILURE');if(signal?.aborted)throw Error('canceled');
        store.transactions++;store.locked=true;
        const result=await work({snapshot:async()=>issue(next,n),async compareAndSwap(id,expected,state,{settlements}={}){
          if(signal?.aborted)throw Error('canceled');if(expected!==n.toString(16).padStart(40,'0'))return false;
          if(id!==null)next.events[id]=clone(state);if(settlements!==undefined)next.settlements=clone(settlements);n++;dirty=true;return true;
        }});
        await store.afterCallback?.();
        if(dirty){document=next;version=n;store.commits++;}return result;
      }finally{store.locked=false;unlock();}
    }};
  return store;
}
function fixture(extra={}){
  const store=storeFixture(),env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'};let time=Date.parse('2030-01-02T12:00:00Z');
  const options={env,store,now:()=>time,verifySource:async()=>assert.fail('no source fetch expected'),
    verifyRepository:async({actor})=>{assert.equal(store.locked,false);return {repository:{id:'202',ownerId:actor.id,fullName:`${actor.login}/project`}};},
    pagesBindingReader:async(repo,pagesUrl)=>{assert.equal(store.locked,false);return {status:'verified',pagesUrl,repositoryId:repo.id,ownerId:repo.ownerId};},...extra};
  return {store,env,options,compose:()=>createLocalJamAuthority(options),setTime:value=>{time=Date.parse(value);}};
}
function catalog(){
  const identity=contracts.identity('game','202','project'),version='0.1.0',path=contracts.artifactPath(identity,version,'zip');
  return contracts.validateCatalog({schema:1,revision:'a'.repeat(40),releases:[{schema:1,kind:'game',id:identity.id,slug:'project',version,title:'Student project',description:'Synthetic project',license:'MIT',
    repository:{id:'202',ownerId:participant.id,owner:participant.login,name:'project',url:'https://github.com/student/project'},contributor:{githubId:participant.id,login:participant.login},
    source:{commit:'b'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),status:'available',controls:'Open the project',
    artifacts:{zip:{path,url:`https://artifacts.example/${path}`,size:1,sha256:'e'.repeat(64)}}}]});
}
const destinationReader=async url=>{assert.equal(url,'https://github.com/student/project');return {repositoryId:'202',ownerId:participant.id,owner:'student',repo:'project',repositoryUrl:url};};
const request=path=>new Request(`http://127.0.0.1:3000${path}`);

test('one local transactional authority carries shared holds through actual Jam and Hub HTTP orchestration',async()=>{
  const f=fixture(),authority=f.compose(),events=[];
  assert.ok(Object.isFrozen(authority.jamOptions));assert.ok(Object.isFrozen(authority.hubOptions));
  assert.equal(authority.jamOptions.visibilityReader,authority.hubOptions.visibilityReader);
  for(let i=0;i<2;i++){
    const manifest=hostedManifest();manifest.schedule.galleryRevealAt=i?'2030-01-06T00:00:00Z':'2030-01-05T00:00:00Z';
    const p=await authority.service.propose({actor:i?owner:creator,operationId:`local-proposal-${i}`,manifest});events.push(p);
    await assert.rejects(authority.service.mutate({id:p.eventId,revision:p.revision,actor:{id:'22',login:'other'},operationId:`local-forged-${i}`,action:'approve'}),error=>error.status===403);
    await authority.service.mutate({id:p.eventId,revision:p.revision,actor:participant,operationId:`local-join-${i}`,action:'join',repositoryUrl:'https://github.com/student/project'});
    await authority.service.mutate({id:p.eventId,revision:p.revision,actor:participant,operationId:`local-submit-${i}`,action:'submit',title:'Project',description:'Synthetic project',demoUrl:'https://student.github.io/project/'});
  }
  const jam=()=>getJamResponse(request(`/api/jams/${events[0].eventId}`),events[0].eventId,{...authority.jamOptions,destinationReader});
  const hub=()=>catalogResponse(request('/api/hub/catalog'),{...authority.hubOptions,reader:async()=>catalog(),destinationReader});
  f.setTime('2030-01-05T00:00:00Z');
  let response=await jam();assert.equal(response.status,200);let body=await response.json();assert.equal(body.event.galleryRevealed,true);assert.deepEqual(body.event.entries,[]);
  response=await hub();assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[]);
  f.env.ZERO_JAMS_ENABLED='0';assert.deepEqual((await authority.service.read(events[0].eventId)).event.entries,[]);
  response=await hub();assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[],'disabling writes must not disable existing holds');
  await assert.rejects(authority.service.settle({}),disabled);
  f.env.ZERO_JAMS_ENABLED='1';f.setTime('2030-01-06T00:00:00Z');
  const projection=await authority.service.read(events[0].eventId),visibility=await authority.visibilityReader();assert.equal(projection[JAM_PROJECTION_REVISION],visibility.revision);
  response=await jam();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).event.entries.length,1);
  response=await hub();assert.equal(response.status,200);assert.equal((await response.json()).releases.length,1);
  f.store.available=false;
  for(const read of [jam,hub]){response=await read();assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/PRIVATE_|Student project|student\/project/);}
  await assert.rejects(authority.service.propose({actor:creator,operationId:'local-outage-proposal',manifest:hostedManifest()}),disabled);
});

test('local composition requires explicit providers, one transaction store and a local environment',async()=>{
  const f=fixture();
  for(const env of [{NODE_ENV:'production',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'},{NODE_ENV:'development',VERCEL_ENV:'production',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'},{NODE_ENV:'development',VERCEL_ENV:'preview',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'},{}])
    assert.throws(()=>createLocalJamAuthority({...f.options,env}),disabled);
  for(const patch of [{store:undefined},{store:{snapshot:async()=>{}}},{verifyRepository:undefined},{pagesBindingReader:undefined},{service:{}},{visibilityReader:()=>null}])
    assert.throws(()=>createLocalJamAuthority({...f.options,...patch}),disabled);
  const authority=f.compose();await assert.rejects(authority.visibilityReader({env:{NODE_ENV:'production'}}),disabled);
  f.env.VERCEL_ENV='preview';
  await assert.rejects(authority.service.list(),disabled);await assert.rejects(authority.visibilityReader(),disabled);
});

test('absent or disabled write activation cannot use the returned service or bypass queued admission',async()=>{
  for(const enabled of [undefined,'0']){
    const f=fixture();if(enabled===undefined)delete f.env.ZERO_JAMS_ENABLED;else f.env.ZERO_JAMS_ENABLED=enabled;
    const authority=f.compose();for(const method of ['propose','mutate','settle'])await assert.rejects(authority.service[method]({}),disabled);
    assert.equal(f.store.transactions,0);assert.equal(f.store.commits,0);assert.equal((await authority.visibilityReader()).isHeld('202'),false);
  }
  const f=fixture(),authority=f.compose();f.store.beforeTransaction=()=>{f.env.ZERO_JAMS_ENABLED='0';};
  await assert.rejects(authority.service.propose({actor:creator,operationId:'local-disabled-queued',manifest:hostedManifest()}),disabled);assert.equal(f.store.commits,0);
});

test('disabling writes after a staged CAS does not establish rollback or absence',async()=>{
  const f=fixture(),authority=f.compose();
  const p=await authority.service.propose({actor:creator,operationId:'local-racing-proposal',manifest:hostedManifest()});
  const input={id:p.eventId,revision:p.revision,actor:participant,operationId:'local-racing-join',action:'join',repositoryUrl:'https://github.com/student/project'},commits=f.store.commits;
  // The callback staged its CAS while enabled. The store can still flush that
  // state after this flag change; the composition cannot revoke its SQL work.
  f.store.afterCallback=()=>{f.env.ZERO_JAMS_ENABLED='0';};
  await assert.rejects(authority.service.mutate(input),disabled);assert.equal(f.store.commits,commits+1);
  assert.equal((await authority.visibilityReader()).isHeld('202'),true,'a committed hold stays enforced while new writes are disabled');
  await assert.rejects(authority.service.mutate(input),disabled);
  f.store.afterCallback=null;f.env.ZERO_JAMS_ENABLED='1';
  assert.equal((await authority.service.mutate(input)).status,'joined');assert.equal(f.store.commits,commits+1);
  const state=(await (await f.store.snapshot()).read(p.eventId)).state;
  assert.equal(Object.keys(state.registrations).length,1);assert.equal(state.operations[`${participant.id}:${input.operationId}`].result.status,'joined');
});

test('stalled shared authority fails both HTTP lanes without selecting a fallback',async()=>{
  const f=fixture({visibilityTimeoutMs:15}),authority=f.compose();
  const p=await authority.service.propose({actor:creator,operationId:'local-stall-proposal',manifest:hostedManifest()});
  f.store.stalled=true;
  const responses=await Promise.all([
    getJamResponse(request(`/api/jams/${p.eventId}`),p.eventId,{...authority.jamOptions,responseBudgetMs:20,destinationReader}),
    catalogResponse(request('/api/hub/catalog'),{...authority.hubOptions,responseBudgetMs:20,reader:async()=>catalog(),destinationReader})
  ]);
  assert.ok(responses.every(response=>response.status===503));
});

test('hosted seam restricts the real production process and denies writes without pilot admission',async()=>{
  const {spawnSync}=await import('node:child_process');
  const moduleUrl=new URL('../lib/jams-local-authority.mjs',import.meta.url).href;
  const script=`import assert from 'node:assert/strict';
    import {createHostedJamAuthority,createLocalJamAuthority} from ${JSON.stringify(moduleUrl)};
    let calls=0;const store={snapshot:()=>{calls++;},compareAndSwap:()=>{calls++;},transact:()=>{calls++;}};
    const options={env:{NODE_ENV:'production',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'},store,now:Date.now,verifySource:()=>{},verifyRepository:()=>{},pagesBindingReader:()=>{}};
    if(process.env.VERCEL_ENV==='production'){const authority=createHostedJamAuthority(options);await assert.rejects(authority.service.propose({}),e=>e.status===503);}
    else assert.throws(()=>createHostedJamAuthority(options),e=>e.status===503);
    assert.throws(()=>createLocalJamAuthority(options),e=>e.status===503);
    assert.equal(calls,0);`;
  for(const env of [{NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production'},{NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview'},{NODE_ENV:'development'}]){
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin',...env},encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');
  }
});

test('hosted pilot transactionally caps one hundred distinct registrations despite a larger injected limit',async()=>{
  const {spawnSync}=await import('node:child_process');
  const moduleUrl=new URL('../lib/jams-local-authority.mjs',import.meta.url).href;
  const fixtures=new URL('../../jams/test/fixtures.mjs',import.meta.url).href;
  const script=`import assert from 'node:assert/strict';
    import {createHostedJamAuthority} from ${JSON.stringify(moduleUrl)};
    import {memoryStore,hostedManifest} from ${JSON.stringify(fixtures)};
    const store=memoryStore();let tail=Promise.resolve();store.transact=async fn=>{let release;const previous=tail;tail=new Promise(r=>release=r);await previous;try{return await fn(store);}finally{release();}};
    const env={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_PILOT_ENABLED:'1',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'};
    const authority=createHostedJamAuthority({env,store,now:()=>Date.parse('2030-01-02T12:00:00Z'),limits:{participants:200},
      verifySource:async()=>{},verifyRepository:async({actor})=>({repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:actor.login+'/project'}}),pagesBindingReader:async()=>({status:'unverified'})});
    const proposal=await authority.service.propose({actor:{id:'11',login:'creator'},operationId:'pilot-proposal-0001',manifest:hostedManifest()});
    const inputs=Array.from({length:101},(_,i)=>{const id=String(100+i),login='student'+i;return {id:proposal.eventId,actor:{id,login},operationId:'pilot-join-'+id,action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/'+login+'/project'};});
    const attempts=await Promise.allSettled(inputs.map(input=>authority.service.mutate(input)));
    assert.equal(attempts.filter(a=>a.status==='fulfilled').length,100);
    const rejected=attempts.filter(a=>a.status==='rejected');assert.equal(rejected.length,1);assert.equal(rejected[0].reason.status,429);assert.match(rejected[0].reason.message,/capacity of 100 participants/);
    const event=(await authority.service.list()).events[0];assert.equal(event.participantLimit,100);assert.equal(event.participantCount,100);
    let state=(await (await store.snapshot()).read(proposal.eventId)).state;
    assert.equal(Object.keys(state.registrations).length,100);assert.equal(Object.keys(state.operations).length,101);
    assert.equal((await authority.service.read(proposal.eventId)).event.participantLimit,100);
    // A confirmed operation recovers at capacity; leaving does not free a slot
    // for another distinct identity, while the existing participant may rejoin.
    assert.deepEqual(await authority.service.mutate(inputs[0]),attempts[0].value);
    await authority.service.mutate({id:proposal.eventId,actor:inputs[0].actor,operationId:'pilot-leave-100',action:'leave'});
    await assert.rejects(authority.service.mutate(inputs[100]),e=>e.status===429);
    assert.equal((await authority.service.mutate({...inputs[0],operationId:'pilot-rejoin-100'})).status,'joined');
    state=(await (await store.snapshot()).read(proposal.eventId)).state;
    assert.equal(Object.keys(state.registrations).length,100);assert.equal(Object.keys(state.operations).length,103);
    const second=await authority.service.propose({actor:{id:'4050555',login:'armorup'},operationId:'pilot-proposal-0002',manifest:hostedManifest()});
    assert.equal((await authority.service.mutate({...inputs[100],id:second.eventId,revision:second.revision,operationId:'second-jam-join-200'})).status,'joined');
    assert.equal((await authority.service.read(second.eventId)).event.participantCount,1,'registration capacity is per jam');
    delete process.env.ZERO_JAMS_PILOT_ENABLED;await assert.rejects(authority.service.propose({}),e=>e.status===503);
    assert.equal((await authority.visibilityReader()).isHeld('1001'),false);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin',NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_PILOT_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11,4050555'},encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');
});

test('local authority defaults to Free and rechecks manual numeric grants after queued recovery',async()=>{
  for(const value of [undefined,'','creator','11,invalid']){
    const f=fixture();if(value===undefined)delete f.env.ZERO_JAMS_PRO_GITHUB_IDS;else f.env.ZERO_JAMS_PRO_GITHUB_IDS=value;
    const authority=f.compose();
    await assert.rejects(authority.service.propose({actor:creator,operationId:'local-free-proposal',manifest:hostedManifest()}),error=>error.status===403&&/Pro license/.test(error.message));
    assert.equal(f.store.commits,0);assert.equal((await authority.visibilityReader()).isHeld('202'),false);
  }
  const f=fixture(),authority=f.compose(),request={actor:creator,operationId:'local-pro-proposal',manifest:hostedManifest()};
  const accepted=await authority.service.propose(request);delete f.env.ZERO_JAMS_PRO_GITHUB_IDS;
  assert.deepEqual(await authority.service.propose(request),accepted);
  assert.equal((await authority.service.settle({actor:creator,scope:'proposals',operationId:request.operationId,payload:{manifest:request.manifest}})).settlement,'applied');
  await assert.rejects(authority.service.propose({...request,operationId:'local-free-new-proposal'}),error=>error.status===403);
  f.env.ZERO_JAMS_PRO_GITHUB_IDS=creator.id;f.store.beforeTransaction=()=>{delete f.env.ZERO_JAMS_PRO_GITHUB_IDS;};
  await assert.rejects(authority.service.propose({...request,operationId:'local-queued-revoked-proposal'}),error=>error.status===403);
  assert.equal(f.store.commits,1);
});

test('hosted manual Pro grants use the actual server process, never a grant claimed by an injected env facade',async()=>{
  const {spawnSync}=await import('node:child_process');
  const moduleUrl=new URL('../lib/jams-local-authority.mjs',import.meta.url).href,fixtures=new URL('../../jams/test/fixtures.mjs',import.meta.url).href;
  const script=`import assert from 'node:assert/strict';
    import {createHostedJamAuthority} from ${JSON.stringify(moduleUrl)};
    import {memoryStore,hostedManifest} from ${JSON.stringify(fixtures)};
    const store=memoryStore();store.transact=fn=>fn(store);
    const env={NODE_ENV:'production',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRO_GITHUB_IDS:'11'};
    const authority=createHostedJamAuthority({env,store,now:()=>Date.parse('2030-01-02T12:00:00Z'),verifySource:async()=>{},verifyRepository:async()=>{},pagesBindingReader:async()=>{}});
    const request={actor:{id:'11',login:'renamed'},operationId:'hosted-manual-pro-001',manifest:hostedManifest()};
    if(process.env.ZERO_JAMS_PRO_GITHUB_IDS==='11'){
      const result=await authority.service.propose(request);delete process.env.ZERO_JAMS_PRO_GITHUB_IDS;
      assert.deepEqual(await authority.service.propose(request),result);
      await assert.rejects(authority.service.propose({...request,operationId:'hosted-revoked-new-001'}),e=>e.status===403);
      assert.equal(store.records.size,1);
    }else{await assert.rejects(authority.service.propose(request),e=>e.status===403);assert.equal(store.records.size,0);}`;
  for(const value of [undefined,'creator','11']){
    const env={PATH:process.env.PATH||'/usr/bin:/bin',NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_PILOT_ENABLED:'1',...(value?{ZERO_JAMS_PRO_GITHUB_IDS:value}:{})};
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env,encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');
  }
});
