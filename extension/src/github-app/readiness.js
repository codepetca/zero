'use strict';

// Read-only, in-memory access checks for the sidebar. Authentication owns sessions
// and setup-ui owns explicit approval; neither is started by this controller.
function createGitHubReadiness({authentication, repositories, installationUrl, active = () => true, onChange = () => {}}) {
  let phase = 'signed-out', disposed = false, generation = 0, pending, settled;
  const hint = () => [authentication.sessionId, authentication.accountId];
  const sameHint = value => value[0] === authentication.sessionId && value[1] === authentication.accountId;
  const usable = () => !disposed && active();
  const current = operation => usable() && pending === operation && generation === operation.generation && !operation.controller.signal.aborted;
  function publish(value) {
    if (!usable() || phase === value) return;
    phase = value;
    onChange();
  }
  function discard() {
    generation++;
    pending?.controller.abort();
    pending = undefined;
    settled = undefined;
  }
  function valid(ticket) {
    try {authentication.assertCurrentNow(ticket);return true;}
    catch {return false;}
  }
  function start() {
    const operation = {generation:++generation, controller:new AbortController(), hint:hint(), ticket:settled?.ticket};
    settled = undefined;
    pending = operation;
    // Publish after assigning pending: an onChange callback may call sync again.
    publish('checking');
    operation.promise = run(operation);
    return operation.promise;
  }
  async function run(operation) {
    let next;
    try {
      const ticket = await authentication.capture();
      if (!current(operation)) return phase;
      operation.ticket = ticket;
      authentication.assertCurrentNow(ticket);
      try {
        await repositories.checkSetup({ticket, signal:operation.controller.signal});
        if (!current(operation)) return phase;
        await authentication.assertCurrent(ticket);
        next = 'ready';
      } catch (error) {
        if (!current(operation)) return phase;
        // Approval errors are actionable only for the exact configured App URL.
        next = error?.actionUrl === installationUrl && ['installation-required', 'permission-required', 'github-error'].includes(error?.code)
          ? 'install' : 'unavailable';
      }
      if (!current(operation)) return phase;
      authentication.assertCurrentNow(ticket);
      settled = {ticket, phase:next};
      pending = undefined;
      publish(next);
    } catch {
      if (!current(operation)) return phase;
      pending = undefined;
      // A capture failure may have synchronously reported sign-out already.
      publish(authentication.signedIn ? 'unavailable' : 'signed-out');
    }
    return phase;
  }
  function sync() {
    if (!usable()) {discard();return;}
    if (!authentication.signedIn) {
      discard();
      publish('signed-out');
      return;
    }
    if (pending) {
      // capture/assertCurrent refresh authentication and synchronously call sync.
      // Retain that operation unless its captured authority actually changed.
      if (pending.ticket ? valid(pending.ticket) : sameHint(pending.hint)) return;
      discard();
    } else if (settled) {
      if (valid(settled.ticket)) return;
      discard();
    }
    void start();
  }
  return {
    get phase() {return phase;},
    sync,
    refresh() {
      sync();
      if (!usable() || !authentication.signedIn) return Promise.resolve(phase);
      return pending?.promise || start();
    },
    confirm(ticket) {
      if (!usable() || !valid(ticket)) return false;
      discard();
      settled = {ticket, phase:'ready'};
      publish('ready');
      return true;
    },
    dispose() {disposed = true;discard();}
  };
}
module.exports = {createGitHubReadiness};
