import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultJamAuthorityManager} from '../lib/jams-default-authority.mjs';

const config=()=>({NODE_ENV:'development',ZERO_JAMS_LOCAL_AUTHORITY:'postgres',ZERO_JAMS_LOCAL_PG_SOCKET:'/tmp/zero-test-socket',ZERO_JAMS_LOCAL_PG_PORT:'55439',ZERO_JAMS_LOCAL_PG_DATABASE:'zerojams',ZERO_JAMS_LOCAL_PG_USER:'zerojams',ZERO_JAMS_LOCAL_PG_EPOCH:'a'.repeat(24)});
const reviewed=()=>({projectRef:'abcdefghijklmnopqrst',host:'aws-0-us-east-1.pooler.supabase.com',port:'5432',database:'postgres',role:'zerojams_staging_runtime',epoch:'a'.repeat(24)});
const staging=()=>{const id=reviewed();return {NODE_ENV:'development',ZERO_JAMS_STAGING_AUTHORITY:'supabase-postgres',ZERO_JAMS_STAGING_PROJECT_REF:id.projectRef,ZERO_JAMS_STAGING_PG_HOST:id.host,ZERO_JAMS_STAGING_PG_PORT:id.port,ZERO_JAMS_STAGING_PG_DATABASE:id.database,ZERO_JAMS_STAGING_PG_ROLE:id.role,ZERO_JAMS_STAGING_PG_EPOCH:id.epoch,ZERO_JAMS_STAGING_PG_CA_PEM:'PRIVATE synthetic CA',ZERO_JAMS_STAGING_PG_URI:'PRIVATE synthetic URI'};};
const unavailable=error=>error.status===503&&!error.message.includes('PRIVATE');
test('one token-free selector creates fresh request authorities for both default lanes',async()=>{
  const env=config(),requests=[],builds=[];let closed=0;
  const manager=createDefaultJamAuthorityManager({selectorFactory:async options=>{builds.push(options);return {async authorityForRequest(input){requests.push(input);return {service:{requestToken:input.sourceToken},visibilityReader:async()=>({revision:'a'.repeat(40)})};},async close(){closed++;}};}});
  const [first,second,anonymous]=await Promise.all([manager.authorityForRequest({env,sourceToken:'visitor-one'}),manager.authorityForRequest({env,sourceToken:'visitor-two'}),manager.authorityForRequest({env})]);
  assert.equal(builds.length,1);assert.deepEqual(Object.keys(builds[0]).sort(),['env','fetchImpl','now']);
  assert.deepEqual(requests,[{sourceToken:'visitor-one'},{sourceToken:'visitor-two'},{}]);
  assert.equal(first.service.requestToken,'visitor-one');assert.equal(second.service.requestToken,'visitor-two');assert.equal(anonymous.service.requestToken,undefined);assert.notEqual(first,second);
  env.ZERO_JAMS_ENABLED='0';assert.ok(await manager.authorityForRequest({env}));
  await manager.close();assert.equal(closed,1);await assert.rejects(manager.authorityForRequest({env:config()}),unavailable);
});

test('selection and destination changes latch closed rather than changing authority',async()=>{
  for(const change of [env=>delete env.ZERO_JAMS_LOCAL_AUTHORITY,env=>env.ZERO_JAMS_LOCAL_PG_EPOCH='b'.repeat(24),env=>env.ZERO_JAMS_LOCAL_PG_SOCKET='/tmp/other',env=>env.VERCEL_ENV='preview']){
    const env=config();let builds=0;
    const manager=createDefaultJamAuthorityManager({selectorFactory:async()=>{builds++;return {authorityForRequest:async()=>({service:{},visibilityReader:async()=>{}})};}});
    await manager.authorityForRequest({env});change(env);await assert.rejects(manager.authorityForRequest({env}),unavailable);
    Object.assign(env,config());delete env.VERCEL_ENV;await assert.rejects(manager.authorityForRequest({env}),unavailable);assert.equal(builds,1);assert.equal(manager.requested(env),true);
  }
  const env={NODE_ENV:'development'};let builds=0;
  const manager=createDefaultJamAuthorityManager({selectorFactory:()=>{builds++;}});assert.equal(await manager.authorityForRequest({env}),null);
  Object.assign(env,config());await assert.rejects(manager.authorityForRequest({env}),unavailable);assert.equal(builds,0);
});

