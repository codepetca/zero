import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,writeFile,chmod,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import * as trusted from '../checker/runner.mjs';
import {createHub} from './hub.mjs';
import {validateArtifacts,sha256} from './artifacts.mjs';
import {REQUIRED_GATES} from './report.mjs';

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
  const reserved=await Promise.all(Array.from({length:12},()=>reserve()));assert.equal(new Set(reserved.map(item=>item.libraryId)).size,12);
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
  for(const field of ['owner','result','status','artifacts','publish']) {
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
  assert.deepEqual(await Promise.all([hub.publishOnce(),hub.publishOnce()]),[true,false]);
  const result=await hub.getSubmission(alice,job.id);assert.equal(result.status,'published');assert.equal(result.release.status,'automatically-checked');
  for(const artifact of [...Object.values(result.release.artifacts),result.release.preview]) {
    const {response,value}=await request(artifact.path.slice('/api/hub'.length));assert.equal(response.status,200);assert.equal(sha256(Buffer.from(value)),artifact.sha256);
  }
  const head=await request(result.release.artifacts.jar.path.slice('/api/hub'.length),{method:'HEAD'});assert.equal(head.response.status,200);assert.equal(head.response.headers.get('content-length'),String(result.release.artifacts.jar.size));assert.equal(head.value.byteLength,0);
  const checksum=await request(result.release.artifacts.jar.path.slice('/api/hub'.length)+'.sha256');assert.equal(checksum.response.status,200);assert.equal(Buffer.from(checksum.value).toString().trim(),result.release.artifacts.jar.sha256);
  const second=structuredClone(bundle);second.descriptor.version='0.2.0';await hub.submit(alice,second);await hub.drain();assert.equal((await hub.catalog()).libraries.length,2);
  assert.equal((await request(`/libraries/${bundle.descriptor.libraryId}?version=0.1.0`)).value.version,'0.1.0');
  assert.equal((await hub.submit(alice,bundle)).id,job.id);assert.equal(await hub.publishOnce(),false);
  await assert.rejects(pool.query('UPDATE hub_results SET passed=false WHERE submission_id=$1',[job.id]),/immutable/);
  await assert.rejects(pool.query('DELETE FROM hub_releases WHERE submission_id=$1',[job.id]),/immutable/);
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

test('OAuth state is browser-bound, single-use, and profile numeric ID is server authority',async()=>{
  let providerCalls=0;
  const oauthHub=createHub({pool,storageRoot:root,checker,origin:'https://zero.example',oauth:{clientId:'local-test-id',clientSecret:'local-test-secret',fetch:async url=>{providerCalls++;return {ok:true,json:async()=>url.includes('/access_token')?{access_token:'test-token',token_type:'bearer'}:{id:101,login:'renamed-alice'}};}}});
  const server=http.createServer(oauthHub.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const target=`http://127.0.0.1:${server.address().port}/api/hub`;
  try {
    const start=await fetch(`${target}/auth/start`,{redirect:'manual'});assert.equal(start.status,302);const state=new URL(start.headers.get('location')).searchParams.get('state');const cookie=start.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${target}/auth/callback?state=${state}&code=sample`,{redirect:'manual'})).status,403);assert.equal(providerCalls,0);
    const callback=await fetch(`${target}/auth/callback?state=${state}&code=sample`,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(callback.status,302);assert.equal(providerCalls,2);
    assert.equal((await fetch(`${target}/auth/callback?state=${state}&code=sample`,{headers:{Cookie:cookie},redirect:'manual'})).status,403);assert.equal(providerCalls,2);
    const sessionCookie=callback.headers.get('set-cookie').split(';')[0];const signed=await (await fetch(`${target}/session`,{headers:{Cookie:sessionCookie}})).json();assert.deepEqual(signed.user,{id:'101',login:'renamed-alice'});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM hub_oauth_states')).rows[0].n,0);
  } finally {await new Promise(resolve=>server.close(resolve));await oauthHub.stop();}
});
