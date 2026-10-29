'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {inspectSetup,createSetupHelp} = require('../src/setup');

async function fixture(choices = [], overrides = {}) {
  const records = {picks:[],commands:[],urls:[],notices:[],warnings:[],lines:[],runs:[],checks:0,shows:0};
  const available = new Set(overrides.available || []);
  const report = await inspectSetup({env:{},platform:overrides.platform || 'darwin',project:async () => '/student',checkProject:async () => {},getExtension:id => available.has(id),execute:async command => ({stdout:command === 'git' ? 'git version 2.31.0' : command === 'javac' ? 'javac 17.0.12' : 'openjdk version "17.0.12"'})});
  const vscode = {
    window:{
      showQuickPick:async (items,options) => {records.picks.push({items,options});const action = choices.shift();return items.find(item => item.action === action);},
      showInformationMessage:async text => {records.notices.push(text);return overrides.notification;},
      showWarningMessage:async text => {records.warnings.push(text);}
    },
    commands:{executeCommand:async (...args) => {records.commands.push(args);if(overrides.installError)throw new Error('School policy');available.add(args[1]);}},
    extensions:{getExtension:id => available.has(id)},
    env:{openExternal:async uri => {records.urls.push(uri);return true;}},Uri:{parse:url => url}
  };
  const options = {
    project:async () => '/student',
    output:{appendLine:text => records.lines.push(text),clear:() => {records.lines=[];},show:() => {records.shows++;}},
    run:async root => {records.runs.push(root);},
    inspect:async () => {records.checks++;return {...report,extensions:report.extensions.map(extension => ({...extension,available:available.has(extension.id)})),...overrides.report};}
  };
  return {records,vscode,options,help:createSetupHelp(vscode,options)};
}
test('cancel after read-only checks installs nothing and launches nothing',async () => {
  const {help,records} = await fixture();await help();
  assert.equal(records.checks,1);assert.equal(records.picks.length,1);
  assert.deepEqual(records.commands,[]);assert.deepEqual(records.urls,[]);assert.deepEqual(records.runs,[]);
  assert.ok(records.lines.some(line => /Checks do not build/.test(line)));
  assert.ok(records.lines.some(line => /Simulation makes no Git changes/.test(line)));
});
test('Test installation is explicit and remains available without an open student project',async()=>{
  const {records,vscode,options}=await fixture(['test'],{report:{runReady:false,project:{ok:false,text:'No student project is open'}}});
  let opened=0;options.testInstallation=async()=>{opened++;};
  await createSetupHelp(vscode,options)();
  assert.equal(opened,1);assert.deepEqual(records.runs,[]);assert.deepEqual(records.commands,[]);
  assert.ok(records.picks[0].items.some(item=>item.label.includes('Test installation')&&item.description.includes('separate from your tutorial')));
  const cancelled=await fixture();cancelled.options.testInstallation=async()=>{assert.fail('Cancellation must not open the test');};
  await createSetupHelp(cancelled.vscode,cancelled.options)();
});
test('explicit selected extension installs with supported native command, then checks current profile again',async () => {
  const {help,records} = await fixture(['redhat.java','check']);await help();
  assert.deepEqual(records.commands,[['workbench.extensions.installExtension','redhat.java']]);
  assert.equal(records.checks,3);assert.deepEqual(records.urls,[]);assert.deepEqual(records.runs,[]);
  assert.ok(records.picks[1].items.some(item => item.label.includes('Java editor support') && item.description.startsWith('Available')));
  assert.match(records.notices[0],/this profile.*reload/);
});
test('blocked school extension install preserves help and shows actionable guidance',async () => {
  const {help,records} = await fixture(['vscjava.vscode-java-debug','check'],{installError:true});await help();
  assert.equal(records.commands.length,1);assert.equal(records.checks,3);
  assert.match(records.warnings[0],/School policy.*device administrator or IT/);
});
test('working installed tools have no repair actions; show details remains read only',async () => {
  const {help,records} = await fixture(['details'],{available:['redhat.java','vscjava.vscode-java-debug']});await help();
  assert.equal(records.shows,1);assert.deepEqual(records.commands,[]);assert.deepEqual(records.urls,[]);
  assert.ok(!records.picks[0].items.some(item => ['jdk','git','redhat.java','vscjava.vscode-java-debug'].includes(item.action)));
});
test('selected missing JDK opens official page and explains school/manual Linux repair and restart',async () => {
  const {help,records} = await fixture(['jdk'],{platform:'linux',report:{jdkReady:false,runReady:false,jdkDetail:'JAVA_HOME invalid'}});await help();
  assert.deepEqual(records.urls,['https://adoptium.net/temurin/releases/?version=17&package=jdk']);
  assert.match(records.notices[0],/JDK, not JRE.*device administrator or IT.*Linux instructions manually.*JAVA_HOME.*Fully quit and reopen/);
  assert.deepEqual(records.commands,[]);assert.deepEqual(records.runs,[]);
});
test('optional Git repair opens official page and never signs in or changes identity',async () => {
  const {help,records} = await fixture(['git'],{platform:'win32',report:{gitReady:false}});await help();
  assert.deepEqual(records.urls,['https://git-scm.com/downloads/']);
  assert.match(records.notices[0],/Git 2.31.*Windows.*device administrator or IT.*Fully quit and reopen/);
  assert.deepEqual(records.commands,[]);assert.deepEqual(records.runs,[]);
});
test('selected Java and Git download help opens without waiting for notice dismissal',async t => {
  for(const [action,url,report] of [
    ['jdk','https://adoptium.net/temurin/releases/?version=17&package=jdk',{jdkReady:false,runReady:false}],
    ['git','https://git-scm.com/downloads/',{gitReady:false}]
  ]) {
    let dismiss,timer;
    const notification=new Promise(resolve=>{dismiss=resolve;});
    t.after(()=>dismiss());
    const {help,records}=await fixture([action],{report,notification});
    const completed=await Promise.race([help().then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]).finally(()=>clearTimeout(timer));
    assert.equal(completed,true,'Selecting download help must not wait for its informational notice');
    assert.deepEqual(records.urls,[url]);assert.deepEqual(records.commands,[]);assert.deepEqual(records.runs,[]);
  }
});
test('first build is only launched by user selection, rechecked and limited to expected root',async () => {
  const {help,records} = await fixture(['run']);await help();
  assert.equal(records.checks,2);assert.deepEqual(records.runs,['/student']);
  assert.match(records.notices[0],/Run App opens a desktop window.*Problems or the task terminal/);
});
test('Run current app launches without waiting for the explanatory notice to be dismissed',async t => {
  let dismiss,timer;
  const notification=new Promise(resolve=>{dismiss=resolve;});
  t.after(()=>dismiss());
  const {help,records}=await fixture(['run'],{notification});
  const completed=await Promise.race([help().then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]).finally(()=>clearTimeout(timer));
  assert.equal(completed,true,'The informational notice must not block the selected first run');
  assert.equal(records.checks,2);assert.deepEqual(records.runs,['/student']);
  await help();assert.equal(records.checks,3,'Setup guard must be released while the notice remains open');
});
test('project change or unavailable tools during picker recheck blocks first run',async () => {
  const {records,vscode,options} = await fixture(['run']);
  const inspect = options.inspect;
  options.inspect = async () => {const report = await inspect();return records.checks === 1 ? report : {...report,runReady:false,project:{ok:false,text:'Multiple projects are open'}};};
  await createSetupHelp(vscode,options)();assert.deepEqual(records.runs,[]);
  assert.match(records.picks.at(-1).items.find(item => item.action === 'project').description,/Multiple projects/);
});
test('switching to another valid project requires a fresh selection before running',async () => {
  const {records,vscode,options} = await fixture(['run']);
  const inspect = options.inspect;
  options.inspect = async () => {
    const report = await inspect();
    return records.checks === 1 ? report : {...report,project:{ok:true,root:'/other',text:'/other'}};
  };
  await createSetupHelp(vscode,options)();
  assert.deepEqual(records.runs,[]);assert.equal(records.picks.length,2);
  assert.match(records.notices[0],/Project changed; review setup again/);
  assert.ok(records.picks.at(-1).items.some(item => item.action === 'run'));
  assert.equal(records.picks.at(-1).items.find(item => item.label.includes('Student project')).description,'/other');
});
test('concurrent setup requests are ignored and cancellation releases guard',async () => {
  const {records,vscode,options} = await fixture();
  let release;
  vscode.window.showQuickPick=async () => {records.picks.push({});await new Promise(resolve => {release=resolve;});};
  const help = createSetupHelp(vscode,options);
  const first=help();
  while(!release) await new Promise(resolve => setImmediate(resolve));
  await help();assert.equal(records.checks,1);assert.equal(records.picks.length,1);
  release();await first;
  vscode.window.showQuickPick=async () => undefined;await help();assert.equal(records.checks,2);
});
test('Setup reads terminal environment in displayed project scope and matching platform without recommending Run',async t => {
  for (const [platform,key,environment] of [['darwin','osx',{JAVA_HOME:'/invalid'}],['win32','windows',{Java_Home:null}],['linux','linux',{PATH:'${env:PATH}'}]]) {
    await t.test(platform,async () => {
      const {records,vscode,options} = await fixture(['details']);
      const reads=[];
      vscode.Uri.file=fsPath => ({fsPath});
      vscode.workspace={getConfiguration:(section,scope) => {reads.push({section,scope});return {get:(name,fallback) => {reads.push({name,fallback});return environment;}};}};
      options.inspect=argumentsToInspect => inspectSetup({...argumentsToInspect,env:{},platform,checkProject:async () => {},execute:async command => ({stdout:command === 'git' ? 'git version 2.31.0' : command === 'javac' ? 'javac 17.0.12' : 'openjdk version "17.0.12"'})});
      await createSetupHelp(vscode,options)();
      assert.deepEqual(reads,[{section:'terminal.integrated',scope:{fsPath:'/student'}},{name:`env.${key}`,fallback:{}}]);
      assert.ok(!records.picks[0].items.some(item => item.action === 'run'));
      assert.match(records.picks[0].items[0].label,/Run environment unverified/);
      assert.ok(records.lines.some(line => /Host-process Java tools/.test(line)));
      assert.ok(records.lines.some(line => /Run environment unverified/.test(line)));
      assert.ok(!records.lines.some(line => /Choose Run current app/.test(line)));
      assert.deepEqual(records.runs,[]);assert.deepEqual(records.commands,[]);assert.deepEqual(records.urls,[]);
    });
  }
});
