import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createLocalPostgresAuthoritySelector} from '../lib/jams-local-postgres-selector.mjs';
import {hostedManifest} from '../../jams/test/fixtures.mjs';

const epoch='a'.repeat(24),now=Date.parse('2030-01-02T12:00:00Z');
const config=()=>({NODE_ENV:'development',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_LOCAL_AUTHORITY:'postgres',ZERO_JAMS_LOCAL_PG_SOCKET:'/tmp/zero-jams-socket',ZERO_JAMS_LOCAL_PG_PORT:'5432',ZERO_JAMS_LOCAL_PG_DATABASE:'zerojams',ZERO_JAMS_LOCAL_PG_USER:'zerojams',ZERO_JAMS_LOCAL_PG_EPOCH:epoch});
const unavailable=error=>error?.status===503&&!error.message.includes('PRIVATE');
const visibilityUnavailable=error=>unavailable(error)||error?.message==='Project visibility is unavailable.';
function fakePool(){
  const db={epoch,generation:'0',document:{events:{},settlements:{schema:1,operations:{}}},updates:0,ends:0,connections:0};
  const pool={async end(){db.ends++;},async connect(){db.connections++;let staged;
    return {release(){},async query(sql,params){
      if(sql.startsWith('SELECT'))return {rows:[{epoch:db.epoch,generation:db.generation,document:structuredClone(db.document)}]};
      if(sql.startsWith('UPDATE')){staged={generation:params[0],document:JSON.parse(params[1])};return {rowCount:1};}
      if(sql==='COMMIT'&&staged){db.generation=staged.generation;db.document=staged.document;db.updates++;}
      return {rows:[],rowCount:1};
    }};
  }};
  return {db,pool};
}

test('selector uses one bounded socket pool and per-request GitHub tokens',async()=>{
  const env=config(),{db,pool}=fakePool(),tokens=[];let builds=0,poolOptions;
  const fetchImpl=async(url,options)=>{
    tokens.push(options.headers.Authorization);const parts=new URL(url).pathname.split('/'),login=parts[2];
    const id=login==='student1'?33:34;
    return Response.json({id:1000+id,private:false,visibility:'public',owner:{id,type:'User'},full_name:`${login}/project`});
  };
  const selector=createLocalPostgresAuthoritySelector({env,now:()=>now,fetchImpl,poolFactory:async options=>{builds++;poolOptions=options;return pool;}});
  const first=await selector.authorityForRequest({sourceToken:'synthetic-token-111'}),second=await selector.authorityForRequest({sourceToken:'synthetic-token-222'});
  assert.equal(builds,1);assert.equal(poolOptions.host,env.ZERO_JAMS_LOCAL_PG_SOCKET);assert.equal(poolOptions.max,4);assert.equal(poolOptions.ssl,false);assert.equal(typeof poolOptions.password,'function');assert.equal(poolOptions.password(),'');assert.equal(poolOptions.options,'-c search_path=public');assert.equal(poolOptions.connectionTimeoutMillis,2000);
  const proposal=await first.service.propose({actor:{id:'11',login:'creator'},operationId:'selector-propose-0001',manifest:hostedManifest()});
  await first.service.mutate({id:proposal.eventId,actor:{id:'4050555',login:'armorup'},operationId:'selector-approve-0001',action:'approve',revision:proposal.revision});
  for(const [authority,id,login] of [[first,'33','student1'],[second,'34','student2']]){
    await authority.service.mutate({id:proposal.eventId,actor:{id,login},operationId:`selector-join-${id}`,action:'join',revision:proposal.revision,repositoryUrl:`https://github.com/${login}/project`});
  }
  assert.deepEqual(tokens,['Bearer synthetic-token-111','Bearer synthetic-token-222']);
  const visible=await first.visibilityReader();assert.equal(visible.isHeld('1033'),true);assert.equal(visible.isHeld('1034'),true);
  env.ZERO_JAMS_ENABLED='0';assert.equal((await second.visibilityReader()).isHeld('1033'),true);
  await assert.rejects(first.service.propose({actor:{id:'11',login:'creator'},operationId:'selector-disabled-0001',manifest:hostedManifest()}),unavailable);
  assert.equal(db.updates,4);await selector.close();assert.equal(db.ends,1);
});

