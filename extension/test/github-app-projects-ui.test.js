'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const core=require('../src/core');
const {createAuthentication}=require('../src/authentication');
const {createGitHubProjectCommands,nameError}=require('../src/github-app/projects-ui');
const remote='https://github.com/student/my-project';
function bundle(){return {schema:2,projects:[['greeting','0'],['study','3'],['game','8']].map(([id,lesson])=>({id,lesson,title:id,folder:`zero-project-${id}`,template:{repository:`codepetca/zero-tutorial-${id}`,repositoryUrl:`https://github.com/codepetca/zero-tutorial-${id}`,templateHref:`https://github.com/codepetca/zero-tutorial-${id}/generate`},files:[['zero.json',JSON.stringify({name:id,templateVersion:'0.1.0',mainClass:'Main',repositoryRequired:true,tutorialProjectId:id,lessonId:lesson})],['.gitignore','target/\n'],['.vscode/settings.json','{"git.enabled":true}'],['src/main/java/Main.java','class Main {}']].map(([path,content])=>({path,content:Buffer.from(content).toString('base64'),mode:420}))}))};}
async function fixture(t){
 t.mock.method(core,'repositoryRoot',async()=>undefined);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-projects-ui-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'media'));await fs.writeFile(path.join(root,'media','lesson-projects.json'),JSON.stringify(bundle()));
 const calls=[],progress=[],recovery=[],inputs=[],picks=[];let name='my-project',visibility=true,tutorialChoice=true,parent={fsPath:root},current=root,enabled=true,afterName=()=>{},afterPick=()=>{},afterCreate=()=>{},cloneFailure,cloneResult=path.join(root,'my-project');
 let session={id:'session',account:{id:'1',label:'student'},accessToken:'TEST_SECRET',scopes:[]};
 const auth=createAuthentication({getSession:async()=>session,onDidChangeSessions:()=>({dispose(){}})});t.after(()=>auth.dispose());
 const vscode={window:{showInputBox:async options=>{inputs.push(options);afterName();return name;},showQuickPick:async(items,options)=>{picks.push({items,options});afterPick(options);return options.title==='Start tutorial'?(tutorialChoice?items[0]:undefined):visibility===undefined?undefined:items.find(item=>item.private===visibility);}}};
 const folders={chooseCloneParent:async()=>{calls.push(['parent']);return parent;},clone:async input=>{calls.push(['clone',input]);if(cloneFailure)throw cloneFailure;return cloneResult;}};
 const repositories={access:async(url,options)=>{calls.push(['access',url,options]);return {};},create:async(input,options)=>{calls.push(['create',input,options]);afterCreate();return {repository:{html_url:remote}};}};
 const commands=createGitHubProjectCommands({vscode,authentication:auth,repositories,folders,extensionPath:root,project:async()=>current,active:()=>enabled,onProgress:value=>progress.push(value),onRecovery:value=>recovery.push(value)});
 return {root,commands,calls,progress,recovery,inputs,picks,auth,set name(v){name=v;},set visibility(v){visibility=v;},set tutorialChoice(v){tutorialChoice=v;},set parent(v){parent=v;},set current(v){current=v;},set active(v){enabled=v;},set afterName(v){afterName=v;},set afterPick(v){afterPick=v;},set afterCreate(v){afterCreate=v;},set cloneFailure(v){cloneFailure=v;},set cloneResult(v){cloneResult=v;},drift(){session={...session,account:{id:'2',label:'other'}};}};
}
test('repository names are portable folder names including Windows device restrictions',()=>{
 for(const value of ['',null,'../app','a..b','a/b','a\\b',' leading','trailing.','a.git','.git','CON','con.txt','PRN','AUX','nul','COM1','com9.md','LPT1','lpt9.java','x'.repeat(101)])assert.equal(typeof nameError(value),'string',String(value));
 for(const value of ['app','My-Project_2','v1.2','a','x'.repeat(100),'console','com10','lpt10'])assert.equal(nameError(value),undefined,value);
});
test('new original project collects name, explicit privacy and parent before POST then clones exact remote',async t=>{
 const f=await fixture(t);f.visibility=false;await f.commands.newProject();
 assert.equal(f.inputs[0].value,'my-project');assert.match(f.inputs[0].prompt,/student/);assert.equal(f.inputs[0].validateInput('CON'),nameError('CON'));
 assert.deepEqual(f.picks[0].items.map(({label,private:privacy})=>({label,privacy})),[{label:'Private',privacy:true},{label:'Public',privacy:false}]);
 assert.deepEqual(f.calls.map(call=>call[0]),['parent','create','clone']);assert.deepEqual(f.calls[1][1],{name:'my-project',private:false,template:{owner:'codepetca',repo:'zero-starter'}});
 assert.equal(f.calls[1][2].ticket.session.accountId,'1');assert.deepEqual(f.calls[2][1],{repositoryUrl:remote,parent:{fsPath:f.root}});
 assert.equal(f.progress.at(-1),'Project created');assert.deepEqual(f.recovery,[{repositoryUrl:remote,accountId:'1',parentPath:f.root,stage:'creating'},{repositoryUrl:remote,accountId:'1',parentPath:f.root,stage:'created'},undefined]);
});
test('all cancelled form inputs stop before repository creation',async t=>{
 for(const stop of ['name','visibility','parent']){const f=await fixture(t);f[stop]=undefined;await f.commands.newProject();assert.ok(f.calls.every(call=>call[0]!=='create'&&call[0]!=='clone'),stop);}
});
test('invalid names are rejected even when host input validation is bypassed',async t=>{
 const f=await fixture(t);f.name='nul.txt';await assert.rejects(f.commands.newProject(),/ordinary folder name/);assert.equal(f.calls.length,0);
});
test('tutorial creation uses verified bundle template rather than original starter',async t=>{
 const f=await fixture(t);await f.commands.startTutorial();assert.equal(f.inputs[0].value,'my-greeting');assert.deepEqual(f.calls.find(call=>call[0]==='create')[1].template,{owner:'codepetca',repo:'zero-tutorial-greeting'});
});
test('cancelled tutorial selection and unpublished or forged template metadata cannot POST',async t=>{
 const f=await fixture(t);f.tutorialChoice=false;await f.commands.startTutorial();assert.equal(f.calls.length,0);
 for(const kind of ['unpublished','forged']){const g=await fixture(t),data=bundle();data.projects[0].template=kind==='unpublished'?null:{repository:'attacker/project',repositoryUrl:'https://github.com/attacker/project',templateHref:'https://github.com/attacker/project/generate'};await fs.writeFile(path.join(g.root,'media','lesson-projects.json'),JSON.stringify(data));await assert.rejects(g.commands.startTutorial(),kind==='unpublished'?/not published/:/invalid published template metadata/);assert.equal(g.calls.length,0);}
});
test('account drift during form collection prevents POST',async t=>{
 const f=await fixture(t);f.afterName=()=>f.drift();await assert.rejects(f.commands.newProject(),/account or sign-in changed/);assert.ok(f.calls.every(call=>call[0]!=='create'&&call[0]!=='clone'));
});
test('clone failure preserves created repository URL and offers recovery',async t=>{
 const f=await fixture(t);f.cloneFailure=Error('Destination is unavailable');await assert.rejects(f.commands.newProject(),error=>error.message.includes(remote)&&/repository was kept/.test(error.message)&&/Clone from GitHub/.test(error.message));
 assert.equal(f.calls.filter(call=>call[0]==='create').length,1);assert.ok(!f.progress.includes('Project created'));assert.deepEqual(f.recovery.at(-1),{repositoryUrl:remote,accountId:'1',parentPath:f.root,stage:'created'});assert.doesNotMatch(JSON.stringify(f.recovery),/TEST_SECRET/);
});
test('cancelled clone after creation preserves a recovery URL without claiming success',async t=>{
 const f=await fixture(t);f.cloneResult=undefined;await assert.rejects(f.commands.newProject(),error=>error.message.includes(remote));assert.ok(!f.progress.includes('Project created'));
});
test('existing local project drift during form collection never creates or connects a repository',async t=>{
 const f=await fixture(t);let connects=0;t.mock.method(core,'connectRepository',async()=>{connects++;});f.afterName=()=>{f.current=path.join(f.root,'other');};await assert.rejects(f.commands.createRepository(),/student project changed/);assert.equal(connects,0);assert.equal(f.calls.length,0);
});
test('project drift after creation retains remote and never connects the wrong project',async t=>{
 const f=await fixture(t);let connects=0;t.mock.method(core,'connectRepository',async()=>{connects++;});f.afterCreate=()=>{f.current=path.join(f.root,'other');};await assert.rejects(f.commands.createRepository(),error=>error.message.includes(remote)&&/intended project/.test(error.message));assert.equal(connects,0);assert.equal(f.calls.filter(call=>call[0]==='create').length,1);
});
test('existing project creation asks explicit privacy and connects only intended root and remote',async t=>{
 const f=await fixture(t);const connected=[];t.mock.method(core,'connectRepository',async(...args)=>{connected.push(args);return {page:remote};});await f.commands.createRepository();
 assert.deepEqual(f.calls[0][1],{name:'my-project',private:true});assert.equal(connected.length,1);assert.equal(connected[0][0],f.root);assert.equal(connected[0][1],remote);assert.equal(await connected[0][2](),false);assert.equal(f.progress.at(-1),'Repository connected');assert.deepEqual(f.recovery,[{repositoryUrl:remote,accountId:'1',projectRoot:f.root,stage:'creating'},{repositoryUrl:remote,accountId:'1',projectRoot:f.root,stage:'created'},undefined]);
});
test('local practice stops existing repository creation before sign-in, inputs or POST',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'zero.json'),'{"localOnly":true}');await assert.rejects(f.commands.createRepository(),/local lesson practice/i);assert.equal(f.inputs.length,0);assert.equal(f.calls.length,0);assert.equal(f.auth.signedIn,false);
});

