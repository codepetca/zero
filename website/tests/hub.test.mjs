import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hubDestination,hubPath,proxyHub,boundedBytes} from '../lib/hub-proxy.mjs';
import {contributorProfile,dependencySnippet,previewPath,latestLibraries,selectedLibraries,publishedSubmission,validateUploadBundle,folderBundle} from '../lib/hub-client.mjs';
const origin='http://localhost:3000';
const release={libraryId:'ui1',namespace:'zero.ui1',version:'1.2.3',coordinate:{groupId:'ca.codepet.zero.library',artifactId:'ui1',version:'1.2.3'},preview:{path:'/api/hub/previews/ui1/1.2.3.png'}};
const fixture=()=>({descriptor:{libraryId:'ui1',version:'1.0.0'},files:{'src/zero/ui1/Widget.java':'public class Widget {}','API.md':'Widget'}});
const options={destination:'http://127.0.0.1:8788'};
test('contributor credit uses validated account metadata and a fixed GitHub profile destination',()=>{
  assert.deepEqual(contributorProfile({...release,contributor:{githubId:'101',login:'alice',profileUrl:'https://evil.example'}}),{login:'alice',url:'https://github.com/alice'});
  assert.equal(contributorProfile(release),null);
  for(const contributor of [{githubId:'101',login:'alice/path'},{githubId:'101',login:'<alice>'},{githubId:'0',login:'alice'},{githubId:101,login:'alice'}])assert.equal(contributorProfile({...release,contributor}),null);
});
test('fixed destination rejects credentials, paths and insecure remote origins',()=>{
  assert.equal(hubDestination(undefined),null);
  assert.equal(hubDestination('http://127.0.0.1:8788').origin,'http://127.0.0.1:8788');
  for(const url of ['http://example.com','https://token@example.com','https://example.com/path','https://example.com/?key=secret','file:///tmp/service','https://example.com/#secret'])assert.throws(()=>hubDestination(url));
});
test('only declared endpoint paths/methods are proxied',()=>{
  assert.equal(hubPath(['submissions','job-123'],'GET'),'submissions/job-123');
  assert.equal(hubPath(['maven','ca','codepet','zero','library','ui1','1.2.3','ui1-1.2.3.jar'],'GET'),'maven/ca/codepet/zero/library/ui1/1.2.3/ui1-1.2.3.jar');
  for(const parts of [['https:','evil.com'],['maven','..','secret'],['publisher'],['catalog?url=x'],['previews','ui1','file.svg']])assert.equal(hubPath(parts,'GET'),null);
  assert.equal(hubPath(['catalog'],'POST'),null);
});
test('unconfigured hub fails closed without a request',async()=>{
  let called=false;const response=await proxyHub(new Request(origin+'/api/hub/catalog'),['catalog'],{destination:'',fetch:()=>{called=true;}});assert.equal(response.status,503);assert.equal(called,false);
});
test('proxy preserves session/CSRF/Origin, drops credentials and unexpected query',async()=>{
  const request=new Request(origin+'/api/hub/libraries',{method:'POST',headers:{Origin:origin,'X-Zero-CSRF':'csrf',Cookie:'zero_hub_session=session; cloud_token=secret','Content-Type':'application/json',Authorization:'Bearer cloud-secret','X-Api-Key':'cloud'},body:'{"className":"Widget","title":"Widget"}'});
  const response=await proxyHub(request,['libraries'],{...options,fetch:async(url,init)=>{assert.equal(url.href,'http://127.0.0.1:8788/api/hub/libraries');assert.equal(init.headers.get('authorization'),null);assert.equal(init.headers.get('x-api-key'),null);assert.equal(init.headers.get('origin'),origin);assert.equal(init.headers.get('cookie'),'zero_hub_session=session');assert.equal(init.headers.get('x-zero-csrf'),'csrf');assert.equal(init.redirect,'manual');return Response.json({libraryId:'ui1'},{headers:{'Set-Cookie':'zero_hub_session=session; Path=/api/hub; HttpOnly; SameSite=Lax'}});}});
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await proxyHub(new Request(origin+'/api/hub/catalog?url=https://evil.example'),['catalog'],options)).status,400);
});
test('proxy enforces bytes, PNG and redirect boundaries',async()=>{
  const request=new Request(origin+'/api/hub/previews/ui1/1.2.3.png');
  const html=await proxyHub(request,['previews','ui1','1.2.3.png'],{...options,fetch:async()=>new Response('<script>bad</script>',{headers:{'Content-Type':'image/png'}})});assert.equal(html.status,502);
  const oversized=await proxyHub(new Request(origin+'/api/hub/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(1024*1024+1)}),['submissions'],options);assert.equal(oversized.status,413);
  const unsafe=await proxyHub(new Request(origin+'/api/hub/auth/start'),['auth','start'],{...options,fetch:async()=>new Response(null,{status:302,headers:{Location:'https://evil.example/steal'}})});assert.equal(unsafe.status,502);
  const safe=await proxyHub(new Request(origin+'/api/hub/auth/start'),['auth','start'],{...options,fetch:async()=>new Response(null,{status:302,headers:{Location:'/api/hub/auth/callback?state=abc'}})});assert.equal(safe.headers.get('location'),'/api/hub/auth/callback?state=abc');
  await assert.rejects(()=>boundedBytes(new Response('12345').body,4));
});
test('pinned snippets and preview refuse hostile catalog URLs and mismatched versions',()=>{
  const xml=dependencySnippet(release,origin);assert.match(xml,/<version>1.2.3<\/version>/);assert.match(xml,/http:\/\/localhost:3000\/api\/hub\/maven/);
  assert.throws(()=>dependencySnippet({...release,coordinate:{...release.coordinate,version:'latest'}},origin));
  assert.equal(previewPath(release),release.preview.path);assert.equal(previewPath({...release,preview:{path:'https://evil.example/a.svg'}}),null);
  assert.deepEqual(latestLibraries([{...release,version:'1.10.0'},{...release,version:'1.9.0'},release]).map(x=>x.version),['1.10.0']);
});
test('upload mapping preserves edited source and excludes authoritative owner or build scripts',async()=>{
  assert.equal(validateUploadBundle(fixture()).files['src/zero/ui1/Widget.java'],'public class Widget {}');
  assert.throws(()=>validateUploadBundle({...fixture(),owner:'other'}));
  assert.throws(()=>validateUploadBundle({...fixture(),files:{'pom.xml':'run command'}}));
  const file=(path,text)=>({webkitRelativePath:'ui1/'+path,size:text.length,text:async()=>text});
  const bundle=await folderBundle([file('.zero-library.json',JSON.stringify(fixture().descriptor)),file('src/zero/ui1/Widget.java','edited Java')]);assert.equal(bundle.files['src/zero/ui1/Widget.java'],'edited Java');
  await assert.rejects(()=>folderBundle([file('API.md','missing descriptor')]));
});

test('editable ZIP includes trusted runnable files and reconstructs an exact upload bundle',async()=>{
  const {projectResponse}=await import('../lib/hub-project.mjs');
  const {scaffoldBundle}=await import('../../hub/service/scaffold.mjs');
  const {developmentPaths:trustedPaths}=await import('../../hub/development-files.mjs');
  const {developmentPaths}=await import('../lib/hub-client.mjs');
  const {unzipSync,strFromU8}=await import('fflate');
  assert.deepEqual(developmentPaths,trustedPaths);
  const bundle=scaffoldBundle({libraryId:'ui1',className:'Widget',title:'My widget'});
  const request=new Request(origin+'/api/hub/project',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(bundle)});
  const response=await projectResponse(request);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');
  const zip=new Uint8Array(await response.arrayBuffer());const entries=unzipSync(zip);
  assert.match(strFromU8(entries['pom.xml']),/<sourceDirectory>src<\/sourceDirectory>/);
  assert.match(strFromU8(entries['src/Main.java']),/import zero.ui1.Widget;/);
  const {readFile}=await import('node:fs/promises');
  for(const name of ['mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties']){
    const canonical=await readFile(new URL('../../student-template/'+name,import.meta.url));
    assert.deepEqual(Buffer.from(entries[name]),canonical,`${name} preserves exact canonical bytes`);
  }
  const files=Object.entries(entries).map(([path,bytes])=>({webkitRelativePath:'project/'+path,size:bytes.length,text:async()=>strFromU8(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));
  assert.deepEqual(await folderBundle(files),bundle);
  // UNIX executable mode is retained on the wrapper's central-directory record.
  let offset=0,executable=false;
  while(offset+46<zip.length){if(new DataView(zip.buffer).getUint32(offset,true)!==0x02014b50){offset++;continue;}const view=new DataView(zip.buffer);const length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);const name=new TextDecoder().decode(zip.subarray(offset+46,offset+46+length));if(name==='mvnw')executable=(view.getUint32(offset+38,true)>>>16&0o111)===0o111;offset+=46+length+extra+comment;}
  assert.equal(executable,true);
  const bad=await projectResponse(new Request(origin+'/api/hub/project',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...bundle,descriptor:{...bundle.descriptor,components:[{...bundle.descriptor.components[0],className:'Widget;evil'}]}})}));assert.equal(bad.status,400);
});

