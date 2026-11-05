import test from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates,checkServerIdentity} from 'node:tls';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {createStagingPostgresAuthoritySelector} from '../lib/jams-staging-postgres-selector.mjs';
import {hostedManifest} from '../../jams/test/fixtures.mjs';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {postJamProposalResponse} from '../lib/jams-http.mjs';

const epoch='a'.repeat(24),now=Date.parse('2030-01-02T12:00:00Z'),secret='synthetic-private-pg-password-1234';
const role='zerojams_staging_runtime',ref='abcdefghijklmnopqrst',host='aws-0-us-east-1.pooler.supabase.com';
const uri=`postgresql://${role}.${ref}:${secret}@${host}:5432/postgres`;
const config=()=>({NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_STAGING_AUTHORITY:'supabase-postgres',ZERO_JAMS_STAGING_PROJECT_REF:ref,
  ZERO_JAMS_STAGING_PG_HOST:host,ZERO_JAMS_STAGING_PG_PORT:'5432',ZERO_JAMS_STAGING_PG_DATABASE:'postgres',ZERO_JAMS_STAGING_PG_ROLE:role,
  ZERO_JAMS_STAGING_PG_EPOCH:epoch,ZERO_JAMS_STAGING_PG_CA_PEM:rootCertificates[0],ZERO_JAMS_STAGING_PG_URI:uri});