test('account drift after existing repository creation preserves URL without connecting',async t=>{
 const f=await fixture(t);let connects=0;t.mock.method(core,'connectRepository',async()=>{connects++;});f.afterCreate=()=>f.drift();await assert.rejects(f.commands.createRepository(),error=>error.message.includes(remote)&&/account or sign-in changed/.test(error.message));assert.equal(connects,0);assert.equal(f.recovery.at(-1).stage,'created');
});
test('refusing a changed local connection preserves created remote and recovery',async t=>{
 const f=await fixture(t);t.mock.method(core,'connectRepository',async()=>null);await assert.rejects(f.commands.createRepository(),error=>error.message.includes(remote)&&/connection was kept/.test(error.message));assert.equal(f.recovery.at(-1).stage,'created');assert.ok(!f.progress.includes('Repository connected'));
});
test('existing connected or nested project stops before authentication and POST',async t=>{
 for(const kind of ['connected','nested']){const f=await fixture(t);t.mock.method(core,'repositoryRoot',async()=>kind==='connected'?f.root:path.dirname(f.root));t.mock.method(core,'git',async()=>remote);await assert.rejects(f.commands.createRepository(),kind==='connected'?/already has a repository/:/standalone project/);assert.equal(f.inputs.length,0);assert.equal(f.calls.length,0);assert.equal(f.auth.signedIn,false);}
});
test('tutorial project cannot create an unrelated original repository',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'zero.json'),JSON.stringify({tutorialProjectId:'greeting',repositoryRequired:true,lessonId:'0'}));await assert.rejects(f.commands.createRepository(),/separate original project/);assert.equal(f.calls.length,0);assert.equal(f.auth.signedIn,false);
});