test('nonlocal or partial local settings never construct a selector or select Git',async()=>{
  let builds=0;
  for(const env of [{...config(),NODE_ENV:'production'},{...config(),VERCEL_ENV:'preview'},{...config(),VERCEL:'1'},{NODE_ENV:'development',ZERO_JAMS_LOCAL_PG_SOCKET:'/tmp/partial'},{...config(),ZERO_JAMS_LOCAL_AUTHORITY:'unknown'}]){
    const manager=createDefaultJamAuthorityManager({selectorFactory:()=>{builds++;}});
    assert.equal(manager.requested(env),true);await assert.rejects(manager.authorityForRequest({env}),unavailable);
  }
  assert.equal(builds,0);
});

test('a manager cannot split selected authority across env objects or bypass a latched failure',async()=>{
  for(const alternate of [()=>config(),()=>({...config(),ZERO_JAMS_LOCAL_PG_DATABASE:'other',ZERO_JAMS_LOCAL_PG_EPOCH:'b'.repeat(24)}),()=>({NODE_ENV:'development'})]){
    const env=config();let builds=0;
    const manager=createDefaultJamAuthorityManager({selectorFactory:async()=>{builds++;return {authorityForRequest:async()=>({service:{},visibilityReader:async()=>{}})};}});
    await manager.authorityForRequest({env});await assert.rejects(manager.authorityForRequest({env:alternate()}),unavailable);
    await assert.rejects(manager.authorityForRequest({env}),unavailable);assert.equal(builds,1);
  }
  const manager=createDefaultJamAuthorityManager({selectorFactory:()=>assert.fail('Git-only manager constructed a selector')});
  for(let i=0;i<100;i++)assert.equal(await manager.authorityForRequest({env:{NODE_ENV:'development'}}),null);
  await assert.rejects(manager.authorityForRequest({env:config()}),unavailable);
  await assert.rejects(manager.authorityForRequest({env:{NODE_ENV:'development'}}),unavailable);
});

test('enable checks pin selected mode before awaited authentication and preserve null presence',async()=>{
  const env=config();let builds=0;
  const manager=createDefaultJamAuthorityManager({selectorFactory:()=>{builds++;}});
  assert.equal(manager.requested(env),true);
  for(const key of Object.keys(env))if(key.startsWith('ZERO_JAMS_LOCAL_'))delete env[key];
  await assert.rejects(manager.authorityForRequest({env}),unavailable);assert.equal(builds,0);assert.equal(manager.requested(env),true);
  const missing={NODE_ENV:'development'},git=createDefaultJamAuthorityManager({selectorFactory:()=>assert.fail('invalid mode constructed a selector')});
  assert.equal(git.requested(missing),false);assert.equal(await git.authorityForRequest({env:missing}),null);
  missing.ZERO_JAMS_LOCAL_AUTHORITY=null;
  assert.equal(git.requested(missing),true);await assert.rejects(git.authorityForRequest({env:missing}),unavailable);
  delete missing.ZERO_JAMS_LOCAL_AUTHORITY;await assert.rejects(git.authorityForRequest({env:missing}),unavailable);
});

test('selected authority failure never returns the absent-selection sentinel',async()=>{
  const env=config();let builds=0,calls=0;
  const manager=createDefaultJamAuthorityManager({selectorFactory:async()=>{builds++;return {authorityForRequest:async()=>{calls++;throw Error('PRIVATE outage');}};}});
  for(let i=0;i<2;i++)await assert.rejects(manager.authorityForRequest({env}),unavailable);
  assert.equal(builds,1);assert.equal(calls,2);
});

test('staging needs independently reviewed identity and no environment self-attestation can approve it',async()=>{
  let builds=0;const dependencies={selectorFactory:()=>assert.fail('local fallback'),stagingSelectorFactory:()=>{builds++;}};
  for(const identity of [undefined,{...reviewed(),projectRef:'z'.repeat(20)},{...reviewed(),epoch:'b'.repeat(24)}]){
    const env=staging(),manager=createDefaultJamAuthorityManager({...dependencies,reviewedStagingIdentity:identity});
    assert.equal(manager.requested(env),true);await assert.rejects(manager.authorityForRequest({env}),unavailable);
  }
  const env=staging(),unapproved=createDefaultJamAuthorityManager(dependencies);assert.equal(unapproved.requested(env),true);
  await assert.rejects(unapproved.authorityForRequest({env}),unavailable);assert.equal(builds,0);
  const selfAttested={...staging(),ZERO_JAMS_STAGING_REVIEWED:'1'},selfApproved=createDefaultJamAuthorityManager(dependencies);
  assert.equal(selfApproved.requested(selfAttested),true);await assert.rejects(selfApproved.authorityForRequest({env:selfAttested}),unavailable);assert.equal(builds,0);
  for(const identity of [null,{}, {...reviewed(),uri:'PRIVATE'},{...reviewed(),port:'6543'}])assert.throws(()=>createDefaultJamAuthorityManager({...dependencies,reviewedStagingIdentity:identity}),unavailable);
});

