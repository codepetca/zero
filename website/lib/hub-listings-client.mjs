// The POST is never retried here: a lost response may follow a committed change.
export async function updateListing({fetcher = fetch, csrfToken, project, action, signal}) {
  let response;
  try {
    response = await fetcher('/api/hub/listings', {
      method:'POST', redirect:'error', cache:'no-store', signal,
      headers:{'Content-Type':'application/json', 'X-Hub-CSRF':csrfToken},
      body:JSON.stringify({action, repositoryId:project.repositoryId})
    });
  } catch {
    return {outcome:'uncertain', message:'ZeroHub could not confirm whether the change was applied. Refresh your apps before taking another action; a delayed change may still appear.'};
  }
  let result;
  try { result = await response.json(); } catch {
    return {outcome:'uncertain', message:'ZeroHub could not confirm whether the change was applied. Refresh your apps before taking another action; a delayed change may still appear.'};
  }
  if (!response.ok) {
    if (response.status >= 500) return {outcome:'uncertain', message:'ZeroHub could not confirm whether the change was applied. Refresh your apps before taking another action; a delayed change may still appear.'};
    return {outcome:'rejected', message:typeof result?.error === 'string' ? result.error : 'The app listing could not be updated.'};
  }
  if (!result || !['updated','listed','unlisted'].includes(result.status)) {
    return {outcome:'uncertain', message:'ZeroHub could not confirm whether the change was applied. Refresh your apps before taking another action; a delayed change may still appear.'};
  }
  const message = result.status === 'unlisted'
    ? result.reason === 'protected' ? 'Clear protection on your current app to add this app to ZeroHub.' : 'Free up an app slot to add this app to ZeroHub.'
    : result.replaced ? `${project.title} replaced ${result.replaced} on ZeroHub.`
    : action === 'move' ? `${project.title} moved to the back.`
    : action === 'protect' ? `${project.title} is protected.`
    : action === 'unprotect' ? `Protection cleared for ${project.title}.`
    : action === 'unlist' ? `${project.title} removed from ZeroHub.` : `${project.title} added to ZeroHub.`;
  return {outcome:'confirmed', message};
}

export async function requestListings({fetcher = fetch, before, account, signal}) {
  const query = before ? '?' + new URLSearchParams({before}) : '';
  const response = await fetcher('/api/hub/listings' + query, {cache:'no-store', redirect:'error', signal});
  if (!response.ok) throw new Error('Your apps could not be loaded.');
  const data = await response.json();
  if (data.account !== account) throw new Error('Sign in again to see your apps.');
  return data;
}
