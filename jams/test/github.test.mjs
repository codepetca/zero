import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGitHubSourceVerifier} from '../github-source.mjs';
import {createGitHubJamStore} from '../github-store.mjs';
import {manifest,fixture,approved,creator,COMMIT} from './fixtures.mjs';

const TOKEN='fixture-server-token';
const json=(value,status=200)=>Response.json(value,{status});
const blob=bytes=>({type:'file',path:'zero-jam.json',sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),size:bytes.length,encoding:'base64',content:bytes.toString('base64')});
function githubFixture(overrides={}) {
  const calls=[],content=blob(Buffer.from(JSON.stringify(manifest())));
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/repos/creator/jam'))return json({id:101,owner:{id:11,type:'User'},full_name:'creator/jam',private:false,visibility:'public',...overrides.repository});
    if(url.endsWith(`/git/commits/${COMMIT}`))return json({sha:COMMIT,...overrides.commit});
    if(url.endsWith(`/contents/zero-jam.json?ref=${COMMIT}`))return json({...content,...overrides.content});
    throw Error('Unexpected external request.');
  };
  return {calls,fetchImpl};
}
const sourceInput={repositoryUrl:'https://github.com/creator/jam',commit:COMMIT,actor:creator,manifest:true};
test('source verifier checks numeric owner, exact source and Git blob integrity without fetching website',async()=>{
  const f=githubFixture(),verify=createGitHubSourceVerifier({token:TOKEN,fetchImpl:f.fetchImpl});
  const result=await verify(sourceInput);assert.equal(result.repository.id,'101');assert.equal(result.manifest.title,'Jam title');assert.equal(f.calls.length,3);
  for(const {url,options}of f.calls){assert.ok(url.startsWith('https://api.github.com/repos/creator/jam'));assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,`Bearer ${TOKEN}`);}
});
test('private, transferred, organization, redirected or mismatched-commit source cannot propose',async()=>{
  for(const overrides of [{repository:{private:true}},{repository:{owner:{id:99,type:'User'}}},{repository:{owner:{id:11,type:'Organization'}}},{commit:{sha:'b'.repeat(40)}},{content:{sha:'c'.repeat(40)}}]){
    const f=githubFixture(overrides);await assert.rejects(createGitHubSourceVerifier({token:TOKEN,fetchImpl:f.fetchImpl})(sourceInput));
  }
  await assert.rejects(createGitHubSourceVerifier({token:TOKEN,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://internal.invalid'}})})(sourceInput),error=>error.status===503);
  const noToken=createGitHubSourceVerifier();assert.equal(typeof noToken,'function');await assert.rejects(noToken(sourceInput),error=>error.status===503);
});
test('source response sizes and URLs are bounded',async()=>{
  const f=githubFixture({content:{size:50000}});await assert.rejects(createGitHubSourceVerifier({token:TOKEN,fetchImpl:f.fetchImpl})(sourceInput));
  let calls=0;const verify=createGitHubSourceVerifier({token:TOKEN,fetchImpl:async()=>{calls++;return json({});}});
  await assert.rejects(verify({...sourceInput,repositoryUrl:'https://github.com/creator/jam?redirect=evil'}),error=>error.status===400);assert.equal(calls,0);
  await assert.rejects(createGitHubSourceVerifier({token:TOKEN,fetchImpl:async()=>new Response('x'.repeat(40000),{headers:{'content-type':'application/json'}})})(sourceInput),error=>error.status===503);
});
test('large student commits use Git commit metadata and never request diff/patch contents',async()=>{
  const f=githubFixture();
  const verify=createGitHubSourceVerifier({token:TOKEN,fetchImpl:async(url,options)=>{
    if(url.endsWith(`/commits/${COMMIT}`)&&!url.includes('/git/commits/'))return json({sha:COMMIT,files:[{patch:'x'.repeat(2_000_000)}]});
    return f.fetchImpl(url,options);
  }});
  assert.equal((await verify({...sourceInput,manifest:false})).repository.commit,COMMIT);
  assert.equal(f.calls.length,2);assert.ok(f.calls[1].url.endsWith(`/git/commits/${COMMIT}`));
});
test('store fixes branch/path, verifies blob bytes and writes with expected revision and atomic operation record',async()=>{
  const f=fixture();await approved(f);const state=f.store.records.get('jam-101').state;
  const bytes=Buffer.from(JSON.stringify(state)+'\n'),resource={...blob(bytes),path:'jams/jam-101.json'};
  const calls=[];
  const store=createGitHubJamStore({token:TOKEN,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(options.method==='PUT'){const body=JSON.parse(options.body);assert.equal(body.branch,'zero-jams-registry');assert.equal(body.sha,resource.sha);assert.equal(body.content,bytes.toString('base64'));return json({content:{sha:resource.sha}},200);}
    if(url.includes('/contents/jams/jam-101.json?'))return json(resource);
    if(url.includes('/contents/jams?'))return json([{name:'jam-101.json',path:'jams/jam-101.json',type:'file',sha:resource.sha}]);
    throw Error('Unexpected destination');
  }});
  assert.deepEqual(await store.list(),['jam-101']);const read=await store.read('jam-101');assert.deepEqual(read.state,state);
  assert.equal(await store.compareAndSwap('jam-101',read.revision,state),true);
  assert.ok(calls.every(({url})=>url.startsWith('https://api.github.com/repos/codepetca/zero/')));
  assert.ok(Object.keys(JSON.parse(Buffer.from(JSON.parse(calls.at(-1).options.body).content,'base64')).operations).length===2);
});
test('missing branch is setup failure; existing branch missing file is empty; no automatic branch creation',async()=>{
  const calls=[];let exists=false;
  const store=createGitHubJamStore({token:TOKEN,fetchImpl:async(url,options)=>{calls.push({url,options});return url.includes('/branches/')&&exists?json({name:'zero-jams-registry',commit:{sha:COMMIT}}):json({},404);}});
  await assert.rejects(store.read('jam-101'),error=>error.status===503);exists=true;
  assert.deepEqual(await store.read('jam-101'),{state:null,revision:null});assert.deepEqual(await store.list(),[]);
  assert.ok(calls.every(({options})=>options.method==='GET'));
});
test('CAS conflicts retry cleanly; ambiguous upstream outcomes remain unknown; corrupted blobs fail closed',async()=>{
  const f=fixture();await approved(f);const state=f.store.records.get('jam-101').state;
  let mode='conflict';
  const store=createGitHubJamStore({token:TOKEN,fetchImpl:async(url,options)=>{
    if(options.method==='PUT')return mode==='conflict'?json({},409):json({content:{sha:'c'.repeat(40)}},200);
    return json({...blob(Buffer.from(JSON.stringify(state))),path:'jams/jam-101.json',sha:'d'.repeat(40)});
  }});
  assert.equal(await store.compareAndSwap('jam-101',COMMIT,state),false);mode='unknown';
  await assert.rejects(store.compareAndSwap('jam-101',COMMIT,state),error=>error.status===503&&error.message.includes('unknown'));
  await assert.rejects(store.read('jam-101'),error=>error.status===503);
  await assert.rejects(store.read('../arbitrary'),error=>error.status===400);
});
