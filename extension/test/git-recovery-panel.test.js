'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {panel,selection,uploadMessage}=require('../src/git-recovery-panel');
const recovery=(branch='main',remoteBranch='main')=>({id:'a'.repeat(32),branch,remoteBranch,files:[{path:'Player.java',kind:'text',conflicts:[{id:'one',local:'speed = 5;\n',incoming:'speed = 3;\n'},{id:'two',local:'health = 100;\n',incoming:'health = 80;\n'}]}]});
test('conflict choices use the right branch vocabulary and escape source/path content',()=>{
  const main=recovery();main.files[0].path='<img src=x>';main.files[0].conflicts[0].local='<script>leak()</script>';
  const html=panel({recovery:main});assert.match(html,/Keep my changes/);assert.match(html,/Use GitHub’s changes/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img/);
  const feature=panel({recovery:recovery('feature')});assert.match(feature,/Keep this branch’s changes/);assert.match(feature,/Use main’s changes/);
  const otherComputer=panel({recovery:recovery('feature','feature')});assert.match(otherComputer,/Use GitHub’s changes/);assert.doesNotMatch(otherComputer,/Use main’s changes/);
});
test('a stale choice cannot identify a different or identical next conflict',()=>{
  const current=recovery();const initial=selection(current).token;
  current.files[0].conflicts.shift();assert.notEqual(selection(current).token,initial);
  const duplicate=recovery();duplicate.files[0].conflicts[1]={...duplicate.files[0].conflicts[0]};const previous=selection(duplicate).token;
  duplicate.files[0].conflicts.shift();assert.notEqual(selection(duplicate).token,previous);
  assert.equal(selection(JSON.parse(JSON.stringify(duplicate))).token,selection(duplicate).token);
});
test('whole-file and unsupported paths are distinguished without offering destructive generic file choices',()=>{
  const current=recovery();current.files[0]={path:'Player.java',kind:'delete',conflicts:[{id:'file',local:'Keep local file',incoming:'Delete file'}]};
  assert.match(panel({recovery:current}),/Accept incoming deletion/);assert.match(panel({recovery:current}),/whole file/);
  current.files[0].kind='binary';assert.match(panel({recovery:current}),/Keep my file/);
  current.files[0].kind='complex';current.nativeRequired=true;
  const complex=panel({recovery:current});assert.match(complex,/Open Source Control/);assert.match(complex,/Cancel update/);assert.doesNotMatch(complex,/zero.keepLocalUpdate|zero.useIncomingUpdate/);
});
test('push recovery is destination-specific and never claims an uncertain push succeeded',()=>{
  assert.match(panel({pending:{branch:'main',kind:'behind'}}),/zero.syncProject/);
  assert.match(panel({pending:{branch:'feature',kind:'behind'}}),/zero.updateBranchFromGitHub/);
  assert.match(panel({pending:{branch:'main',kind:'unconfirmed'}}),/zero.checkPush/);
  assert.match(uploadMessage({kind:'unconfirmed',committed:true}),/Committed locally.*confirmation was interrupted/);
  assert.match(panel({pending:{branch:'main',kind:'protected'}}),/Create feature branch/);
  assert.match(panel({pending:{branch:'feature',kind:'auth',operation:'merge'}}),/zero.reconnectGitHub/);
  assert.match(panel({pending:{branch:'feature',kind:'ready',operation:'merge'}}),/Retry Merge to main/);
  assert.match(uploadMessage({kind:'ready'}),/local commits are ready to push/);
  assert.match(panel({pending:{branch:'feature',kind:'protected'}}),/Open Source Control/);
  assert.doesNotMatch(panel({pending:{kind:'network'},disabled:true}),/data-command="[^"]+"\s*>/);
});
