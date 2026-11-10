import test from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../../extension/src/sharing/contracts.js';
import app from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubProjectPageResponse} from '../lib/hub-project-page.mjs';

const commit='a'.repeat(40);
const origin='https://zero.example';
const game = (number, title=`Game ${number}`, slug='sample') => {
  const repositoryId=String(number);
  const identity=contracts.identity('game',repositoryId,slug);
  const version='1.0.0';
  const path=contracts.artifactPath(identity,version,'zip');
  return {schema:1,kind:'game',id:identity.id,slug:identity.slug,version,title,description:'Move a ship.',license:'MIT',
    repository:{id:repositoryId,ownerId:'7',owner:'student',name:`game-${number}`,url:`https://github.com/student/game-${number}`},
    contributor:{githubId:'7',login:'student'},source:{commit,folder:'.',sha256:'c'.repeat(64)},
    policyRevision:'d'.repeat(40),status:'available',artifacts:{zip:{path,url:`https://artifacts.example/${path}`,size:10,sha256:'e'.repeat(64)}},
    controls:'Arrows'};
};
const maintained = number => ({
  id:`maintained-${number}`,title:`Maintained ${number}`,description:'Draw.',author:'student',
  repositoryId:String(number),ownerId:'7',repositoryUrl:`https://github.com/student/game-${number}`,sourceCommit:commit
});
const catalog = (releases, revision=commit) => ({schema:1,revision,releases});
const visibility = (held=[]) => ({revision:commit,observedAt:Date.now(),isHeld:id=>held.includes(id)});
const options = extra => ({
  env:{NODE_ENV:'test'},projects:[],previews:[],authors:[],visibilityReader:async()=>visibility(),
  destinationReader:async url=>({repositoryUrl:url,owner:'student',repo:new URL(url).pathname.split('/').at(-1),
    repositoryId:url.split('-').at(-1),ownerId:'7'}),
  catalogReader:async()=>catalog([]),...extra
});
async function request(opts, params={}) {
  const response=await hubProjectPageResponse(new Request(`${origin}/api/hub/projects/discover?${new URLSearchParams(params)}`),opts);
  return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
}

test('combined maintained and shared pages check only displayed candidates and lookahead',async()=>{
  const releases=Array.from({length:61},(_,index)=>game(100+index));
  const checked=[];
  const opts=options({projects:[maintained(500),maintained(501)],catalogReader:async()=>catalog(releases),
    visibilityReader:async()=>visibility(['101'])});
  const readDestination=opts.destinationReader;
  opts.destinationReader=async url=>{checked.push(url);return readDestination(url);};
  const seen=[];
  let cursor;
  for (const expected of [24,24,14]) {
    checked.length=0;
    const {status,cache,body}=await request(opts,cursor?{cursor}:{});
    assert.equal(status,200,JSON.stringify(body));
    assert.equal(cache,'no-store');
    const ids=[...body.maintained.map(item=>item.repositoryId),...body.catalog.releases.map(item=>item.repository.id)];
    assert.equal(ids.length,expected);
    assert.ok(checked.length<=25);
    assert.ok(!checked.some(url=>url.endsWith('/game-101')));
    seen.push(...ids);
    cursor=body.next;
  }
  assert.equal(cursor,null);
  assert.equal(new Set(seen).size,seen.length);
  assert.ok(!seen.includes('101'));
});

test('distinct games in the same repository retain their catalog identities',async()=>{
  const opts=options({catalogReader:async()=>catalog([game(103,'First game','first'),game(103,'Second game','second')])});
  const {status,body}=await request(opts);
  assert.equal(status,200);
  assert.deepEqual(body.catalog.releases.map(item=>item.slug),['first','second']);
});

