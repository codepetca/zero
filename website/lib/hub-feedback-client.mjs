const REPOSITORY=/^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
export function problemLink({title,repositoryHref,playHref,sourceCommit,version},issuesEnabled) {
  if(!REPOSITORY.test(repositoryHref)||repositoryHref.split('/').at(-1)==='.'||repositoryHref.split('/').at(-1)==='..')throw new Error('Use a known GitHub repository.');
  const destination=issuesEnabled===true?repositoryHref:'https://github.com/codepetca/zero';
  const context=[`Project: ${String(title).slice(0,200)}`,`Repository: ${repositoryHref}`,playHref?`Play: ${playHref}`:null,version?`Version: ${version}`:null,sourceCommit?`Shared source: ${sourceCommit}`:null].filter(Boolean);
  const body=[...context,'','What happened?','','Steps to reproduce:','1. ','','What did you expect?','','Browser/device:'].join('\n');
  return `${destination}/issues/new?${new URLSearchParams({title:`Problem with ${String(title).slice(0,100)}`,body})}`;
}
export function siteStatus(site) {
  if(!site||site.status==='not-checked')return null;
  if(site.status==='reachable')return 'Site reachable';
  if(site.status==='unreachable')return 'Site unavailable';
  return 'Site check unavailable';
}
