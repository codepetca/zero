import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionConfiguration,contributionHubResponse,createContributionRuntime,INPUT_LIMIT,OUTPUT_LIMIT,MAVEN_CHUNK_BYTES} from '../lib/hub-contribution-runtime.mjs';
import {createHub} from '../../hub/service/hub.mjs';
import {createPostgresStorage,MAX_OBJECT_BYTES} from '../../hub/service/postgres-storage.mjs';
import * as policy from '../../hub/checker/policy.mjs';

const origin='https://zero.codepet.ca';
const env={ZERO_HUB_UPLOADS:'1',ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:'postgresql://api:private@ep-example.neon.tech/db?sslmode=verify-full',ZERO_HUB_GITHUB_CLIENT_ID:'test-client',ZERO_HUB_GITHUB_CLIENT_SECRET:'test-secret'};
const token='a'.repeat(64),binding='b'.repeat(64),csrf='c'.repeat(64);
const cookie=(name,value=token)=>`${name}=${value}; Path=/api/hub; HttpOnly; SameSite=Lax; Max-Age=${value?600:0}; Secure`;
const request=(path,options={})=>new Request(`${origin}/api/hub/${path}`,options);
const json=(req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');};
const call=(path,options={},handler=json,extra={})=>contributionHubResponse(request(path,options),path.split('?')[0].split('/'),{env,handler,...extra});
const noCall=()=>assert.fail('Invalid request reached handler');

test('closed flag keeps existing read-only authoring behavior before body, cookies or DB dispatch',async()=>{
  for(const flag of [undefined,'0'])for(const [path,method]of [['auth/start','GET'],['auth/callback','GET'],['libraries','POST'],['submissions','POST'],['logout','POST']]) {
    const response=await call(path,{method,headers:{Cookie:'zero_hub_session=private'}},noCall,{env:{ZERO_HUB_UPLOADS:flag}});
    assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
  }
  const response=await call('catalog',{},(req,res)=>{assert.deepEqual(req.headers,{});json(req,res);},{env:{}});
  assert.equal(response.status,200);
});

test('invalid flag and mixed credential configurations fail before injected handler',async()=>{
  for(const flag of ['', 'true','2',' 1'])assert.equal((await call('catalog',{},noCall,{env:{...env,ZERO_HUB_UPLOADS:flag}})).status,503);
  for(const name of ['ZERO_HUB_DATABASE_URL','ZERO_HUB_MIGRATION_DATABASE_URL','ZERO_HUB_CHECKER_DATABASE_URL','ZERO_HUB_PUBLISHER_DATABASE_URL','DATABASE_URL','DATABASE_URL_UNPOOLED','POSTGRES_URL','POSTGRES_PRISMA_URL','PGPASSWORD','ZERO_HUB_WORKERS_ENABLED','ZERO_HUB_POSTGRES_URL','ZERO_HUB_POSTGRES_URL_NON_POOLING','ZERO_HUB_POSTGRES_PASSWORD','ZERO_HUB_PGHOST','ZERO_HUB_PG_URL']) {
    assert.throws(()=>contributionConfiguration({...env,[name]:'private'}));
    assert.equal((await call('catalog',{},noCall,{env:{...env,[name]:'private'}})).status,503);
  }
  for(const changed of [{ZERO_HUB_ORIGIN:'http://zero.codepet.ca'},{ZERO_HUB_ORIGIN:origin+'/hub'},{ZERO_HUB_API_DATABASE_URL:undefined},{ZERO_HUB_API_DATABASE_URL:'postgresql://api:private@ep-example-pooler.neon.tech/db'},{ZERO_HUB_API_DATABASE_URL:env.ZERO_HUB_API_DATABASE_URL+'&options=owner'},{ZERO_HUB_GITHUB_CLIENT_SECRET:undefined},{ZERO_HUB_GITHUB_CLIENT_ID:'\nsecret'}])assert.equal((await call('catalog',{},noCall,{env:{...env,...changed}})).status,503);
  assert.equal(contributionConfiguration(env).connectionString,env.ZERO_HUB_API_DATABASE_URL);
});

test('runtime role guard precedes creation and rejects privilege mismatch',async()=>{
  await assert.rejects(createContributionRuntime({query:async()=>({rows:[{role:'owner'}]})},contributionConfiguration(env)),/role/);
  await assert.rejects(createContributionRuntime({query:async(sql)=>({rows:[sql.includes('current_user')?{role:'hub_api'}:{elevated:true}]})},contributionConfiguration(env)),/restricted/);
});

test('canonical routes and exact, bounded query allowlists reject ambiguity',async()=>{
  for(const query of ['error_uri='+ 'x'.repeat(2049),'error_uri=one&error_uri=two'])assert.equal((await call('auth/callback?'+query,{},noCall)).status,400);
  for(const path of ['catalog?unknown=1','auth/start?state=1','auth/callback?state=1&state=2','auth/callback?code='+ 'x'.repeat(513),'auth/callback?error_description='+ 'x'.repeat(2049),'auth/callback?state=%00','libraries/ui1?version=latest','libraries/ui1?version=1.0.0&version=2.0.0'])assert.equal((await call(path,{},noCall)).status,400,path.slice(0,80));
  for(const parts of [['..'],['catalog/'],['catalog%2f'],['unknown']])assert.equal((await contributionHubResponse(request('catalog'),parts,{env,handler:noCall})).status,404);
  assert.equal((await contributionHubResponse(request('%63atalog'),['catalog'],{env,handler:noCall})).status,400);
  assert.equal((await call('auth/start',{method:'HEAD'},noCall)).status,404);
  assert.equal((await call('libraries/ui1?version=1.2.3-rc.1',{},(req,res)=>{assert.equal(req.url,'/api/hub/libraries/ui1?version=1.2.3-rc.1');json(req,res);})).status,200);
});

test('privacy boundary forwards Origin, CSRF and both hub cookies only',async()=>{
  const response=await call('session',{headers:{Origin:origin,'X-Zero-CSRF':csrf,Cookie:`other=private; zero_hub_session=${token}; zero_hub_oauth=${binding}; trailing=secret`,Authorization:'Bearer secret',Host:'foreign','X-Forwarded-For':'private','X-Forwarded-Host':'foreign'}},(req,res)=>{
    assert.deepEqual(req.headers,{accept:'application/json',origin,'x-zero-csrf':csrf,cookie:`zero_hub_session=${token}; zero_hub_oauth=${binding}`});assert.equal(req.url,'/api/hub/session');json(req,res);
  });assert.equal(response.status,200);
  assert.equal((await call('session',{headers:{Cookie:`zero_hub_session=${token}; zero_hub_session=${binding}`}},noCall)).status,400);
  assert.equal((await call('session',{headers:{Cookie:'other='+ 'x'.repeat(16*1024)}},noCall)).status,400);
});

test('POST is bounded strict JSON with validated encoding, lengths and UTF8',async()=>{
  const valid=await call('libraries',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8','Content-Length':'2'},body:'{}'},async(req,res)=>{assert.equal(req.headers['content-length'],'2');let text='';for await(const part of req)text+=part;assert.equal(text,'{}');json(req,res);});assert.equal(valid.status,200);
  for(const [headers,body,status] of [[{'Content-Type':'text/plain'},'{}',415],[{'Content-Type':'application/json','Content-Encoding':'gzip'},'{}',415],[{'Content-Type':'application/json','Content-Length':'3'},'{}',400],[{'Content-Type':'application/json','Content-Length':'-1'},'{}',400],[{'Content-Type':'application/json','Content-Length':String(INPUT_LIMIT+1)},'{}',413],[{'Content-Type':'application/json'},'invalid',400],[{'Content-Type':'application/json'},Buffer.from([255]),400],[{'Content-Type':'application/json'},'"'+'x'.repeat(INPUT_LIMIT)+'"',413]])assert.equal((await call('submissions',{method:'POST',headers,body},noCall)).status,status);
});

test('stalled input and stalled cancellation are bounded; aborted clients do not dispatch',async()=>{
  const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}});
  const started=Date.now();
  const response=await call('submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'},noCall,{bodyTimeoutMs:20});
  assert.equal(response.status,408);assert.ok(Date.now()-started<1000);
  const abort=new AbortController();abort.abort();
  assert.equal((await call('auth/start',{signal:abort.signal},noCall)).status,400);
  const second=new AbortController();
  const interrupted=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{}'));second.abort();controller.close();}});
  assert.equal((await call('libraries',{method:'POST',signal:second.signal,headers:{'Content-Type':'application/json'},body:interrupted,duplex:'half'},noCall)).status,400);
  const pending=new AbortController();
  const body=new ReadableStream({pull(){pending.abort();return new Promise(()=>{});}});
  assert.equal((await call('libraries',{method:'POST',signal:pending.signal,headers:{'Content-Type':'application/json'},body,duplex:'half'},noCall)).status,400);
});

