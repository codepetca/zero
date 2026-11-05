import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createGitHubJamStore} from '../github-store.mjs';
import {createGitHubSourceVerifier} from '../github-source.mjs';
import {createJamService} from '../service.mjs';
import {creator,maintainer,participant,COMMIT,NEXT_COMMIT,manifest} from './fixtures.mjs';

export const REGISTRY_BRANCH='zero-jams-pilot-registry';
const root='/repos/codepetca/zero';
const token='http-fixture-only-token';
const blobSha=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export function deferred() {
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
export function rendezvous(count=2) {
  const ready=deferred();let arrivals=0;
  return async()=>{if(++arrivals===count)ready.resolve();await ready.promise;};
}

// A loopback GitHub Contents/Git API contract, not an alternate production
// backend. Every tested request uses the real adapters/transport and Node fetch.
// Fixture credentials and actors never touch GitHub or a hosted Zero deployment.
export async function githubHttpFixture(t,{limits={}}={}) {
  const f={records:new Map(),commits:[],requests:[],sourceUnavailable:false,
    beforeRequest:null,beforePut:null,afterCommit:null,time:Date.parse('2030-01-02T12:00:00Z')};
  const repositories=new Map([
    ['creator/jam',{id:101,owner:creator,manifest:true}],
    ['student/project',{id:202,owner:participant}],
    ['other/project',{id:203,owner:{id:'44',login:'other'}}],
  ]);
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://fixture.invalid'),path=url.pathname;
      assert.equal(req.headers.authorization,`Bearer ${token}`);
      let body;
      if(req.method==='PUT') {
        const chunks=[];for await(const bytes of req)chunks.push(bytes);
        body=JSON.parse(Buffer.concat(chunks));
      }
      const call={method:req.method,path,query:url.search,body};f.requests.push(call);
      if(await f.beforeRequest?.({req,res,call,json}))return;
      if(path===`${root}/branches/${REGISTRY_BRANCH}`)return json(res,200,{name:REGISTRY_BRANCH,commit:{sha:COMMIT}});
      if(path===`${root}/contents/jams`) {
        assert.equal(url.searchParams.get('ref'),REGISTRY_BRANCH);
        const files=[...f.records].map(([id,bytes])=>({name:`${id}.json`,path:`jams/${id}.json`,type:'file',sha:blobSha(bytes)}));
        return json(res,files.length?200:404,files.length?files:{message:'Not Found'});
      }
      const record=new RegExp(`^${root}/contents/jams/(jam-[1-9][0-9]*)\\.json$`).exec(path);
      if(record) {
        const id=record[1];
        if(req.method==='GET') {
          assert.equal(url.searchParams.get('ref'),REGISTRY_BRANCH);
          const bytes=f.records.get(id);
          return bytes?json(res,200,{path:`jams/${id}.json`,type:'file',sha:blobSha(bytes),size:bytes.length,encoding:'base64',content:bytes.toString('base64')}):json(res,404,{message:'Not Found'});
        }
        assert.equal(req.method,'PUT');assert.equal(body.branch,REGISTRY_BRANCH);
        const bytes=Buffer.from(body.content,'base64'),state=JSON.parse(bytes);
        const operation=Object.values(state.operations).at(-1);
        const context={req,res,call,json,id,state,operationId:operation.result.operationId};
        await f.beforePut?.(context);
        // Compare after any barrier: simultaneous requests carry the same old
        // blob, and only one may replace it. A conflict does not mutate state.
        const current=f.records.get(id),expected=current?blobSha(current):null;
        if((body.sha||null)!==expected)return json(res,current?409:422,{message:'stale blob'});
        f.records.set(id,bytes);f.commits.push({id,sha:blobSha(bytes),operationId:context.operationId});
        if(await f.afterCommit?.(context))return;
        return json(res,current?200:201,{content:{sha:blobSha(bytes)}});
      }
      for(const [name,repo] of repositories) {
        const source=`/repos/${name}`;
        if(!path.startsWith(source))continue;
        if(f.sourceUnavailable)return json(res,503,{message:'fixture provider detail must not escape'});
        if(path===source)return json(res,200,{id:repo.id,owner:{id:Number(repo.owner.id),type:'User'},full_name:name,private:false,visibility:'public'});
        const commit=/\/git\/commits\/([a-f0-9]{40})$/.exec(path);
        if(commit&&[COMMIT,NEXT_COMMIT].includes(commit[1]))return json(res,200,{sha:commit[1]});
        if(repo.manifest&&path===`${source}/contents/zero-jam.json`) {
          const value=manifest(url.searchParams.get('ref')===NEXT_COMMIT?{title:'Updated jam',rules:'Updated rules'}:{});
          const bytes=Buffer.from(JSON.stringify(value));
          return json(res,200,{path:'zero-jam.json',type:'file',sha:blobSha(bytes),size:bytes.length,encoding:'base64',content:bytes.toString('base64')});
        }
      }
      throw Error(`Unexpected fixture request: ${req.method} ${path}`);
    } catch(error) {
      f.handlerError??=error;
      if(!res.headersSent)json(res,500,{message:'fixture assertion failed'});else res.destroy();
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    if(f.handlerError)throw f.handlerError;
  });
  const origin=`http://127.0.0.1:${server.address().port}`;
  f.fetchImpl=async(input,options)=>{
    const url=new URL(input);
    assert.equal(url.origin,'https://api.github.com');
    assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    const response=await fetch(`${origin}${url.pathname}${url.search}`,options);
    // Preserve the API-facing URL when translating only the network destination
    // to loopback; production transport still enforces its destination guard.
    Object.defineProperty(response,'url',{value:url.href});
    return response;
  };
  f.makeService=({timeoutMs=2000}={})=>createJamService({
    store:createGitHubJamStore({token,fetchImpl:f.fetchImpl,registryBranch:REGISTRY_BRANCH,timeoutMs,maxEvents:2}),
    verifySource:createGitHubSourceVerifier({token,fetchImpl:f.fetchImpl,timeoutMs}),
    maintainerIds:[maintainer.id],now:()=>f.time,limits:{events:2,participants:5,operations:200,safetyOperations:7,proposals:10,entryHistory:5,...limits},
  });
  f.service=f.makeService();
  f.state=(id='jam-101')=>JSON.parse(f.records.get(id));
  f.puts=()=>f.requests.filter(r=>r.method==='PUT');
  f.sourceCalls=()=>f.requests.filter(r=>!r.path.startsWith(root)).length;
  f.approve=async()=>{
    const proposal=await f.service.propose({actor:creator,operationId:'propose-0001',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT});
    await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-0001',action:'approve',revision:proposal.revision});
    return proposal.revision;
  };
  return f;
}
