import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unzipSync} from 'fflate';
import {scaffoldBundle} from '../../hub/service/scaffold.mjs';

// Run against an already-owned Next dev or production server; no server started.
// ZERO_HUB_TEST_WEBSITE=http://127.0.0.1:3177 node --test tests/hub-http.test.mjs
const website=process.env.ZERO_HUB_TEST_WEBSITE;
test('actual Next project ZIP preserves all canonical wrapper bytes',{skip:!website},async()=>{
  const origin=new URL(website);
  assert.equal(website,origin.origin,'Use an exact local test origin');
  assert.equal(origin.protocol,'http:');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(origin.hostname),'Use a loopback test server');
  const bundle=scaffoldBundle({libraryId:'ui1',className:'Widget',title:'Wrapper HTTP proof'});
  const response=await fetch(new URL('/api/hub/project',origin),{method:'POST',headers:{Origin:website,'Content-Type':'application/json'},body:JSON.stringify(bundle),redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');
  const entries=unzipSync(new Uint8Array(await response.arrayBuffer()));
  for(const name of ['mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties']){
    const canonical=await readFile(new URL('../../student-template/'+name,import.meta.url));
    assert.ok(entries[name],`${name} is present`);
    assert.deepEqual(Buffer.from(entries[name]),canonical,`${name} preserves exact canonical bytes through Next`);
  }
});


test('actual Next exposes ZeroHub and retires the old page, catalogs and downloads', {skip:!website}, async()=>{
  const origin=new URL(website);
  assert.equal(website,origin.origin);
  assert.equal(origin.protocol,'http:');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(origin.hostname));
  for(const [path,text] of [['/hub','Share it with others.'],['/hub/prepare','Make a library.']]) {
    const response=await fetch(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200,path);
    const html=await response.text();
    assert.ok(html.includes(text),path);
    assert.match(html, /href="\/hub"[^>]*aria-current="page"[^>]*>ZeroHub/);
    assert.doesNotMatch(html, /href="\/community/);
  }
  for(const path of ['/community','/community/prepare','/community/catalog.json','/community/catalog-v2.json','/community/workshop','/community/maven/zero.jar','/download/components','/docs/workshop']) {
    const response=await fetch(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,404,path);
    assert.equal(response.headers.get('location'),null,path);
  }
});
