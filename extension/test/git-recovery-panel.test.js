'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {panel,selection,uploadMessage,localReminderMessage}=require('../src/git-recovery-panel');
const recovery=(branch='main',remoteBranch='main')=>({id:'a'.repeat(32),branch,remoteBranch,files:[{path:'Player.java',kind:'text',conflicts:[{id:'one',local:'speed = 5;\n',incoming:'speed = 3;\n'},{id:'two',local:'health = 100;\n',incoming:'health = 80;\n'}]}]});
test('ref-only pending and acknowledgement records require inspection and never offer retry',()=>{
 for(const kind of ['ref-pending','ref-acknowledged']){const html=panel({pending:{operation:'reftable-ref-only',kind}});assert.match(html,/needs inspection/i);assert.match(html,/does not authorize syncing/i);assert.match(html,/Open Source Control/);assert.doesNotMatch(html,/zero.retryBranchSync|zero.checkPush|zero.syncSavedCommits/);}
});
test('conflict choices direct students to Source Control while gated',()=>{
 const html=panel({recovery:recovery()});assert.match(html,/temporarily unavailable/);assert.match(html,/Open Source Control/);assert.match(html,/Inspect retained conflict copies/);assert.match(html,/zero.compareUpdate/);assert.doesNotMatch(html,/zero.keepLocalUpdate|zero.useIncomingUpdate|zero.cancelUpdate/);
});
test('a stale choice cannot identify a different or identical next conflict',()=>{
  const current=recovery();const initial=selection(current).token;
  current.files[0].conflicts.shift();assert.notEqual(selection(current).token,initial);
  const duplicate=recovery();duplicate.files[0].conflicts[1]={...duplicate.files[0].conflicts[0]};const previous=selection(duplicate).token;
  duplicate.files[0].conflicts.shift();assert.notEqual(selection(duplicate).token,previous);
  assert.equal(selection(JSON.parse(JSON.stringify(duplicate))).token,selection(duplicate).token);
});
test('only a validated ready update offers continuation',()=>{
 const ready={...recovery(),files:[],readyToCommit:true,readyFingerprint:'a'.repeat(64),nativeRequired:false};
 const html=panel({recovery:ready});assert.match(html,/zero.continueUpdate/);assert.doesNotMatch(html,/zero.cancelUpdate/);
 const token=selection(ready).token;ready.readyFingerprint='b'.repeat(64);assert.notEqual(selection(ready).token,token);
 delete ready.readyToCommit;ready.nativeRequired=true;assert.doesNotMatch(panel({recovery:ready}),/zero.continueUpdate/);
});
test('all unresolved conflict types use Source Control while choices are gated',()=>{
 for(const kind of ['text','delete','binary','complex']){const current=recovery();current.files[0].kind=kind;const html=panel({recovery:current});assert.match(html,/Open Source Control/);assert.doesNotMatch(html,/zero.keepLocalUpdate|zero.useIncomingUpdate|zero.cancelUpdate/);}
});
test('push recovery is destination-specific and never claims an uncertain push succeeded',()=>{
  assert.match(panel({pending:{branch:'main',kind:'behind'}}),/zero.syncProject/);
  assert.match(panel({pending:{branch:'feature',kind:'behind'}}),/zero.updateBranchFromGitHub/);
  assert.match(panel({pending:{branch:'main',kind:'unconfirmed'}}),/zero.checkPush/);
  const changed=panel({pending:{branch:'main',kind:'changed'}});
  assert.match(changed,/project or GitHub sign-in changed/);assert.match(changed,/Check your GitHub account/);assert.match(changed,/zero.checkPush/);
  assert.doesNotMatch(changed,/Pushed to|confirmed on GitHub/);
  assert.match(uploadMessage({kind:'unconfirmed',committed:true}),/Committed locally.*confirmation was interrupted/);
  assert.match(panel({pending:{branch:'main',kind:'protected'}}),/Create feature branch/);
  assert.match(panel({pending:{branch:'feature',kind:'auth',operation:'merge'}}),/zero.reconnectGitHub/);
  assert.match(panel({pending:{branch:'feature',kind:'ready',operation:'merge'}}),/Retry Merge to main/);
  assert.match(panel({pending:{branch:'feature',kind:'network',pushStarted:false}}),/zero.retryBranchSync/);
  const uncertain=panel({pending:{branch:'feature',kind:'network',pushStarted:true}});
  assert.match(uncertain,/push may have started/i);assert.match(uncertain,/zero.checkPush/);assert.doesNotMatch(uncertain,/Push sent/);
  const missing=panel({pending:{branch:'feature',kind:'remote-missing'}});
  assert.match(missing,/branch missing/i);assert.match(missing,/Review branch creation/);assert.doesNotMatch(missing,/Check your connection and retry/);
  assert.match(uploadMessage({kind:'ready',pushStarted:false}),/local commits are ready to push/);
  assert.match(panel({pending:{branch:'feature',kind:'protected'}}),/Open Source Control/);
  assert.doesNotMatch(panel({pending:{kind:'network'},disabled:true}),/data-command="[^"]+"\s*>/);
});

test('undo reminder explains uncertainty and calls for recovery inspection',()=>{
 const text=localReminderMessage({operation:'undo'});assert.match(text,/may not have been applied/i);assert.match(text,/inspect.*recovery/i);
 assert.match(localReminderMessage({operation:'restore'}),/restore/i);assert.match(localReminderMessage({}),/local sync/i);
});
test('ref-only interrupted update exposes only the explicit review action',()=>{const html=panel({error:'A ref-only update record needs inspection.',refOnlyReview:true});assert.match(html,/zero.reviewInterruptedRefOnlyUpdate/);assert.doesNotMatch(html,/zero.retryBranchSync|zero.checkPush/);});
