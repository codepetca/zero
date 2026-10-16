'use strict';
// Bound filesystem work and queued requests independently. Every live request
// receives a correlated terminal reply, including overflow, stale and empty.
function createSidebarBridge({files,isEmpty,isCurrent,report}) {
  let running=0;
  const queue=[];
  const reply=async(webview,request,type,extra={})=>{
    if(!isCurrent(webview)) return;
    try {await webview.postMessage?.({type,requestId:request.requestId,...extra});}
    catch(error) {report(error);}
  };
  async function perform({webview,request}) {
    try {
      if (!isCurrent(webview)) return;
      if (isEmpty()) {await reply(webview,request,'files.empty');return;}
      if (request.type === 'files.list') {
        const result=await files.list(request.id,request.generation);
        await reply(webview,request,result?'files.result':'files.stale',result?{result}:{});
      } else {
        const opened=await files.openFile(request.id,request.generation);
        await reply(webview,request,opened?'files.opened':'files.stale');
      }
    } catch(error) {
      report(error);
      await reply(webview,request,'files.error',{message:'Could not load this project file. Try it again or use Explorer. See Zero Output for details.'});
    }
  }
  function drain() {
    while(running<8 && queue.length) {
      running++;
      void perform(queue.shift()).finally(()=>{running--;drain();});
    }
  }
  return (webview,request)=>{
    if(request.type!=='files.list' && request.type!=='files.open') return;
    if (!Number.isSafeInteger(request.requestId) || request.requestId<1) return;
    if (request.id!==undefined && (typeof request.id!=='string' || !/^[a-f0-9]{32}$/.test(request.id))) return;
    if (request.type==='files.open' && request.id===undefined) return;
    if (queue.length>=64) {void reply(webview,request,'files.error',{message:'Project files are busy. Try this folder or file again.'});return;}
    queue.push({webview,request});drain();
  };
}
module.exports={createSidebarBridge};
