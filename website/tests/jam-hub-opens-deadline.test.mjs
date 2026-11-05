import test from 'node:test';
import assert from 'node:assert/strict';
import {recordOpen} from '../lib/hub-opens.mjs';

const origin = 'https://zero.codepet.ca';
const id = 'game-r202-project';
const target = {repositoryId:'202', playUrl:'https://student.github.io/project/'};
const decision = (held = false) => ({revision:'a'.repeat(40), observedAt:0, isHeld:() => held});
const request = signal => new Request(`${origin}/api/hub/opens`, {method:'POST', signal,
  headers:{origin, 'content-type':'application/json'}, body:JSON.stringify({id})});
const defer = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
const tick = () => new Promise(done => setImmediate(done));
const options = overrides => ({env:{}, visibilityReader:async () => decision(),
  resolve:async () => target, store:{increment:async () => 1}, ...overrides});
async function empty(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');
}

test('stalled body reads and noncooperative cancellation share the total deadline', {timeout:2000}, async () => {
  const read = defer(), cancelled = defer(), started = defer();
  let clock = 0, cancels = 0, releases = 0, authority = 0, resolves = 0, writes = 0;
  const base = request();
  const incoming = {url:base.url, headers:base.headers, signal:base.signal, body:{getReader:() => ({
    read:() => { started.resolve(); return read.promise; },
    cancel:() => { cancels++; return cancelled.promise; },
    releaseLock:() => { releases++; throw Error('read still pending'); }
  })}};
  const pending = recordOpen(incoming, options({responseBudgetMs:30, deadlineNow:() => clock,
    visibilityReader:async () => { authority++; return decision(); },
    resolve:async () => { resolves++; return target; },
    store:{increment:async () => { writes++; }}
  }));
  await started.promise; clock = 30;
  await empty(await pending, 503);
  assert.ok(cancels >= 1); assert.equal(releases, 1);
  read.resolve({done:false, value:new TextEncoder().encode(JSON.stringify({id}))});
  cancelled.reject(Error('private cleanup failure'));
  await tick();
  assert.deepEqual([authority, resolves, writes], [0, 0, 0]);
});

test('caller cancellation bounds body reading even when cancellation never settles', {timeout:2000}, async () => {
  const caller = new AbortController(), started = defer();
  let cancels = 0, writes = 0;
  const base = request(caller.signal);
  const incoming = {url:base.url, headers:base.headers, signal:base.signal, body:{getReader:() => ({
    read:() => { started.resolve(); return new Promise(() => {}); },
    cancel:() => { cancels++; return new Promise(() => {}); }, releaseLock() {}
  })}};
  const pending = recordOpen(incoming, options({responseBudgetMs:1000,
    visibilityReader:async () => assert.fail('authority must follow body'),
    store:{increment:async () => { writes++; }}
  }));
  await started.promise; caller.abort();
  await empty(await pending, 503);
  assert.ok(cancels >= 1); assert.equal(writes, 0);
});

