'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createGitHubReader}=require('../src/sharing/github');
const repo={id:12345,private:false,visibility:'public',owner:{id:7,login:'student',type:'User'},name:'game',html_url:'https://github.com/student/game'};
const request={schema:1,kind:'library',slug:'health',version:'0.1.0',repository:{id:'12345',ownerId:'7',owner:'student',name:'game',url:repo.html_url},requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:'libraries/health',descriptor:{schema:1,kind:'library',slug:'health',version:'0.1.0',title:'Health',description:'A display',license:'MIT',libraryKind:'helper'},policyRevision:'b'.repeat(40)};
function response(value){return Response.json(value);}
test('fixed API origin and observed owner metadata replace pasted claims',async()=>{const calls=[];const reader=createGitHubReader({token:'test-credential',fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('/issues/1'))return response({number:1,state:'open',body:`Zero publication request\n\n\`\`\`json\n${JSON.stringify(request)}\n\`\`\``,user:{id:7,login:'student',type:'User'}});return response(repo);}});const result=await reader.publicationIssue(1);assert.equal(result.request.repository.id,'12345');assert.equal(result.repositoryMetadata.visibility,'public');assert.ok(calls.every(call=>(call.url.startsWith('https://api.github.com/repos/')||call.url==='https://api.github.com/repositories/12345')));assert.ok(calls.every(call=>call.options.redirect==='error'));});
test('a forged requester or transferred/private repository is rejected',async()=>{const forged={...request,requester:{githubId:'8',login:'other'}};const reader=createGitHubReader({fetcher:async()=>response({number:1,state:'open',body:`\`\`\`json\n${JSON.stringify(forged)}\n\`\`\``,user:{id:7,login:'student',type:'User'}})});await assert.rejects(reader.publicationIssue(1),/issue author/);for(const changed of [{...repo,private:true},{...repo,owner:{...repo.owner,type:'Organization'}}])await assert.rejects(createGitHubReader({fetcher:async()=>response(changed)}).repository('student/game'),/personal account/);});
test('source is bound to exact commit, tree, blob sizes/hashes and selected folder',async()=>{const content=Buffer.from('package zero.contrib.r12345.health; public class Health {}');const blobSha=createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');const treeSha='c'.repeat(40);const reader=createGitHubReader({fetcher:async url=>{if((url.endsWith('/student/game')||url.endsWith('/repositories/12345')))return response(repo);if(url.includes('/git/commits/'))return response({sha:request.commit,tree:{sha:treeSha}});if(url.includes('/git/trees/'))return response({truncated:false,tree:[{path:'libraries/health/src/main/java/zero/contrib/r12345/health/Health.java',mode:'100644',type:'blob',size:content.length,sha:blobSha},{path:'src/Main.java',mode:'100644',type:'blob',size:3,sha:'d'.repeat(40)}]});return response({sha:blobSha,encoding:'base64',size:content.length,content:content.toString('base64')});}});const snapshot=await reader.source(request);assert.equal(snapshot.files.length,1);assert.equal(snapshot.files[0].path,'src/main/java/zero/contrib/r12345/health/Health.java');assert.deepEqual(snapshot.files[0].bytes,content);assert.match(snapshot.sourceDigest,/^[a-f0-9]{64}$/);});
test('GitHub symlinks and truncated trees fail before any file read',async()=>{for(const tree of [{truncated:true,tree:[]},{truncated:false,tree:[{path:'libraries/health/link',mode:'120000',type:'blob',size:2,sha:'d'.repeat(40)}]}]){const reader=createGitHubReader({fetcher:async url=>(url.endsWith('/student/game')||url.endsWith('/repositories/12345'))?response(repo):url.includes('/git/commits/')?response({sha:request.commit,tree:{sha:'c'.repeat(40)}}):response(tree)});await assert.rejects(reader.source(request));}});
test('malformed or oversized response does not expose authentication material',async()=>{const reader=createGitHubReader({token:'never-print-me',fetcher:async()=>new Response('denied',{status:403})});await assert.rejects(reader.repository('student/game'),error=>!error.message.includes('never-print-me')&&/limit|restriction/.test(error.message));});
test('native authentication resolves numeric identity from GitHub rather than editor account labels',async()=>{await assert.rejects(createGitHubReader().authenticatedUser(),/Sign in/);const reader=createGitHubReader({token:'transient',fetcher:async url=>{assert.equal(url,'https://api.github.com/user');return response({id:7,login:'student',type:'User'});}});assert.deepEqual(await reader.authenticatedUser(),{githubId:'7',login:'student'});});
test('frozen source survives account/repository rename through numeric repository metadata',async()=>{
  const renamed={...repo,name:'new-game',html_url:'https://github.com/renamed/new-game',owner:{...repo.owner,login:'renamed'}};
  const bytes=Buffer.from('package zero.contrib.r12345.health; public class Health {}'),sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),calls=[];
  const reader=createGitHubReader({fetcher:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');if(url.endsWith('/repositories/12345'))return response(renamed);assert.ok(url.includes('/repos/renamed/new-game/'));if(url.includes('/git/commits/'))return response({sha:request.commit,tree:{sha:'c'.repeat(40)}});if(url.includes('/git/trees/'))return response({truncated:false,tree:[{path:'libraries/health/src/main/java/zero/contrib/r12345/health/Health.java',mode:'100644',type:'blob',size:bytes.length,sha}]});return response({sha,encoding:'base64',size:bytes.length,content:bytes.toString('base64')});}});
  const source=await reader.source(request);assert.equal(source.repositoryMetadata.id,'12345');assert.equal(source.repositoryMetadata.ownerId,'7');assert.equal(source.repositoryMetadata.url,renamed.html_url);assert.deepEqual(source.files[0].bytes,bytes);assert.ok(!calls.some(url=>url.includes('/repos/student/game')));
  await assert.rejects(createGitHubReader({fetcher:async()=>response({...renamed,owner:{...renamed.owner,id:8}})}).source(request),/ownership changed/);
});
test('fresh issue-state authority ignores edited form bodies and binds the observed numeric author',async()=>{
  const reader=createGitHubReader({fetcher:async()=>response({number:1,state:'closed',body:'invalid edited form',user:{id:7,login:'renamed',type:'User'}})});
  assert.deepEqual(await reader.publicationIssueState(1),{issueId:'1',issueState:'closed',authenticatedActor:{githubId:'7',login:'renamed'}});
  await assert.rejects(reader.publicationIssue(1),/JSON request/);
});

function webRequest(){return {...request,kind:'game',slug:'space-game',folder:'.',descriptor:{schema:1,kind:'game',slug:'space-game',version:'0.1.0',title:'Space',description:'Move a ship',license:'MIT',controls:'Arrow keys'},web:{provider:'github-pages',url:'https://student.github.io/game/',commit:request.commit,runId:42}};}
function webReader({changedRepo,changedRun,changedPages,marker,publicResponse,publicError,apiError}={}) {
  const checked=webRequest(),calls=[];
  const run={id:42,head_sha:checked.commit,path:'.github/workflows/zero-web.yml',event:'workflow_dispatch',head_branch:'main',status:'completed',conclusion:'success',repository:{id:repo.id,owner:{id:repo.owner.id}}};
  const pages={build_type:'workflow',public:true,html_url:checked.web.url};
  const reader=createGitHubReader({token:'PRIVATE_TEST_TOKEN',fetcher:async(url,options)=>{
    calls.push({url,options});assert.ok(url.startsWith('https://api.github.com/'));assert.equal(options.headers.authorization,'Bearer PRIVATE_TEST_TOKEN');assert.equal(options.redirect,'error');
    if(apiError)throw Error('Bearer PRIVATE_TEST_TOKEN');
    if(url.endsWith('/repositories/12345'))return response({...repo,...changedRepo});
    if(url.endsWith('/actions/runs/42'))return response({...run,...changedRun});
    if(url.endsWith('/pages'))return response({...pages,...changedPages});
    assert.fail('Unexpected API '+url);
  },publicFetcher:async(url,options)=>{
    calls.push({url,options});assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    if(publicError)throw Error('private response body never shown');
    return publicResponse||new Response(marker??checked.commit+'\n42\n');
  }});
  return {checked,calls,reader};
}
test('web receipt is independently bound to numeric ownership, exact successful run and public Pages marker without credentials',async()=>{
  const f=webReader();assert.deepEqual(await f.reader.verifyWebPublication(f.checked),f.checked.web);
  assert.equal(f.calls.filter(c=>c.url.startsWith('https://student.github.io/')).length,1);
  const custom=webReader({changedPages:{html_url:'https://play.example.org/',cname:'play.example.org'}});custom.checked.web.url='https://play.example.org/';
  assert.equal((await custom.reader.verifyWebPublication(custom.checked)).url,'https://play.example.org/');
});
test('forged or stale web provenance fails before acceptance and arbitrary Pages destinations never receive tokens',async()=>{
  const cases=[{changedRepo:{id:88}},{changedRepo:{private:true}},{changedRepo:{owner:{...repo.owner,id:8}}},{changedRun:{id:43}},{changedRun:{head_sha:'c'.repeat(40)}},{changedRun:{path:'.github/workflows/other.yml'}},{changedRun:{event:'push'}},{changedRun:{head_branch:'feature'}},{changedRun:{status:'in_progress'}},{changedRun:{conclusion:'failure'}},{changedRun:{repository:{id:88,owner:{id:7}}}},{changedRun:{repository:{id:repo.id,owner:{id:8}}}},{changedPages:{html_url:'https://attacker.github.io/game/'}},{changedPages:{html_url:'https://evil.example/',cname:'other.example'}},{changedPages:{public:false}},{changedPages:{build_type:'legacy'}},{marker:'b'.repeat(40)+'\n42\n'},{marker:request.commit+'\n41\n'},{marker:'x'.repeat(101)},{publicResponse:new Response('missing',{status:404})}];
  for(const options of cases){const f=webReader(options);await assert.rejects(f.reader.verifyWebPublication(f.checked),error=>!error.message.includes('PRIVATE_TEST_TOKEN'));assert.ok(f.calls.filter(c=>!c.url.startsWith('https://api.github.com/')).every(c=>c.options.headers===undefined));}
  for(const url of ['https://127.0.0.1/','https://game.local/']){const f=webReader({changedPages:{html_url:url,cname:new URL(url).hostname}});f.checked.web.url=url;await assert.rejects(f.reader.verifyWebPublication(f.checked));assert.equal(f.calls.length,0);}
});
test('web transport errors remain infrastructure retries and public response redirects are not trusted',async()=>{
  for(const options of [{apiError:true},{publicError:true}]){const f=webReader(options);await assert.rejects(f.reader.verifyWebPublication(f.checked),error=>!error.kind&&!error.message.includes('PRIVATE_TEST_TOKEN'));}
  const redirected=new Response(request.commit+'\n42\n');Object.defineProperty(redirected,'redirected',{value:true});const f=webReader({publicResponse:redirected});await assert.rejects(f.reader.verifyWebPublication(f.checked),error=>error.kind==='source-failure');
});
