'use strict';
const crypto = require('node:crypto');
const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function selection(recovery) {
  const file = recovery?.files?.find(file => file.conflicts?.length) || recovery?.files?.[0];
  const conflict = file?.conflicts?.[0];
  return {file, conflict, token:crypto.createHash('sha256').update(JSON.stringify([recovery?.id,recovery?.files])).digest('hex')};
}
function uploadMessage(pending) {
  if (!pending) return '';
  if(pending.operation==='merge')return pending.kind==='behind'?'Merge paused. GitHub main has newer changes. Your feature and local commits are kept.':'Merge was not confirmed. Your feature and local main keep the completed work. Check the connection or GitHub access, then retry Merge to main.';
  const prefix = pending.committed ? 'Committed locally.' : 'Local commits are kept.';
  return `${prefix} ${({behind:pending.branch === 'main' ? 'GitHub main has newer changes. Update from main, then run and push.' : 'This branch has newer changes on GitHub. Update this branch, then run and push.',auth:'Sign in to finish pushing.',access:'GitHub refused access. Review the account and repository access.',network:'Could not confirm the push. Check your connection and retry.',unconfirmed:'Push sent; GitHub confirmation was interrupted. Check its status before retrying.',protected:'GitHub requires a pull request. Keep these commits on a feature branch and finish on GitHub.',changed:'The project changed during upload. Check which commit GitHub received.'})[pending.kind] || 'Push needs attention.'}`;
}
function panel({recovery,pending,error,disabled=false}) {
  const attr = disabled ? 'disabled' : '';
  const button = (command,label,token) => `<button class="secondary" data-command="${command}" ${token ? `data-recovery="${token}"` : ''} ${attr}>${escape(label)}</button>`;
  if (error) return `<div class="update-choices"><p class="muted status">Update recovery needs attention. ${escape(error)}</p>${button('zero.openGitSourceControl','Open Source Control')}</div>`;
  if (recovery) {
    const {file,conflict,token} = selection(recovery);
    const complex = recovery.nativeRequired || !file || file.kind === 'complex' || !conflict;
    const main = recovery.branch === 'main';
    const incoming = recovery.remoteBranch === 'main' ? 'main' : 'GitHub’s branch';
    let html = `<div class="update-choices" role="region" aria-label="Update recovery"><p class="muted status">${complex ? 'Some files need a closer look in Source Control.' : `Choose changes to keep in ${escape(file.path)}.`}</p>`;
    if (!complex) {
      if (file.kind === 'text') {
        const snippet = text => escape(String(text ?? '').slice(0,1200)) + (String(text ?? '').length > 1200 ? '\n… Open the full comparison below.' : '');
        html += `<p class="muted">${main?'My changes':'This branch'}</p><pre>${snippet(conflict.local)}</pre><p class="muted">${main?'GitHub main':escape(incoming)}</p><pre>${snippet(conflict.incoming)}</pre>`;
      } else html += '<p class="muted">This choice applies to the whole file. Other combined changes are kept.</p>';
      const localLabel = file.kind === 'delete' ? (/delete/i.test(conflict.local) ? 'Accept local deletion' : 'Keep local file') : file.kind === 'binary' ? (main?'Keep my file':'Keep this branch’s file') : main?'Keep my changes':'Keep this branch’s changes';
      const incomingLabel = file.kind === 'delete' ? (/delete/i.test(conflict.incoming) ? 'Accept incoming deletion' : 'Keep incoming file') : file.kind === 'binary' ? (main||recovery.remoteBranch!=='main'?'Use GitHub’s file':'Use main’s file') : main||recovery.remoteBranch!=='main'?'Use GitHub’s changes':'Use main’s changes';
      html += `${button('zero.keepLocalUpdate',localLabel,token)}${button('zero.useIncomingUpdate',incomingLabel,token)}`;
      if (file.kind === 'text') html += button('zero.compareUpdate','Open full comparison',token);
    } else html += button('zero.openGitSourceControl','Open Source Control');
    return html + button('zero.cancelUpdate','Cancel update',token) + '</div>';
  }
  if (!pending) return '';
  let action;
  if (pending.kind === 'behind') action = button(pending.operation==='merge'||pending.branch === 'main' ? 'zero.syncProject' : 'zero.updateBranchFromGitHub',pending.operation==='merge'||pending.branch === 'main' ? 'Update from main' : 'Update branch from GitHub');
  else if(pending.operation==='merge')action=button('zero.finishChange','Retry Merge to main');
  else if (pending.kind === 'auth') action = button('zero.reconnectGitHub','Sign in to GitHub');
  else if (pending.kind === 'access') action = button('zero.startPage','Review GitHub access');
  else if (pending.kind === 'unconfirmed' || pending.kind === 'changed') action = button('zero.checkPush','Check GitHub status');
  else if (pending.kind === 'protected') action = pending.branch === 'main' ? button('zero.startChange','Create feature branch…') : button('zero.openGitSourceControl','Open Source Control');
  else action = button('zero.uploadToGitHub','Retry push');
  return `<div class="update-choices" role="region" aria-label="Push recovery"><p class="muted status">${escape(uploadMessage(pending))}</p>${action}</div>`;
}
module.exports = {panel,selection,uploadMessage};