test('reviewed staging uses one selector with fresh visitor tokens and no secret fingerprint serialization',async()=>{
  const env=staging(),requests=[],identity=reviewed();let builds=0,closed=0;
  const manager=createDefaultJamAuthorityManager({reviewedStagingIdentity:identity,selectorFactory:()=>assert.fail('local fallback'),stagingSelectorFactory:async options=>{
    builds++;assert.equal(options.env,env);assert.equal(options.sourceToken,undefined);
    return {authorityForRequest:async options=>{requests.push(options);return {service:{token:options.sourceToken},visibilityReader:async()=>({})};},close:async()=>{closed++;}};
  }});
  // The trusted gate captures its reviewed values; caller mutation cannot
  // approve a new destination or invalidate an already captured approval.
  identity.projectRef='z'.repeat(20);
  const stringify=JSON.stringify;JSON.stringify=()=>assert.fail('manager serialized a private config fingerprint');
  let first,second;
  try{assert.equal(manager.requested(env),true);[first,second]=await Promise.all([manager.authorityForRequest({env,sourceToken:'visitor-one'}),manager.authorityForRequest({env,sourceToken:'visitor-two'})]);}
  finally{JSON.stringify=stringify;}
  assert.equal(builds,1);assert.deepEqual(requests,[{sourceToken:'visitor-one'},{sourceToken:'visitor-two'}]);assert.equal(first.service.token,'visitor-one');assert.equal(second.service.token,'visitor-two');
  assert.doesNotMatch(JSON.stringify(manager),/PRIVATE/);await manager.close();assert.equal(closed,1);
});

test('all modes are exclusive and pinned before auth, including secret changes and empty Git envs',async()=>{
  const authority={service:{},visibilityReader:async()=>({})};
  for(const mutate of [env=>env.ZERO_JAMS_LOCAL_AUTHORITY='postgres',env=>delete env.ZERO_JAMS_STAGING_PG_URI,env=>env.ZERO_JAMS_STAGING_PG_CA_PEM='changed PRIVATE',env=>env.ZERO_JAMS_STAGING_PG_URI='changed PRIVATE',env=>env.ZERO_JAMS_STAGING_PG_EPOCH='b'.repeat(24),env=>env.VERCEL_ENV='preview',env=>env.NODE_ENV='production']){
    const env=staging();let builds=0;const manager=createDefaultJamAuthorityManager({reviewedStagingIdentity:reviewed(),selectorFactory:()=>assert.fail('local fallback'),stagingSelectorFactory:async()=>{builds++;return {authorityForRequest:async()=>authority};}});
    assert.equal(manager.requested(env),true);mutate(env);await assert.rejects(manager.authorityForRequest({env}),unavailable);
    for(const key of Object.keys(env))delete env[key];Object.assign(env,staging());await assert.rejects(manager.authorityForRequest({env}),unavailable);assert.equal(builds,0);
  }
  for(const first of [config(),staging(),{NODE_ENV:'development'}])for(const alternate of [config(),staging(),{NODE_ENV:'development'}]){
    if(Object.keys(first).length===1&&Object.keys(alternate).length===1)continue;
    const manager=createDefaultJamAuthorityManager({reviewedStagingIdentity:reviewed(),selectorFactory:async()=>({authorityForRequest:async()=>authority}),stagingSelectorFactory:async()=>({authorityForRequest:async()=>authority})});
    await manager.authorityForRequest({env:first});await assert.rejects(manager.authorityForRequest({env:alternate}),unavailable);await assert.rejects(manager.authorityForRequest({env:first}),unavailable);
  }
});