test('server search finds matches beyond the first page, and cursors bind to query and catalog revision',async()=>{
  const releases=Array.from({length:100},(_,index)=>game(200+index,index===99?'Last Needle':undefined));
  let revision=commit, calls=0;
  const opts=options({catalogReader:async()=>catalog(releases,revision)});
  const readDestination=opts.destinationReader;
  opts.destinationReader=async url=>{calls++;return readDestination(url);};
  const first=await request(opts);
  assert.equal(first.status,200);
  assert.ok(first.body.next);
  assert.ok(!first.body.catalog.releases.some(item=>item.title==='Last Needle'));
  calls=0;
  const found=await request(opts,{q:'needle'});
  assert.equal(found.status,200);
  assert.deepEqual(found.body.catalog.releases.map(item=>item.title),['Last Needle']);
  assert.equal(found.body.next,null);
  assert.equal(calls,1);
  assert.equal((await request(opts,{q:'needle',cursor:first.body.next})).status,400);
  revision='b'.repeat(40);
  const stale=await request(opts,{cursor:first.body.next});
  assert.equal(stale.status,409);
  assert.equal(stale.body.code,'restart');
});

test('published listings fill the same page and check Play only on the later request',async()=>{
  const rows=Array.from({length:30},(_,index)=>{
    const repositoryId=String(700+index);
    return {repositoryId,accountId:'7',order:String(1000-index),commit,runId:'123',title:`Listing ${index}`,author:'student',
      repositoryUrl:`https://github.com/student/game-${repositoryId}`,pagesUrl:`https://student.github.io/game-${repositoryId}/`};
  });
  const played=[];
  const opts=options({projects:[maintained(401)],catalogReader:async()=>catalog([game(402)]),
    env:{NODE_ENV:'test',ZERO_HUB_LISTINGS_ENABLED:'1',ZERO_HUB_GITHUB_CLIENT_ID:app.clientId,
      ZERO_HUB_GITHUB_CLIENT_SECRET:'fixture-only-secret-value',ZERO_HUB_GITHUB_SESSION_SECRET:'11'.repeat(32)},
    getStore:()=>({
      discover:async(before,search,excluded,limit)=>rows.filter(row=>(before===null||+row.order<+before)&&
        (!search||row.title.toLowerCase().includes(search))&&!excluded.includes(row.repositoryId)).slice(0,limit),
      stillListed:async entries=>entries
    }),
    listingDestinationReader:async()=>true,playReader:async entry=>{played.push(entry.repositoryId);return entry.pagesUrl;}});
  const first=await request(opts);
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.listings.length,22);
  assert.equal(first.body.maintained.length,1);
  assert.equal(first.body.catalog.releases.length,1);
  assert.equal(played.length,0);
  assert.ok(first.body.listings.every(item=>!item.pagesUrl && !('order' in item) && !('accountId' in item)));
  assert.ok(first.body.next);
  const recheck=await request(opts,{revalidate:'1'});
  assert.equal(recheck.status,200);
  assert.equal(played.length,22);
  assert.deepEqual(recheck.body.listings.map(item=>item.identity),first.body.listings.map(item=>item.identity));
  assert.ok(recheck.body.listings.every(item=>item.pagesUrl));
  const next=await request(opts,{cursor:first.body.next});
  assert.equal(next.status,200);
  assert.deepEqual(next.body.listings.map(item=>item.id),rows.slice(22).map(item=>item.repositoryId));
  assert.equal(next.body.next,null);
  assert.equal(played.length,22);
});

test('a newly held project disappears on a fresh page check without exposing its metadata',async()=>{
  const releases=[game(321,'Held game'),game(322,'Public game')];
  let held=[];
  const opts=options({catalogReader:async()=>catalog(releases),visibilityReader:async()=>visibility(held)});
  assert.equal((await request(opts)).body.catalog.releases.length,2);
  held=['321'];
  const result=await request(opts,{revalidate:'1'});
  assert.deepEqual(result.body.catalog.releases.map(item=>item.title),['Public game']);
  assert.doesNotMatch(JSON.stringify(result.body),/Held game|game-321/);
});

test('published listing discovery retains the legacy configuration gate',async()=>{
  const result=await request(options({env:{NODE_ENV:'test',ZERO_HUB_LISTINGS_ENABLED:'1'},
    projects:[maintained(401)],getStore:()=>assert.fail('invalid Hub configuration reached listings')}));
  assert.equal(result.status,200);
  assert.equal(result.body.maintained.length,1);
  assert.deepEqual(result.body.listings,[]);
});