const unavailable=error=>error?.status===503&&error.message==='The staging jam authority is unavailable.'&&!error.cause;
const noFetch=async()=>{throw new Error('Unexpected provider request.');};
function fakePool(){
  const db={epoch,generation:'0',document:{events:{},settlements:{schema:1,operations:{}}},updates:0,ends:0,connections:0,releases:[],queries:[],identity:{database:'postgres',role,elevated:false,membership:false,delegated_access:false,relation_kind:'r',row_security:true,force_row_security:true,table_owner:'zerojams_staging_owner',schema_owner:'zerojams_staging_owner',schema_create:false,owner_member:false,readable:true,generation_write:true,document_write:true,epoch_write:false,singleton_write:false,extra_write:false,public_access:false,unexpected_access:false,api_roles_present:true,api_access:false}};
  const pool={async end(){db.ends++;},async connect(){db.connections++;let staged;
    return {release(destroy){db.releases.push(Boolean(destroy));},async query(sql,params){
      db.queries.push(sql);
      if(db.error)throw db.error;
      if(sql.startsWith('SELECT pg_catalog.current_database()'))return {rows:[{...db.identity}]};
      if(sql.startsWith('SELECT epoch,generation,document')){assert.ok(sql.includes('FROM zerojams_staging_private.registry '));return {rows:[{epoch:db.epoch,generation:db.generation,document:structuredClone(db.document)}]};}
      if(sql.startsWith('UPDATE')){assert.ok(sql.startsWith('UPDATE zerojams_staging_private.registry '));staged={generation:params[0],document:JSON.parse(params[1])};return {rowCount:1};}
      if(sql==='COMMIT'&&staged){db.generation=staged.generation;db.document=staged.document;db.updates++;if(db.loseCommit){db.loseCommit=false;throw new Error(uri);}}
      assert.ok(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL '));return {rows:[],rowCount:1};
    }};
  }};
  return {db,pool};
}

test('one session pool uses explicit TLS and fixed staging SQL; request tokens stay isolated',async()=>{
  const env=config(),{db,pool}=fakePool(),tokens=[];let builds=0,options;
  const fetchImpl=async(url,init)=>{
    tokens.push(init.headers.Authorization);const login=new URL(url).pathname.split('/')[2],id=login==='student1'?33:34;
    return Response.json({id:1000+id,private:false,visibility:'public',owner:{id,type:'User'},full_name:`${login}/project`});
  };
  const selector=createStagingPostgresAuthoritySelector({env,now:()=>now,fetchImpl,poolFactory:async value=>{builds++;options=value;return pool;}});
  const first=await selector.authorityForRequest({sourceToken:'synthetic-visitor-111'}),second=await selector.authorityForRequest({sourceToken:'synthetic-visitor-222'});
  assert.equal(builds,1);assert.equal(options.host,host);assert.equal(options.port,5432);assert.equal(options.database,'postgres');assert.equal(options.user,`${role}.${ref}`);
  assert.equal(options.password(),secret);assert.equal(options.connectionString,undefined);assert.equal(options.options,undefined);assert.equal(options.max,2);
  assert.equal(options.ssl.ca,rootCertificates[0]);assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.servername,host);assert.equal(options.ssl.checkServerIdentity,checkServerIdentity);assert.equal(options.ssl.minVersion,'TLSv1.2');
  assert.equal(options.ssl.checkServerIdentity(host,{subjectaltname:'DNS:attacker.example'}).code,'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(options.ssl.checkServerIdentity(host,{subjectaltname:`DNS:${host}`}),undefined);
  const proposal=await first.service.propose({actor:{id:'11',login:'creator'},operationId:'staging-propose-0001',manifest:hostedManifest()});
  await first.service.mutate({id:proposal.eventId,actor:{id:'4050555',login:'armorup'},operationId:'staging-approve-0001',action:'approve',revision:proposal.revision});
  for(const [authority,id,login] of [[first,'33','student1'],[second,'34','student2']])await authority.service.mutate({id:proposal.eventId,actor:{id,login},operationId:`staging-join-${id}`,action:'join',revision:proposal.revision,repositoryUrl:`https://github.com/${login}/project`});
  assert.deepEqual(tokens,['Bearer synthetic-visitor-111','Bearer synthetic-visitor-222']);assert.equal((await first.visibilityReader()).isHeld('1034'),true);
  assert.equal(first.jamOptions.service,first.service);assert.equal(first.hubOptions.visibilityReader,first.visibilityReader);
  assert.notEqual(first.jamOptions.env,env);assert.equal(first.jamOptions.env,first.hubOptions.env);
  assert.equal(first.jamOptions.env.ZERO_JAMS_STAGING_PG_URI,undefined);assert.equal(first.hubOptions.env.ZERO_JAMS_STAGING_PG_CA_PEM,undefined);
  assert.equal(first.jamOptions.env.ZERO_JAMS_PRIVATE_KEY,undefined);assert.equal(JSON.stringify(first.jamOptions).includes(secret),false);assert.equal(JSON.stringify(first.hubOptions).includes('BEGIN CERTIFICATE'),false);
  env.ZERO_JAMS_ENABLED='0';assert.equal((await second.visibilityReader()).isHeld('1033'),true);
  await assert.rejects(first.service.propose({actor:{id:'11',login:'creator'},operationId:'staging-disabled-0001',manifest:hostedManifest()}),unavailable);
  assert.equal(db.updates,4);await selector.close();assert.equal(db.ends,1);await assert.rejects(selector.authorityForRequest(),unavailable);
});

test('hostile URIs and invalid explicit settings reject before pool creation or provider calls',()=>{
  let pools=0,fetches=0;const dependencies={poolFactory:()=>{pools++;},fetchImpl:()=>{fetches++;}};
  const uris=[uri+'?sslmode=disable',uri+'?',uri+'#',uri+'#PRIVATE',uri+'?options=x',uri.replace(host,host+'.attacker.example'),uri.replace(host,'127.0.0.1'),uri.replace(':5432/',':6543/'),uri.replace(':5432/','/'),uri.replace('/postgres','/other'),uri.replace('/postgres','/x/../postgres'),uri.replace(ref,'z'.repeat(20)),uri.replace(role,'postgres'),uri.replace('postgresql:','https:'),uri.replace(secret,'short'),uri.replace(secret,'bad%00password-1234'),uri.replace(secret,'bad%0apassword-1234'),uri.replace(secret,'broken%zzpassword-1234'),uri.replace('@','@attacker.example@'),uri.replace(host,host+',attacker.example'),uri.replace(host,host.toUpperCase()),uri.replace(host,'aws-0-us-east-1%2epooler.supabase.com'),uri.replace(secret,secret+'\\x')];
  const mutators=[env=>delete env.ZERO_JAMS_STAGING_PG_EPOCH,env=>env.ZERO_JAMS_STAGING_AUTHORITY='postgres',env=>env.ZERO_JAMS_STAGING_PROJECT_REF='a'.repeat(19)+'1',env=>env.ZERO_JAMS_STAGING_PG_HOST='pooler.supabase.com',env=>env.ZERO_JAMS_STAGING_PG_ROLE='postgres',env=>env.ZERO_JAMS_STAGING_PG_DATABASE='other',env=>env.ZERO_JAMS_STAGING_PG_PORT='6543',env=>env.ZERO_JAMS_STAGING_PG_CA_PEM='PRIVATE',env=>env.ZERO_JAMS_STAGING_PG_CA_PEM=rootCertificates[0]+rootCertificates[0],env=>env.NODE_ENV='production',env=>env.VERCEL_ENV='preview',env=>env.PGPASSWORD='PRIVATE',env=>env.ZERO_JAMS_LOCAL_AUTHORITY='postgres',env=>env.NEXT_PUBLIC_ZERO_JAMS_STAGING_PG_URI='PRIVATE',env=>env.NODE_TLS_REJECT_UNAUTHORIZED='0'];
  for(const value of uris)mutators.push(env=>env.ZERO_JAMS_STAGING_PG_URI=value);
  for(const mutate of mutators){const env=config();mutate(env);assert.throws(()=>createStagingPostgresAuthoritySelector({env,...dependencies}),unavailable);}
  assert.equal(pools,0);assert.equal(fetches,0);
});

test('encoded password is decoded once and never passed as a connection string',async()=>{
  const env=config(),{pool}=fakePool();let options;env.ZERO_JAMS_STAGING_PG_URI=uri.replace(secret,'synthetic%40secret%3Apass%25word');
  const selector=createStagingPostgresAuthoritySelector({env,fetchImpl:noFetch,poolFactory:value=>{options=value;return pool;}});
  await selector.authorityForRequest();assert.equal(options.password(),'synthetic@secret:pass%word');assert.equal(options.connectionString,undefined);await selector.close();
});

test('sanitized option env preserves authenticated HTTP and CSRF without exposing connection secrets',async()=>{
  const env={...config(),ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'synthetic-client-secret-1234',ZERO_HUB_GITHUB_SESSION_SECRET:'b'.repeat(64)};
  const {pool,db}=fakePool(),actor={id:11,login:'creator'},token='ghu_synthetic_visitor_token_1234',auth=hubConfig(env);assert.ok(auth);
  const session=newSession(token,actor,28800,auth,now),fetchImpl=async(url,init)=>{assert.equal(url,'https://api.github.com/user');assert.equal(init.headers.Authorization,`Bearer ${token}`);return Response.json(actor);};
  const selector=createStagingPostgresAuthoritySelector({env,now:()=>now,fetchImpl,poolFactory:()=>pool}),authority=await selector.authorityForRequest();
  assert.ok(hubConfig(authority.jamOptions.env));assert.equal(authority.jamOptions.env.ZERO_HUB_GITHUB_SESSION_SECRET,env.ZERO_HUB_GITHUB_SESSION_SECRET);
  assert.equal(JSON.stringify(authority.jamOptions).includes(env.ZERO_HUB_GITHUB_SESSION_SECRET),false);
  const request=csrf=>new Request(auth.origin+'/api/jams/proposals',{method:'POST',headers:{Origin:auth.origin,Cookie:session.cookie.split(';')[0],'X-Hub-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({operationId:'staging-http-0001',manifest:hostedManifest()})});
  let response=await postJamProposalResponse(request('invalid'),{...authority.jamOptions,fetchImpl});assert.equal(response.status,403);assert.equal(db.updates,0);
  response=await postJamProposalResponse(request(session.session.csrf),{...authority.jamOptions,fetchImpl});assert.equal(response.status,200,await response.clone().text());assert.equal(db.updates,1);
  await assert.rejects(authority.visibilityReader({env}),unavailable);await authority.visibilityReader({env:authority.hubOptions.env});await selector.close();
});

test('real process hosted, PG, local-mode and TLS downgrade settings reject a clean injected env',()=>{
  const moduleUrl=new URL('../lib/jams-staging-postgres-selector.mjs',import.meta.url).href;
  const script=`import {createStagingPostgresAuthoritySelector} from ${JSON.stringify(moduleUrl)};
    let builds=0,failed=false;try{createStagingPostgresAuthoritySelector({env:${JSON.stringify(config())},poolFactory:()=>{builds++;}});}catch(error){failed=error.status===503&&!error.message.includes('PRIVATE');}
    if(!failed||builds!==0)process.exit(1);`;
  for(const [key,value] of [['VERCEL','1'],['VERCEL_ENV','preview'],['AWS_EXECUTION_ENV','PRIVATE'],['NODE_ENV','production'],['PGPASSWORD','PRIVATE'],['PGOPTIONS','PRIVATE'],['ZERO_JAMS_LOCAL_AUTHORITY','postgres'],['NODE_TLS_REJECT_UNAUTHORIZED','0']]){
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin',[key]:value},encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,`Child failed for ${key}`);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
  }
});

test('all pinned settings latch closed on drift, even after restoration',async()=>{
  for(const key of Object.keys(config()).filter(key=>key.startsWith('ZERO_JAMS_STAGING_'))){
    const env=config(),{pool,db}=fakePool();const selector=createStagingPostgresAuthoritySelector({env,fetchImpl:noFetch,poolFactory:()=>pool});
    const authority=await selector.authorityForRequest(),before=db.connections,saved=env[key];delete env[key];
    await assert.rejects(authority.visibilityReader(),unavailable);env[key]=saved;await assert.rejects(selector.authorityForRequest(),unavailable);
    assert.equal(db.connections,before);await selector.close();
  }
});

test('epoch mismatch invalidates both existing service and Hub reader without fallback',async()=>{
  const env=config(),{pool,db}=fakePool();let calls=0;const selector=createStagingPostgresAuthoritySelector({env,now:()=>now,poolFactory:()=>pool,fetchImpl:async()=>{calls++;throw new Error('PRIVATE');}});
  const authority=await selector.authorityForRequest();db.epoch='b'.repeat(24);
  await assert.rejects(authority.visibilityReader(),unavailable);db.epoch=epoch;
  await assert.rejects(authority.service.propose({actor:{id:'11',login:'creator'},operationId:'staging-epoch-0001',manifest:hostedManifest()}),unavailable);
  await assert.rejects(selector.authorityForRequest(),unavailable);assert.equal(calls,0);assert.equal(db.updates,0);await selector.close();
});

test('new hosted or local-mode settings invalidate existing authorities permanently',async()=>{
  for(const [key,value] of [['NODE_ENV','production'],['VERCEL',''],['VERCEL_ENV','preview'],['PGOPTIONS','PRIVATE'],['ZERO_JAMS_LOCAL_AUTHORITY','postgres'],['NODE_TLS_REJECT_UNAUTHORIZED','0']]){
    const env=config(),{pool,db}=fakePool(),saved=env[key];const selector=createStagingPostgresAuthoritySelector({env,fetchImpl:noFetch,poolFactory:()=>pool});
    const authority=await selector.authorityForRequest();env[key]=value;await assert.rejects(authority.visibilityReader(),unavailable);
    if(saved===undefined)delete env[key];else env[key]=saved;
    await assert.rejects(selector.authorityForRequest(),unavailable);assert.equal(db.updates,0);await selector.close();
  }
});

test('idle pool errors are handled without losing the next valid authority read',async()=>{
  const {pool}=fakePool(),events=new EventEmitter();pool.on=events.on.bind(events);
  const selector=createStagingPostgresAuthoritySelector({env:config(),fetchImpl:noFetch,poolFactory:()=>pool});
  await selector.authorityForRequest();assert.equal(events.listenerCount('error'),1);
  events.emit('error',new Error(uri));await selector.authorityForRequest();await selector.close();
});

test('wrong identity, unsafe metadata or excess runtime/API privileges latch closed',async()=>{
  for(const [key,value] of [['database','other'],['role','postgres'],['elevated',true],['membership',true],['delegated_access',true],['relation_kind','v'],['row_security',false],['force_row_security',false],['table_owner','postgres'],['schema_owner','postgres'],['public_access',true],['unexpected_access',true],['api_roles_present',false],['api_access',true],['schema_create',true],['owner_member',true],['readable',false],['generation_write',false],['document_write',false],['epoch_write',true],['singleton_write',true],['extra_write',true]]){
    const env=config(),{pool,db}=fakePool(),saved=db.identity[key];db.identity[key]=value;
    const selector=createStagingPostgresAuthoritySelector({env,fetchImpl:noFetch,poolFactory:()=>pool});
    await assert.rejects(selector.authorityForRequest(),unavailable);db.identity[key]=saved;await assert.rejects(selector.authorityForRequest(),unavailable);
    assert.equal(db.updates,0);assert.ok(db.releases.includes(true));await selector.close();
  }
});

test('security metadata query covers transitive roles, RLS and schema/table/column ACLs',async()=>{
  const {pool,db}=fakePool(),selector=createStagingPostgresAuthoritySelector({env:config(),fetchImpl:noFetch,poolFactory:()=>pool});
  await selector.authorityForRequest();const sql=db.queries.find(value=>value.startsWith('SELECT pg_catalog.current_database()'));
  for(const fragment of ['relrowsecurity','relforcerowsecurity','pg_catalog.pg_has_role(r.oid,other.oid',"'MEMBER'",'n.nspacl','c.relacl','a.attacl','acl.grantee OPERATOR(pg_catalog.=) 0','pg_catalog.has_schema_privilege(a.oid','pg_catalog.has_table_privilege(a.oid','pg_catalog.has_any_column_privilege(a.oid',"'anon','authenticated','service_role'"])assert.ok(sql.includes(fragment));
  // Hostile search_path cannot substitute any relation, function, operator or
  // type used by this preflight; the mock does not prove PostgreSQL execution.
  assert.doesNotMatch(sql,/\b(?<!pg_catalog\.)(?:current_database|pg_get_userbyid|has_[a-z_]+|pg_has_role|aclexplode|acldefault|count)\(/);
  assert.doesNotMatch(sql,/(?:FROM|JOIN) (?:pg_roles|pg_class|pg_namespace|pg_attribute)\b/);
  assert.doesNotMatch(sql,/::(?:regclass|name)\b/);
  await selector.close();
});

test('driver failures are sanitized at selection, existing service and Hub boundaries',async()=>{
  const env=config(),{pool,db}=fakePool();const selector=createStagingPostgresAuthoritySelector({env,now:()=>now,fetchImpl:noFetch,poolFactory:()=>pool});
  const authority=await selector.authorityForRequest();db.error=new Error(uri+' '+rootCertificates[0]);
  await assert.rejects(selector.authorityForRequest(),unavailable);await assert.rejects(authority.visibilityReader(),unavailable);
  await assert.rejects(authority.service.propose({actor:{id:'11',login:'creator'},operationId:'staging-secret-0001',manifest:hostedManifest()}),unavailable);
  assert.equal(db.updates,0);await selector.close();
  const failed=createStagingPostgresAuthoritySelector({env,fetchImpl:noFetch,poolFactory:()=>{throw new Error(uri);}});
  await assert.rejects(failed.authorityForRequest(),unavailable);await failed.close();
});

test('sanitized unknown COMMIT still recovers the same operation exactly once',async()=>{
  const {pool,db}=fakePool();const selector=createStagingPostgresAuthoritySelector({env:config(),now:()=>now,fetchImpl:noFetch,poolFactory:()=>pool});
  const authority=await selector.authorityForRequest(),proposal={actor:{id:'11',login:'creator'},operationId:'staging-unknown-0001',manifest:hostedManifest()};
  db.loseCommit=true;await assert.rejects(authority.service.propose(proposal),unavailable);
  assert.equal(db.updates,1);assert.equal(Object.keys(db.document.events).length,1);assert.ok(db.releases.includes(true));
  const recovered=await authority.service.propose(proposal);assert.equal(recovered.eventId,Object.keys(db.document.events)[0]);assert.equal(db.updates,1);
  await selector.close();
});

test('late identity acquisition is destroyed once after bounded selection failure',async()=>{
  const {pool,db}=fakePool();let resolve;pool.connect=()=>new Promise(value=>{resolve=value;});
  const selector=createStagingPostgresAuthoritySelector({env:config(),fetchImpl:noFetch,poolFactory:()=>pool});
  await assert.rejects(selector.authorityForRequest(),unavailable);let releases=0,queries=0;
  resolve({release(destroy){assert.equal(destroy,true);releases++;},async query(){queries++;}});await new Promise(value=>setImmediate(value));
  assert.equal(releases,1);assert.equal(queries,0);await selector.close();assert.equal(db.ends,1);
});

test('absolute identity deadline rejects synchronous stalls before query, after query and after release',async()=>{
  const stall=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2020);
  for(const phase of ['connect','query','release']){
    const {pool,db}=fakePool(),connect=pool.connect.bind(pool);
    pool.connect=async()=>{
      if(phase==='connect')stall();const client=await connect(),query=client.query.bind(client),release=client.release.bind(client);
      client.query=async(...args)=>{if(phase==='query')stall();return query(...args);};
      client.release=destroy=>{release(destroy);if(phase==='release')stall();};return client;
    };
    const selector=createStagingPostgresAuthoritySelector({env:config(),fetchImpl:noFetch,poolFactory:()=>pool});
    await assert.rejects(selector.authorityForRequest(),unavailable);assert.equal(db.updates,0);
    assert.deepEqual(db.releases,phase==='release'?[false]:[true]);assert.equal(db.queries.length,phase==='connect'?0:1);await selector.close();
  }
});

test('synchronous pool setup beyond its deadline retires the pool without checking out a client',async()=>{
  const {pool,db}=fakePool();const selector=createStagingPostgresAuthoritySelector({env:config(),fetchImpl:noFetch,poolFactory:()=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2020);return pool;}});
  await assert.rejects(selector.authorityForRequest(),unavailable);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(db.connections,0);assert.equal(db.ends,1);await selector.close();assert.equal(db.ends,1);
});
