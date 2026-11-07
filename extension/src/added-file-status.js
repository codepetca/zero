'use strict';

// Status is selection evidence only. The caller must bind it to the reviewed
// worktree, index, HEAD and editor state before removing anything.
function addedFileSource(status,name) {
  const safe=value=>typeof value==='string'&&value.length>0&&value.length<=4096&&!value.startsWith('/')&&
    !/[\x00-\x1f\x7f\\]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&part.toLowerCase()!=='.git');
  if(typeof status!=='string'||(status&&!status.endsWith('\0'))||!safe(name))throw new Error('Cannot safely identify the added file.');
  const matches=[];
  for(const record of status.split('\0').filter(Boolean)) {
    if(record.length<4||record[2]!==' ')throw new Error('Incomplete or unexpected Git status.');
    const code=record.slice(0,2),filename=record.slice(3);
    if(!/^(?:\?\?|[ MADUT?!]{2})$/.test(code)||!safe(filename))throw new Error('Incomplete or unexpected Git status.');
    if(filename===name)matches.push(code);
  }
  // A staged deletion and a recreated untracked file can share a name. It is
  // not authority to remove either version.
  if(matches.length!==1)throw new Error('The selected addition is stale or ambiguous.');
  const code=matches[0];
  if(code==='??')return Object.freeze({source:'untracked',status:code});
  if(code==='A '||code==='AM')return Object.freeze({source:'index',status:code});
  throw new Error('This file is not a supported addition.');
}
module.exports={addedFileSource};
