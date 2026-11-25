'use strict';

const path = require('node:path');
const core = require('./core');

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
    async function matches(root) {
      try {
        if (await core.resolveProject([root]) !== root) return false;
        const gitRoot = await core.repositoryRoot(root);
        // Previously linked copies can still use the older student-template layout.
        if (!gitRoot || gitRoot !== root && path.join(gitRoot,'student-template') !== root) return false;
        const [fetchUrl,pushUrl] = await Promise.all([
          core.git(root,['remote','get-url','--all','origin']),
          core.git(root,['remote','get-url','--push','--all','origin'])
        ]);
        const fetched = core.parseRepositoryUrl(fetchUrl);
        return fetched.page.toLowerCase() === destination.toLowerCase() &&
          core.parseRepositoryUrl(pushUrl).remote === fetched.remote;
      } catch {return false;}
    }
    const checkRepository = async () => {
      await checkAccount();
      const repo=await repositories.readOwnedRepository(destination,{ticket,signal:AbortSignal.timeout(20_000)});
      if(String(repo.id)!==repositoryId || repo.private!==false)throw Error('The public Game Jam repository changed. Choose the project again.');
      await checkAccount();
    };
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
    const result = await projectFolders.clone({repositoryUrl:destination,expectedRepositoryId:repositoryId,assertCurrent:checkRepository});
    return result ? {status:'clone-requested',projectPath:result} : {status:'cancelled'};
  }
  return {openGameJamProject};
}
module.exports = {createGameJamProjectOpener};
