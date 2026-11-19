'use strict';

const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const {
  REPORT_SCHEMA_VERSION, OPERATIONS, STAGES, REPORT_CODES, MANUAL_ONLY_CODES,
  validateProblemReport
} = require('./problem-report-contract');

const ENDPOINT = 'https://zero.codepet.ca/api/problem-reports';
const KEY = 'zero.problemReports.queue';
const MAX_QUEUE = 20;
const MAX_AGE = 7 * 86400000;
const MAX_ATTEMPTS = 4;
const TIMEOUT = 8000;
const VERSION_PATTERN = /^\d{1,5}(?:\.\d{1,5}){0,3}(?:-(?:dev|beta|preview)(?:\.\d{1,5})?)?$/;
const RECEIPT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function version(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value) ? value : 'unknown';
}

function numericVersion(value) {
  return version(String(value || '').match(/^\d+(?:\.\d+){0,3}/)?.[0]);
}

function environment(vscode, context, env = {}) {
  const platform = process.platform;
  let distribution = 'unknown';
  if (context.extensionMode === (vscode.ExtensionMode?.Development ?? 2)) {
    distribution = 'development';
  } else if (platform === 'win32' && env.ZERO_WINDOWS_DISTRIBUTION === 'store') {
    distribution = 'windows-store';
  } else if (platform === 'win32' && env.ZERO_WINDOWS_DISTRIBUTION === 'portable') {
    distribution = 'windows-portable';
  }
  return {
    zeroVersion: version(context.extension?.packageJSON?.version),
    editorVersion: version(vscode.version),
    os: ({darwin:'macos', win32:'windows', linux:'linux'})[platform] || 'unknown',
    osVersion: platform === 'darwin' ? 'unknown' : numericVersion(os.release()),
    architecture: ['arm64', 'x64', 'ia32'].includes(process.arch) ? process.arch : 'unknown',
    distribution,
    javaVersion: 'unknown',
    frameworkVersion: 'unknown',
    browserBuilderVersion: 'unknown'
  };
}

// Only the small, fixed project record is consulted. Reject symlinks and
// changing files; never execute a project or include its path.
async function readRecord(root, parts) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) return;
  const names = [];
  let current = path.parse(root).root;
  for (const part of path.resolve(root).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    names.push(current);
  }
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    names.push(current);
  }
  try {
    const directories = [];
    for (const name of names) {
      const info = await fs.lstat(name);
      if (!info.isDirectory() || info.isSymbolicLink()) return;
      directories.push(info);
    }
    const file = path.join(current, parts.at(-1));
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 65536) return;
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) return;
      const buffer = Buffer.alloc(65537);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      const bytes = buffer.subarray(0, length);
      const after = await handle.stat();
      const last = await fs.lstat(file);
      if (bytes.length !== opened.size || after.size !== opened.size ||
          after.mtimeMs !== opened.mtimeMs || last.ino !== opened.ino || last.dev !== opened.dev) return;
      for (let i = 0; i < names.length; i++) {
        const info = await fs.lstat(names[i]);
        if (info.isSymbolicLink() || info.ino !== directories[i].ino || info.dev !== directories[i].dev) return;
      }
      return JSON.parse(bytes.toString('utf8'));
    } finally {
      await handle.close();
    }
  } catch {
    return;
  }
}

async function projectEnvironment(vscode, context, env, root) {
  const result = environment(vscode, context, env);
  const record = await readRecord(root, ['zero-core.json']);
  if (record?.schema === 1) result.frameworkVersion = version(record.coordinate?.version);
  // The builder record has a protocol, not a release version. Do not label it
  // as a version; there is currently no truthful numeric builder version.
  return result;
}

function classify(error) {
  if (!error || typeof error !== 'object' || error.name === 'AbortError' || error.name === 'CancellationError') return;
  const code = error.code;
  const networkCodes = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH'];
  if (MANUAL_ONLY_CODES.has(code) || ['ABORT_ERR', 'ERR_NETWORK', ...networkCodes].includes(code) ||
      networkCodes.includes(error.cause?.code)) return;
  if (typeof code === 'string' && Object.hasOwn(REPORT_CODES, code) &&
      !MANUAL_ONLY_CODES.has(code) && code !== 'ZERO_OPERATION_FAILED') return code;
  // Only native Error instances from the extension host, not deserialized project
  // errors or messages, are eligible for these internal failure classes.
  if (error instanceof TypeError) return 'ZERO_INTERNAL_TYPE_ERROR';
  if (error instanceof ReferenceError) return 'ZERO_INTERNAL_REFERENCE_ERROR';
  if (error instanceof RangeError) return 'ZERO_INTERNAL_RANGE_ERROR';
}