test('Node header API preserves both cookies, including cancellation clearing',async()=>{
  const result=await call('auth/callback?error=access_denied&state='+token,{},(_,res)=>{
    assert.equal(res.getHeader('Set-Cookie'),undefined);
    res.setHeader('Set-Cookie',cookie('zero_hub_oauth',''));
    assert.equal(res.getHeader('set-cookie'),cookie('zero_hub_oauth',''));
    res.setHeader('Set-Cookie',[res.getHeader('Set-Cookie'),cookie('zero_hub_session')]);json(_,res);
  });assert.deepEqual(result.headers.getSetCookie(),[cookie('zero_hub_oauth',''),cookie('zero_hub_session')]);
});

test('unsafe cookies and redirects fail closed, unrelated headers never escape',async()=>{
  for(const invalid of [cookie('foreign'),cookie('zero_hub_session').replace('Secure','Domain=zero.codepet.ca; Secure'),cookie('zero_hub_session').replace('; Secure',''),cookie('zero_hub_session').replace('/api/hub','/'),cookie('zero_hub_session')+'; Path=/api/hub',[cookie('zero_hub_session'),cookie('zero_hub_session')],[cookie('zero_hub_session'),cookie('zero_hub_oauth'),cookie('zero_hub_session')]])assert.equal((await call('session',{},(req,res)=>{res.setHeader('Set-Cookie',invalid);json(req,res);})).status,503);
  for(const location of ['https://foreign.example/hub','https://zero.codepet.ca/hub?secret=1','/api/hub/auth/start','//github.com/foreign','https://github.com/login/oauth/authorize?redirect_uri=https://foreign.example','/hub\\prepare'])assert.equal((await call('auth/start',{},(_,res)=>{res.writeHead(302,{Location:location});res.end();})).status,503);
  assert.equal((await call('auth/callback',{},(_,res)=>{res.writeHead(302,{Location:origin+'/hub/prepare'});res.end();})).headers.get('location'),'/hub/prepare');
  const authorize=new URL('https://github.com/login/oauth/authorize');for(const [name,value]of Object.entries({client_id:'test-client',redirect_uri:origin+'/api/hub/auth/callback',scope:'read:user',state:token,code_challenge:'b'.repeat(43),code_challenge_method:'S256'}))authorize.searchParams.set(name,value);
  assert.equal((await call('auth/start',{},(_,res)=>{res.writeHead(302,{Location:authorize.href});res.end();})).headers.get('location'),authorize.href);
  const response=await call('catalog',{},(req,res)=>{res.setHeader('Authorization','private');res.setHeader('X-Internal-Secret','private');res.setHeader('Access-Control-Allow-Origin','*');json(req,res);});assert.equal(response.status,200);assert.equal(response.headers.get('authorization'),null);assert.equal(response.headers.get('x-internal-secret'),null);assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('response bounds, immutable artifact cookies, and bodyless HEAD honor contracts',async()=>{
  for(const handler of [async()=>{},async()=>{throw new Error('secret-credential');},(_,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(Buffer.alloc(OUTPUT_LIMIT+1));},(_,res)=>{json(_,res);res.destroy();}]){const response=await call('catalog',{},handler);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret-credential/);}
  const path='maven/ca/codepet/zero/library/ui1/1.0.0/ui1-1.0.0.jar';
  const artifact=await call(path,{},(_,res)=>{res.writeHead(200,{'Content-Type':'application/java-archive','Content-Length':OUTPUT_LIMIT+1,'Cache-Control':'public, max-age=31536000, immutable','Set-Cookie':cookie('zero_hub_session')});res.end(Buffer.alloc(OUTPUT_LIMIT+1));});assert.equal(artifact.status,200);assert.equal(artifact.headers.get('set-cookie'),null);assert.match(artifact.headers.get('cache-control'),/immutable/);assert.equal((await artifact.arrayBuffer()).byteLength,OUTPUT_LIMIT+1);
  assert.equal((await call(path,{},(_,res)=>{res.writeHead(200,{'Content-Type':'application/java-archive'});res.end(Buffer.alloc(MAX_OBJECT_BYTES+1));})).status,503);
  const head=await call(path,{method:'HEAD'},(_,res)=>{res.writeHead(200,{'Content-Type':'application/java-archive','Content-Length':MAX_OBJECT_BYTES});res.end();});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await call('previews/ui1/1.0.0.png',{},(_,res)=>{res.writeHead(200,{'Content-Type':'image/png'});res.end(Buffer.alloc(256*1024+1));})).status,503);
});

