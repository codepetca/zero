import webPublish from '../../extension/src/web-publish-ui.js';
import progressComponent from '../../extension/src/publish-progress.js';

// Exercise the real command coordinator with an in-memory publisher and browser.
// No GitHub, project files, credentials, build tools or real browser are available.
const root='/fixture/project',stored=new Map(),snapshots={};
let progress;
const review={status:'review',account:'fixture',repository:'https://github.com/fixture/app',publicUrl:'https://fixture.invalid/app/',sha:'fixture'};
const live={status:'live',url:review.publicUrl,sha:review.sha,resume:{repository:review.repository}};
const publisher={
  review:async()=>review,
  verifyCurrent:async(_review,saved,{onCurrent})=>{if(!saved)return {status:'stale'};onCurrent(live);return live;},
  publish:async(_review,{onStage,onProgress})=>{
    for(const [stage,message] of [['building','Building browser app…'],['uploading','Uploading validated app…'],['deploying','GitHub is deploying your app…']]){onStage(stage);onProgress(message);}
    return {status:'pending',resume:{runId:1},message:'GitHub is deploying your app…'};
  },
  check:async(_resume,{onStage,onProgress})=>{onStage('verifying');onProgress('Checking live app…');return live;}
};
const controller=webPublish.createWebPublishCommands({workspace:{isTrusted:true},window:{showInformationMessage:async()=>'Publish app'},env:{openExternal:async()=>true},Uri:{parse:value=>value}},{
  project:async()=>root,isSimulation:()=>false,publisherFactory:()=>publisher,
  workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)},pollIntervalMs:0,maxChecks:1,
  setProgress:value=>{progress=value;},setState:status=>{
    if(progress){const stage=progress.stages[progress.index];snapshots['publish-'+stage]={status,publishProgress:progress};}
  }
});
await controller.publishAndOpen();controller.disposables[0].dispose();
snapshots['publish-error']={status:'Simulation: the build failed. Fix the error and publish again.'};
snapshots['publish-stopped']={status:'Simulation: publishing is still running on GitHub. Choose Publish & open app again to recheck.'};
export const publishingSnapshots=Object.freeze(snapshots);
export const publishingStates=Object.keys(snapshots);
export const publishingProgressHtml=progressComponent.publishProgressHtml;
