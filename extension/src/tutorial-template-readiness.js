'use strict';
const {createHash}=require('node:crypto');

// Source-bound publication evidence for NEW tutorials only. Never use this to
// require an existing project to upgrade its independently owned framework.
function tutorialScaffoldSha256(files){
  const inventory=files.map(file=>({path:file.path,mode:file.mode,
    sha256:createHash('sha256').update(Buffer.isBuffer(file.content)?file.content:Buffer.from(file.content,'base64')).digest('hex')}))
    .sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
}
function assertTutorialTemplateReady(project){
  if(!project?.template)throw Error(`The ${project?.title||'selected'} tutorial template is not published yet. Ask your teacher when it is available; no project was created.`);
  if(project.template.scaffoldSha256!==tutorialScaffoldSha256(project.files))throw Object.assign(Error(`The published ${project.title} tutorial template has not been verified against these lessons and their Zero helpers. Ask your teacher for the updated template before starting. No project was created; existing projects can still run.`),{code:'ZERO_TUTORIAL_TEMPLATE_STALE'});
  return true;
}
module.exports={tutorialScaffoldSha256,assertTutorialTemplateReady};