test('failed, queued and unchecked submissions never get a listed-success result',()=>{
  const listed={...release,status:'automatically-checked'};
  for(const status of ['failed','queued','checking','checked'])assert.equal(publishedSubmission({status,release:listed}),null);
  assert.equal(publishedSubmission({status:'published'}),null);
  assert.equal(publishedSubmission({status:'published',release:{...listed,status:'experimental'}}),null);
  assert.equal(publishedSubmission({status:'published',release:listed}),listed);
});

test('project ZIP checks canonical Origin against direct Host despite Next URL normalization',async()=>{
  const {projectResponse}=await import('../lib/hub-project.mjs');
  const {scaffoldBundle}=await import('../../hub/service/scaffold.mjs');
  const bundle=scaffoldBundle({libraryId:'ui1',className:'Widget',title:'My widget'});
  const request=(url,headers)=>new Request(url+'/api/hub/project',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(bundle)});
  for(const [url,host,source]of [
    ['http://localhost:3177','127.0.0.1:3177','http://127.0.0.1:3177'],
    ['https://internal.example','zero.example','https://zero.example'],
  ]){
    const response=await projectResponse(request(url,{Host:host,Origin:source}));
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');
  }
  for(const headers of [
    {Host:'127.0.0.1:3177',Origin:'https://evil.example'},
    {Host:'127.0.0.1:3177',Origin:'http://localhost:3177'},
    {Host:'127.0.0.1:3177',Origin:'https://127.0.0.1:3177'},
    {Host:'127.0.0.1:3177',Origin:'http://127.0.0.1:3177/path'},
    {Host:'127.0.0.1:3177',Origin:'null'},
    {Host:'127.0.0.1:3177'},
    {Host:'127.0.0.1:3177,evil.example',Origin:'http://127.0.0.1:3177'},
    {Host:'user@127.0.0.1:3177',Origin:'http://127.0.0.1:3177'},
    {Host:'127.0.0.1:3177/path',Origin:'http://127.0.0.1:3177'},
    {Host:'127.0.0.1:3177',Origin:'http://evil.example','X-Forwarded-Host':'evil.example',Forwarded:'host=evil.example'},
  ])assert.equal((await projectResponse(request('http://localhost:3177',headers))).status,403);
});