test('actual hub handler receives session, CSRF mutations and OAuth cancellation cookies',async()=>{
  const queries=[];
  const pool={query:async(sql)=>{queries.push(sql);if(sql.includes('SELECT s.token_hash'))return {rows:[{token_hash:'hash',csrf_token:csrf,github_id:'1',login:'student'}]};return {rowCount:1,rows:[]};},connect:async()=>assert.fail('No transaction expected')};
  const handler=createHub({pool,storage:{read:async()=>{},put:async()=>{}},checker:{...policy,checkSubmission:async()=>assert.fail(),expectedPolicyDigest:()=>assert.fail()},origin,oauth:{clientId:'test-client',clientSecret:'test-secret',fetch:async()=>assert.fail('No GitHub call authorized')},uploadsEnabled:true}).handler;
  const session=await call('session',{headers:{Cookie:`zero_hub_session=${token}`}},handler);assert.equal(session.status,200);assert.equal((await session.json()).csrfToken,csrf);
  const missing=await call('logout',{method:'POST',headers:{Cookie:`zero_hub_session=${token}`,'Content-Type':'application/json'},body:'{}'},handler);assert.equal(missing.status,403);assert.ok(!queries.some(sql=>sql.startsWith('DELETE FROM hub_sessions')));
  const logout=await call('logout',{method:'POST',headers:{Origin:origin,'X-Zero-CSRF':csrf,Cookie:`zero_hub_session=${token}`,'Content-Type':'application/json'},body:'{}'},handler);assert.equal(logout.status,200);assert.deepEqual(logout.headers.getSetCookie(),[cookie('zero_hub_session','')]);
  const cancelled=await call('auth/callback?state='+token+'&error=access_denied&error_description=Cancelled&error_uri='+encodeURIComponent('https://docs.github.com/apps/oauth-apps'),{headers:{Cookie:`zero_hub_oauth=${binding}`}},handler);assert.equal(cancelled.status,403);assert.deepEqual(cancelled.headers.getSetCookie(),[cookie('zero_hub_oauth','')]);
  assert.ok(queries.some(sql=>sql.startsWith('DELETE FROM hub_oauth_states')));
  assert.equal(cancelled.headers.get('location'),null);assert.doesNotMatch(await cancelled.text(),/docs\.github\.com/);
  const invalid=await call('auth/callback?state=invalid',{},handler);assert.equal(invalid.status,403);assert.deepEqual(invalid.headers.getSetCookie(),[cookie('zero_hub_oauth','')]);
});