test('partial/mixed/unknown staging config fails before either factory',async()=>{
  let builds=0;const factory=()=>{builds++;};
  const cases=[{...config(),...staging()},{NODE_ENV:'development',ZERO_JAMS_STAGING_PG_URI:'PRIVATE'},{...staging(),ZERO_JAMS_STAGING_AUTHORITY:null},{...staging(),ZERO_JAMS_STAGING_FUTURE:'PRIVATE'},...Object.keys(staging()).filter(key=>key.startsWith('ZERO_JAMS_STAGING_')).map(key=>{const env=staging();delete env[key];return env;})];
  for(const env of cases){const manager=createDefaultJamAuthorityManager({reviewedStagingIdentity:reviewed(),selectorFactory:factory,stagingSelectorFactory:factory});assert.equal(manager.requested(env),true);await assert.rejects(manager.authorityForRequest({env}),unavailable);}
  assert.equal(builds,0);
});

test('staging Hub adapter retains sanitized paired options and rejects caller env overrides and later secret drift',async()=>{
  const env=staging(),facade=Object.freeze({NODE_ENV:'development'}),seen=[],signal=new AbortController().signal;
  const manager=createDefaultJamAuthorityManager({reviewedStagingIdentity:reviewed(),stagingSelectorFactory:async()=>({authorityForRequest:async()=>({service:{},visibilityReader:async options=>{seen.push(options);return {held:true};},jamOptions:{env:facade},hubOptions:{env:facade}})})});
  const authority=await manager.authorityForRequest({env});assert.equal(authority.jamOptions.env,facade);assert.equal(authority.hubOptions.env,facade);
  assert.equal(authority.visibilityReader,authority.jamOptions.visibilityReader);assert.equal(authority.visibilityReader,authority.hubOptions.visibilityReader);
  await authority.visibilityReader({env,signal});await authority.visibilityReader({env:facade});assert.deepEqual(seen,[{signal},{signal:undefined}]);
  await assert.rejects(authority.visibilityReader({env:{...env}}),unavailable);assert.equal(seen.length,2);
  const previous=env.ZERO_JAMS_STAGING_PG_URI;env.ZERO_JAMS_STAGING_PG_URI='PRIVATE changed';await assert.rejects(authority.visibilityReader(),unavailable);
  env.ZERO_JAMS_STAGING_PG_URI=previous;await assert.rejects(manager.authorityForRequest({env}),unavailable);assert.equal(seen.length,2);await manager.close();
});

test('production selection is exclusive, process-bound, and fails closed on drift',async()=>{
  const {spawnSync}=await import('node:child_process');
  const moduleUrl=new URL('../lib/jams-default-authority.mjs',import.meta.url).href;
  const script=`import assert from 'node:assert/strict';
    import {createDefaultJamAuthorityManager} from ${JSON.stringify(moduleUrl)};
    const env=process.env;
    const fields=['AUTHORITY','PROJECT_REF','PG_HOST','PG_PORT','PG_DATABASE','PG_ROLE','PG_EPOCH','PG_CA_PEM','PG_URI','CREATOR_OID','ADMIN_OID'];
    for(const field of fields)env['ZERO_JAMS_PRODUCTION_'+field]='synthetic';
    env.ZERO_JAMS_PRODUCTION_AUTHORITY='neon-postgres';
    let builds=0;const manager=createDefaultJamAuthorityManager({productionSelectorFactory:async()=>{builds++;return {authorityForRequest:async()=>({service:{},visibilityReader:async()=>({})})};}});
    assert.equal(manager.requested(env),true);await manager.authorityForRequest({env});assert.equal(builds,1);
    env.ZERO_JAMS_PRODUCTION_PG_URI='changed';await assert.rejects(manager.authorityForRequest({env}),e=>e.status===503);
    env.ZERO_JAMS_PRODUCTION_PG_URI='synthetic';await assert.rejects(manager.authorityForRequest({env}),e=>e.status===503);
    const mixed=createDefaultJamAuthorityManager({productionSelectorFactory:()=>assert.fail('mixed mode')});env.ZERO_JAMS_LOCAL_AUTHORITY='postgres';
    assert.equal(mixed.requested(env),true);await assert.rejects(mixed.authorityForRequest({env}),e=>e.status===503);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin',NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production'},encoding:'utf8',timeout:5000});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');
  for(const env of [{NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_PRODUCTION_AUTHORITY:'neon-postgres'}, {NODE_ENV:'development',ZERO_JAMS_PRODUCTION_AUTHORITY:'neon-postgres'}]){
    const manager=createDefaultJamAuthorityManager({productionSelectorFactory:()=>assert.fail('untrusted env')});
    assert.equal(manager.requested(env),true);await assert.rejects(manager.authorityForRequest({env}),unavailable);
  }
});
