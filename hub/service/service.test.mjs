import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,rm,writeFile,chmod,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import * as trusted from '../checker/runner.mjs';
import {createHub} from './hub.mjs';
import {validateArtifacts,sha256} from './artifacts.mjs';
import {REQUIRED_GATES} from './report.mjs';
import {AUTH_LIMITS} from './auth-admission.mjs';

const database=process.env.ZERO_HUB_TEST_DATABASE;
if (!database) throw new Error('Use npm run test:postgres for a disposable real PostgreSQL fixture');
const alice={id:'101',login:'alice'};
const bob={id:'202',login:'bob'};
let pool,root,hub,server,origin,checker,calls;

function zip(entries) {
  const local=[]; const central=[]; let position=0;
  for(const [name,data] of entries) {
    const text=Buffer.from(name); const bytes=Buffer.from(data);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(text.length,26);
    const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt32LE(bytes.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(text.length,28);directory.writeUInt32LE(position,42);
    local.push(header,text,bytes);central.push(directory,text);position+=header.length+text.length+bytes.length;
  }
  const directory=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(position,16);
  return Buffer.concat([...local,directory,end]);
}
// Service-only fixtures deliberately replace execution, not Postgres. The real
// container checker and consumer integration have a separate test command.
function passing(bundle) {
  const classes=bundle.descriptor.components.map(({className})=>[`zero/${bundle.descriptor.libraryId}/${className}.class`,Buffer.from('cafebabe0000003d','hex')]);
  const license=['META-INF/LICENSE',bundle.files.LICENSE];
  return {passed:true,policy:'zero-widgets-v1',policyDigest:trusted.expectedPolicyDigest(),sourceDigest:trusted.sourceDigest(bundle),checks:REQUIRED_GATES.map(id=>({id,passed:true,detail:'Service fixture only; no Java execution claimed.'})),platforms:['linux-aarch64'],artifacts:{jar:zip([...classes,license]),sources:zip([...Object.entries(bundle.files).filter(([name])=>name.startsWith('src/')).map(([name,text])=>[name.slice(4),text]),license]),pom:trusted.expectedPom(bundle)}};
}
async function reserve(user=alice) {return hub.reserveLibrary(user,{className:'ValueDisplay',title:'Value display'});}
async function request(route,{method='GET',cookie,csrf,body,requestOrigin=origin}={}) {
  const headers={};if(cookie)headers.Cookie=cookie;if(csrf)headers['X-Zero-CSRF']=csrf;if(method==='POST')headers.Origin=requestOrigin;if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(`${origin}/api/hub${route}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const value=(response.headers.get('content-type')??'').includes('application/json')?await response.json():await response.arrayBuffer();return {response,value};
}
async function signIn() {
  const {response}=await request('/auth/start');assert.equal(response.status,302);
  const cookie=response.headers.get('set-cookie').split(';')[0];const {value}=await request('/session',{cookie});return{cookie,csrf:value.csrfToken,user:value.user};
}
before(async()=>{
  pool=new pg.Pool({connectionString:database,max:10});root=await mkdtemp(path.join(os.tmpdir(),'zero-hub-service-'));
  server=http.createServer((req,res)=>hub.handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  checker={...trusted,checkSubmission:async bundle=>{calls++;return passing(bundle);}};
  hub=createHub({pool,storageRoot:root,checker,origin,localIdentity:alice});await hub.migrate();
});
beforeEach(async()=>{
  await pool.query('TRUNCATE hub_releases,hub_results,hub_submissions,hub_libraries,hub_sessions,hub_oauth_states,hub_users CASCADE');calls=0;
  checker.checkSubmission=async bundle=>{calls++;return passing(bundle);};
  checker.expectedPolicyDigest=trusted.expectedPolicyDigest;
});
after(async()=>{await hub.stop();await new Promise(resolve=>server.close(resolve));await pool.end();await rm(root,{recursive:true,force:true});});

test('explicit local identity and session/Origin/CSRF/logout fail closed',async()=>{
  assert.throws(()=>createHub({pool,storageRoot:root,checker,origin:'https://zero.example',localIdentity:alice}),/loopback/);
  assert.equal((await request('/session')).value.user,null);
  assert.equal((await request('/libraries',{method:'POST',body:{className:'ValueDisplay',title:'Display'}})).response.status,401);
  const actor=await signIn();assert.deepEqual(actor.user,alice);assert.equal(actor.csrf.length,64);
  const disabled=createHub({pool,storageRoot:root,checker,origin});
  const disabledServer=http.createServer(disabled.handler);await new Promise(resolve=>disabledServer.listen(0,'127.0.0.1',resolve));
  try {
    const target=`http://127.0.0.1:${disabledServer.address().port}/api/hub`;
    assert.equal((await (await fetch(target+'/session',{headers:{Cookie:actor.cookie}})).json()).user,null);
    assert.equal((await fetch(target+'/auth/start',{redirect:'manual'})).status,503);
  } finally {await new Promise(resolve=>disabledServer.close(resolve));await disabled.stop();}

  assert.equal((await request('/libraries',{method:'POST',cookie:actor.cookie,body:{className:'ValueDisplay',title:'Display'}})).response.status,403);
  assert.equal((await request('/libraries',{method:'POST',cookie:actor.cookie,csrf:actor.csrf,requestOrigin:'https://evil.invalid',body:{className:'ValueDisplay',title:'Display'}})).response.status,403);
  const prepared=await request('/libraries',{method:'POST',cookie:actor.cookie,csrf:actor.csrf,body:{className:'ValueDisplay',title:'Display'}});assert.equal(prepared.response.status,201);assert.equal(trusted.validateBundle(prepared.value.bundle),prepared.value.bundle);
  assert.equal((await request('/logout',{method:'POST',cookie:actor.cookie,csrf:actor.csrf})).response.status,200);
  assert.equal((await request('/session',{cookie:actor.cookie})).value.user,null);
  assert.equal((await request('/session')).value.user,null);
});

test('numeric owner survives login rename; same login does not confer ownership',async()=>{
  const {bundle,libraryId}=await reserve();await reserve(bob);
  const renamed={id:alice.id,login:'new-name'};const submission=await hub.submit(renamed,bundle);assert.equal(submission.status,'queued');
  await assert.rejects(hub.submit({id:bob.id,login:alice.login},bundle),error=>error.status===403);
  await assert.rejects(hub.getSubmission(bob,submission.id),error=>error.status===404);
  assert.equal((await pool.query('SELECT owner_id FROM hub_libraries WHERE id=$1',[libraryId])).rows[0].owner_id,alice.id);
});

test('concurrent reservations and duplicate version uploads serialize without replacing source',async()=>{
  const reserved=await Promise.all(Array.from({length:10},()=>reserve()));assert.equal(new Set(reserved.map(item=>item.libraryId)).size,10);
  const bundle=reserved[0].bundle;
  const jobs=await Promise.all(Array.from({length:8},()=>hub.submit(alice,bundle)));assert.equal(new Set(jobs.map(job=>job.id)).size,1);
  const changed=structuredClone(bundle);changed.files['API.md']+='Different source';
  await assert.rejects(hub.submit(alice,changed),error=>error.status===409);
  await assert.rejects(pool.query('UPDATE hub_submissions SET bundle=$2 WHERE id=$1',[jobs[0].id,changed]),/immutable/);
});