test('normal local sign-in and OAuth callback redirect to frontend and retain session cookie',async()=>{
  for(const path of [['auth','start'],['auth','callback']]) {
    const request=new Request(origin+'/api/hub/'+path.join('/')+(path[1]==='callback'?'?code=code&state=state':''));
    const response=await proxyHub(request,path,{...options,fetch:async()=>new Response(null,{status:302,headers:{Location:'/hub/prepare','Set-Cookie':'zero_hub_session=signed; Path=/api/hub; HttpOnly; SameSite=Lax'}})});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/hub/prepare');assert.match(response.headers.get('set-cookie'),/zero_hub_session=signed/);
  }
  for(const location of ['https://evil.example/hub/prepare','/hub/prepare?next=https://evil.example','/community','/community/prepare','/other']) {
    const response=await proxyHub(new Request(origin+'/api/hub/auth/start'),['auth','start'],{...options,fetch:async()=>new Response(null,{status:302,headers:{Location:location}})});assert.equal(response.status,502);
  }
});
test('Next normalized request URL keeps sign-in on the browser cookie host',async()=>{
  const browserOrigin='http://127.0.0.1:3177';
  // Actual Next dev requests use localhost in Request.url despite this Host.
  const request=new Request('http://localhost:3177/api/hub/auth/start',{headers:{Host:'127.0.0.1:3177'}});
  const response=await proxyHub(request,['auth','start'],{...options,fetch:async()=>new Response(null,{status:302,headers:{Location:'/hub/prepare','Set-Cookie':'zero_hub_session=signed; Path=/api/hub; HttpOnly; SameSite=Lax'}})});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'/hub/prepare');
  assert.equal(new URL(response.headers.get('location'),browserOrigin).origin,browserOrigin);
  assert.match(response.headers.get('set-cookie'),/^zero_hub_session=signed; Path=\/api\/hub; HttpOnly/);
});
test('exact inspection preserves old API/check/preview metadata and never substitutes latest',()=>{
  const old={...release,status:'automatically-checked',version:'1.0.0',components:[{className:'OldHud',api:['void oldMethod()']}],checks:[{detail:'Old test'}],preview:{path:'/api/hub/previews/ui1/1.0.0.png'}};
  const recent={...old,version:'1.0.1',components:[{className:'NewHud',api:['void newMethod()']}],checks:[{detail:'New test'}],preview:{path:'/api/hub/previews/ui1/1.0.1.png'}};
  assert.deepEqual(selectedLibraries([old,recent],{library:'ui1',version:'1.0.0'}),[old]);
  assert.deepEqual(selectedLibraries([old,recent]),[recent]);
  assert.deepEqual(selectedLibraries([old,recent],{library:'ui1',version:'9.9.9'}),[]);
});

 test('uploads require an explicit enabled capability; missing or malformed capability stays closed', async()=>{
  const {uploadsAvailable}=await import('../lib/hub-client.mjs');
  for(const value of [null,{}, {capabilities:{}}, {capabilities:{uploads:false}}, {capabilities:{uploads:'true'}}]) assert.equal(uploadsAvailable(value),false);
  assert.equal(uploadsAvailable({capabilities:{uploads:true}}),true);
 });
