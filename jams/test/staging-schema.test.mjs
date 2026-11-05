import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {join,isAbsolute} from 'node:path';
import {createPostgresJamStore} from '../postgres-registry.mjs';

const sql=await readFile(new URL('../staging/registry-schema.proposal.sql',import.meta.url),'utf8');
const enabled=process.env.ZERO_TEST_STAGING_PG==='1';
const execFile=promisify(execFileCallback);
const table='zerojams_staging_private.registry';
const epoch='a'.repeat(24),document={events:{},settlements:{schema:1,operations:{}}};

test('staging schema is an explicit review proposal with no password or seed',()=>{
  assert.match(sql,/not an applied migration/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/No functions\/routines are permitted/);
  assert.match(sql,/APPLICATION invariants, not database-enforced permissions/);
  assert.match(sql,/GRANT UPDATE \(generation, document\)/);
  const statements=sql.replace(/--[^\n]*/g,'');
  assert.doesNotMatch(statements,/\bPASSWORD\b|\bINSERT\s+INTO\b|SECURITY\s+DEFINER|GRANT\s+.*\bTO\s+(?:PUBLIC|anon|authenticated|service_role)\b/i);
});

// Opt in explicitly. This test creates and destroys its own fresh cluster; it
// accepts no database URL, existing socket/database, password or hosted target.
// ZERO_TEST_PG_BIN must contain initdb/pg_ctl. ZERO_TEST_PG_MODULE must name an
// installed pg package directory with exact version 8.16.3. No install occurs.
test('private staging schema enforces real role, column and RLS boundaries',
  {skip:!enabled,timeout:30000},async t=>{
  const bin=process.env.ZERO_TEST_PG_BIN,modulePath=process.env.ZERO_TEST_PG_MODULE;
  assert.ok(bin&&isAbsolute(bin),'explicit absolute PostgreSQL binary directory required');
  assert.ok(modulePath&&isAbsolute(modulePath),'explicit absolute pg module path required');
  const require=createRequire(import.meta.url);
  assert.equal(require(join(modulePath,'package.json')).version,'8.16.3');
  const {Pool}=require(modulePath);
  const root=await mkdtemp('/tmp/zero-staging-schema.'),data=join(root,'data'),socket=join(root,'socket');
  await mkdir(socket,{mode:0o700});
  const childEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
  let started=false;const pools=[];
  t.after(async()=>{
    try{await Promise.all(pools.map(pool=>pool.end()));}
    finally{
      // Preserve the directory if shutdown fails: never remove a live cluster.
      if(started)await execFile(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{env:childEnv,timeout:10000});
      await rm(root,{recursive:true,force:true});
    }
  });
  await execFile(join(bin,'initdb'),['-D',data,'--username=zerojams_fixture_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],{env:childEnv,timeout:10000});
  started=true;
  await execFile(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-o',`-h '' -k ${socket} -p 55441`,'-w','start'],{env:childEnv,timeout:10000});
  const connect=user=>{
    const pool=new Pool({host:socket,port:55441,user,database:'postgres',password:()=>'',ssl:false,
      options:'-c search_path=pg_catalog',max:2,connectionTimeoutMillis:1000,idleTimeoutMillis:1000});
    pools.push(pool);return pool;
  };
  const admin=connect('zerojams_fixture_admin');
  assert.equal((await admin.query('SHOW listen_addresses')).rows[0].listen_addresses,'');
  await admin.query('CREATE ROLE anon LOGIN; CREATE ROLE authenticated LOGIN; CREATE ROLE service_role LOGIN BYPASSRLS; CREATE ROLE zerojams_fixture_outsider LOGIN');
  await admin.query(sql);
  await admin.query(`INSERT INTO ${table} (singleton,epoch,generation,document) VALUES (1,$1,0,$2::jsonb)`,[epoch,JSON.stringify(document)]);

  await t.test('runtime performs actual fixed-target store transactions with only column grants',async()=>{
    const runtime=connect('zerojams_staging_runtime');
    const store=createPostgresJamStore({pool:runtime,target:'staging'});
    const before=await store.snapshot();assert.equal(before.revision,epoch+'0'.repeat(16));
    assert.equal(await store.compareAndSwap(null,before.revision,null,{settlements:document.settlements}),true);
    const after=await store.snapshot();assert.equal(after.revision,epoch+'0'.repeat(15)+'1');
    assert.deepEqual((await runtime.query(`SELECT document FROM ${table}`)).rows[0].document,document);
    const result=await runtime.query(`UPDATE ${table} SET generation=generation+1,document=$1::jsonb WHERE singleton=1 RETURNING epoch,generation`,[JSON.stringify(document)]);
    assert.equal(result.rowCount,1);assert.equal(result.rows[0].epoch,epoch);assert.equal(result.rows[0].generation,'2');
    const columns=(await admin.query("SELECT has_table_privilege($1,$2,'UPDATE') AS table_update,has_column_privilege($1,$2,'epoch','UPDATE') AS epoch_update,has_column_privilege($1,$2,'generation','UPDATE') AS generation_update,has_column_privilege($1,$2,'document','UPDATE') AS document_update",['zerojams_staging_runtime',table])).rows[0];
    assert.deepEqual(columns,{table_update:false,epoch_update:false,generation_update:true,document_update:true});
  });

  await t.test('runtime cannot alter protected columns, insert/delete, DDL or assume owner',async()=>{
    const runtime=connect('zerojams_staging_runtime');
    const forbidden=[
      `UPDATE ${table} SET epoch='${'b'.repeat(24)}' WHERE singleton=1`,
      `UPDATE ${table} SET singleton=1 WHERE singleton=1`,
      `INSERT INTO ${table} SELECT * FROM ${table}`,
      `DELETE FROM ${table}`,`TRUNCATE ${table}`,
      `ALTER TABLE ${table} ADD COLUMN injected text`,`DROP TABLE ${table}`,
      'CREATE TABLE zerojams_staging_private.injected (id integer)',
      'CREATE SCHEMA injected','ALTER SCHEMA zerojams_staging_private RENAME TO injected',
      'SET ROLE zerojams_staging_owner','ALTER ROLE zerojams_staging_runtime BYPASSRLS'
    ];
    for(const query of forbidden)await assert.rejects(runtime.query(query),error=>error.code==='42501',query);
    assert.deepEqual((await admin.query(`SELECT epoch,generation,document FROM ${table}`)).rows[0],{epoch,generation:'2',document});
  });

  await t.test('generation monotonicity and document semantics require the trusted application',async()=>{
    const runtime=connect('zerojams_staging_runtime'),client=await runtime.connect();
    try{
      await client.query('BEGIN');
      // Demonstrate the permission boundary, then roll it back. SQL grants do
      // not implement CAS, operation fences or full application validation.
      const result=await client.query(`UPDATE ${table} SET generation=0,document=$1::jsonb WHERE singleton=1 RETURNING generation,document`,[JSON.stringify({events:{},settlements:{}})]);
      assert.equal(result.rows[0].generation,'0');
      assert.deepEqual(result.rows[0].document,{events:{},settlements:{}});
    }finally{await client.query('ROLLBACK');client.release();}
    assert.deepEqual((await admin.query(`SELECT epoch,generation,document FROM ${table}`)).rows[0],{epoch,generation:'2',document});
  });

  await t.test('API roles including BYPASSRLS and unrelated PUBLIC member cannot reach schema',async()=>{
    for(const role of ['anon','authenticated','service_role','zerojams_fixture_outsider']){
      const pool=connect(role);
      for(const query of [`SELECT * FROM ${table}`,`UPDATE ${table} SET generation=generation+1`,`DELETE FROM ${table}`])
        await assert.rejects(pool.query(query),error=>error.code==='42501',role+': '+query);
      const privileges=(await admin.query('SELECT has_schema_privilege($1,$2,\'USAGE\') AS usage,has_table_privilege($1,$3,\'SELECT\') AS read,has_any_column_privilege($1,$3,\'UPDATE\') AS write',[role,'zerojams_staging_private',table])).rows[0];
      assert.deepEqual(privileges,{usage:false,read:false,write:false});
    }
  });

  await t.test('roles and forced policies do not permit ownership or RLS bypass',async()=>{
    const roles=(await admin.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolpassword FROM pg_authid WHERE rolname IN ('zerojams_staging_owner','zerojams_staging_runtime') ORDER BY rolname")).rows;
    assert.equal(roles.length,2);
    for(const role of roles){assert.equal(role.rolpassword,null);for(const key of ['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls'])assert.equal(role[key],false);}
    assert.equal(roles[0].rolcanlogin,false);assert.equal(roles[1].rolcanlogin,true);
    const metadata=(await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=$1::regclass",[table])).rows[0];
    assert.deepEqual(metadata,{relrowsecurity:true,relforcerowsecurity:true,owner:'zerojams_staging_owner'});
    assert.equal((await admin.query("SELECT count(*)::integer AS n FROM pg_proc WHERE pronamespace='zerojams_staging_private'::regnamespace")).rows[0].n,0);
    assert.equal((await admin.query("SELECT count(*)::integer AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='zerojams_staging_runtime')")).rows[0].n,0);
    // Give the unrelated role access only within a rollback: no RLS policy
    // still means no visible/updateable row, independently of schema grants.
    const client=await admin.connect();
    try{
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE zerojams_staging_owner');
      assert.equal((await client.query(`SELECT * FROM ${table}`)).rowCount,0);
      await client.query('RESET ROLE');
      await client.query('GRANT USAGE ON SCHEMA zerojams_staging_private TO zerojams_fixture_outsider');
      await client.query(`GRANT SELECT,UPDATE ON ${table} TO zerojams_fixture_outsider`);
      await client.query('SET LOCAL ROLE zerojams_fixture_outsider');
      assert.equal((await client.query(`SELECT * FROM ${table}`)).rowCount,0);
      assert.equal((await client.query(`UPDATE ${table} SET generation=generation+1`)).rowCount,0);
    }finally{await client.query('ROLLBACK');client.release();}
  });
});
