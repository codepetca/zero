import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHubPoll} from '../lib/hub-poll.mjs';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function clock() {
  let time=0,id=0;const timers=new Map();
  return {now:()=>time,setTimer:(run,delay)=>{const key=++id;timers.set(key,{at:time+delay,run});return key;},clearTimer:key=>timers.delete(key),
    async advance(ms){const end=time+ms;for(;;){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].run();await flush();}time=end;await flush();},count:()=>timers.size};
}
const result=(status='queued',id='job1')=>Response.json({id,status});
function harness(options={}) {
  const time=clock(),jobs=[],states=[],errors=[],calls=[];
  const poll=createHubPoll({jobId:'job1',status:'queued',...time,onJob:value=>jobs.push(value),onState:value=>states.push(value),onError:value=>errors.push(value),fetch:async(url,init)=>{calls.push({at:time.now(),url,init});return result();},...options});
  return {poll,time,jobs,states,errors,calls};
}

test('real scheduler backs off, stays single flight and stops within five minutes',async()=>{
  const h=harness();h.poll.start();await h.time.advance(300000);
  assert.ok(h.calls.length>10&&h.calls.length<=25);
  assert.deepEqual(h.calls.slice(0,4).map(v=>v.at),[2000,6000,14000,29000]);
  const gaps=h.calls.slice(1).map((v,i)=>v.at-h.calls[i].at);assert.ok(gaps.every(v=>v<=15000));assert.ok(h.calls.every(v=>v.at<300000));
  assert.equal(h.states.at(-1).state,'stopped');assert.equal(h.time.count(),0);
  const count=h.calls.length;await h.time.advance(600000);assert.equal(h.calls.length,count);
  await h.poll.refresh();assert.equal(h.calls.length,count+1);await h.time.advance(60000);assert.equal(h.calls.length,count+1,'Manual refresh must not restart the automatic budget');
});

test('attempt bound and repeated start calls cannot reset the budget',async()=>{
  let poll;const h=harness({maxAttempts:2,onJob:data=>poll.setStatus(data.status)});poll=h.poll;h.poll.start();await h.time.advance(2000);h.poll.start();await h.time.advance(6000);
  assert.equal(h.calls.length,2);assert.equal(h.states.at(-1).state,'stopped');assert.equal(h.time.count(),0);
});

test('terminal responses stop immediately and retain exact release metadata',async()=>{
  for(const status of ['failed','published']) {
    const release={libraryId:'ui1',version:'1.2.3',status:'automatically-checked'};
    const h=harness({fetch:async()=>Response.json({id:'job1',status,release})});h.poll.start();await h.time.advance(2000);
    assert.deepEqual(h.jobs,[{id:'job1',status,release}]);assert.equal(h.states.at(-1).state,'complete');assert.equal(h.time.count(),0);
    await h.time.advance(300000);assert.equal(h.jobs.length,1);
  }
});

test('slow fetch cannot overlap automatic or manual requests and is bounded',async()=>{
  let calls=0,signal;
  const h=harness({fetch:async(_,init)=>{calls++;signal=init.signal;return new Promise(()=>{});}});
  h.poll.start();await h.time.advance(2000);assert.equal(await h.poll.refresh(),false);await h.time.advance(14000);assert.equal(calls,1);assert.equal(signal.aborted,false);
  await h.time.advance(1000);assert.equal(signal.aborted,true);assert.equal(h.states.at(-1).state,'stopped');assert.equal(h.states.at(-1).inFlight,false);assert.equal(h.errors.length,1);
  await h.time.advance(300000);assert.equal(calls,1);
});

test('visibility and offline pause requests without extending elapsed budget',async()=>{
  const h=harness();h.poll.setAvailable({visible:false,online:true});h.poll.start();await h.time.advance(50000);assert.equal(h.calls.length,0);assert.equal(await h.poll.refresh(),false);
  h.poll.setAvailable({visible:true,online:true});await h.time.advance(2000);assert.equal(h.calls.length,1);
  h.poll.setAvailable({visible:true,online:false});await h.time.advance(50000);assert.equal(h.calls.length,1);assert.equal(h.states.at(-1).state,'paused');
  h.poll.setAvailable({visible:true,online:true});await h.time.advance(4000);assert.equal(h.calls.length,2);
  h.poll.setAvailable({visible:false,online:false});await h.time.advance(300000);h.poll.setAvailable({visible:true,online:true});await h.time.advance(30000);assert.equal(h.calls.length,2);assert.equal(h.states.at(-1).state,'stopped');
});

test('hiding aborts in flight and late results cannot update the job',async()=>{
  let finish,signal;
  const h=harness({fetch:(_,init)=>{signal=init.signal;return new Promise(resolve=>{finish=resolve;});}});
  h.poll.start();await h.time.advance(2000);h.poll.setAvailable({visible:false,online:true});await flush();assert.equal(signal.aborted,true);
  finish(result('published'));await flush();assert.equal(h.jobs.length,0);assert.equal(h.states.at(-1).state,'paused');
});

test('dispose on unmount, job or account change suppresses old fetch and body responses',async()=>{
  for(const stage of ['fetch','json']) {
    let finish,signal;const h=harness({fetch:async(_,init)=>{signal=init.signal;if(stage==='fetch')return new Promise(resolve=>{finish=()=>resolve(result('published'));});return {ok:true,json:()=>new Promise(resolve=>{finish=()=>resolve({id:'job1',status:'published'});})};}});
    h.poll.start();await h.time.advance(2000);const count=h.states.length;h.poll.dispose();h.poll.dispose();assert.equal(signal.aborted,true);
    const replacement=harness({jobId:'job2',fetch:async()=>result('published','job2')});replacement.poll.start();await replacement.time.advance(2000);
    finish();await flush();assert.equal(h.jobs.length,0);assert.equal(h.states.length,count);assert.equal(h.time.count(),0);assert.equal(replacement.jobs[0].id,'job2');
  }
});

test('failed responses stop; manual retry is one request and wrong-job responses are rejected',async()=>{
  let count=0;
  const h=harness({fetch:async()=>{count++;return count===1?Response.json({error:'Unavailable'},{status:503}):result();}});
  h.poll.start();await h.time.advance(2000);assert.equal(h.states.at(-1).state,'stopped');assert.deepEqual(h.errors,['Unavailable']);
  await h.time.advance(30000);assert.equal(count,1);assert.equal(await h.poll.refresh(),true);assert.equal(count,2);await h.time.advance(30000);assert.equal(count,2);
  const wrong=harness({fetch:async()=>result('published','job2')});wrong.poll.start();await wrong.time.advance(2000);assert.equal(wrong.jobs.length,0);assert.equal(wrong.states.at(-1).state,'stopped');
});


test('elapsed deadline aborts an active response and external terminal snapshots stop immediately',async()=>{
  for(const external of [false,true]) {
    let finish,signal;
    const h=harness({maxDurationMs:2500,fetch:(_,init)=>{signal=init.signal;return new Promise(resolve=>{finish=()=>resolve(result('queued'));});}});
    h.poll.start();await h.time.advance(2000);
    if(external)h.poll.setStatus('published');else await h.time.advance(500);
    assert.equal(signal.aborted,true);finish();await flush();assert.equal(h.jobs.length,0);assert.equal(h.time.count(),0);assert.equal(h.states.at(-1).state,external?'complete':'stopped');
  }
});
