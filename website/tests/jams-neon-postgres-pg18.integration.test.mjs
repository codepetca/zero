// Opt-in, disposable loopback PostgreSQL 18 fixture. The entire fixture and
// every adversarial grant are rolled back; never point this at provider data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';

const url=process.env.ZERO_JAMS_PG18_FIXTURE_URL;
test('production identity SQL rejects PostgreSQL 18 privilege and membership drift', {skip:!url},async()=>{
  const parsed=new URL(url);
  assert.equal(parsed.protocol,'postgresql:');
  assert.equal(parsed.hostname,'127.0.0.1');
  assert.equal(parsed.pathname,'/zero_neon_selector_fixture');
  assert.equal(parsed.username,'postgres');
  assert.equal(parsed.password,'');
  assert.equal(parsed.search,'');assert.equal(parsed.hash,'');
  const client=new Client({connectionString:url});await client.connect();
  try{
    const version=await client.query('SHOW server_version_num');assert.ok(Number(version.rows[0].server_version_num)>=180000);
    const source=await readFile(new URL('../lib/jams-neon-postgres-selector.mjs',import.meta.url),'utf8');
    const sql=source.match(/const identitySql=`([\s\S]*?)`;/)?.[1];assert.ok(sql);
    const proposal=await readFile(new URL('../../jams/production/registry-schema.proposal.sql',import.meta.url),'utf8');
    await client.query('BEGIN');
    try{
      await client.query(proposal.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
      await client.query(`CREATE ROLE cloud_admin SUPERUSER; CREATE ROLE neondb_owner CREATEDB CREATEROLE BYPASSRLS;
        GRANT zerojams_production_owner, zerojams_production_runtime TO cloud_admin WITH ADMIN TRUE;
        SET ROLE cloud_admin;
        GRANT zerojams_production_owner, zerojams_production_runtime TO neondb_owner WITH ADMIN TRUE, SET FALSE, INHERIT FALSE GRANTED BY cloud_admin;
        RESET ROLE`);
      const roles=await client.query("SELECT rolname,oid FROM pg_catalog.pg_roles WHERE rolname IN ('neondb_owner','cloud_admin')");
      const ids=Object.fromEntries(roles.rows.map(row=>[row.rolname,row.oid]));
      const identity=async()=>{await client.query('SET ROLE zerojams_production_runtime');try{return (await client.query(sql,[ids.neondb_owner,ids.cloud_admin])).rows[0];}finally{await client.query('RESET ROLE');}};
      let row=await identity();
      for(const key of ['provider_membership_safe','owner_safe','readable','generation_write','document_write','row_security','force_row_security'])assert.equal(row[key],true,key);
      for(const key of ['elevated','membership','delegated_access','schema_create','owner_member','epoch_write','singleton_write','extra_write','public_access','unexpected_access','runtime_grant_option'])assert.equal(row[key],false,key);
      const scenarios=[
        ...['LOGIN','SUPERUSER','CREATEDB','CREATEROLE','REPLICATION','BYPASSRLS'].map(attribute=>[`owner ${attribute}`,`ALTER ROLE zerojams_production_owner ${attribute}`,'owner_safe',false]),
        ['MAINTAIN','GRANT MAINTAIN ON TABLE zerojams_production_private.registry TO zerojams_production_runtime','extra_write',true],
        ['grant option','GRANT USAGE ON SCHEMA zerojams_production_private TO zerojams_production_runtime WITH GRANT OPTION','runtime_grant_option',true],
        ['column grant option','GRANT UPDATE (document) ON zerojams_production_private.registry TO zerojams_production_runtime WITH GRANT OPTION','runtime_grant_option',true],
        ['SET membership','SET ROLE cloud_admin; GRANT zerojams_production_runtime TO neondb_owner WITH ADMIN TRUE, SET TRUE, INHERIT FALSE GRANTED BY cloud_admin; RESET ROLE','provider_membership_safe',false],
        ['inherited membership','SET ROLE cloud_admin; GRANT zerojams_production_runtime TO neondb_owner WITH ADMIN TRUE, SET FALSE, INHERIT TRUE GRANTED BY cloud_admin; RESET ROLE','provider_membership_safe',false],
        ['alternate creator path','CREATE ROLE path_fixture; GRANT path_fixture TO neondb_owner; GRANT zerojams_production_runtime TO path_fixture','provider_membership_safe',false],
        ['other role access','CREATE ROLE extra_fixture; GRANT zerojams_production_runtime TO extra_fixture','delegated_access',true],
        ['wrong grantor','GRANT zerojams_production_runtime TO neondb_owner WITH ADMIN TRUE, SET FALSE, INHERIT FALSE','provider_membership_safe',false]
      ];
      for(const [name,mutation,key,expected] of scenarios){
        await client.query('SAVEPOINT adversary');
        try{await client.query(mutation);row=await identity();assert.equal(row[key],expected,`${name}: ${key}`);}
        finally{await client.query('ROLLBACK TO SAVEPOINT adversary');}
      }
    }finally{await client.query('ROLLBACK');}
  }finally{await client.end();}
});
