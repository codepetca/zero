'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createAuthentication}=require('./authentication');
const {publishingFiles}=require('./web-publish-github');

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

async function selectUploadAuthentication({root,authentication,initialTicket,provider,assertCurrentProject=async()=>{}}) {
  await assertCurrentProject();
  await authentication.assertCurrent(initialTicket);
  if(initialTicket.session.scopes?.includes('workflow')||!await isManagedPublishingSetup(root))return {authentication,ticket:initialTicket,dispose(){}};
  await assertCurrentProject();
  const scoped=createAuthentication(provider,()=>{},['repo','workflow']);
  try {
    let ticket;
    try {ticket=await scoped.capture();}
    catch {await assertCurrentProject();await scoped.signIn();ticket=await scoped.capture();}
    await assertCurrentProject();
    // Native scope expansion can rotate the original session. Compare freshly
    // observed accounts while retaining the original account as the boundary.
    const base=await authentication.capture();
    if(ticket.session.accountId!==initialTicket.session.accountId||base.session.accountId!==initialTicket.session.accountId)throw Error('The GitHub account changed during workflow authorization. Review the upload again with the intended account.');
    if(!ticket.session.scopes.includes('workflow'))throw Error('Authorize GitHub workflow access through VS Code before uploading this publishing setup.');
    await scoped.assertCurrent(ticket);
    await assertCurrentProject();
    return {authentication:scoped,ticket,dispose:()=>scoped.dispose()};
  } catch(error) {scoped.dispose();throw error;}
}
module.exports={isManagedPublishingSetup,selectUploadAuthentication};
