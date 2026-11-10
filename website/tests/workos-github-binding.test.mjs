import assert from 'node:assert/strict';
import test from 'node:test';
import zeroApp from '../../extension/src/github-app/config.json' with {type: 'json'};
import {verifyWorkOSGitHubBinding} from '../lib/workos-github-binding.mjs';

const token = `ghu_${'a'.repeat(24)}`;
const secret = 'mock-only-github-app-secret';
const env = {ZERO_HUB_GITHUB_CLIENT_ID: zeroApp.clientId, ZERO_HUB_GITHUB_CLIENT_SECRET: secret};
const callback = {authenticationMethod: 'GitHubOAuth', user: {id: 'user_Test123', email: 'ignored@example.com'},
  oauthTokens: {accessToken: token, refreshToken: 'mock-refresh-token'}};
const person = {id: 521, login: 'new-name', type: 'User'};
const authorization = {app: {client_id: zeroApp.clientId}, user: {...person, login: 'old-name'}};
const tokenCheckUrl = `https://api.github.com/applications/${zeroApp.clientId}/token`;
const userUrl = 'https://api.github.com/user';
const invalid = {message: 'Zero could not verify the GitHub account.'};

test('binds the WorkOS user to the pinned App token owner and returns only account metadata', async () => {
  const requests = [];
  const result = await verifyWorkOSGitHubBinding(callback, {env, fetchImpl: async (url, options) => {
    requests.push({url, options});
    return Response.json(url === tokenCheckUrl ? authorization : person);
  }});

  assert.deepEqual(result, {workosUserId: 'user_Test123', githubId: '521', login: 'new-name'});
  assert.deepEqual(requests.map(({url}) => url), [tokenCheckUrl, userUrl]);
  const [{options: check}, {options: user}] = requests;
  assert.equal(check.method, 'POST');
  assert.equal(check.headers.Authorization, `Basic ${Buffer.from(`${zeroApp.clientId}:${secret}`).toString('base64')}`);
  assert.deepEqual(JSON.parse(check.body), {access_token: token});
  assert.equal(user.headers.Authorization, `Bearer ${token}`);
  for (const {options} of requests) {
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
  }
});

test('rejects other auth methods, impersonation, invalid provider data and unpinned configuration before calling GitHub', async () => {
  let calls = 0;
  const fetchImpl = async () => {calls++; throw new Error('Unexpected network call');};
  for (const input of [
    {...callback, authenticationMethod: undefined},
    {...callback, authenticationMethod: 'GoogleOAuth'},
    {...callback, impersonator: {}},
    {...callback, user: {id: 'client_Test123'}},
    {...callback, oauthTokens: undefined},
    {...callback, oauthTokens: {accessToken: 'gho_otheroauthapplication'}},
    {...callback, oauthTokens: {accessToken: {toString: () => token}}}
  ]) {
    await assert.rejects(verifyWorkOSGitHubBinding(input, {env, fetchImpl}), invalid);
  }
  await assert.rejects(verifyWorkOSGitHubBinding(callback, {env: {...env, ZERO_HUB_GITHUB_CLIENT_ID: 'IvOtherApp'}, fetchImpl}), invalid);
  await assert.rejects(verifyWorkOSGitHubBinding(callback, {env: {...env, ZERO_HUB_GITHUB_CLIENT_SECRET: ''}, fetchImpl}), invalid);
  assert.equal(calls, 0);
});

test('requires the App authorization to name the pinned client and a valid personal account', async () => {
  for (const [data, status] of [
    [authorization, 404],
    [{...authorization, app: {client_id: 'IvOtherApp'}}, 200],
    [{...authorization, user: {...person, type: 'Bot'}}, 200],
    [{...authorization, user: {...person, id: '521'}}, 200]
  ]) {
    const urls = [];
    await assert.rejects(verifyWorkOSGitHubBinding(callback, {env, fetchImpl: async (url) => {
      urls.push(url);
      return Response.json(data, {status});
    }}), invalid);
    assert.deepEqual(urls, [tokenCheckUrl]);
  }
});

test('rejects account mismatches and malformed users without disclosing provider errors', async () => {
  for (const user of [{...person, id: person.id + 1}, {...person, type: 'Organization'}, {...person, login: 'bad/name'}]) {
    await assert.rejects(verifyWorkOSGitHubBinding(callback, {env, fetchImpl: async (url) =>
      Response.json(url === tokenCheckUrl ? authorization : user)}), invalid);
  }
  await assert.rejects(verifyWorkOSGitHubBinding(callback, {env, fetchImpl: async () => {
    throw new Error(`Upstream error with ${secret} and ${token}`);
  }}), error => error.message === invalid.message && error.cause === undefined);
});
