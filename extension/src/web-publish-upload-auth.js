'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {publishingFiles}=require('./web-publish-github');
const {repositoryIdentity}=require('./github-app/repositories');

// Inspect the current pinned kit, including its workflow and ownership digest.
// Checking working files also covers a clean commit whose first push failed.
async function isManagedPublishingSetup(root) {
  for(const [name,expected] of await publishingFiles()) {
    let current=root,stat;
    for(const part of name.split('/')) {
      current=path.join(current,part);
      try {stat=await fs.lstat(current);}
      catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return false;throw error;}
      if(stat.isSymbolicLink())return false;
    }
    if(!stat.isFile()||stat.size!==expected.length||!(await fs.readFile(current)).equals(expected))return false;
  }
  return true;
}

async function selectUploadAuthentication({root,authentication,initialTicket,repositories,repositoryUrl,assertCurrentProject=async()=>{}}) {
  await assertCurrentProject();
  await authentication.assertCurrent(initialTicket);
  if(!repositories?.access)throw Error('Zero GitHub App repository access is not configured.');
  const permissions={contents:'write'};
  if(await isManagedPublishingSetup(root))permissions.workflows='write';
  await assertCurrentProject();
  const identity=repositoryIdentity(await repositories.access(repositoryUrl,{ticket:initialTicket,permissions}));
  await authentication.assertCurrent(initialTicket);
  await assertCurrentProject();
  // The same Zero App session owns upload; never expand OAuth scopes or fall
  // back to VS Code's general GitHub credentials.
  return {authentication,ticket:initialTicket,identity,permissions:Object.freeze({...permissions}),dispose(){}};
}
module.exports={isManagedPublishingSetup,selectUploadAuthentication};