for (const stage of ['authority', 'resolver', 'final authority']) {
  test(`${stage} cannot continue to a counter after a total deadline`, {timeout:2000}, async () => {
    const gate = defer(), started = defer();
    let clock = 0, reads = 0, resolves = 0, writes = 0, signal;
    const pending = recordOpen(request(), options({responseBudgetMs:30, deadlineNow:() => clock,
      visibilityReader:async context => {
        reads++; signal = context.signal;
        if (stage === 'authority' || stage === 'final authority' && reads === 2) {
          started.resolve(); return gate.promise;
        }
        return decision();
      },
      resolve:async (_selection, context) => {
        resolves++; signal = context.signal;
        assert.equal(typeof context.check, 'function');
        if (stage === 'resolver') { started.resolve(); return gate.promise; }
        return target;
      }, store:{increment:async () => { writes++; }}
    }));
    await started.promise; clock = 30;
    await empty(await pending, 503);
    assert.equal(signal.aborted, true);
    gate.resolve(stage === 'resolver' ? target : decision()); await tick();
    assert.equal(writes, 0);
    assert.equal(resolves, stage === 'authority' ? 0 : 1);
    assert.equal(reads, stage === 'final authority' ? 2 : 1);
  });

  test(`${stage} cannot continue to a counter after caller cancellation`, {timeout:2000}, async () => {
    const caller = new AbortController(), started = defer(), gate = defer();
    let reads = 0, resolves = 0, writes = 0;
    const pending = recordOpen(request(caller.signal), options({responseBudgetMs:1000,
      visibilityReader:async () => {
        reads++;
        if (stage === 'authority' || stage === 'final authority' && reads === 2) {
          started.resolve(); return gate.promise;
        }
        return decision();
      },
      resolve:async () => {
        resolves++;
        if (stage === 'resolver') { started.resolve(); return gate.promise; }
        return target;
      }, store:{increment:async () => { writes++; }}
    }));
    await started.promise; caller.abort();
    await empty(await pending, 503);
    gate.reject(Error('private late provider error')); await tick();
    assert.equal(writes, 0);
    assert.equal(resolves, stage === 'authority' ? 0 : 1);
    assert.equal(reads, stage === 'final authority' ? 2 : 1);
  });
}

test('cancellation or budget expiry during the final visibility check prevents dispatch', async () => {
  for (const stop of ['cancel', 'timeout']) {
    const caller = new AbortController(); let clock = 0, reads = 0, writes = 0;
    await empty(await recordOpen(request(caller.signal), options({responseBudgetMs:1000, deadlineNow:() => clock,
      visibilityReader:async () => {
        reads++;
        return {revision:'a'.repeat(40), observedAt:0, isHeld:() => {
          if (reads === 2) {
            if (stop === 'cancel') caller.abort(); else clock = 1000;
          }
          return false;
        }};
      }, store:{increment:async () => { writes++; }}
    })), 503);
    assert.equal(writes, 0);
  }
});

test('active and inactive authority transitions both reject before dispatch', async () => {
  for (const decisions of [[decision(), null], [null, decision()]]) {
    let reads = 0, writes = 0;
    await empty(await recordOpen(request(), options({visibilityReader:async () => decisions[reads++],
      store:{increment:async () => { writes++; }}
    })), 404);
    assert.equal(reads, 2); assert.equal(writes, 0);
  }
});

test('a dispatched increment can remain uncertain after timeout or cancellation and is never retried', {timeout:2000}, async () => {
  for (const stop of ['timeout', 'cancel']) {
    const caller = new AbortController(), started = defer(), gate = defer(); let clock = 0, writes = 0;
    const pending = recordOpen(request(caller.signal), options({responseBudgetMs:stop === 'timeout' ? 30 : 1000,
      deadlineNow:() => clock,
      store:{increment:() => { writes++; started.resolve(); return gate.promise; }}
    }));
    await started.promise;
    if (stop === 'cancel') caller.abort(); else clock = 30;
    // The established empty response makes no false not_dispatched assertion.
    await empty(await pending, 503);
    assert.equal(writes, 1);
    gate.reject(Error('private write reply lost')); await tick();
    assert.equal(writes, 1);
  }
});

test('normal, held, unavailable and inactive requests preserve their existing empty responses', async () => {
  let writes = 0;
  await empty(await recordOpen(request(), options({store:{increment:async value => {
    assert.equal(value, id); writes++;
  }}})), 204);
  assert.equal(writes, 1);
  await empty(await recordOpen(request(), options({visibilityReader:async () => decision(true),
    store:{increment:async () => assert.fail('held write')}})), 404);
  await empty(await recordOpen(request(), options({store:{increment:async () => { throw Error('private'); }}})), 503);
  await empty(await recordOpen(request(), options({store:null, visibilityReader:async () => null,
    resolve:async () => assert.fail('inactive unconfigured route must skip resolution')})), 204);
  await empty(await recordOpen(request(), options({visibilityReader:async () => null,
    store:{increment:async () => { writes++; }}})), 204);
  assert.equal(writes, 2);
});
