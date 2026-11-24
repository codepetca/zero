'use strict';

// Diagnostic only: compile the already broken disposable fixture with the same
// wrapper arguments/Windows command shape as Native Run. Never retain raw logs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {StringDecoder} = require('node:string_decoder');
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function sanitizeLine(raw, project) {
  if (!/Main\.java/i.test(raw)) return null;
  const sequences = [...new Set(raw.match(ansi) || [])].slice(0, 8).map(item => item.replace('\x1b', '<ESC>').slice(0,80));
  const clean = raw.replace(ansi, '').replace(/[\x00-\x1f\x7f]/g, '');
  const match = /^\s*(\[(?:ERROR|WARNING|INFO)\])?\s*(.*?Main\.java)(.*)$/i.exec(clean);
  if (!match) return {line:'<unparsed Main.java line>', ansi:sequences};
  const source = match[2], tail = match[3];
  const normalized = source.replaceAll('\\', '/');
  const expected = `${project.replaceAll('\\', '/')}/src/main/java/Main.java`;
  const sameIgnoringCase = normalized.toLowerCase() === expected.toLowerCase();
  const location = /^:\[(\d{1,7}),(\d{1,7})\]\s*(.*)$/.exec(tail);
  const allowed = /^(?:';' expected|illegal start of expression|not a statement|reached end of file while parsing)$/;
  const message = location && allowed.test(location[3]) ? location[3] : '<other compiler text>';
  const separatorStyle = source.includes('\\') ? (source.includes('/')?'mixed':'backslash') : (source.includes('/')?'slash':'none');
  const safeSource = sameIgnoringCase ? (separatorStyle === 'backslash' ? '<fixture>\\src\\main\\java\\Main.java' : '<fixture>/src/main/java/Main.java') : '<unmatched-fixture-source>/Main.java';
  return {
    line:[match[1] || '<no Maven prefix>', safeSource+(location?':['+location[1]+','+location[2]+']':''), message].join(' '),
    absolute:path.win32.isAbsolute(source), windowsDrivePrefix:/^[A-Za-z]:[\\/]/.test(source),
    sourceRootForm:/^[A-Za-z]:[\\/]/.test(source)?'drive':/^\/[A-Za-z]:\//.test(source)?'slash-drive':/^\\\\/.test(source)?'unc':/^\//.test(source)?'slash-root':'relative',
    driveCase:/^[A-Z]:/.test(source)?'upper':/^[a-z]:/.test(source)?'lower':'none',
    separatorStyle, fixturePathMatch:normalized===expected?'exact':sameIgnoringCase?'case-only':'different',
    mainFileCase:source.endsWith('Main.java')?'canonical':'other-case',
    location:location?{line:Number(location[1]),column:Number(location[2])}:null,
    englishExpectedDiagnostic:message === "';' expected", ansi:sequences,
  };
}

async function diagnose(project, output) {
  const result = {schema:1, kind:'synthetic-compiler-log-diagnosis', outcome:'failed', args:['clean','compile','javafx:run'],
    exitCode:null, timedOut:false, mainLines:[], mainLineCount:0, hadAnsi:false,
    nodeLocale:Intl.DateTimeFormat().resolvedOptions().locale,
    javaLocaleOverridePresent:/user\.(language|country)/.test([process.env.JAVA_TOOL_OPTIONS,process.env.MAVEN_OPTS].join(' ')),
    limits:['Separate synthetic wrapper diagnostic; does not repair or establish native editor diagnostics or UI acceptance.']};
  const started = Date.now();
  try {
    assert.equal(process.platform, 'win32');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.ok(path.isAbsolute(project) && path.isAbsolute(output));
    assert.equal(await fs.realpath(process.env.JAVA_HOME), await fs.realpath(process.env.ZERO_JAVA_HOME));
    const wrapper = path.join(project, 'mvnw.cmd');
    assert.ok((await fs.readFile(path.join(project,'src/main/java/Main.java'),'utf8')).includes('ZERO_SYNTHETIC_COMPILER_ERROR'));
    const env = {...process.env};
    for (const key of Object.keys(env)) if (['ZERO_NATIVE_MAVEN_WRAPPER','ZERO_NATIVE_MAVEN_REPOSITORY'].includes(key.toUpperCase())) delete env[key];
    env.ZERO_NATIVE_MAVEN_WRAPPER = wrapper;
    const child = spawn(path.join(process.env.SystemRoot,'System32','cmd.exe'), ['/d','/v:off','/s','/c','""%ZERO_NATIVE_MAVEN_WRAPPER%" clean compile javafx:run"'],
      {cwd:project,env,stdio:['ignore','pipe','pipe'],windowsHide:true,windowsVerbatimArguments:true});
    function collect(stream) {
      const decoder = new StringDecoder('utf8');
      let buffer='';
      function line(value) {
        if (/\x1b\[/.test(value)) result.hadAnsi=true;
        const sanitized = sanitizeLine(value,project);
        if (sanitized) { result.mainLineCount++; if (result.mainLines.length<12) result.mainLines.push(sanitized); }
      }
      stream.on('data', bytes => {
        buffer += decoder.write(bytes);
        const parts=buffer.split(/\r?\n/); buffer=parts.pop();
        for (const part of parts) line(part.slice(0,16384));
        if (buffer.length>16384) buffer=buffer.slice(-16384);
      });
      stream.on('end',()=>{buffer+=decoder.end();if(buffer)line(buffer);});
    }
    collect(child.stdout);collect(child.stderr);
    let timer,drainTimer;
    try { result.exitCode=await new Promise((resolve,reject)=>{
      child.once('error',reject);child.once('close',resolve);
      timer=setTimeout(()=>{
        result.timedOut=true;
        spawn(path.join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}).on('error',()=>child.kill());
        drainTimer=setTimeout(()=>{child.stdout.destroy();child.stderr.destroy();child.unref();resolve(null);},10000);
      },90000);
    }); }
    finally {clearTimeout(timer);clearTimeout(drainTimer);}
    result.outcome=result.timedOut?'timed-out':'observed';
  } catch { result.failure='diagnostic-prerequisite-or-process-failed'; }
  finally { result.elapsedSeconds=Math.round((Date.now()-started)/1000);await fs.writeFile(output,JSON.stringify(result)); }
  if(result.outcome==='failed'||result.timedOut) process.exitCode=1;
}

module.exports={sanitizeLine};
if(require.main===module) void diagnose(...process.argv.slice(2)).catch(()=>{process.exitCode=1;});
