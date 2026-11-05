import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamPagesAccess} from '../lib/jam-pages-access.mjs';

const input = {owner:'Student',repo:'Game',repositoryId:42,ownerId:7,appId:9,appJwt:'synthetic-jwt',expectedPagesUrl:'https://student.github.io/Game/'};
const repo = () => ({id:42,name:'Game',full_name:'Student/Game',private:false,visibility:'public',owner:{id:7,login:'Student'}});
const installation = () => ({id:11,app_id:9,account:{id:7,login:'Student',type:'User'},target_id:7,target_type:'User',suspended_at:null,permissions:{pages:'read',metadata:'read'}});
const grant = () => ({token:'synthetic-secret',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{pages:'read',metadata:'read'},repository_selection:'selected',repositories:[repo()]});
const pages = () => ({html_url:'https://student.github.io/Game/',public:true,status:'built'});
function fixture(change = () => {}, workflow = false) {
  const sha = 'a'.repeat(40);
  const bodies = workflow ? [null,installation(),grant(),repo(),{...pages(),status:null,build_type:'workflow'},[{sha}],{status:'succeed'},repo()] : [null,installation(),grant(),repo(),pages(),repo()];
  const calls = [];
  const transport = async (url, options) => {
    calls.push({url,options});
    const index = calls.length;
    const entry = {body:bodies[index],status:index===2?201:200,url,headers:{'content-type':'application/json'}};
    change(entry,index);
    return new Response(JSON.stringify(entry.body),{status:entry.status,headers:entry.headers});
  };
  return {read:createJamPagesAccess({transport}),calls};
}
test('uses fixed endpoints and verifies exact grant before Pages read, without returning secrets', async () => {
  const {read,calls} = fixture();
  const result = await read(input);
  assert.deepEqual(result,{status:'observed',htmlUrl:'https://student.github.io/Game/',public:true,pagesStatus:'built',evidence:'pages-built'});
  assert.equal(calls.length,5);
  assert.deepEqual(calls.map(c => c.url),[
    'https://api.github.com/repos/Student/Game/installation',
    'https://api.github.com/app/installations/11/access_tokens','https://api.github.com/repos/Student/Game',
    'https://api.github.com/repos/Student/Game/pages','https://api.github.com/repos/Student/Game']);
  assert.deepEqual(JSON.parse(calls[1].options.body),{repository_ids:[42],permissions:{pages:'read',metadata:'read'}});
  assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-jwt');
  assert.ok(calls.slice(2).every(c => c.options.headers.Authorization==='Bearer synthetic-secret'));
  assert.ok(calls.every(c => c.options.redirect === 'manual' && c.options.credentials === 'omit'));
  assert.doesNotMatch(JSON.stringify(result),/synthetic/);
});
test('accepts reviewed Zero installation permissions but requests only a Pages read token', async () => {
  for (const administration of [false,true]) {
    const {read,calls}=fixture((entry,i) => {
      if (i===1) entry.body.permissions={metadata:'read',repository_creation:'write',contents:'write',workflows:'write',actions:'write',pages:'write',starring:'write',...(administration?{administration:'write'}:{})};
    });
    assert.equal((await read(input)).status,'observed');
    assert.deepEqual(JSON.parse(calls[1].options.body),{repository_ids:[42],permissions:{pages:'read',metadata:'read'}});
  }
});
test('normalizes a root Pages URL returned without a trailing slash',async()=>{
  const expectedPagesUrl='https://games.example.org/';
  const {read}=fixture((entry,i)=>{if(i===4)entry.body.html_url='https://games.example.org';});
  const result=await read({...input,expectedPagesUrl});
  assert.equal(result.status,'observed');assert.equal(result.htmlUrl,expectedPagesUrl);
});
for (const [name,index,mutate] of [
  ['private repository',3,x => x.private=true], ['wrong repository id',3,x => x.id=43],
  ['wrong owner id',3,x => x.owner.id=8], ['wrong account',1,x => x.account.id=8],
  ['wrong app',1,x => x.app_id=10], ['suspended',1,x => x.suspended_at='2026-01-01'],
  ['missing pages permission',1,x => delete x.permissions.pages], ['unreviewed installation permission',1,x => x.permissions.secrets='write'], ['wrong target',1,x => x.target_id=8],
  ['extra token permission',2,x => x.permissions.contents='read'], ['write token permission',2,x => x.permissions.pages='write'],
  ['missing token permission',2,x => delete x.permissions.metadata], ['all repositories',2,x => x.repository_selection='all'],
  ['extra repository',2,x => x.repositories.push(repo())], ['incorrect granted repository',2,x => x.repositories[0].id=43],
  ['expired token',2,x => x.expires_at='2000-01-01T00:00:00Z'], ['overlong token',2,x => x.expires_at=new Date(Date.now()+7200000).toISOString()],
  ['changed authenticated repository',3,x => x.owner.id=8], ['changed final repository',5,x => x.id=43],
  ['changed final owner',5,x => x.owner.id=8], ['final repository becomes private',5,x => x.private=true],
  ['final visibility becomes private',5,x => x.visibility='private'],
  ['ambiguous Pages body',4,x => delete x.public], ['provider tries to reflect a secret',4,x => x.html_url='synthetic-secret'],
]) test(`fails closed on ${name}`, async () => {
  const {read,calls} = fixture((entry,i) => {if (i===index) mutate(entry.body);});
  assert.deepEqual(await read(input),{status:'unavailable'});
  assert.equal(calls.length,index);
});
test('rejects unsafe input before transport',async () => {
  const {read,calls}=fixture();
  for (const value of [{...input,owner:'evil.example/path'}, {...input,repo:'..'}, {...input,repo:'a.git'}, {...input,repositoryId:0}, {...input,appJwt:'secret\r\nX: x'}]) {
    assert.deepEqual(await read(value),{status:'unavailable'});
  }
  assert.equal(calls.length,0);
});
test('does not expose provider or transport errors',async () => {
  const read=createJamPagesAccess({transport:async () => {throw new Error('synthetic-jwt synthetic-secret');}});
  assert.deepEqual(await read(input),{status:'unavailable'});
});
test('rejects redirect, oversized bodies and bad content type',async () => {
  for (const transport of [
    async () => new Response(null,{status:301,headers:{location:'https://evil.example'}}),
    async () => new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),
    async () => new Response('{}',{headers:{'content-type':'text/html'}}),
  ]) assert.deepEqual(await createJamPagesAccess({transport})(input),{status:'unavailable'});
});
test('timeouts bound logical calls and concurrency admission',async () => {
  let count=0;
  const read=createJamPagesAccess({transport:() => {count++; return new Promise(() => {});},timeoutMs:15,maxConcurrent:1});
  const pending=read(input);
  assert.deepEqual(await read(input),{status:'unavailable'});
  assert.deepEqual(await pending,{status:'unavailable'});
  assert.equal(count,1);
});

