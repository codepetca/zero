'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {validateProblemReport, MAX_REPORT_BYTES} = require('../src/problem-report-contract');

function report() {
  return {
    schemaVersion: 1,
    reportId: '1bcf279a-bac7-4a7d-88aa-771295d78c02',
    occurredAt: '2026-11-18T12:30:00.000Z',
    source: 'automatic',
    operation: 'publish',
    stage: 'checking',
    code: 'ZERO_BUILDER_UNAVAILABLE',
    outcome: 'failed',
    environment: {
      zeroVersion: '0.5.80', editorVersion: '1.105.0', os: 'windows',
      osVersion: '10.0.26100', architecture: 'x64', distribution: 'windows-store',
      javaVersion: '21', frameworkVersion: '0.5.80', browserBuilderVersion: 'unknown'
    },
    breadcrumbs: [
      {operation: 'publish', stage: 'checking', outcome: 'started'}
    ]
  };
}

test('valid reports preserve the diagnostic context without sharing a mutable input', () => {
  const original = report();
  const validated = validateProblemReport(original);
  assert.deepEqual(validated, original);
  original.environment.zeroVersion = '0.0.1';
  assert.equal(validated.environment.zeroVersion, '0.5.80');
});

test('rejects local diagnostics and identifying fields at every schema boundary', () => {
  for (const secret of ['message', 'stack', 'path', 'repositoryUrl', 'account', 'accessToken', 'sourceCode']) {
    const value = report();
    value[secret] = 'private';
    assert.equal(validateProblemReport(value), null, secret);
    const environment = report();
    environment.environment[secret] = 'private';
    assert.equal(validateProblemReport(environment), null, 'environment.' + secret);
    const breadcrumb = report();
    breadcrumb.breadcrumbs[0][secret] = 'private';
    assert.equal(validateProblemReport(breadcrumb), null, 'breadcrumb.' + secret);
  }
});

test('rejects hidden arbitrary values in technical version and enum fields', () => {
  for (const key of Object.keys(report().environment)) {
    const value = report();
    value.environment[key] = '/Users/student/private-project?token=secret';
    assert.equal(validateProblemReport(value), null, key);
  }
  for (const key of ['operation', 'stage', 'code', 'outcome', 'source']) {
    const value = report();
    value[key] = 'private error content';
    assert.equal(validateProblemReport(value), null, key);
  }
});

test('student runtime and broad compiler failures require a manual report', () => {
  for (const code of ['ZERO_BUILDER_UPDATE_REQUIRED', 'ZERO_BUILDER_OPERATION_FAILED', 'STARTUP_FAILED', 'ASSET_MISSING', 'FRAME_EXCEPTION', 'UI_CALLBACK_FAILED', 'PROMISE_REJECTED', 'SHUTDOWN_FAILED', 'MANUAL_REPORT']) {
    const value = {...report(), code};
    assert.equal(validateProblemReport(value), null, code);
    assert.ok(validateProblemReport({...value, source: 'manual'}), code);
  }
});

test('free text is accepted only on explicitly manual reports', () => {
  const value = {...report(), description: 'I clicked Publish and the page never opened.'};
  assert.equal(validateProblemReport(value), null);
  assert.equal(validateProblemReport({...value, source: 'manual'}).description, value.description);
  assert.equal(validateProblemReport({...value, source: 'manual', description: 'x'.repeat(1001)}), null);
  assert.equal(validateProblemReport({...value, source: 'manual', description: 'text\u0000hidden'}), null);
});

test('requires bounded valid IDs, dates and breadcrumbs', () => {
  for (const [key, value] of [
    ['schemaVersion', 2], ['reportId', 'student-login'],
    ['occurredAt', '2026-02-30T12:30:00.000Z'], ['occurredAt', '2026-11-18'],
    ['breadcrumbs', Array.from({length: 9}, () => report().breadcrumbs[0])]
  ]) assert.equal(validateProblemReport({...report(), [key]: value}), null, key);
  assert.equal(validateProblemReport({...report(), breadcrumbs: [{operation: 'publish', stage: 'verifying', outcome: 'succeeded', message: 'secret'}]}), null);
  assert.equal(validateProblemReport({...report(), breadcrumbs: [null]}), null);
});

test('requires complete known environment fields and permits explicit unknowns', () => {
  const value = report();
  delete value.environment.javaVersion;
  assert.equal(validateProblemReport(value), null);
  value.environment.javaVersion = 'unknown';
  assert.ok(validateProblemReport(value));
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < MAX_REPORT_BYTES);
});

test('recovery keeps the report identity and schema', () => {
  const value = {...report(), outcome: 'recovered'};
  assert.deepEqual(validateProblemReport(value), value);
});
