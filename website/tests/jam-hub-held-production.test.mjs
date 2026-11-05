import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {rootCertificates} from 'node:tls';

test('production Hub fails closed without authority even after the pilot flag is removed',()=>{
  const visibility=new URL('../lib/jam-hub-visibility.mjs',import.meta.url).href;
  const manager=new URL('../lib/jams-default-authority.mjs',import.meta.url).href;
  const route=new URL('../lib/sharing-catalog.mjs',import.meta.url).href;
  const host='ep-frosty-fog-be7fiw2h.c-9.us-east-2.aws.neon.tech',role='zerojams_production_runtime';
  const config={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_ENABLED:'1',ZERO_JAMS_PRODUCTION_AUTHORITY:'neon-postgres',ZERO_JAMS_PRODUCTION_PROJECT_REF:'autumn-queen-85821497',ZERO_JAMS_PRODUCTION_PG_HOST:host,ZERO_JAMS_PRODUCTION_PG_PORT:'5432',ZERO_JAMS_PRODUCTION_PG_DATABASE:'neondb',ZERO_JAMS_PRODUCTION_PG_ROLE:role,ZERO_JAMS_PRODUCTION_PG_EPOCH:'a'.repeat(24),ZERO_JAMS_PRODUCTION_PG_CA_PEM:rootCertificates[0],ZERO_JAMS_PRODUCTION_PG_URI:`postgresql://${role}:synthetic-password-123456@${host}:5432/neondb`,PGOPTIONS:'-c synthetic=1',ZERO_JAMS_PRODUCTION_CREATOR_OID:'16393',ZERO_JAMS_PRODUCTION_ADMIN_OID:'10'};
  const script=`import assert from 'node:assert/strict';
    import {readJamHubVisibility,isJamHubVisibilityEnforced} from ${JSON.stringify(visibility)};
    import {localJamAuthorityRequested} from ${JSON.stringify(manager)};
    import {catalogResponse} from ${JSON.stringify(route)};
    Object.assign(process.env,${JSON.stringify(config)});
    globalThis.fetch=async()=>assert.fail('unexpected network');
    assert.equal(localJamAuthorityRequested(process.env),true);
    assert.equal(isJamHubVisibilityEnforced({env:process.env}),true);await assert.rejects(readJamHubVisibility());
    const catalog={schema:1,revision:'a'.repeat(40),releases:[]};
    const request=()=>new Request('https://zero.codepet.ca/api/sharing/catalog');
    const response=await catalogResponse(request(),{reader:async()=>catalog});assert.equal(response.status,503);
    process.env.ZERO_JAMS_PILOT_ENABLED='1';assert.equal(isJamHubVisibilityEnforced({env:process.env}),true);
    delete process.env.ZERO_JAMS_PILOT_ENABLED;assert.equal(isJamHubVisibilityEnforced({env:process.env}),true);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH||'/usr/bin:/bin'},encoding:'utf8',timeout:5000});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');
});