test('actual hub OAuth success clears temporary cookie and issues a session without leaking tokens',async()=>{
  const queries=[];let providerCalls=0;
  const client={query:async(sql)=>{queries.push(sql);return {rows:sql.includes('count(*)')?[{retained:0,pending:0,account:0}]:[]};},release(){}};
  const pool={query:async(sql)=>{queries.push(sql);return {rows:[],rowCount:1};},connect:async()=>client};
  const handler=createHub({pool,storage:{read:async()=>{},put:async()=>{}},checker:{...policy,checkSubmission:async()=>assert.fail(),expectedPolicyDigest:()=>assert.fail()},origin,oauth:{clientId:'test-client',clientSecret:'test-secret',fetch:async(url)=>{providerCalls++;return Response.json(url.includes('access_token')?{access_token:'provider-secret',token_type:'bearer'}:{id:42,login:'student'});}},uploadsEnabled:true}).handler;
  const start=await call('auth/start',{},handler);assert.equal(start.status,302);assert.match(start.headers.get('location'),/^https:\/\/github.com\/login\/oauth\/authorize\?/);assert.equal(start.headers.getSetCookie().length,1);
  const success=await call('auth/callback?state='+token+'&code=valid-code',{headers:{Cookie:`zero_hub_oauth=${binding}`}},handler);
  assert.equal(success.status,302);assert.equal(success.headers.get('location'),'/hub/prepare');assert.equal(providerCalls,2);
  const cookies=success.headers.getSetCookie();assert.equal(cookies.length,2);assert.equal(cookies[0],cookie('zero_hub_oauth',''));assert.match(cookies[1],/^zero_hub_session=[a-f0-9]{64};/);assert.doesNotMatch(cookies.join(';'),/provider-secret|test-secret/);
  assert.ok(queries.some(sql=>sql.startsWith('INSERT INTO hub_sessions')));
});


