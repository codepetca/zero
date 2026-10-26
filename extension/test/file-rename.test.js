'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createRenameCommands} = require('../src/file-rename');
const authoring = require('../src/sharing/authoring');

async function put(root,relative,content='') {
  const filename = path.join(root,relative);
  await fs.mkdir(path.dirname(filename),{recursive:true});
  await fs.writeFile(filename,content);
}
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-rename-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'zero.json',JSON.stringify({name:'Game'}));
  await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
  await put(root,'src/main/java/Main.java','public class Main {}\n');
  await put(root,'src/main/resources/image.png','pixels');
  await put(root,'notes/idea.txt','idea');
  let current=root,busy=false,input='Next.java',refreshes=0,applies=0;
  const states=[],logs=[],prompts=[],operations=[];
  const vscode={
    Uri:{file:fsPath=>({fsPath})},
    WorkspaceEdit:class {
      renameFile(from,to,options) {operations.push({from:from.fsPath,to:to.fsPath,options});}
    },
    workspace:{isTrusted:true,textDocuments:[],async applyEdit() {
      applies++;
      const operation=operations.at(-1);
      assert.deepEqual(operation.options,{overwrite:false,ignoreIfExists:false});
      await fs.rename(operation.from,operation.to);
      return true;
    }},
    window:{showInputBox:async options=>{prompts.push(options);return input;}}
  };
  const commands=createRenameCommands(vscode,{project:async()=>current,isBusy:()=>busy,setBusy:value=>{busy=value;},setState:value=>states.push(value),output:{appendLine:value=>logs.push(value)},refreshFiles:()=>refreshes++});
  const context=(relative,area='code',libraryFolder)=>({root,relative,area,libraryFolder});
  return {root,vscode,commands,context,prompts,operations,states,logs,
    run:context=>commands.commands['zero.renameStudentFile'](context),
    set input(value){input=value;},set current(value){current=value;},set busy(value){busy=value;},
    get busy(){return busy;},get refreshes(){return refreshes;},get applies(){return applies;}};
}

test('native rename preserves Java bytes and warns about class names and references',async t=>{
  const f=await fixture(t);
  await f.run(f.context('src/main/java/Main.java'));
  assert.equal(await fs.readFile(path.join(f.root,'src/main/java/Next.java'),'utf8'),'public class Main {}\n');
  await assert.rejects(fs.stat(path.join(f.root,'src/main/java/Main.java')),{code:'ENOENT'});
  assert.match(f.prompts[0].prompt,/file name only.*class names and references separately/);
  assert.equal(f.prompts[0].title,'File name');
  assert.equal(f.prompts[0].value,'Main.java');
  assert.equal(f.applies,1);assert.equal(f.refreshes,1);assert.equal(f.busy,false);
  assert.equal(f.states.at(-1),'Renamed Main.java to Next.java');
});

test('cancel and unchanged name leave source and status untouched; failed native apply reports failure',async t=>{
  const f=await fixture(t),context=f.context('src/main/java/Main.java');
  f.input=undefined;await f.run(context);
  f.input='Main.java';await f.run(context);
  assert.equal(f.applies,0);assert.equal(f.refreshes,0);assert.deepEqual(f.states,[]);
  f.vscode.workspace.applyEdit=async()=>false;
  f.input='Next.java';await assert.rejects(f.run(context),/VS Code could not rename/);
  assert.equal(await fs.readFile(path.join(f.root,context.relative),'utf8'),'public class Main {}\n');
  assert.equal(f.refreshes,0);assert.equal(f.busy,false);
  await assert.rejects(f.run(),/Select a file/);
});

test('asset and other authored file rename use the matching area; metadata and source-area bypasses fail',async t=>{
  const f=await fixture(t);
  f.input='hero.png';await f.run(f.context('src/main/resources/image.png','assets'));
  assert.equal(await fs.readFile(path.join(f.root,'src/main/resources/hero.png'),'utf8'),'pixels');
  f.input='plan.txt';await f.run(f.context('notes/idea.txt','project'));
  assert.equal(await fs.readFile(path.join(f.root,'notes/plan.txt'),'utf8'),'idea');
  for (const context of [f.context('pom.xml','project'),f.context('zero.json','project'),f.context('src/main/java/Main.java','project'),f.context('src/main/java/Main.java','assets'),f.context('notes/plan.txt','code')])
    await assert.rejects(f.run(context));
  assert.equal(f.applies,2);
});

test('exact core is protected while student-authored zero.contrib remains renameable',async t=>{
  const f=await fixture(t);
  await put(f.root,'src/main/java/zero/Actor.java',await fs.readFile(path.resolve(__dirname,'../../framework/src/main/java/zero/Actor.java')));
  await put(f.root,'src/main/java/zero/contrib/Student.java','package zero.contrib; public class Student {}');
  await assert.rejects(f.run(f.context('src/main/java/zero/Actor.java')),/selected file changed/);
  f.input='Helper.java';
  await f.run(f.context('src/main/java/zero/contrib/Student.java'));
  assert.equal(await fs.readFile(path.join(f.root,'src/main/java/zero/contrib/Helper.java'),'utf8'),'package zero.contrib; public class Student {}');
});

