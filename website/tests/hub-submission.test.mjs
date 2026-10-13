import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clearSubmissionReturn,consumeSubmissionReturn,createSubmissionReader,rememberSubmissionReturn,submissionFromSearch,submissionLink,takeSelectedFiles} from '../lib/hub-submission.mjs';
const id='11111111-2222-3333-4444-555555555555';
const other='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function tabStorage(){
  const values=new Map();
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
test('fixed sign-in return keeps only one opaque ID and consumes it once',()=>{
  const storage=tabStorage();
  rememberSubmissionReturn(`?submission=${id}`,storage);
  assert.deepEqual([...storage.values.values()],[id]);
  assert.equal(consumeSubmissionReturn('',storage),id);
  assert.equal(storage.values.size,0);assert.equal(consumeSubmissionReturn('',storage),null);
});
test('direct bookmarked result wins over a pending sign-in return and clears it',()=>{
  const storage=tabStorage();rememberSubmissionReturn(`?submission=${other}`,storage);
  assert.equal(consumeSubmissionReturn(`?submission=${id}`,storage),id);
  assert.equal(storage.values.size,0);assert.equal(consumeSubmissionReturn('',storage),null);
});
test('ordinary sign-in, malformed markers and signout discard stale return IDs',()=>{
  const storage=tabStorage();rememberSubmissionReturn(`?submission=${id}`,storage);
  rememberSubmissionReturn('',storage);assert.equal(storage.values.size,0);
  rememberSubmissionReturn(`?submission=${id}`,storage);
  rememberSubmissionReturn('?submission=invalid',storage);assert.equal(storage.values.size,0);
  storage.setItem('zero-hub-submission-return','https://other.example/private');
  assert.equal(consumeSubmissionReturn('',storage),null);assert.equal(storage.values.size,0);
  rememberSubmissionReturn(`?submission=${id}`,storage);clearSubmissionReturn(storage);assert.equal(storage.values.size,0);
});
test('unavailable storage cannot block sign-in or direct bookmark recovery',()=>{
  const inaccessible={getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');},removeItem(){throw new Error('unavailable');}};
  for(const storage of [null,inaccessible]){
    assert.doesNotThrow(()=>rememberSubmissionReturn(`?submission=${id}`,storage));
    assert.doesNotThrow(()=>rememberSubmissionReturn('?submission=invalid',storage));
    assert.doesNotThrow(()=>clearSubmissionReturn(storage));
    assert.equal(consumeSubmissionReturn('',storage),null);
    assert.equal(consumeSubmissionReturn(`?submission=${id}`,storage),id);
  }
  const cannotErase={getItem:()=>id,removeItem(){throw new Error('unavailable');}};
  assert.equal(consumeSubmissionReturn('',cannotErase),null,'do not reuse a marker that could not be erased');
});
test('result links contain only an exact ID and reject ambiguous/invalid recovery selections',()=>{
  assert.equal(submissionLink(id),`/hub/prepare?submission=${id}`);
  assert.equal(submissionFromSearch(`?submission=${id}`),id);
  assert.equal(submissionFromSearch(''),null);
  for(const search of ['?submission=','?submission=../private',`?submission=${id}&submission=${other}`])assert.throws(()=>submissionFromSearch(search),/Invalid submission link/);
  assert.throws(()=>submissionLink('secret?report=private'),/Invalid submission link/);
});
test('authenticated hydration retains failed reports and exact published release details',async()=>{
  for(const job of [
    {id,status:'failed',report:{checks:[{id:'behavior',passed:false,detail:'Expected changed value'}]}},
    {id,status:'published',release:{libraryId:'ui1',version:'0.1.0',status:'automatically-checked'}},
    {id,status:'queued'},
  ]) {
    let calls=0;
    const reader=createSubmissionReader({fetch:async(path,options)=>{
      calls++;assert.equal(path,`/api/hub/submissions/${id}`);
      assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json(job);
    }});
    assert.deepEqual(await reader.read(id),job);assert.equal(calls,1);
  }
});
test('recovery refuses denied ownership, wrong jobs and invalid IDs',async()=>{
  let calls=0;
  const reader=createSubmissionReader({fetch:async()=>{calls++;return Response.json({error:'Submission not found'},{status:404});}});
  await assert.rejects(reader.read('../private'),/Invalid submission link/);assert.equal(calls,0);
  await assert.rejects(reader.read(id),/Submission not found/);assert.equal(calls,1);
  const wrong=createSubmissionReader({fetch:async()=>Response.json({id:other,status:'published'})});
  await assert.rejects(wrong.read(id),/Could not retrieve/);
});
test('signout/account/unmount invalidation suppresses late responses even when fetch ignores abort',async()=>{
  let finish,signal;
  const reader=createSubmissionReader({fetch:async(_,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});
  const read=reader.read(id);
  reader.invalidate();assert.equal(signal.aborted,true);
  assert.equal(await read,null);
  finish(Response.json({id,status:'published',report:{private:true}}));
  await Promise.resolve();
});
test('a newer result read supersedes a stale pending request',async()=>{
  let firstSignal;
  const reader=createSubmissionReader({fetch:async(path,options)=>{
    if(path.endsWith(id)){firstSignal=options.signal;return new Promise(()=>{});}
    return Response.json({id:other,status:'failed',report:{error:'Fix this source'}});
  }});
  const previous=reader.read(id);
  assert.deepEqual(await reader.read(other),{id:other,status:'failed',report:{error:'Fix this source'}});
  assert.equal(await previous,null);assert.equal(firstSignal.aborted,true);
});
test('one-shot recovery bounds an unresponsive request and clears its deadline',async()=>{
  let expire,signal,cleared=false;
  const reader=createSubmissionReader({timeoutMs:15000,setTimer:(callback,delay)=>{assert.equal(delay,15000);expire=callback;return 1;},clearTimer:timer=>{assert.equal(timer,1);cleared=true;},fetch:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}});
  const read=reader.read(id);expire();
  await assert.rejects(read,/timed out/);assert.equal(signal.aborted,true);assert.equal(cleared,true);
});
test('folder and JSON selections remain usable after the native input resets',()=>{
  const file={name:'edited.java',text:async()=> 'edited Java'};
  const input={files:{0:file,length:1},value:'chosen folder'};
  const files=takeSelectedFiles(input);assert.equal(input.value,'');assert.deepEqual(files,[file]);
  input.value='same chosen folder';assert.deepEqual(takeSelectedFiles(input),[file]);
  assert.equal(input.value,'');assert.deepEqual(takeSelectedFiles({files:null,value:'cancelled'}),[]);
});
