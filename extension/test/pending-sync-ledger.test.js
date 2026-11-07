'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPendingSyncLedger}=require('../src/pending-sync-ledger');
const root='/project',branch='main',head='a'.repeat(40);
function state() {const values=new Map();return {values,get:key=>values.get(key),keys:()=>[...values.keys()],update:async(key,value)=>values.set(key,value)};}
const record=(remote,accountId='1')=>({root,branch,head,remote,page:remote,accountId,kind:'network',committed:true,pushStarted:true});
test('two ledger clients sharing state resolve only the selected record',async()=>{
 const shared=state(),a=createPendingSyncLedger(shared),b=createPendingSyncLedger(shared);
 const first=await a.add(record('https://github.com/a/one.git')),second=await b.add(record('https://github.com/b/two.git','2'));
 await a.resolve(first,'reviewed');assert.deepEqual(b.list(root,branch).map(r=>r.id),[second.id]);
 await b.resolve(second,'confirmed');assert.equal(a.list(root,branch).length,0);
 const receipts=[...shared.values.keys()].filter(k=>k.startsWith('zero.resolvedSync.v1:'));assert.equal(receipts.length,2);
 assert.notEqual(shared.get(receipts[0]).record.remote,shared.get(receipts[1]).record.remote);
});
test('legacy records remain intact and are resolved by immutable identity',async()=>{
 const shared=state(),ledger=createPendingSyncLedger(shared),legacy=record('https://github.com/a/one.git');
 const old=ledger.list(root,branch,legacy)[0];await ledger.resolve(old,'reviewed');assert.equal(ledger.list(root,branch,legacy).length,0);
 const changed={...legacy,remote:'https://github.com/b/two.git'};assert.equal(ledger.list(root,branch,changed).length,1);assert.equal(legacy.remote,'https://github.com/a/one.git');
});
test('failed persistence never resolves or overwrites an existing attempt',async()=>{
 const shared=state(),ledger=createPendingSyncLedger(shared),saved=await ledger.add(record('https://github.com/a/one.git'));
 shared.update=async()=>{throw Error('failure');};await assert.rejects(ledger.resolve(saved,'reviewed'),/could not be saved/);
 assert.equal(ledger.list(root,branch)[0].id,saved.id);
});
test('missing enumeration uses an explicit isolated in-memory fallback',async()=>{
 let warning=0;const ledger=createPendingSyncLedger({get:()=>undefined,update:async()=>{}},{onFallback:()=>warning++});
 const saved=await ledger.add(record('https://github.com/a/one.git'));assert.equal(warning,1);assert.equal(ledger.list(root,branch)[0].id,saved.id);
 assert.throws(()=>ledger.listAll(root),/cannot be fully enumerated/);assert.equal(ledger.list(root,branch)[0].id,saved.id);
});
test('list-all includes other branches and legacy records without mutating them',async()=>{
 const shared=state(),ledger=createPendingSyncLedger(shared),one=await ledger.add(record('https://github.com/a/one.git'));
 const two=await ledger.add({...record('https://github.com/b/two.git','2'),branch:'feature'}),outside=await ledger.add({...record('https://github.com/a/one.git'),root:'/other'});
 const legacy={...record('https://github.com/c/three.git'),branch:'old'};shared.values.set(`zero.gitUploadRecovery:${root}:old`,legacy);
 const legacyLocal={root,branch:'local',head};shared.values.set(`zero.localCommitPending:${root}:local`,legacyLocal);
 const rows=ledger.listAll(root);assert.deepEqual(new Set(rows.map(row=>row.branch)),new Set(['main','feature','old','local']));assert.ok(!rows.some(row=>row.id===outside.id));assert.deepEqual(shared.get(`zero.gitUploadRecovery:${root}:old`),legacy);
 await ledger.resolve(two,'confirmed');assert.ok(!ledger.listAll(root).some(row=>row.id===two.id));assert.ok(ledger.listAll(root).some(row=>row.id===one.id));
 shared.values.set(`zero.gitUploadRecovery:${root}:bad`,{root,branch:'bad'});assert.throws(()=>ledger.listAll(root),/unreadable/);
});
test('confirmation matches exact destination, account, head and operation only',()=>{
 const {matchesConfirmed}=require('../src/pending-sync-ledger'),saved=record('https://github.com/a/one.git');
 const expected={root,branch,remote:saved.remote,head,accountId:'1',operation:'branch'};
 assert.equal(matchesConfirmed(saved,expected),true);
 for(const changed of [{remote:'https://github.com/b/two.git'},{head:'b'.repeat(40)},{accountId:'2'},{accountId:undefined},{operation:'merge'},{operation:'unknown'},{branch:'other'},{type:'local'},{type:'unknown'}])assert.equal(matchesConfirmed({...saved,...changed},expected),false);
 assert.equal(matchesConfirmed({...saved,remote:''},{...expected,remote:''}),false);
 assert.equal(matchesConfirmed(saved,{...expected,accountId:undefined}),false);
});
test('unreadable attempts, markers and legacy records fail closed',async()=>{
 for(const [key,value] of [['zero.pendingSync.v1:bad',{id:'bad'}],['zero.resolvedSync.v1:bad',{id:'missing'}]]){
  const shared=state(),ledger=createPendingSyncLedger(shared);shared.values.set(key,value);
  assert.throws(()=>ledger.list(root,branch),/unreadable/);
 }
 assert.throws(()=>createPendingSyncLedger(state()).list(root,branch,{root,branch}),/unreadable/);
});
test('list-all rejects orphan invalid markers and markers that hide a different reminder',async()=>{
 const shared=state(),ledger=createPendingSyncLedger(shared);
 shared.values.set('zero.resolvedSync.v1:bad',{id:'missing'});
 assert.throws(()=>ledger.listAll(root),/unreadable/);
 shared.values.clear();
 const saved=await ledger.add(record('https://github.com/a/one.git'));
 shared.values.set('zero.resolvedSync.v1:bad',{id:saved.id,reason:'confirmed',record:{...saved,head:'b'.repeat(40)}});
 assert.throws(()=>ledger.listAll(root),/does not match/);
 assert.throws(()=>ledger.list(root,branch),/does not match/);
});

test('compatibility ledger validates and retains an undo intent without treating it as a confirmed push',async()=>{
 const path=require('node:path'),shared=state(),ledger=createPendingSyncLedger(shared);
 const intent={root,branch,head,remote:'',type:'local',operation:'undo',recoveryPath:path.join(root,'.git','zero-project-restore-recovery-Ab12')};
 const saved=await ledger.add(intent);assert.deepEqual(ledger.list(root,branch),[saved]);
 for(const bad of [{...intent,recoveryPath:'/elsewhere'}, {...intent,recoveryPath:undefined},{...intent,type:'push'}])await assert.rejects(ledger.add(bad),/invalid/i);
 const {matchesConfirmed}=require('../src/pending-sync-ledger');assert.equal(matchesConfirmed({...saved,accountId:'1'},{root,branch,head,remote:'',accountId:'1'}),false);
 await ledger.resolve(saved,'reviewed');assert.deepEqual(ledger.list(root,branch),[]);
});
