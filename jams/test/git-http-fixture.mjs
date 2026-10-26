import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createAtomicGitHubJamStore} from '../git-store.mjs';
import {createGitHubJamStore} from '../github-store.mjs';

export const ATOMIC_REGISTRY_BRANCH='zero-jams-pilot-registry';
const ROOT='/repos/codepetca/zero',TOKEN='atomic-http-fixture-only-token';
const hash=(type,bytes)=>createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');

/** Real loopback HTTP around Git blobs/trees/commits/ref fast-forward semantics.
 * Object staging is separate from authoritative ref publication. */
export async function atomicGitHttpFixture(t,{maxEvents=100,timeoutMs=2000}={}){
  const f={requests:[],commits:[],beforeRequest:null,beforeRef:null,afterRef:null,beforeContents:null};
  const blobs=new Map(),trees=new Map(),commits=new Map();let serial=0;
  const addBlob=bytes=>{const sha=hash('blob',bytes);blobs.set(sha,Buffer.from(bytes));return sha;};
  function addTree(files){
    const build=(node)=>{
      const entries=[];
      for(const [name,value]of [...node].sort(([a],[b])=>a.localeCompare(b))){
        const subtree=value instanceof Map;
        entries.push({path:name,mode:subtree?'040000':'100644',type:subtree?'tree':'blob',sha:subtree?build(value):value,...(!subtree?{size:blobs.get(value).length}:{})});
      }
      // SHA computation is real Git tree encoding, including the trailing slash
      // sort rule for trees (all fixture paths are ordinary ASCII).
      entries.sort((a,b)=>Buffer.compare(Buffer.from(a.path+(a.type==='tree'?'/':'')),Buffer.from(b.path+(b.type==='tree'?'/':''))));
      const bytes=Buffer.concat(entries.map(entry=>Buffer.concat([Buffer.from(`${entry.type==='tree'?'40000':entry.mode} ${entry.path}\0`),Buffer.from(entry.sha,'hex')])));
      const sha=hash('tree',bytes);trees.set(sha,entries);return sha;
    };
    const root=new Map();
    for(const [path,sha]of files){let node=root;const parts=path.split('/');for(const part of parts.slice(0,-1)){if(!node.has(part))node.set(part,new Map());assert.ok(node.get(part) instanceof Map);node=node.get(part);}node.set(parts.at(-1),sha);}
    return build(root);
  }
  function flatten(treeSha,prefix=''){
    const files=new Map();for(const entry of trees.get(treeSha)||[]){const path=prefix+entry.path;if(entry.type==='tree')for(const [name,sha]of flatten(entry.sha,path+'/'))files.set(name,sha);else files.set(path,entry.sha);}return files;
  }
  function addCommit(tree,parents,message){
    const data={tree,parents,message,serial:++serial},sha=hash('commit',Buffer.from(JSON.stringify(data)));
    commits.set(sha,data);return sha;
  }
  const initial=new Map([['README.md',addBlob(Buffer.from('preserve this registry readme\n'))],['website/vercel.json',addBlob(Buffer.from('{"cleanUrls":true}\n'))]]);
  f.head=addCommit(addTree(initial),[],'fixture initial');
  const filesAt=()=>flatten(commits.get(f.head).tree);
  Object.defineProperty(f,'files',{get:()=>new Map([...filesAt()].map(([path,sha])=>[path,Buffer.from(blobs.get(sha))]))});
  Object.defineProperty(f,'records',{get:()=>new Map([...f.files].flatMap(([path,bytes])=>{const match=/^(?:zero-jams-v2\/events|jams)\/(jam-[1-9][0-9]*)\.json$/.exec(path);return match?[[match[1],bytes]]:[];}))});
  f.state=(id='jam-101')=>JSON.parse(f.records.get(id));
  f.seed=(id,state,{legacy=true}={})=>{
    const files=filesAt();files.set(`${legacy?'jams':'zero-jams-v2/events'}/${id}.json`,addBlob(Buffer.isBuffer(state)?state:Buffer.from(JSON.stringify(state)+'\n')));
    f.head=addCommit(addTree(files),[f.head],'fixture seed');
  };
  f.replaceFile=(path,bytes)=>{const files=filesAt();for(const old of files.keys())if(old===path||old.startsWith(path+'/')||path.startsWith(old+'/'))files.delete(old);files.set(path,addBlob(Buffer.from(bytes)));f.head=addCommit(addTree(files),[f.head],'fixture replace');};
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const commitJson=sha=>{const value=commits.get(sha);return {sha,tree:{sha:value.tree},parents:value.parents.map(sha=>({sha}))};};
  const refJson=()=>({ref:`refs/heads/${ATOMIC_REGISTRY_BRANCH}`,object:{type:'commit',sha:f.head}});
  function ancestor(older,newer){if(older===newer)return true;return (commits.get(newer)?.parents||[]).some(parent=>ancestor(older,parent));}
  const server=createServer(async(req,res)=>{
    try{
      assert.equal(req.headers.authorization,`Bearer ${TOKEN}`);
      const url=new URL(req.url,'http://fixture.invalid'),path=url.pathname;let body;
      if(['POST','PATCH','PUT'].includes(req.method)){const chunks=[];for await(const bytes of req)chunks.push(bytes);body=JSON.parse(Buffer.concat(chunks));}
      const call={method:req.method,path,query:url.search,body};f.requests.push(call);
      if(await f.beforeRequest?.({req,res,call,json}))return;
      if(req.method==='GET'&&path===`${ROOT}/git/ref/heads/${ATOMIC_REGISTRY_BRANCH}`)return json(res,200,refJson());
      if(req.method==='GET'&&path===`${ROOT}/branches/${ATOMIC_REGISTRY_BRANCH}`)return json(res,200,{name:ATOMIC_REGISTRY_BRANCH,commit:{sha:f.head}});
      const blob=/\/git\/blobs\/([a-f0-9]{40})$/.exec(path);
      if(req.method==='GET'&&blob){const bytes=blobs.get(blob[1]);return bytes?json(res,200,{sha:blob[1],size:bytes.length,encoding:'base64',content:bytes.toString('base64')}):json(res,404,{});}
      if(req.method==='POST'&&path===`${ROOT}/git/blobs`){assert.equal(body.encoding,'base64');return json(res,201,{sha:addBlob(Buffer.from(body.content,'base64'))});}
      const tree=/\/git\/trees\/([a-f0-9]{40})$/.exec(path);
      if(req.method==='GET'&&tree){const value=trees.get(tree[1]);return value?json(res,200,{sha:tree[1],truncated:false,tree:value}):json(res,404,{});}
      if(req.method==='POST'&&path===`${ROOT}/git/trees`){
        assert.ok(trees.has(body.base_tree));const files=flatten(body.base_tree);
        for(const entry of body.tree){assert.equal(entry.mode,'100644');assert.equal(entry.type,'blob');assert.ok(blobs.has(entry.sha));for(const old of [...files.keys()])if(old===entry.path||old.startsWith(entry.path+'/'))files.delete(old);files.set(entry.path,entry.sha);}
        return json(res,201,{sha:addTree(files)});
      }
      const commit=/\/git\/commits\/([a-f0-9]{40})$/.exec(path);
      if(req.method==='GET'&&commit)return commits.has(commit[1])?json(res,200,commitJson(commit[1])):json(res,404,{});
      if(req.method==='POST'&&path===`${ROOT}/git/commits`){assert.ok(trees.has(body.tree));assert.equal(body.parents.length,1);assert.ok(commits.has(body.parents[0]));return json(res,201,commitJson(addCommit(body.tree,body.parents,body.message)));}
      if(req.method==='PATCH'&&path===`${ROOT}/git/refs/heads/${ATOMIC_REGISTRY_BRANCH}`){
        assert.equal(body.force,false);assert.ok(commits.has(body.sha));
        const context={req,res,call,json,next:body.sha,parent:commits.get(body.sha).parents[0]};
        await f.beforeRef?.(context);
        if(!ancestor(f.head,body.sha))return json(res,422,{message:'not a fast forward'});
        const previous=f.head;f.head=body.sha;f.commits.push({sha:f.head,parent:previous,message:commits.get(f.head).message});
        if(await f.afterRef?.(context))return;
        return json(res,200,refJson());
      }
      const contentPath=path.startsWith(`${ROOT}/contents/`)?path.slice(`${ROOT}/contents/`.length):null;
      if(contentPath!==null){
        if(req.method==='GET'){
          assert.equal(url.searchParams.get('ref'),ATOMIC_REGISTRY_BRANCH);const files=filesAt(),sha=files.get(contentPath);
          if(sha){const bytes=blobs.get(sha);return json(res,200,{path:contentPath,name:contentPath.split('/').at(-1),type:'file',sha,size:bytes.length,encoding:'base64',content:bytes.toString('base64')});}
          const items=[...files].filter(([name])=>name.startsWith(contentPath+'/')&&!name.slice(contentPath.length+1).includes('/')).map(([name,sha])=>({name:name.slice(contentPath.length+1),path:name,type:'file',sha}));
          return items.length?json(res,200,items):json(res,404,{});
        }
        assert.equal(req.method,'PUT');assert.equal(body.branch,ATOMIC_REGISTRY_BRANCH);
        const context={req,res,call,json};await f.beforeContents?.(context);
        const files=filesAt(),current=files.get(contentPath)||null;
        for(const path of files.keys())if(contentPath.startsWith(path+'/'))return json(res,422,{message:'parent is a file'});
        if((body.sha||null)!==current)return json(res,current?409:422,{message:'stale blob'});
        const bytes=Buffer.from(body.content,'base64'),sha=addBlob(bytes),previous=f.head;files.set(contentPath,sha);f.head=addCommit(addTree(files),[previous],'legacy Contents write');f.commits.push({sha:f.head,parent:previous,message:'legacy Contents write'});return json(res,current?200:201,{content:{sha}});
      }
      throw Error(`Unexpected fixture request: ${req.method} ${path}`);
    }catch(error){f.handlerError??=error;if(!res.headersSent)json(res,500,{message:'fixture assertion failed'});else res.destroy();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if(f.handlerError)throw f.handlerError;});
  const origin=`http://127.0.0.1:${server.address().port}`;
  f.fetchImpl=async(input,options)=>{const url=new URL(input);assert.equal(url.origin,'https://api.github.com');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');const response=await fetch(`${origin}${url.pathname}${url.search}`,options);Object.defineProperty(response,'url',{value:url.href});return response;};
  f.makeStore=overrides=>createAtomicGitHubJamStore({token:TOKEN,fetchImpl:f.fetchImpl,registryBranch:ATOMIC_REGISTRY_BRANCH,maxEvents,timeoutMs,...overrides});
  f.store=f.makeStore();f.legacyStore=createGitHubJamStore({token:TOKEN,fetchImpl:f.fetchImpl,registryBranch:ATOMIC_REGISTRY_BRANCH,maxEvents,timeoutMs});
  return f;
}