test('competing different sources for one version admit one immutable candidate',async()=>{
  const {bundle}=await reserve();const other=structuredClone(bundle);other.files['API.md']+='\nCompeting source.\n';
  const attempts=await Promise.allSettled([hub.submit(alice,bundle),hub.submit(alice,other)]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);assert.equal(attempts.find(item=>item.status==='rejected').reason.status,409);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_submissions')).rows[0].n,1);
});

test('public submissions reject forged owner, verdict, artifact and undeclared source fields',async()=>{
  const actor=await signIn();const {bundle}=await reserve();
  for(const field of ['owner','contributor','result','status','artifacts','publish']) {
    const {response}=await request('/submissions',{method:'POST',cookie:actor.cookie,csrf:actor.csrf,body:{...bundle,[field]:{passed:true}}});assert.equal(response.status,400);
  }
  const foreign=structuredClone(bundle);foreign.files['pom.xml']='<project/>';await assert.rejects(hub.submit(alice,foreign),error=>error.status===400);
  const invalid=structuredClone(bundle);invalid.files['src/zero/'+bundle.descriptor.libraryId+'/Other.java']='bad';
  const invalidResponse=await request('/submissions',{method:'POST',cookie:actor.cookie,csrf:actor.csrf,body:invalid});assert.equal(invalidResponse.response.status,400);assert.ok(invalidResponse.value.error.length<=512);assert.notEqual(invalidResponse.value.error,'Submission does not match the source policy');
  assert.equal((await request('/publish',{method:'POST',cookie:actor.cookie,csrf:actor.csrf,body:{passed:true}})).response.status,404);
  assert.equal((await hub.catalog()).libraries.length,0);
});

test('passing trusted result publishes immutable exact bytes; catalog retains versions; retries no replacement',async()=>{
  const {bundle}=await reserve();const job=await hub.submit(alice,bundle);
  assert.equal(await hub.workOnce(),true);assert.equal((await hub.getSubmission(alice,job.id)).status,'checked');
  assert.deepEqual((await Promise.all([hub.publishOnce(),hub.publishOnce()])).sort(),[false,true]);
  const result=await hub.getSubmission(alice,job.id);assert.equal(result.status,'published');assert.equal(result.release.status,'automatically-checked');
  for(const artifact of [...Object.values(result.release.artifacts),result.release.preview]) {
    const {response,value}=await request(artifact.path.slice('/api/hub'.length));assert.equal(response.status,200);assert.equal(sha256(Buffer.from(value)),artifact.sha256);
  }
  const head=await request(result.release.artifacts.jar.path.slice('/api/hub'.length),{method:'HEAD'});assert.equal(head.response.status,200);assert.equal(head.response.headers.get('content-length'),String(result.release.artifacts.jar.size));assert.equal(head.value.byteLength,0);
  const checksum=await request(result.release.artifacts.jar.path.slice('/api/hub'.length)+'.sha256');assert.equal(checksum.response.status,200);assert.equal(Buffer.from(checksum.value).toString().trim(),result.release.artifacts.jar.sha256);
  const second=structuredClone(bundle);second.descriptor.version='0.2.0';await hub.submit(alice,second);await hub.drain();assert.equal((await hub.catalog()).libraries.length,1);assert.equal((await hub.catalog(new URLSearchParams({history:'1'}))).libraries.length,2);
  assert.equal((await request(`/libraries/${bundle.descriptor.libraryId}?version=0.1.0`)).value.version,'0.1.0');
  assert.equal((await hub.submit(alice,bundle)).id,job.id);assert.equal(await hub.publishOnce(),false);
  await assert.rejects(pool.query('UPDATE hub_results SET passed=false WHERE submission_id=$1',[job.id]),/immutable/);
  await assert.rejects(pool.query('DELETE FROM hub_releases WHERE submission_id=$1',[job.id]),/immutable/);
});

test('closed downloads select only the named release and preserve every artifact and checksum',async()=>{
  const {bundle}=await reserve();
  const job=await hub.submit(alice,bundle);await hub.drain();
  const released=(await hub.getSubmission(alice,job.id)).release;
  const next=structuredClone(bundle);next.descriptor.version='0.1.1';await hub.submit(alice,next);await hub.drain();
  const other=await reserve(bob);await hub.submit(bob,other.bundle);await hub.drain();
  const queries=[];
  const boundedPool={query:async(sql,args)=>{queries.push({sql,args});return pool.query(sql,args);},connect:()=>pool.connect()};
  const closed=createHub({pool:boundedPool,storageRoot:root,checker,origin,uploadsEnabled:false});
  const closedServer=http.createServer(closed.handler);await new Promise(resolve=>closedServer.listen(0,'127.0.0.1',resolve));
  const target=`http://127.0.0.1:${closedServer.address().port}`;
  try {
    for(const [kind,artifact] of [...Object.entries(released.artifacts),['preview',released.preview]]) {
      for(const checksum of kind==='preview'?[null]:[null,'sha256','sha1']) {
        queries.length=0;
        const url=target+artifact.path+(checksum?'.'+checksum:'');
        const response=await fetch(url);assert.equal(response.status,200);
        const bytes=Buffer.from(await response.arrayBuffer());
        if(checksum) {
          assert.equal(bytes.toString(),createHash(checksum).update(await readFile(path.join(root,artifact.sha256))).digest('hex')+'\n');
        } else assert.equal(sha256(bytes),artifact.sha256);
        assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'public, max-age=31536000, immutable');
        assert.deepEqual(queries,[{sql:'SELECT manifest FROM hub_releases WHERE library_id=$1 AND version=$2 LIMIT 1',args:[bundle.descriptor.libraryId,'0.1.0']}]);
        const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
      }
    }
    for(const url of [released.artifacts.jar.path.replace(/[^/]+$/,`other-0.1.0.jar`),released.artifacts.jar.path+'.zip',released.preview.path+'.sha256']) {
      queries.length=0;assert.equal((await fetch(target+url)).status,404);assert.equal(queries.length,0);
    }
    queries.length=0;
    const missing=released.artifacts.jar.path.replaceAll('0.1.0','9.9.9');assert.equal((await fetch(target+missing)).status,404);
    assert.deepEqual(queries,[{sql:'SELECT manifest FROM hub_releases WHERE library_id=$1 AND version=$2 LIMIT 1',args:[bundle.descriptor.libraryId,'9.9.9']}]);
  } finally {await new Promise(resolve=>closedServer.close(resolve));await closed.stop();}
});

test('public contributor follows authenticated numeric identity and rename without changing a release',async()=>{
  const {bundle,libraryId}=await reserve();const job=await hub.submit(alice,bundle);await hub.drain();
  const expected={githubId:alice.id,login:alice.login};
  assert.deepEqual((await hub.catalog()).libraries[0].contributor,expected);
  assert.deepEqual((await request(`/libraries/${libraryId}`)).value.contributor,expected);
  assert.deepEqual((await hub.getSubmission(alice,job.id)).release.contributor,expected);
  const stored=(await pool.query('SELECT manifest FROM hub_releases WHERE submission_id=$1',[job.id])).rows[0].manifest;
  await assert.rejects(hub.submit({id:bob.id,login:alice.login},bundle),error=>error.status===403);
  assert.deepEqual((await hub.catalog()).libraries[0].contributor,expected);
  const renamed={id:alice.id,login:'renamed-alice'};
  assert.equal((await hub.submit(renamed,bundle)).id,job.id);
  const updated={githubId:alice.id,login:renamed.login};
  assert.deepEqual((await hub.catalog()).libraries[0].contributor,updated);
  assert.deepEqual((await request(`/libraries/${libraryId}?version=0.1.0`)).value.contributor,updated);
  assert.deepEqual((await hub.getSubmission(renamed,job.id)).release.contributor,updated);
  assert.deepEqual((await pool.query('SELECT manifest FROM hub_releases WHERE submission_id=$1',[job.id])).rows[0].manifest,stored);
});

