'use strict';

const path = require('node:path');
const core = require('./core');
const commitId = value => typeof value==='string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

// Recent-project metadata is only a hint: the repository currently on disk is
// the authority. Never change or remove a student's local copy.
function createGameJamProjectOpener({vscode,authentication,repositories,project,recentProjects,projectFolders,active=()=>true}) {
  async function openGameJamProject({repositoryUrl,repositoryId,ticket,preferredPath}) {
    const destination = core.parseRepositoryUrl(repositoryUrl).page;
    const checkAccount = async () => {
      if (!active()) throw new Error('Opening the Game Jam project was cancelled.');
      await authentication.assertCurrent(ticket);
      if (!active()) throw new Error('Opening the Game Jam project was cancelled.');
    };
    const env = Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
    Object.assign(env,{GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:''});
    const git = (root,args) => core.git(root,args,{env});

    async function matchingRoot(root) {
      try {
        if (await core.resolveProject([root]) !== root) return;
        const gitRoot = await core.repositoryRoot(root,git);
        // Previously linked copies can still use the older student-template layout.
        if (!gitRoot || gitRoot !== root && path.join(gitRoot,'student-template') !== root) return;
        const [fetchUrl,pushUrl] = await Promise.all([
          git(gitRoot,['remote','get-url','--all','origin']),
          git(gitRoot,['remote','get-url','--push','--all','origin'])
        ]);
        const fetched = core.parseRepositoryUrl(fetchUrl);
        if (fetched.page.toLowerCase() === destination.toLowerCase() &&
            core.parseRepositoryUrl(pushUrl).remote === fetched.remote) return gitRoot;
      } catch {return;}
    }
    async function checkRepository(signal=AbortSignal.timeout(20_000)) {
      await checkAccount();
      const repo=await repositories.readOwnedRepository(destination,{ticket,signal});
      if(String(repo.id)!==repositoryId || repo.private!==false)throw Error('The public Game Jam repository changed. Choose the project again.');
      await checkAccount();
      return repo;
    }
    let anchor;
    const comparisons = new Map();
    async function loadAnchor() {
      const signal=AbortSignal.timeout(20_000);
      const repo=await checkRepository(signal);
      const head=await repositories.readRepositoryBranchHead(destination,{ticket,branch:repo.default_branch,signal});
      await checkRepository(signal);
      return {branch:repo.default_branch,head,signal};
    }
    async function matches(root) {
      const gitRoot = await matchingRoot(root);
      if (!gitRoot) return false;
      anchor ||= loadAnchor();
      const {branch,head,signal} = await anchor;
      if (!commitId(head)) return false;
      const localHead = await git(gitRoot,['rev-parse','--verify','HEAD^{commit}']).catch(()=>undefined);
      if (!commitId(localHead)) return false;
      if (localHead===head) return true;
      // A URL can be reused after deletion. Start from the checked-out history.
      // Keep a feature branch eligible by using its shared origin history.
      const tracking = await git(gitRoot,['rev-parse','--verify',`refs/remotes/origin/${branch}^{commit}`]).catch(()=>undefined);
      const shared = commitId(tracking) ? await git(gitRoot,['merge-base',localHead,tracking]).catch(()=>undefined) : undefined;
      const witness = commitId(shared) ? shared : localHead;
      if (witness===head) return true;
      if (!comparisons.has(witness)) {
        const comparison = await repositories.compareCommits(destination,{ticket,base:witness,head,signal});
        comparisons.set(witness,comparison?.outgoing===0 && comparison.incoming>0);
      }
      return comparisons.get(witness);
    }
    await checkAccount();
    let current;
    try {current = await project();} catch { /* No single open Zero project. */ }
    await checkAccount();
    if (current && await matches(current)) {
      await checkRepository();
      if (await matches(current)) {await checkAccount();return {status:'current',projectPath:current};}
    }
    const recent = await recentProjects.list(ticket.session.accountId);
    await checkAccount();
    for (const item of [...(preferredPath ? [{path:preferredPath}] : []), ...recent]) {
      if (!await matches(item.path)) continue;
      await checkAccount();
      const assertCurrent = async () => {
        await checkRepository();
        if (!await matches(item.path)) throw new Error('The local project’s GitHub repository changed. Try opening it again.');
        await checkAccount();
      };
      await assertCurrent();
      await projectFolders.openLocal({projectPath:item.path,assertCurrent});
      return {status:'open-requested',projectPath:item.path};
    }
    const choice = await vscode.window.showInformationMessage(
      'Zero couldn’t find a matching local checkout.',
      {modal:true,detail:'Clone it to a local folder to open and work on your Game Jam project.'},
      'Clone & open'
    );
    if (choice !== 'Clone & open' || !active()) return {status:'cancelled'};
    await checkAccount();
    const result = await projectFolders.clone({repositoryUrl:destination,expectedRepositoryId:repositoryId,assertCurrent:()=>checkRepository()});
    return result ? {status:'clone-requested',projectPath:result} : {status:'cancelled'};
  }
  return {openGameJamProject};
}
module.exports = {createGameJamProjectOpener};
