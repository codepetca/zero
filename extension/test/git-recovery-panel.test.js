'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {panel,selection,uploadMessage,localReminderMessage,syncMessage}=require('../src/git-recovery-panel');
const recovery=(branch='main',remoteBranch='main')=>({id:'a'.repeat(32),branch,remoteBranch,files:[{path:'Player.java',kind:'text',conflicts:[{id:'one',local:'speed = 5;\n',incoming:'speed = 3;\n'},{id:'two',local:'health = 100;\n',incoming:'health = 80;\n'}]}]});
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
test('ordinary push recovery stays in the single status area',()=>{
  for(const kind of ['behind','network','unconfirmed','changed','protected','remote-missing']){
    assert.equal(panel({pending:{branch:'main',kind}}),'');
  }
  assert.equal(syncMessage({kind:'remote-missing'}),'');
  assert.match(syncMessage({kind:'unconfirmed'}),/could not be confirmed.*Try Sync again/);
  assert.match(syncMessage({kind:'protected'}),/requires a pull request/);
  assert.match(uploadMessage({kind:'unconfirmed',committed:true}),/Committed locally.*confirmation was interrupted/);
});

test('undo reminder explains uncertainty and calls for recovery inspection',()=>{
 const text=localReminderMessage({operation:'undo'});assert.match(text,/may not have been applied/i);assert.match(text,/inspect.*recovery/i);
 assert.match(localReminderMessage({operation:'restore'}),/restore/i);assert.match(localReminderMessage({}),/local sync/i);
});
test('ref-only interrupted update exposes only the explicit review action',()=>{const html=panel({error:'A ref-only update record needs inspection.',refOnlyReview:true});assert.match(html,/zero.reviewInterruptedRefOnlyUpdate/);assert.doesNotMatch(html,/zero.retryBranchSync|zero.checkPush/);});