test('publication transaction retry reuses already stored bytes without replacing a release',async()=>{
  const {bundle}=await reserve();const job=await hub.submit(alice,bundle);await hub.workOnce();
  await pool.query("CREATE FUNCTION hub_fixture_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture interruption'; END; $$; CREATE TRIGGER hub_fixture_fail BEFORE INSERT ON hub_releases FOR EACH ROW EXECUTE FUNCTION hub_fixture_fail_insert()");
  try {await assert.rejects(hub.publishOnce(),/Fixture interruption/);}finally{await pool.query('DROP TRIGGER hub_fixture_fail ON hub_releases; DROP FUNCTION hub_fixture_fail_insert()');}
  assert.equal((await hub.getSubmission(alice,job.id)).status,'checked');assert.equal((await hub.catalog()).libraries.length,0);
  await hub.publishOnce();assert.equal((await hub.getSubmission(alice,job.id)).status,'published');assert.equal((await hub.catalog()).libraries.length,1);assert.equal(await hub.publishOnce(),false);
});

test('failed declared check remains failed and never lists artifacts',async()=>{
  const {bundle}=await reserve();checker.checkSubmission=async source=>({...passing(source),passed:false,checks:[{id:'behavior',passed:false,detail:'Assertion failed'}],artifacts:undefined});
  const job=await hub.submit(alice,bundle);await hub.drain();const result=await hub.getSubmission(alice,job.id);assert.equal(result.status,'failed');assert.equal(result.report.passed,false);assert.equal((await hub.catalog()).libraries.length,0);
});


test('a corrected failed submission reuses an unpublished version with immutable attempt history',async()=>{
  const {bundle}=await reserve();checker.checkSubmission=async source=>({...passing(source),passed:false,checks:[{id:'behavior',passed:false,detail:'First attempt failed'}],artifacts:undefined});
  const failed=await hub.submit(alice,bundle);await hub.drain();const oldReport=(await hub.getSubmission(alice,failed.id)).report;
  const corrected=structuredClone(bundle);corrected.files['API.md']+='\nCorrected behavior notes.\n';checker.checkSubmission=async source=>passing(source);
  const fixed=await hub.submit(alice,corrected);assert.notEqual(fixed.id,failed.id);await hub.drain();
  assert.equal((await hub.getSubmission(alice,fixed.id)).status,'published');assert.equal((await hub.getSubmission(alice,failed.id)).status,'failed');assert.deepEqual((await hub.getSubmission(alice,failed.id)).report,oldReport);
  assert.equal((await hub.catalog()).libraries.length,1);
  const replacement=structuredClone(corrected);replacement.files['API.md']+='Replace published';await assert.rejects(hub.submit(alice,replacement),error=>error.status===409);
});

test('source-stale verdict and malformed artifact are bounded infrastructure failures',async()=>{
  const {bundle}=await reserve();checker.checkSubmission=async source=>({...passing(source),sourceDigest:'a'.repeat(64)});
  const job=await hub.submit(alice,bundle);await hub.drain();assert.equal((await hub.getSubmission(alice,job.id)).status,'failed');assert.equal((await hub.catalog()).libraries.length,0);
  const other=structuredClone(bundle);other.descriptor.version='0.2.0';checker.checkSubmission=async source=>{const result=passing(source);result.artifacts.pom=Buffer.from('<forged/>');return result;};
  const malformed=await hub.submit(alice,other);await hub.drain();assert.equal((await hub.getSubmission(alice,malformed.id)).status,'failed');
});

test('incomplete, duplicate and extra passing gates never create a trusted passing result',async()=>{
  const {bundle}=await reserve();
  const mutations=[report=>{report.checks.pop();},report=>{report.checks[5]={...report.checks[0]};},report=>{report.checks.push({id:'client-receipt',passed:true,detail:'Forged extra gate'});}];
  for(let index=0;index<mutations.length;index++) {
    const source=structuredClone(bundle);source.descriptor.version=`0.1.${index}`;
    checker.checkSubmission=async input=>{const report=passing(input);mutations[index](report);return report;};
    const job=await hub.submit(alice,source);await hub.drain();assert.equal((await hub.getSubmission(alice,job.id)).status,'failed');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_results WHERE submission_id=$1',[job.id])).rows[0].n,0);
  }
  assert.equal((await hub.catalog()).libraries.length,0);
});

test('publisher rejects incomplete persisted gates and a result checked under an older policy implementation',async()=>{
  const {bundle}=await reserve();const incomplete=await hub.submit(alice,bundle);await hub.workOnce();
  await pool.query('ALTER TABLE hub_results DISABLE TRIGGER hub_result_immutable');
  try {await pool.query("UPDATE hub_results SET report=jsonb_set(report,'{checks}','[]'::jsonb) WHERE submission_id=$1",[incomplete.id]);}finally{await pool.query('ALTER TABLE hub_results ENABLE TRIGGER hub_result_immutable');}
  await hub.publishOnce();assert.equal((await hub.getSubmission(alice,incomplete.id)).status,'failed');
  const next=structuredClone(bundle);next.descriptor.version='0.2.0';const stale=await hub.submit(alice,next);await hub.workOnce();
  const checked=(await hub.getSubmission(alice,stale.id)).report;assert.equal(checked.policyDigest,trusted.expectedPolicyDigest());
  checker.expectedPolicyDigest=()=> 'f'.repeat(64);
  await hub.publishOnce();assert.equal((await hub.getSubmission(alice,stale.id)).status,'failed');assert.equal((await hub.catalog()).libraries.length,0);
  assert.deepEqual((await hub.getSubmission(alice,stale.id)).report,checked);
});

test('interrupted worker retries once and concurrent claims check each job once',async()=>{
  const {bundle}=await reserve();let failures=1;checker.checkSubmission=async source=>{calls++;if(failures-->0)throw new Error('Temporary unavailable');return passing(source);};
  const job=await hub.submit(alice,bundle);await hub.workOnce();assert.equal((await hub.getSubmission(alice,job.id)).status,'queued');
  await Promise.all([hub.workOnce(),hub.workOnce()]);await hub.publishOnce();assert.equal(calls,2);assert.equal((await hub.getSubmission(alice,job.id)).status,'published');
  const next=structuredClone(bundle);next.descriptor.version='0.2.0';const nextJob=await hub.submit(alice,next);
  await pool.query("UPDATE hub_submissions SET status='checking',attempts=1,lease_token=$2,lease_until=now()-interval '1 second' WHERE id=$1",[nextJob.id,'11111111-1111-4111-8111-111111111111']);
  await hub.drain();assert.equal((await hub.getSubmission(alice,nextJob.id)).status,'published');
});

