'use strict';
// Parse bounded `git ls-files --debug -z` output. Flags are evidence about the
// complete index, not authorization to mutate it. Reject unknown formats.
function parseIndexFlags(bytes) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),result=new Map();
  const row=/([^\0]+)\0  ctime: [^\n]*\n  mtime: [^\n]*\n  dev: [^\n]*\n  uid: [^\n]*\n  size: [^\n]*\tflags: ([0-9a-fA-F]{1,16})\n/g;
  let position=0,match;
  while((match=row.exec(text))) {
    const name=match[1];if(match.index!==position||name.length>4096||name.startsWith('/')||/[\x00-\x1f\x7f\\]/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git')||result.has(name))throw new Error('Git index flags could not be verified.');
    result.set(name,BigInt('0x'+match[2]).toString(16));position=row.lastIndex;
  }
  if(position!==text.length)throw new Error('Git index flags could not be verified.');
  return result;
}
module.exports={parseIndexFlags};