test('missing or nonlocal configuration is rejected before a pool or fetch is created',()=>{
  let pools=0,fetches=0;const dependencies={poolFactory:()=>{pools++;},fetchImpl:()=>{fetches++;}};
  for(const mutate of [env=>delete env.ZERO_JAMS_LOCAL_PG_EPOCH,env=>env.ZERO_JAMS_LOCAL_PG_SOCKET='https://example.com',env=>env.ZERO_JAMS_LOCAL_PG_PORT='5432?x',env=>env.ZERO_JAMS_LOCAL_PG_USER='bad user',env=>env.ZERO_JAMS_LOCAL_PG_DATABASE='a/b',env=>env.NODE_ENV='production',env=>env.VERCEL_ENV='preview',env=>env.VERCEL='',env=>env.AWS_LAMBDA_FUNCTION_NAME='x',env=>env.K_SERVICE='x',env=>env.PGPASSWORD='PRIVATE',env=>env.PGOPTIONS='PRIVATE']){
    const env=config();mutate(env);assert.throws(()=>createLocalPostgresAuthoritySelector({env,...dependencies}),unavailable);
  }
  assert.equal(pools,0);assert.equal(fetches,0);
});

test('real process PG settings reject a clean injected environment without exposing values',()=>{
  const moduleUrl=new URL('../lib/jams-local-postgres-selector.mjs',import.meta.url).href;
  const script=`import {createLocalPostgresAuthoritySelector} from ${JSON.stringify(moduleUrl)};
    const env=${JSON.stringify(config())};let builds=0,failed=false;
    try{createLocalPostgresAuthoritySelector({env,poolFactory:()=>{builds++;}});}catch(error){failed=error.status===503&&!error.message.includes('synthetic');}
    if(!failed||builds!==0)process.exit(1);`;
  for(const key of ['PGPASSWORD','PGOPTIONS']){
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin',[key]:'synthetic-private-value'},encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,`Child failed for ${key}`);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
  }
});

test('real process hosted markers reject a clean injected environment',()=>{
  const moduleUrl=new URL('../lib/jams-local-postgres-selector.mjs',import.meta.url).href;
  const script=`import {createLocalPostgresAuthoritySelector} from ${JSON.stringify(moduleUrl)};
    const env=${JSON.stringify(config())};let builds=0,failed=false;
    try{createLocalPostgresAuthoritySelector({env,poolFactory:()=>{builds++;}});}catch(error){failed=error.status===503;}
    if(!failed||builds!==0)process.exit(1);`;
  for(const [key,value] of [['VERCEL','synthetic-hosted'],['VERCEL_ENV','synthetic-hosted'],['AWS_LAMBDA_FUNCTION_NAME','synthetic-hosted'],['NODE_ENV','production']]){
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin',[key]:value},encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,`Child failed for ${key}`);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
  }
});

test('new real process PG settings permanently close an existing selector',()=>{
  const moduleUrl=new URL('../lib/jams-local-postgres-selector.mjs',import.meta.url).href;
  const script=`import {createLocalPostgresAuthoritySelector} from ${JSON.stringify(moduleUrl)};
    const env=${JSON.stringify(config())};let builds=0;
    const selector=createLocalPostgresAuthoritySelector({env,poolFactory:()=>{builds++;}});
    process.env.PGOPTIONS='synthetic-private-value';
    let failures=0;try{await selector.authorityForRequest();}catch(error){if(error.status===503&&!error.message.includes('synthetic'))failures++;}
    delete process.env.PGOPTIONS;
    try{await selector.authorityForRequest();}catch(error){if(error.status===503)failures++;}
    if(failures!==2||builds!==0)process.exit(1);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin'},encoding:'utf8',timeout:5000});
  assert.equal(child.status,0);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
});

test('a new real process hosted marker permanently closes an existing selector',()=>{
  const moduleUrl=new URL('../lib/jams-local-postgres-selector.mjs',import.meta.url).href;
  const script=`import {createLocalPostgresAuthoritySelector} from ${JSON.stringify(moduleUrl)};
    const env=${JSON.stringify(config())};let builds=0;
    const selector=createLocalPostgresAuthoritySelector({env,poolFactory:()=>{builds++;}});
    process.env.VERCEL='synthetic-hosted';let failures=0;
    try{await selector.authorityForRequest();}catch(error){if(error.status===503)failures++;}
    delete process.env.VERCEL;
    try{await selector.authorityForRequest();}catch(error){if(error.status===503)failures++;}
    if(failures!==2||builds!==0)process.exit(1);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin'},encoding:'utf8',timeout:5000});
  assert.equal(child.status,0);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
});

