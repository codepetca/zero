'use strict';

async function commitLocally({root,message,prepare,commit,guard,onState=()=>{}}) {
  if(!root||typeof message!=='string'||!message.trim()||message.includes('\0'))throw new Error('Enter a short commit message describing your changes.');
  await guard();
  const plan=await prepare(root);
  if(plan.root!==root||!plan.changes?.length)throw new Error('There are no changes to commit.');
  onState();
  const saved=await commit(plan,message.trim());
  if(!saved?.committed||saved.uploaded||saved.branch!==plan.branch||!saved.head)throw new Error('The local commit could not be verified. Review project history.');
  return saved;
}

module.exports={commitLocally};