test('publisher rejects corrupted internal artifact even with an old passing digest',async()=>{
  const {bundle}=await reserve();const job=await hub.submit(alice,bundle);await hub.workOnce();
  // Fixture-only superuser simulates disk/DB corruption; normal writes are denied.
  await pool.query('ALTER TABLE hub_results DISABLE TRIGGER hub_result_immutable');
  try {await pool.query("UPDATE hub_results SET jar='corrupt'::bytea WHERE submission_id=$1",[job.id]);}finally{await pool.query('ALTER TABLE hub_results ENABLE TRIGGER hub_result_immutable');}
  await hub.publishOnce();assert.equal((await hub.getSubmission(alice,job.id)).status,'failed');assert.equal((await hub.catalog()).libraries.length,0);
});

test('serving verifies immutable stored bytes and refuses byte drift',async()=>{
  const {bundle}=await reserve();const job=await hub.submit(alice,bundle);await hub.drain();const {release}=await hub.getSubmission(alice,job.id);const artifact=release.artifacts.jar;const file=path.join(root,artifact.sha256);const old=await readFile(file);
  await chmod(file,0o600);await writeFile(file,Buffer.from('drift'));assert.equal((await request(artifact.path.slice('/api/hub'.length))).response.status,503);
  await writeFile(file,old);await chmod(file,0o400);
});

test('publisher validates exact source, license and class artifact boundaries',async()=>{
  const {bundle}=await reserve();const good=passing(bundle).artifacts;assert.doesNotThrow(()=>validateArtifacts(bundle,good,trusted.expectedPom));
  assert.throws(()=>validateArtifacts(bundle,{...good,sources:zip([['zero/foreign/ValueDisplay.java','foreign'],['META-INF/LICENSE',bundle.files.LICENSE]])},trusted.expectedPom),/differs/);
  assert.throws(()=>validateArtifacts(bundle,{...good,jar:zip([['evil.class',Buffer.from('cafebabe0000003d','hex')],['META-INF/LICENSE',bundle.files.LICENSE]])},trusted.expectedPom),/undeclared/);
});

function oauthCookies(response) {return response.headers.getSetCookie();}
function oauthSessionCookie(response) {
  const cookie=oauthCookies(response).find(value=>value.startsWith('zero_hub_session='));
  assert.ok(cookie,'A successful sign-in must issue a session cookie');return cookie.split(';')[0];
}
function clearedOAuthCookie(response) {
  assert.ok(oauthCookies(response).includes('zero_hub_oauth=; Path=/api/hub; HttpOnly; SameSite=Lax; Max-Age=0; Secure'));
}
async function withOAuth(provider,action) {
  const calls=[],accessToken=randomBytes(24).toString('hex');
  const oauthHub=createHub({pool,storageRoot:root,checker,origin:'https://zero.example',oauth:{clientId:'local-test-id',clientSecret:'local-test-secret',fetch:async(url,options)=>{
    calls.push({url,options});
    return provider?provider(url,options):Response.json(url.endsWith('/access_token')?{access_token:accessToken,token_type:'bearer'}:{id:101,login:'renamed-alice'});
  }}});
  const server=http.createServer(oauthHub.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const target=`http://127.0.0.1:${server.address().port}/api/hub`;
  try {
    const start=async()=>{
      const response=await fetch(`${target}/auth/start`,{redirect:'manual'});assert.equal(response.status,302);
      const authorize=new URL(response.headers.get('location'));
      const cookie=oauthCookies(response)[0].split(';')[0];
      return {response,authorize,state:authorize.searchParams.get('state'),cookie,binding:cookie.split('=')[1]};
    };
    const callback=({state,cookie},query='code=sample',existingCookie)=>fetch(`${target}/auth/callback?state=${state}&${query}`,{headers:cookie||existingCookie?{Cookie:[cookie,existingCookie].filter(Boolean).join('; ')}:{},redirect:'manual'});
    const session=async cookie=>(await fetch(`${target}/session`,{headers:{Cookie:cookie}})).json();
    await action({calls,start,callback,session,target});
  } finally {await new Promise(resolve=>server.close(resolve));await oauthHub.stop();}
}

test('OAuth PKCE pairs the exact browser binding with single-use state and server profile authority',async()=>{
  await withOAuth(null,async({calls,start,callback,session})=>{
    const first=await start(),other=await start();
    assert.match(first.binding,/^[a-f0-9]{64}$/);
    assert.equal(first.authorize.origin+first.authorize.pathname,'https://github.com/login/oauth/authorize');
    assert.equal(first.authorize.searchParams.get('scope'),'read:user');
    assert.equal(first.authorize.searchParams.get('redirect_uri'),'https://zero.example/api/hub/auth/callback');
    assert.equal(first.authorize.searchParams.get('code_challenge_method'),'S256');
    assert.equal(first.authorize.searchParams.get('code_challenge'),createHash('sha256').update(first.binding,'utf8').digest('base64url'));
    const stored=(await pool.query('SELECT state_hash,binding_hash FROM hub_oauth_states WHERE state_hash=$1',[sha256(first.state)])).rows[0];
    assert.deepEqual(stored,{state_hash:sha256(first.state),binding_hash:sha256(first.binding)});
    for(const attempt of [{state:first.state},{state:first.state,cookie:other.cookie}]) {
      const denied=await callback(attempt);assert.equal(denied.status,403);clearedOAuthCookie(denied);assert.equal(calls.length,0);
    }
    const result=await callback(first);assert.equal(result.status,302);assert.equal(calls.length,2);
    assert.equal(calls[0].url,'https://github.com/login/oauth/access_token');assert.equal(calls[1].url,'https://api.github.com/user');
    const exchange=JSON.parse(calls[0].options.body);
    assert.equal(exchange.code_verifier,first.binding);assert.equal(exchange.code,'sample');assert.equal(exchange.redirect_uri,'https://zero.example/api/hub/auth/callback');
    for(const {options} of calls){assert.equal(options.redirect,'error');assert.equal(options.signal instanceof AbortSignal,true);}
    assert.equal(oauthCookies(result).length,2);clearedOAuthCookie(result);
    const sessionCookie=oauthSessionCookie(result);
    assert.ok(oauthCookies(result).every(value=>value.includes('Path=/api/hub; HttpOnly; SameSite=Lax;')&&value.endsWith('; Secure')));
    assert.deepEqual((await session(sessionCookie)).user,{id:'101',login:'renamed-alice'});
    const replay=await callback(first);assert.equal(replay.status,403);clearedOAuthCookie(replay);assert.equal(calls.length,2);
    const cancelled=await callback(other,'error=access_denied');assert.equal(cancelled.status,403);clearedOAuthCookie(cancelled);assert.equal(calls.length,2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,0);
  });
});

test('OAuth cancellation and invalid callbacks clear only temporary material and preserve an existing session',async()=>{
  await withOAuth(null,async({calls,start,callback,session})=>{
    const signed=await callback(await start());const sessionCookie=oauthSessionCookie(signed);
    for(const query of ['error=access_denied','',`code=${'x'.repeat(513)}`]) {
      const pending=await start(),result=await callback(pending,query,sessionCookie);
      assert.equal(result.status,403);clearedOAuthCookie(result);assert.equal(oauthCookies(result).length,1);
      assert.deepEqual((await session(sessionCookie)).user,{id:'101',login:'renamed-alice'});
      assert.equal((await callback(pending,'code=sample',sessionCookie)).status,403);
    }
    const invalid=await callback({state:'invalid',cookie:'zero_hub_oauth=invalid'},'code=sample',sessionCookie);
    assert.equal(invalid.status,403);clearedOAuthCookie(invalid);assert.equal(oauthCookies(invalid).length,1);
    assert.equal(calls.length,2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,1);
  });
});

test('expired OAuth state cannot exchange identity and still clears the browser binding',async()=>{
  await withOAuth(null,async({calls,start,callback})=>{
    const pending=await start();await pool.query("UPDATE hub_oauth_states SET expires_at=now()-interval '1 second' WHERE state_hash=$1",[sha256(pending.state)]);
    const result=await callback(pending);assert.equal(result.status,403);clearedOAuthCookie(result);assert.equal(calls.length,0);
  });
});

test('OAuth provider failure clears only temporary material while retaining the current session',async()=>{
  let fail=false;const accessToken=randomBytes(24).toString('hex');
  await withOAuth(async url=>{
    if(fail)throw new Error('provider-private-detail');
    return Response.json(url.endsWith('/access_token')?{access_token:accessToken,token_type:'bearer'}:{id:101,login:'alice'});
  },async({calls,start,callback,session})=>{
    const sessionCookie=oauthSessionCookie(await callback(await start()));const before=await session(sessionCookie);
    fail=true;const pending=await start();const result=await callback(pending,'code=sample',sessionCookie);
    assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'GitHub sign-in failed'});
    clearedOAuthCookie(result);assert.equal(oauthCookies(result).length,1);assert.equal(calls.length,3);
    assert.deepEqual(await session(sessionCookie),before);assert.equal((await callback(pending)).status,403);assert.equal(calls.length,3);
  });
});

