'use strict';
// One read-only exact-ref observation. This never fetches missing objects and
// does not infer that an absent/inaccessible repository means a deleted branch.
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const fields=['root','branch','head','remote','account','session','authEpoch'];
const same=(a,b)=>fields.every(key=>a[key]===b[key]);
function remoteHead(output,ref) {
  if(typeof output!=='string')throw new Error('Invalid branch response.');
  const rows=output.trim().split('\n').filter(Boolean);
  if(!rows.length)return null;
  const parts=rows[0].split('\t');
  if(rows.length!==1||parts.length!==2||parts[1]!==ref||!oid(parts[0]))throw new Error('Invalid branch response.');
  return parts[0];
}
function errorState(error) {
  if(error?.kind==='auth'||error?.code==='authentication-required'||error?.status===401)return 'auth';
  if(error?.kind==='access'||['permission-required','repository-not-selected','installation-required'].includes(error?.code)||[403,404].includes(error?.status))return 'access';
  if(error?.kind==='network'||error?.code==='network-error'||['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ENETUNREACH'].includes(error?.code))return 'offline';
  return 'unknown';
}
async function countBranchCommits(read,local,remote) {
  if(!oid(local)||!oid(remote))return;
  const result=await read(['rev-list','--left-right','--count',`${local}...${remote}`]);
  const counts=/^(\d+)\t(\d+)$/.exec(result);
  if(!counts)return;
  const outgoing=Number(counts[1]),incoming=Number(counts[2]);
  if(Number.isSafeInteger(outgoing)&&Number.isSafeInteger(incoming))return {outgoing,incoming};
}
async function countGitHubBranchCommits({branch,head,remoteHead},read,compare) {
  const exact=await compare(head,remoteHead);
  if(exact!==null)return exact;
  // A locally committed tip can be unknown to GitHub. If the tracked tip is
  // a local ancestor, compare from it and remove commits present on both sides.
  const anchor=await read(['rev-parse','--verify',`refs/remotes/origin/${branch}^{commit}`]);
  if(!oid(anchor)||anchor===head)return;
  await read(['merge-base','--is-ancestor',anchor,head]);
  const compared=await compare(anchor,remoteHead,true);
  if(!compared)return;
  const local=await read(['rev-list',`${anchor}..${head}`]);
  const localCommits=new Set(local.split('\n').filter(Boolean));
  const shared=compared.incomingCommits.filter(id=>localCommits.has(id)).length;
  const outgoing=compared.outgoing+(localCommits.size-shared);
  if(Number.isSafeInteger(outgoing))return {outgoing,incoming:compared.incoming-shared};
}
async function checkBranchRemote({readState,readRemote,isAncestor,countCommits,now=Date.now}) {
  const before=await readState();
  if(!before?.root||!before.remote||!before.account||!oid(before.head)||typeof before.branch!=='string'||!before.branch)throw new Error('A connected branch is required.');
  const ref=`refs/heads/${before.branch}`;
  let state,head,counts;
  try {
    head=remoteHead(await readRemote(before,ref),ref);
    if(head===null){state='remote-missing';counts={incoming:0};}
    else if(head===before.head){state='synced';counts={outgoing:0,incoming:0};}
    else {
      // A remote commit may not exist locally. Counting is optional and must
      // never fetch objects or prevent the guarded update from being offered.
      try {counts=await countCommits?.(before.head,head);}catch{}
      const included=counts?counts.incoming===0&&counts.outgoing>0:await isAncestor(head,before.head,before);
      state=included===true?'local-ahead':'remote-changed';
    }
  } catch(error) {state=errorState(error);}
  // Also revalidate failure observations: stale auth/offline errors must not be
  // attached to a newly selected project or account.
  if(!same(before,await readState()))throw new Error('The project changed during the branch check.');
  return Object.freeze({...before,...counts,state,remoteHead:head,checkedAt:now()});
}
function statusMessage(state) {
  return ({
    auth:'Sign in to GitHub to sync.',
    access:'Check your GitHub repository access.',
    offline:'GitHub is unreachable. Try Sync again.',
    local:'Connect a GitHub repository to sync.'
  })[state]||'';
}
module.exports={checkBranchRemote,countBranchCommits,countGitHubBranchCommits,remoteHead,errorState,statusMessage};
