'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const {StringDecoder} = require('node:string_decoder');
const {parseNativeRecord, NATIVE_PREFIX, MAX_RECORD_BYTES} = require('./runtime-events');

async function nativeBuildIdentity(root) {
  root = await fs.realpath(root);
  const hash = crypto.createHash('sha256');
  let files = 0, total = 0, directories = 0;
  const read = async relative => {
    const file = path.join(root, relative), info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || ++files > 2048 || info.size > 2 * 1024 * 1024 || (total += info.size) > 32 * 1024 * 1024) throw new Error('Native runtime identity requires bounded regular Java/POM files.');
    const bytes = await fs.readFile(file);
    if (bytes.length !== info.size) throw new Error('Java inputs changed while preparing Run. Run again.');
    hash.update(relative).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  };
  const walk = async relative => {
    let entries;
    try {
      const directory = await fs.lstat(path.join(root, relative));
      if (await fs.realpath(path.join(root, relative)) !== path.join(root, relative)) throw new Error('Native runtime identity does not follow linked Java directories.');
      if (!directory.isDirectory() || directory.isSymbolicLink() || ++directories > 4096 || relative.split('/').length > 64) throw new Error('Native runtime identity requires bounded regular Java directories.');
      entries = await fs.readdir(path.join(root, relative), {withFileTypes: true});
    }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Native runtime identity does not follow linked Java inputs.');
      if (entry.isDirectory()) await walk(name);
      else if (entry.name.endsWith('.java')) await read(name);
    }
  };
  try { await read('pom.xml'); } catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('pom.xml absent\0'); }
  await walk('src/main/java');
  return 'sha256:' + hash.digest('hex');
}

function createRecordDecoder({runId, buildId, write, onEvent, now = Date.now}) {
  let buffer = '', passthrough = false, sequence = 0, terminal = false, windowStart = now(), count = 0;
  const seen = new Set();
  const line = text => {
    const event = parseNativeRecord(text.replace(/\r?\n$/, ''), {runId, buildId, afterSeq: sequence});
    if (!event) { write(text); return; }
    const time = now();
    if (time - windowStart >= 1000) {windowStart = time; count = 0;}
    if (++count > 32 || terminal || seen.has(event.type) || (!seen.size && (event.type !== 'startup' || event.seq !== 1))) return;
    sequence = event.seq;
    seen.add(event.type);
    terminal = event.type === 'fatal' || event.type === 'stopped';
    onEvent(event);
    if (event.diagnostic) write(`[Zero ${event.stage}/${event.code}] ${event.diagnostic}\r\n`);
  };
  return {
    push(text) {
      while (text.length) {
        const newline = text.indexOf('\n');
        const part = newline < 0 ? text : text.slice(0, newline + 1);
        text = newline < 0 ? '' : text.slice(newline + 1);
        if (passthrough) {write(part); if (newline >= 0) passthrough = false; continue;}
        const candidate = buffer + part;
        if (!candidate.startsWith(NATIVE_PREFIX) && !NATIVE_PREFIX.startsWith(candidate)) {
          write(candidate); buffer = ''; passthrough = newline < 0; continue;
        }
        if (Buffer.byteLength(buffer, 'utf8') + Buffer.byteLength(part, 'utf8') > MAX_RECORD_BYTES) {
          write(buffer + part); buffer = ''; passthrough = newline < 0; continue;
        }
        buffer += part;
        if (newline >= 0) {line(buffer); buffer = '';}
      }
    },
    end() {if (buffer) {line(buffer); buffer = '';}}
  };
}