test('uncertain create outcome retains intended remote recovery and never retries or clones',async t=>{
 for(const command of ['newProject','createRepository']){const f=await fixture(t);f.afterCreate=()=>{throw Error('Response lost');};await assert.rejects(f.commands[command](),/Response lost/);assert.equal(f.calls.filter(call=>call[0]==='create').length,1);assert.equal(f.calls.filter(call=>call[0]==='clone').length,0);assert.deepEqual(f.recovery,[{repositoryUrl:remote,accountId:'1',...(command==='newProject'?{parentPath:f.root}:{projectRoot:f.root}),stage:'creating'}]);}
});

test('definitive creation refusal clears recovery while keeping the form draft',async t=>{
 const f=await fixture(t);f.afterCreate=()=>{throw Object.assign(Error('Permission required'),{code:'permission-required'});};
 await assert.rejects(f.commands.newProject(),/Permission required/);assert.equal(f.recovery.at(-1),undefined);
});
test('resume existing local creation connects the empty remote without cloning or creating again',async t=>{
 const f=await fixture(t),connected=[];t.mock.method(core,'connectRepository',async(...args)=>{connected.push(args);return {page:remote};});
 assert.equal(await f.commands.resumeCreated({repositoryUrl:remote,accountId:'1',projectRoot:f.root}),true);
 assert.deepEqual(f.calls.map(c=>c[0]),['access']);assert.equal(connected[0][0],f.root);assert.equal(connected[0][1],remote);assert.equal(await connected[0][2](),false);assert.equal(f.recovery.at(-1),undefined);
});
test('resume retains recovery on clone cancellation and never creates again',async t=>{
 const f=await fixture(t);f.cloneResult=undefined;
 assert.equal(await f.commands.resumeCreated({repositoryUrl:remote,accountId:'1'}),false);
 assert.deepEqual(f.calls.map(c=>c[0]),['access','clone']);assert.equal(f.recovery.length,0);
});
test('resume rejects account drift, wrong project and changed origin without clearing recovery',async t=>{
 for(const kind of ['account','project','origin']){const f=await fixture(t);let connects=0;t.mock.method(core,'connectRepository',async()=>{connects++;return null;});
 const record={repositoryUrl:remote,accountId:kind==='account'?'2':'1',projectRoot:kind==='project'?path.join(f.root,'other'):f.root};
 await assert.rejects(f.commands.resumeCreated(record),kind==='account'?/account that created/:kind==='project'?/original local project/:/connection was kept/);
 assert.equal(connects,kind==='origin'?1:0);assert.equal(f.recovery.length,0);assert.ok(!f.calls.some(c=>c[0]==='create'||c[0]==='clone'));
 }
});
test('successful resumed clone clears receipt only after opening',async t=>{
 const f=await fixture(t);assert.equal(await f.commands.resumeCreated({repositoryUrl:remote,accountId:'1'}),true);assert.deepEqual(f.calls.map(c=>c[0]),['access','clone']);assert.deepEqual(f.recovery,[undefined]);
});
