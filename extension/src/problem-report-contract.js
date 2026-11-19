'use strict';

// Shared by the editor and report service. Free-form local diagnostics never
// enter this schema. Only an explicitly reviewed manual report may add text.
const REPORT_SCHEMA_VERSION = 1;
const MAX_REPORT_BYTES = 8192;
const OPERATIONS = Object.freeze([
  'run-native', 'run-browser', 'publish', 'sync', 'commit',
  'project-create', 'project-open', 'sign-in', 'manual'
]);
const STAGES = Object.freeze([
  'unknown', 'checking', 'preparing', 'native-compile', 'web-compile',
  'startup', 'frame-update', 'frame-draw', 'ui-callback', 'shutdown',
  'building', 'uploading', 'deploying', 'verifying', 'opening', 'sign-in',
  'project-read', 'git', 'manual'
]);
const REPORT_CODES = Object.freeze({
  ZERO_BUILDER_UPDATE_REQUIRED: 'The project browser tools differ from the installed Zero tools.',
  ZERO_BUILDER_UNAVAILABLE: 'The project browser tools are unavailable.',
  ZERO_BUILDER_OPERATION_FAILED: 'The browser builder could not complete the operation.',
  ZERO_INTERNAL_TYPE_ERROR: 'An unexpected type error occurred in Zero.',
  ZERO_INTERNAL_REFERENCE_ERROR: 'An unexpected reference error occurred in Zero.',
  ZERO_INTERNAL_RANGE_ERROR: 'An unexpected range error occurred in Zero.',
  ZERO_OPERATION_FAILED: 'An unexpected Zero operation failed.',
  WEB_PUBLISH_DEPLOYMENT_FAILED: 'GitHub Pages deployment failed.',
  WEB_PUBLISH_VERIFICATION_FAILED: 'The published app could not be verified.',
  WEB_PUBLISH_OPEN_FAILED: 'The published app could not be opened.',
  STARTUP_FAILED: 'The app failed during startup.',
  ASSET_MISSING: 'The app could not load an asset.',
  FRAME_EXCEPTION: 'The app failed during a game frame.',
  UI_CALLBACK_FAILED: 'An app UI callback failed.',
  PROMISE_REJECTED: 'An app browser operation failed.',
  SHUTDOWN_FAILED: 'The app failed during shutdown.',
  MANUAL_REPORT: 'The user reported a problem.'
});
// These broad failures can originate in student code. A manual report can
// describe them without automatically opening issues for ordinary Java errors.
const MANUAL_ONLY_CODES = new Set([
  'ZERO_BUILDER_OPERATION_FAILED', 'STARTUP_FAILED', 'ASSET_MISSING',
  'FRAME_EXCEPTION', 'UI_CALLBACK_FAILED', 'PROMISE_REJECTED', 'SHUTDOWN_FAILED',
  'MANUAL_REPORT'
]);
const ENVIRONMENT_KEYS = Object.freeze([
  'zeroVersion', 'editorVersion', 'os', 'osVersion', 'architecture',
  'distribution', 'javaVersion', 'frameworkVersion', 'browserBuilderVersion'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^(?:unknown|\d{1,5}(?:\.\d{1,5}){0,3}(?:-(?:dev|beta|preview)(?:\.\d{1,5})?)?)$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => object(value) &&
  required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));

function validateEnvironment(value) {
  if (!exactKeys(value, ENVIRONMENT_KEYS)) return false;
  for (const key of ['zeroVersion', 'editorVersion', 'osVersion', 'javaVersion', 'frameworkVersion', 'browserBuilderVersion']) {
    if (typeof value[key] !== 'string' || !VERSION.test(value[key])) return false;
  }
  return ['macos', 'windows', 'linux', 'unknown'].includes(value.os) &&
    ['arm64', 'x64', 'ia32', 'unknown'].includes(value.architecture) &&
    ['macos-app', 'windows-store', 'windows-portable', 'macos-portable', 'development', 'unknown'].includes(value.distribution);
}

function validateProblemReport(value) {
  const required = ['schemaVersion', 'reportId', 'occurredAt', 'source', 'operation', 'stage', 'code', 'outcome', 'environment', 'breadcrumbs'];
  if (!exactKeys(value, required, ['description'])) return null;
  if (value.schemaVersion !== REPORT_SCHEMA_VERSION || typeof value.reportId !== 'string' || !UUID.test(value.reportId)) return null;
  if (typeof value.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.occurredAt)) return null;
  if (!Number.isFinite(Date.parse(value.occurredAt)) || new Date(value.occurredAt).toISOString() !== value.occurredAt) return null;
  if (!['automatic', 'manual'].includes(value.source) || !OPERATIONS.includes(value.operation) || !STAGES.includes(value.stage)) return null;
  if (!Object.hasOwn(REPORT_CODES, value.code) || !['failed', 'recovered'].includes(value.outcome)) return null;
  if (value.source === 'automatic' && (MANUAL_ONLY_CODES.has(value.code) || Object.hasOwn(value, 'description'))) return null;
  if (Object.hasOwn(value, 'description') && (typeof value.description !== 'string' || value.description.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.description))) return null;
  if (!validateEnvironment(value.environment) || !Array.isArray(value.breadcrumbs) || value.breadcrumbs.length > 8) return null;
  for (const item of value.breadcrumbs) {
    if (!exactKeys(item, ['operation', 'stage', 'outcome']) || !OPERATIONS.includes(item.operation) || !STAGES.includes(item.stage) ||
      !['started', 'succeeded', 'failed', 'cancelled'].includes(item.outcome)) return null;
  }
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_REPORT_BYTES) return null;
    return JSON.parse(serialized);
  } catch { return null; }
}

module.exports = {
  REPORT_SCHEMA_VERSION, MAX_REPORT_BYTES, OPERATIONS, STAGES, REPORT_CODES,
  MANUAL_ONLY_CODES, ENVIRONMENT_KEYS, validateProblemReport
};
