'use strict';

// The caller must consume the single-use receipt from workflow.finishPrepared
// and bind each callback to the same reviewed repository and GitHub session.
// A confirmed merge remains successful even when cleanup cannot be confirmed.
async function cleanupAfterMerge({receipt, inspectLocal, readRemote, deleteRemote, deleteLocal}) {
  if (!receipt || typeof receipt.branch !== 'string' || receipt.branch === 'main' ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.featureHead || '') ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.head || '') ||
      receipt.featureHead.length !== receipt.head.length ||
      ![inspectLocal, readRemote, deleteRemote, deleteLocal].every(fn => typeof fn === 'function')) {
    throw new Error('The confirmed merge cleanup is not available.');
  }
  const result = (local, remote, reason) => Object.freeze({local, remote, ...(reason ? {reason} : {})});
  try {
    await inspectLocal();
    if (await readRemote('main') !== receipt.head) return result('kept', 'kept', 'GitHub main changed; the branch was kept for review.');
  } catch {
    return result('kept', 'kept', 'The project or GitHub connection changed; the branch was kept for review.');
  }
  let feature;
  try { feature = await readRemote(receipt.branch); }
  catch { return result('kept', 'uncertain', 'GitHub branch status could not be confirmed; the local branch was kept.'); }
  if (feature !== null && feature !== receipt.featureHead) return result('kept', 'kept', 'The GitHub branch changed; both branches were kept.');
  try { await inspectLocal(); }
  catch { return result('kept', feature === null ? 'absent' : 'kept', 'The local branch or project changed; it was kept for review.'); }
  try {
    if (await readRemote('main') !== receipt.head) return result('kept', feature === null ? 'absent' : 'kept', 'GitHub main changed; the branch was kept for review.');
  } catch {
    return result('kept', feature === null ? 'absent' : 'kept', 'GitHub main could not be checked again; the local branch was kept.');
  }
  let remote = 'absent';
  if (feature !== null) {
    try {
      await deleteRemote();
      if (await readRemote(receipt.branch) !== null) return result('kept', 'uncertain', 'GitHub branch deletion could not be confirmed; the local branch was kept.');
      remote = 'deleted';
    } catch {
      return result('kept', 'uncertain', 'GitHub branch deletion could not be confirmed; the local branch was kept.');
    }
  } else {
    try {
      if (await readRemote(receipt.branch) !== null) return result('kept', 'kept', 'The GitHub branch appeared during cleanup; the local branch was kept.');
    } catch {
      return result('kept', 'uncertain', 'GitHub branch status could not be confirmed; the local branch was kept.');
    }
  }
  try {
    await deleteLocal();
    return result('deleted', remote);
  } catch {
    return result('uncertain', remote, 'The local branch deletion could not be confirmed. Inspect the branch list before retrying.');
  }
}

module.exports = {cleanupAfterMerge};