test('database epoch, pinned settings and hosted-mode changes fail closed without fallback',async()=>{
  const env=config(),{db,pool}=fakePool();let fetches=0;
  const selector=createLocalPostgresAuthoritySelector({env,now:()=>now,fetchImpl:async()=>{fetches++;throw Error('PRIVATE fallback');},poolFactory:async()=>pool});
  const authority=await selector.authorityForRequest();
  db.epoch='b'.repeat(24);
  await assert.rejects(authority.visibilityReader(),visibilityUnavailable);
  await assert.rejects(authority.service.propose({actor:{id:'11',login:'creator'},operationId:'selector-epoch-0001',manifest:hostedManifest()}),unavailable);
  await assert.rejects(selector.authorityForRequest(),unavailable);assert.equal(db.updates,0);
  db.epoch=epoch;await assert.rejects(selector.authorityForRequest(),unavailable);
  assert.equal(fetches,0);await selector.close();assert.equal(db.ends,1);
  const secondConfig=config(),secondPool=fakePool();
  const second=createLocalPostgresAuthoritySelector({env:secondConfig,now:()=>now,poolFactory:async()=>secondPool.pool});
  const secondAuthority=await second.authorityForRequest();secondConfig.ZERO_JAMS_LOCAL_PG_DATABASE='other';
  await assert.rejects(secondAuthority.visibilityReader(),visibilityUnavailable);
  secondConfig.ZERO_JAMS_LOCAL_PG_DATABASE='zerojams';await assert.rejects(second.authorityForRequest(),unavailable);
  await second.close();
  const thirdConfig=config(),thirdPool=fakePool();
  const third=createLocalPostgresAuthoritySelector({env:thirdConfig,now:()=>now,poolFactory:async()=>thirdPool.pool});
  const thirdAuthority=await third.authorityForRequest();thirdConfig.VERCEL='1';
  await assert.rejects(thirdAuthority.visibilityReader(),visibilityUnavailable);delete thirdConfig.VERCEL;
  await assert.rejects(third.authorityForRequest(),unavailable);await third.close();
});

test('pool acquisition failures are sanitized and never fall back',async()=>{
  let builds=0,fetches=0;
  const selector=createLocalPostgresAuthoritySelector({env:config(),poolFactory:async()=>{builds++;throw Error('PRIVATE connection');},fetchImpl:async()=>{fetches++;}});
  await assert.rejects(selector.authorityForRequest(),unavailable);await assert.rejects(selector.authorityForRequest(),unavailable);
  assert.equal(builds,1);assert.equal(fetches,0);await selector.close();
});

test('a hosted-mode transition during pool construction never exposes or connects the pool',async()=>{
  const env=config(),{db,pool}=fakePool();let finish,started;
  const entered=new Promise(resolve=>{started=resolve;});
  const selector=createLocalPostgresAuthoritySelector({env,poolFactory:()=>{started();return new Promise(resolve=>{finish=resolve;});}});
  const pending=selector.authorityForRequest();await entered;env.VERCEL='1';finish(pool);
  await assert.rejects(pending,unavailable);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(db.connections,0);assert.equal(db.ends,1);await selector.close();assert.equal(db.ends,1);
});
