'use strict';

const DEVICE_ENDPOINT = 'https://github.com/login/device/code';
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const DEVICE_PAGE = 'https://github.com/login/device';
const MAX_RESPONSE_BYTES = 65536;
const SAFE_ERROR = Symbol('safe GitHub error');
function failure(code, message) { return Object.assign(new Error(message), {code, [SAFE_ERROR]:true}); }
function cancelled() { return failure('cancelled', 'GitHub sign-in was cancelled. Local running still works.'); }
function checkSignal(signal) { if (signal?.aborted) throw cancelled(); }
function wait(ms, signal) {
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, {once:true});
  });
}
// Never propagate response bodies or transport errors: they can contain credentials.
async function requestJson(fetchImpl, url, {body, token, signal, jsonBody = false} = {}) {
  checkSignal(signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once:true});
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetchImpl(url, {
      method:body ? 'POST' : 'GET', redirect:'error', signal:controller.signal,
      headers:{Accept:'application/json', ...(body ? {'Content-Type':jsonBody?'application/json':'application/x-www-form-urlencoded'} : {'X-GitHub-Api-Version':'2026-03-10'}), ...(jsonBody?{'X-Zero-Desktop':'1'}:{}), ...(token ? {Authorization:`Bearer ${token}`} : {})},
      ...(body ? {body:jsonBody?JSON.stringify(body):new URLSearchParams(body).toString()} : {})
    });
    if (!response.ok) throw failure(response.status === 401 ? 'unauthorized' : 'github-unavailable', 'GitHub could not verify the connection. Try again later.');
    let text = '';
    if (response.body?.getReader) {
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let size = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw failure('invalid-response', 'GitHub returned an invalid response.'); }
          text += decoder.decode(part.value, {stream:true});
        }
      } finally { reader.releaseLock(); }
    } else {
      text = await response.text();
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw failure('invalid-response', 'GitHub returned an invalid response.');
    }
    checkSignal(signal);
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid-response', 'GitHub returned an invalid response.');
    return value;
  } catch (error) {
    checkSignal(signal);
    if (error?.[SAFE_ERROR] && ['unauthorized','github-unavailable','invalid-response'].includes(error.code)) throw error;
    throw failure('github-unavailable', 'GitHub did not confirm the connection. Try again later.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function tokenPair(value, now = Date.now()) {
  if (typeof value.access_token !== 'string' || !/^ghu_[A-Za-z0-9_]{8,512}$/.test(value.access_token) ||
      typeof value.refresh_token !== 'string' || !/^ghr_[A-Za-z0-9_]{8,512}$/.test(value.refresh_token) ||
      value.token_type !== 'bearer' || (value.scope !== undefined && value.scope !== '') ||
      !Number.isInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 28800 ||
      !Number.isInteger(value.refresh_token_expires_in) || value.refresh_token_expires_in < 1 || value.refresh_token_expires_in > 15897600) {
    throw failure('invalid-response', 'GitHub did not return the required expiring App credentials. Sign in again.');
  }
  return {accessToken:value.access_token, refreshToken:value.refresh_token, expiresAt:now + value.expires_in * 1000, refreshExpiresAt:now + value.refresh_token_expires_in * 1000};
}
async function deviceFlow({clientId, fetchImpl = globalThis.fetch, now = Date.now, signal, onCode, sleep = wait}) {
  const device = await requestJson(fetchImpl, DEVICE_ENDPOINT, {body:{client_id:clientId, scope:'offline_access'}, signal});
  if (typeof device.device_code !== 'string' || !/^[A-Za-z0-9_=-]{8,512}$/.test(device.device_code) ||
      typeof device.user_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(device.user_code) ||
      device.verification_uri !== DEVICE_PAGE || !Number.isInteger(device.expires_in) || device.expires_in < 1 || device.expires_in > 900 ||
      (device.interval !== undefined && (!Number.isInteger(device.interval) || device.interval < 1 || device.interval > 60))) {
    throw failure('invalid-response', 'GitHub returned an invalid device sign-in response.');
  }
  const deadline = now() + device.expires_in * 1000;
  let interval = Math.max(5, device.interval || 5) * 1000;
  await onCode({userCode:device.user_code, verificationUri:DEVICE_PAGE});
  while (now() + interval < deadline) {
    await sleep(interval, signal); checkSignal(signal);
    if (now() >= deadline) break;
    const value = await requestJson(fetchImpl, TOKEN_ENDPOINT, {body:{client_id:clientId, device_code:device.device_code, grant_type:'urn:ietf:params:oauth:grant-type:device_code'}, signal});
    if (!value.error) return tokenPair(value, now());
    if (value.error === 'authorization_pending') continue;
    if (value.error === 'slow_down') { interval = Math.max(interval + 5000, Number.isInteger(value.interval) ? value.interval * 1000 : 0); continue; }
    if (value.error === 'access_denied') throw cancelled();
    if (['expired_token','token_expired'].includes(value.error)) break;
    throw failure('sign-in-failed', 'GitHub could not complete App sign-in. Check that device sign-in is enabled and try again.');
  }
  throw failure('device-expired', 'The GitHub sign-in code expired. Sign in again for a new code.');
}
async function refreshTokens({clientId, refreshToken, fetchImpl = globalThis.fetch, now = Date.now, signal}) {
  const value = await requestJson(fetchImpl, TOKEN_ENDPOINT, {body:{client_id:clientId, grant_type:'refresh_token', refresh_token:refreshToken}, signal});
  if (value.error) throw failure('refresh-rejected', 'GitHub could not renew the Zero connection. Sign in again.');
  return tokenPair(value, now());
}
module.exports = {deviceFlow, refreshTokens, requestJson, tokenPair, failure, wait};
