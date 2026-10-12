import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogQuery,catalogPage,canonicalHubQuery,CATALOG_PAGE_BYTES} from './catalog.mjs';

test('catalog grammar normalizes search, bounds text and rejects unknown, duplicate or cross-search cursors before SQL',async()=>{
  assert.equal(catalogQuery(new URLSearchParams('q=+HUD+')).query,'q=hud');
  const rows=Array.from({length:21},(_,i)=>({library_id:'ui'+(i+1).toString(36),version:'1.0.0'}));
  const page=await catalogPage({query:async()=>({rows})},new URLSearchParams('q=hud'),row=>row);
  assert.equal(page.libraries.length,20);assert.ok(page.nextCursor);
  for(const query of ['unknown=1','q=a&q=b','q='+ 'x'.repeat(201),'q=%00','q=%C2%85','q=%E2%80%8B','history=0','cursor=bad','cursor=',`cursor=${page.nextCursor}`,`q=other&cursor=${page.nextCursor}`,`q=hud&history=1&cursor=${page.nextCursor}`])
    await assert.rejects(catalogPage({query:()=>assert.fail('Invalid query reached SQL')},new URLSearchParams(query),row=>row),error=>error.status===400);
  assert.equal(catalogQuery(new URLSearchParams(`q=HUD&cursor=${page.nextCursor}`)).after[2],rows[19].library_id);
  for(const index of [2,3]){const value=JSON.parse(Buffer.from(page.nextCursor,'base64url'));value[index]=[value[index]];const cursor=Buffer.from(JSON.stringify(value)).toString('base64url');assert.throws(()=>catalogQuery(new URLSearchParams({q:'hud',cursor})),error=>error.status===400);}
});
test('long API notes produce byte-bounded pages without skipping a release',async()=>{
  const rows=Array.from({length:23},(_,i)=>({library_id:'ui'+(i+1).toString(36),version:'1.0.0',manifest:{libraryId:'ui'+(i+1).toString(36),api:'a'.repeat(65536),changelog:'b'.repeat(65536)}})).sort((a,b)=>a.library_id.localeCompare(b.library_id));
  const pool={query:async(_sql,args)=>({rows:rows.filter(row=>!args[1]||row.library_id>args[1]).slice(0,21)})};
  let cursor=null;const collected=[];
  do {
    const page=await catalogPage(pool,new URLSearchParams(cursor?{cursor}:{}),row=>row.manifest);
    assert.ok(page.libraries.length>0&&page.libraries.length<20);assert.ok(Buffer.byteLength(JSON.stringify(page))<CATALOG_PAGE_BYTES);
    collected.push(...page.libraries.map(row=>row.libraryId));cursor=page.nextCursor;
  }while(cursor);
  assert.deepEqual(collected,rows.map(row=>row.library_id));
});

test('exact release grammar preserves old versions and rejects ambiguous or unbounded selections',()=>{
  assert.equal(canonicalHubQuery(new URL('https://zero.example/?version=1.0.0'),'libraries/ui1'),'?version=1.0.0');
  for(const query of ['version=latest','version=1.0.0&version=2.0.0','q=hud','version='+ '1'.repeat(200)+'.0.0'])assert.throws(()=>canonicalHubQuery(new URL('https://zero.example/?'+query),'libraries/ui1'),error=>error.status===400);
});

test('direct Node catalog and release endpoints reject invalid selections before SQL',async()=>{
  const {createHub}=await import('./hub.mjs');let queries=0;
  const pool={query:()=>{queries++;assert.fail('Invalid query reached SQL');},connect:()=>assert.fail()};
  const disabled=()=>assert.fail();
  const hub=createHub({pool,origin:'https://zero.example',storage:{read:disabled,put:disabled},checker:{validateBundle:disabled,sourceDigest:disabled,checkSubmission:disabled,expectedPom:disabled,expectedPolicyDigest:disabled},uploadsEnabled:false});
  for(const path of ['catalog?q=a&q=b','catalog?history=2','catalog?cursor=bad','libraries/ui1?version=latest','libraries/ui1?version=1.0.0&version=2.0.0','libraries/ui1?unknown=1']) {
    let status;const res={writeHead(code){status=code;},end(){}};
    await hub.handler({url:'/api/hub/'+path,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}},res);assert.equal(status,400,path);
  }
  assert.equal(queries,0);
});