test('OAuth account changes establish fresh profile identity, session and CSRF',async()=>{
  let profile={id:101,login:'alice'};const accessToken=randomBytes(24).toString('hex');
  await withOAuth(async url=>Response.json(url.endsWith('/access_token')?{access_token:accessToken,token_type:'bearer'}:profile),async({calls,start,callback,session})=>{
    const firstCookie=oauthSessionCookie(await callback(await start()));const first=await session(firstCookie);
    profile={id:202,login:'bob'};
    const changed=await callback(await start(),'code=sample',firstCookie);clearedOAuthCookie(changed);assert.equal(oauthCookies(changed).length,2);
    const secondCookie=oauthSessionCookie(changed);const second=await session(secondCookie);
    assert.notEqual(secondCookie,firstCookie);assert.notEqual(second.csrfToken,first.csrfToken);
    assert.deepEqual(first.user,alice);assert.deepEqual(second.user,bob);assert.equal(calls.length,4);
    assert.equal((await session(firstCookie)).user,null,'Successful account change must retire this browser\'s old session');
    const cancelled=await callback(await start(),'error=access_denied',secondCookie);clearedOAuthCookie(cancelled);
    assert.deepEqual((await session(secondCookie)).user,bob);assert.equal(calls.length,4);
  });
});

test('malformed upstream OAuth credentials and profiles cannot create sessions or reflect payloads',async()=>{
  const accessToken=randomBytes(24).toString('hex');
  const credentials={access_token:accessToken,token_type:'bearer'};
  const cases=[
    {token:Response.json({error:'provider-private-detail'})},
    {token:Response.json({...credentials,access_token:''})},
    {token:Response.json({...credentials,token_type:12})},
    {token:new Response('provider-private-detail')},
    {profile:Response.json({id:'101',login:'alice'})},
    {profile:Response.json({id:101,login:123})},
    {profile:Response.json({id:Number.MAX_SAFE_INTEGER+1,login:'alice'})},
    {profile:Response.json({id:101,login:'provider-private-detail/'})},
    {profile:Response.json({error:'provider-private-detail'})},
    {profile:Response.json(null)},
    {profile:new Response('provider-private-detail',{status:500})},
    {profile:new Response('',{status:302,headers:{Location:'https://unexpected.example'}})}
  ];
  for(const scenario of cases)await withOAuth(async url=>url.endsWith('/access_token')?scenario.token??Response.json(credentials):scenario.profile,async({calls,start,callback})=>{
    const pending=await start(),result=await callback(pending);assert.equal(result.status,502);clearedOAuthCookie(result);
    assert.equal(oauthCookies(result).length,1);assert.equal(calls.length,scenario.token?1:2);
    assert.ok(['GitHub sign-in failed','GitHub identity verification failed'].includes((await result.json()).error));
    assert.equal((await callback(pending)).status,403);assert.equal(calls.length,scenario.token?1:2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,0);
  });
});

test('OAuth rejects declared and streamed oversized token or profile responses',async()=>{
  const accessToken=randomBytes(24).toString('hex');
  for(const phase of ['token','profile'])for(const declared of [true,false]) {
    const limit=phase==='token'?16*1024:64*1024;
    const oversized=()=>declared?new Response('{}',{headers:{'Content-Length':String(limit+1)}}):new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(limit));controller.enqueue(new Uint8Array(1));controller.close();}}));
    await withOAuth(async url=>url.endsWith('/access_token')?(phase==='token'?oversized():Response.json({access_token:accessToken,token_type:'bearer'})):oversized(),async({calls,start,callback})=>{
      const pending=await start(),result=await callback(pending);assert.equal(result.status,502);clearedOAuthCookie(result);
      assert.deepEqual(await result.json(),{error:'GitHub sign-in failed'});assert.equal(calls.length,phase==='token'?1:2);
      assert.equal((await callback(pending)).status,403);assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,0);
    });
  }
});

