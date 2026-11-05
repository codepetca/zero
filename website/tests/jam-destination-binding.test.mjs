import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamDestinationBindingReader} from '../lib/jam-destination-binding.mjs';

const repositoryUrl = 'https://github.com/student/project';
const apiUrl = 'https://api.github.com/repos/student/project';
const message = 'Project destination is unavailable.';
const metadata = (changes = {}) => ({id:123, name:'project', full_name:'student/project',
  html_url:repositoryUrl, private:false, visibility:'public', owner:{id:7, login:'student', type:'User'}, ...changes});
const response = (data = metadata(), options = {}) => new Response(JSON.stringify(data), {
  status:200, headers:{'content-type':'application/json'}, ...options});
const reject = promise => assert.rejects(promise, error => error.message === message && error.stack && !error.cause);
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise,resolve};};

// All transports in this file are synthetic. No environment, credential or
// network access establishes live GitHub capability or provider capacity.
test('one fresh fixed GET obtains a server-private exact public identity without ambient credentials', async () => {
  const calls = [];
  const read = createJamDestinationBindingReader({fetchImpl:async (url, init) => {
    calls.push({url,init}); return response();
  }});
  const first = await read(repositoryUrl), second = await read(repositoryUrl);
  assert.deepEqual(first, {repositoryId:'123', ownerId:'7', owner:'student', repo:'project', repositoryUrl});
  assert.equal(Object.isFrozen(first), true);
  assert.notEqual(first, second);
  assert.equal(calls.length, 2, 'no cached or shared prior authorization');
  for (const {url,init} of calls) {
    assert.equal(url, apiUrl);
    assert.equal(init.method, 'GET');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(init.headers).sort(), ['Accept','User-Agent','X-GitHub-Api-Version']);
    assert.equal(init.body, undefined);
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('namespace reuse reports current ID and never substitutes historical ID authorization', async () => {
  let current = 123;
  const read = createJamDestinationBindingReader({fetchImpl:async () => response(metadata({id:current}))});
  assert.equal((await read(repositoryUrl)).repositoryId, '123');
  current = 202;
  const binding = await read(repositoryUrl);
  assert.equal(binding.repositoryId, '202');
  assert.notEqual(binding.repositoryId, '123', 'caller must suppress historical ID-123 link on mismatch');
});

test('canonical case differences and public organization repositories are accepted', async () => {
  const canonical = metadata({name:'Project', full_name:'Student/Project', html_url:'https://github.com/Student/Project',
    owner:{id:7, login:'Student', type:'Organization'}});
  const read = createJamDestinationBindingReader({fetchImpl:async () => response(canonical)});
  assert.deepEqual(await read(repositoryUrl), {repositoryId:'123', ownerId:'7', owner:'Student', repo:'Project',
    repositoryUrl:'https://github.com/Student/Project'});
});

test('renames/transfers, unexpected effective URLs, redirects and deletion fail closed without following', async () => {
  const variants = [
    () => response(metadata(), {status:301, headers:{'content-type':'application/json',location:'https://api.github.com/repos/other/project'}}),
    () => response(metadata(), {status:302}),
    () => response(metadata(), {status:404}),
    () => ({...response(), status:200, redirected:true, url:apiUrl, headers:new Headers({'content-type':'application/json'})}),
    () => {const r=response(); Object.defineProperty(r,'url',{value:'https://api.github.com/repos/other/project'}); return r;},
    () => response(metadata({name:'renamed',full_name:'student/renamed',html_url:'https://github.com/student/renamed'})),
    () => response(metadata({owner:{id:8,login:'other',type:'User'},full_name:'other/project',html_url:'https://github.com/other/project'}))
  ];
  for (const make of variants) {
    let calls = 0;
    const read = createJamDestinationBindingReader({fetchImpl:async () => {calls++; return make();}});
    await reject(read(repositoryUrl));
    assert.equal(calls, 1);
  }
});

test('untrusted repository identity fields and visibility must validate together', async () => {
  const invalid = [null, [], {}, metadata({id:'123'}), metadata({id:0}), metadata({id:2 ** 53}),
    metadata({owner:null}), metadata({owner:{id:'7',login:'student',type:'User'}}),
    metadata({owner:{id:7,login:'student',type:'Bot'}}), metadata({private:true}), metadata({private:undefined}),
    metadata({visibility:'private'}), metadata({visibility:'internal'}), metadata({name:undefined}),
    metadata({name:'project.git'}), metadata({name:'project/extra'}),
    metadata({full_name:'other/project'}), metadata({html_url:'https://github.com/student/project?x=1'}),
    metadata({html_url:'https://github.com.evil.test/student/project'}),
    metadata({html_url:'https://github.com/student/project/'})];
  for (const data of invalid) {
    const read = createJamDestinationBindingReader({fetchImpl:async () => response(data)});
    await reject(read(repositoryUrl));
  }
  const legacy = metadata(); delete legacy.visibility;
  assert.equal((await createJamDestinationBindingReader({fetchImpl:async () => response(legacy)})(repositoryUrl)).repositoryId, '123');
});

test('dangerous, ambiguous and noncanonical input URLs never reach the transport', async () => {
  let calls = 0;
  const read = createJamDestinationBindingReader({fetchImpl:async () => {calls++; return response();}});
  const dangerous = [undefined, null, 7, {}, '', 'http://github.com/student/project',
    'https://github.com.evil.test/student/project', 'https://evil.test/student/project',
    'https://github.com@evil.test/student/project', 'https://user:secret@github.com/student/project',
    'https://github.com:443/student/project', 'https://GITHUB.COM/student/project',
    `${repositoryUrl}/`, `${repositoryUrl}?q=1`, `${repositoryUrl}#fragment`,
    'https://github.com/student/project.git',
    'https://github.com/student/..', 'https://github.com/student/.',
    'https://github.com/student/%70roject', 'https://github.com/student/project%2fextra',
    'https://github.com/student/project\\extra', 'https://github.com/student\\evil/project',
    'https://github.com/student/project\n', ' https://github.com/student/project',
    'https://github.com/-student/project', 'https://github.com/student-/project',
    `https://github.com/${'s'.repeat(40)}/project`, `https://github.com/student/${'p'.repeat(101)}`];
  for (const value of dangerous) await reject(read(value));
  assert.equal(calls, 0);
});

test('catalog-valid repository names retain their exact path and identity', async () => {
  for (const name of ['.project', 'project.', 'pro..ject', 'project.GIT']) {
    const url=`https://github.com/student/${name}`;
    const read=createJamDestinationBindingReader({fetchImpl:async input=>{
      assert.equal(input,`https://api.github.com/repos/student/${name}`);
      return response(metadata({name,full_name:`student/${name}`,html_url:url}));
    }});
    assert.equal((await read(url)).repositoryId,'123');
  }
});

test('bad factory/call options and already canceled callers reject without fetch', async () => {
  for (const options of [null, [], {timeoutMs:0}, {timeoutMs:8001}, {timeoutMs:1.5},
    {maxConcurrent:0}, {maxConcurrent:5}, {maxPending:-1}, {maxPending:17}, {maxPending:1.5}, {fetchImpl:4}, {headers:{Authorization:'borrowed'}}]) {
    assert.throws(() => createJamDestinationBindingReader(options), {message});
  }
  let calls = 0;
  const read = createJamDestinationBindingReader({fetchImpl:async () => {calls++; return response();}});
  for (const options of [null, [], {signal:{}}, {url:apiUrl}, {headers:{}}, {signal:AbortSignal.abort(new Error('secret'))}]) {
    await reject(read(repositoryUrl, options));
  }
  assert.equal(calls, 0);
});

test('bounded JSON rejects malformed MIME, length, JSON, UTF-8 and missing or excessive body', async () => {
  const variants = [
    () => response(metadata(), {headers:{'content-type':'text/html'}}),
    () => response(metadata(), {headers:{'content-type':'application/jsonp'}}),
    () => response(metadata(), {headers:{'content-type':'application/json', 'content-length':'65537'}}),
    () => response(metadata(), {headers:{'content-type':'application/json', 'content-length':'-1'}}),
    () => response(metadata(), {headers:{'content-type':'application/json', 'content-length':'1e3'}}),
    () => new Response('{secret', {headers:{'content-type':'application/json'}}),
    () => new Response(new Uint8Array([0xff]), {headers:{'content-type':'application/json'}}),
    () => new Response(null, {headers:{'content-type':'application/json'}}),
    () => new Response(' '.repeat(65537), {headers:{'content-type':'application/json'}})
  ];
  for (const make of variants) await reject(createJamDestinationBindingReader({fetchImpl:async () => make()})(repositoryUrl));
});

test('chunk count and actual streamed bytes are bounded, including when declared length lies', async () => {
  let canceled = false;
  const body = new ReadableStream({pull(controller) {controller.enqueue(new Uint8Array([32]));}, cancel() {canceled = true;}});
  await reject(createJamDestinationBindingReader({fetchImpl:async () => new Response(body,
    {headers:{'content-type':'application/json','content-length':'1'}})})(repositoryUrl));
  assert.equal(canceled, true);
  await reject(createJamDestinationBindingReader({fetchImpl:async () => new Response(' '.repeat(65537),
    {headers:{'content-type':'application/json','content-length':'1'}})})(repositoryUrl));
});

test('transport errors, body errors and malicious abort reasons become generic errors', async () => {
  await reject(createJamDestinationBindingReader({fetchImpl:async () => {throw Error('Bearer secret-provider-token');}})(repositoryUrl));
  const body = new ReadableStream({start(controller) {controller.error(Error('private provider body'));}});
  await reject(createJamDestinationBindingReader({fetchImpl:async () => new Response(body,
    {headers:{'content-type':'application/json'}})})(repositoryUrl));
});

test('a fetch that ignores cancellation times out, and its late response is discarded', async () => {
  const pending = deferred(); let observedSignal, canceled = false;
  const read = createJamDestinationBindingReader({timeoutMs:20,fetchImpl:async (_url, init) => {
    observedSignal = init.signal; return pending.promise;
  }});
  await reject(read(repositoryUrl));
  assert.equal(observedSignal.aborted, true);
  pending.resolve(new Response(new ReadableStream({cancel() {canceled = true;}}),
    {headers:{'content-type':'application/json'}}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canceled, true);
});

test('caller cancellation promptly rejects fetch ignoring signal and observes its late rejection', async () => {
  const pending = deferred(), started = deferred(), controller = new AbortController();
  const read = createJamDestinationBindingReader({fetchImpl:async () => {started.resolve(); return pending.promise;}});
  const result = read(repositoryUrl, {signal:controller.signal});
  await started.promise;
  controller.abort(Error('secret caller cancellation reason'));
  await reject(result);
  pending.resolve(Promise.reject(Error('secret late transport rejection')));
  await new Promise(resolve => setImmediate(resolve));
});

test('stalled body read and stalled cancellation cannot outlive the total deadline', async () => {
  let canceled = 0, reads = 0;
  const body = {getReader:() => ({read() {reads++; return new Promise(() => {});},
    cancel() {canceled++; return new Promise(() => {});}, releaseLock() {}})};
  const read = createJamDestinationBindingReader({timeoutMs:20,fetchImpl:async () => ({status:200,
    redirected:false, url:apiUrl, headers:new Headers({'content-type':'application/json'}),body})});
  await reject(read(repositoryUrl));
  assert.equal(reads, 1);
  assert.ok(canceled >= 1);
});

test('caller cancellation also stops a stalled body and does not cancel another call', async () => {
  const started = deferred(), controller = new AbortController(); let canceled = 0, calls = 0;
  const body = {getReader:() => ({read() {started.resolve(); return new Promise(() => {});},
    cancel() {canceled++; return new Promise(() => {});}, releaseLock() {}})};
  const read = createJamDestinationBindingReader({fetchImpl:async () => ++calls === 1 ?
    {status:200,headers:new Headers({'content-type':'application/json'}),body} : response()});
  const first = read(repositoryUrl, {signal:controller.signal});
  await started.promise;
  assert.equal((await read(repositoryUrl)).repositoryId, '123');
  controller.abort(); await reject(first);
  assert.ok(canceled >= 1);
});

test('zero-pending admission rejects immediately and cancellation releases a slot', async () => {
  const pending = deferred(), started = deferred(), controller = new AbortController(); let calls = 0;
  const read = createJamDestinationBindingReader({maxConcurrent:1,maxPending:0,fetchImpl:async () => {
    if (++calls === 1) {started.resolve(); return pending.promise;}
    return response();
  }});
  const first = read(repositoryUrl, {signal:controller.signal}); await started.promise;
  await reject(read(repositoryUrl)); assert.equal(calls, 1);
  controller.abort(); await reject(first);
  assert.equal((await read(repositoryUrl)).repositoryId, '123');
  assert.equal(calls, 2);
  pending.resolve(response());
  await new Promise(resolve => setImmediate(resolve));
});

test('overlapping callers wait FIFO with at most four cooperative provider requests', async () => {
  const gate = deferred(), started = [], completed = [];
  let active = 0, peak = 0;
  const read = createJamDestinationBindingReader({fetchImpl:async url => {
    const name = url.slice(url.lastIndexOf('/') + 1);
    started.push(name); active++; peak = Math.max(peak, active);
    if (started.length <= 4) await gate.promise;
    active--;
    return response(metadata({name, full_name:`student/${name}`, html_url:`https://github.com/student/${name}`}));
  }});
  const calls = Array.from({length:12}, (_, index) => read(`https://github.com/student/project${index}`)
    .then(value => {completed.push(index); return value;}));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['project0','project1','project2','project3']);
  gate.resolve();
  assert.equal((await Promise.all(calls)).length, 12);
  assert.equal(peak, 4);
  assert.deepEqual(started, Array.from({length:12}, (_, index) => `project${index}`));
  assert.equal(completed.length, 12);
});

test('finite pending admission rejects overflow and canceled waiters free pending capacity without fetch', async () => {
  const gate = deferred(), started = deferred(), controller = new AbortController();
  let calls = 0;
  const read = createJamDestinationBindingReader({maxConcurrent:1, maxPending:1, fetchImpl:async () => {
    if (++calls === 1) {started.resolve(); await gate.promise;}
    return response();
  }});
  const first = read(repositoryUrl); await started.promise;
  const second = read(repositoryUrl, {signal:controller.signal});
  await reject(read(repositoryUrl)); assert.equal(calls, 1);
  controller.abort(); await reject(second);
  const fourth = read(repositoryUrl);
  assert.equal(calls, 1, 'queued cancellation never dispatches');
  gate.resolve();
  await Promise.all([first, fourth]);
  assert.equal(calls, 2);
  assert.equal((await read(repositoryUrl)).repositoryId, '123', 'slots recover after queued cancellation');
});

test('pending timeout consumes the original deadline and never receives a new provider budget', async () => {
  const started = deferred(), firstController = new AbortController();
  let calls = 0, queuedSignal;
  const read = createJamDestinationBindingReader({maxConcurrent:1, timeoutMs:1000, fetchImpl:async (_url, {signal}) => {
    if (++calls === 1) started.resolve(); else queuedSignal = signal;
    return new Promise(() => {});
  }});
  const first = read(repositoryUrl, {signal:firstController.signal});
  const firstRejected = reject(first);
  await started.promise;
  const before = performance.now(), second = read(repositoryUrl);
  const secondRejected = reject(second);
  await new Promise(resolve => setTimeout(resolve, 500));
  firstController.abort(); await firstRejected;
  await secondRejected;
  assert.equal(calls, 2);
  assert.equal(queuedSignal.aborted, true);
  assert.ok(performance.now() - before < 1300, '500ms admission wait did not restart the 1000ms total deadline');
});
