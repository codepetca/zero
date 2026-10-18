import assert from 'node:assert/strict';
import test from 'node:test';
import {problemLink,siteStatus} from '../lib/hub-feedback-client.mjs';
const project={title:'Grove & Guard',repositoryHref:'https://github.com/armorup/zero-grove-guard',playHref:'https://armorup.github.io/zero-grove-guard/',version:'0.3.0',sourceCommit:'a'.repeat(40)};
test('problem report carries the exact context to enabled repository issues',()=>{
  const url=new URL(problemLink(project,true));
  assert.equal(url.origin+url.pathname,project.repositoryHref+'/issues/new');
  assert.equal(url.searchParams.get('title'),'Problem with Grove & Guard');
  const body=url.searchParams.get('body');
  for(const text of [project.repositoryHref,project.playHref,project.version,project.sourceCommit,'Steps to reproduce:','Browser/device:'])assert.ok(body.includes(text));
});
test('disabled or unknown issues use central reports without losing project context',()=>{
  for(const enabled of [false,null,undefined]){
    const url=new URL(problemLink(project,enabled));
    assert.equal(url.origin+url.pathname,'https://github.com/codepetca/zero/issues/new');
    assert.ok(url.searchParams.get('body').includes(project.repositoryHref));
  }
  assert.throws(()=>problemLink({...project,repositoryHref:'https://github.com.evil.test/a/b'},true));
});
test('reachability does not label a game healthy or treat unknown as failure',()=>{
  assert.equal(siteStatus({status:'reachable'}),'Site reachable');
  assert.equal(siteStatus({status:'unreachable'}),'Site unavailable');
  assert.equal(siteStatus({status:'unknown'}),'Site check unavailable');
  assert.equal(siteStatus({status:'not-checked'}),null);
  assert.equal(siteStatus(undefined),null);
});