test('portable basename and case or Unicode collisions are rejected before apply',async t=>{
  const f=await fixture(t);
  await put(f.root,'src/main/java/next.java','other');
  const selected=f.context('src/main/java/Main.java');
  f.input='Next.java';await assert.rejects(f.run(selected),/already exists/);
  const validate=f.prompts.at(-1).validateInput;
  for (const name of ['../Escape.java','/tmp/x.java','a/b.java','C:\\x.java','NUL.java','bad?.java',' bad.java'])
    assert.match(await validate(name),/portable file name/,name);
  await put(f.root,'src/main/java/caf\u00e9.java','other');
  assert.match(await validate('cafe\u0301.java'),/already exists/);
  assert.equal(f.applies,0);
});

test('stale file, replaced parent, dirty editor, trust, project and busy changes stop rename',async t=>{
  const f=await fixture(t),context=f.context('src/main/java/Main.java');
  f.vscode.workspace.textDocuments=[{isDirty:true}];
  await assert.rejects(f.run(context),/Save or close unsaved/);
  f.vscode.workspace.textDocuments=[];
  f.vscode.workspace.isTrusted=false;
  await assert.rejects(f.run(context),/Trust your project/);
  f.vscode.workspace.isTrusted=true;
  f.busy=true;await f.run(context);assert.equal(f.prompts.length,0);
  f.busy=false;
  f.vscode.window.showInputBox=async options=>{await fs.appendFile(path.join(f.root,context.relative),'// changed\n');return 'Next.java';};
  await assert.rejects(f.run(context),/selected file changed/);
  f.vscode.window.showInputBox=async options=>{f.current=path.dirname(f.root);return 'Next.java';};
  await assert.rejects(f.run(context),/project changed/);
  f.current=f.root;
  f.vscode.window.showInputBox=async options=>{f.busy=true;return 'Next.java';};
  await assert.rejects(f.run(context),/Another project action/);
  f.busy=false;
  f.vscode.window.showInputBox=async options=>{f.commands.dispose();return 'Next.java';};
  await assert.rejects(f.run(context),/view closed/);
  assert.equal(f.applies,0);
});

test('symlink sources and parents, replaced source inode, and changed destination are refused',async t=>{
  const f=await fixture(t),source=path.join(f.root,'src/main/java/Main.java');
  const context=f.context('src/main/java/Main.java');
  f.vscode.window.showInputBox=async()=>{await put(f.root,'src/main/java/Next.java','collision');return 'Next.java';};
  await assert.rejects(f.run(context),/already exists/);
  await fs.rm(path.join(f.root,'src/main/java/Next.java'));
  f.vscode.window.showInputBox=async()=>{await fs.rename(source,`${source}.old`);await fs.copyFile(`${source}.old`,source);return 'Next.java';};
  await assert.rejects(f.run(context),/selected file changed/);
  await fs.rm(source);await fs.symlink(`${source}.old`,source);
  await assert.rejects(f.run(context),/Symbolic links|ordinary file|selected file changed/);
  await fs.rm(source);
  await fs.symlink(path.dirname(`${source}.old`),path.join(f.root,'linked'));
  await assert.rejects(f.run(f.context('linked/Main.java','project')));
  assert.equal(f.applies,0);
});

test('local library namespace permits rename; retained source and library metadata are protected',async t=>{
  const f=await fixture(t);
  await put(f.root,'src/main/java/Health.java','public class Health {}\n');
  await put(f.root,'LICENSE','MIT\n');
  await authoring.applyPlan(await authoring.previewExtraction(f.root,{
    repository:{id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'},
    descriptor:{schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'An ordinary helper.',license:'MIT',libraryKind:'helper'},
    sources:['src/main/java/Health.java']
  }));
  const libraryFolder='libraries/health-bar';
  const relative=`${libraryFolder}/src/main/java/zero/contrib/r12345/health_bar/Health.java`;
  f.input='Better.java';await f.run(f.context(relative,'library-code',libraryFolder));
  assert.equal(await fs.readFile(path.join(f.root,path.posix.dirname(relative),'Better.java'),'utf8').then(text=>text.includes('class Health')),true);
  await assert.rejects(f.run(f.context(`${libraryFolder}/zero-library.json`,'project')));
  // The file-only rename leaves the Java declaration for the student to edit.
  await put(f.root,`${libraryFolder}/src/main/java/zero/contrib/r12345/health_bar/Better.java`,'package zero.contrib.r12345.health_bar; public class Better {}');
  await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
  await assert.rejects(f.run(f.context(`${path.posix.dirname(relative)}/Better.java`,'library-code',libraryFolder)),/Only a local library/);
});
