import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubRequestDeadline, HubRequestCancelledError, HubRequestDeadlineError } from '../lib/hub-request-deadline.mjs';

test('all stages share the same monotonic budget and results are checked', async () => {
  let time = 100;
  const deadline = createHubRequestDeadline({ budgetMs: 10, now: () => time });
  try {
    assert.equal(await deadline.run(() => { time += 6; return 'first'; }), 'first');
    await assert.rejects(deadline.run(() => { time += 4; return 'late'; }), HubRequestDeadlineError);
    await assert.rejects(deadline.run(() => assert.fail('must not start')), HubRequestDeadlineError);
    assert.equal(deadline.signal.aborted, true);
  } finally { deadline.dispose(); }
});

test('a hanging operation is bounded and its late rejection is observed', async () => {
  let rejectLate;
  const deadline = createHubRequestDeadline({ budgetMs: 20 });
  try {
    await assert.rejects(deadline.run(() => new Promise((_, reject) => { rejectLate = reject; })), HubRequestDeadlineError);
    rejectLate(new Error('late failure'));
    await new Promise(resolve => setImmediate(resolve));
  } finally { deadline.dispose(); }
});

test('caller cancellation bounds an uncooperative operation without cancelling shared work', async () => {
  const caller = new AbortController();
  const deadline = createHubRequestDeadline({ budgetMs: 1000, signal: caller.signal });
  let finishShared;
  const shared = new Promise(resolve => { finishShared = resolve; });
  try {
    const result = deadline.run(() => shared);
    await Promise.resolve();
    caller.abort();
    await assert.rejects(result, HubRequestCancelledError);
    finishShared('still works');
    assert.equal(await shared, 'still works');
  } finally { deadline.dispose(); }
});

test('already aborted callers do not start work, and dispose is idempotent', async () => {
  const caller = new AbortController();
  caller.abort();
  const deadline = createHubRequestDeadline({ budgetMs: 100, signal: caller.signal });
  await assert.rejects(deadline.run(() => assert.fail('must not start')), HubRequestCancelledError);
  deadline.dispose();
  deadline.dispose();
});

test('expired stages cannot report either a value or an ordinary failure', async () => {
  let time = 0;
  const deadline = createHubRequestDeadline({ budgetMs: 2, now: () => time });
  try {
    await assert.rejects(deadline.run(() => { time = 2; throw new Error('provider failed'); }), HubRequestDeadlineError);
  } finally { deadline.dispose(); }
});

test('dispose releases a pending caller and no later stage starts', async () => {
  const deadline = createHubRequestDeadline({ budgetMs: 1000 });
  const pending = deadline.run(() => new Promise(() => {}));
  await Promise.resolve();
  deadline.dispose();
  await assert.rejects(pending, HubRequestCancelledError);
  assert.throws(() => deadline.check(), HubRequestCancelledError);
});

test('invalid budgets are rejected and zero budget expires immediately', () => {
  for (const budgetMs of [-1, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => createHubRequestDeadline({ budgetMs }), RangeError);
  }
  const deadline = createHubRequestDeadline({ budgetMs: 0 });
  assert.throws(() => deadline.check(), HubRequestDeadlineError);
  deadline.dispose();
});
