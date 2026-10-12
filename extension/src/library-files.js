'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
// Show component source directly in the quiet Files view. No descriptor paths run.
async function libraryLayout(root) {
  const descriptor=path.join(root,'.zero-library.json');let stat;
  try {stat=await fs.lstat(descriptor);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('Use an ordinary downloaded library descriptor.');
  const value=JSON.parse(await fs.readFile(descriptor,'utf8'));
  if(value.schema!==1||!/^ui[1-9a-z][0-9a-z]{0,11}$/.test(value.libraryId||''))throw new Error('The library descriptor has no valid reserved ID.');
  return {sources:path.join(root,'src','zero',value.libraryId),preview:path.join(root,'src','Main.java'),api:path.join(root,'API.md'),examples:path.join(root,'examples'),checks:path.join(root,'checks')};
}
module.exports={libraryLayout};
