import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {userInfo} from 'node:os';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {join,isAbsolute} from 'node:path';
import {createJamService} from '../service.mjs';
import {POSTGRES_REGISTRY_SCHEMA,POSTGRES_REGISTRY_SEED,PostgresRegistryUnknown,createPostgresJamStore,freshRegistryEpoch} from '../postgres-registry.mjs';
import {hostedManifest} from './fixtures.mjs';

const modulePath=process.env.ZERO_TEST_PG_MODULE,socket=process.env.ZERO_TEST_PG_SOCKET;
const execFile=promisify(execFileCallback);
test('Postgres proof requires an injected pool and produces fresh epoch values',()=>{
  assert.throws(()=>createPostgresJamStore());
  const a=freshRegistryEpoch(),b=freshRegistryEpoch();assert.match(a,/^[0-9a-f]{24}$/);assert.notEqual(a,b);
});

test('only fixed local, staging and production registry targets can be selected',async()=>{
  const commands=[];let connections=0;
  const pool={async connect(){connections++;return {release(){},async query(sql){commands.push(sql);return sql.startsWith('SELECT')?{rows:[{epoch:'a'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]}:{rows:[],rowCount:1};}};}};
  for(const target of ['zerojams_staging_private.registry','staging; DROP TABLE x',null,{},1])assert.throws(()=>createPostgresJamStore({pool,target}),error=>error.status===503);
  assert.equal(connections,0);
  const local=createPostgresJamStore({pool});await local.snapshot();
  assert.ok(commands.includes('SELECT epoch,generation,document FROM zero_jams_registry_poc WHERE singleton=1'));
  commands.length=0;
  const staging=createPostgresJamStore({pool,target:'staging'}),snapshot=await staging.snapshot();
  assert.equal(await staging.compareAndSwap(null,snapshot.revision,null,{settlements:{schema:1,operations:{}}}),true);
  const dataQueries=commands.filter(sql=>sql.startsWith('SELECT')||sql.startsWith('UPDATE'));
  assert.deepEqual(dataQueries,[
    'SELECT epoch,generation,document FROM zerojams_staging_private.registry WHERE singleton OPERATOR(pg_catalog.=) 1',
    'SELECT epoch,generation,document FROM zerojams_staging_private.registry WHERE singleton OPERATOR(pg_catalog.=) 1 FOR UPDATE',
    'UPDATE zerojams_staging_private.registry SET generation=$1,document=$2::pg_catalog.jsonb WHERE singleton OPERATOR(pg_catalog.=) 1 AND epoch OPERATOR(pg_catalog.=) $3 AND generation OPERATOR(pg_catalog.=) $4'
  ]);
  commands.length=0;
  const production=createPostgresJamStore({pool,target:'production'}),productionSnapshot=await production.snapshot();
  assert.equal(await production.compareAndSwap(null,productionSnapshot.revision,null,{settlements:{schema:1,operations:{}}}),true);
  assert.deepEqual(commands.filter(sql=>sql.startsWith('SELECT')||sql.startsWith('UPDATE')),dataQueries.map(sql=>sql.replaceAll('zerojams_staging_private','zerojams_production_private')));
  assert.ok(commands.every(sql=>!/^\s*(CREATE|ALTER|DROP|INSERT)/i.test(sql)));
});

test('staging SQL ignores hostile search-path domain and comparison operators',{skip:process.env.ZERO_TEST_STAGING_PG!=='1',timeout:30000},async t=>{
  const bin=process.env.ZERO_TEST_PG_BIN;
  assert.ok(bin&&isAbsolute(bin));assert.ok(modulePath&&isAbsolute(modulePath));
  const require=createRequire(import.meta.url);assert.equal(require(join(modulePath,'package.json')).version,'8.16.3');
  const {Pool}=require(modulePath),root=await mkdtemp('/tmp/zero-jams-searchpath.'),data=join(root,'data'),socketDir=join(root,'socket');
  const childEnv=Object.fromEntries(Object.keys(process.env).filter(key=>!key.startsWith('PG')).map(key=>[key,process.env[key]]));
  let started=false;const pools=[];
  t.after(async()=>{try{await Promise.all(pools.map(pool=>pool.end()));}finally{if(started)await execFile(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{env:childEnv,timeout:10000});await rm(root,{recursive:true,force:true});}});
  await mkdir(socketDir,{mode:0o700});
  await execFile(join(bin,'initdb'),['-D',data,'--username=zero_fixture_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],{env:childEnv,timeout:10000});
  started=true;await execFile(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-o',`-h '' -k ${socketDir} -p 55442`,'-w','start'],{env:childEnv,timeout:10000});
  const connect=(user,searchPath)=>{const pool=new Pool({host:socketDir,port:55442,user,database:'postgres',password:()=>'',ssl:false,options:`-c search_path=${searchPath}`,max:2,connectionTimeoutMillis:1000});pools.push(pool);return pool;};
  const admin=connect('zero_fixture_admin','pg_catalog');
  assert.equal((await admin.query('SHOW listen_addresses')).rows[0].listen_addresses,'');
  await admin.query('CREATE ROLE zero_fixture_runtime LOGIN; CREATE SCHEMA zerojams_staging_private; CREATE SCHEMA zero_hostile');
  await admin.query(POSTGRES_REGISTRY_SCHEMA.replace('CREATE TABLE zero_jams_registry_poc','CREATE TABLE zerojams_staging_private.registry'));
  await admin.query('INSERT INTO zerojams_staging_private.registry (singleton,epoch,generation,document) VALUES (1,$1,0,$2::pg_catalog.jsonb)',['d'.repeat(24),JSON.stringify({events:{},settlements:{schema:1,operations:{}}})]);
  await admin.query('GRANT USAGE ON SCHEMA zero_hostile,zerojams_staging_private TO zero_fixture_runtime; GRANT SELECT,UPDATE ON zerojams_staging_private.registry TO zero_fixture_runtime');
  await admin.query('CREATE DOMAIN zero_hostile.jsonb AS pg_catalog.jsonb CHECK (VALUE IS NULL)');
  for(const [name,left,right] of [['int_eq','int2','int4'],['text_eq','text','text'],['big_eq','int8','int8']]){
    await admin.query(`CREATE FUNCTION zero_hostile.${name}(pg_catalog.${left},pg_catalog.${right}) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT false'`);
    await admin.query(`CREATE OPERATOR zero_hostile.= (LEFTARG=pg_catalog.${left},RIGHTARG=pg_catalog.${right},FUNCTION=zero_hostile.${name})`);
  }
  const runtime=connect('zero_fixture_runtime','zero_hostile,pg_catalog');
  const probe=await runtime.query("SELECT 1::pg_catalog.int2 = 1::pg_catalog.int4 AS a, 'x'::pg_catalog.text = 'x'::pg_catalog.text AS b, 1::pg_catalog.int8 = 1::pg_catalog.int8 AS c");
  assert.deepEqual(probe.rows[0],{a:false,b:false,c:false});
  await assert.rejects(runtime.query('SELECT $1::jsonb',[JSON.stringify({})]),error=>error.code==='23514');
  const store=createPostgresJamStore({pool:runtime,target:'staging'}),before=await store.snapshot();
  assert.equal(await store.compareAndSwap(null,before.revision,null,{settlements:{schema:1,operations:{}}}),true);
  const after=await store.snapshot();assert.notEqual(after.revision,before.revision);assert.equal(after.revision,'d'.repeat(24)+'0'.repeat(15)+'1');
});

test('snapshot times out pending pool acquisition and destroys a client that arrives late',async()=>{
  let resolve,queries=0;const releases=[];
  const pool={connect:()=>new Promise(done=>{resolve=done;})};
  const store=createPostgresJamStore({pool,readTimeoutMs:20});
  await assert.rejects(store.snapshot(),error=>error.status===503);
  resolve({release(value){releases.push(value);},async query(){queries++;}});
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(releases,[true]);assert.equal(queries,0);
});

test('snapshot times out a hanging query and destroys its client even if it later resolves',async()=>{
  let resolve;const releases=[];
  const pool={async connect(){return {release(value){releases.push(value);},query(){return new Promise(done=>{resolve=done;});}};}};
  const store=createPostgresJamStore({pool,readTimeoutMs:20});
  await assert.rejects(store.snapshot(),error=>error.status===503);
  assert.deepEqual(releases,[true]);
  resolve({rows:[{epoch:'a'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]});
  await new Promise(done=>setImmediate(done));assert.deepEqual(releases,[true]);
});

test('snapshot respects pre-abort and caller cancellation without reusing clients',async()=>{
  const pre=new AbortController();pre.abort();let connections=0,resolve;const releases=[];
  const pool={async connect(){connections++;return {release(value){releases.push(value);},query(){return new Promise(done=>{resolve=done;});}};}};
  const store=createPostgresJamStore({pool,readTimeoutMs:1000});
  await assert.rejects(store.snapshot({signal:pre.signal}),error=>error.status===503);assert.equal(connections,0);
  const immediate=new AbortController(),notDispatched=store.snapshot({signal:immediate.signal});immediate.abort();
  await assert.rejects(notDispatched,error=>error.status===503);await new Promise(done=>setImmediate(done));assert.equal(connections,0);
  const controller=new AbortController(),pending=store.read('jam-101',{signal:controller.signal});
  await new Promise(done=>setImmediate(done));controller.abort();
  await assert.rejects(pending,error=>error.status===503);assert.deepEqual(releases,[true]);
  resolve({rows:[]});await new Promise(done=>setImmediate(done));assert.deepEqual(releases,[true]);
  await assert.rejects(store.snapshot({signal:{}}),error=>error.status===503);
});

test('successful snapshot releases the client normally',async()=>{
  const releases=[];
  const pool={async connect(){return {release(value){releases.push(value);},async query(){return {rows:[{epoch:'a'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]};}};}};
  const snapshot=await createPostgresJamStore({pool}).snapshot();
  assert.deepEqual(snapshot.ids,[]);assert.deepEqual(releases,[false]);
  const controller=new AbortController();controller.abort();
  await assert.rejects(snapshot.read('jam-101',{signal:controller.signal}),error=>error.status===503);
});

test('snapshot fails closed if normal client release throws, without double release',async()=>{
  const releases=[];
  const pool={async connect(){return {release(value){releases.push(value);throw new Error('private release error');},async query(){return {rows:[{epoch:'a'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]};}};}};
  await assert.rejects(createPostgresJamStore({pool}).snapshot(),error=>error.status===503&&!error.message.includes('private'));
  assert.deepEqual(releases,[false]);
});

test('callback deadlines reject event-loop stalls without a database',async()=>{
  const commands=[],releases=[];
  const pool={async connect(){return {release(value){releases.push(value);},async query(sql){commands.push(sql);return sql.startsWith('SELECT')?{rows:[{epoch:'a'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]}:{rows:[],rowCount:1};}};}};
  const store=createPostgresJamStore({pool,transactionTimeoutMs:10});
  const busy=()=>{const start=performance.now();while(performance.now()-start<20){}};
  await assert.rejects(store.transact(async tx=>{busy();await tx.snapshot();}),/timed out/);
  await assert.rejects(store.transact(()=>{busy();return 'late';}),/timed out/);
  assert.deepEqual(releases,[true,true]);
  assert.ok(commands.every(sql=>!sql.startsWith('UPDATE')&&sql!=='COMMIT'&&sql!=='ROLLBACK'));
});

test('transaction-local reads retain their captured revision across concurrent CAS',async()=>{
  const pool={async connect(){return {release(){},async query(sql){return sql.startsWith('SELECT')?{rows:[{epoch:'b'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]}:{rows:[],rowCount:1};}};}};
  const store=createPostgresJamStore({pool});
  await store.transact(async tx=>{
    const initial=await tx.snapshot(),pending=tx.read('jam-101');
    assert.equal(await tx.compareAndSwap(null,initial.revision,null,{settlements:{schema:1,operations:{}}}),true);
    assert.deepEqual(await pending,{state:null,revision:initial.revision});
    assert.notEqual((await tx.snapshot()).revision,initial.revision);
  });
});

test('a lost BEGIN response destroys the client rather than returning it to the pool',async()=>{
  let destroyed;
  const pool={async connect(){return {release(value){destroyed=value;},async query(sql){if(sql==='BEGIN')throw new Error('lost begin response');throw new Error('unexpected query');}};}};
  await assert.rejects(createPostgresJamStore({pool}).transact(()=>{}),/lost begin response/);
  assert.equal(destroyed,true);
});

function fakeWritePool(stalled){
  const commands=[],releases=[];let resume,entered;
  const dispatched=new Promise(resolve=>{entered=resolve;});
  const pool={async connect(){return {release(value){releases.push(value);},query(sql){
    commands.push(sql);
    if(stalled(sql)){entered();return new Promise(resolve=>{resume=resolve;});}
    return Promise.resolve(sql.startsWith('SELECT')?{rows:[{epoch:'c'.repeat(24),generation:'0',document:{events:{},settlements:{schema:1,operations:{}}}}]}:{rows:[],rowCount:1});
  }};}};
  return {pool,commands,releases,dispatched,complete(){resume?.({rows:[],rowCount:1});}};
}

test('write scope stops pre-abort and destroys late pool acquisitions',async()=>{
  let resolve,connections=0;const releases=[];
  const pool={connect(){connections++;return new Promise(done=>{resolve=done;});}};
  const store=createPostgresJamStore({pool,transactionTimeoutMs:20});
  const pre=new AbortController();pre.abort();await assert.rejects(store.transact(()=>{},{signal:pre.signal}),error=>error.status===503);assert.equal(connections,0);
  const immediate=new AbortController(),notStarted=store.transact(()=>{},{signal:immediate.signal});immediate.abort();
  await assert.rejects(notStarted,/cancelled|timed out/);await new Promise(done=>setImmediate(done));assert.equal(connections,0);
  await assert.rejects(store.transact(()=>{}),/timed out/);
  resolve({release(value){releases.push(value);},query(){throw new Error('must not dispatch');}});
  await new Promise(done=>setImmediate(done));assert.deepEqual(releases,[true]);
});

test('stalled BEGIN and UPDATE never dispatch COMMIT or ROLLBACK after timeout',async()=>{
  for(const stage of ['BEGIN','UPDATE']){
    const fake=fakeWritePool(sql=>sql.startsWith(stage)),store=createPostgresJamStore({pool:fake.pool,transactionTimeoutMs:20});
    const pending=store.transact(async tx=>{const s=await tx.snapshot();await tx.compareAndSwap(null,s.revision,null,{settlements:{schema:1,operations:{}}});});
    await fake.dispatched;await assert.rejects(pending,/timed out/);
    assert.deepEqual(fake.releases,[true]);assert.ok(!fake.commands.includes('COMMIT'));assert.ok(!fake.commands.includes('ROLLBACK'));
    fake.complete();await new Promise(done=>setImmediate(done));assert.deepEqual(fake.releases,[true]);assert.ok(!fake.commands.includes('COMMIT'));
  }
});

test('one monotonic deadline includes acquisition and driver execution',async()=>{
  const commands=[],releases=[];const busy=ms=>{const start=performance.now();while(performance.now()-start<ms){}};
  const pool={connect(){busy(60);return {release(value){releases.push(value);},query(sql){commands.push(sql);if(sql==='BEGIN')busy(60);return Promise.resolve({rows:[],rowCount:1});}};}};
  const store=createPostgresJamStore({pool,transactionTimeoutMs:100});
  await assert.rejects(store.transact(()=>{}),/timed out/);
  assert.deepEqual(commands,['BEGIN']);assert.deepEqual(releases,[true]);
});

test('stalled COMMIT reports unknown and never sends ROLLBACK',async()=>{
  const fake=fakeWritePool(sql=>sql==='COMMIT'),store=createPostgresJamStore({pool:fake.pool,transactionTimeoutMs:20});
  const pending=store.transact(()=>{});await fake.dispatched;
  await assert.rejects(pending,PostgresRegistryUnknown);assert.deepEqual(fake.releases,[true]);assert.ok(!fake.commands.includes('ROLLBACK'));
  fake.complete();await new Promise(done=>setImmediate(done));assert.deepEqual(fake.releases,[true]);
});

test('stalled ROLLBACK is bounded and the client is destroyed',async()=>{
  const fake=fakeWritePool(sql=>sql==='ROLLBACK'),store=createPostgresJamStore({pool:fake.pool,transactionTimeoutMs:20});
  const pending=store.transact(()=>{throw new Error('callback failed');});await fake.dispatched;
  await assert.rejects(pending,/callback failed/);assert.deepEqual(fake.releases,[true]);assert.ok(!fake.commands.includes('COMMIT'));
  fake.complete();await new Promise(done=>setImmediate(done));assert.deepEqual(fake.releases,[true]);
});

test('caller abort during a dispatched COMMIT reports an unknown result',async()=>{
  const fake=fakeWritePool(sql=>sql==='COMMIT'),store=createPostgresJamStore({pool:fake.pool,transactionTimeoutMs:1000});
  const controller=new AbortController(),pending=store.transact(()=>{},{signal:controller.signal});await fake.dispatched;controller.abort();
  await assert.rejects(pending,PostgresRegistryUnknown);assert.deepEqual(fake.releases,[true]);assert.ok(!fake.commands.includes('ROLLBACK'));
  fake.complete();await new Promise(done=>setImmediate(done));assert.deepEqual(fake.releases,[true]);
});

test('Postgres local transactions serialize, preserve snapshots and recover lost commit responses',{skip:!modulePath||!socket,timeout:30000},async t=>{
  // Only a caller-specified Unix socket is accepted; this test never contacts a network host.
  assert.ok(socket.startsWith('/'));assert.ok(modulePath.startsWith('/'));
  const {Pool}=createRequire(import.meta.url)(modulePath);
  const admin=new Pool({host:socket,port:55439,user:userInfo().username,database:'postgres',max:2});
  const schema=`zero_poc_${freshRegistryEpoch()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({host:socket,port:55439,user:userInfo().username,database:'postgres',max:12,options:`-c search_path=${schema}`});
  t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  await pool.query(POSTGRES_REGISTRY_SCHEMA);
  const store=createPostgresJamStore({pool,transactionTimeoutMs:5000});
  await assert.rejects(store.snapshot(),error=>error.status===503);
  const epoch=freshRegistryEpoch();
  await pool.query(POSTGRES_REGISTRY_SEED,[epoch,JSON.stringify({events:{},settlements:{schema:1,operations:{}}})]);
  const empty=await store.snapshot();assert.equal(empty.revision,`${epoch}${'0'.repeat(16)}`);assert.deepEqual(empty.ids,[]);
  const creator={id:'11',login:'creator'},maintainer={id:'22',login:'maintainer'};
  const serviceFor=store=>createJamService({store,verifySource:async()=>{},maintainerIds:[maintainer.id],now:()=>Date.parse('2030-01-02T12:00:00Z'),
    verifyRepository:async({actor})=>({repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:`${actor.login}/project`}}),
    pagesBindingReader:async(repo,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repo.id,ownerId:repo.ownerId})});
  const proposal=await store.transact(tx=>serviceFor(tx).propose({actor:creator,operationId:'pg-propose-0001',manifest:hostedManifest()}));
  await store.transact(tx=>serviceFor(tx).mutate({id:proposal.eventId,revision:proposal.revision,actor:maintainer,operationId:'pg-approve-0001',action:'approve'}));
  const pinned=await store.snapshot();assert.equal((await empty.read(proposal.eventId)).state,null);
  const actors=Array.from({length:30},(_,i)=>({id:String(100+i),login:`student${i}`}));
  const input=actor=>({id:proposal.eventId,revision:proposal.revision,actor,operationId:`pg-join-${actor.id}`,action:'join',repositoryUrl:`https://github.com/${actor.login}/project`});
  const outcomes=await Promise.all(actors.map(actor=>store.transact(tx=>serviceFor(tx).mutate(input(actor)))));
  assert.equal(outcomes.length,30);const after=await store.snapshot();
  assert.notEqual(after.revision,pinned.revision);assert.equal(Object.keys((await pinned.read(proposal.eventId)).state.registrations).length,0);
  assert.equal(Object.keys((await after.read(proposal.eventId)).state.registrations).length,30);
  const same=await store.transact(tx=>serviceFor(tx).mutate(input(actors[0])));assert.deepEqual(same,outcomes[0]);
  assert.equal((await store.snapshot()).revision,after.revision);
  assert.equal(await store.compareAndSwap(proposal.eventId,pinned.revision,(await pinned.read(proposal.eventId)).state),false);
  await assert.rejects(store.transact(async tx=>{const s=await tx.snapshot();await tx.compareAndSwap(proposal.eventId,s.revision,(await s.read(proposal.eventId)).state);throw new Error('rollback probe');}),/rollback probe/);
  assert.equal((await store.snapshot()).revision,after.revision);
  let resumed;const late=new Promise(resolve=>{resumed=resolve;});let lateResult;
  const timed=createPostgresJamStore({pool,transactionTimeoutMs:30});
  await assert.rejects(timed.transact(async tx=>{await late;try{await tx.snapshot();}catch(error){lateResult=error.message;}}),/timed out/);
  resumed();await new Promise(resolve=>setImmediate(resolve));assert.match(lateResult,/no longer active/);
  assert.equal((await store.snapshot()).revision,after.revision);
  await assert.rejects(timed.transact(async tx=>{const started=performance.now();while(performance.now()-started<50){}await tx.snapshot();}),/timed out/);
  await assert.rejects(timed.transact(()=>{const started=performance.now();while(performance.now()-started<50){}return 'late';}),/timed out/);
  assert.equal((await store.snapshot()).revision,after.revision);
  let failCommit=true;
  const uncertainPool={async connect(){const client=await pool.connect();return {release:destroy=>client.release(destroy),async query(sql,...args){const result=await client.query(sql,...args);if(sql==='COMMIT'&&failCommit){failCommit=false;throw new Error('lost response');}return result;}};}};
  const uncertain=createPostgresJamStore({pool:uncertainPool}),newActor={id:'999',login:'student999'};
  await assert.rejects(uncertain.transact(tx=>serviceFor(tx).mutate(input(newActor))),PostgresRegistryUnknown);
  const durable=await store.snapshot(),recovered=await store.transact(tx=>serviceFor(tx).mutate(input(newActor)));
  assert.equal(recovered.operationId,'pg-join-999');assert.equal((await store.snapshot()).revision,durable.revision);
  assert.equal(Object.keys((await durable.read(proposal.eventId)).state.registrations).length,31);
  const settlement={schema:1,operations:{'jam-101:33:closing-0001':{scope:'jam-101',actorId:'33',operationId:'closing-0001',payloadDigest:'a'.repeat(64),settledAt:1000}}};
  assert.equal(await store.compareAndSwap(null,durable.revision,null,{settlements:settlement}),true);
  const settled=await store.snapshot();assert.deepEqual(settled.settlements,settlement);assert.deepEqual(durable.settlements,{schema:1,operations:{}});
  await t.test('COMMIT failure before dispatch leaves no durable action and the same ID applies once',async()=>{
    const before=await store.snapshot(),actor={id:'1000',login:'student1000'},request=input(actor);
    let failBeforeCommit=true,destroyed=false,forwardedCommits=0;
    const beforeCommitPool={async connect(){const client=await pool.connect();return {
      release(value){destroyed=value;client.release(value);},
      async query(sql,...args){
        if(sql==='COMMIT'){
          if(failBeforeCommit){failBeforeCommit=false;throw new Error('COMMIT was not dispatched');}
          forwardedCommits++;
        }
        return client.query(sql,...args);
      }
    };}};
    const uncertainBefore=createPostgresJamStore({pool:beforeCommitPool});
    await assert.rejects(uncertainBefore.transact(tx=>serviceFor(tx).mutate(request)),PostgresRegistryUnknown);
    assert.equal(destroyed,true);assert.equal(forwardedCommits,0);
    const notApplied=await store.snapshot(),notAppliedState=(await notApplied.read(proposal.eventId)).state;
    assert.equal(notApplied.revision,before.revision);
    assert.equal(notAppliedState.registrations[actor.id],undefined);
    assert.equal(notAppliedState.operations[`${actor.id}:${request.operationId}`],undefined);
    const applied=await store.transact(tx=>serviceFor(tx).mutate(request));
    assert.equal(applied.status,'joined');
    const afterRetry=await store.snapshot(),retryState=(await afterRetry.read(proposal.eventId)).state;
    assert.notEqual(afterRetry.revision,before.revision);
    assert.equal(Object.keys(retryState.registrations).length,Object.keys(notAppliedState.registrations).length+1);
    assert.equal(Object.keys(retryState.operations).length,Object.keys(notAppliedState.operations).length+1);
    assert.deepEqual(await store.transact(tx=>serviceFor(tx).mutate(request)),applied);
    assert.equal((await store.snapshot()).revision,afterRetry.revision);
  });
  // Gate a real SELECT FOR UPDATE response after its row lock is acquired.
  // The competing transaction dispatches its own lock request before release;
  // this tests database arbitration rather than a timing-dependent JS race.
  async function lockedRace(first,second){
    let unlock,locked,competing;
    const gate=new Promise(resolve=>{unlock=resolve;}),acquired=new Promise(resolve=>{locked=resolve;}),dispatched=new Promise(resolve=>{competing=resolve;});
    function wrappedPool(firstWriter){return {async connect(){const client=await pool.connect();return {
      release:destroy=>client.release(destroy),
      async query(sql,...args){
        const locking=sql.endsWith(' FOR UPDATE');
        if(locking&&!firstWriter)competing();
        const result=await client.query(sql,...args);
        if(locking&&firstWriter){locked();await gate;}
        return result;
      }
    };}};}
    const firstStore=createPostgresJamStore({pool:wrappedPool(true)}),secondStore=createPostgresJamStore({pool:wrappedPool(false)});
    const firstResult=firstStore.transact(tx=>first(serviceFor(tx)));
    await acquired;
    const secondResult=secondStore.transact(tx=>second(serviceFor(tx)));
    try{await dispatched;}finally{unlock();}
    return Promise.all([firstResult,secondResult]);
  }
  for(const mutationFirst of [true,false])await t.test(`${mutationFirst?'mutation':'settlement'} wins a concurrent matching request race without a contradictory outcome`,async()=>{
    const actor=mutationFirst?{id:'1001',login:'student1001'}:{id:'1002',login:'student1002'},request=input(actor);
    const closing={actor,scope:proposal.eventId,operationId:request.operationId,
      payload:{action:request.action,revision:request.revision,repositoryUrl:request.repositoryUrl}};
    const mutate=service=>service.mutate(request),settle=service=>service.settle(closing);
    const [first,second]=await lockedRace(mutationFirst?mutate:settle,mutationFirst?settle:mutate);
    const snapshot=await store.snapshot(),state=(await snapshot.read(proposal.eventId)).state;
    const operation=state.operations[`${actor.id}:${request.operationId}`],fence=snapshot.settlements.operations[`${proposal.eventId}:${actor.id}:${request.operationId}`];
    if(mutationFirst){
      assert.equal(first.status,'joined');assert.equal(second.settlement,'applied');
      assert.equal(state.registrations[actor.id].status,'joined');
      assert.deepEqual(operation.result,first);assert.equal(fence,undefined);
      assert.deepEqual(await store.transact(tx=>serviceFor(tx).mutate(request)),first);
    }else{
      assert.equal(first.settlement,'not-applied');assert.equal(second.status,'not-applied');
      assert.equal(state.registrations[actor.id],undefined);assert.equal(operation,undefined);
      assert.equal(fence.operationId,request.operationId);
      assert.deepEqual(await store.transact(tx=>serviceFor(tx).mutate(request)),second);
    }
    assert.deepEqual(await store.transact(tx=>serviceFor(tx).settle(closing)),mutationFirst?second:first);
    assert.equal((await store.snapshot()).revision,snapshot.revision,'recovery must not apply or fence the request a second time');
  });
  await pool.query('DELETE FROM zero_jams_registry_poc WHERE singleton=1');
  await pool.query(POSTGRES_REGISTRY_SEED,[freshRegistryEpoch(),JSON.stringify({events:{},settlements:{schema:1,operations:{}}})]);
  assert.notEqual((await store.snapshot()).revision,empty.revision);
});
