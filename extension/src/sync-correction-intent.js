'use strict';
// An undo intent names the retained restore journal, not proof that the
// correction was applied. Inspection validates the actual recovery contents.
const path=require('node:path');
function validUndoIntent(record,root) {
  if(record.operation!=='undo')return true;
  const recovery=record.recoveryPath;
  return typeof root==='string'&&path.isAbsolute(root)&&path.normalize(root)===root&&
    record.root===root&&record.type==='local'&&record.remote===''&&record.page===undefined&&
    typeof recovery==='string'&&recovery.length<=4096&&!/[\x00-\x1f\x7f]/.test(recovery)&&
    path.isAbsolute(recovery)&&path.normalize(recovery)===recovery&&path.dirname(recovery)===path.join(root,'.git')&&
    /^zero-project-restore-recovery-[A-Za-z0-9]+$/.test(path.basename(recovery));
}
module.exports={validUndoIntent};