test('workflow success requires authenticated Pages deployment status, generic URLs and status are ignored', async () => {
  const {read,calls} = fixture((entry,i) => {if (i === 5) entry.body[0] = {sha:'a'.repeat(40),status:'failure',url:'https://evil.example',environment_url:'https://evil.example'};},true);
  assert.deepEqual(await read(input),{status:'observed',htmlUrl:input.expectedPagesUrl,public:true,pagesStatus:null,evidence:'pages-deployment-succeed'});
  assert.equal(calls[4].options.headers.Authorization,'Bearer synthetic-secret');
  assert.equal(calls[4].url,'https://api.github.com/repos/Student/Game/deployments?per_page=10&page=1');
  assert.equal(calls[5].url,`https://api.github.com/repos/Student/Game/pages/deployments/${'a'.repeat(40)}`);
  assert.equal(calls[5].options.headers.Authorization,'Bearer synthetic-secret');
});
for (const status of [401,403,429]) test(`deployment list ${status} fails closed without anonymous retry`,async () => {
  const {read,calls}=fixture((entry,i) => {if(i===5) entry.status=status;},true);
  assert.deepEqual(await read(input),{status:'unavailable'});
  assert.equal(calls.length,5);
  assert.ok(calls.every(c=>c.options.headers.Authorization));
});
for (const [name,index,mutate] of [
  ['generic success is not Pages success',6,x => x.status='failure'],
  ['malformed candidate cannot select path',5,x => x[0].sha='../../evil'],
  ['no candidate',5,x => x.pop()],
  ['too many candidates',5,x => {while (x.length < 11) x.push({sha:'b'.repeat(40)});}],
  ['null status without workflow',4,x => x.build_type='legacy'],
]) test(`workflow fails closed: ${name}`,async () => {
  const {read}=fixture((entry,i) => {if (i===index) mutate(entry.body);},true);
  assert.deepEqual(await read(input),{status:'unavailable'});
});
test('a later candidate can succeed after a Pages-specific 404',async () => {
  const calls=[]; const a='a'.repeat(40), b='b'.repeat(40);
  const bodies=[installation(),grant(),repo(),{...pages(),status:null,build_type:'workflow'},[{sha:a},{sha:b}],null,{status:'succeed'},repo()];
  const read=createJamPagesAccess({transport:async (url,options) => {const i=calls.push({url,options})-1; return i===5 ? new Response(null,{status:404}) : new Response(JSON.stringify(bodies[i]),{status:i===1?201:200,headers:{'content-type':'application/json'}});}});
  assert.equal((await read(input)).evidence,'pages-deployment-succeed');
  assert.equal(calls[6].url,`https://api.github.com/repos/Student/Game/pages/deployments/${b}`);
});
