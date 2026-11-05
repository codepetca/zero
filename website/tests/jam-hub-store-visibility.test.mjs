import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamHubVisibilityReader} from '../lib/jam-hub-visibility.mjs';
import {createJamService} from '../../jams/service.mjs';
import {memoryStore,hostedManifest} from '../../jams/test/fixtures.mjs';

const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'0'};
const production={NODE_ENV:'production',VERCEL_ENV:'production',ZERO_JAMS_ENABLED:'1'};
const now=Date.parse('2030-01-02T12:00:00Z');
const unavailable=/Project visibility is unavailable/;

async function setup(){
  const store=memoryStore(),maintainer={id:'22',login:'maintainer'};
  const service=createJamService({canCreateJam:()=>true,store,verifySource:async()=>{},maintainerIds:[maintainer.id],now:()=>now,
    verifyRepository:async({actor})=>({repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:`${actor.login}/project`}})});
  const events=[];
  for(let i=0;i<2;i++){
    const creator={id:String(11+i),login:`creator${i}`},actor={id:String(33+i),login:`student${i}`};
    const proposal=await service.propose({actor:{id:String(11+i),login:'creator'+i},operationId:`propose-store-${i}`,manifest:hostedManifest()});
    events.push({actor,proposal,join:{id:proposal.eventId,actor,operationId:`join-store-${i}`,action:'join',revision:proposal.revision,repositoryUrl:`https://github.com/${actor.login}/project`}});
  }
  return {store,service,events};
}

test('injected store issues fresh complete authority across two jams and changing revisions',async()=>{
  const {store,service,events}=await setup();let snapshots=0,fetches=0,time=now;
  const reader=createJamHubVisibilityReader({store:{async snapshot(options){snapshots++;return store.snapshot(options);}},clock:()=>time,fetchImpl:async()=>{fetches++;throw Error('Unexpected fallback');}});
  const initial=await reader({env});assert.equal(initial.isHeld('1033'),false);assert.equal(initial.isHeld('1034'),false);
  await service.mutate(events[0].join);const first=await reader({env});assert.notEqual(first.revision,initial.revision);assert.equal(first.isHeld('1033'),true);assert.equal(first.isHeld('1034'),false);
  await service.mutate(events[1].join);const second=await reader({env});assert.notEqual(second.revision,first.revision);assert.equal(second.isHeld('1033'),true);assert.equal(second.isHeld('1034'),true);
  assert.equal(first.isHeld('1034'),false,'prior decisions remain isolated');
  time=Date.parse('2030-01-05T00:00:00Z');const revealed=await reader({env});assert.equal(revealed.revision,second.revision);assert.equal(revealed.isHeld('1033'),false);assert.equal(revealed.isHeld('1034'),false);
  assert.equal(snapshots,4);assert.equal(fetches,0);
  const productionDecision=await reader({env:production});assert.equal(productionDecision.isHeld('1033'),false);assert.equal(snapshots,5);
  assert.equal(await reader({env:{NODE_ENV:'test'}}),null);assert.equal(snapshots,5);
});

test('invalid injected stores or snapshot data fail closed without Git fallback',async()=>{
  let fetches=0;const fetchImpl=async()=>{fetches++;throw Error('Unexpected fallback');};
  for(const store of [undefined,null,{}, {snapshot:'not a function'}])assert.throws(()=>createJamHubVisibilityReader({store,fetchImpl}),unavailable);
  for(const value of [null,{revision:'a'.repeat(40),ids:[],read:async()=>({state:null})},{revision:'bad',ids:[],settlements:{schema:1,operations:{}},read:async()=>({state:null})}]){
    const reader=createJamHubVisibilityReader({fetchImpl,store:{snapshot:async()=>value}});
    await assert.rejects(reader({env}),unavailable);
  }
  const reader=createJamHubVisibilityReader({fetchImpl,store:{snapshot:async()=>{throw Error('private provider error');}}});
  await assert.rejects(reader({env}),error=>unavailable.test(error.message)&&!error.message.includes('private'));
  assert.equal(fetches,0);
});

test('noncooperative snapshot and projection are bounded by cancellation and deadline',async()=>{
  let fetches=0,received;
  const fetchImpl=async()=>{fetches++;throw Error('Unexpected fallback');};
  const reader=createJamHubVisibilityReader({fetchImpl,totalTimeoutMs:20,store:{snapshot:async({signal})=>{received=signal;return new Promise(()=>{});}}});
  await assert.rejects(reader({env}),unavailable);assert.equal(received.aborted,true);
  const controller=new AbortController();const pending=reader({env,signal:controller.signal});controller.abort();await assert.rejects(pending,unavailable);
  const projecting=createJamHubVisibilityReader({fetchImpl,totalTimeoutMs:20,store:{snapshot:async()=>({revision:'a'.repeat(40),ids:['jam-101'],settlements:{schema:1,operations:{}},read:async()=>new Promise(()=>{})})}});
  await assert.rejects(projecting({env}),unavailable);assert.equal(fetches,0);
});
