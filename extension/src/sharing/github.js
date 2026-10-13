'use strict';
const {createHash}=require('node:crypto');
const contracts=require('./contracts');
const API='https://api.github.com';
const API_VERSION='2026-03-10';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fail(message){throw new Error(message);}
function githubId(value){if(!Number.isSafeInteger(value)||value<1)fail('GitHub returned an invalid numeric identity.');return String(value);}
function safeRepositoryName(value){if(typeof value!=='string'||! /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(value))fail('Use a GitHub owner/repository name.');return value;}
function safeSourcePath(value){
  if(typeof value!=='string'||value.length>500||value.split('/').some(part=>!part||part==='.'||part==='..'||! /^[A-Za-z0-9_. -]+$/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))fail('GitHub source has an unsupported path.');
  return value;
}
function retainedSource(path){
  const parts=path.split('/');
  if(parts.some(part=>['.git','.github','node_modules','target','dist','.verification','.next','.zero'].includes(part)))return false;
  if(parts.some(part=>part.startsWith('.')&&!['.mvn','.vscode','.gitignore'].includes(part)))return false;
  if(/(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?)$/i.test(path))return false;
  return true;
}
async function jsonResponse(response,maximum) {
  if(!response.ok)fail(response.status===403||response.status===429?'GitHub request limit or access restriction; retry later.':`GitHub could not read this resource (HTTP ${response.status}).`);
  if(! /^(application\/json|application\/vnd\.github\+json)\b/i.test(response.headers.get('content-type')||''))fail('GitHub returned an unsupported response.');
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maximum)fail('GitHub response is too large.');
  const reader=response.body?.getReader();if(!reader)fail('GitHub response has no body.');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)fail('GitHub response is too large.');chunks.push(Buffer.from(value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('GitHub returned invalid JSON.');}
}
function createGitHubReader({fetcher=fetch,token,timeoutMs=15000}={}) {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)fail('Invalid GitHub deadline.');
  async function read(path,{maximum=512*1024,signal}={}){
    if((!path.startsWith('/repos/')&&!/^\/repositories\/[1-9][0-9]{0,19}$/.test(path)&&path!=='/user')||/[\r\n#]/.test(path))fail('Unsupported GitHub API path.');
    const headers={accept:'application/vnd.github+json','x-github-api-version':API_VERSION,'user-agent':'zero-sharing'};
    if(token)headers.authorization=`Bearer ${token}`;
    const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
    let response;try{response=await fetcher(API+path,{method:'GET',headers,redirect:'error',signal:combined});}
    catch{fail(combined.aborted?'GitHub source request timed out or was cancelled.':'GitHub source could not be reached.');}
    return jsonResponse(response,maximum);
  }
  async function authenticatedUser({signal}={}){
    if(!token)fail('Sign in to GitHub before sharing.');
    const user=await read('/user',{signal});
    if(user.type!=='User'||typeof user.login!=='string'||! /^[A-Za-z0-9-]+$/.test(user.login))fail('GitHub did not return a personal account.');
    return {githubId:githubId(user.id),login:user.login};
  }
  function repositoryMetadata(data){
    if(data.private!==false||data.visibility!=='public'||data.owner?.type!=='User')fail('Sharing currently supports public repositories in your personal account.');
    const result=contracts.validateRepository({id:githubId(data.id),ownerId:githubId(data.owner.id),owner:data.owner.login,name:data.name,url:data.html_url});
    return {...result,visibility:'public',ownerType:'User'};
  }
  async function repository(name,{signal}={}){
    safeRepositoryName(name);return repositoryMetadata(await read(`/repos/${name}`,{signal}));
  }
  async function repositoryById(id,{signal}={}) {
    if(typeof id!=='string'||! /^[1-9][0-9]{0,19}$/.test(id))fail('Use an exact numeric GitHub repository identity.');
    const result=repositoryMetadata(await read(`/repositories/${id}`,{signal}));
    if(result.id!==id)fail('GitHub returned a different repository identity.');
    return result;
  }
  async function publicationIssue(number,{repository:destination='codepetca/zero',signal}={}){
    safeRepositoryName(destination);if(!Number.isSafeInteger(number)||number<1)fail('Invalid publication request number.');
    const issue=await read(`/repos/${destination}/issues/${number}`,{signal});
    if(issue.pull_request||issue.number!==number||!['open','closed'].includes(issue.state)||typeof issue.body!=='string'||!issue.user||issue.user.type!=='User')fail('Use an ordinary student publication issue.');
    if(Buffer.byteLength(issue.body)>contracts.LIMITS.metadataBytes)fail('Publication request is too large.');
    const blocks=[...issue.body.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];if(blocks.length!==1)fail('Publication form must contain one JSON request.');
    let candidate;try{candidate=JSON.parse(blocks[0][1]);}catch{fail('Publication form contains invalid JSON.');}
    const requester={githubId:githubId(issue.user.id),login:issue.user.login};
    if(candidate?.requester?.githubId!==requester.githubId)fail('Publication requester does not match the GitHub issue author.');
    // Pasted author fields are replaced by the author observed from GitHub.
    const supplied=contracts.validateRequest({...candidate,requester});
    const resolved=await repositoryById(supplied.repository.id,{signal});
    const {visibility,ownerType,...canonical}=resolved;
    if(canonical.id!==supplied.repository.id||canonical.ownerId!==requester.githubId)fail('Repository ownership changed or does not match this request.');
    const request=contracts.validateRequest({...supplied,repository:canonical});
    return {issueId:String(number),issueState:issue.state,request,repositoryMetadata:resolved,authenticatedActor:requester};
  }
  async function publicationIssues({repository:destination='codepetca/zero',page=1,perPage=100,signal}={}) {
    if(destination!=='codepetca/zero'||!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(perPage)||perPage<1||perPage>100)fail('Use a bounded official publication inbox page.');
    const issues=await read(`/repos/${destination}/issues?state=all&sort=created&direction=desc&per_page=${perPage}&page=${page}`,{maximum:contracts.LIMITS.catalogBytes,signal});
    if(!Array.isArray(issues)||issues.length>perPage)fail('GitHub returned an invalid publication inbox page.');
    const issueNumbers=[];
    for(const issue of issues){if(issue.pull_request)continue;if(!Number.isSafeInteger(issue.number)||issue.number<1)fail('GitHub returned an invalid issue number.');issueNumbers.push(issue.number);}
    return {issueNumbers,page,perPage,exhausted:issues.length<perPage};
  }
  async function publicationIssueState(number,{signal}={}) {
    if(!Number.isSafeInteger(number)||number<1)fail('Invalid publication request number.');
    const issue=await read(`/repos/codepetca/zero/issues/${number}`,{maximum:contracts.LIMITS.metadataBytes*2,signal});
    if(issue.pull_request||issue.number!==number||!['open','closed'].includes(issue.state)||issue.user?.type!=='User')fail('Use an ordinary student publication issue.');
    return {issueId:String(number),issueState:issue.state,authenticatedActor:{githubId:githubId(issue.user.id),login:issue.user.login}};
  }
  async function source(request,{signal}={}){
    const checked=contracts.validateRequest(request);
    const resolved=await repositoryById(checked.repository.id,{signal}),name=`${resolved.owner}/${resolved.name}`;
    if(resolved.id!==checked.repository.id||resolved.ownerId!==checked.requester.githubId)fail('Repository ownership changed before source retrieval.');
    const commit=await read(`/repos/${name}/git/commits/${checked.commit}`,{signal});
    if(commit.sha!==checked.commit||! /^[a-f0-9]{40}$/.test(commit.tree?.sha||''))fail('GitHub did not return the exact requested commit.');
    const tree=await read(`/repos/${name}/git/trees/${commit.tree.sha}?recursive=1`,{maximum:contracts.LIMITS.catalogBytes,signal});
    if(tree.truncated!==false||!Array.isArray(tree.tree))fail('Repository tree is too large or incomplete.');
    const prefix=checked.folder==='.'?'':checked.folder+'/';
    const entries=[];
    for(const entry of tree.tree){
      if(typeof entry.path!=='string'||!entry.path.startsWith(prefix))continue;
      const path=entry.path.slice(prefix.length);if(!path||!retainedSource(path))continue;safeSourcePath(path);
      if(entry.type==='tree')continue;
      if(entry.type!=='blob'||!['100644','100755'].includes(entry.mode)||! /^[a-f0-9]{40}$/.test(entry.sha||''))fail('Share ordinary source files without symlinks or submodules.');
      if(!Number.isSafeInteger(entry.size)||entry.size<0)fail('GitHub returned an invalid source size.');entries.push({...entry,path});
    }
    const limit=checked.kind==='library'?contracts.LIMITS.librarySourceBytes:contracts.LIMITS.gameSourceBytes;
    const filesLimit=checked.kind==='library'?contracts.LIMITS.libraryFiles:contracts.LIMITS.gameFiles;
    if(!entries.length||entries.length>filesLimit||entries.reduce((total,entry)=>total+entry.size,0)>limit)fail('Selected source exceeds the sharing limits.');
    entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
    const files=[];let total=0;
    // A single cumulative deadline prevents hundreds of individually slow reads.
    const deadline=AbortSignal.timeout(60000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
    for(const entry of entries){
      const blob=await read(`/repos/${name}/git/blobs/${entry.sha}`,{maximum:Math.ceil(entry.size*1.4)+65536,signal:combined});
      if(blob.sha!==entry.sha||blob.encoding!=='base64'||typeof blob.content!=='string'||blob.size!==entry.size)fail('GitHub blob differs from the frozen source tree.');
      const encoded=blob.content.replace(/[\r\n]/g,'');if(! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))fail('Invalid GitHub source encoding.');
      const bytes=Buffer.from(encoded,'base64');total+=bytes.length;
      if(bytes.length!==entry.size||total>limit)fail('GitHub source size changed.');
      const gitSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');if(gitSha!==entry.sha)fail('GitHub source hash changed.');
      files.push({path:entry.path,bytes,mode:entry.mode==='100755'?0o755:0o644});
    }
    const sourceDigest=sha(JSON.stringify(files.map(file=>({path:file.path,mode:file.mode,size:file.bytes.length,sha256:sha(file.bytes)}))));
    return {request:checked,repositoryMetadata:resolved,files,sourceDigest};
  }
  return {authenticatedUser,repository,repositoryById,publicationIssue,publicationIssues,publicationIssueState,source};
}
module.exports={createGitHubReader,safeSourcePath,retainedSource};