function createNativeRuntimeExecution({vscode, spec, buildId, onEvent = () => {}, onExit = () => {}, isCurrent = () => true, spawn = childProcess.spawn, killProcess = process.kill, platform = process.platform, env = process.env, graceMs = 1500}) {
  const controllers = new Set();
  const execution = new vscode.CustomExecution(async () => {
    const runId = crypto.randomUUID();
    const writes = new vscode.EventEmitter(), closes = new vscode.EventEmitter();
    const stdout = new StringDecoder('utf8'), stderr = new StringDecoder('utf8');
    let child, cancelled = false, closed = false, opened = false, timer;
    const write = text => {if (text) writes.fire(text);};
    const decoder = createRecordDecoder({runId, buildId, write, onEvent:event => {if (isCurrent() && !cancelled && !closed) onEvent(event);}});
    const childEnv = {...env, ZERO_RUNTIME_RUN_ID: runId, ZERO_RUNTIME_BUILD_ID: buildId};
    const systemRoot = Object.entries(childEnv).find(([key]) => key.toUpperCase() === 'SYSTEMROOT')?.[1];
    function kill(force) {
      if (!child?.pid) return;
      if (platform === 'win32') {
        const executable = systemRoot ? path.win32.join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill.exe';
        try {spawn(executable, ['/PID', String(child.pid), '/T', '/F'], {env: childEnv, stdio: 'ignore', windowsHide: true}).once('error', () => child.kill());}
        catch {child.kill();}
      } else {
        try {killProcess(-child.pid, force ? 'SIGKILL' : 'SIGTERM');}
        catch {try {child.kill(force ? 'SIGKILL' : 'SIGTERM');} catch {}}
      }
    }
    function finish(code) {
      if (closed) return;
      closed = true; clearTimeout(timer);
      decoder.push(stdout.end()); decoder.end(); write(stderr.end());
      // A crashed Maven wrapper must not leave an owned Java process running.
      kill(true);
      controllers.delete(controller);
      const exitCode = cancelled ? 0 : (Number.isInteger(code) ? code : 1);
      onExit(exitCode); closes.fire(exitCode);
    }
    function close() {
      if (cancelled || closed) return;
      cancelled = true;
      if (!opened || !child) {finish(0); return;}
      kill(false);
      if (!closed) {timer = setTimeout(() => {kill(true);}, graceMs); timer.unref?.();}
    }
    const controller = {close}; controllers.add(controller);
    return {
      onDidWrite: writes.event,
      onDidClose: closes.event,
      open() {
        if (opened || closed) return;
        opened = true;
        if (cancelled || !isCurrent()) {cancelled = true;finish(0); return;}
        try {
          let command = spec.command, args = [...spec.args];
          if (platform === 'win32' && spec.shell) {
            // Expand the wrapper path once via child-only environment data. This
            // preserves spaces/metacharacters without interpolating shell code.
            if (/[\0\r\n"]/.test(command)) throw new Error('Invalid native Maven wrapper path.');
            if (args.some(value => !/^[A-Za-z0-9:_-]+$/.test(value))) throw new Error('Unexpected native Maven arguments.');
            childEnv.ZERO_NATIVE_MAVEN_WRAPPER = command;
            command = systemRoot ? path.win32.join(systemRoot, 'System32', 'cmd.exe') : 'cmd.exe';
            args = ['/d', '/v:off', '/s', '/c', '""%ZERO_NATIVE_MAVEN_WRAPPER%" ' + args.join(' ') + '"'];
          }
          child = spawn(command, args, {cwd: spec.cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: platform !== 'win32', windowsHide: true, ...(platform === 'win32' ? {windowsVerbatimArguments: true} : {})});
          child.stdout.on('data', data => decoder.push(stdout.write(data)));
          child.stderr.on('data', data => write(stderr.write(data)));
          child.once('error', error => {write(`Cannot start native Java: ${error.message}\r\n`); finish(1);});
          child.once('close', code => finish(code));
          if (cancelled) close();
        } catch (error) {write(`Cannot start native Java: ${error.message}\r\n`); finish(1);}
      },
      handleInput(data) {
        if (closed || cancelled) return;
        if (data === '\x03') close();
        else if (child?.stdin?.writable) child.stdin.write(data);
      },
      close
    };
  });
  return {execution, dispose() {for (const controller of [...controllers]) controller.close();}};
}
module.exports = {nativeBuildIdentity, createRecordDecoder, createNativeRuntimeExecution};
