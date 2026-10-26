import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePilot} from '../migrate-registry.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {fixture,approved} from './fixtures.mjs';
function transport(f){return (url,options={})=>f.fetchImpl(url,{...options,headers:{...options.headers,Authorization:'Bearer atomic-http-fixture-only-token'},redirect:'error',cache:'no-store'});}
async function prepared(t){const f=await atomicGitHttpFixture(t),old=fixture();await approved(old);f.seed('jam-101',old.store.records.get('jam-101').state);return f;}
test('guarded operator migration applies exactly the inspected head and preserves blob/guard hashes', {timeout:10000},async t=>{
  const f=await prepared(t),options={fetchImpl:transport(f)},plan=await migratePilot(['--plan'],options),result=await migratePilot(['--apply','--expected-head='+plan.head],options);
  assert.equal(result.before,plan.head);assert.equal(f.commits.at(-1).parent,plan.head);assert.deepEqual(result.files,plan.files);assert.equal(result.guardSha,plan.guardSha);
});
for(const drift of ['event','guard'])test(`guarded migration refuses ${drift} drift after preflight without publishing`,{timeout:10000},async t=>{
  const f=await prepared(t),options={fetchImpl:transport(f)},plan=await migratePilot(['--plan'],options);let changed=false;
  f.beforeRequest=({call})=>{if(changed||!call.path.endsWith('/contents/website/vercel.json'))return;changed=true;if(drift==='guard')f.replaceFile('website/vercel.json',JSON.stringify({git:{deploymentEnabled:{'zero-jams-pilot-registry':true}}}));else f.replaceFile('jams/jam-101.json',JSON.stringify({...f.state(),updatedAt:'2030-01-02T12:10:00Z'}));};
  await assert.rejects(migratePilot(['--apply','--expected-head='+plan.head],options),{status:409});assert.equal(f.commits.length,0);assert.equal(f.files.has('zero-jams-v2/settlements.json'),false);
});
test('guarded migration refuses a publication conflict rather than rebasing onto an uninspected guard', {timeout:10000},async t=>{
  const f=await prepared(t),options={fetchImpl:transport(f)},plan=await migratePilot(['--plan'],options);f.beforeRef=()=>f.replaceFile('website/vercel.json',JSON.stringify({git:{deploymentEnabled:{'zero-jams-pilot-registry':true}}}));
  await assert.rejects(migratePilot(['--apply','--expected-head='+plan.head],options),{status:409});assert.equal(f.commits.length,0);assert.equal(f.files.has('zero-jams-v2/settlements.json'),false);assert.equal(f.requests.filter(r=>r.method==='PATCH').length,1);
});