// A disposable database administrator creates separate fixture LOGIN principals.
// RESET ROLE must still be restricted; startup SET ROLE alone is not isolation.
test('distinct API/checker/publisher logins enforce actual PostgreSQL authority and durable publication',async()=>{
  const {migrateDatabase}=await import('./database.mjs');
  const {createPostgresStorage}=await import('./postgres-storage.mjs');
  const {createRuntimePool,verifyRole}=await import('./runtime.mjs');
  const {createPipeline}=await import('./pipeline.mjs');
  const {randomBytes}=await import('node:crypto');
  await pool.query(await readFile(new URL('../sql/000-roles.sql',import.meta.url),'utf8'));
  await migrateDatabase(pool,{roles:true});
  // Re-running through the NOLOGIN migration owner must work without superuser.
  const migrationClient=await pool.connect();
  try {await migrationClient.query('SET ROLE hub_migration_owner');await migrateDatabase({connect:async()=>({query:(...args)=>migrationClient.query(...args),release:()=>{}})},{roles:true});}
  finally {await migrationClient.query('RESET ROLE');migrationClient.release();}
  const principals={};
  try {
    for(const role of ['api','checker','publisher']) {
      const name=`zero_fixture_${role}_${randomBytes(5).toString('hex')}`;
      const password=randomBytes(24).toString('hex');
      await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);
      await pool.query(`GRANT hub_${role} TO ${name}`);
      const url=new URL(database);url.username=name;url.password=password;
      principals[role]={name,pool:createRuntimePool(url.href,`hub_${role}`)};
      await verifyRole(principals[role].pool,`hub_${role}`);
    }
    const api=principals.api.pool,checking=principals.checker.pool,publishing=principals.publisher.pool;
    const storage=createPostgresStorage(publishing);
    const apiHub=createHub({pool:api,storage:createPostgresStorage(api),checker,origin,localIdentity:alice});
    const {bundle}=await apiHub.reserveLibrary(alice,{className:'ValueDisplay',title:'Role proof'});
    const job=await apiHub.submit(alice,bundle);
    const denied=async(client,sql,args=[])=>assert.rejects(client.query(sql,args),error=>error.code==='42501'||/authority|immutable|transition|queue|finalize/.test(error.message));
    await denied(api,"UPDATE hub_submissions SET status='published' WHERE id=$1",[job.id]);
    await denied(api,'INSERT INTO hub_results(submission_id,source_digest,policy,policy_digest,passed,report) VALUES($1,$2,$3,$4,true,$5)',[job.id,trusted.sourceDigest(bundle),'zero-widgets-v1',trusted.expectedPolicyDigest(),{}]);
    await denied(api,'INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[bundle.descriptor.libraryId,'0.1.0',job.id,{}]);
    await assert.rejects(createPostgresStorage(api).put(Buffer.from('forbidden')),error=>error.code==='42501');
    const client=await api.connect();
    try {await client.query('RESET ROLE');await denied(client,"INSERT INTO hub_objects(digest,size,bytes) VALUES($1,1,$2)",['a'.repeat(64),Buffer.from('x')]);}
    finally {client.release();}
    await denied(checking,"UPDATE hub_submissions SET status='published' WHERE id=$1",[job.id]);
    await denied(checking,'INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[bundle.descriptor.libraryId,'0.1.0',job.id,{}]);
    await assert.rejects(createPostgresStorage(checking).put(Buffer.from('forbidden')),error=>error.code==='42501');
    await denied(checking,'SELECT * FROM hub_oauth_states');
    const resetChecker=await checking.connect();
    try {await resetChecker.query('RESET ROLE');await denied(resetChecker,"UPDATE hub_submissions SET status='published' WHERE id=$1",[job.id]);}
    finally {resetChecker.release();}
    const checkPipeline=createPipeline({pool:checking,storage:()=>Promise.resolve(storage),checker});
    assert.equal(await checkPipeline.workOnce(),true);
    assert.equal((await apiHub.getSubmission(alice,job.id)).status,'checked');
    await denied(publishing,'UPDATE hub_submissions SET lease_token=$2 WHERE id=$1',[job.id,'11111111-1111-4111-8111-111111111111']);
    await denied(publishing,"UPDATE hub_submissions SET status='checking' WHERE id=$1",[job.id]);
    await denied(publishing,'UPDATE hub_results SET passed=false WHERE submission_id=$1',[job.id]);
    await denied(publishing,'SELECT * FROM hub_oauth_states');
    const resetPublisher=await publishing.connect();
    try {await resetPublisher.query('RESET ROLE');await denied(resetPublisher,"UPDATE hub_submissions SET status='checking' WHERE id=$1",[job.id]);}
    finally {resetPublisher.release();}
    await denied(publishing,'UPDATE hub_users SET login=$2 WHERE github_id=$1',[alice.id,'forged']);
    const publishPipeline=createPipeline({pool:publishing,storage:()=>Promise.resolve(storage),checker});
    assert.equal(await publishPipeline.publishOnce(),true);
    const released=await apiHub.getSubmission(alice,job.id);
    assert.equal(released.status,'published');assert.deepEqual(released.release.contributor,{githubId:alice.id,login:alice.login});
    const artifact=released.release.artifacts.jar;
    assert.equal(sha256(await createPostgresStorage(api).read(artifact.sha256,artifact.size)),artifact.sha256);
    const {startHttpService}=await import('./server.mjs');
    const portProbe=http.createServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
    const apiUrl=new URL(database);apiUrl.username=principals.api.name;
    // Reuse the fixture credential solely within this test process.
    apiUrl.password=new URL(api.options.connectionString).password;
    const staged=await startHttpService({ZERO_HUB_ORIGIN:'https://zero.example',ZERO_HUB_PORT:String(port),ZERO_HUB_API_DATABASE_URL:apiUrl.href,ZERO_HUB_GITHUB_CLIENT_SECRET:'ignored-in-read-only-staging'});
    const stagedBase=`http://127.0.0.1:${port}`;
    try {
      assert.deepEqual(await (await fetch(stagedBase+'/healthz')).json(),{ok:true,capabilities:{uploads:false}});
      assert.equal((await (await fetch(stagedBase+'/api/hub/catalog')).json()).capabilities.uploads,false);
      const catalogHead=await fetch(stagedBase+'/api/hub/catalog',{method:'HEAD'});assert.equal(catalogHead.status,200);assert.equal((await catalogHead.arrayBuffer()).byteLength,0);
      const releaseHead=await fetch(stagedBase+'/api/hub/libraries/'+bundle.descriptor.libraryId,{method:'HEAD'});assert.equal(releaseHead.status,200);assert.equal((await releaseHead.arrayBuffer()).byteLength,0);
      assert.deepEqual(await (await fetch(stagedBase+'/api/hub/session')).json(),{user:null,mode:'production',capabilities:{uploads:false}});
      assert.equal((await fetch(stagedBase+'/api/hub/auth/start',{redirect:'manual'})).status,503);
      const response=await fetch(stagedBase+artifact.path);assert.equal(response.status,200);assert.equal(sha256(Buffer.from(await response.arrayBuffer())),artifact.sha256);
      assert.equal((await fetch(stagedBase+artifact.path,{method:'HEAD'})).headers.get('content-length'),String(artifact.size));
    } finally {await staged.close();}
    const bytes=Buffer.from('concurrent object');
    const puts=await Promise.all(Array.from({length:8},()=>storage.put(bytes)));
    assert.equal(new Set(puts.map(item=>item.sha256)).size,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_objects WHERE digest=$1',[sha256(bytes)])).rows[0].n,1);
    await denied(publishing,'UPDATE hub_objects SET bytes=$2 WHERE digest=$1',[sha256(bytes),Buffer.from('drift')]);
    // Administrator-only fixture corruption verifies every read rehashes bytes.
    await pool.query('ALTER TABLE hub_objects DISABLE TRIGGER hub_object_immutable');
    try {await pool.query('UPDATE hub_objects SET bytes=$2 WHERE digest=$1',[sha256(bytes),Buffer.alloc(bytes.length,120)]);}
    finally {await pool.query('ALTER TABLE hub_objects ENABLE TRIGGER hub_object_immutable');}
    await assert.rejects(storage.read(sha256(bytes),bytes.length),/integrity drift/);
    await apiHub.stop();
  } finally {for(const principal of Object.values(principals))await principal.pool.end();}
});

test('runtime login validation rejects extra inherited/settable roles, direct grants and ownership',async()=>{
  const {createRuntimePool,verifyRole}=await import('./runtime.mjs');
  const {randomBytes}=await import('node:crypto');
  const suffix=randomBytes(6).toString('hex');
  const login=`zero_guard_login_${suffix}`,extra=`zero_guard_admin_${suffix}`;
  const fn=`zero_guard_function_${suffix}`,table=`zero_guard_table_${suffix}`;
  const password=randomBytes(24).toString('hex');
  await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'`);
  await pool.query(`GRANT hub_api TO ${login}`);
  await pool.query(`CREATE ROLE ${extra} NOLOGIN`);
  await pool.query(`GRANT INSERT ON hub_releases TO ${extra}`);
  await pool.query(`CREATE FUNCTION public.${fn}() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`);
  await pool.query(`REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC`);
  const {rows:[current]}=await pool.query('SELECT current_database() AS name');
  const db=`"${current.name.replaceAll('"','""')}"`;
  const url=new URL(database);url.username=login;url.password=password;
  const runtime=createRuntimePool(url.href,'hub_api');
  const rejected=()=>assert.rejects(verifyRole(runtime,'hub_api'),error=>error.code==='ZERO_HUB_CONFIG'&&/restricted role/.test(error.message));
  async function badGrant(grant,revoke) {
    await pool.query(grant);
    try {await rejected();} finally {await pool.query(revoke);}
    await verifyRole(runtime,'hub_api');
  }
  try {
    await verifyRole(runtime,'hub_api');
    for(const role of ['pg_write_all_data','pg_read_all_data']) {
      await badGrant(`GRANT ${role} TO ${login}`,`REVOKE ${role} FROM ${login}`);
    }
    // A role reached transitively through the expected group is still forbidden.
    await badGrant(`GRANT ${extra} TO hub_api`,`REVOKE ${extra} FROM hub_api`);
    // NOINHERIT does not protect a connection that can explicitly SET ROLE.
    await badGrant(`GRANT ${extra} TO ${login} WITH INHERIT FALSE, SET TRUE`,`REVOKE ${extra} FROM ${login}`);
    await badGrant(`GRANT hub_api TO ${login} WITH ADMIN TRUE`,`REVOKE ADMIN OPTION FOR hub_api FROM ${login}`);
    await badGrant(`GRANT INSERT ON hub_releases TO ${login}`,`REVOKE INSERT ON hub_releases FROM ${login}`);
    await badGrant(`GRANT INSERT(manifest) ON hub_releases TO ${login}`,`REVOKE INSERT(manifest) ON hub_releases FROM ${login}`);
    await badGrant(`GRANT CREATE ON SCHEMA public TO ${login}`,`REVOKE CREATE ON SCHEMA public FROM ${login}`);
    await badGrant(`GRANT CREATE ON DATABASE ${db} TO ${login}`,`REVOKE CREATE ON DATABASE ${db} FROM ${login}`);
    await badGrant(`GRANT EXECUTE ON FUNCTION public.${fn}() TO ${login}`,`REVOKE EXECUTE ON FUNCTION public.${fn}() FROM ${login}`);
    await badGrant(`ALTER DEFAULT PRIVILEGES GRANT INSERT ON TABLES TO ${login}`,`ALTER DEFAULT PRIVILEGES REVOKE INSERT ON TABLES FROM ${login}`);
    // CONNECT without delegation is the sole directly granted object exception.
    await pool.query(`GRANT CONNECT ON DATABASE ${db} TO ${login}`);await verifyRole(runtime,'hub_api');
    await badGrant(`GRANT CONNECT ON DATABASE ${db} TO ${login} WITH GRANT OPTION`,`REVOKE GRANT OPTION FOR CONNECT ON DATABASE ${db} FROM ${login}`);
    await pool.query(`REVOKE CONNECT ON DATABASE ${db} FROM ${login}`);
    await pool.query(`CREATE TABLE public.${table}(value integer)`);
    await pool.query(`ALTER TABLE public.${table} OWNER TO ${login}`);
    try {await rejected();} finally {await pool.query(`DROP TABLE public.${table}`);}
    await verifyRole(runtime,'hub_api');
    // Runtime groups have no ownership exceptions either; only migration owns.
    await pool.query(`CREATE TABLE public.${table}(value integer)`);
    await pool.query(`ALTER TABLE public.${table} OWNER TO hub_api`);
    try {await rejected();} finally {await pool.query(`DROP TABLE public.${table}`);}
    await verifyRole(runtime,'hub_api');
    const client=await runtime.connect();
    try {
      await client.query('RESET ROLE');
      assert.equal((await client.query("SELECT has_table_privilege(session_user,'hub_releases','INSERT') AS release,has_table_privilege(session_user,'hub_objects','INSERT') AS object")).rows[0].release,false);
      await assert.rejects(client.query('INSERT INTO hub_objects(digest,size,bytes) VALUES($1,1,$2)',['a'.repeat(64),Buffer.from('x')]),error=>error.code==='42501');
      await client.query('SET ROLE hub_api');
    } finally {client.release();}
    await verifyRole(runtime,'hub_api');
  } finally {
    await runtime.end();
    await pool.query(`DROP FUNCTION public.${fn}()`);
    await pool.query(`DROP OWNED BY ${extra}`);
    await pool.query(`DROP ROLE ${extra}`);
    await pool.query(`DROP OWNED BY ${login}`);
    await pool.query(`DROP ROLE ${login}`);
  }
});

test('immutable pipeline target checks and publishes only its own job, with no unrelated lease recovery',async()=>{
  const {createPipeline}=await import('./pipeline.mjs');
  const {createStorage}=await import('./artifacts.mjs');
  const early=await reserve(),chosen=await reserve(),expired=await reserve(bob);
  const first=await hub.submit(alice,early.bundle),second=await hub.submit(alice,chosen.bundle),third=await hub.submit(bob,expired.bundle);
  const lease='11111111-1111-4111-8111-111111111111';
  await pool.query("UPDATE hub_submissions SET status='checking',attempts=1,lease_token=$2,lease_until=now()-interval '1 second' WHERE id=$1",[third.id,lease]);
  const checked=[];checker.checkSubmission=async bundle=>{checked.push(bundle.descriptor.libraryId);return passing(bundle);};
  const pipeline=createPipeline({pool,storage:()=>createStorage(root),checker});
  const target={submissionId:second.id,sourceDigest:trusted.sourceDigest(chosen.bundle)};
  for(const invalid of [{submissionId:second.id},{sourceDigest:target.sourceDigest},{...target,owner:alice.id},null,{...target,submissionId:'invalid'},{...target,sourceDigest:'bad'}])await assert.rejects(pipeline.workOnce(invalid),/exact immutable/);
  assert.equal(await pipeline.workOnce({...target,sourceDigest:'f'.repeat(64)}),false);assert.deepEqual(checked,[]);
  assert.equal(await pipeline.workOnce(target),true);assert.deepEqual(checked,[chosen.libraryId]);
  assert.equal((await hub.getSubmission(alice,first.id)).status,'queued');assert.equal((await hub.getSubmission(bob,third.id)).status,'checking');
  assert.equal((await pool.query('SELECT lease_token FROM hub_submissions WHERE id=$1',[third.id])).rows[0].lease_token,lease);
  await hub.workOnce(); // Create an earlier checked job for publication selection.
  assert.equal((await hub.getSubmission(alice,first.id)).status,'checked');
  assert.equal(await pipeline.publishOnce({...target,sourceDigest:'f'.repeat(64)}),false);
  assert.equal(await pipeline.publishOnce(target),true);
  assert.equal((await hub.getSubmission(alice,first.id)).status,'checked');assert.equal((await hub.getSubmission(alice,second.id)).status,'published');
  assert.equal(await pipeline.publishOnce(target),false);
  assert.deepEqual((await hub.catalog()).libraries.map(release=>release.libraryId),[chosen.libraryId]);
});


test('concurrent sign-ins stop at the account session cap, while same-browser rotation preserves capacity',async()=>{
  const attempts=await Promise.all(Array.from({length:12},()=>request('/auth/start')));
  const accepted=attempts.filter(item=>item.response.status===302);
  const denied=attempts.filter(item=>item.response.status===429);
  assert.equal(accepted.length,AUTH_LIMITS.liveSessionsPerAccount);assert.equal(denied.length,4);
  assert.ok(denied.every(item=>/8 active sign-ins/.test(item.value.error)&&!item.response.headers.has('set-cookie')));
  const oldCookie=accepted[0].response.headers.getSetCookie()[0].split(';')[0];
  const rotated=await request('/auth/start',{cookie:oldCookie});assert.equal(rotated.response.status,302);
  const newCookie=rotated.response.headers.getSetCookie()[0].split(';')[0];assert.notEqual(newCookie,oldCookie);
  assert.equal((await request('/session',{cookie:oldCookie})).value.user,null);
  assert.deepEqual((await request('/session',{cookie:newCookie})).value.user,alice);
  const before=(await request('/session',{cookie:newCookie})).value;
  const rejected=await request('/auth/start',{cookie:'zero_hub_session='+'f'.repeat(64)});assert.equal(rejected.response.status,429);
  assert.deepEqual((await request('/session',{cookie:newCookie})).value,before);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,AUTH_LIMITS.liveSessionsPerAccount);
});

test('concurrent OAuth starts enforce the global pending-state cap without calling GitHub',async()=>{
  await pool.query("INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at) SELECT 'seed-'||n,'binding',now()+interval '10 minutes' FROM generate_series(1,$1::int)n",[AUTH_LIMITS.pendingStates-1]);
  await withOAuth(null,async({target,calls})=>{
    const attempts=await Promise.all(Array.from({length:10},()=>fetch(target+'/auth/start',{redirect:'manual'})));
    assert.equal(attempts.filter(item=>item.status===302).length,1);
    assert.equal(attempts.filter(item=>item.status===429).length,9);
    assert.equal(calls.length,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,AUTH_LIMITS.pendingStates);
  });
});

test('authentication starts prune bounded expired records while live records remain',async()=>{
  await pool.query("INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at) SELECT 'expired-'||n,'binding',now()-interval '1 hour' FROM generate_series(1,120)n");
  await pool.query("INSERT INTO hub_oauth_states VALUES('live','binding',now()+interval '10 minutes')");
  await withOAuth(null,async({start})=>{await start();});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,122-AUTH_LIMITS.stateCleanupBatch);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM hub_oauth_states WHERE state_hash='live'")).rows[0].n,1);
  await pool.query("INSERT INTO hub_users(github_id,login) VALUES('303','seed')");
  await pool.query("INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at) SELECT 'expired-'||n,'303','csrf',now()-interval '1 hour' FROM generate_series(1,150)n");
  await pool.query("INSERT INTO hub_sessions VALUES('live','303','csrf',now()+interval '1 hour')");
  assert.equal((await request('/auth/start')).response.status,302);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,152-AUTH_LIMITS.sessionCleanupBatch);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM hub_sessions WHERE token_hash='live'")).rows[0].n,1);
});

