// Inert administrator-seeded releases only. No uploaded source or JVM executes.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {startDisposablePostgres} from './postgres-fixture.mjs';
import {migrateDatabase} from './database.mjs';
import {createRuntimePool,verifyRole} from './runtime.mjs';
import {recordReleaseEvent,EXACT_ARTIFACT_SQL,WITHDRAWN_MESSAGE} from './release-availability.mjs';
import {createHub} from './hub.mjs';
import {readOnlyHubResponse} from '../../website/lib/hub-runtime.mjs';
import {contributionHubResponse} from '../../website/lib/hub-contribution-runtime.mjs';
import {proxyHub} from '../../website/lib/hub-proxy.mjs';

let fixture,operator,api,checker,publisher,operatorURL,hub,reads=0;
const origin='https://zero.example',manifests=new Map(),objects=new Map(),pools=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const event=(libraryId,version,action)=>recordReleaseEvent(operator,{libraryId,version,action,reason:'Private reason never published'},{enabled:true});
const coordinate=(id,version)=>`${id}:${version}`;
before(async()=>{
  fixture=await startDisposablePostgres({port:15469,major:Number(process.env.ZERO_HUB_RELEASE_PG_MAJOR??17)});
  await fixture.pool.query(await readFile(new URL('../sql/000-roles.sql',import.meta.url),'utf8'));
  await migrateDatabase(fixture.pool,{roles:true});
  await fixture.pool.query("INSERT INTO hub_users(github_id,login) VALUES('101','student')");
  for(let i=1;i<=27;i++) {
    const id='ui'+i.toString(36);await fixture.pool.query("INSERT INTO hub_libraries(id,owner_id) VALUES($1,'101')",[id]);
    for(const version of ['1.9.0','1.10.0']) {
      const artifacts={};
      for(const [kind,suffix]of [['jar','.jar'],['sources','-sources.jar'],['pom','.pom'],['preview','.png']]) {
        const bytes=kind==='preview'?Buffer.from([137,80,78,71,13,10,26,10,...Buffer.from(`${id}:${version}`)]):Buffer.from(`inert ${kind} ${id}:${version}`);
        const digest=hash(bytes);objects.set(digest,bytes);
        const item={path:kind==='preview'?`/api/hub/previews/${id}/${version}.png`:`/api/hub/maven/ca/codepet/zero/library/${id}/${version}/${id}-${version}${suffix}`,sha256:digest,size:bytes.length};artifacts[kind]=item;
        await fixture.pool.query('INSERT INTO hub_objects(digest,size,bytes) VALUES($1,$2,$3)',[digest,bytes.length,bytes]);
      }
      const {preview,...files}=artifacts;
      const manifest={libraryId:id,version,title:'Library '+id,description:version==='1.9.0'?'historicword':'latestword',components:[{className:'Display',description:'Visible component'}],artifacts:files,preview};
      manifests.set(coordinate(id,version),manifest);const submission=randomUUID();
      await fixture.pool.query("INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES($1,$2,'101',$3,'{}',$4,'published')",[submission,id,version,'a'.repeat(64)]);
      await fixture.pool.query('INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[id,version,submission,manifest]);
    }
  }
  for(const role of ['hub_migration_owner','hub_api','hub_checker','hub_publisher']) {
    const login='zero_events_'+role,password=randomBytes(32).toString('hex');
    await fixture.pool.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
    await fixture.pool.query(`GRANT ${role} TO ${login}`);
    const url=new URL(fixture.connectionString);url.username=login;url.password=password;
    const pool=createRuntimePool(url.href,role);pools.push(pool);await verifyRole(pool,role);
    if(role==='hub_migration_owner'){operator=pool;operatorURL=url.href;}else if(role==='hub_api')api=pool;else if(role==='hub_checker')checker=pool;else publisher=pool;
  }
  const disabled=()=>assert.fail('No checker or publication execution allowed');
  hub=createHub({pool:api,origin,uploadsEnabled:false,storage:{read:async(digest,size)=>{reads++;const bytes=objects.get(digest);assert.equal(bytes.length,size);return bytes;},put:disabled},checker:{validateBundle:disabled,sourceDigest:disabled,checkSubmission:disabled,expectedPom:disabled,expectedPolicyDigest:disabled}});
});
after(async()=>{await Promise.all(pools.map(pool=>pool.end()));await fixture?.stop();});
async function call(endpoint,method='GET',adapter='readonly') {
  const parts=endpoint.split('?')[0].split('/'),request=new Request(`${origin}/api/hub/${endpoint}`,{method});
  if(adapter==='readonly')return readOnlyHubResponse(request,parts,{handler:hub.handler});
  if(adapter==='enabled')return contributionHubResponse(request,parts,{handler:hub.handler,env:{ZERO_HUB_UPLOADS:'1',ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:'postgresql://unused@example.test/test',ZERO_HUB_GITHUB_CLIENT_ID:'test',ZERO_HUB_GITHUB_CLIENT_SECRET:'test'}});
  return proxyHub(request,parts,{destination:'https://upstream.example',fetch:async(_url,options)=>readOnlyHubResponse(new Request(`${origin}/api/hub/${endpoint}`,{method:options.method}),parts,{handler:hub.handler})});
}
test('004 is idempotent through migration role and retains strict actual role grants',async()=>{
  await migrateDatabase(operator,{roles:true});await migrateDatabase(operator,{roles:true});
  const sql="INSERT INTO hub_release_events(library_id,version,revision,action,reason) VALUES('ui1','1.9.0',1,'withdrawn','private')";
  for(const pool of [api,checker,publisher]) {
    for(const statement of [sql,'UPDATE hub_release_events SET action=\'restored\'','DELETE FROM hub_release_events','TRUNCATE hub_release_events'])await assert.rejects(pool.query(statement),error=>error.code==='42501');
  }
  assert.deepEqual((await api.query('SELECT library_id,version,revision,action FROM hub_release_events')).rows,[]);
  for(const column of ['reason','actor','created_at','*'])await assert.rejects(api.query('SELECT '+column+' FROM hub_release_events'),error=>error.code==='42501');
  for(const pool of [checker,publisher])await assert.rejects(pool.query('SELECT action FROM hub_release_events'),error=>error.code==='42501');
});
test('operator records authenticated actor, exact withdrawal, idempotence and immutable history',async()=>{
  const recorded=await event('ui1','1.10.0','withdrawn');assert.equal(recorded.revision,1);assert.equal(recorded.appended,1);
  assert.equal((await event('ui1','1.10.0','withdrawn')).appended,0);
  const {rows:[stored]}=await operator.query("SELECT actor,reason FROM hub_release_events WHERE library_id='ui1'");
  assert.equal(stored.actor,'zero_events_hub_migration_owner');assert.equal(stored.reason,'Private reason never published');
  for(const sql of ['UPDATE hub_release_events SET reason=\'changed\'','DELETE FROM hub_release_events'])await assert.rejects(operator.query(sql),/immutable/);
  await assert.rejects(event('ui1','9.9.9','withdrawn'),{code:'ZERO_HUB_CONFIG'});
  assert.equal((await operator.query("SELECT count(*)::int AS n FROM hub_release_events WHERE library_id='ui1'")).rows[0].n,1);
  assert.equal((await operator.query("SELECT manifest FROM hub_releases WHERE library_id='ui1' AND version='1.10.0'")).rows[0].manifest.artifacts.jar.sha256,manifests.get('ui1:1.10.0').artifacts.jar.sha256);
});
test('withdrawn preview, JAR, sources, POM and every checksum GET/HEAD return410 with zero reads through all adapters',async()=>{
  const release=manifests.get('ui1:1.10.0');reads=0;
  const paths=[release.preview.path,...Object.values(release.artifacts).flatMap(artifact=>[artifact.path,artifact.path+'.sha1',artifact.path+'.sha256'])];
  for(const adapter of ['readonly','enabled','proxy'])for(const fullPath of paths)for(const method of ['GET','HEAD']) {
    const response=await call(fullPath.slice('/api/hub/'.length),method,adapter);assert.equal(response.status,410,`${adapter} ${method} ${fullPath}`);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('set-cookie'),null);
    if(method==='GET')assert.deepEqual(await response.json(),{error:WITHDRAWN_MESSAGE});else assert.equal((await response.arrayBuffer()).byteLength,0);
  }
  assert.equal(reads,0);
});
test('withdrawn exact metadata never substitutes another version; default picks numeric latest available',async()=>{
  for(const adapter of ['readonly','enabled','proxy'])for(const method of ['GET','HEAD']) {
    const response=await call('libraries/ui1?version=1.10.0',method,adapter);assert.equal(response.status,410);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal((await(await call('libraries/ui1')).json()).version,'1.9.0');
  assert.equal((await(await call('libraries/ui1?version=1.9.0')).json()).version,'1.9.0');
  assert.equal((await call('libraries/ui1?version=9.9.9')).status,404);
});
async function pages(query='') {
  const output=[];let cursor=null,requests=0;
  do {const params=new URLSearchParams(query);if(cursor)params.set('cursor',cursor);const response=await call('catalog?'+params);assert.equal(response.status,200);const page=await response.json();assert.ok(page.libraries.length<=20);assert.ok(Buffer.byteLength(JSON.stringify(page))<2*1024*1024);output.push(...page.libraries);cursor=page.nextCursor;assert.ok(++requests<10);}while(cursor);
  return output;
}
test('latest/search/history pages exclude withdrawn releases while preserving cursor order and older availability',async()=>{
  await event('ui2','1.10.0','withdrawn');await event('ui2','1.9.0','withdrawn');
  const latest=await pages();assert.equal(latest.length,26);assert.equal(new Set(latest.map(r=>r.libraryId)).size,26);assert.equal(latest.find(r=>r.libraryId==='ui1').version,'1.9.0');assert.ok(!latest.some(r=>r.libraryId==='ui2'));
  const history=await pages('history=1');assert.equal(history.length,51);assert.ok(!history.some(r=>['ui1:1.10.0','ui2:1.10.0','ui2:1.9.0'].includes(coordinate(r.libraryId,r.version))));
  const search=await pages('q=historicword');assert.deepEqual(search.map(r=>r.libraryId),['ui1']);
  assert.equal((await call('libraries/ui2')).status,404);
  assert.equal(JSON.stringify(history).includes('Private reason'),false);assert.equal(JSON.stringify(history).includes('zero_events_'),false);
});
test('concurrent operators serialize and append ordered revisions without losing actions',async()=>{
  const results=await Promise.all(Array.from({length:12},(_,i)=>event('ui3','1.10.0',i%2?'restored':'withdrawn')));
  const rows=(await operator.query("SELECT revision,action FROM hub_release_events WHERE library_id='ui3' ORDER BY revision")).rows;
  assert.ok(rows.length>=2);assert.deepEqual(rows.map(r=>r.revision),Array.from({length:rows.length},(_,i)=>i+1));
  for(let i=1;i<rows.length;i++)assert.notEqual(rows[i].action,rows[i-1].action);
  assert.equal(results.reduce((n,r)=>n+r.appended,0),rows.length);
  const last=rows.at(-1),response=await call('libraries/ui3?version=1.10.0');assert.equal(response.status,last.action==='withdrawn'?410:200);
});
test('restoration resumes identical original bytes/hashes and never modifies immutable records',async()=>{
  assert.equal((await event('ui1','1.10.0','restored')).revision,2);
  const release=manifests.get('ui1:1.10.0');
  for(const artifact of [release.preview,...Object.values(release.artifacts)]) {
    const response=await call(artifact.path.slice('/api/hub/'.length));assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),artifact.sha256);
    const stored=(await operator.query('SELECT bytes FROM hub_objects WHERE digest=$1',[artifact.sha256])).rows[0].bytes;assert.equal(hash(stored),artifact.sha256);
    await assert.rejects(operator.query('UPDATE hub_objects SET bytes=$2 WHERE digest=$1',[artifact.sha256,stored]),/immutable/);
  }
  assert.equal((await(await call('libraries/ui1')).json()).version,'1.10.0');
  assert.deepEqual((await operator.query("SELECT manifest FROM hub_releases WHERE library_id='ui1' AND version='1.10.0'")).rows[0].manifest,release);
  assert.equal((await(await call('catalog?history=1&q=historicword')).json()).libraries.some(r=>r.libraryId==='ui1'),true);
});
test('malformed artifacts stop before SQL; valid lookup remains one exact primary-key query',async()=>{
  const queries=[],disabled=()=>assert.fail();
  const checked=createHub({pool:{query:async(sql,args)=>{queries.push({sql,args});return api.query(sql,args);},connect:()=>assert.fail()},origin,uploadsEnabled:false,storage:{read:async(digest)=>objects.get(digest),put:disabled},checker:{validateBundle:disabled,sourceDigest:disabled,checkSubmission:disabled,expectedPom:disabled,expectedPolicyDigest:disabled}});
  for(const path of ['/api/hub/maven/ca/codepet/zero/library/ui1/1.10.0/foreign.jar','/api/hub/previews/ui1/01.10.0.png']) {
    let status;await checked.handler({url:path,method:'GET',headers:{},socket:{}},{writeHead(code){status=code;},end(){}});assert.equal(status,404);
  }
  assert.equal(queries.length,0);
  await checked.handler({url:manifests.get('ui1:1.10.0').artifacts.jar.path,method:'HEAD',headers:{},socket:{}},{writeHead(code){assert.equal(code,200);},end(){}});
  assert.deepEqual(queries,[{sql:EXACT_ARTIFACT_SQL,args:['ui1','1.10.0']}]);
});
test('operator CLI uses private reason file and separate migration identity, logging only coordinates/action/count',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zero-events-'));
  try {
    const file=path.join(dir,'reason.txt');await writeFile(file,'Secret clinical reason\n',{mode:0o600});
    let output='';const child=spawn(process.execPath,[new URL('./release-availability-cli.mjs',import.meta.url).pathname,'--library','ui4','--version','1.10.0','--action','withdrawn','--reason-file',file],{env:{...process.env,ZERO_HUB_RELEASE_EVENTS_ENABLED:'1',ZERO_HUB_MIGRATION_DATABASE_URL:operatorURL},stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;});
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);assert.match(output,/ui4:1.10.0 withdrawn; appended 1 event, revision 1/);
    for(const secret of ['Secret clinical reason','zero_events_hub_migration_owner',operatorURL,file])assert.ok(!output.includes(secret));
    assert.equal((await operator.query("SELECT reason FROM hub_release_events WHERE library_id='ui4'")).rows[0].reason,'Secret clinical reason');
  } finally {await rm(dir,{recursive:true,force:true});}
});
