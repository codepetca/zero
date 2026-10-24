'use strict';
const path=require('node:path');
const lessonProjects=require('../lesson-projects');
const {assertTutorialTemplateReady}=require('../tutorial-template-readiness');
const core=require('../core');
const {createProjectProgress,throwIfCancelled}=require('../project-folders');
const ORIGINAL_TEMPLATE=Object.freeze({owner:'codepetca',repo:'zero-starter'});
function nameError(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value)||value.includes('..')||value.endsWith('.')||value.toLowerCase().endsWith('.git')||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))return 'Use 1–100 letters, numbers, dots, hyphens or underscores; choose an ordinary folder name.';
}
function createGitHubProjectCommands({vscode,authentication,repositories,folders,extensionPath,project,prepare,active=()=>true,onProgress=()=>{},onRecovery=async()=>{}}){
  const drafts=new Map();let disposed=false;const isActive=()=>!disposed&&active();const progress=createProjectProgress(vscode,isActive);
  async function collect(title,key,{clone=false,defaultName='my-project',preparedTicket}={}){
    if(!isActive())return;
    if(!preparedTicket&&prepare){preparedTicket=await prepare();if(!preparedTicket)return;}
    if(!isActive())return;
    if(!authentication.signedIn)await authentication.signIn();
    if(!isActive())return;
    const ticket=preparedTicket||await authentication.capture();
    await authentication.assertCurrent(ticket);
    const draftKey=key+':'+ticket.session.accountId;
    const draft=drafts.get(draftKey)||{name:defaultName};
    const name=await vscode.window.showInputBox({placeHolder:'Repository name',prompt:`Public repository · ${ticket.session.label}`,value:draft.name,validateInput:nameError});
    if(!name||!isActive())return;
    if(nameError(name))throw Error(nameError(name));
    draft.name=name;drafts.set(draftKey,draft);
    const parent=clone?await folders.chooseCloneParent():undefined;
    if(!isActive()||clone&&!parent)return;
    await authentication.assertCurrent(ticket);
    return {ticket,draft,parent,draftKey};
  }
  async function createRemote(input,template,signal,notify){
    try{throwIfCancelled(signal);return await repositories.create({name:input.draft.name,private:false,...(template?{template}:{})},{ticket:input.ticket,onProgress:notify,signal});}
    catch(error){if(error.code&&error.code!=='creation-uncertain')await onRecovery(undefined);throw error;}
  }
  async function createAndClone(title,template,key,defaultName,preparedTicket){
    const input=await collect(title,key,{clone:true,defaultName,preparedTicket});
    if(!input||!isActive())return;
    await authentication.assertCurrent(input.ticket);
    return progress.run('Create GitHub project',async(signal,reportProgress)=>{
      const notify=text=>{if(isActive()&&!signal.aborted){onProgress(text);reportProgress(text);}};
      throwIfCancelled(signal);
      const intended=core.parseRepositoryUrl(`https://github.com/${input.ticket.session.label}/${input.draft.name}`).page;
      await onRecovery({repositoryUrl:intended,accountId:input.ticket.session.accountId,parentPath:input.parent.fsPath,stage:'creating'});
      notify('Creating your GitHub project…');
      const result=await createRemote(input,template,signal,notify);
      await onRecovery({repositoryUrl:result.repository.html_url,accountId:input.ticket.session.accountId,parentPath:input.parent.fsPath,stage:'created'});
      if(!isActive())throw Error(`Your repository was created at ${result.repository.html_url}. Clone it from Zero when you return.`);
      try{
        throwIfCancelled(signal);notify('Opening your project…');
        const cloned=await folders.clone({repositoryUrl:result.repository.html_url,parent:input.parent,signal});
        throwIfCancelled(signal);
        if(!cloned||!isActive())throw Error('The project was not opened.');
        // Only the next activation can confirm a same-window switch was accepted.
        // Native dirty-editor Cancel can resolve openFolder without switching.
        drafts.delete(input.draftKey);
        notify('Project created');
        return result;
      }catch(error){throw Error(`Your GitHub repository is ready at ${result.repository.html_url}. ${error.message} Use Clone from GitHub to continue; the repository was kept.`);}
    });
  }
  async function startTutorial(){
    const projects=await lessonProjects.loadBundle(extensionPath);
    if(!isActive())return;
    const preparedTicket=prepare?await prepare():undefined;
    if(prepare&&!preparedTicket)return;
    if(!isActive())return;
    const choice=await vscode.window.showQuickPick(projects.map(item=>({label:item.title,description:`Lessons ${{greeting:'0–2',study:'3–7',game:'8–12'}[item.id]}`,project:item})),{title:'Start tutorial'});
    if(!choice||!isActive())return;
    assertTutorialTemplateReady(choice.project);
    const [owner,repo]=choice.project.template.repository.split('/');
    return createAndClone(choice.project.title,{owner,repo},choice.project.id,`my-${choice.project.id}`,preparedTicket);
  }
  async function createRepository(){
    const root=await project();await lessonProjects.assertOriginalProject(root);
    const repositoryRoot=await core.repositoryRoot(root);
    if(repositoryRoot&&repositoryRoot!==root)throw Error('Open a standalone project before creating its repository.');
    if(repositoryRoot){
      let existing;try{existing=await core.git(root,['remote','get-url','origin']);}catch(error){if(error.code!==2||!/No such remote/i.test(error.stderr||''))throw error;}
      if(existing)throw Error('This project already has a repository. Use its existing GitHub connection.');
    }
    const input=await collect('Create repository','existing:'+root,{defaultName:path.basename(root)});
    if(!input||!isActive())return;
    if(await project()!==root)throw Error('The student project changed. Create the repository again from the intended project.');
    await authentication.assertCurrent(input.ticket);
    return progress.run('Create GitHub repository',async(signal,reportProgress)=>{
      const notify=text=>{if(isActive()&&!signal.aborted){onProgress(text);reportProgress(text);}};
      throwIfCancelled(signal);
      const intended=core.parseRepositoryUrl(`https://github.com/${input.ticket.session.label}/${input.draft.name}`).page;
      await onRecovery({repositoryUrl:intended,accountId:input.ticket.session.accountId,projectRoot:root,stage:'creating'});
      notify('Creating your GitHub repository…');
      const result=await createRemote(input,undefined,signal,notify);
      if(!isActive()||await project()!==root)throw Error(`Your repository was created at ${result.repository.html_url}. Open the intended project and Connect to GitHub to use it.`);
      await onRecovery({repositoryUrl:result.repository.html_url,accountId:input.ticket.session.accountId,projectRoot:root,stage:'created'});
      try{throwIfCancelled(signal);await authentication.assertCurrent(input.ticket);throwIfCancelled(signal);const connected=await core.connectRepository(root,result.repository.html_url,async()=>false);throwIfCancelled(signal);if(!connected)throw Error('The existing repository connection was kept.');}
      catch(error){throw Error(`Your repository was created at ${result.repository.html_url}. ${error.message} Use Connect to GitHub to continue; the repository was kept.`);}
      drafts.delete(input.draftKey);await onRecovery(undefined);notify('Repository connected');return result;
    });
  }
  async function resumeCreated(record){
    if(!record||typeof record.repositoryUrl!=='string'||!/^\d+$/.test(record.accountId||''))throw Error('This recovery record is incomplete. Check the repository on GitHub before connecting or cloning it.');
    const destination=core.parseRepositoryUrl(record.repositoryUrl);
    if(!isActive())return;
    if(!authentication.signedIn)await authentication.signIn();
    if(!isActive())return false;
    const ticket=await authentication.capture();
    if(ticket.session.accountId!==record.accountId)throw Error('Sign in with the GitHub account that created this project to resume it.');
    return progress.run('Resume GitHub project',async signal=>{
      throwIfCancelled(signal);
      await repositories.access(destination.page,{ticket,permissions:{contents:'write'},signal});
      throwIfCancelled(signal);
      if(!isActive())return false;
      await authentication.assertCurrent(ticket);
      if(record.projectRoot){
        const root=await project();
        if(root!==record.projectRoot)throw Error('Open the original local project before resuming its repository connection.');
        await lessonProjects.assertOriginalProject(root);
        await authentication.assertCurrent(ticket);
        if(!isActive()||await project()!==root)return false;
        throwIfCancelled(signal);const connected=await core.connectRepository(root,destination.page,async()=>false);
        throwIfCancelled(signal);
        if(!connected)throw Error('The existing repository connection was kept.');
        onProgress('Repository connected');
      }else{
        const cloned=await folders.clone({repositoryUrl:destination.page,signal});
        throwIfCancelled(signal);
        if(!cloned||!isActive())return false;
        onProgress('Project cloned');
      }
      if(record.projectRoot)await onRecovery(undefined);return true;
    });
  }
  return {startTutorial,resumeCreated,newProject:()=>createAndClone('New project',ORIGINAL_TEMPLATE,'original','my-project'),createRepository,dispose(){disposed=true;progress.dispose();}};
}
module.exports={createGitHubProjectCommands,nameError};
