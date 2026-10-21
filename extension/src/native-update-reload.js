'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function versionParts(value) {
  if (typeof value !== 'string' || !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(value)) return null;
  return value.split('.').map(Number);
}
function isNewer(candidate, current) {
  const a=versionParts(candidate), b=versionParts(current);
  if (!a || !b) return false;
  for (let i=0;i<3;i++) {if (a[i] !== b[i]) return a[i] > b[i];}
  return false;
}
function updateRequest(bytes) {
  if (bytes.length > 2048) return null;
  try {
    const value=JSON.parse(bytes.toString('utf8'));
    if (!value || Object.keys(value).sort().join(',') !== 'requestId,schema,version' || value.schema !== 1 || !versionParts(value.version) ||
        typeof value.requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.requestId)) return null;
    return value;
  } catch {return null;}
}
async function readRequest(filename) {
  const handle=await fsp.open(filename,fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat=await handle.stat();
    if (!stat.isFile() || stat.size > 2048) return null;
    const bytes=Buffer.alloc(2049);
    const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
    return updateRequest(bytes.subarray(0,bytesRead));
  } finally {await handle.close();}
}

// Only Zero's isolated Mac profile consumes this fixed, native-written marker.
// Reload Window preserves the editor's normal dirty-buffer/Hot Exit safeguards;
// never quit Code, save student files, or execute a supplied command/path.
function createNativeUpdateReload(vscode, {
  context, isBusy=()=>false, log=()=>{}, platform=process.platform, home=os.homedir(),
  read=readRequest, realpath=fsp.realpath, setTimer=setInterval, clearTimer=clearInterval
}) {
  const editor=path.join(home,'Library/Application Support/Zero/editor');
  const extensions=path.join(editor,'extensions');
  const current=context.extension?.packageJSON?.version;
  let disposed=false, checking=false, attempted, timer, reportedFailure=false;
  const enabled=platform==='darwin' && versionParts(current) && typeof context.extensionPath==='string' && path.dirname(context.extensionPath)===extensions;
  async function check() {
    if (!enabled || disposed || checking) return false;
    checking=true;
    try {
      // Match the actual installed directory as well as its spelling. A linked
      // development/profile directory must not gain this update behavior.
      if (await realpath(extensions)!==extensions || await realpath(context.extensionPath)!==context.extensionPath || disposed) return false;
      const request=await read(path.join(editor,'update-ready.json'));
      reportedFailure=false;
      if (!request || !isNewer(request.version,current) || request.requestId===attempted || disposed || isBusy()) return false;
      attempted=request.requestId;
      log('Zero updated. Reloading the Zero window.');
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
      return true;
    } catch (error) {
      if (!disposed && error.code !== 'ENOENT' && !reportedFailure) {
        reportedFailure=true;
        log('Zero update reload is unavailable. Use Developer: Reload Window to finish updating.');
      }
      return false;
    } finally {checking=false;}
  }
  let ready=Promise.resolve(false);
  if (enabled) {
    timer=setTimer(()=>{void check();},1000);
    timer.unref?.();
    ready=check();
  }
  return {check,ready,dispose(){disposed=true;if(timer!==undefined)clearTimer(timer);}};
}
module.exports={createNativeUpdateReload,updateRequest,isNewer};
