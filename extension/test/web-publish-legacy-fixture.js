'use strict';
const crypto=require('node:crypto');
const {publishingFiles}=require('../src/web-publish-github');
// Verified from canonical source in Git: 44e50e44, f719d184/84c56394, 2a91927c.
// Reconstruct the historical guides without changing either pinned baseline.
function pin(files,hash) {
  const digest=crypto.createHash('sha256');
  for(const [name,data]of [...files].filter(([name])=>name!=='.zero-web/owner.json').sort(([a],[b])=>a.localeCompare(b)))digest.update(name).update('\0').update(data);
  if(digest.digest('hex')!==hash)throw Error('Historical publishing baseline changed; verify canonical history before updating this fixture.');
  files.set('.zero-web/owner.json',Buffer.from(JSON.stringify({format:1,toolHash:hash})+'\n'));
}
module.exports=async()=>{
  const current=await publishingFiles(),shipping=new Map(current),name='.zero-web/README.md';
  const workflow='.github/workflows/zero-web.yml';
  shipping.set(workflow,Buffer.from(current.get(workflow).toString().replace('run-name: Zero web ${{ inputs.source_sha }} ${{ inputs.stage_tag }}','run-name: Zero web ${{ inputs.source_sha }}')));
  pin(shipping,'e89fe6b48b56c56b8f5bed8fa3940c5b8466beaeae87a74d756bde1382bf0e8c');
  const previous=new Map(shipping);
  previous.set(name,Buffer.from(current.get(name).toString().replace('help from your device administrator or IT','help from your teacher or IT')));
  pin(previous,'292808492ceceb80fefcc6ac8f0e756275cc357aee6bd2d22f3d0f2195631805');
  const legacy=new Map(previous);
  legacy.set(name,Buffer.from(previous.get(name).toString().replace('checks the Zero GitHub App’s access to this repository','asks VS Code for workflow permission if needed')));
  pin(legacy,'56217bc19e0f9009202e3096274d035810b3ecb46c33d862d52a63ae76d3fd92');
  return {current,legacy,previous,shipping};
};
