'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const executeFile = promisify(execFile);
const JDK_URL = 'https://adoptium.net/temurin/releases/?version=17&package=jdk';
const GIT_URL = 'https://git-scm.com/downloads/';
const EXTENSIONS = [
  {id:'redhat.java', name:'Java editor support', purpose:'Java errors and completion; separate from Run App'},
  {id:'vscjava.vscode-java-debug', name:'Java debugger', purpose:'Optional debugging; does not block Run App'}
];

function javaMajor(text, compiler = false) {
  const match = (compiler ? /\bjavac\s+(\d+)(?:\.(\d+))?/ : /\b(?:openjdk|java)\s+(?:version\s+)?"?(\d+)(?:\.(\d+))?/i).exec(text);
  return match ? Number(match[1] === '1' ? match[2] : match[1]) : undefined;
}
function gitVersion(text) {
  const match = /\bgit version (\d+)\.(\d+)(?:\.(\d+))?/i.exec(text);
  return match ? match.slice(1).map(value => Number(value || 0)) : undefined;
}
async function checkProject(root, platform) {
  for (const name of ['zero.json','pom.xml', platform === 'win32' ? 'mvnw.cmd' : 'mvnw','.mvn/wrapper/maven-wrapper.properties']) {
    let isFile = false;
    try {isFile = (await fs.stat(path.join(root,name))).isFile();}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    if (!isFile) throw new Error(`The student project needs ${name}. Extract the complete Zero kit, including hidden folders, and open its starter folder.`);
  }
  if (platform !== 'win32') {
    try {await fs.access(path.join(root,'mvnw'),fs.constants.X_OK);}
    catch {throw new Error('The starter mvnw file is not executable. Re-extract the complete Zero kit preserving file permissions, or ask your teacher or IT to restore its execute permission.');}
  }
}

function taskEnvironmentOverrides(environment,platform) {
  if (!environment || typeof environment !== 'object') return [];
  return Object.keys(environment).filter(key => {
    const name = platform === 'win32' ? key.toUpperCase() : key;
    return ['JAVA_HOME','PATH','PATHEXT','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','M2_HOME'].includes(name) || /^(?:MAVEN_|MVNW_)/.test(name);
  });
}

// Only fixed version arguments, no shell, bounded runtime/output. JAVA_HOME has
// the same precedence as the bundled Maven wrapper; a broken value must not
// silently fall back to a different Java on PATH.
async function inspectSetup(options) {
  const {project, execute = executeFile, env = process.env, platform = process.platform,
    getExtension = () => undefined, checkProject:check = checkProject,
    getTaskEnvironment = () => ({})} = options;
  const paths = platform === 'win32' ? path.win32 : path;
  const home = platform === 'win32'
    ? Object.entries(env).find(([key]) => key.toUpperCase() === 'JAVA_HOME')?.[1]
    : env.JAVA_HOME;
  const source = home ? 'JAVA_HOME' : 'PATH';
  const command = name => home ? paths.join(home,'bin',name + (platform === 'win32' ? '.exe' : '')) : name;
  const inspect = async (name,args) => {
    const executable = name === 'git' ? name : command(name);
    try {
      const result = await execute(executable,args,{env,timeout:10000,maxBuffer:64 * 1024,windowsHide:true});
      return {ok:true, command:executable, text:[result.stdout,result.stderr].filter(Boolean).join('\n').trim()};
    } catch (error) {
      return {ok:false, command:executable, text:error.killed || error.code === 'ETIMEDOUT' ? 'Check timed out.' : error.message};
    }
  };
  const resolve = async () => {
    try {const root = await project(); await check(root,platform); return {ok:true,root,text:root};}
    catch (error) {return {ok:false,text:error.message};}
  };
  const [java,javac,git,studentProject] = await Promise.all([
    inspect('java',['-version']), inspect('javac',['-version']), inspect('git',['--version']), resolve()
  ]);
  java.major = java.ok ? javaMajor(java.text) : undefined;
  javac.major = javac.ok ? javaMajor(javac.text,true) : undefined;
  git.version = git.ok ? gitVersion(git.text) : undefined;
  const jdkReady = java.ok && javac.ok && java.major >= 17 && javac.major >= 17 && java.major === javac.major;
  const gitReady = Boolean(git.version && (git.version[0] > 2 || (git.version[0] === 2 && git.version[1] >= 31)));
  const extensions = EXTENSIONS.map(extension => ({...extension,available:Boolean(getExtension(extension.id))}));
  let jdkDetail = jdkReady ? `JDK ${java.major} from ${source}` : `JDK 17+ with matching java and javac required (${source})`;
  if (!jdkReady && home) jdkDetail += '; repair JAVA_HOME if it points to an old or invalid JDK';
  if (java.major && javac.major && java.major !== javac.major) jdkDetail += `; java ${java.major} / javac ${javac.major} mismatch`;
  let taskEnvironment = {verified:true,keys:[]};
  if (studentProject.root) {
    try {
      const keys = taskEnvironmentOverrides(await getTaskEnvironment(studentProject.root,platform),platform);
      if (keys.length) taskEnvironment = {verified:false,keys,text:`Run environment unverified: terminal environment overrides ${keys.join(', ')}. These host-process checks do not verify the Run task's Java or Maven environment. Review the project-scoped terminal.integrated.env setting with your teacher or IT; ordinary Run App remains available.`};
    } catch {taskEnvironment = {verified:false,keys:[],text:'Run environment unverified: terminal environment settings could not be read. Review them with your teacher or IT; ordinary Run App remains available.'};}
  }
  return {platform,source,java,javac,git,project:studentProject,extensions,jdkReady,gitReady,jdkDetail,
    taskEnvironment,runReady:Boolean(jdkReady && studentProject.ok && taskEnvironment.verified),editorReady:extensions[0].available};
}

function writeDetails(output,report,mode) {
  output.clear();
  output.appendLine('Zero setup — local Run App does not require Git or GitHub sign-in.');
  output.appendLine(`VS Code: present. Host-process Java tools: ${report.source}.`);
  for (const name of ['java','javac','git']) output.appendLine(`${report[name].command}: ${report[name].text}`);
  output.appendLine(report.jdkDetail);
  output.appendLine(`Student project: ${report.project.text}`);
  if (report.taskEnvironment && !report.taskEnvironment.verified) output.appendLine(report.taskEnvironment.text);
  for (const extension of report.extensions) output.appendLine(`${extension.id}: ${extension.available ? 'available in this profile' : 'missing or disabled in this profile'} — ${extension.purpose}`);
  output.appendLine(`${report.runReady ? 'Run prerequisites ready' : 'Run prerequisites need attention'}; ${report.gitReady ? 'Git 2.31+ available for optional sharing' : 'optional sharing needs Git 2.31+'}.`);
  output.appendLine(`Checks do not build the project or verify a JavaFX window. ${report.runReady ? 'Choose Run first app, then confirm the separate app window opens.' : 'Review setup issues before using Run App.'} First builds need internet for Maven and JavaFX; read failures in the task terminal.`);
  output.appendLine(`Upload mode: ${mode}. Simulation makes no Git changes. Live sharing also needs an optional native GitHub sign-in, a connected repository and your per-repository Git name/email. Zero does not change identity or credentials.`);
}

function checklist(report) {
  return [
    {label:report.taskEnvironment?.verified === false ? '$(warning) Run environment unverified' : report.runReady ? '$(check) Run prerequisites ready' : '$(warning) Run prerequisites need attention', description:report.taskEnvironment?.verified === false ? report.taskEnvironment.text : 'Build and app window still need a first run',action:'details'},
    {label:'$(check) VS Code',description:'Already running — no reinstall needed',action:'details'},
    {label:`${report.jdkReady ? '$(check)' : '$(warning)'} Java JDK — host process`,description:report.jdkDetail,action:report.jdkReady ? 'details' : 'jdk'},
    {label:`${report.project.ok ? '$(check)' : '$(warning)'} Student project`,description:report.project.text,action:report.project.ok ? 'details' : 'project'},
    ...report.extensions.map(extension => ({label:`${extension.available ? '$(check)' : '$(warning)'} ${extension.name}`,description:extension.available ? `Available — ${extension.purpose}` : `Install or enable in this profile — ${extension.purpose}`,action:extension.available ? 'details' : extension.id})),
    {label:`${report.gitReady ? '$(check)' : '$(info)'} Git — optional sharing`,description:report.gitReady ? 'Git 2.31+ available; account/repository setup is separate' : 'Sharing incomplete — install or update Git 2.31+',action:report.gitReady ? 'details' : 'git'},
    {label:'$(refresh) Check again',description:'Recheck this VS Code process and current profile',action:'check'},
    ...(report.runReady ? [{label:'$(play) Run first app',description:'Save, build and launch; confirm the separate JavaFX window',action:'run'}] : []),
    {label:'$(output) Show setup details',description:'Version output and guidance in Zero Output',action:'details'}
  ];
}

function createSetupHelp(vscode,{project,output,run,uploadMode = () => 'live', inspect = inspectSetup}) {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      let report;
      const check = async () => {
        report = await inspect({project,getExtension:id => vscode.extensions.getExtension(id),
          getTaskEnvironment:(root,platform) => {
            const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
            return vscode.workspace.getConfiguration('terminal.integrated',vscode.Uri.file(root)).get(`env.${os}`,{});
          }});
        writeDetails(output,report,uploadMode());
      };
      await check();
      while (true) {
        const choice = await vscode.window.showQuickPick(checklist(report),{title:'Zero setup',placeHolder:'Choose an item for help, or Check again. Escape closes setup.'});
        if (!choice) return;
        if (choice.action === 'check') {await check(); continue;}
        if (choice.action === 'details') {output.show(true); continue;}
        if (choice.action === 'project') {await vscode.window.showInformationMessage(report.project.text); continue;}
        if (choice.action === 'run') {
          // A workspace switch or tool change while the picker was open needs a
          // fresh check. Run itself retains the extension's save/restart queue.
          const selectedRoot = report.project.root;
          await check();
          if (report.project.root !== selectedRoot) {
            await vscode.window.showInformationMessage('Project changed; review setup again before choosing Run first app.');
            continue;
          }
          if (!report.runReady) continue;
          void vscode.window.showInformationMessage('Run App will save your files and build the app. First builds need internet. Confirm that the separate JavaFX window opens; if it fails, read the task terminal.');
          await run(report.project.root); return;
        }
        if (EXTENSIONS.some(extension => extension.id === choice.action)) {
          try {
            await vscode.commands.executeCommand('workbench.extensions.installExtension',choice.action);
            await vscode.window.showInformationMessage('Use VS Code’s install or enable prompts for this profile. If it requests a reload, reload the window, then open Setup help and Check again.');
          } catch (error) {await vscode.window.showWarningMessage(`VS Code could not install this extension: ${error.message}. On a school laptop, ask your teacher or IT to enable it in this profile.`);}
          await check(); continue;
        }
        if (choice.action === 'jdk' || choice.action === 'git') {
          const jdk = choice.action === 'jdk', url = jdk ? JDK_URL : GIT_URL;
          const platform = report.platform === 'win32' ? 'Windows' : report.platform === 'darwin' ? 'macOS' : 'Linux';
          const guidance = `${jdk ? 'Use a JDK 17 or newer (JDK, not JRE)' : 'Use Git 2.31 or newer'} for ${platform}. Keep a working school-provided installation. On a managed school laptop, ask your teacher or IT if installation is blocked. ${report.platform === 'linux' ? 'Follow the official Linux instructions manually. ' : 'Follow the official installer instructions. '}${jdk ? 'If JAVA_HOME is set, it must point to that JDK; otherwise java and javac must be on PATH. Ask IT to repair an old or invalid JAVA_HOME. ' : ''}Fully quit and reopen VS Code after installation or environment repair, then use Setup help → Check again.`;
          void vscode.window.showInformationMessage(guidance);
          if (!(await vscode.env.openExternal(vscode.Uri.parse(url)))) await vscode.window.showWarningMessage(`Open ${url} in your browser. ${guidance}`);
        }
      }
    } finally {busy = false;}
  };
}

module.exports = {javaMajor,gitVersion,inspectSetup,checklist,createSetupHelp,taskEnvironmentOverrides};
