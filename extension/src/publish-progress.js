'use strict';
// Stage completion is measured work, never elapsed time or a percentage estimate.
function publishProgressDetails(value) {
  const labels={checking:'Checking app',preparing:'Preparing app',building:'Building app',uploading:'Uploading app',deploying:'Deploying app',verifying:'Checking live app',opening:'Opening in browser'};
  if(!value || !Array.isArray(value.stages) || !value.stages.length || value.stages.some(stage=>!Object.hasOwn(labels,stage)) || !Number.isInteger(value.index) || value.index<0 || value.index>=value.stages.length)return;
  return {count:value.stages.length,index:value.index,text:`Stage ${value.index+1} of ${value.stages.length}: ${labels[value.stages[value.index]]}`};
}
function publishProgressHtml(value) {
  const detail=publishProgressDetails(value);
  if(!detail)return '';
  return `<div class="publish-progress" role="progressbar" aria-label="Publishing progress" aria-valuemin="0" aria-valuemax="${detail.count}" aria-valuenow="${detail.index}" aria-valuetext="${detail.text}">${Array.from({length:detail.count},(_,index)=>`<span aria-hidden="true" class="publish-segment${index<detail.index?' complete':index===detail.index?' active':''}"></span>`).join('')}</div>`;
}
// Start Page retains text-only rendering for arbitrary account/status strings.
function updatePublishProgress(container,value) {
  const detail=publishProgressDetails(value),key=JSON.stringify(detail);
  if(container.dataset.progress===key)return;
  container.dataset.progress=key;
  container.replaceChildren();
  if(!detail)return;
  const bar=document.createElement('div');bar.className='publish-progress';
  for(const [key,value] of Object.entries({role:'progressbar','aria-label':'Publishing progress','aria-valuemin':'0','aria-valuemax':String(detail.count),'aria-valuenow':String(detail.index),'aria-valuetext':detail.text}))bar.setAttribute(key,value);
  for(let index=0;index<detail.count;index++){
    const segment=document.createElement('span');segment.setAttribute('aria-hidden','true');
    segment.className='publish-segment'+(index<detail.index?' complete':index===detail.index?' active':'');bar.append(segment);
  }
  container.append(bar);
}
module.exports={publishProgressDetails,publishProgressHtml,updatePublishProgress};
