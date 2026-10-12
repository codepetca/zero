// Inert administrative fixture only. No Java, checker, worker or remote service.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,chmod,rm,readFile,writeFile,stat,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startDisposablePostgres} from './postgres-fixture.mjs';
import {migrateDatabase} from './database.mjs';
import {createRuntimePool} from './runtime.mjs';
import {exportBackup,restoreBackup,SCHEMA_SQL,SCHEMA_FINGERPRINTS} from './backup.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const names=['hub_users','hub_libraries','hub_submissions','hub_results','hub_releases','hub_objects'];
const id='11111111-1111-4111-8111-111111111111';
async function snapshot(pool) {
  const data=[];
  for(const name of names){const {rows}=await pool.query(`SELECT row_to_json(t)::text AS data FROM public.${name} t ORDER BY row_to_json(t)::text COLLATE "C"`);data.push(...rows.map(r=>r.data));}
  const {rows:[state]}=await pool.query('SELECT last_value::text,is_called FROM hub_library_number');
  return {digest:sha(JSON.stringify(data)),sequence:state};
}
async function targetEmpty(pool) {
  for(const name of [...names,'hub_sessions','hub_oauth_states'])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n,0);
  const {rows:[state]}=await pool.query('SELECT last_value::text,is_called FROM hub_library_number');assert.deepEqual(state,{last_value:'1',is_called:false});
}
test('private backup PostgreSQL proof',{skip:process.env.ZERO_HUB_BACKUP_PG_TEST!=='1',timeout:180000},async t=>{
  let fixture,source,target,targetAdmin,api,root;
  try {
    fixture=await startDisposablePostgres({port:15461,major:Number(process.env.ZERO_HUB_BACKUP_PG_MAJOR??17)});
    await migrateDatabase(fixture.pool,{roles:true});
    await fixture.pool.query('GRANT hub_migration_owner TO zero_test');
    await fixture.pool.query('CREATE DATABASE zero_backup_target');
    const targetURL=new URL(fixture.connectionString);targetURL.pathname='/zero_backup_target';
    targetAdmin=new pg.Pool({connectionString:targetURL.href,max:2});await migrateDatabase(targetAdmin,{roles:true});
    const operatorPassword=randomBytes(24).toString('hex');
    await fixture.pool.query(`CREATE ROLE zero_backup_operator LOGIN NOINHERIT PASSWORD '${operatorPassword}'`);await fixture.pool.query('GRANT hub_migration_owner TO zero_backup_operator');
    const operatorURL=new URL(fixture.connectionString);operatorURL.username='zero_backup_operator';operatorURL.password=operatorPassword;
    const targetOperatorURL=new URL(operatorURL);targetOperatorURL.pathname='/zero_backup_target';
    source=createRuntimePool(operatorURL.href,'hub_migration_owner');target=createRuntimePool(targetOperatorURL.href,'hub_migration_owner');
    root=await realpath(await mkdtemp(path.join(os.tmpdir(),'zero-backup-pg-')));await chmod(root,0o700);
    const file=path.join(root,'source.archive');
    await source.query("INSERT INTO hub_users(github_id,login,updated_at) VALUES('101','OriginalOwner','2026-10-01 01:02:03.123456+00')");
    await source.query("INSERT INTO hub_libraries(id,owner_id,created_at) VALUES('ui1','101','2026-10-01 01:02:03.654321+00')");
    const bundle='{"source":"inert exact text \\n Unicode ☃", "large":9007199254740993,"__proto__":{"ordinary":"data"}}';
    await source.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status,attempts) VALUES($1,'ui1','101','1.0.0',$2,$3,'published',2)",[id,bundle,sha(bundle)]);
    await source.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status,attempts,error) VALUES('22222222-2222-4222-8222-222222222222','ui1','101','0.1.0',$1,$2,'failed',3,'inert failure history')",[bundle,sha(bundle)]);
    await source.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES('33333333-3333-4333-8333-333333333333','ui1','101','2.0.0',$1,$2,'queued')",[bundle,sha(bundle)]);
    await source.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status,attempts,lease_token,lease_until) VALUES('44444444-4444-4444-8444-444444444444','ui1','101','3.0.0',$1,$2,'checking',1,'55555555-5555-4555-8555-555555555555','2026-10-01 01:02:03.777777+00')",[bundle,sha(bundle)]);
    const bytes=Buffer.from([0,1,2,127,128,255,10,13]);
    await source.query('INSERT INTO hub_results(submission_id,source_digest,policy,policy_digest,passed,report,jar,sources,pom,artifact_hashes) VALUES($1,$2,$3,$4,true,$5,$6,$7,$8,$9)',[id,sha(bundle),'inert-policy',sha('inert-policy'),' {"inert":true,"large":9007199254740993}',bytes,Buffer.from('exact inert source'),Buffer.from('inert pom'),' {"jar":"'+sha(bytes)+'"}']);
    await source.query("INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES('ui1','1.0.0',$1,$2)",[id,'{"contributor":{"githubId":"101","login":"OriginalOwner"},"version":"1.0.0"}']);
    await source.query('INSERT INTO hub_objects(digest,size,bytes) VALUES($1,$2,$3)',[sha(bytes),bytes.length,bytes]);
    await source.query("INSERT INTO hub_sessions VALUES('private-token','101','private-csrf','2030-01-01')");
    await source.query("INSERT INTO hub_oauth_states VALUES('private-state','private-binding','2030-01-01')");
    await source.query("SELECT setval('hub_library_number',9007199254740993,true)");
    const expected=await snapshot(source);
    await t.test('trusted schema fingerprint and private output permissions',async()=>{
      const major=Number(process.env.ZERO_HUB_BACKUP_PG_MAJOR??17);
      assert.equal(sha(JSON.stringify((await source.query(SCHEMA_SQL)).rows)),SCHEMA_FINGERPRINTS[major]);
      const exported=await exportBackup({pool:source,file});assert.deepEqual(exported.counts,[1,1,4,1,1,1]);assert.match(exported.sha256,/^[a-f0-9]{64}$/);
      assert.equal((await stat(file)).mode&0o777,0o600);assert.equal((await stat(root)).mode&0o777,0o700);
      const archive=await readFile(file,'utf8');assert.equal(archive.includes('private-token'),false);assert.equal(archive.includes('private-state'),false);
      await assert.rejects(exportBackup({pool:source,file}));
    });
    await t.test('bounded export cleans partial failure without publishing',async()=>{
      for(const limits of [{bytes:100},{records:2},{recordBytes:20},{recordBytes:256}]){const bounded=path.join(root,'bounded');await assert.rejects(exportBackup({pool:source,file:bounded,limits}));assert.equal((await readdir(root)).includes('bounded'),false);assert.equal((await readdir(root)).some(n=>n.endsWith('.partial')),false);}
    });
    const raw=await readFile(file,'utf8'),records=raw.trimEnd().split('\n').map(line=>JSON.parse(line));
    async function malformed(label,transform,limits) {
      const bad=path.join(root,label);await writeFile(bad,transform(raw,structuredClone(records)),{mode:0o600});
      await assert.rejects(restoreBackup({pool:target,file:bad,enabled:true,limits}),{message:'ZeroHub private backup operation failed'});await targetEmpty(target);
    }
    await t.test('malformed, truncated, cross-schema, unknown and corrupt binary archives roll back every row',async()=>{
      await malformed('truncated',text=>text.slice(0,text.lastIndexOf('\n',text.length-2)+1));
      await malformed('bad-version',(_,r)=>{r[0][1]=2;return r.map(JSON.stringify).join('\n')+'\n';});
      await malformed('bad-schema',(_,r)=>{r[0][3]='0'.repeat(64);return r.map(JSON.stringify).join('\n')+'\n';});
      await malformed('cross-major',(_,r)=>{r[0][3]=SCHEMA_FINGERPRINTS[Number(process.env.ZERO_HUB_BACKUP_PG_MAJOR??17)===17?18:17];return r.map(JSON.stringify).join('\n')+'\n';});
      await malformed('bad-digest',(_,r)=>{r.at(-1)[3]='0'.repeat(64);return r.map(JSON.stringify).join('\n')+'\n';});
      await malformed('extra',text=>text+'["unexpected"]\n');
      await malformed('bad-row',(_,r)=>{r[2][2].push('extra');return r.map(JSON.stringify).join('\n')+'\n';});
      await malformed('bad-binary',(_,r)=>{const row=r.find(row=>row[0]==='row'&&row[1]===5);row[2][2][2]='0'.repeat(64);return r.map(JSON.stringify).join('\n')+'\n';});
      await malformed('changed-sequence-old-digest',(_,r)=>{r.at(-1)[2]=['9007199254740994',true];return r.map(JSON.stringify).join('\n')+'\n';});
      for(const [label,state,library] of [['unsafe-uncalled-sequence',['1',false],'ui1'],['unsafe-called-sequence',['1',true],'ui2']])await malformed(label,(_,r)=>{
        // Keep all typed library references consistent while testing a called
        // sequence below the maximum restored reservation, without execution.
        for(const record of r)if(record[0]==='row')record[2]=record[2].map(value=>value==='ui1'?library:value);
        const end=r.at(-1);end[2]=state;
        end[3]=sha(r.slice(0,-1).map(JSON.stringify).join('\n')+'\n'+JSON.stringify(end.slice(0,3))+'\n');
        return r.map(JSON.stringify).join('\n')+'\n';
      });
      await malformed('small-budget',text=>text,{records:2});
    });
    await t.test('exact roundtrip preserves immutable bytes, metadata, source, failed/queued history and bigint sequence',async()=>{
      await restoreBackup({pool:target,file,enabled:true});assert.deepEqual(await snapshot(target),expected);
      for(const name of ['hub_sessions','hub_oauth_states'])assert.equal((await target.query(`SELECT count(*)::int n FROM ${name}`)).rows[0].n,0);
      await assert.rejects(target.query("UPDATE hub_objects SET bytes='\\x00'::bytea"));
      await assert.rejects(restoreBackup({pool:target,file,enabled:true}));assert.deepEqual(await snapshot(target),expected);
    });
    // Reset only the administrator-owned disposable target database, never a
    // product database or immutable table. Restore never drops/recreates these objects.
    async function resetTarget() {
      await target.end();await targetAdmin.end();await fixture.pool.query('DROP DATABASE zero_backup_target');await fixture.pool.query('CREATE DATABASE zero_backup_target');
      targetAdmin=new pg.Pool({connectionString:targetURL.href,max:2});await migrateDatabase(targetAdmin,{roles:true});target=createRuntimePool(targetOperatorURL.href,'hub_migration_owner');
    }
    await t.test('unused false is_called state roundtrips exactly',async()=>{
      await resetTarget();await source.query("SELECT setval('hub_library_number',37,false)");
      const second=path.join(root,'false.archive');await exportBackup({pool:source,file:second});await restoreBackup({pool:target,file:second,enabled:true});
      assert.deepEqual(await snapshot(target),await snapshot(source));assert.equal((await target.query("SELECT nextval('hub_library_number')::text n")).rows[0].n,'37');
    });
    await t.test('populated authentication or used sequence target is refused without mutation',async()=>{
      await resetTarget();await target.query("INSERT INTO hub_oauth_states VALUES('existing-state','binding','2030-01-01')");await assert.rejects(restoreBackup({pool:target,file,enabled:true}));assert.equal((await target.query('SELECT count(*)::int n FROM hub_oauth_states')).rows[0].n,1);
      await resetTarget();await target.query("SELECT nextval('hub_library_number')");await assert.rejects(restoreBackup({pool:target,file,enabled:true}));assert.deepEqual((await target.query('SELECT last_value::text,is_called FROM hub_library_number')).rows[0],{last_value:'1',is_called:true});
    });
    await t.test('setval on transactional sequence replacement rolls back both original is_called states',async()=>{
      await resetTarget();
      for(const called of [false,true]) {
        await target.query("SELECT setval('hub_library_number',19,$1)",[called]);const client=await target.connect();
        try {await client.query('BEGIN');await client.query('ALTER SEQUENCE hub_library_number NO CYCLE');await client.query('ALTER SEQUENCE hub_library_number RESTART WITH 1');await client.query("SELECT setval('hub_library_number',9223372036854775807,true)");await client.query('ROLLBACK');}finally{client.release();}
        assert.deepEqual((await target.query('SELECT last_value::text,is_called FROM hub_library_number')).rows[0],{last_value:'19',is_called:called});
      }
    });
    await t.test('repeatable-read export ignores later row updates while sampling sequence conservatively',async()=>{
      await resetTarget();
      const before=await snapshot(source);let injected=false;
      const concurrent={async connect(){const client=await source.connect();return {release(){client.release();},async query(query,params){
        if(!injected&&query?.text==='FETCH FORWARD 1 FROM hub_backup_cursor') {
          injected=true;await fixture.pool.query("UPDATE hub_users SET login='LaterOwner' WHERE github_id='101'");await fixture.pool.query("SELECT nextval('hub_library_number')");
        }
        return client.query(query,params);
      }};}};
      const consistent=path.join(root,'consistent.archive');await exportBackup({pool:concurrent,file:consistent});await restoreBackup({pool:target,file:consistent,enabled:true});
      const restored=await snapshot(target),after=await snapshot(source);assert.equal(restored.digest,before.digest);assert.notEqual(after.digest,before.digest);assert.deepEqual(restored.sequence,after.sequence);
    });
    await t.test('table-lock timeout fails closed without changing empty target',async()=>{
      await resetTarget();const blocker=await target.connect();
      try {await blocker.query('BEGIN');await blocker.query('LOCK TABLE hub_users IN ACCESS SHARE MODE');await assert.rejects(restoreBackup({pool:target,file,enabled:true}));}
      finally{await blocker.query('ROLLBACK');blocker.release();}
      await targetEmpty(target);
    });
    await t.test('runtime API role cannot cross the operator guard',async()=>{
      const password=randomBytes(24).toString('hex');await fixture.pool.query(`CREATE ROLE zero_backup_api LOGIN NOINHERIT PASSWORD '${password}'`);await fixture.pool.query('GRANT hub_api TO zero_backup_api');
      const url=new URL(fixture.connectionString);url.username='zero_backup_api';url.password=password;api=createRuntimePool(url.href,'hub_api');
      await assert.rejects(exportBackup({pool:api,file:path.join(root,'runtime.archive')}));await assert.rejects(restoreBackup({pool:api,file,enabled:true}));assert.equal((await readdir(root)).includes('runtime.archive'),false);
    });
    await t.test('schema drift refuses export and import',async()=>{
      await resetTarget();await target.query('ALTER TABLE hub_users ADD COLUMN untrusted text');
      await assert.rejects(restoreBackup({pool:target,file,enabled:true}));await assert.rejects(exportBackup({pool:target,file:path.join(root,'drift.archive')}));assert.equal((await target.query('SELECT count(*)::int n FROM hub_users')).rows[0].n,0);
      await resetTarget();await target.query('ALTER TABLE hub_objects DISABLE TRIGGER hub_object_immutable');
      await assert.rejects(restoreBackup({pool:target,file,enabled:true}));
    });
  }finally{await api?.end();await target?.end();await source?.end();await targetAdmin?.end();await fixture?.stop();if(root)await rm(root,{recursive:true,force:true});}
});
