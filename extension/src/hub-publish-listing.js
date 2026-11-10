'use strict';

function createHubPublishListing(authentication, request = globalThis.fetch) {
  return async function listPublication(saved, {signal, beforeSend}) {
    const {resume, sha, account} = saved;
    if (!Number.isSafeInteger(resume?.repositoryId) || !Number.isSafeInteger(resume.runId)) return {status:'pending'};
    try {
      const ticket = await authentication.capture();
      const session = authentication.assertCurrentNow(ticket);
      if (String(session.accountId) !== String(account)) return {status:'pending'};
      signal.throwIfAborted();
      beforeSend();
      const response = await request('https://zero.codepet.ca/api/hub/listings', {
        method:'POST', redirect:'error', signal:AbortSignal.any([signal, AbortSignal.timeout(14_000)]),
        headers:{'Content-Type':'application/json', Authorization:'Bearer ' + session.accessToken},
        body:JSON.stringify({action:'publish', repositoryId:String(resume.repositoryId),
          repositoryUrl:resume.repository, runId:String(resume.runId), commit:sha})
      });
      if (response.status === 404) return {status:'unavailable'};
      if (!response.ok) return {status:'pending'};
      const result = await response.json();
      if (result.status === 'listed' || result.status === 'unlisted') return result;
    } catch { /* Pages publication already succeeded. Retry listing on the next Publish action. */ }
    return {status:'pending'};
  };
}

module.exports = {createHubPublishListing};
