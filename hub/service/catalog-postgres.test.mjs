// Read-only discovery against a disposable restricted PostgreSQL login.
// Seed manifests are inert test data; no checker, candidate or JVM runs.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-fixture.mjs';
import {migrateDatabase} from './database.mjs';
import {createReadOnlyRuntime,readOnlyHubResponse} from '../../website/lib/hub-runtime.mjs';
import {createContributionRuntime,contributionHubResponse} from '../../website/lib/hub-contribution-runtime.mjs';
let fixture,pool,closed,enabled,env;
const origin='https://zero.codepet.ca';
const ids=Array.from({length:27},(_,i)=>'ui'+(i+1).toString(36));
before(async()=>{
  fixture=await startDisposablePostgres({port:15457});
  await migrateDatabase(fixture.pool,{roles:true});
  await fixture.pool.query("INSERT INTO hub_users(github_id,login) VALUES('101','student')");
  for(const id of ids) {
    await fixture.pool.query("INSERT INTO hub_libraries(id,owner_id) VALUES($1,'101')",[id]);
    for(const version of ['1.9.0','1.10.0']) {
      const submission=randomUUID();
      const manifest={libraryId:id,version,status:'automatically-checked',title:'Library '+id,description:version==='1.9.0'?'historicword':'Latest description',components:[{className:id===ids.at(-1)?'BeyondFirstPage':'Display',description:id===ids.at(-2)?'farword component':'Visible component'}]};
      await fixture.pool.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES($1,$2,'101',$3,'{}',$4,'published')",[submission,id,version,'a'.repeat(64)]);
      await fixture.pool.query('INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[id,version,submission,manifest]);
    }
  }
  const password=randomBytes(32).toString('hex');
  await fixture.pool.query(`CREATE ROLE zero_catalog_api LOGIN NOINHERIT PASSWORD '${password}'`);
  await fixture.pool.query('GRANT hub_api TO zero_catalog_api');
  const url=new URL(fixture.connectionString);url.username='zero_catalog_api';url.password=password;
  pool=new pg.Pool({connectionString:url.href,max:2,options:'-c role=hub_api -c statement_timeout=1500 -c search_path=public,pg_catalog'});
  closed=await createReadOnlyRuntime(pool,origin);
  enabled=await createContributionRuntime(pool,{origin,oauth:{clientId:'test',clientSecret:'test'}});
  env={ZERO_HUB_UPLOADS:'1',ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:url.href,ZERO_HUB_GITHUB_CLIENT_ID:'test',ZERO_HUB_GITHUB_CLIENT_SECRET:'test'};
});
after(async()=>{await pool?.end();await fixture?.stop();});
async function call(path,active=false) {
  const req=new Request(`${origin}/api/hub/${path}`,{headers:{Cookie:'zero_hub_session='+'a'.repeat(64)}});
  return active?contributionHubResponse(req,path.split('?')[0].split('/'),{env,handler:enabled}):readOnlyHubResponse(req,path.split('?')[0].split('/'),{handler:closed});
}
async function pages(history=false) {
  let cursor=null;const releases=[];let count=0;
  do {
    const query=new URLSearchParams();if(history)query.set('history','1');if(cursor)query.set('cursor',cursor);
    const response=await call('catalog'+(query.size?'?'+query:''));assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
    const page=await response.json();assert.ok(page.libraries.length<=20);releases.push(...page.libraries);cursor=page.nextCursor;count++;
    assert.ok(count<10);
  }while(cursor);
  return releases;
}
test('latest pages are complete, unique and numeric; immutable history remains separately paginated',async()=>{
  const latest=await pages();assert.equal(latest.length,27);assert.equal(new Set(latest.map(r=>r.libraryId)).size,27);assert.ok(latest.every(r=>r.version==='1.10.0'));
  assert.deepEqual(latest.map(r=>r.libraryId),[...ids].sort());
  const history=await pages(true);assert.equal(history.length,54);assert.equal(new Set(history.map(r=>`${r.libraryId}:${r.version}`)).size,54);assert.equal(history.filter(r=>r.version==='1.9.0').length,27);
});
test('search includes latest classes/title/description beyond first page and does not revive matching old releases',async()=>{
  for(const [q,id]of [['beyondfirstpage',ids.at(-1)],['farword',ids.at(-2)],['library '+ids.at(-1),ids.at(-1)]]) {
    const response=await call('catalog?q='+encodeURIComponent(q));assert.equal(response.status,200);const page=await response.json();assert.deepEqual(page.libraries.map(r=>r.libraryId),[id]);assert.equal(page.nextCursor,null);
  }
  assert.equal((await(await call('catalog?q=historicword')).json()).libraries.length,0);
  const history=await(await call('catalog?history=1&q=historicword')).json();assert.equal(history.libraries.length,20);assert.ok(history.nextCursor);
});
test('closed and enabled bridges preserve exact old lookup, numeric default and authoring closure',async()=>{
  for(const active of [false,true]) {
    const response=await call('libraries/ui1?version=1.9.0',active);assert.equal(response.status,200);assert.equal((await response.json()).version,'1.9.0');
    assert.equal((await(await call('libraries/ui1',active)).json()).version,'1.10.0');
    assert.equal((await call('libraries/ui1?version=9.9.9',active)).status,404);
  }
  const response=await call('auth/start');assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
  assert.equal((await(await call('session')).json()).user,null);
});
test('all malformed discovery queries stop before service SQL in closed and enabled bridges',async()=>{
  for(const active of [false,true])for(const query of ['q=a&q=b','q=%00','secret=x','history=2','cursor=bad','q='+ 'x'.repeat(201)]) {
    const req=new Request(`${origin}/api/hub/catalog?${query}`);const options={handler:()=>assert.fail('Invalid query reached service')};
    const response=active?await contributionHubResponse(req,['catalog'],{...options,env}):await readOnlyHubResponse(req,['catalog'],options);assert.equal(response.status,400);
  }
});

test('publishing a newer version at the latest-page boundary cannot duplicate that library on the next page',async()=>{
  const first=await(await call('catalog')).json();const boundary=first.libraries.at(-1).libraryId;
  const submission=randomUUID(),version='2.0.0';
  const previous=first.libraries.at(-1);
  await fixture.pool.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES($1,$2,'101',$3,'{}',$4,'published')",[submission,boundary,version,'a'.repeat(64)]);
  await fixture.pool.query('INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[boundary,version,submission,{...previous,version}]);
  const next=await(await call('catalog?cursor='+first.nextCursor)).json();
  assert.equal(next.libraries.length,7);assert.ok(next.libraries.every(release=>release.libraryId!==boundary));
  assert.equal(new Set([...first.libraries,...next.libraries].map(r=>r.libraryId)).size,27);
});