test('retained authentication record budgets count expired history and refuse further growth',async()=>{
  await pool.query("INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at) SELECT 'expired-'||n,'binding',now()-interval '1 hour' FROM generate_series(1,$1::int)n",[AUTH_LIMITS.retainedStates+AUTH_LIMITS.stateCleanupBatch]);
  await withOAuth(null,async({target,calls})=>{
    const response=await fetch(target+'/auth/start',{redirect:'manual'});assert.equal(response.status,429);
    assert.equal(response.headers.get('set-cookie'),null);assert.equal(calls.length,0);
  });
  // Privileged fixture intentionally starts beyond the admitted cap. Rejection
  // rolls the opportunistic prune back; the separate cleanup job can recover it.
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,AUTH_LIMITS.retainedStates+AUTH_LIMITS.stateCleanupBatch);
  await pool.query("INSERT INTO hub_users(github_id,login) VALUES('303','seed')");
  await pool.query("INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at) SELECT 'seed-'||n,'303','csrf',now()+interval '1 hour' FROM generate_series(1,$1::int)n",[AUTH_LIMITS.retainedSessions]);
  const response=await request('/auth/start');assert.equal(response.response.status,429);assert.equal(response.response.headers.get('set-cookie'),null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,AUTH_LIMITS.retainedSessions);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_users WHERE github_id=$1',[alice.id])).rows[0].n,0);
});

