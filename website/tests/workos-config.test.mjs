import test from 'node:test';
import assert from 'node:assert/strict';
import {workosConfigured, githubAuthentication} from '../lib/workos-config.mjs';
const env = {ZERO_WORKOS_ENABLED:'true',WORKOS_CLIENT_ID:'client_123',WORKOS_COOKIE_PASSWORD:'a'.repeat(32),WORKOS_COOKIE_NAME:'zero-workos-session',WORKOS_ISSUER:'https://api.workos.com/user_management/client_123',NEXT_PUBLIC_WORKOS_REDIRECT_URI:'https://zero.codepet.ca/zero-account/callback'};
test('explicit complete, pinned configuration is required',()=>{
  assert.equal(workosConfigured(env),true);
  for (const patch of [{ZERO_WORKOS_ENABLED:''},{WORKOS_COOKIE_PASSWORD:'short'},{WORKOS_COOKIE_NAME:'wos-session'},{WORKOS_COOKIE_DOMAIN:'.codepet.ca'},{WORKOS_ISSUER:'https://evil.test'},{NEXT_PUBLIC_WORKOS_REDIRECT_URI:'https://evil.test/zero-account/callback'},{NEXT_PUBLIC_WORKOS_REDIRECT_URI:'https://zero.codepet.ca/zero-account/callback?x=1'}]) assert.equal(workosConfigured({...env,...patch}),false);
  assert.equal(workosConfigured({}),false);
});
test('callback accepts only a non-impersonated GitHub authentication',()=>{
  assert.equal(githubAuthentication({authenticationMethod:'GitHubOAuth',user:{id:'user_123'}}),true);
  for (const value of [{authenticationMethod:'GoogleOAuth',user:{id:'user_123'}},{user:{id:'user_123'}},{authenticationMethod:'GitHubOAuth',user:{id:'123'}},{authenticationMethod:'GitHubOAuth',user:{id:'user_123'},impersonator:{}}]) assert.equal(githubAuthentication(value),false);
});
