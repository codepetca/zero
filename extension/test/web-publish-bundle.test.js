'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {pack,decode,extract,hash}=require('../src/web-publish-bundle');
const {main}=require('../src/web-deploy-runner.cjs');
const source='a'.repeat(40);
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-bundle-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const site=path.join(root,'site');await fs.mkdir(site);const files=[];
  for(const [name,text] of [['index.html','<html><script src="app.js"></script></html>'],['app.js','throw new Error("must never execute during deployment")'],['images/bird.png','pixels'],['licenses/source-artifacts.json','{}']]){await fs.mkdir(path.dirname(path.join(site,name)),{recursive:true});await fs.writeFile(path.join(site,name),text);files.push({path:name,bytes:Buffer.byteLength(text),sha256:hash(Buffer.from(text))});}
  const result={sitePath:site,sourceHash:'b'.repeat(64),profileHash:'c'.repeat(64),manifestPath:path.join(root,'manifest.json')};await fs.writeFile(result.manifestPath,JSON.stringify({files}));
  const validateExport=async()=>{const siteFiles=[];for(const file of files)siteFiles.push({path:file.path,bytes:await fs.readFile(path.join(site,file.path))});return {...result,manifest:{files},siteFiles};};
  let count=0;const bundle=await pack({projectRoot:root,result,sourceSha:source,validateExport:async()=>{count++;return validateExport();}});assert.equal(count,2);
  return {root,result,bundle,validateExport};
}
test('bundle copies every validated app byte and extracts data without executing student JavaScript',async t=>{
  const {root,result,bundle}=await fixture(t);const site=path.join(root,'extracted');await extract(bundle.bytes,site,{sourceSha:source,digest:bundle.digest});
  const {files}=decode(bundle.bytes,{sourceSha:source,digest:bundle.digest});for(const file of files)assert.deepEqual(await fs.readFile(path.join(site,file.path)),await fs.readFile(path.join(result.sitePath,file.path)));
});
test('changed output, input validation failure, archive digest and source commit fail closed',async t=>{
  const {root,result,bundle,validateExport}=await fixture(t);await fs.writeFile(path.join(result.sitePath,'app.js'),'edited');
  await assert.rejects(pack({projectRoot:root,result,sourceSha:source,validateExport}),/output changed/);
  await assert.rejects(pack({projectRoot:root,result,sourceSha:source,validateExport:async()=>{throw Error('source drift');}}),/source drift/);
  assert.throws(()=>decode(bundle.bytes,{sourceSha:'c'.repeat(40),digest:bundle.digest}));assert.throws(()=>decode(bundle.bytes,{sourceSha:source,digest:'0'.repeat(64)}));assert.throws(()=>decode(bundle.bytes,{sourceSha:source,digest:bundle.digest,profileHash:'d'.repeat(64)}));
});
test('data archive refuses traversal, links/unknown fields, collisions, duplicate files and incomplete sites',async t=>{
  const {bundle}=await fixture(t);const original=JSON.parse(zlib.gunzipSync(bundle.bytes));
  for(const mutate of [b=>b.files[0].path='../escape',b=>b.files[0].path='/absolute',b=>b.files[0].path='C:\\escape',b=>b.files[0].link='index.html',b=>b.files.push(b.files[0]),b=>b.files[0].path='images',b=>b.files.shift(),b=>b.files[0].data='!',b=>b.files[0].bytes++]){
    const b=structuredClone(original);mutate(b);const bytes=zlib.gzipSync(Buffer.from(JSON.stringify(b)));assert.throws(()=>decode(bytes,{sourceSha:source,digest:hash(bytes)}));
  }
});
async function runnerFixture(t,{redirect=false}={}) {
  const f=await fixture(t),calls=[];
  const env={GITHUB_REPOSITORY:'student/game',ZERO_RELEASE_ID:'7',ZERO_STAGE_TAG:'zero-web-stage-'+'d'.repeat(32),GITHUB_ACTOR_ID:'1',ZERO_ASSET_ID:'8',ZERO_PROFILE_SHA256:'c'.repeat(64),ZERO_BUNDLE_SHA256:f.bundle.digest,ZERO_SOURCE_SHA:source,GITHUB_SHA:source,GITHUB_TOKEN:'test-token',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'42',RUNNER_TEMP:f.root,GITHUB_OUTPUT:path.join(f.root,'outputs')};
  const asset={id:8,name:'zero-web-bundle.json.gz',state:'uploaded',digest:'sha256:'+f.bundle.digest,size:f.bundle.bytes.length};
  let info={id:7,author:{id:1},draft:true,tag_name:'zero-web-stage-'+'d'.repeat(32),target_commitish:source,assets:[asset]};
  const request=async(url,options)=>{calls.push({url,options});if(url==='https://release-assets.githubusercontent.com/download'){assert.equal(options.headers,undefined);return new Response(f.bundle.bytes);}assert.equal(options.headers.Authorization,'Bearer test-token');if(url.endsWith('/releases/7'))return options.method==='DELETE'?new Response(null,{status:204}):Response.json(info);if(url.endsWith('/releases/assets/8'))return options.headers.Accept==='application/octet-stream'?(redirect?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/download'}}):new Response(f.bundle.bytes)):Response.json(asset);assert.fail(url);};
  return {...f,calls,env,asset,request,set info(value){info=value;}};
}
test('runner retrieves exact asset ID/digest, follows signed GitHub redirect without credentials and writes source/run marker',async t=>{
  const f=await runnerFixture(t,{redirect:true});await main(f.env,f.request);assert.equal(await fs.readFile(path.join(f.root,'zero-web-site/zero-source-sha.txt'),'utf8'),source+'\n42\n');assert.match(await fs.readFile(f.env.GITHUB_OUTPUT,'utf8'),/site=/);
  await main({...f.env,ZERO_CLEANUP:'true'},f.request);assert.ok(f.calls.some(c=>c.options.method==='DELETE'));
});
test('runner refuses altered asset identity/digest and never deletes a public release',async t=>{
  const f=await runnerFixture(t);f.asset.digest='sha256:'+'0'.repeat(64);await assert.rejects(main(f.env,f.request),/does not match/);
  f.info={id:7,draft:false,tag_name:'zero-web-stage-'+'d'.repeat(32),target_commitish:source};await assert.rejects(main({...f.env,ZERO_CLEANUP:'true'},f.request),/not this app/);assert.ok(!f.calls.some(c=>c.options.method==='DELETE'));
});

test('asset redirects never send a GitHub token to an arbitrary host and changed download bytes fail digest validation',async t=>{
  const f=await runnerFixture(t);let calls=0;
  await assert.rejects(main(f.env,async(url,options)=>{calls++;if(url.endsWith('/releases/assets/8')&&options.headers.Accept==='application/octet-stream')return new Response(null,{status:302,headers:{location:'https://attacker.example/steal'}});return f.request(url,options);}),/Unsupported asset/);
  assert.equal(calls,3);
  await assert.rejects(main(f.env,async(url,options)=>url.endsWith('/releases/assets/8')&&options.headers.Accept==='application/octet-stream'?new Response(Buffer.from('altered')):f.request(url,options)),/digest differs/);
});
