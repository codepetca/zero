'use strict';
const crypto=require('node:crypto');
const {publishingFiles}=require('../src/web-publish-github');
// 44e50e4's guide, preceding f719d18's permission-wording-only change.
const hash='56217bc19e0f9009202e3096274d035810b3ecb46c33d862d52a63ae76d3fd92';
module.exports=async()=>{
  const current=await publishingFiles(),legacy=new Map(current),name='.zero-web/README.md';
  legacy.set(name,Buffer.from(current.get(name).toString().replace('checks the Zero GitHub App’s access to this repository','asks VS Code for workflow permission if needed')));
  const digest=crypto.createHash('sha256');
  for(const [name,data]of [...legacy].filter(([name])=>name!=='.zero-web/owner.json').sort(([a],[b])=>a.localeCompare(b)))digest.update(name).update('\0').update(data);
  if(digest.digest('hex')!==hash)throw Error('Historical publishing baseline changed; verify canonical history before updating this fixture.');
  legacy.set('.zero-web/owner.json',Buffer.from(JSON.stringify({format:1,toolHash:hash})+'\n'));
  return {current,legacy};
};
