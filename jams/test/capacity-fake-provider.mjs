// In-memory GitHub-shaped test provider; never contacts a network.
import {createHash} from 'node:crypto';
const EMPTY='4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const hash=(type,bytes)=>createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
export function fakeCapacityProvider(){
  const blobs=new Map(),trees=new Map([[EMPTY,[]]]),commits=new Map(),refs=new Map(),calls=[];let serial=0;
  function treeFor(files){
    const root=new Map();
    for(const [path,sha] of files){let node=root;const parts=path.split('/');for(const part of parts.slice(0,-1)){if(!node.has(part))node.set(part,new Map());node=node.get(part);}node.set(parts.at(-1),sha);}
    function build(node){
      const entries=[...node].sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>value instanceof Map?{path,mode:'040000',type:'tree',sha:build(value)}:{path,mode:'100644',type:'blob',sha:value,size:blobs.get(value).length});
      const sha=entries.length?hash('tree',Buffer.from(JSON.stringify(entries))):EMPTY;trees.set(sha,entries);return sha;
    }
    return build(root);
  }
  function flatten(sha,prefix=''){const files=new Map();for(const e of trees.get(sha)||[]){const name=prefix+e.path;if(e.type==='tree')for(const [p,s]of flatten(e.sha,name+'/'))files.set(p,s);else files.set(name,e.sha);}return files;}
  function commit(tree,parents){const sha=hash('commit',Buffer.from(JSON.stringify({tree,parents,serial:++serial})));commits.set(sha,{tree,parents});return sha;}
  function commitResult(sha){const c=commits.get(sha);return {sha,tree:{sha:c.tree},parents:c.parents.map(sha=>({sha}))};}
  const f={calls,refs,before:null};
  f.filesAtHead=branch=>{
    const head=refs.get(branch),commitData=commits.get(head);
    if(!commitData)throw new Error('Fake branch is unavailable.');
    return new Map([...flatten(commitData.tree)].map(([path,sha])=>[path,Buffer.from(blobs.get(sha))]));
  };
  f.transport=async(url,init={})=>{
    const path=url.replace('https://api.github.com/repos/codepetca/zero/git/',''),method=init.method||'GET',data=init.body?JSON.parse(init.body):null;
    const call={path,method,data};calls.push(call);
    const override=await f.before?.(call);if(override)return override;
    if(method==='GET'&&path.startsWith('ref/heads/')){const branch=path.slice('ref/heads/'.length),sha=refs.get(branch);return sha?json({ref:`refs/heads/${branch}`,object:{type:'commit',sha}}):json({},404);}
    if(method==='POST'&&path==='trees'){
      if(!data.base_tree&&!data.tree.length)return json({},422);
      if(data.base_tree&&!trees.has(data.base_tree))return json({},422);
      const files=data.base_tree?flatten(data.base_tree):new Map();for(const e of data.tree){if(e.mode!=='100644'||e.type!=='blob'||!blobs.has(e.sha))return json({},422);for(const path of files.keys())if(path===e.path||path.startsWith(e.path+'/'))files.delete(path);files.set(e.path,e.sha);}return json({sha:treeFor(files)},201);
    }
    if(method==='POST'&&path==='blobs'){const bytes=Buffer.from(data.content,'base64'),sha=hash('blob',bytes);blobs.set(sha,bytes);return json({sha},201);}
    if(method==='POST'&&path==='commits'){if(!trees.has(data.tree)||data.parents.some(x=>!commits.has(x)))return json({},422);return json(commitResult(commit(data.tree,data.parents)),201);}
    if(method==='POST'&&path==='refs'){const branch=data.ref.slice('refs/heads/'.length);if(refs.has(branch)||!commits.has(data.sha))return json({},422);refs.set(branch,data.sha);return json({ref:data.ref,object:{type:'commit',sha:data.sha}},201);}
    if(method==='PATCH'&&path.startsWith('refs/heads/')){const branch=path.slice('refs/heads/'.length),prior=refs.get(branch),next=commits.get(data.sha);if(!next||next.parents[0]!==prior)return json({},422);refs.set(branch,data.sha);return json({ref:`refs/heads/${branch}`,object:{type:'commit',sha:data.sha}});}
    const [kind,sha]=path.split('/');
    if(method==='GET'&&kind==='commits'&&commits.has(sha))return json(commitResult(sha));
    if(method==='GET'&&kind==='trees'&&trees.has(sha))return json({sha,truncated:false,tree:trees.get(sha)});
    if(method==='GET'&&kind==='blobs'&&blobs.has(sha)){const bytes=blobs.get(sha);return json({sha,size:bytes.length,encoding:'base64',content:bytes.toString('base64')});}
    throw new Error(`Unexpected fake provider route ${method} ${path}`);
  };
  return f;
}
