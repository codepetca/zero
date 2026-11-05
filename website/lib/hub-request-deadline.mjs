// A deadline belongs to one incoming request. Pass its signal only to work owned
// by that request: aborting a shared operation could affect other callers.
export class HubRequestDeadlineError extends Error {
  constructor() {
    super('The request deadline expired.');
    this.name = 'HubRequestDeadlineError';
    this.code = 'HUB_REQUEST_DEADLINE';
  }
}

export class HubRequestCancelledError extends Error {
  constructor() {
    super('The request was cancelled.');
    this.name = 'HubRequestCancelledError';
    this.code = 'HUB_REQUEST_CANCELLED';
  }
}

/**
 * Make one monotonic total budget for all stages of an incoming request.
 * `run(signal => operation)` bounds even operations that ignore the signal;
 * `check()` guards work and results outside run. Always dispose in finally.
 * `now` is injectable for tests and must be a monotonic millisecond clock.
 * This cannot preempt synchronous work that blocks the event loop. A timed-out
 * operation may still run or mutate state; callers must account for
 * uncertain outcomes and must not assume this utility rolls work back.
 */
export function createHubRequestDeadline({ budgetMs, signal: callerSignal, now = () => performance.now() }) {
  if (!Number.isFinite(budgetMs) || budgetMs < 0 || budgetMs > 2_147_483_647) {
    throw new RangeError('budgetMs must be a finite number between 0 and 2147483647.');
  }
  const started = now();
  if (!Number.isFinite(started)) throw new TypeError('now must return a finite number.');
  const end = started + budgetMs;
  const controller = new AbortController();
  let timer;
  let disposed = false;

  function stop(error) {
    if (!controller.signal.aborted) controller.abort(error);
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
  function onCallerAbort() { stop(new HubRequestCancelledError()); }
  function check() {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (disposed) throw new HubRequestCancelledError();
    if (callerSignal?.aborted) onCallerAbort();
    else if (now() >= end) stop(new HubRequestDeadlineError());
    if (controller.signal.aborted) throw controller.signal.reason;
  }
  function schedule() {
    if (controller.signal.aborted || disposed) return;
    const remaining = end - now();
    if (remaining <= 0) return stop(new HubRequestDeadlineError());
    // Recheck the monotonic clock when a timer fires; timers may fire early.
    timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
  }
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  if (callerSignal?.aborted) onCallerAbort();
  else schedule();

  async function run(operation) {
    check();
    let onAbort;
    const stopped = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      // Promise.race installs rejection handlers on the operation even if the
      // deadline wins, so a late rejection is observed rather than unhandled.
      const result = await Promise.race([
        Promise.resolve().then(() => { check(); return operation(controller.signal); }),
        stopped,
      ]);
      check();
      return result;
    } catch (error) {
      check();
      throw error;
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop(new HubRequestCancelledError());
  }
  return { signal: controller.signal, check, run, dispose };
}