test('enabled exact origin rejects aliases before reading cookies or POST bodies',async()=>{
  for(const [path,method]of [['auth/start','GET'],['session','GET'],['libraries','POST']]) {
    const alias=new Request('https://alias.example/api/hub/'+path,{method,headers:{Cookie:`zero_hub_session=${token}`}});
    const response=await contributionHubResponse(alias,path.split('/'),{env,handler:noCall});
    assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null);
  }
  const alias=new Request('https://alias.example/api/hub/catalog');
  assert.equal((await contributionHubResponse(alias,['catalog'],{env:{ZERO_HUB_UPLOADS:'0'},handler:json})).status,200);
});

test('verified Maven streams bounded chunks with exact hashes, lengths and cancellation',async()=>{
  const path='maven/ca/codepet/zero/library/ui1/1.0.0/ui1-1.0.0.jar';
  const makeHandler=bytes=>(_,res)=>{res.writeHead(200,{'Content-Type':'application/java-archive','Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable'});res.end(bytes);};
  for(const size of [OUTPUT_LIMIT+123,MAX_OBJECT_BYTES]) {
    const original=Buffer.alloc(size,42),expected=createHash('sha256').update(original).digest('hex');
    const response=await call(path,{},makeHandler(original));
    assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(size));assert.match(response.headers.get('cache-control'),/immutable/);
    const reader=response.body.getReader(),hash=createHash('sha256');let count=0,total=0;
    for(;;){const {value,done}=await reader.read();if(done)break;assert.ok(value.byteLength>0&&value.byteLength<=MAVEN_CHUNK_BYTES);total+=value.byteLength;count++;hash.update(value);}
    assert.ok(count>1);assert.equal(total,size);assert.equal(hash.digest('hex'),expected);
  }
  const boundary=Buffer.alloc(MAX_OBJECT_BYTES,43);
  const cancelled=await call(path,{},makeHandler(boundary));
  const reader=cancelled.body.getReader();assert.equal((await reader.read()).value.byteLength,MAVEN_CHUNK_BYTES);
  await reader.cancel();assert.equal((await reader.read()).done,true);
  const abort=new AbortController();
  const interrupted=await call(path,{signal:abort.signal},makeHandler(boundary));
  const abortReader=interrupted.body.getReader();assert.equal((await abortReader.read()).value.byteLength,MAVEN_CHUNK_BYTES);abort.abort();
  await assert.rejects(abortReader.read(),/cancelled/);
  const head=await call(path,{method:'HEAD'},(_,res)=>{res.writeHead(200,{'Content-Type':'application/java-archive','Content-Length':MAX_OBJECT_BYTES});res.end();});assert.equal(head.body,null);assert.equal(head.headers.get('content-length'),String(MAX_OBJECT_BYTES));
});


test('actual hub finishes stored size and digest verification before Maven streaming',async()=>{
  const path='maven/ca/codepet/zero/library/ui1/1.0.0/ui1-1.0.0.jar';
  const original=Buffer.alloc(OUTPUT_LIMIT+99,44),digest=createHash('sha256').update(original).digest('hex');let corrupt=false;
  const manifest={artifacts:{jar:{path:'/api/hub/'+path,size:original.length,sha256:digest}},preview:{path:'/unused-preview',size:1,sha256:digest}};
  const pool={query:async(sql)=>{if(sql==='SELECT manifest FROM hub_releases')return {rows:[{manifest}]};if(sql.startsWith('SELECT bytes FROM hub_objects'))return {rows:[{bytes:corrupt?Buffer.alloc(original.length,45):original}]};assert.fail('Unexpected database dispatch');},connect:async()=>assert.fail()};
  const handler=createHub({pool,storage:createPostgresStorage(pool),checker:{...policy,checkSubmission:async()=>assert.fail(),expectedPolicyDigest:()=>assert.fail()},origin,oauth:{clientId:'test-client',clientSecret:'test-secret'},uploadsEnabled:true}).handler;
  const response=await call(path,{},handler);assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),digest);
  corrupt=true;
  const invalid=await call(path,{},handler);assert.equal(invalid.status,503);assert.match(invalid.headers.get('content-type'),/^application\/json/);assert.doesNotMatch(await invalid.text(),/digest|credential/);
});
