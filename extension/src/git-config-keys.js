'use strict';
const {validBranchName}=require('./core');
// Recovery reads only these inert local settings. Subsection names may contain
// dots; recognize the final variable rather than splitting a branch on dots.
function inertGitConfigKey(key) {
  if(typeof key!=='string')return false;
  const branch=/^branch\.(.+)\.(?:remote|merge)$/i.exec(key);
  return Boolean(branch&&validBranchName(branch[1]))||/^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|hidedotfiles|autocrlf|eol)|user\.(?:name|email)|remote\.[^.]+\.(?:url|fetch|pushurl)|extensions\.objectformat)$/i.test(key);
}
module.exports={inertGitConfigKey};
