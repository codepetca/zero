import test from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../../extension/src/sharing/contracts.js';
import {catalogResponse} from '../lib/sharing-catalog.mjs';
import {hubDiscoveryResponse} from '../lib/hub-discovery.mjs';
import {assertJamVisibilityTime,createJamHubVisibilityReader,isJamHubVisibilityEnforced,readJamHubVisibility} from '../lib/jam-hub-visibility.mjs';
import {hiddenJamsResponse} from '../lib/jams-visibility.mjs';

test('hosted preview cannot expose a production-held project through catalog or discovery',async()=>{
  const env={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview'},identity=contracts.identity('game','123','secret-game');
  const path=contracts.artifactPath(identity,'0.1.0','zip'),release={schema:1,kind:'game',id:identity.id,slug:identity.slug,version:'0.1.0',title:'Held preview project',description:'A held project',license:'MIT',repository:{id:'123',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},contributor:{githubId:'7',login:'student'},source:{commit:'b'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),status:'available',controls:'Arrows',artifacts:{zip:{path,url:`https://artifacts.example/${path}`,size:1,sha256:'e'.repeat(64)}},web:{provider:'github-pages',url:'https://student.github.io/game/',commit:'b'.repeat(40),runId:42}};
  const catalog=contracts.validateCatalog({schema:1,revision:'a'.repeat(40),releases:[release]});
  const project={id:'held-preview',title:'Held preview project',description:'',author:'student',repositoryId:'123',ownerId:'7',sourceCommit:'b'.repeat(40),repositoryUrl:'https://github.com/student/game'};
  const productionDecision={revision:'f'.repeat(40),observedAt:0,isHeld:id=>id==='123'};
  assert.equal(productionDecision.isHeld(release.repository.id),true);
  assert.equal(isJamHubVisibilityEnforced({env}),true);assert.equal(hiddenJamsResponse(env).status,404);
  await assert.rejects(readJamHubVisibility({env}));assert.throws(()=>assertJamVisibilityTime(productionDecision,()=>0,env));
  const response=await catalogResponse(new Request('https://preview.example/api/sharing/catalog'),{env,reader:async()=>catalog});
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Held preview project|game-r123-secret-game/);
  const discovery=await hubDiscoveryResponse(new Request('https://preview.example/api/hub/discovery'),{env,projects:[project],catalogReader:async()=>catalog});
  assert.equal(discovery.status,503);assert.doesNotMatch(await discovery.text(),/Held preview project|game-r123-secret-game/);
  // Even an explicitly injected stale production decision cannot authorize preview output.
  const injected=await catalogResponse(new Request('https://preview.example/api/sharing/catalog'),{env,reader:async()=>catalog,visibilityReader:async()=>productionDecision});
  assert.equal(injected.status,503);
});

test('a transition to preview during a snapshot fails closed',async()=>{
  const env={NODE_ENV:'development'};
  const reader=createJamHubVisibilityReader({store:{snapshot:async()=>{env.VERCEL_ENV='preview';return {revision:'a'.repeat(40),ids:[],settlements:{schema:1,operations:{}},read:async()=>null};}}});
  await assert.rejects(reader({env}));
});
