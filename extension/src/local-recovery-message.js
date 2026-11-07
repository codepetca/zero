'use strict';
const path=require('node:path');
function recoveryMessage(message,recoveryPath) {
  if(typeof recoveryPath!=='string'||recoveryPath.length>4096||!path.isAbsolute(recoveryPath)||/[\x00-\x1f\x7f]/.test(recoveryPath))return message;
  return `${message} Recovery copy: ${recoveryPath}`;
}
module.exports={recoveryMessage};
