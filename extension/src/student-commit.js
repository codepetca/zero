'use strict';
// Keep local save and remote delivery separate. The caller supplies existing
// reviewed Git/authentication guards and the exact-destination transport.
async function commitAndSync({root,message,prepare,commit,sync,guard,onState=()=>{}}) {
  if(!root||typeof message!=='string'||!message.trim()||message.includes('\0'))throw new Error('Enter a short commit message describing your changes.');
  if([prepare,commit,sync,guard].some(fn=>typeof fn!=='function'))throw new Error('Commit needs the project and sync safeguards.');
  await guard();
  const reviewed=await prepare(root);
  if(reviewed.root!==root||!reviewed.changes?.length)throw new Error('There are no changes to commit.');
  onState('committing');
  const saved=await commit(reviewed,message.trim());
  if(!saved?.committed||saved.uploaded||saved.branch!==reviewed.branch||!saved.head)throw new Error('The local commit could not be verified. Review project history.');
  onState('committed');
  try {
    await guard();
    const syncPlan=await prepare(root);
    if(syncPlan.root!==root||syncPlan.branch!==saved.branch||syncPlan.head!==saved.head||syncPlan.remote!==reviewed.remote)throw new Error('The project changed after the local commit. Review before syncing.');
    onState('syncing');
    const result=await sync(syncPlan);
    if(!result?.uploaded||result.head!==saved.head||result.branch!==saved.branch)throw new Error('GitHub did not confirm the saved commit.');
    onState('synced');
    return {saved,synced:true,result,newerChanges:Boolean(syncPlan.changes.length||result.localChanged)};
  } catch(error) {
    onState('sync-failed');
    return {saved,synced:false,error};
  }
}
module.exports={commitAndSync};
