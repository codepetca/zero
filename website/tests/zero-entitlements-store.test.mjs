import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir, userInfo} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {createServer} from 'node:net';
import {createEntitlementStore, configuredEntitlementStore} from '../lib/zero-entitlements-store.mjs';

const exec = promisify(execFile);
const input = {targetId:'123',capability:'pro_listings',expiresAt:null,reason:'Pilot access',actorId:'456',operationId:'grant-op-123'};
const fake = {connect:async()=>{throw Error('secret connection string');},query:async()=>{throw Error('secret database detail');}};

test('configuration and inputs reject malformed data without exposing database details', async()=>{
  assert.equal(configuredEntitlementStore({}),null);
  for (const value of ['not-a-url','postgresql://bad:secret@example.com/db?sslmode=disable','http://bad:secret@example.com/db']) {
    assert.throws(()=>configuredEntitlementStore({ZERO_ENTITLEMENTS_DATABASE_URL:value}), e=>e.status===503&&!e.message.includes('secret'));
  }
  const store=createEntitlementStore(fake);
  for (const patch of [{targetId:'01'},{capability:'admin'},{expiresAt:'2026-02-30T00:00:00Z'},{reason:'\n'},{operationId:'x'}])
    await assert.rejects(store.grant({...input,...patch}), e=>e.status===400);
  await assert.rejects(store.resolve('123'),e=>e.status===503&&!e.message.includes('secret'));
  await assert.rejects(store.grant(input),e=>e.status===503&&!e.message.includes('secret'));
});

test('Postgres stores, expires, revokes and idempotently audits grants in transactions', {timeout:60000}, async t=>{
  if (typeof process.getuid === 'function' && process.getuid() === 0) return t.skip('initdb cannot run as root');
  let bin;
  try { bin=(await exec('which',['pg_ctl'])).stdout.trim().replace(/\/pg_ctl$/, ''); } catch { return t.skip('PostgreSQL tools unavailable'); }
  const root=await mkdtemp(join(tmpdir(),'zero-entitlements-'));
  const data=join(root,'data'), socket=join(root,'socket');
  const {mkdir}=await import('node:fs/promises'); await mkdir(socket);
  let started=false, pool;
  try {
    await exec(join(bin,'initdb'),['-D',data,'-A','trust','-U',userInfo().username,'--no-sync'],{timeout:30000});
    await exec(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'log'),'-o',`-h '' -k ${socket} -p 55443`,'-w','start'],{timeout:15000}); started=true;
    pool=new Pool({host:socket,port:55443,user:userInfo().username,database:'postgres',ssl:false,max:4});
    await pool.query(await readFile(new URL('../sql/zero-entitlements.sql',import.meta.url),'utf8'));
    const store=createEntitlementStore(pool);
    const [first,replay]=await Promise.all([store.grant(input),store.grant(input)]);
    assert.deepEqual(first,replay);
    assert.equal(first.source,'manual');
    await assert.rejects(store.grant({...input,reason:'Different'}),e=>e.status===409);
    assert.deepEqual(await store.resolve('123'),{listingLimit:10,jamHosting:false,grants:[first]});
    await assert.rejects(store.grant({...input,capability:'jam_hosting',expiresAt:'2000-01-01T00:00:00Z',operationId:'expired-op-123'}),e=>e.status===400);
    const expiresAt=new Date(Date.now()+1500).toISOString();
    const jamInput={...input,capability:'jam_hosting',expiresAt,operationId:'grant-jam-123'};
    const jam=await store.grant(jamInput);
    assert.equal((await store.list('123')).access.jamHosting,true);
    await new Promise(resolve=>setTimeout(resolve,1600));
    assert.deepEqual(await store.grant(jamInput),jam,'accepted operation replays after expiry');
    assert.equal((await store.resolve('123')).jamHosting,false);
    assert.equal((await store.list('123')).access.jamHosting,false);
    const revoke={grantId:first.id,reason:'End pilot',actorId:'456',operationId:'revoke-op-123'};
    const revoked=await store.revoke(revoke);
    assert.ok(revoked.revokedAt);
    assert.deepEqual(await store.revoke(revoke),revoked);
    assert.equal((await store.resolve('123')).listingLimit,1);
    const history=await store.list('123');
    assert.equal(history.grants.length,2); assert.equal(history.audit.length,3);
    assert.deepEqual(history.access,{listingLimit:1,jamHosting:false});
    assert.ok(history.grants.some(g=>g.id===jam.id));
    assert.equal(history.audit.filter(a=>a.action==='grant').length,2);
    await assert.rejects(store.revoke({...revoke,grantId:'11111111-1111-4111-8111-111111111111',operationId:'missing-op-123'}),e=>e.status===404);
    assert.equal((await store.list('123')).audit.length,3);
    // A failed audit insert rolls the grant and operation back together.
    await pool.query('ALTER TABLE zero_entitlements.audit ADD CONSTRAINT reject_fixture CHECK (reason <> \'reject fixture\')');
    await assert.rejects(store.grant({...input,reason:'reject fixture',operationId:'rollback-op-123'}),e=>e.status===503);
    assert.equal((await store.list('123')).grants.length,2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_entitlements.operations WHERE operation_id=$1',['rollback-op-123'])).rows[0].n,0);
    // Concurrent writes cannot expose a grant without its audit or an access
    // decision derived from another snapshot.
    const snapshots=await Promise.all(Array.from({length:8},async (_,i)=>{
      await store.grant({...input,targetId:'555',operationId:`concurrent-${i}-op`});
      return store.list('555');
    }));
    for (const snapshot of snapshots) {
      assert.equal(snapshot.grants.length,snapshot.audit.length);
      assert.equal(snapshot.access.listingLimit,snapshot.grants.length ? 10 : 1);
      assert.ok(snapshot.audit.every(a=>snapshot.grants.some(g=>g.id===a.grantId)));
    }
  } finally {
    if(pool) await pool.end();
    if(started) await exec(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{timeout:10000});
    await rm(root,{recursive:true,force:true});
  }
});


test('configured pool bounds stalled connections and saturation', {timeout:10000}, async()=>{
  const sockets=new Set();
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port=server.address().port;
    const store=configuredEntitlementStore({NODE_ENV:'test',ZERO_ENTITLEMENTS_DATABASE_URL:`postgresql://fixture:secret@127.0.0.1:${port}/fixture`});
    const start=Date.now();
    const results=await Promise.allSettled(Array.from({length:5},()=>store.resolve('123')));
    assert.ok(results.every(result=>result.status==='rejected' && result.reason.status===503));
    assert.ok(Date.now()-start<3500,'pool acquisition and stalled connections are bounded');
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve=>server.close(resolve));
  }
});
