import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import * as trusted from '../checker/runner.mjs';
import {createHub} from './hub.mjs';
import {migrateDatabase} from './database.mjs';
import {createRuntimePool,verifyRole} from './runtime.mjs';
import {ADMISSION_LIMITS as limits} from './admission.mjs';

const database=process.env.ZERO_HUB_TEST_DATABASE;
if (!database) throw new Error('Use npm run test:postgres for a disposable real PostgreSQL fixture');
const alice={id:'101',login:'alice'},bob={id:'202',login:'bob'};
let pool,hub,otherHub,server,origin,checks=0;
const checker={...trusted,checkSubmission:async()=>{checks++;throw new Error('Admission tests must never run candidate checks');}};
const storage={read:async()=>{throw new Error('No artifact reads in admission tests');},put:async()=>{throw new Error('No artifact writes in admission tests');}};
const reservation={className:'ValueDisplay',title:'Value display'};
const reserve=(user=alice,service=hub)=>service.reserveLibrary(user,reservation);
function version(bundle,n) {const copy=structuredClone(bundle);copy.descriptor.version=`0.1.${n}`;return copy;}
const denied=promise=>assert.rejects(promise,error=>error.status===429&&error.message.length<256);
async function count(table) {return (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;}
async function queued() {return (await pool.query("SELECT count(*)::int AS n FROM hub_submissions WHERE status IN ('queued','checking','checked')")).rows[0].n;}
function outcomes(attempts,accepted) {
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,accepted);
  for(const item of attempts.filter(item=>item.status==='rejected'))assert.equal(item.reason.status,429);
}

// Privileged fixture-only history creates precise logical-byte totals without
// running candidates or storing artifacts. Each row remains below 1 MiB. The
// placeholder JSON is deliberate: the admission sum must count every retained
// record, even historical/corrupted data, rather than revalidating old source.
async function sourceHistory(owner,libraryId,bytes) {
  const {rows:[{overhead}]}=await pool.query("SELECT octet_length(jsonb_build_object('fixture','')::text) AS overhead");
  const chunk=1024*1024-100;
  while(bytes>0) {
    let size=Math.min(bytes,chunk);
    if(bytes-size>0&&bytes-size<overhead)size-=overhead;
    assert.ok(size>=overhead);
    await pool.query(`INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status,created_at)
      VALUES($1,$2,$3,$4,jsonb_build_object('fixture',repeat('x',$5)), $6,'failed',now()-interval '25 hours')`,
    [randomUUID(),libraryId,owner.id,randomUUID(),size-overhead,'a'.repeat(64)]);
    bytes-=size;
  }
}
async function sourceBytes(ownerId) {
  return Number((await pool.query("SELECT COALESCE(sum(octet_length(convert_to(bundle::text,'UTF8'))),0)::text AS n FROM hub_submissions WHERE ($1::text IS NULL OR owner_id=$1)",[ownerId??null])).rows[0].n);
}
async function bundleBytes(bundle) {return (await pool.query("SELECT octet_length(convert_to($1::jsonb::text,'UTF8')) AS n",[bundle])).rows[0].n;}

