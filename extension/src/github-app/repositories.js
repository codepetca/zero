'use strict';
const core = require('../core');

const API = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const levels = {read:1,write:2,admin:3};
const safeOwner = value => typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);
const safeName = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value) && !['.','..'].includes(value) && !value.endsWith('.git');
const positive = value => Number.isSafeInteger(value) && value > 0;
function failure(message, code, repositoryUrl) {
  const error = new Error(message);
  if (code) error.code = code;
  if (repositoryUrl) error.repositoryUrl = repositoryUrl;
  return error;
}
function cancelled(signal) { if (signal?.aborted) throw failure('GitHub operation cancelled.', 'cancelled'); }
function capabilities(actual, required) {
  return Object.entries(required).every(([name,level]) => levels[level] && (levels[actual?.[name]] || 0) >= levels[level]);
}
function createGitHubAppRepositories({authentication,configuration,fetchImpl=globalThis.fetch,now=Date.now}={}) {
  // An uncertain POST is never repeated by this instance. Recovery is read-only
  // access(repositoryUrl); the caller must retain/display that URL across restarts.
  const uncertain = new Set(), creating = new Set();
  function configured() {
    if (!configuration || !positive(configuration.appId) || !safeOwner(configuration.owner) || !safeName(configuration.slug)) throw failure('Zero GitHub development is not configured yet.', 'unconfigured');
  }
  function setupFailure(message,code,repositoryUrl) {
    const error=failure(message,code,repositoryUrl);
    error.actionUrl=`https://github.com/apps/${configuration.slug}/installations/new`;
    return error;
  }
  async function current(ticket) {
    await authentication.assertCurrent(ticket);
    const session = authentication.assertCurrentNow(ticket);
    if (!session || !/^[1-9]\d*$/.test(session.accountId || '') || !session.accessToken || /[\r\n\0]/.test(session.accessToken)) throw failure('Reconnect GitHub using your personal account.', 'authentication-required');
    return session;
  }
  async function api(ticket, method, suffix, {body,allow404=false,signal,onSend}={}) {
    cancelled(signal);
    await current(ticket);
    cancelled(signal);
    const token = authentication.assertCurrentNow(ticket).accessToken;
    let response;
    try {
      onSend?.();
      response = await fetchImpl(API + suffix, {method,redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':API_VERSION,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    } catch { throw failure('GitHub could not be reached. Check your connection and try again.', 'network-error'); }
    await current(ticket);
    cancelled(signal);
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      const error = failure(response.status===401?'GitHub sign-in expired. Reconnect GitHub.':response.status===403?'GitHub refused access. Check Zero’s selected repositories and App permissions.':`GitHub could not complete this request (HTTP ${response.status}).`, 'github-error');
      if(response.status===403)error.actionUrl=`https://github.com/apps/${configuration.slug}/installations/new`;
      error.status = response.status; throw error;
    }
    try { return await response.json(); }
    catch { throw failure('GitHub returned an invalid response. Recheck the repository.', 'invalid-response'); }
  }
  async function installation(ticket, required, signal) {
    const accountId = String(ticket.session.accountId);
    for (let page=1;page<=100;page++) {
      const result = await api(ticket,'GET',`/user/installations?per_page=100&page=${page}`,{signal});
      if (!Array.isArray(result?.installations) || result.installations.length>100) throw failure('GitHub returned an invalid installation list.', 'invalid-response');
      const matches = result.installations.filter(item=>item.app_id===configuration.appId && item.app_slug===configuration.slug && String(item.account?.id)===accountId);
      if (matches.length>1) throw failure('GitHub returned conflicting Zero installations.', 'invalid-response');
      if (matches.length) {
        const item=matches[0];
        if (!positive(item.id) || item.account?.type!=='User' || item.target_type!=='User' || item.suspended_at || !['selected','all'].includes(item.repository_selection)) throw setupFailure('Install or resume Zero on your personal GitHub account using selected repositories.', 'installation-required');
        if (!capabilities(item.permissions,required)) throw setupFailure('Zero’s GitHub App installation needs the requested repository permissions. Review its permissions on GitHub.', 'permission-required');
        return item;
      }
      if (result.installations.length<100) break;
    }
    throw setupFailure('Install Zero on your personal GitHub account and select the repository you want to use.', 'installation-required');
  }
  function repository(value, parsed, accountId) {
    if (!value || !positive(value.id) || !positive(value.owner?.id) || String(value.owner.id)!==String(accountId) || value.owner.type!=='User' || !safeOwner(value.owner.login) || !safeName(value.name) || value.full_name!==`${value.owner.login}/${value.name}` || value.full_name.toLowerCase()!==parsed.page.slice('https://github.com/'.length).toLowerCase() || value.html_url!==`https://github.com/${value.full_name}` || value.clone_url!==`${value.html_url}.git` || typeof value.default_branch!=='string' || !value.default_branch || typeof value.private!=='boolean') throw failure('Use a repository owned by the same personal GitHub account connected to Zero.', 'repository-mismatch');
    return value;
  }
  async function member(ticket, installed, repo, signal) {
    for (let page=1;page<=100;page++) {
      const result=await api(ticket,'GET',`/user/installations/${installed.id}/repositories?per_page=100&page=${page}`,{signal});
      if (!Array.isArray(result?.repositories) || result.repositories.length>100) throw failure('GitHub returned an invalid selected-repository list.', 'invalid-response');
      const found=result.repositories.find(item=>item.id===repo.id);
      if (found) {
        repository(found,core.parseRepositoryUrl(repo.html_url),ticket.session.accountId);
        return;
      }
      if (result.repositories.length<100) break;
    }
    throw setupFailure('This repository is not available to Zero. Add it to Zero’s selected repositories on GitHub, then try again.', 'repository-not-selected',repo.html_url);
  }
  async function access(repositoryUrl,{ticket,permissions={contents:'write'},signal}={}) {
    configured(); cancelled(signal);
    const parsed=core.parseRepositoryUrl(repositoryUrl);
    ticket ||= await authentication.capture();
    await current(ticket);
    const installed=await installation(ticket,permissions,signal);
    let data;
    try {data=await api(ticket,'GET','/repos/'+parsed.page.slice('https://github.com/'.length),{signal});}
    catch(error){if(error.status===404)throw setupFailure('GitHub could not find this repository through Zero. Check the URL and Zero’s selected repositories.', 'repository-not-selected',parsed.page);throw error;}
    const repo=repository(data,parsed,ticket.session.accountId);
    if (permissions.contents==='write' && repo.permissions?.push!==true) throw failure('Your GitHub account needs permission to push to this repository.', 'permission-required');
    await member(ticket,installed,repo,signal);
    await current(ticket);
    return Object.freeze({ticket,repository:Object.freeze(repo),installation:Object.freeze(installed),checkedAt:now()});
  }
  function uncertainCreation(url) {
    return failure(`GitHub may have created this repository: ${url}. Check it and use Clone from GitHub to recover before creating another project.`, 'creation-uncertain',url);
  }
  async function create({name,private:privacy,template}={}, {ticket:reviewedTicket,onProgress=()=>{},signal}={}) {
    configured();cancelled(signal);
    if (!safeName(name) || typeof privacy!=='boolean') throw failure('Choose a repository name and explicitly choose Public or Private.', 'invalid-project');
    if (template && (Object.keys(template).some(key=>!['owner','repo'].includes(key)) || template.owner!==configuration.owner || !safeName(template.repo))) throw failure('Choose a verified Zero project template.', 'invalid-template');
    const ticket=reviewedTicket || await authentication.capture();await current(ticket);
    const user=await api(ticket,'GET','/user',{signal});
    if (!positive(user?.id) || String(user.id)!==String(ticket.session.accountId) || user.type!=='User' || !safeOwner(user.login)) throw failure('Create projects using the personal GitHub account connected to Zero.', 'account-mismatch');
    const url=`https://github.com/${user.login}/${name}`, key=url.toLowerCase();
    if (uncertain.has(key)) throw uncertainCreation(url);
    if (creating.has(key)) throw failure('This repository is already being created. Wait for the current operation.', 'creation-in-progress',url);
    creating.add(key);
    let sent=false,accepted=false;
    try {
      await installation(ticket,{repository_creation:'write',contents:template?'read':'write'},signal);
      if (await api(ticket,'GET',`/repos/${user.login}/${name}`,{allow404:true,signal})) throw failure(`This repository already exists: ${url}. Use Clone from GitHub to open it.`, 'repository-exists',url);
      if (template) {
        const source=await api(ticket,'GET',`/repos/${template.owner}/${template.repo}`,{signal});
        if (source?.is_template!==true || source.private!==false || source.full_name?.toLowerCase()!==`${template.owner}/${template.repo}`.toLowerCase()) throw failure('The verified Zero template is not publicly available. No repository was created.', 'invalid-template');
      }
      onProgress('Creating your GitHub repository…');
      const result=await api(ticket,'POST',template?`/repos/${template.owner}/${template.repo}/generate`:'/user/repos',{body:{name,private:privacy,...(template?{owner:user.login,include_all_branches:false}:{auto_init:false})},signal,onSend:()=>{sent=true;}});
      accepted=true;
      const created=repository(result,core.parseRepositoryUrl(url),user.id);
      if (created.private!==privacy) throw failure('GitHub returned a different repository visibility.', 'repository-mismatch');
      onProgress('Checking Zero’s access to your new repository…');
      const verified=await access(created.html_url,{ticket,signal});
      if (verified.repository.id!==created.id || verified.repository.private!==privacy) throw failure('The created repository changed during verification.', 'repository-mismatch');
      return Object.freeze({...verified,created:true});
    } catch(error) {
      // HTTP rejection is definitive; a lost/invalid response, session drift or
      // failed post-create membership check leaves a potentially existing repo.
      if (sent && (accepted || !(error.code==='github-error' && error.status>=400 && error.status<500))) {uncertain.add(key);throw uncertainCreation(url);}
      throw error;
    } finally {creating.delete(key);}
  }
  return {access,create};
}
module.exports={createGitHubAppRepositories};
