import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOnlyHubResponse,runtimeConfiguration} from '../lib/hub-runtime.mjs';
const request=(path,method='GET')=>new Request(`https://zero.codepet.ca/api/hub/${path}`,{method,headers:{Cookie:'zero_hub_session=private; other=secret'}});
test('embedded runtime closes authoring before database, cookies or body handling',async()=>{
  for(const[path,method]of [['auth/start','GET'],['auth/callback','GET'],['libraries','POST'],['submissions','POST'],['submissions/123','GET'],['logout','POST']]) {
    const response=await readOnlyHubResponse(request(path,method),path.split('/'),{handler:()=>assert.fail('Authoring reached service')});assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
  }
});
test('read-only Node adapter forwards only canonical path and preserves catalog and HEAD headers',async()=>{
  const handler=async(req,res)=>{assert.deepEqual(req.headers,{});assert.equal(req.url,'/api/hub/catalog');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'should-not-be-issued'});res.end(JSON.stringify({mode:'production',capabilities:{uploads:false},libraries:[]}));};
  const response=await readOnlyHubResponse(request('catalog'),['catalog'],{handler});assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal((await response.json()).capabilities.uploads,false);
  const artifact='maven/ca/codepet/zero/library/ui1/0.1.0/ui1-0.1.0.jar';
  const head=await readOnlyHubResponse(request(artifact,'HEAD'),artifact.split('/'),{handler:async(req,res)=>{assert.equal(req.method,'HEAD');res.writeHead(200,{'Content-Type':'application/java-archive','Content-Length':'123'});res.end();}});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'123');assert.equal((await head.arrayBuffer()).byteLength,0);
});
test('invalid paths, queries, incomplete output and overlarge responses fail without leaking errors',async()=>{
  assert.equal((await readOnlyHubResponse(request('catalog'),['..'])).status,404);
  assert.equal((await readOnlyHubResponse(new Request('https://zero.codepet.ca/api/hub/catalog?secret=1'),['catalog'])).status,400);
  for(const handler of [async()=>{},async()=>{throw new Error('credential-value');},async(_,res)=>{res.writeHead(200);res.end(Buffer.alloc(4*1024*1024+1));}]) {
    const response=await readOnlyHubResponse(request('catalog'),['catalog'],{handler});assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/credential-value/);
  }
});

test('runtime requires its restricted direct connection and never falls back to owner integration variables',()=>{
 const origin='https://zero.codepet.ca';
 assert.throws(()=>runtimeConfiguration({ZERO_HUB_ORIGIN:origin,ZERO_HUB_DATABASE_URL:'postgresql://owner:private@neon.example/db'}),/Restricted/);
 assert.throws(()=>runtimeConfiguration({ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:'postgresql://api:private@ep-db-pooler.neon.tech/db'}),/direct/);
 assert.throws(()=>runtimeConfiguration({ZERO_HUB_ORIGIN:'http://zero.codepet.ca',ZERO_HUB_API_DATABASE_URL:'postgresql://api:private@ep-db.neon.tech/db'}),/HTTPS/);
 assert.equal(runtimeConfiguration({ZERO_HUB_ORIGIN:origin,ZERO_HUB_API_DATABASE_URL:'postgresql://api:private@ep-db.neon.tech/db'}).origin,origin);
});


test('read-only response limits follow JSON, preview and immutable Maven contracts',async()=>{
  for(const [path,limit,type]of [['catalog',4*1024*1024,'application/json'],['previews/ui1/1.0.0.png',256*1024,'image/png'],['maven/ca/codepet/zero/library/ui1/1.0.0/ui1-1.0.0.jar',16*1024*1024,'application/java-archive'],['maven/ca/codepet/zero/library/ui1/1.0.0/ui1-1.0.0.jar',4*1024*1024,'application/json']]) {
    const response=await readOnlyHubResponse(request(path),path.split('/'),{handler:(_,res)=>{res.writeHead(200,{'Content-Type':type,'Set-Cookie':'private'});res.end(Buffer.alloc(limit+1));}});
    assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
  }
});