function createProblemReporter(vscode, context, {
  send = globalThis.fetch, now = Date.now, retryDelay = 30000,
  timeoutMs = TIMEOUT, env = process.env, getProject = () => undefined
} = {}) {
  let disposed = false;
  let active;
  let activeManual;
  let manualBusy = false;
  let manualDraft;
  let timer;
  let queue = [];
  let chain = Promise.resolve();
  let persistence = Promise.resolve();
  let latest;
  let consentGeneration = 0;
  const crumbs = [];
  const failures = new Map();
  const queueScopes = new Map();
  const observedErrors = new WeakMap();

  const enabled = () => !disposed && vscode.env?.isTelemetryEnabled === true &&
    vscode.workspace.getConfiguration('zero').get('automaticProblemReports', false) === true;
  const persist = () => {
    const snapshot = JSON.parse(JSON.stringify(queue));
    persistence = persistence.then(() => context.globalState?.update(KEY, snapshot)).catch(() => {});
    return persistence;
  };
  const validEntry = item => item && Number.isSafeInteger(item.attempts) &&
    item.attempts >= 0 && item.attempts < MAX_ATTEMPTS &&
    item.report?.source === 'automatic' && validateProblemReport(item.report) &&
    now() - Date.parse(item.report.occurredAt) >= 0 && now() - Date.parse(item.report.occurredAt) < MAX_AGE;
  queue = (Array.isArray(context.globalState?.get(KEY)) ? context.globalState.get(KEY) : [])
    .filter(validEntry).slice(-MAX_QUEUE);

  function serialize(work) {
    chain = chain.then(work, work).catch(() => {});
    return chain;
  }
  function clear() {
    const hadStoredReports = queue.length > 0 || context.globalState?.get(KEY) !== undefined;
    consentGeneration++;
    clearTimeout(timer);
    timer = undefined;
    active?.abort();
    queue = [];
    failures.clear();
    queueScopes.clear();
    if (hadStoredReports) void persist();
  }
  function settingChanged() {
    if (!enabled()) clear();
    else void flush();
  }
  function breadcrumb(operation, stage, outcome) {
    if (!OPERATIONS.includes(operation) || !STAGES.includes(stage) ||
        !['started', 'succeeded', 'failed', 'cancelled'].includes(outcome)) return;
    crumbs.push({operation, stage, outcome});
    if (crumbs.length > 8) crumbs.shift();
  }
  async function makeReport(source, operation, stage, code, description, root) {
    const details = await projectEnvironment(vscode, context, env, root);
    return validateProblemReport({
      schemaVersion: REPORT_SCHEMA_VERSION,
      reportId: crypto.randomUUID(),
      occurredAt: new Date(now()).toISOString(),
      source, operation, stage, code,
      outcome: 'failed',
      environment: details,
      breadcrumbs: crumbs.slice(),
      ...(description ? {description} : {})
    });
  }
  async function transmit(report, controller) {
    let timeout;
    try {
      return await Promise.race([
        (async () => {
          const response = await send(ENDPOINT, {
            method: 'POST',
            headers: {'content-type':'application/json'},
            body: JSON.stringify(report),
            signal: controller.signal,
            redirect: 'error',
            credentials: 'omit'
          });
          if (response.status === 202) {
            const body = await response.json();
            if (RECEIPT_PATTERN.test(body?.receipt || '') && ['delivered', 'pending'].includes(body.status)) return body;
            return {status:'retry'};
          }
          return {status:response.status === 429 || response.status >= 500 ? 'retry' : 'rejected'};
        })(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('timeout'));
          }, timeoutMs);
        })
      ]);
    } catch {
      return {status:'retry'};
    } finally {
      clearTimeout(timeout);
    }
  }
  function schedule() {
    if (!timer && enabled() && queue.length) {
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, retryDelay);
      timer.unref?.();
    }
  }
  function flush(generation = consentGeneration) {
    return serialize(async () => {
      if (disposed || generation !== consentGeneration) return;
      if (!enabled()) {
        clear();
        return;
      }
      queue = queue.filter(validEntry);
      await persist();
      if (generation !== consentGeneration) return;
      while (enabled() && generation === consentGeneration && queue.length) {
        const item = queue[0];
        const controller = new AbortController();
        active = controller;
        const result = await transmit(item.report, controller);
        if (active === controller) active = undefined;
        if (disposed || generation !== consentGeneration) return;
        if (!enabled()) {
          clear();
          return;
        }
        if (result.status === 'delivered' || result.status === 'pending') {
          const failed = failures.get(item.report.operation);
          if (failed?.report.reportId === item.report.reportId) failed.accepted = true;
        }
        // The same id is retried for server-side idempotency.
        if (result.status === 'retry' || result.status === 'pending') {
          item.attempts++;
          if (item.attempts >= MAX_ATTEMPTS) {
            queue.shift();
            queueScopes.delete(item.report.reportId);
          }
          await persist();
          if (generation !== consentGeneration) return;
          schedule();
          return;
        }
        queue.shift();
        queueScopes.delete(item.report.reportId);
        await persist();
        if (generation !== consentGeneration) return;
      }
    });
  }
  function recordManual(operation, stage, code, scope) {
    if (!OPERATIONS.includes(operation)) return;
    const safeStage = STAGES.includes(stage) ? stage : 'unknown';
    const safeCode = typeof code === 'string' && Object.hasOwn(REPORT_CODES, code) ? code : 'MANUAL_REPORT';
    latest = {operation, stage:safeStage, code:safeCode, scope};
    breadcrumb(operation, safeStage, 'failed');
  }
  function failure(error, operation, stage = 'unknown', scope) {
    if (!OPERATIONS.includes(operation) || !STAGES.includes(stage)) return;
    if (error && typeof error === 'object') {
      const prior = observedErrors.get(error);
      if (prior?.operation === operation && prior.scope === scope) return;
      observedErrors.set(error, {operation, scope});
    }
    recordManual(operation, stage, error?.code || classify(error), scope);
    if (!enabled()) return;
    const code = classify(error);
    if (!code) return;
    const generation = consentGeneration;
    void makeReport('automatic', operation, stage, code, undefined, scope).then(report => {
      if (!report || !enabled() || generation !== consentGeneration) return;
      enqueue(report, scope, generation);
    }).catch(() => {});
  }
  function enqueue(report, scope, generation = consentGeneration) {
    void serialize(async () => {
      if (!enabled() || generation !== consentGeneration) return;
      const duplicate = queue.find(item =>
        item.report.operation === report.operation && item.report.stage === report.stage &&
        item.report.code === report.code && item.report.outcome === report.outcome &&
        JSON.stringify(item.report.environment) === JSON.stringify(report.environment));
      if (duplicate) {
        // A persisted report has no project identity, so it must never be
        // associated with a current project's later recovery.
        if (report.outcome === 'failed' && scope && queueScopes.get(duplicate.report.reportId) === scope) {
          const prior = failures.get(report.operation);
          if (prior?.report.reportId !== duplicate.report.reportId) {
            failures.set(report.operation, {scope, report:duplicate.report});
          }
        }
        return;
      }
      if (report.outcome === 'failed' && typeof scope === 'string' && scope) {
        failures.set(report.operation, {scope, report});
        queueScopes.set(report.reportId, scope);
      }
      queue.push({report, attempts:0});
      while (queue.length > MAX_QUEUE) queueScopes.delete(queue.shift().report.reportId);
      await persist();
    }).then(() => {if (generation === consentGeneration) return flush(generation);});
  }
  async function success(operation, scope, stage) {
    if (!enabled() || typeof scope !== 'string' || !scope) return;
    const failed = failures.get(operation);
    const generation = consentGeneration;
    if (!failed?.accepted || failed.scope !== scope || (failed.report.stage === 'opening' && stage !== 'opening') ||
        JSON.stringify(failed.report.environment) !== JSON.stringify(await projectEnvironment(vscode, context, env, scope))) return;
    if (!enabled() || generation !== consentGeneration || failures.get(operation) !== failed) return;
    failures.delete(operation);
    breadcrumb(operation, failed.report.stage, 'succeeded');
    const report = validateProblemReport({
      ...failed.report,
      occurredAt: new Date(now()).toISOString(),
      outcome: 'recovered',
      breadcrumbs: crumbs.slice()
    });
    if (report) enqueue(report, undefined, generation);
  }
  async function copyManualDraft() {
    try {
      await vscode.env.clipboard.writeText(JSON.stringify(manualDraft, null, 2));
      if (!disposed) await vscode.window.showInformationMessage('Problem report copied.');
    } catch {
      if (!disposed) await vscode.window.showInformationMessage('Problem report could not be copied.');
    }
  }
  async function manual() {
    if (disposed || manualBusy) return;
    manualBusy = true;
    try {
      if (manualDraft) {
        const choice = await vscode.window.showInformationMessage(
          'A reviewed problem report is ready.',
          {modal:true, detail:'Retry the same report, copy it, or start a new report.'},
          'Retry', 'Copy report', 'New report'
        );
        if (disposed) return;
        if (choice === 'Copy report') {
          await copyManualDraft();
          return;
        }
        if (choice === 'New report') manualDraft = undefined;
        else if (choice !== 'Retry') return;
      }
      if (!manualDraft) {
        const description = await vscode.window.showInputBox({
          title: 'Report a problem',
          prompt: 'Optional description. Do not include private information.',
          placeHolder: 'What happened? (optional)',
          ignoreFocusOut: true,
          validateInput: value => value.length > 1000 ? 'Use at most 1,000 characters.' :
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? 'Remove control characters.' : undefined
        });
        if (description === undefined || disposed) return;
        let root;
        try { root = getProject(); } catch {}
        const snapshot = latest && latest.scope === root ? latest :
          {operation:'manual', stage:'manual', code:'MANUAL_REPORT'};
        const report = await makeReport('manual', snapshot.operation, snapshot.stage, snapshot.code, description.trim(), root);
        if (!report || disposed) return;
        const answer = await vscode.window.showInformationMessage(
          'Send this problem report?',
          {modal:true, detail:`Review everything that will be sent:\n\n${JSON.stringify(report, null, 2)}\n\nYour optional description is sent as written. Do not include private information.`},
          'Send report'
        );
        if (answer !== 'Send report' || disposed) return;
        manualDraft = report;
      }
      while (!disposed && manualDraft) {
        const controller = new AbortController();
        activeManual = controller;
        const result = await transmit(manualDraft, controller);
        if (activeManual === controller) activeManual = undefined;
        if (disposed) return;
        if (result.status === 'delivered' || result.status === 'pending') {
          manualDraft = undefined;
          await vscode.window.showInformationMessage(result.status === 'delivered'
            ? `Problem report sent. Receipt: ${result.receipt}`
            : `Problem report received; delivery is pending. Receipt: ${result.receipt}`);
          return;
        }
        const choice = await vscode.window.showInformationMessage(
          'Problem report could not be confirmed.',
          {modal:true, detail:'Retry uses the same report. You can copy the reviewed report instead.'},
          'Retry', 'Copy report'
        );
        if (disposed) return;
        if (choice === 'Copy report') {
          await copyManualDraft();
          return;
        }
        if (choice !== 'Retry') return;
      }
    } finally {
      manualBusy = false;
    }
  }
  const listeners = [
    vscode.workspace.onDidChangeConfiguration?.(event => {
      if (event.affectsConfiguration('zero.automaticProblemReports')) settingChanged();
    }),
    vscode.env?.onDidChangeTelemetryEnabled?.(settingChanged)
  ].filter(Boolean);
  if (enabled()) void flush();
  else clear();

  return {
    breadcrumb, recordManual, failure, success, manual, flush,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      active?.abort();
      activeManual?.abort();
      manualDraft = undefined;
      listeners.forEach(listener => listener.dispose());
    }
  };
}
module.exports = {createProblemReporter, classify, environment, readRecord, KEY};
