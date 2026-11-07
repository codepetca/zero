'use strict';
const {validBranchName}=require('./core');
// Keep v1's readable, clone-portable representation. A bound applies to the
// complete UTF-8 name, independently of Git's filesystem component limits.
const MAX_BRANCH_BYTES=1024;
const MAX_COMMIT_BYTES=64*1024;
function validFinishedBranch(branch) {
  return validBranchName(branch)&&branch!=='main'&&!/[\x00-\x1f\x7f-\x9f]/.test(branch)&&Buffer.byteLength(branch,'utf8')<=MAX_BRANCH_BYTES;
}
function finishMessage(branch) {
  if(!validFinishedBranch(branch))throw new Error('Choose a valid bounded feature branch name before merging. Use Source Control to inspect this branch.');
  return `Zero: finish ${branch}\n\nZero-Finished-Change: 1\nZero-Change-Branch: ${branch}`;
}
function parseFinishedMessage(message) {
  if(typeof message!=='string'||Buffer.byteLength(message,'utf8')>MAX_BRANCH_BYTES*2+128)return null;
  const match=/^Zero: finish ([^\r\n]+)\n\nZero-Finished-Change: 1\nZero-Change-Branch: ([^\r\n]+)\n?$/.exec(message);
  return match&&match[1]===match[2]&&validFinishedBranch(match[1])?match[1]:null;
}
async function readFinishedBranch(root,commit,run) {
  if(typeof commit!=='string'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))return null;
  // Pretty-printing can truncate at embedded NUL and ordinary runners trim
  // stdout. Request the complete object bytes; string adapters must already use
  // fatal UTF-8 decoding and preserve all whitespace (as change-undo does).
  const raw=await run(root,['cat-file','commit',commit],{encoding:'buffer'});
  if(!(Buffer.isBuffer(raw)||typeof raw==='string')||Buffer.byteLength(raw)>MAX_COMMIT_BYTES)return null;
  let text;
  try {text=typeof raw==='string'?raw:new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{return null;}
  if(text.includes('\0'))return null;
  const split=text.indexOf('\n\n');if(split<0)return null;
  const header=text.slice(0,split);
  if(!/^tree (?:[a-f0-9]{40}|[a-f0-9]{64})\n/.test(header)||!/^author [^\n]+$/m.test(header)||!/^committer [^\n]+$/m.test(header)||/[\x00-\x08\x0b-\x1f\x7f]/.test(header))return null;
  return parseFinishedMessage(text.slice(split+2));
}
module.exports={MAX_BRANCH_BYTES,MAX_COMMIT_BYTES,validFinishedBranch,finishMessage,parseFinishedMessage,readFinishedBranch};
