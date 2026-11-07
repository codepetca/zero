'use strict';
const crypto = require('node:crypto');
const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function selection(recovery) {
  const file = recovery?.files?.find(file => file.conflicts?.length) || recovery?.files?.[0];
  const conflict = file?.conflicts?.[0];
  return {file, conflict, token:crypto.createHash('sha256').update(JSON.stringify([recovery?.id,recovery?.files,recovery?.readyFingerprint])).digest('hex')};
}
function localReminderMessage(record) {
  if(record?.operation==='undo')return 'An undo correction sync reminder needs inspection. The correction may not have been applied; inspect its recovery copies and project history.';
  if(record?.operation==='restore')return 'A project restore sync reminder needs inspection.';
  return 'A local sync reminder needs attention.';
}
function uploadMessage(pending) {
  if (!pending) return '';
  if(pending.operation==='reftable-ref-only')return 'A ref-only update record needs inspection. Its status does not authorize syncing; keep the reminder and review the branch in Source Control.';
  if(pending.kind==='destination-changed')return 'The repository connection changed while an earlier sync was unresolved. Check the earlier destination before clearing this reminder.';
  if(pending.operation!=='merge'&&pending.pushStarted!==false&&['network','ready'].includes(pending.kind))return 'A push may have started. Check GitHub status before retrying; your local commits are kept.';
  if(pending.kind==='ready')return pending.operation==='merge'?'Signed in. Retry Merge to main to finish.':'Signed in. Your local commits are ready to push.';
  if(pending.operation==='merge'&&pending.kind==='auth')return 'Your feature and local main are preserved. Sign in to finish Merge to main.';
  if(pending.operation==='merge'&&pending.kind==='access')return 'Your feature and local main are preserved. Review GitHub access before retrying Merge to main.';
  if(pending.operation==='merge'&&pending.kind==='protected')return 'GitHub requires a pull request for main. Your feature and commits are kept; finish the review on GitHub.';
  if(pending.operation==='merge')return pending.kind==='behind'?'Merge paused. GitHub main has newer changes. Your feature and local commits are kept.':'Merge was not confirmed. Your feature and local main are preserved. Check the connection or GitHub access, then retry Merge to main.';
  const prefix = pending.committed ? 'Committed locally.' : 'Local commits are kept.';
  return `${prefix} ${({behind:pending.branch === 'main' ? 'GitHub main has newer changes. Update from main, then run and push.' : 'This branch has newer changes on GitHub. Update this branch, then run and push.','remote-missing':'GitHub reported this branch missing. Review the saved commit before creating it again.',auth:'Sign in to finish pushing.',access:'GitHub refused access. Review the account and repository access.',network:'Could not confirm the push. Check your connection and retry.',unconfirmed:'Push sent; GitHub confirmation was interrupted. Check its status before retrying.',protected:'GitHub requires a pull request. Keep these commits on a feature branch and finish on GitHub.',changed:'Your project or GitHub sign-in changed during upload. Check your GitHub account and which commit GitHub received.'})[pending.kind] || 'Push needs attention.'}`;
}
function panel({recovery,pending,error,disabled=false,refOnlyReview=false}) {
  const attr = disabled ? 'disabled' : '';
  const button = (command,label,token) => `<button class="secondary" data-command="${command}" ${token ? `data-recovery="${token}"` : ''} ${['zero.keepLocalUpdate','zero.useIncomingUpdate','zero.cancelUpdate','zero.continueUpdate'].includes(command) ? 'data-conflict-choice="true"' : ''} ${attr}>${escape(label)}</button>`;
  if (error) return `<div class="update-choices"><p class="muted status">Update recovery needs attention. ${escape(error)}</p>${button('zero.openGitSourceControl','Open Source Control')}${refOnlyReview?button('zero.reviewInterruptedRefOnlyUpdate','Review interrupted update…'):button('zero.inspectRetainedConflictCopies','Inspect retained conflict copies…')}</div>`;
  if (recovery) {
    const {file,conflict,token} = selection(recovery);
    if(recovery.readyToCommit && !recovery.nativeRequired && recovery.files.length===0) return `<div class="update-choices" role="region" aria-label="Update recovery"><p id="update-recovery-heading" tabindex="-1" class="muted status">The choices are saved. Continue the update to finish the merge commit. Cancellation is temporarily unavailable in Zero; use Source Control to review it.</p>${button('zero.continueUpdate','Continue update',token)}${button('zero.inspectRetainedConflictCopies','Inspect retained conflict copies…')}</div>`;
    return `<div class="update-choices" role="region" aria-label="Update recovery"><p id="update-recovery-heading" tabindex="-1" class="muted status">Conflict choices and cancellation are temporarily unavailable in Zero. Open Source Control to review this update; retained copies are kept.</p>${button('zero.openGitSourceControl','Open Source Control')}${!recovery.nativeRequired&&file?.kind==='text'&&conflict?button('zero.compareUpdate','Open full comparison',token):''}${button('zero.inspectRetainedConflictCopies','Inspect retained conflict copies…')}</div>`;
  }
  if (!pending) return '';
  if(pending.operation==='reftable-ref-only')return `<div class="update-choices" role="region" aria-label="Update recovery"><p class="muted status">${escape(uploadMessage(pending))}</p>${button('zero.openGitSourceControl','Open Source Control')}</div>`;
  let action;
  if (pending.kind === 'destination-changed') action = button('zero.reviewPendingSync','Review earlier sync…');
  else if (pending.kind === 'remote-missing' && pending.operation!=='merge') action = button('zero.retryBranchSync','Review branch creation…');
  else if (pending.kind === 'behind') action = button(pending.operation==='merge'||pending.branch === 'main' ? 'zero.syncProject' : 'zero.updateBranchFromGitHub',pending.operation==='merge'||pending.branch === 'main' ? 'Update from main' : 'Update branch from GitHub');
  else if (pending.kind === 'auth') action = button('zero.reconnectGitHub','Sign in to GitHub');
  else if (pending.kind === 'access') action = button('zero.startPage','Review GitHub access');
  else if(pending.operation==='merge')action=button(pending.kind==='protected'?'zero.openGitSourceControl':'zero.finishChange',pending.kind==='protected'?'Open Source Control':'Retry Merge to main');
  else if (pending.pushStarted!==false && ['network','ready'].includes(pending.kind)) action=button('zero.checkPush','Check GitHub status');
  else if (pending.kind === 'unconfirmed' || pending.kind === 'changed') action = button('zero.checkPush','Check GitHub status');
  else if (pending.kind === 'protected') action = pending.branch === 'main' ? button('zero.startChange','Create feature branch…') : button('zero.openGitSourceControl','Open Source Control');
  else action = button('zero.retryBranchSync','Retry sync');
  const newerSync=(!pending.operation||pending.operation==='branch')&&['behind','unconfirmed','changed'].includes(pending.kind)?button('zero.retryBranchSync','Sync saved commits…'):'';
  const recheck=pending.kind==='remote-missing'&&pending.operation!=='merge'?button('zero.checkPush','Check GitHub status'):'';
  return `<div class="update-choices" role="region" aria-label="Push recovery"><p class="muted status">${escape(uploadMessage(pending))}</p>${action}${newerSync}${recheck}${pending.kind==='destination-changed'?'':button('zero.reviewPendingSync','Review earlier sync…')}</div>`;
}
module.exports = {panel,selection,uploadMessage,localReminderMessage};
