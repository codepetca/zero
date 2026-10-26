import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {defaultJamDraft,prepareJamDraft} from '../lib/jam-draft.mjs';
import {createJamTemplatePreview,createJamTemplateZip,JAM_TEMPLATE_FILES} from '../lib/jam-template.mjs';
import {preparedJamResponse} from '../lib/jam-template-http.mjs';
const manifest=()=>prepareJamDraft({...defaultJamDraft('app'),title:'Literal $& </script><script>parent.injected=true</script>',summary:'Build & share',theme:'Theme',registrationOpensAt:'2030-03-01T09:00',startsAt:'2030-03-15T09:00',submissionsCloseAt:'2030-03-17T22:00'}).manifest;
const request=(body,headers={})=>new Request('http://localhost:3025/api/jams/template',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('preview and full downloadable site share exact normalized details, safely embedded as inert JSON',async()=>{
  const input=manifest(),preview=await createJamTemplatePreview(input),zip=unzipSync(await createJamTemplateZip(input.type,input));
  assert.deepEqual(Object.keys(zip).sort(),JAM_TEMPLATE_FILES.map(path=>'zero-app-jam/'+path).sort());
  assert.deepEqual(JSON.parse(strFromU8(zip['zero-app-jam/zero-jam.json'])),preview.manifest);
  const embedded=preview.html.match(/<script id="zero-jam-preview-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded),input);assert.doesNotMatch(embedded,/<script|<\/script/);
  assert.match(preview.html,/connect-src 'none'/);assert.match(preview.html,/base-uri 'none'/);
  assert.doesNotMatch(preview.html,/(?:src|href)="assets\//);assert.match(preview.html,/data:image\/svg\+xml;base64/);
  assert.doesNotMatch(preview.html,/<a\b[^>]*\bhref=/);assert.match(preview.html,/<a\b[^>]*aria-disabled="true"/);
  assert.match(strFromU8(zip['zero-app-jam/index.html']),/href="https:\/\/zero.codepet.ca\/hub\/jams\/create"/);
  assert.match(strFromU8(zip['zero-app-jam/assets/jam.js']),/else \{\s+const response = await fetch/);
});
test('preparation responses need no sign-in and reject malformed, oversized and cross-origin requests',async()=>{
  const loopback=await preparedJamResponse(request({manifest:manifest()},{Host:'127.0.0.1:3025',Origin:'http://127.0.0.1:3025'}),{preview:true});assert.equal(loopback.status,200);
  const input=manifest();const preview=await preparedJamResponse(request({manifest:input}),{preview:true});assert.equal(preview.status,200);assert.deepEqual((await preview.json()).manifest,input);
  const zip=await preparedJamResponse(request({manifest:input}));assert.equal(zip.status,200);assert.equal(zip.headers.get('content-type'),'application/zip');
  for(const [req,status]of [[request({manifest:input,extra:true}),400],[request({manifest:{...input,title:''}}),400],[request({manifest:input},{Origin:'https://unrelated.example'}),403],[request({manifest:input},{'Content-Type':'text/plain'}),415],[request({padding:'x'.repeat(33000)}),413]]){
    const response=await preparedJamResponse(req,{preview:true});assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('pilot preview and ZIP use the same trusted generated files and preserve safe metadata',async()=>{
  const officialOrigin='https://zero-pilot-codepet.vercel.app';
  const input={...manifest(),websiteUrl:'https://zero.codepet.ca/creator-owned-site/'};
  const preview=await createJamTemplatePreview(input,{officialOrigin});
  const zipResponse=await preparedJamResponse(request({manifest:input}),{officialOrigin});
  assert.equal(zipResponse.status,200);
  const zip=unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
  assert.deepEqual(zip,unzipSync(await createJamTemplateZip(input.type,input,{officialOrigin})));
  assert.deepEqual(JSON.parse(strFromU8(zip['zero-app-jam/zero-jam.json'])),preview.manifest);
  assert.equal(preview.manifest.websiteUrl,input.websiteUrl,'creator destination is never rewritten');
  const embedded=preview.html.match(/<script id="zero-jam-preview-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded),input);assert.doesNotMatch(embedded,/<script|<\/script/);
  assert.match(preview.html,/connect-src 'none'/);assert.match(preview.html,/form-action 'none'/);
  assert.doesNotMatch(preview.html,/<a\b[^>]*\bhref=/);
  assert.ok(preview.html.includes(strFromU8(zip['zero-app-jam/assets/jam.js'])),'preview embeds the ZIP script exactly');
  assert.ok(preview.html.includes(strFromU8(zip['zero-app-jam/assets/jam.css'])),'preview embeds the ZIP stylesheet exactly');
  assert.match(strFromU8(zip['zero-app-jam/index.html']),/href="https:\/\/zero-pilot-codepet\.vercel\.app\/hub\/jams\/create"/);
  const response=await preparedJamResponse(request({manifest:input}),{preview:true,officialOrigin});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),preview);
  await assert.rejects(()=>createJamTemplatePreview(input,{officialOrigin:'https://localhost'}),/canonical public HTTPS official origin/);
});

test('preparation accepts official origin only from trusted server options',async()=>{
  const input=manifest(),officialOrigin='https://zero-pilot-codepet.vercel.app';
  for(const body of [{manifest:input,officialOrigin:'https://attacker.com'},{manifest:{...input,officialOrigin:'https://attacker.com'}}]) {
    const response=await preparedJamResponse(request(body),{preview:true,officialOrigin});
    assert.equal(response.status,400);
  }
  const query=new Request('http://localhost:3025/api/jams/template?officialOrigin=https://attacker.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifest:input})});
  const response=await preparedJamResponse(query,{preview:true,officialOrigin});
  assert.equal(response.status,200);const preview=await response.json();
  assert.match(preview.html,/https:\/\/zero-pilot-codepet\.vercel\.app\/hub\/jams/);
  assert.doesNotMatch(preview.html,/attacker\.com/);
  const invalid=await preparedJamResponse(request({manifest:input}),{officialOrigin:'https://localhost'});
  assert.equal(invalid.status,503);
});
