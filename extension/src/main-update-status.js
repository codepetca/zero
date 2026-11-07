'use strict';
// Read-only assessment. A remote SHA absent from the local object database is
// deliberately reported as unknown; this check does not fetch or change refs.
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const same=(a,b)=>['root','branch','head','localMain','remote','account'].every(key=>a[key]===b[key]);
function mainHead(output) {
  const rows=typeof output==='string'?output.trim().split('\n').filter(Boolean):[];
  if(rows.length!==1)throw new Error('GitHub main could not be checked.');
  const fields=rows[0].split('\t');
  if(fields.length!==2||fields[1]!=='refs/heads/main'||!oid(fields[0]))throw new Error('GitHub main returned an unexpected result.');
  return fields[0];
}
async function checkMainUpdate({readState,readRemote,isAncestor}) {
  if([readState,readRemote,isAncestor].some(fn=>typeof fn!=='function'))throw new Error('A guarded update check is required.');
  const before=await readState();
  if(!before||before.branch==='main'||!oid(before.head)||!oid(before.localMain)||!before.remote)throw new Error('A connected feature branch is required.');
  const remoteMain=mainHead(await readRemote(before));
  const local=await isAncestor(before.localMain,before.head,before);
  const remote=remoteMain===before.localMain?local:await isAncestor(remoteMain,before.head,before);
  const after=await readState();
  if(!same(before,after))throw new Error('The project changed during the update check.');
  return Object.freeze({state:remote===false?'available':remote===true?'current':'unknown',localUpdate:local===false,remoteMain});
}
module.exports={checkMainUpdate,mainHead};
