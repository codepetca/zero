import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {hasManualJamPro} from '../entitlements.mjs';
import {fixture,memoryStore,creator,maintainer,participant,hostedManifest,verifiedPages} from './fixtures.mjs';

const input=(extra={})=>({actor:creator,operationId:'manual-pro-proposal-001',manifest:hostedManifest(),...extra});
const status=expected=>error=>error.status===expected;
const settle=({actor,operationId,manifest})=>({actor,scope:'proposals',operationId,payload:{manifest}});

test('manual grants accept only bounded exact numeric account IDs, with missing or malformed configuration denying everyone',()=>{
  for(const value of [undefined,null,'',' ',11,[],{},'creator','11,creator','11,','11,,22','011','0','-11','11.0','11e0','11,11','1'.repeat(21),'1'.repeat(8193),Array.from({length:257},(_,i)=>String(i+1)).join(',')]){
    const env={ZERO_JAMS_PRO_GITHUB_IDS:value};
    assert.equal(hasManualJamPro('11',env),false);
  }
  const env={ZERO_JAMS_PRO_GITHUB_IDS:' 11, 22 '};
  assert.equal(hasManualJamPro('11',env),true);assert.equal(hasManualJamPro('22',env),true);
  for(const actor of [11,'11\n','011','creator','33'])assert.equal(hasManualJamPro(actor,env),false);
  assert.equal(hasManualJamPro('11',{NEXT_PUBLIC_ZERO_JAMS_PRO_GITHUB_IDS:'11'}),false);
});

test('direct service defaults deny and callback failures, non-boolean or async grants cannot enable creation',async()=>{
  for(const hook of [undefined,()=>false,()=>1,()=>({pro:true}),()=>Promise.resolve(true),()=>Promise.reject(Error('private grant failure')),()=>{throw Error('private grant failure');}]){
    const store=memoryStore(),service=createJamService({store,verifySource:async()=>assert.fail('No organizer repository fetch'),...(hook?{canCreateJam:hook}:{})});
    await assert.rejects(service.propose(input()),error=>error.status===403&&/Pro license/.test(error.message)&&!error.message.includes('private'));
    assert.equal(store.records.size,0);
  }
});

test('grants bind numeric identity across rename, not login; creator-hosted and browser-supplied license fields cannot bypass',async()=>{
  const env={ZERO_JAMS_PRO_GITHUB_IDS:creator.id},f=fixture({canCreateJam:id=>hasManualJamPro(id,env)});
  const proposed=await f.service.propose(input({actor:{...creator,login:'renamed'}}));
  assert.equal((await f.service.read(proposed.eventId,{...creator,login:'renamed'})).event.creator.id,creator.id);
  await assert.rejects(f.service.propose(input({actor:{id:participant.id,login:creator.login}})),status(403));
  for(const forged of [{pro:true},{license:'pro'},{canCreateJam:true}])await assert.rejects(f.service.propose({...input(),...forged}),status(400));
  await assert.rejects(f.service.propose({actor:creator,operationId:'legacy-pro-001',repositoryUrl:'https://github.com/creator/jam',commit:'a'.repeat(40)}),status(400));
  assert.equal(f.calls(),0);
});

test('revoked Pro retains unknown accepted recovery and applied/not-applied settlement; only fresh creation is denied',async()=>{
  let pro=true;const f=fixture({canCreateJam:()=>pro}),request=input();let once=true;
  f.store.afterCas=()=>{if(once){once=false;throw Error('lost commit response');}};
  await assert.rejects(f.service.propose(request),status(503));pro=false;
  const accepted=await f.service.propose(request);assert.equal(accepted.status,'approved');
  assert.deepEqual(await f.service.propose(request),accepted);
  assert.equal((await f.service.settle(settle(request))).settlement,'applied');
  await assert.rejects(f.service.propose(input({operationId:'revoked-fresh-001'})),status(403));
  const never=input({operationId:'revoked-unaccepted-001'});
  assert.equal((await f.service.settle(settle(never))).settlement,'not-applied');
  assert.equal((await f.service.propose(never)).settlement,'not-applied');
  await assert.rejects(f.service.propose(input({manifest:hostedManifest({title:'Changed'})})),status(409));
  assert.equal(f.store.records.size,1);
});

test('Free participants can join and submit; creator revocation does not change approver or participation authority',async()=>{
  let allowed=true;const f=fixture({canCreateJam:id=>allowed&&id===creator.id,pagesBindingReader:verifiedPages}),proposal=await f.service.propose(input());
  allowed=false;
  await assert.rejects(f.service.mutate({id:proposal.eventId,actor:creator,operationId:'free-self-approval',action:'approve',revision:proposal.revision}),status(403));
  await f.service.mutate({id:proposal.eventId,actor:participant,operationId:'free-join-001',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student/project'});
  await f.service.mutate({id:proposal.eventId,actor:participant,operationId:'free-submit-001',action:'submit',revision:proposal.revision,title:'Free project',description:'A student project.',demoUrl:'https://student.github.io/project/'});
  assert.equal((await f.service.read(proposal.eventId,participant)).entry.title,'Free project');
});

test('nontransactional CAS retries and final admission recheck revoked grants',async()=>{
  let allowed=true;const f=fixture({canCreateJam:()=>allowed}),write=f.store.compareAndSwap.bind(f.store);let attempts=0;
  f.store.compareAndSwap=async(...args)=>{if(++attempts===1){allowed=false;return false;}return write(...args);};
  await assert.rejects(f.service.propose(input()),status(403));assert.equal(attempts,1);assert.equal(f.store.records.size,0);
  let checks=0;const g=fixture({canCreateJam:()=>++checks===1});
  await assert.rejects(g.service.propose(input()),status(403));assert.equal(checks,2);assert.equal(g.store.records.size,0);
});
