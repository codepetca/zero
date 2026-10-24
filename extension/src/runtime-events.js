'use strict';
// Local diagnostic data only. These records never carry editor command authority.
const VERSION = 1;
const NATIVE_PREFIX = '\x1eZERO_RUNTIME_V1 ';
const MAX_DIAGNOSTIC = 8192;
const MAX_RECORD_BYTES = 65536;
const TYPES = Object.freeze(['startup', 'ui-ready', 'first-frame', 'fatal', 'stopped']);
const STAGES = Object.freeze(['startup', 'asset-load', 'frame-update', 'frame-draw', 'ui-callback', 'promise', 'shutdown']);
const CODES = Object.freeze(['STARTING', 'UI_READY', 'FIRST_FRAME', 'STARTUP_FAILED', 'ASSET_MISSING', 'FRAME_EXCEPTION', 'UI_CALLBACK_FAILED', 'PROMISE_REJECTED', 'SHUTDOWN_FAILED', 'STOPPED']);
const CODE_RULES = Object.freeze({
  STARTING: Object.freeze({type: 'startup', stages: Object.freeze(['startup'])}),
  UI_READY: Object.freeze({type: 'ui-ready', stages: Object.freeze(['startup'])}),
  FIRST_FRAME: Object.freeze({type: 'first-frame', stages: Object.freeze(['frame-draw'])}),
  STARTUP_FAILED: Object.freeze({type: 'fatal', stages: Object.freeze(['startup'])}),
  ASSET_MISSING: Object.freeze({type: 'fatal', stages: Object.freeze(['asset-load'])}),
  FRAME_EXCEPTION: Object.freeze({type: 'fatal', stages: Object.freeze(['frame-update', 'frame-draw'])}),
  UI_CALLBACK_FAILED: Object.freeze({type: 'fatal', stages: Object.freeze(['ui-callback'])}),
  PROMISE_REJECTED: Object.freeze({type: 'fatal', stages: Object.freeze(['promise'])}),
  SHUTDOWN_FAILED: Object.freeze({type: 'fatal', stages: Object.freeze(['shutdown'])}),
  STOPPED: Object.freeze({type: 'stopped', stages: Object.freeze(['shutdown'])})
});
const validIdentity = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
function validateRuntimeEvent(value, expected = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => !['version', 'runId', 'buildId', 'seq', 'type', 'stage', 'code', 'diagnostic'].includes(key))) return null;
  if (value.version !== VERSION || !validIdentity(value.runId) || !validIdentity(value.buildId) || !Number.isSafeInteger(value.seq) || value.seq < 1) return null;
  if (!TYPES.includes(value.type) || !STAGES.includes(value.stage) || !CODES.includes(value.code)) return null;
  const rule = CODE_RULES[value.code];
  if (!rule || rule.type !== value.type || !rule.stages.includes(value.stage)) return null;
  if (value.diagnostic !== undefined && (typeof value.diagnostic !== 'string' || value.diagnostic.length > MAX_DIAGNOSTIC)) return null;
  if (expected.runId !== undefined && value.runId !== expected.runId || expected.buildId !== undefined && value.buildId !== expected.buildId) return null;
  if (expected.afterSeq !== undefined && value.seq <= expected.afterSeq) return null;
  try { if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_RECORD_BYTES) return null; } catch { return null; }
  return {...value};
}
function parseNativeRecord(line, expected) {
  if (typeof line !== 'string' || !line.startsWith(NATIVE_PREFIX) || Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) return null;
  try { return validateRuntimeEvent(JSON.parse(line.slice(NATIVE_PREFIX.length)), expected); } catch { return null; }
}
module.exports = {VERSION, NATIVE_PREFIX, MAX_DIAGNOSTIC, MAX_RECORD_BYTES, TYPES, STAGES, CODES, CODE_RULES, validIdentity, validateRuntimeEvent, parseNativeRecord};
