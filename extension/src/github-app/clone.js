'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const core=require('../core');
const {assertNoUrlRewrites}=require('../github');
const execute=promisify(execFile);

function cancellation(signal) {if(signal?.aborted)throw Object.assign(Error('Cloning cancelled.'),{code:'cancelled'});}
function cleanEnvironment(source) {
  const env={...source};
  for(const key of Object.keys(env)) if (/^GIT_(?:CONFIG(?:_|$)|TRACE|CURL_VERBOSE$|SSL_NO_VERIFY$|ASKPASS$|DIR$|WORK_TREE$|COMMON_DIR$|INDEX_FILE$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|NAMESPACE$|TEMPLATE_DIR$)|^SSH_ASKPASS$|^SSLKEYLOGFILE$/i.test(key))delete env[key];
  env.GIT_TERMINAL_PROMPT='0';env.GIT_ASKPASS='';env.SSH_ASKPASS='';
  env.GIT_TRACE2='0';env.GIT_TRACE2_EVENT='0';env.GIT_TRACE2_PERF='0';
  return env;
}
function createGitHubAppClone({authentication,repositories,spawn=execute,environment=process.env,localRun=core.git}={}) {
  return async function clone({repositoryUrl,parentPath,signal}={}) {
    cancellation(signal);
    const requested=core.parseRepositoryUrl(repositoryUrl);
    if(typeof parentPath!=='string'||!path.isAbsolute(parentPath))throw Error('Choose an absolute folder for your project.');
    const parent=await fs.realpath(parentPath),parentStat=await fs.lstat(parentPath);
    if(!parentStat.isDirectory()||parentStat.isSymbolicLink())throw Error('Choose an ordinary folder for your project.');
    // Keep new standalone projects outside existing repositories, including
    // worktree .git files. No existing directory is reused or removed.
    for(let directory=parent;;directory=path.dirname(directory)) {
      const marker=await fs.lstat(path.join(directory,'.git')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(marker)throw Error('Choose a clone folder outside an existing Git repository.');
      if(path.dirname(directory)===directory)break;
    }
    const version=/^git version (\d+)\.(\d+)(?:\.|\s|$)/.exec(await localRun(parent,['--version']));
    if(!version||Number(version[1])<2||(Number(version[1])===2&&Number(version[2])<31))throw Error('Zero needs Git 2.31 or newer for isolated GitHub credentials. Update Git, then clone again.');
    const access=await repositories.access(requested.page,{permissions:{contents:'read'},signal});
    const {ticket,repository}=access;
    const repositoryId=repository.id,installationId=access.installation?.id;
    if(!Number.isSafeInteger(repositoryId)||repositoryId<1||!Number.isSafeInteger(installationId)||installationId<1)throw Error('GitHub did not identify the repository and Zero installation.');
    const remote=core.parseRepositoryUrl(repository.html_url).remote;
    if(remote.toLowerCase()!==requested.remote.toLowerCase()||repository.clone_url!==remote)throw Error('The GitHub clone destination changed. Choose Clone from GitHub again.');
    const name=repository.name;
    if(typeof name!=='string'||name==='.'||name==='..'||!name||/[\\/\x00-\x1f:<>"|?*]/.test(name)||/[ .]$/.test(name)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('This repository name cannot be used as a project folder on supported systems.');
    const destination=path.join(parent,name);
    let reserved=false,hooks,env,settings=[];
    try {
      cancellation(signal);
      // mkdir without recursive is the reservation: concurrent calls cannot
      // overwrite an existing project or another in-progress clone.
      try {await fs.mkdir(destination,{mode:0o700});reserved=true;}
      catch(error){if(error.code==='EEXIST')throw Error('That project folder already exists. Open it or choose another parent folder.');throw error;}
      const reservedStat=await fs.lstat(destination);
      hooks=await fs.mkdtemp(path.join(os.tmpdir(),'zero-clone-hooks-'));
      const configFile=path.join(hooks,'empty-config');await fs.writeFile(configFile,'',{mode:0o600});
      const templateDirectory=path.join(hooks,'empty-template');await fs.mkdir(templateDirectory);
      await authentication.assertCurrent(ticket);
      await assertNoUrlRewrites(parent,localRun);
      // Recheck the reserved inode and parent immediately before the final
      // synchronous session check. The clone child receives no persistent Git
      // configuration, templates, hooks, helpers or custom filter programs.
      const actual=await fs.lstat(destination),currentParent=await fs.lstat(parentPath);
      if(currentParent.isSymbolicLink()||currentParent.dev!==parentStat.dev||currentParent.ino!==parentStat.ino||actual.isSymbolicLink()||!actual.isDirectory()||actual.dev!==reservedStat.dev||actual.ino!==reservedStat.ino||await fs.realpath(parentPath)!==parent||(await fs.readdir(destination)).length)throw Error('The clone folder changed. Choose another location and try again.');
      cancellation(signal);
      const session=authentication.assertCurrentNow(ticket);
      if(!session||typeof session.then==='function'||!session.accessToken||/[\r\n\0]/.test(session.accessToken)||String(session.accountId)!==String(repository.owner?.id))throw Error('Your GitHub sign-in changed. Reconnect and clone again.');
      env=cleanEnvironment(environment);
      env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=configFile;env.GIT_CONFIG_SYSTEM=configFile;
      env.GIT_TEMPLATE_DIR=templateDirectory;
      const scoped=`http.${remote}.`;
      settings=[['credential.helper',''],[`credential.${remote}.helper`,''],['core.askPass',''],['core.hooksPath',hooks],['core.fsmonitor','false'],['http.extraHeader',''],[scoped+'extraHeader',''],[scoped+'extraHeader',`Authorization: Basic ${Buffer.from(`x-access-token:${session.accessToken}`).toString('base64')}`],[scoped+'followRedirects','false'],[scoped+'sslVerify','true'],[scoped+'curloptResolve',''],[scoped+'cookieFile',''],[scoped+'saveCookies','false'],['protocol.allow','never'],['protocol.https.allow','always'],['submodule.recurse','false'],['fetch.recurseSubmodules','false']];
      env.GIT_CONFIG_COUNT=String(settings.length);
      settings.forEach(([key,value],index)=>{env[`GIT_CONFIG_KEY_${index}`]=key;env[`GIT_CONFIG_VALUE_${index}`]=value;});
      // Dispatch immediately after the synchronous guard. Never expose raw Git
      // output or interpolate a token in an argument, URL, error or file.
      try {await spawn('git',['clone','--no-recurse-submodules','--',remote,destination],{cwd:parent,env,signal,timeout:120000,maxBuffer:1024*1024});}
      catch {cancellation(signal);throw Error('GitHub cloning did not finish. Check your connection and Zero’s repository access.');}
      // Remove credentials before any local verification process is dispatched.
      for(const key of Object.keys(env))if(/^GIT_CONFIG_(?:COUNT|KEY_|VALUE_)/.test(key))delete env[key];
      settings.length=0;
      cancellation(signal);
      await authentication.assertCurrent(ticket);
      const completedStat=await fs.lstat(destination),completedParent=await fs.lstat(parentPath);
      if(completedStat.isSymbolicLink()||!completedStat.isDirectory()||completedStat.dev!==reservedStat.dev||completedStat.ino!==reservedStat.ino||completedParent.isSymbolicLink()||completedParent.dev!==parentStat.dev||completedParent.ino!==parentStat.ino)throw Error('The clone folder changed during cloning.');
      const gitDirectory=await fs.lstat(path.join(destination,'.git'));
      if(!gitDirectory.isDirectory()||gitDirectory.isSymbolicLink())throw Error('Git did not create a standalone project repository.');
      // These read-only commands also run with isolated, credential-free config.
      async function verify(args) {const {stdout}=await execute('git',args,{cwd:destination,env,timeout:15000,maxBuffer:1024*1024});return stdout.trim();}
      if(await fs.realpath(await verify(['rev-parse','--show-toplevel']))!==destination||await verify(['remote','get-url','origin'])!==remote||!/^[a-f0-9]{40,64}$/.test(await verify(['rev-parse','--verify','HEAD'])))throw Error('Git did not confirm the expected project repository and commit.');
      const final=await repositories.access(repository.html_url,{ticket,permissions:{contents:'read'},signal});
      if(final.repository.id!==repositoryId||final.installation.id!==installationId)throw Error('GitHub repository access changed during cloning.');
      authentication.assertCurrentNow(ticket);
      return destination;
    } catch(error) {
      // Preserve even an empty reservation; never recursively delete a path
      // after an external child or user could have populated it.
      if(!reserved)throw error;
      const result=Error(`${error.code==='cancelled'?'Cloning cancelled.':/folder changed/.test(error.message)?'The clone folder changed.':'Cloning did not finish.'} Your project folder was preserved: ${destination}. Check it before retrying.`);
      result.code=error.code==='cancelled'?'cancelled':'clone-incomplete';result.destinationPath=destination;result.repositoryUrl=repository.html_url;throw result;
    } finally {
      for(const key of Object.keys(env||{}))if(/^GIT_CONFIG_/.test(key))delete env[key];
      settings.length=0;
      if(hooks)await fs.rm(hooks,{recursive:true,force:true}).catch(()=>{});
    }
  };
}
module.exports={createGitHubAppClone};
