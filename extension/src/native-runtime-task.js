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
  let buffer = '', sequence = 0, terminal = false, windowStart = now(), count = 0;
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
      text = buffer + text;
      buffer = '';
      while (text.length) {
        const marker = text.indexOf('\x1e');
        if (marker < 0) {write(text); return;}
        if (marker > 0) {write(text.slice(0, marker)); text = text.slice(marker);}
        if (text.length < NATIVE_PREFIX.length && NATIVE_PREFIX.startsWith(text)) {buffer = text; return;}
        if (!text.startsWith(NATIVE_PREFIX)) {write(text[0]); text = text.slice(1); continue;}
        const newline = text.indexOf('\n'), nextMarker = text.indexOf('\x1e', 1);
        // A raw RS cannot occur inside the reporter's JSON string. Recover at a
        // newer marker even after a malformed/oversized record without a newline.
        if (nextMarker >= 0 && (newline < 0 || nextMarker < newline)) {
          write(text.slice(0, nextMarker)); text = text.slice(nextMarker); continue;
        }
        if (newline < 0) {
          if (Buffer.byteLength(text, 'utf8') > MAX_RECORD_BYTES) write(text);
          else buffer = text;
          return;
        }
        const record = text.slice(0, newline + 1);
        if (Buffer.byteLength(record, 'utf8') > MAX_RECORD_BYTES) write(record);
        else line(record);
        text = text.slice(newline + 1);
      }
    },
    end() {if (buffer) {line(buffer); buffer = '';}}
  };
}

function createNativeRuntimeExecution({vscode, spec, buildId, onEvent = () => {}, onExit = () => {}, onOutput = () => {}, isCurrent = () => true, spawn = childProcess.spawn, killProcess = process.kill, platform = process.platform, env = process.env, graceMs = 1500, drainMs = 500}) {
  const controllers = new Set();
  const execution = new vscode.CustomExecution(async () => {
    const runId = crypto.randomUUID();
    const writes = new vscode.EventEmitter(), closes = new vscode.EventEmitter();
    const stdout = new StringDecoder('utf8'), stderr = new StringDecoder('utf8');
    const decoded = (text, stream) => {
      if (text && isCurrent() && !cancelled) onOutput(text,stream);
      if (stream === 'stdout') decoder.push(text); else write(text);
    };
    let child, cancelled = false, closed = false, opened = false, timer, drainTimer;
    let inputClosed = false, rootExited = false, settledCode, forceKilled = false, previousCR = false;
    const write = text => {
      if (!text) return;
      const normalized = text.replace(/\n/g, (_, offset) => (offset ? text[offset - 1] === '\r' : previousCR) ? '\n' : '\r\n');
      previousCR = text.endsWith('\r');
      writes.fire(normalized);
    };
    const decoder = createRecordDecoder({runId, buildId, write, onEvent:event => {if (isCurrent() && !cancelled && !closed) onEvent(event);}});
    const childEnv = {...env, ZERO_RUNTIME_RUN_ID: runId, ZERO_RUNTIME_BUILD_ID: buildId};
    const systemRoot = Object.entries(childEnv).find(([key]) => key.toUpperCase() === 'SYSTEMROOT')?.[1];
    function kill(force) {
      if (!child?.pid || force && forceKilled) return;
      if (force) forceKilled = true;
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
      closed = true; clearTimeout(timer); clearTimeout(drainTimer);
      decoded(stdout.end(),'stdout'); decoder.end(); decoded(stderr.end(),'stderr');
      kill(true);
      child?.stdin?.destroy?.(); child?.stdout?.destroy?.(); child?.stderr?.destroy?.();
      controllers.delete(controller);
      const exitCode = settledCode ?? (cancelled ? 0 : (Number.isInteger(code) ? code : 1));
      onExit(exitCode); closes.fire(exitCode);
    }
    function rootExit(code) {
      if (rootExited || closed) return;
      rootExited = true;
      // Latch the actual wrapper result before cleanup or a later Stop changes
      // cancellation state. Descendants can hold stdout open after this event.
      settledCode = cancelled ? 0 : (Number.isInteger(code) ? code : 1);
      clearTimeout(timer);
      kill(true);
      if (!closed) {
        drainTimer = setTimeout(() => finish(settledCode), drainMs);
        drainTimer.unref?.();
      }
    }
    function close() {
      if (cancelled || closed) return;
      cancelled = true;
      if (!opened || !child) {finish(0); return;}
      if (rootExited) return;
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
          child.stdin?.on?.('error', () => {inputClosed = true;});
          child.stdin?.on?.('close', () => {inputClosed = true;});
          child.stdin?.on?.('finish', () => {inputClosed = true;});
          child.stdout.on('data', data => decoded(stdout.write(data),'stdout'));
          child.stderr.on('data', data => decoded(stderr.write(data),'stderr'));
          child.once('error', error => {if (!closed) {write(`Cannot start native Java: ${error.message}\r\n`); finish(1);}});
          child.once('exit', code => rootExit(code));
          child.once('close', code => {rootExit(code); finish(code);});
          if (cancelled) close();
        } catch (error) {write(`Cannot start native Java: ${error.message}\r\n`); finish(1);}
      },
      handleInput(data) {
        if (closed || cancelled) return;
        if (data === '\x03') close();
        else if (!inputClosed && child?.stdin?.writable && !child.stdin.destroyed && !child.stdin.writableEnded) {
          try {child.stdin.write(data, error => {if (error) inputClosed = true;});}
          catch {inputClosed = true;}
        }
      },
      close
    };
  });
  return {execution, dispose() {for (const controller of [...controllers]) controller.close();}};
}
module.exports = {nativeBuildIdentity, createRecordDecoder, createNativeRuntimeExecution};