test('global session capacity serializes competing verified GitHub accounts',async()=>{
  await pool.query("INSERT INTO hub_users(github_id,login) VALUES('303','seed')");
  await pool.query("INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at) SELECT 'seed-'||n,'303','csrf',now()+interval '1 hour' FROM generate_series(1,$1::int)n",[AUTH_LIMITS.retainedSessions-1]);
  let nextId=101;const accessToken=randomBytes(24).toString('hex');
  await withOAuth(async url=>Response.json(url.endsWith('/access_token')?{access_token:accessToken,token_type:'bearer'}:{id:nextId++,login:'candidate'}),async({start,callback})=>{
    const first=await start(),second=await start();
    const results=await Promise.all([callback(first),callback(second)]);
    assert.equal(results.filter(item=>item.status===302).length,1);assert.equal(results.filter(item=>item.status===429).length,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,AUTH_LIMITS.retainedSessions);
  });
});

test('authentication admission and rotation use only existing restricted API grants',async()=>{
  const {createRuntimePool,verifyRole}=await import('./runtime.mjs');
  const {migrateDatabase}=await import('./database.mjs');
  await migrateDatabase(pool,{roles:true});
  const name='zero_auth_'+randomBytes(5).toString('hex'),password=randomBytes(32).toString('hex');
  await pool.query(`CREATE ROLE ${name} LOGIN NOINHERIT PASSWORD '${password}'`);await pool.query(`GRANT hub_api TO ${name}`);
  const url=new URL(database);url.username=name;url.password=password;
  const api=createRuntimePool(url.href,'hub_api');await verifyRole(api,'hub_api');
  const controlled=createHub({pool:api,storageRoot:root,checker,origin:'https://zero.example',oauth:{clientId:'test-id',clientSecret:'test-secret',fetch:async target=>Response.json(target.endsWith('/access_token')?{access_token:'test-token',token_type:'bearer'}:{id:101,login:'alice'})}});
  const temporary=http.createServer(controlled.handler);await new Promise(resolve=>temporary.listen(0,'127.0.0.1',resolve));
  const target=`http://127.0.0.1:${temporary.address().port}/api/hub`;
  try {
    async function login(existing) {
      const start=await fetch(target+'/auth/start',{redirect:'manual'});assert.equal(start.status,302);
      const state=new URL(start.headers.get('location')).searchParams.get('state');
      const pending=start.headers.getSetCookie()[0].split(';')[0];
      const result=await fetch(target+`/auth/callback?state=${state}&code=test`,{redirect:'manual',headers:{Cookie:[pending,existing].filter(Boolean).join('; ')}});
      assert.equal(result.status,302);return oauthSessionCookie(result);
    }
    const old=await login(),fresh=await login(old);
    assert.equal((await(await fetch(target+'/session',{headers:{Cookie:old}})).json()).user,null);
    assert.deepEqual((await(await fetch(target+'/session',{headers:{Cookie:fresh}})).json()).user,alice);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_sessions')).rows[0].n,1);
  } finally {await controlled.stop();await new Promise(resolve=>temporary.close(resolve));await api.end();await pool.query(`DROP OWNED BY ${name}`);await pool.query(`DROP ROLE ${name}`);}
});
