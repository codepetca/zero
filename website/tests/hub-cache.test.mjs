import test from 'node:test';
import assert from 'node:assert/strict';
import {publicHubCacheHeaders,publicHubCacheTag,IMMUTABLE_BROWSER_CACHE} from '../lib/hub-cache.mjs';
import {readOnlyHubResponse} from '../lib/hub-runtime.mjs';
import {contributionHubResponse} from '../lib/hub-contribution-runtime.mjs';
import {proxyHub} from '../lib/hub-proxy.mjs';
import {createHub} from '../../hub/service/hub.mjs';
import * as policy from '../../hub/checker/policy.mjs';
const origin='https://zero.codepet.ca';
const env={ZERO_HUB_UPLOADS:'1',ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:'postgresql://api:private@ep-example.neon.tech/db',ZERO_HUB_GITHUB_CLIENT_ID:'test-client',ZERO_HUB_GITHUB_CLIENT_SECRET:'test-secret'};
const artifact='maven/ca/codepet/zero/library/ui1/1.0.0/ui1-1.0.0.jar';
const request=(path,method='GET')=>new Request(`${origin}/api/hub/${path}`,{method,headers:{Cookie:'zero_hub_session='+'a'.repeat(64),Origin:origin,'X-Zero-CSRF':'private'}});
const cdn=(response,seconds)=>assert.equal(response.headers.get('vercel-cdn-cache-control'),`public, s-maxage=${seconds}, must-revalidate`);
const noCache=response=>{assert.equal(response.headers.get('cache-control'),'no-store');assert.ok([null,'no-store'].includes(response.headers.get('vercel-cdn-cache-control')));assert.equal(response.headers.get('vercel-cache-tag'),null);};
const adapted=async(path,method,fields,status=200)=>{
  const handler=(req,res)=>{res.writeHead(status,fields);res.end(method==='HEAD'?undefined:fields['Content-Type']==='image/png'?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from('{}'));};
  return Promise.all([readOnlyHubResponse(request(path,method),path.split('?')[0].split('/'),{handler}),contributionHubResponse(request(path,method),path.split('?')[0].split('/'),{env,handler})]);
};
test('only successful public GET/HEAD metadata and immutable objects opt into bounded edge TTLs',()=>{
  for(const method of ['GET','HEAD'])for(const path of ['catalog','libraries/ui1']) {
    const output=publicHubCacheHeaders(new Headers(),{path,method,status:200,source:{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'keep-alive','Keep-Alive':'timeout=5'}});
    cdn({headers:output},60);assert.equal(output.get('cache-control'),'public, max-age=0, must-revalidate');assert.equal(output.get('vercel-cache-tag'),path==='catalog'?'zero-hub-catalog':'zero-hub-library-ui1');
  }
  for(const path of [artifact,'previews/ui1/1.0.0.png'])for(const method of ['GET','HEAD']) {
    const output=publicHubCacheHeaders(new Headers(),{path,method,status:200,source:{'Content-Type':path===artifact?'application/java-archive':'image/png','Cache-Control':IMMUTABLE_BROWSER_CACHE,'Connection':'keep-alive','Keep-Alive':'timeout=5'}});
    cdn({headers:output},3600);assert.equal(output.get('cache-control'),IMMUTABLE_BROWSER_CACHE);assert.equal(output.get('vercel-cache-tag'),'zero-hub-library-ui1');
  }
});
test('privacy, status, methods and unexpected headers exclude shared and browser caching',()=>{
  const base={path:'catalog',method:'GET',status:200,source:{'Content-Type':'application/json'}};
  for(const delta of [
    ...['session','auth/start','auth/callback','submissions/abc','libraries','logout','maven/private','previews/private'].map(path=>({path})),
    ...['POST','PUT','DELETE'].map(method=>({method})),...[201,204,301,302,304,400,401,404,410,500].map(status=>({status})),
    ...[{'Set-Cookie':'secret'},{'Vary':'Cookie'},{Authorization:'secret'},{'X-Private':'secret'},{'Cache-Control':'private, max-age=60'},{'Vercel-CDN-Cache-Control':'private, s-maxage=60'},{'Content-Type':'text/html'}].map(fields=>({source:{...base.source,...fields}}))
  ]) {
    const output=publicHubCacheHeaders(new Headers({'CDN-Cache-Control':'public, max-age=31536000','Vercel-CDN-Cache-Control':'public, s-maxage=31536000','Vercel-Cache-Tag':'private-output-tag'}),{...base,...delta});
    noCache({headers:output});assert.equal(output.get('cdn-cache-control'),null);
  }
});
test('withdrawal tags group every exact release path without private or unbounded identifiers',()=>{
  assert.equal(publicHubCacheTag('catalog'),'zero-hub-catalog');
  for(const path of ['libraries/ui1','previews/ui1/1.0.0.png',artifact,artifact+'.sha1',artifact+'.sha256',artifact.replace('.jar','-sources.jar'),artifact.replace('.jar','.pom')])assert.equal(publicHubCacheTag(path),'zero-hub-library-ui1');
  assert.equal(publicHubCacheTag('libraries/ui2'),'zero-hub-library-ui2');
  for(const path of ['session','auth/start','submissions/private','libraries/ui0','libraries/ui'+'a'.repeat(13)])assert.equal(publicHubCacheTag(path),null);
});
test('matching upstream tags are regenerated; private, wildcard and unrelated tags disable caching and never escape',()=>{
  const base={path:'libraries/ui1',method:'GET',status:200,source:{'Content-Type':'application/json','Vercel-Cache-Tag':'zero-hub-library-ui1'}};
  const known=publicHubCacheHeaders(new Headers({'Vercel-Cache-Tag':'private-output'}),base);assert.equal(known.get('vercel-cache-tag'),'zero-hub-library-ui1');cdn({headers:known},60);
  for(const tag of ['private-account-token','*','zero-hub-library-ui2','zero-hub-library-ui1,private-token','zero-hub-catalog']) {
    const output=publicHubCacheHeaders(new Headers({'Vercel-Cache-Tag':'private-output'}),{...base,source:{...base.source,'Vercel-Cache-Tag':tag}});noCache({headers:output});
  }
  for(const status of [404,410,503])noCache({headers:publicHubCacheHeaders(new Headers({'Vercel-Cache-Tag':'private-output'}),{...base,status})});
});
test('closed and enabled adapters agree on GET/HEAD catalog, exact release, previews and artifact policy',async()=>{
  for(const method of ['GET','HEAD'])for(const path of ['catalog','libraries/ui1?version=1.0.0',artifact,'previews/ui1/1.0.0.png']) {
    const object=/^(maven|previews)/.test(path);
    const fields={'Content-Type':path.startsWith('previews')?'image/png':path===artifact?'application/java-archive':'application/json','Cache-Control':object?IMMUTABLE_BROWSER_CACHE:'no-store'};
    for(const response of await adapted(path,method,fields)) {assert.equal(response.status,200);cdn(response,object?3600:60);assert.equal(response.headers.get('vercel-cache-tag'),path==='catalog'?'zero-hub-catalog':'zero-hub-library-ui1');if(method==='HEAD')assert.equal(response.body,null);}
  }
  for(const fields of [{'Set-Cookie':'zero_hub_session='+'a'.repeat(64)+'; Path=/api/hub; HttpOnly; SameSite=Lax; Max-Age=600; Secure'},{'X-Internal-Secret':'private'},{'Cache-Control':'private, max-age=60'}])
    for(const response of await adapted('catalog','GET',{'Content-Type':'application/json',...fields}))noCache(response);
  for(const response of await adapted(artifact,'GET',{'Content-Type':'application/java-archive','Cache-Control':IMMUTABLE_BROWSER_CACHE,'Set-Cookie':'private'}))noCache(response);
  for(const response of await adapted('catalog','GET',{'Content-Type':'application/json'},503))noCache(response);
});
test('actual catalog handler is cookie-independent; private session and immediate authoring kill switch stay uncached',async()=>{
  for(const enabled of [false,true]) {
    let queries=0;
    const pool={query:async sql=>{assert.ok(sql.startsWith('WITH cursor_key'));queries++;return {rows:[]};},connect:async()=>assert.fail('No transaction authorized')};
    const forbidden=()=>assert.fail('No checker, storage or OAuth activity authorized');
    const handler=createHub({pool,storage:{read:forbidden,put:forbidden},checker:{...policy,checkSubmission:forbidden,expectedPolicyDigest:forbidden},origin,uploadsEnabled:enabled}).handler;
    const call=(path,method='GET')=>contributionHubResponse(request(path,method),path.split('/'),{env:enabled?env:{ZERO_HUB_UPLOADS:'0'},handler});
    const catalog=await call('catalog');cdn(catalog,60);const data=await catalog.json();assert.deepEqual(data,{mode:'production',capabilities:{uploads:enabled},libraries:[],nextCursor:null});
    const session=await contributionHubResponse(new Request(origin+'/api/hub/session'),['session'],{env:enabled?env:{ZERO_HUB_UPLOADS:'0'},handler});noCache(session);assert.equal((await session.json()).user,null);
    const submission=await call('submissions/abc');noCache(submission);assert.ok(submission.status>=400);
    if(!enabled){const upload=await call('libraries','POST');assert.equal(upload.status,503);noCache(upload);}
    assert.equal(queries,1);
  }
});
test('proxy ignores hostile upstream cache policy, strips public request cookies and retains its 4MiB buffer',async()=>{
  for(const path of ['catalog','session','submissions/abc']) {
    const response=await proxyHub(request(path),path.split('/'),{destination:'https://hub.example',fetch:async(_target,init)=>{
      if(path==='catalog')for(const name of ['cookie','origin','x-zero-csrf'])assert.equal(init.headers.get(name),null);
      else assert.match(init.headers.get('cookie'),/zero_hub_session/);
      return Response.json({ok:true},{headers:{'Cache-Control':'public, s-maxage=31536000','CDN-Cache-Control':'public, max-age=31536000','Vercel-CDN-Cache-Control':'public, s-maxage=31536000','Connection':'keep-alive','Keep-Alive':'timeout=5'}});
    }});
    if(path==='catalog')cdn(response,60);else noCache(response);
    assert.equal(response.headers.get('cdn-cache-control'),null);
  }
  for(const fields of [{'Set-Cookie':'other=private'},{'Vary':'Cookie'},{'X-Private':'secret'}]) {
    const response=await proxyHub(request('catalog'),['catalog'],{destination:'https://hub.example',fetch:async()=>Response.json({}, {headers:fields})});noCache(response);
  }
  for(const method of ['GET','HEAD'])for(const path of [artifact,'previews/ui1/1.0.0.png']) {
    const preview=path.startsWith('previews');
    const response=await proxyHub(request(path,method),path.split('/'),{destination:'https://hub.example',fetch:async()=>new Response(method==='HEAD'?null:preview?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from('jar'),{headers:{'Content-Type':preview?'image/png':'application/java-archive','Cache-Control':IMMUTABLE_BROWSER_CACHE,'Connection':'keep-alive','Keep-Alive':'timeout=5'}})});
    assert.equal(response.status,200);cdn(response,3600);assert.equal(response.headers.get('cache-control'),IMMUTABLE_BROWSER_CACHE);assert.equal(response.headers.get('vercel-cache-tag'),'zero-hub-library-ui1');if(method==='HEAD')assert.equal(response.body,null);
  }
  const oversized=await proxyHub(request(artifact),artifact.split('/'),{destination:'https://hub.example',fetch:async()=>new Response(Buffer.alloc(4*1024*1024+1),{headers:{'Content-Type':'application/java-archive','Cache-Control':IMMUTABLE_BROWSER_CACHE}})});assert.equal(oversized.status,502);noCache(oversized);
});
