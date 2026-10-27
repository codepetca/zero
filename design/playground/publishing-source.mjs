import webPublish from '../../extension/src/web-publish-ui.js';
import progressComponent from '../../extension/src/publish-progress.js';

// Exercise the real command coordinator with an in-memory publisher and browser.
// No GitHub, project files, credentials, build tools or real browser are available.
const root='/fixture/project',stored=new Map(),snapshots={};
let progress,capturingLink=false;const publishedLinkFrames=[];let builds=0,uploads=0,deploys=0;const oldSha='a'.repeat(40);
const review={status:'review',account:'1',repository:'https://github.com/student/greeting',publicUrl:'https://fixture.invalid/app/',sha:oldSha};
const live={status:'live',url:review.publicUrl,sha:review.sha,resume:{repository:review.repository,runId:1,sha:oldSha}};
const publisher={
  review:async()=>review,
  verifyCurrent:async(_review,saved,{onCurrent})=>{if(!saved)return {status:'stale'};onCurrent(live);return live;},
  verifyLink:async(_root,saved)=>({...live,sha:saved.sha}),
  publish:async(_review,{onStage,onProgress})=>{
    builds++;uploads++;deploys++;
    for(const [stage,message] of [['building','Building browser app…'],['uploading','Uploading validated app…'],['deploying','GitHub is deploying your app…']]){onStage(stage);onProgress(message);}
    return {status:'pending',resume:{runId:1},message:'GitHub is deploying your app…'};
  },
  check:async(_resume,{onStage,onProgress})=>{onStage('verifying');onProgress('Checking live app…');return live;}
};
const controller=webPublish.createWebPublishCommands({workspace:{isTrusted:true},window:{showInformationMessage:async()=>'Publish app'},env:{openExternal:async()=>true},Uri:{parse:value=>value}},{
  project:async()=>root,authentication:{capture:async()=>({session:{accountId:'1'}}),assertCurrentNow:()=>({accountId:'1'})},isSimulation:()=>false,publisherFactory:()=>publisher,
  workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)},pollIntervalMs:0,maxChecks:1,
  setProgress:value=>{progress=value;},setState:status=>{
    if(capturingLink)publishedLinkFrames.push({status,publishProgress:progress});
    if(progress && !capturingLink){const stage=progress.stages[progress.index];snapshots['publish-'+stage]={status,publishProgress:progress};}
  }
});
await controller.publishAndOpen();
const before={builds,uploads,deploys};review.sha='b'.repeat(40);capturingLink=true;
await controller.commands['zero.openPublishedWeb']();capturingLink=false;
export const publishedLinkProof={openedSha:oldSha,localSha:review.sha,builds:builds-before.builds,uploads:uploads-before.uploads,deploys:deploys-before.deploys};
export const publishedLinkPlayback=publishedLinkFrames.map(value=>({type:'sidebar.update',status:'Simulation: '+value.status,publishingProgress:progressComponent.publishProgressHtml(value.publishProgress)}));
export const publishedLinkController=controller;
snapshots.published={status:'Simulation: your previous published app is available; local code has newer edits.'};
snapshots['published-busy']={...snapshots.published,busy:true};
snapshots['publish-error']={status:'Simulation: the build failed. Fix the error and publish again.'};
snapshots['publish-stopped']={status:'Simulation: publishing is still running on GitHub. Choose Publish & open app again to recheck.'};
export const publishingSnapshots=Object.freeze(snapshots);
export const publishingStates=Object.keys(snapshots);
export const publishingProgressHtml=progressComponent.publishProgressHtml;
