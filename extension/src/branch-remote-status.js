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
async function checkBranchRemote({readState,readRemote,isAncestor,now=Date.now}) {
  const before=await readState();
  if(!before?.root||!before.remote||!before.account||!oid(before.head)||typeof before.branch!=='string'||!before.branch)throw new Error('A connected branch is required.');
  const ref=`refs/heads/${before.branch}`;
  let state,head;
  try {
    head=remoteHead(await readRemote(before,ref),ref);
    if(head===null)state='remote-missing';
    else if(head===before.head)state='synced';
    else {
      const included=await isAncestor(head,before.head,before);
      state=included===true?'local-ahead':'remote-changed';
    }
  } catch(error) {state=errorState(error);}
  // Also revalidate failure observations: stale auth/offline errors must not be
  // attached to a newly selected project or account.
  if(!same(before,await readState()))throw new Error('The project changed during the branch check.');
  return Object.freeze({...before,state,remoteHead:head,checkedAt:now()});
}
function statusMessage(state) {
  return ({checking:'Checking this branch on GitHub…',synced:'Branch matched GitHub at the last check.',stale:'Branch connection check is out of date.', 'local-ahead':'Local commits are not on this GitHub branch.', 'remote-changed':'This GitHub branch differs. Review updates before syncing.', 'remote-missing':'This branch was missing on GitHub at the last check. Review branch creation before syncing.',auth:'Sign in to check this GitHub branch.',access:'GitHub branch access is unavailable. Check repository access and URL.',offline:'Offline or connection unavailable. Branch sync is unverified.',unknown:'This GitHub branch could not be verified.',local:'Local project · no GitHub remote connected.',simulation:'Simulation · GitHub branch is not checked.'})[state]||'';
}
module.exports={checkBranchRemote,remoteHead,errorState,statusMessage};
