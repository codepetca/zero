'use strict';

// This is selection evidence only. A caller must verify the index entry and
// bind the selected file, full project state and editor guard before writing.
function selectedStatus(status,name) {
  const safe=value=>typeof value==='string'&&value.length>0&&value.length<=4096&&!value.startsWith('/')&&
    !/[\x00-\x1f\x7f\\]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&part.toLowerCase()!=='.git');
  if(typeof status!=='string'||(status&&!status.endsWith('\0'))||!safe(name))throw new Error('Cannot safely identify the modified file.');
  const matches=[];
  for(const record of status.split('\0').filter(Boolean)) {
    if(record.length<4||record[2]!==' ')throw new Error('Incomplete or unexpected Git status.');
    const code=record.slice(0,2),filename=record.slice(3);
    if(!/^(?:\?\?|[ MADUT?!]{2})$/.test(code)||!safe(filename))throw new Error('Incomplete or unexpected Git status.');
    if(filename===name)matches.push(code);
  }
  // A staged deletion plus a recreated untracked file appears twice; it is
  // never authority to replace the student's newly created file.
  if(matches.length!==1)throw new Error('The selected change is stale or ambiguous.');
  return matches[0];
}
function modifiedFileSource(status,name) {
  if([' M','MM','AM'].includes(selectedStatus(status,name)))return 'index';
  throw new Error('This file does not have a supported working-tree modification.');
}
function committedFileSource(status,name) {
  if(['M ','MM'].includes(selectedStatus(status,name)))return 'head';
  throw new Error('This file does not have a supported staged modification.');
}
module.exports={modifiedFileSource,committedFileSource};