before(async()=>{
  pool=new pg.Pool({connectionString:database,max:20});
  await migrateDatabase(pool);
  server=http.createServer((req,res)=>hub.handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  hub=createHub({pool,storage,checker,origin,localIdentity:alice});
  otherHub=createHub({pool,storage,checker,origin,localIdentity:alice});
});
beforeEach(async()=>{await pool.query('TRUNCATE hub_releases,hub_results,hub_submissions,hub_libraries,hub_sessions,hub_oauth_states,hub_users CASCADE');});
after(async()=>{assert.equal(checks,0);await hub.stop();await otherHub.stop();await new Promise(resolve=>server.close(resolve));await pool.end();});

test('parallel reservations across hub instances stop at 10 per account in rolling 24 hours',async()=>{
  const attempts=await Promise.allSettled(Array.from({length:24},(_,n)=>reserve(alice,n%2?hub:otherHub)));
  outcomes(attempts,limits.reservationsPer24Hours);
  assert.equal(await count('hub_libraries'),10);
  assert.equal(new Set(attempts.filter(item=>item.status==='fulfilled').map(item=>item.value.libraryId)).size,10);
  const {bundle}=await reserve(bob);
  await assert.rejects(hub.submit({id:alice.id,login:bob.login},bundle),error=>error.status===403);
  assert.equal((await otherHub.submit(bob,bundle)).status,'queued');
  assert.equal(await count('hub_libraries'),11);
  // Five reservations just outside the rolling window do not count; five just
  // inside do. This uses the database clock and keeps lifetime history intact.
  const boundaryUser={id:'303',login:'boundary'};
  await pool.query('INSERT INTO hub_users(github_id,login) VALUES($1,$2)',[boundaryUser.id,boundaryUser.login]);
  await pool.query(`INSERT INTO hub_libraries(id,owner_id,created_at)
    SELECT 'uiedge'||n,$1,statement_timestamp()-interval '24 hours'
      + CASE WHEN n<=5 THEN interval '-5 minutes' ELSE interval '5 minutes' END
    FROM generate_series(1,10)n`,[boundaryUser.id]);
  const next=await Promise.allSettled(Array.from({length:12},(_,n)=>reserve(boundaryUser,n%2?hub:otherHub)));
  outcomes(next,5);assert.equal(await count('hub_libraries'),26);
});

test('contributors can reserve beyond 100 lifetime libraries while rolling limits still apply',async()=>{
  await pool.query('INSERT INTO hub_users(github_id,login) VALUES($1,$2)',[alice.id,alice.login]);
  await pool.query("INSERT INTO hub_libraries(id,owner_id,created_at) SELECT 'uiold'||n,$1,now()-interval '25 hours' FROM generate_series(1,100)n",[alice.id]);
  const renamed={...alice,login:'renamed'};
  const next=await reserve(renamed);
  assert.ok(next.libraryId);assert.equal(await count('hub_libraries'),101);
  const attempts=await Promise.allSettled(Array.from({length:12},(_,n)=>reserve(renamed,n%2?hub:otherHub)));
  outcomes(attempts,limits.reservationsPer24Hours-1);
  assert.equal(await count('hub_libraries'),110);
  await denied(reserve(renamed));
  assert.equal((await pool.query('SELECT login FROM hub_users WHERE github_id=$1',[alice.id])).rows[0].login,'renamed');
});

test('parallel new submissions across libraries stop at two active jobs; all active stages count',async()=>{
  const left=await reserve(),right=await reserve();
  const attempts=await Promise.allSettled(Array.from({length:16},(_,n)=>(n%2?hub:otherHub).submit(alice,version(n%2?left.bundle:right.bundle,n))));
  outcomes(attempts,2);assert.equal(await count('hub_submissions'),2);
  const [first,second]=(await pool.query('SELECT id FROM hub_submissions ORDER BY created_at')).rows;
  await pool.query("UPDATE hub_submissions SET status=CASE WHEN id=$1 THEN 'checking' ELSE 'checked' END",[first.id]);
  await denied(hub.submit(alice,version(left.bundle,90)));
  await pool.query("UPDATE hub_submissions SET status='failed' WHERE id=$1",[second.id]);
  assert.equal((await hub.submit(alice,version(left.bundle,91))).status,'queued');assert.equal(await queued(),2);
});

test('global active cap cannot be bypassed by concurrent requests from other accounts',async()=>{
  const seed=await reserve({id:'303',login:'seed'});
  // Administrator-only seeds approach the global boundary; live requests below
  // each account boundary compete across separate library/owner rows.
  await pool.query(`INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status)
    SELECT gen_random_uuid(),$1,$2,'0.9.'||n,$3::jsonb,$4,'queued' FROM generate_series(1,99)n`,[seed.libraryId,'303',seed.bundle,trusted.sourceDigest(seed.bundle)]);
  const a=await reserve(alice),b=await reserve(bob);
  const attempts=await Promise.allSettled(Array.from({length:12},(_,n)=>(n%2?hub:otherHub).submit(n%2?alice:bob,version(n%2?a.bundle:b.bundle,n))));
  outcomes(attempts,1);assert.equal(await queued(),limits.activeGlobal);assert.equal(await count('hub_submissions'),100);
  await assert.rejects(hub.submit(bob,a.bundle),error=>error.status===403);
  assert.equal(await count('hub_submissions'),100);
});

test('20 new attempts per rolling 24 hours include failures and corrected versions',async()=>{
  const {bundle}=await reserve();
  for(let n=0;n<19;n++) {await hub.submit(alice,version(bundle,n));await pool.query("UPDATE hub_submissions SET status='failed'");}
  const attempts=await Promise.allSettled(Array.from({length:10},(_,n)=>(n%2?hub:otherHub).submit(alice,version(bundle,30+n))));
  outcomes(attempts,1);assert.equal(await count('hub_submissions'),20);
  await pool.query("UPDATE hub_submissions SET status='failed'");
  const corrected=version(bundle,0);corrected.files['API.md']+='\nCorrection.\n';
  await denied(hub.submit(alice,corrected));
  // Expired source still consumes retained bytes, but no longer the daily count.
  await pool.query("UPDATE hub_submissions SET created_at=statement_timestamp()-interval '25 hours'");
  const fixed=await hub.submit(alice,corrected);assert.equal(fixed.status,'queued');assert.equal(await count('hub_submissions'),21);
});

test('exact-source retry and immutable conflict work at active/daily limits with source unchanged',async()=>{
  const {bundle}=await reserve();const exact=await hub.submit(alice,bundle);
  await hub.submit(alice,version(bundle,1));
  const row=(await pool.query('SELECT bundle,source_digest FROM hub_submissions WHERE id=$1',[exact.id])).rows[0];
  const retries=await Promise.all(Array.from({length:8},()=>otherHub.submit({...alice,login:'renamed'},bundle)));
  assert.ok(retries.every(job=>job.id===exact.id));assert.equal(await count('hub_submissions'),2);
  const changed=structuredClone(bundle);changed.files['API.md']+=' Changed';
  await assert.rejects(hub.submit(alice,changed),error=>error.status===409);
  await denied(hub.submit(alice,version(bundle,2)));
  await assert.rejects(hub.submit({id:bob.id,login:alice.login},bundle),error=>error.status===403);
  assert.deepEqual((await pool.query('SELECT bundle,source_digest FROM hub_submissions WHERE id=$1',[exact.id])).rows[0],row);
  await pool.query("UPDATE hub_submissions SET status='failed'");
  for(let n=2;n<20;n++) {await hub.submit(alice,version(bundle,n));await pool.query("UPDATE hub_submissions SET status='failed'");}
  assert.deepEqual(await hub.submit(alice,bundle),{id:exact.id,status:'failed'});
  assert.equal(await count('hub_submissions'),20);
});

test('contributors can submit beyond the former 16 MiB source allowance without weakening active limits or ownership',async()=>{
  const {bundle,libraryId}=await reserve();const candidates=[version(bundle,1),version(bundle,2)];
  const formerAccountLimit=16*1024*1024;
  const size=await bundleBytes(candidates[0]);assert.equal(await bundleBytes(candidates[1]),size);
  await sourceHistory(alice,libraryId,formerAccountLimit);
  const before=await count('hub_submissions');
  const attempts=await Promise.allSettled(candidates.map((source,n)=>(n?otherHub:hub).submit(alice,source)));
  outcomes(attempts,2);
  assert.equal(await sourceBytes(alice.id),formerAccountLimit+2*size);
  assert.equal(await count('hub_submissions'),before+2);
  const stored=(await pool.query('SELECT bundle,source_digest FROM hub_submissions WHERE id=$1',[attempts[0].value.id])).rows[0];
  for(let n=0;n<2;n++)assert.deepEqual(await hub.submit({...alice,login:'renamed'},candidates[n]),attempts[n].value);
  await denied(hub.submit(alice,version(bundle,3)));
  await assert.rejects(hub.submit(bob,candidates[0]),error=>error.status===403);
  assert.deepEqual((await pool.query('SELECT bundle,source_digest FROM hub_submissions WHERE id=$1',[attempts[0].value.id])).rows[0],stored);
  await pool.query("UPDATE hub_submissions SET status='failed' WHERE status='queued'");
  assert.equal((await otherHub.submit(alice,version(bundle,3))).status,'queued');
  assert.ok(await sourceBytes(alice.id)>formerAccountLimit);
  const foreign=await reserve(bob);assert.equal((await hub.submit(bob,foreign.bundle)).status,'queued');
});

test('global 256 MiB retained-source boundary includes failed history from other accounts',async()=>{
  const seed=await reserve({id:'303',login:'seed'}),a=await reserve(alice),b=await reserve(bob);
  const sizeA=await bundleBytes(a.bundle),sizeB=await bundleBytes(b.bundle);
  await sourceHistory({id:'303'},seed.libraryId,limits.sourceBytesGlobal-Math.max(sizeA,sizeB));
  const before=await count('hub_submissions');
  const attempts=await Promise.allSettled([hub.submit(alice,a.bundle),otherHub.submit(bob,b.bundle)]);
  outcomes(attempts,1);assert.equal(await count('hub_submissions'),before+1);
  assert.ok(await sourceBytes()<=limits.sourceBytesGlobal);
  const index=attempts.findIndex(item=>item.status==='fulfilled');const user=index?bob:alice,source=index?b.bundle:a.bundle;
  assert.deepEqual(await hub.submit(user,source),attempts[index].value);
  await denied(hub.submit(user,version(source,99)));assert.equal(await count('hub_submissions'),before+1);
});

test('HTTP quota errors are friendly 429 JSON and the 1 MiB request limit remains',async()=>{
  for(let n=0;n<10;n++)await reserve();
  const start=await fetch(`${origin}/api/hub/auth/start`,{redirect:'manual'});
  const cookie=start.headers.get('set-cookie').split(';')[0];
  const session=await (await fetch(`${origin}/api/hub/session`,{headers:{Cookie:cookie}})).json();
  const headers={Cookie:cookie,Origin:origin,'X-Zero-CSRF':session.csrfToken,'Content-Type':'application/json'};
  const response=await fetch(`${origin}/api/hub/libraries`,{method:'POST',headers,body:JSON.stringify(reservation)});
  assert.equal(response.status,429);assert.match((await response.json()).error,/10 new libraries in 24 hours/);
  assert.equal(await count('hub_libraries'),10);
  const oversized=await fetch(`${origin}/api/hub/submissions`,{method:'POST',headers,body:JSON.stringify({padding:'x'.repeat(1024*1024)})});
  assert.equal(oversized.status,413);assert.equal(await count('hub_submissions'),0);
  const {scaffoldBundle}=await import('./scaffold.mjs');
  const {rows:[{id}]}=await pool.query('SELECT id FROM hub_libraries WHERE owner_id=$1 LIMIT 1',[alice.id]);
  const source=scaffoldBundle({libraryId:id,...reservation,login:alice.login});
  await hub.submit(alice,source);await hub.submit(alice,version(source,1));
  const limited=await fetch(`${origin}/api/hub/submissions`,{method:'POST',headers,body:JSON.stringify(version(source,2))});
  assert.equal(limited.status,429);assert.match((await limited.json()).error,/2 submissions waiting/);
  assert.equal(await count('hub_submissions'),2);
});

test('actual restricted API login can enforce shared admission without additional grants',async()=>{
  // Fixture principals exist only in this disposable database; credentials are
  // generated in-process and never passed to external services or arguments.
  const {readFile}=await import('node:fs/promises');
  await pool.query(await readFile(new URL('../sql/000-roles.sql',import.meta.url),'utf8'));
  await migrateDatabase(pool,{roles:true});
  const name=`zero_admission_${randomBytes(5).toString('hex')}`,password=randomBytes(24).toString('hex');
  await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);await pool.query(`GRANT hub_api TO ${name}`);
  const url=new URL(database);url.username=name;url.password=password;
  const api=createRuntimePool(url.href,'hub_api');const service=createHub({pool:api,storage,checker,origin,localIdentity:alice});
  try {
    await verifyRole(api,'hub_api');
    const prepared=await reserve(alice,service);
    await pool.query("INSERT INTO hub_libraries(id,owner_id,created_at) SELECT 'uiroleold'||n,$1,now()-interval '25 hours' FROM generate_series(1,100)n",[alice.id]);
    await sourceHistory(alice,prepared.libraryId,16*1024*1024);
    const attempts=await Promise.allSettled(Array.from({length:8},(_,n)=>service.submit(alice,version(prepared.bundle,n))));
    outcomes(attempts,2);assert.equal(await queued(),2);
    assert.ok(await sourceBytes(alice.id)>16*1024*1024);
    await assert.rejects(service.submit(bob,prepared.bundle),error=>error.status===403);
    const reservations=await Promise.allSettled(Array.from({length:15},()=>reserve(alice,service)));
    outcomes(reservations,9);assert.equal(await count('hub_libraries'),110);
  } finally {await service.stop();await api.end();await pool.query(`DROP OWNED BY ${name}`);await pool.query(`DROP ROLE ${name}`);}
});
